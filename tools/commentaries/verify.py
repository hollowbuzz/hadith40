"""Verify the assembled files: Arabic coverage against the Shamela exports, and
English/Arabic length ratios per segment (to catch misalignment).

usage: python3 -I verify.py <scratch_dir>
"""
import json, os, re, sys, difflib, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
TR = sys.argv[1]
OUT = os.path.join(HERE, '..', '..', 'data', 'commentaries')
FILES = {'fath': 'fath-al-qawi-al-matin', 'tuhfah': 'al-tuhfah-al-rabbaniyyah', 'mujaz': 'al-sharh-al-mujaz-al-mufid'}
TASH = re.compile(r'[ؐ-ًؚ-ٰٟۖ-ۭـ]')
HEAD = set('المفردات الفوائد االفوائد الموجز شعر يستفاد منه ما مما يستفاد من الحديث ومما'.split())
def words(s):
    s = TASH.sub('', s)
    s = re.sub(r'[^ء-ي0-9٠-٩]+', ' ', s)
    return [w for w in s.split() if not re.fullmatch(r'[0-9٠-٩]+', w)]
rc = 0
for name, fid in FILES.items():
    doc = json.load(open(os.path.join(OUT, fid + '.json')))
    src = json.load(open(os.path.join(TR, name + '_src.json')))
    sw = [w for l in src for w in words(l['t'])]
    jw, ratios, segs = [], [], []
    def blocks_of(bs, where):
        for b in bs:
            for p in b['paragraphs']:
                for s in p['segments']:
                    jw.extend(words(s['ar']))
                    if s['en'] and len(s['ar']) > 25:
                        r = len(s['en']) / len(s['ar']); ratios.append(r); segs.append((where + ' ' + b['id'], r, s))
    blocks_of(doc['front_matter'], 'front')
    for h in doc['hadiths']:
        jw.extend(words(h['heading']['ar']))
        for sec in h['sections']:
            if sec.get('heading'):
                jw.extend(words(sec['heading']['ar']))
            blocks_of(sec['blocks'], f"h{h['number']}")
    blocks_of(doc['back_matter'], 'back')
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
    med = statistics.median(ratios)
    out = sorted(segs, key=lambda x: x[1])
    lo = [x for x in out if x[1] < med * 0.45]
    hi = [x for x in out if x[1] > med * 2.4]
    print(f"{name}: source words {len(sw)}, output words {len(jw)}, unmatched source {miss}, unmatched output {extra}; en/ar median {med:.2f}, low outliers {len(lo)}, high outliers {len(hi)}")
    for i in issues[:12]:
        print('   diff', i)
    for x in lo[:8] + hi[:8]:
        print(f"   ratio {x[1]:.2f} {x[0]} | {x[2]['ar'][:70]} | {x[2]['en'][:90]}")
