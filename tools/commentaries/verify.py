"""Verify the assembled files: Arabic coverage against the Shamela exports, and
English/Arabic length ratios per segment (to catch misalignment).

usage: python3 -I verify.py <scratch_dir> [--book jami] [--chapters 1-6] [--data <dir>]

--data reads assembled files from <dir> (as written by assemble.py --out <dir>) instead of data/commentaries.

--chapters limits the English checks (ratios, long or doubled words) to those chapters; Arabic coverage is always
checked for the whole book. Split books (jami) are read from <id>/index.json + <id>/hNN.json.
"""
import json, os, re, sys, difflib, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
TR = sys.argv[1]
OUT = sys.argv[sys.argv.index('--data') + 1] if '--data' in sys.argv else os.path.join(HERE, '..', '..', 'data', 'commentaries')
FILES = {'fath': 'fath-al-qawi-al-matin', 'tuhfah': 'al-tuhfah-al-rabbaniyyah', 'mujaz': 'al-sharh-al-mujaz-al-mufid',
         'jami': 'jami-al-ulum-wal-hikam'}
ONLY = sys.argv[sys.argv.index('--book') + 1] if '--book' in sys.argv else None
CHAPTERS = None
if '--chapters' in sys.argv:
    CHAPTERS = set()
    for part in sys.argv[sys.argv.index('--chapters') + 1].split(','):
        a, _, b = part.partition('-'); CHAPTERS.update(range(int(a), int(b or a) + 1))

def load(fid):
    split = os.path.join(OUT, fid, 'index.json')
    if os.path.exists(split):
        doc = json.load(open(split))
        doc['hadiths'] = [json.load(open(os.path.join(OUT, fid, h['id'] + '.json'))) for h in doc['hadiths']]
        return doc
    return json.load(open(os.path.join(OUT, fid + '.json')))
TASH = re.compile(r'[ؐ-ًؚ-ٰٟۖ-ۭـ]')
HEAD = set('المفردات الفوائد االفوائد الموجز شعر يستفاد منه ما مما يستفاد من الحديث ومما'.split())
def words(s):
    s = TASH.sub('', s)
    s = re.sub(r'[^ء-ي0-9٠-٩]+', ' ', s)
    return [w for w in s.split() if not re.fullmatch(r'[0-9٠-٩]+', w)]
rc = 0
for name, fid in FILES.items():
    if ONLY and name != ONLY:
        continue
    if not os.path.exists(os.path.join(TR, name + '_src.json')):
        print(f'{name}: no {name}_src.json in {TR} — skipped'); continue
    doc = load(fid)
    src = json.load(open(os.path.join(TR, name + '_src.json')))
    sw = [w for l in src for w in words(l['t'])]
    jw, ratios, segs, style = [], [], [], []
    def blocks_of(bs, where, english=True):
        for b in bs:
            for p in b['paragraphs']:
                for s in p['segments']:
                    jw.extend(words(s['ar']))
                    if not (s['en'] and english):
                        continue
                    if len(s['ar']) > 25:
                        r = len(s['en']) / len(s['ar']); ratios.append(r); segs.append((where + ' ' + b['id'], r, s))
                    if len(s['en'].split()) > 90:
                        style.append(f"{where} {b['id']}: {len(s['en'].split())}-word English sentence — split or merge differently")
                    m = re.search(r'\b(\w+) \1\b', s['en'], re.I)
                    if m and m.group(1).lower() not in ('that', 'had', 'is'):
                        style.append(f"{where} {b['id']}: doubled word {m.group(0)!r}")
    blocks_of(doc['front_matter'], 'front', CHAPTERS is None or 0 in CHAPTERS)
    for h in doc['hadiths']:
        jw.extend(words(h['heading']['ar']))
        for sec in h['sections']:
            if sec.get('heading'):
                jw.extend(words(sec['heading']['ar']))
            blocks_of(sec['blocks'], f"h{h['number']}", CHAPTERS is None or h['number'] in CHAPTERS)
    blocks_of(doc['back_matter'], 'back', CHAPTERS is None or 0 in CHAPTERS)
    sm = difflib.SequenceMatcher(None, sw, jw, autojunk=False)
    miss = extra = 0; issues = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == 'equal':
            continue
        a, b = sw[i1:i2], jw[j1:j2]
        if set(a) <= HEAD and set(b) <= HEAD:
            continue
        miss += len(a); extra += len(b)
        issues.append((op, ' '.join(a)[:120], ' '.join(b)[:120]))
    med = statistics.median(ratios) if len(ratios) >= 30 else 1.7  # typical English/Arabic length ratio in these books
    out = sorted(segs, key=lambda x: x[1])
    lo = [x for x in out if x[1] < med * 0.45]
    hi = [x for x in out if x[1] > med * 2.4]
    print(f"{name}: source words {len(sw)}, output words {len(jw)}, unmatched source {miss}, unmatched output {extra}; en/ar median {med:.2f}, low outliers {len(lo)}, high outliers {len(hi)}")
    for i in issues[:12]:
        print('   diff', i)
    for x in lo[:8] + hi[:8]:
        print(f"   ratio {x[1]:.2f} {x[0]} | {x[2]['ar'][:70]} | {x[2]['en'][:90]}")
    print(f"   english checked: {len(ratios)} segments; style flags {len(style)}")
    for x in style[:15]:
        print('   style', x)
