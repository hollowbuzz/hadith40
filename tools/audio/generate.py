#!/usr/bin/env python3
"""Generate the hadith audio with Google Cloud Text-to-Speech (ar-XA, Modern Standard Arabic).

    export GOOGLE_TTS_API_KEY=…            # an API key restricted to the Cloud Text-to-Speech API
    python3 -I tools/audio/generate.py --samples               # hadith 1 in several voices → tools/audio/samples/
    python3 -I tools/audio/generate.py --voice ar-XA-Wavenet-B # all 50 → data/audio/ + data/audio/index.json

Instead of an API key you can use an OAuth token: GOOGLE_TTS_ACCESS_TOKEN=$(gcloud auth print-access-token),
plus GOOGLE_CLOUD_PROJECT=<project id> for user credentials.

Each hadith becomes one MP3 (data/audio/hNN.mp3), read paragraph by paragraph from the app's own vowelled
text with a short pause between paragraphs. With Standard and WaveNet voices every word is preceded by an
SSML <mark>, so index.json records when each word starts and the app can highlight it. Chirp 3 HD voices
sound more natural but take no <mark>s, so for them the app highlights whole paragraphs.

Unchanged hadith are skipped on a re-run (same text, voice and rate); --force regenerates them.
--engine say uses the macOS Arabic voice instead of Google (word times estimated) to preview the pipeline
offline; it writes to tools/audio/preview/ unless --out is given.
"""
import argparse, base64, hashlib, io, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.request, wave
from xml.sax.saxutils import escape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_JS = os.path.join(ROOT, 'js', 'data.js')
RATE_HZ = 24000
PARA_GAP = 0.6          # seconds of silence between paragraphs
MAX_BYTES = 4800        # Google's limit is 5,000 bytes of input per request
ENDPOINT = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize'
SAMPLE_VOICES = ['ar-XA-Wavenet-A', 'ar-XA-Wavenet-B', 'ar-XA-Wavenet-C', 'ar-XA-Wavenet-D',
                 'ar-XA-Standard-B', 'ar-XA-Standard-D',
                 'ar-XA-Chirp3-HD-Charon', 'ar-XA-Chirp3-HD-Kore', 'ar-XA-Chirp3-HD-Puck', 'ar-XA-Chirp3-HD-Aoede']
ARABIC = re.compile(r'[ء-ي]')


def load_hadith():
    s = open(DATA_JS, encoding='utf-8').read()
    raw = re.search(r'export const HADITH = (\[.*?\n\]);', s, re.S).group(1)
    return json.loads(re.sub(r',\s*\]$', ']', raw))


def paragraphs(hd):
    """The app's paragraphs as plain text (segments joined), and their words.
    A word is a whitespace-separated token containing an Arabic letter — the same rule the app uses."""
    out = []
    for segs in hd['paras']:
        text = ''.join(t for _, t in segs)
        words = [w for w in text.split() if ARABIC.search(w)]
        out.append((text, words))
    return out


def speakable(token):
    return re.sub(r'[{}«»()\[\]﴿﴾]', '', token)


