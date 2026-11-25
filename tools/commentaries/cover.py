import json, re, sys, difflib
TASH = re.compile(r'[ؐ-ًؚ-ٰٟۖ-ۭـ]')
def words(s):
    s = TASH.sub('', s)
    s = re.sub(r'[^ء-ي0-9٠-٩]+', ' ', s)
    return [w for w in s.split() if not re.fullmatch(r'[0-9\u0660-\u0669]+', w)]
def json_ar(d, skip_keys=('source_arabic','source_metadata_ar')):
    out=[]
    def walk(x, key=None):
        if isinstance(x, dict):
            if 'ar' in x and isinstance(x['ar'], str) and key not in ('book',):
                out.append(x['ar'])
            for k,v in x.items():
                if k in skip_keys or k in ('book','translation'): continue
                if k=='ar': continue
                walk(v, k)
        elif isinstance(x, list):
            for v in x: walk(v, key)
    walk(d)
    return out
src = json.load(open(sys.argv[1])); d = json.load(open(sys.argv[2]))
sw = []
for l in src: sw += words(l['t'])
jw = []
for a in json_ar(d): jw += words(a)
HEAD=set('المفردات الفوائد الموجز شعر يستفاد منه ما مما يستفاد من الحديث'.split())
print('src words', len(sw), 'json words', len(jw))
sm = difflib.SequenceMatcher(None, sw, jw, autojunk=False)
miss=0; extra=0
for op,i1,i2,j1,j2 in sm.get_opcodes():
    if op=='equal': continue
    if op in ('delete','replace') and i2-i1>0:
        miss += i2-i1
        if not set(sw[i1:i2]) <= HEAD: print('SRC-ONLY', op, ' '.join(sw[i1:i2])[:300], '| JSON:', ' '.join(jw[j1:j2])[:200])
    if op=='insert' and not set(jw[j1:j2]) <= HEAD: extra += j2-j1; print('JSON-ONLY', ' '.join(jw[j1:j2])[:300])
print('missing words', miss, 'extra', extra)
