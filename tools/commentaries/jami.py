"""Skeleton + worksheets for Jāmiʿ al-ʿUlūm wa-l-Ḥikam (Ibn Rajab), from the Shamela export of al-Faḥl's edition.

usage: python3 -I jami.py <scratch_dir>              build the skeleton and worksheets
       python3 -I jami.py <scratch_dir> --read N     print chapter N's English as continuous text (0 = preface)

Keeps Ibn Rajab's text only: his preface, the 50 chapters and the closing lines. The editor's introduction,
biography, manuscript description and footnotes (with their markers) are left out. Writes
  <scratch>/work/jami/skel.json   the skeleton assemble.py reads (--book jami)
  <scratch>/work/jami/NN.txt      worksheets: every Arabic segment with its id (00 = preface and closing)
  <scratch>/jami_src.json         the clean source lines, for verify.py
Segmentation is deterministic, and each NN.lock.json in en/jami/ pins the Arabic a translation was made against.
"""
import html, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import prep  # segmenter, verse test, block builder, worksheet writer

SRC = os.path.expanduser('~/Desktop/تصدير من الشاملة/جامع العلوم والحكم - ت الفحل.htm')
TASH = re.compile(r'[ً-ْٰـ]')
HEAD = re.compile(r'الحديث\s+\S+(?:\s+\S+){0,2}')
TERMINAL = re.compile(r'[.؟!:]["»”)\]]?\s*$')
HADITH_PARAS = {32: 1}  # chapters whose commentary opens with other words («حديث أبي سعيد لم يخرجه…»)
OPENER = re.compile(r'(هذا الحديث|اصل هذا الحديث|أصل هذا الحديث|أما حديث|اما حديث|وخرجه|وخرّجه|يريد )')
TAKHRIJ_END = re.compile(r'(رواه|خرجه|اخرجه|رويناه)[^«»]{0,160}$')


def clean_lines(path):
    """Main text only: no editor footnotes (they follow the short rule on each page) and no footnote markers."""
    s = open(path, encoding='utf-8').read()
    out = []
    for pg in s.split("<div class='PageText'>")[1:]:
        m = re.search(r"\(ص: (\d+)\)", pg)
        num = int(m.group(1)) if m else None
        body = re.sub(r"<div class='PageHead'>.*?</div>", '', pg, flags=re.S)
        body = re.split(r"<hr width='95' align='right'>", body)[0]
        body = re.sub(r"<sup>.*?</sup>", '', body, flags=re.S)
        body = body.replace('</p>', '\n').replace('<p>', '\n')
        body = re.sub(r"<[^>]+>", '', body)
        body = html.unescape(body).replace('‌', '').replace('\xa0', ' ')
        for line in body.split('\n'):
            line = re.sub(r'\s+', ' ', line).strip()
            if line:
                out.append({'page': num, 't': line})
    return out


def is_head(t):
    return bool(HEAD.fullmatch(t)) and len(t) < 40


STANDALONE = {'فصل', 'فصلٌ', 'بسم الله الرحمن الرحيم', 'وبه نستعين'}


def join_breaks(lines):
    """The export breaks lines mid-sentence (at page ends and within pages): join every line that does not end a
    sentence to the next. Headings, «فصل», verse and the opening formulae stay on their own."""
    out = []
    for l in lines:
        if out:
            prev = out[-1]
            if (not TERMINAL.search(prev['t']) and not is_head(l['t']) and not is_head(prev['t'])
                    and l['t'] not in STANDALONE and prev['t'] not in STANDALONE
                    and not OPENER.match(TASH.sub('', l['t']))  # «هذا الحديث…» starts the commentary
                    and not prep.is_verse(l['t']) and not prep.is_verse(prev['t'])):
                prev['t'] = prev['t'].rstrip() + ' ' + l['t'].lstrip()
                prev['pages'].append(l['page'])
                continue
        out.append({'t': l['t'], 'pages': [l['page']]})
    return out


def ends_takhrij(t):
    return bool(TAKHRIJ_END.search(TASH.sub('', t).replace('أ', 'ا')))


def blocks_from(lines, prefix):
    """One block per paragraph; consecutive verse lines (and a «وقال آخر:» label) form one verse block; «فصل» is a label."""
    blocks, k, i = [], 0, 0
    while i < len(lines):
        l = lines[i]
        pages = list(dict.fromkeys(l['pages']))
        if prep.is_verse(l['t']) or (re.fullmatch(r'و?قال (آخر|الشاعر)[^.]{0,20}:', l['t']) and i + 1 < len(lines) and prep.is_verse(lines[i + 1]['t'])):
            paras, j = [], i
            while j < len(lines) and (prep.is_verse(lines[j]['t']) or re.fullmatch(r'و?قال (آخر|الشاعر)[^.]{0,20}:', lines[j]['t'])):
                t = lines[j]['t']
                if prep.is_verse(t):
                    if paras and paras[-1][0] == 'verse':
                        paras[-1][1].append(t)
                    else:
                        paras.append(('verse', [t]))
                else:
                    paras.append(('label', [t]))
                pages += [p for p in lines[j]['pages'] if p not in pages]
                j += 1
            k += 1
            blocks.append(prep.make_block(f'{prefix}{k}', 'verse', paras, pages))
            i = j
            continue
        k += 1
        if l['t'] in ('فصل', 'فصلٌ'):
            blocks.append(prep.make_block(f'{prefix}{k}', 'heading', [('label', [l['t']])], pages))
        else:
            blocks.append(prep.make_block(f'{prefix}{k}', 'paragraph', [l['t']], pages))
        i += 1
    return blocks