def chunks(words, marks, max_words=None):
    """Split a paragraph into requests under the byte limit (and, for Chirp 3 HD voices, which reject long
    sentences, under max_words), at punctuation where possible."""
    def ssml(ws, start):
        parts = []
        for k, w in enumerate(ws):
            body = escape(speakable(w))
            parts.append((f'<mark name="w{start + k}"/>' if marks else '') + body)
        return '<speak>' + ' '.join(parts) + '</speak>' if marks else ' '.join(speakable(w) for w in ws)
    out, cur, start = [], [], 0
    for i, w in enumerate(words):
        if cur and (len(ssml(cur + [w], start).encode()) > MAX_BYTES or (max_words and len(cur) >= max_words)):
            # back up to the last word ending a clause, if there is one in the second half
            cut = max((k for k, x in enumerate(cur) if re.search(r'[،,.:؛]$', x) and k > len(cur) // 2), default=len(cur) - 1)
            out.append((start, cur[:cut + 1]))
            start += cut + 1
            cur = cur[cut + 1:]
        cur.append(w)
    if cur:
        out.append((start, cur))
    return [(st, ssml(ws, st), len(ws)) for st, ws in out]


# ---------------------------------------------------------------- engines
def google(payload_text, voice, rate, marks):
    key, token = os.environ.get('GOOGLE_TTS_API_KEY'), os.environ.get('GOOGLE_TTS_ACCESS_TOKEN')
    if not key and not token:
        sys.exit('Set GOOGLE_TTS_API_KEY (or GOOGLE_TTS_ACCESS_TOKEN) first — see tools/audio/README.md.')
    chirp = 'Chirp' in voice
    body = {
        'input': {'ssml': payload_text} if marks else {'text': payload_text},
        'voice': {'languageCode': 'ar-XA', 'name': voice},
        'audioConfig': {'audioEncoding': 'LINEAR16', 'sampleRateHertz': RATE_HZ, **({} if chirp else {'speakingRate': rate})},
    }
    if marks:
        body['enableTimePointing'] = ['SSML_MARK']
    headers = {'Content-Type': 'application/json; charset=utf-8'}
    if key:
        headers['X-Goog-Api-Key'] = key
    else:
        headers['Authorization'] = 'Bearer ' + token
        if os.environ.get('GOOGLE_CLOUD_PROJECT'):
            headers['x-goog-user-project'] = os.environ['GOOGLE_CLOUD_PROJECT']
    req = urllib.request.Request(ENDPOINT, json.dumps(body).encode(), headers)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                res = json.load(r)
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')
            if e.code in (429, 500, 503) and attempt < 3:
                time.sleep(2 ** attempt * 2)
                continue
            sys.exit(f'Google TTS error {e.code} for voice {voice}:\n{msg}')
    pcm, sr = read_wav(base64.b64decode(res['audioContent']))
    times = {int(tp['markName'][1:]): float(tp['timeSeconds']) for tp in res.get('timepoints', [])}
    return pcm, sr, times


def macos_say(payload_text, voice, rate, marks):
    """Offline preview: macOS «Majed». No marks, so word starts are spread by word length."""
    text = re.sub(r'<[^>]+>', '', payload_text)
    with tempfile.TemporaryDirectory() as d:
        aiff, wav = os.path.join(d, 'a.aiff'), os.path.join(d, 'a.wav')
        subprocess.run(['say', '-v', 'Majed', '-r', str(int(175 * rate)), '-o', aiff, text], check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', aiff, '-ac', '1', '-ar', str(RATE_HZ), '-sample_fmt', 's16', wav], check=True)
        pcm, sr = read_wav(open(wav, 'rb').read())
    words = text.split()
    total = len(pcm) / 2 / sr
    weights = [len(w) + 2 for w in words]
    times, acc = {}, 0.0
    for k, wt in enumerate(weights):
        times[k] = total * acc / sum(weights)
        acc += wt
    return pcm, sr, times


def read_wav(data):
    with wave.open(io.BytesIO(data)) as w:
        assert w.getsampwidth() == 2 and w.getnchannels() == 1, 'expected 16-bit mono audio'
        return w.readframes(w.getnframes()), w.getframerate()


# ---------------------------------------------------------------- build one hadith
def synth_hadith(hd, voice, rate, engine, marks):
    pcm_all, paras, t = bytearray(), [], 0.0
    for pi, (text, words) in enumerate(paragraphs(hd)):
        if pi:
            gap = b'\0\0' * int(PARA_GAP * RATE_HZ)
            pcm_all += gap
            t += PARA_GAP
        start = t
        wtimes = [None] * len(words)
        for first, payload, count in chunks(words, marks or engine is macos_say, 24 if 'Chirp' in voice and engine is google else None):
            pcm, sr, times = engine(payload, voice, rate, marks)
            if sr != RATE_HZ:
                sys.exit(f'unexpected sample rate {sr}')
            for k, ts in times.items():
                idx = k if engine is google else first + k
                if 0 <= idx < len(words):
                    wtimes[idx] = round(t + ts, 3)
            pcm_all += pcm
            t += len(pcm) / 2 / RATE_HZ
        paras.append({'start': round(start, 3), 'end': round(t, 3), 'words': wtimes if any(x is not None for x in wtimes) else []})
    return bytes(pcm_all), round(t, 3), paras


def encode_mp3(pcm, path):
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'a.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE_HZ); w.writeframes(pcm)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '48k', '-ac', '1', path], check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--voice', default='ar-XA-Wavenet-B', help='Google voice name (default ar-XA-Wavenet-B)')
    ap.add_argument('--rate', type=float, default=0.9, help='speaking rate, Standard/WaveNet only (default 0.9)')
    ap.add_argument('--only', help='hadith numbers, e.g. 1,2,10-12')
    ap.add_argument('--force', action='store_true', help='regenerate even if unchanged')
    ap.add_argument('--samples', action='store_true', help='hadith 1 in several voices, to choose one')
    ap.add_argument('--engine', choices=['google', 'say'], default='google')
    ap.add_argument('--out', help='output folder (default data/audio, or tools/audio/preview for --engine say)')
    a = ap.parse_args()
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg is needed (brew install ffmpeg).')
    engine = google if a.engine == 'google' else macos_say
    hadith = load_hadith()

    if a.samples:
        out = a.out or os.path.join(ROOT, 'tools', 'audio', 'samples')
        os.makedirs(out, exist_ok=True)
        for v in SAMPLE_VOICES:
            pcm, dur, _ = synth_hadith(hadith[0], v, a.rate, engine, marks=False)
            encode_mp3(pcm, os.path.join(out, v + '.mp3'))
            print(f'{v}: {dur:.1f}s')
        print('Listen in', os.path.relpath(out), '— then run with --voice <name>.')
        return

    out = a.out or os.path.join(ROOT, 'tools', 'audio', 'preview') if a.engine == 'say' else (a.out or os.path.join(ROOT, 'data', 'audio'))
    os.makedirs(out, exist_ok=True)
    index_path = os.path.join(out, 'index.json')
    index = json.load(open(index_path, encoding='utf-8')) if os.path.exists(index_path) else {}
    if index.get('voice') not in (None, a.voice) and not a.only:
        a.force = True  # a new voice replaces everything
    marks = a.engine == 'google' and 'Chirp' not in a.voice
    wanted = set()
    for part in (a.only or '1-50').split(','):
        lo, _, hi = part.partition('-')
        wanted.update(range(int(lo), int(hi or lo) + 1))
    entries = index.get('hadith', {})
    for hd in hadith:
        n = hd['n']
        if n not in wanted:
            continue
        digest = hashlib.sha256(json.dumps([hd['paras'], a.voice, a.rate, a.engine]).encode()).hexdigest()[:16]
        file = f'h{n:02d}.mp3'
        if not a.force and entries.get(str(n), {}).get('hash') == digest and os.path.exists(os.path.join(out, file)):
            print(f'hadith {n}: unchanged')
            continue
        pcm, dur, paras = synth_hadith(hd, a.voice, a.rate, engine, marks)
        encode_mp3(pcm, os.path.join(out, file))
        entries[str(n)] = {'file': file, 'duration': dur, 'hash': digest, 'paras': paras}
        print(f'hadith {n}: {dur:.1f}s, {sum(len(p["words"]) for p in paras)} word times')
    index = {
        'schema': 'arbaeen.audio', 'schema_version': '1.0',
        'engine': 'Google Cloud Text-to-Speech' if a.engine == 'google' else 'macOS say (preview only)',
        'voice': a.voice if a.engine == 'google' else 'Majed (macOS)', 'rate': a.rate, 'language': 'ar-XA',
        'word_times': 'exact' if marks else ('estimated' if a.engine == 'say' else 'none'),
        'generated': time.strftime('%Y-%m-%d'),
        'hadith': dict(sorted(entries.items(), key=lambda kv: int(kv[0]))),
    }
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'{len(index["hadith"])} hadith in {os.path.relpath(index_path)}')


if __name__ == '__main__':
    main()