def build():
    raw = clean_lines(SRC)
    card = [l['t'] for l in raw if l['page'] is None]
    start = next(i for i, l in enumerate(raw) if (l['page'] or 0) >= 22 and l['t'] == 'بسم الله الرحمن الرحيم')
    body = [l for l in raw[start:] if l['page'] is not None]
    heads = [i for i, l in enumerate(body) if is_head(l['t'])]
    assert len(heads) == 50, len(heads)
    end_idx = next(i for i in range(len(body) - 1, heads[-1], -1) if body[i]['t'].startswith('آخر الكتاب'))

    front = join_breaks(body[:heads[0]])
    back = join_breaks(body[end_idx:])
    sk = {'meta': {'book': {}}, 'front': blocks_from(front, 'i'), 'hadiths': [],
          'back': [prep.make_block('z1', 'paragraph', [' '.join(l['t'] for l in back)], sorted({p for l in back for p in l['pages']}))]}
    for k, hi in enumerate(heads):
        n = k + 1
        stop = heads[k + 1] if k + 1 < len(heads) else end_idx
        lines = join_breaks(body[hi + 1:stop])
        # the hadith as Ibn Rajab quotes it (with any second narration al-Nawawī gives): everything before the
        # commentary's first words, which open with «هذا الحديث» or one of a few other formulae
        h_end = HADITH_PARAS.get(n) or next((j for j, l in enumerate(lines[:20]) if j and OPENER.match(TASH.sub('', l['t']))), None)
        if h_end is None:  # fallback: up to the first line ending with a takhrīj
            h_end = next((j + 1 for j, l in enumerate(lines[:8]) if ends_takhrij(l['t'])), 1)
        hlines, clines = lines[:h_end], lines[h_end:]
        hpages = sorted({p for l in hlines for p in l['pages']})
        hadith_block = prep.make_block('n1', 'hadith', [l['t'] for l in hlines], hpages)
        pages = [l['page'] for l in body[hi:stop]]
        sk['hadiths'].append({
            'number': n, 'standard_number': n, 'collection': 'ibn-rajab' if n > 42 else 'nawawi',
            'heading': {'ar': body[hi]['t']}, 'pages': {'start': min(pages), 'end': max(pages)},
            'sections': [
                {'type': 'hadith', 'heading': None, 'blocks': [hadith_block]},
                {'type': 'commentary', 'heading': None, 'blocks': blocks_from(clines, 'c')},
            ],
        })
    sk['card'] = card
    return sk, raw[start:]


def read_english(tr, n):
    """Print chapter n (0 = preface/closing) as continuous English from en/jami/NN.tsv — the read-through check.
    Untranslated segments show as [AR: …]."""
    sk = json.load(open(os.path.join(tr, 'work', 'jami', 'skel.json')))
    path = os.path.join(HERE, 'en', 'jami', f'{n:02d}.tsv')
    tsv = {}
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            if '\t' in line and not line.startswith(('#', '!', '@')):
                k, v = line.rstrip('\n').split('\t', 1)
                tsv[k] = v.strip()
    blocks = sk['front'] + sk['back'] if n == 0 else [b for sec in sk['hadiths'][n - 1]['sections'] for b in sec['blocks']]
    for b in blocks:
        out = []
        for p in b['paras']:
            ids = [x['id'] for x in p['segs']]
            ar = {x['id']: x['ar'] for x in p['segs']}
            i = 0
            while i < len(ids):
                key = next(('+'.join(ids[i:j]) for j in range(len(ids), i, -1) if '+'.join(ids[i:j]) in tsv), None)
                if key:
                    out.append(tsv[key]); i += key.count('+') + 1
                else:
                    out.append(f'[AR: {ar[ids[i]][:60]}…]'); i += 1
            out.append('\n' if p['kind'] != 'prose' else '')
        print(f"[{b['key']}] " + ' '.join(x for x in out if x).replace(' \n ', '\n') + '\n')


def main():
    if '--read' in sys.argv:
        read_english(sys.argv[1], int(sys.argv[sys.argv.index('--read') + 1]))
        return
    tr = sys.argv[1]
    work = os.path.join(tr, 'work', 'jami')
    os.makedirs(work, exist_ok=True)
    sk, src = build()
    json.dump(sk, open(os.path.join(work, 'skel.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(src, open(os.path.join(tr, 'jami_src.json'), 'w'), ensure_ascii=False)
    open(os.path.join(work, '00.txt'), 'w').write(prep.worksheet('jami preface and closing',
        [{'type': 'front', 'blocks': sk['front']}, {'type': 'back', 'blocks': sk['back']}]))
    total = 0
    for h in sk['hadiths']:
        app = prep.APP[str(h['standard_number'])]
        title = f"jami hadith {h['number']} — {app['title']['en']}\nAPP: " + ' '.join(app['en'])
        open(os.path.join(work, f"{h['number']:02d}.txt"), 'w').write(prep.worksheet(title, h['sections']))
        total += sum(len(p['segs']) for s in h['sections'] for b in s['blocks'] for p in b['paras'])
    front_segs = sum(len(p['segs']) for b in sk['front'] + sk['back'] for p in b['paras'])
    print(f'jami: 50 chapters, {total} segments (+{front_segs} preface/closing) -> {os.path.relpath(work)}')


if __name__ == '__main__':
    main()
