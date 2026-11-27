"""Merge skeletons + English TSVs into the final bilingual JSON files and validate.

usage: python3 -I assemble.py <scratch_dir> [--partial] [--check] [--book fath|tuhfah|mujaz|jami]

--check validates (alignment, locks, style, quotes) without writing data/ — for translators working in parallel.
--out <dir> writes the output there instead of data/commentaries (a batch's own copy, for verify.py --data <dir>).

A book whose meta.json says translation.status "in progress" may have untranslated segments (en: null).
Split books (jami) are written as <id>/index.json + <id>/hNN.json, so the app loads one chapter at a time.
"""
import json, os, re, sys, collections, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
TR = sys.argv[1]
PARTIAL = '--partial' in sys.argv
ONLY = sys.argv[sys.argv.index('--book') + 1] if '--book' in sys.argv else None
CHECK = '--check' in sys.argv
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(HERE, '..', '..', 'data', 'commentaries')
APP = json.load(open(os.path.join(HERE, '..', 'meta.json')))['hadith']

BOOK_IDS = {'fath': 'fath-al-qawi-al-matin', 'tuhfah': 'al-tuhfah-al-rabbaniyyah', 'mujaz': 'al-sharh-al-mujaz-al-mufid',
            'jami': 'jami-al-ulum-wal-hikam'}
SPLIT = {'jami'}
AR = re.compile(r'[؀-ۿ]')
LINT = [
    (r'\bGabriel\b', 'Jibrīl'), (r'peace and blessings be upon him', 'ﷺ'), (r'\bQur?an\b', 'Qurʾān'),
    (r'\bMecca\b|\bMakka\b', 'Makkah'), (r'\bMedina\b|\bMadina\b', 'Madīnah'), (r'(?<![ʿ])\bUmar\b', 'ʿUmar'),
    (r'\bAbu\b', 'Abū'), (r'\bBukhari\b', 'al-Bukhārī'), (r'\bSahih\b', 'Ṣaḥīḥ'), (r'\bAbbas\b', 'ʿAbbās'),
    (r'\bAisha\b', 'ʿĀʾishah'), (r'\bzakat\b|\bzakah\b', 'zakāh'), (r'\bRamadan\b', 'Ramaḍān'),
    (r'\bMuhammad\b', 'Muḥammad'), (r'\bJibril\b', 'Jibrīl'), (r'\bNawawi\b', 'al-Nawawī'), (r'(?<!al-)\bIslām\b', 'Islam'),
    (r'\bSunna\b', 'Sunnah'), (r'\bShari\'?ah\b|\bSharia\b', 'Sharīʿah'), (r'\bTirmidhi\b', 'al-Tirmidhī'),
    (r'\bhadeeth|\bahadith\b', 'hadith(s)'), (r'  ', 'double space'), (r'\bhonor|\bbehavior|\brecognize|\bcolor\b|\bfavor', 'British spelling'),
]

SEC_EN = {
    ('fath', 'benefits'): 'Among the lessons drawn from the hadith',
    ('tuhfah', 'vocabulary'): 'Vocabulary', ('tuhfah', 'benefits'): 'Lessons drawn from it',
    ('mujaz', 'vocabulary'): 'Vocabulary', ('mujaz', 'benefits'): 'Benefits',
    ('mujaz', 'commentary'): 'Concise explanation', ('mujaz', 'poetry'): 'Poetry',
}

def read_tsv(path):
    m, notes, hnotes, over = {}, collections.defaultdict(list), [], {}
    if not os.path.exists(path):
        return m, notes, hnotes, over
    for ln, line in enumerate(open(path, encoding='utf-8'), 1):
        line = line.rstrip('\n')
        if not line.strip() or line.startswith('#'):
            continue
        if '\t' not in line:
            raise SystemExit(f'{path}:{ln}: no TAB: {line[:80]}')
        k, v = line.split('\t', 1)
        v = v.strip()
        if k == '!hadith':
            hnotes.append(v)
        elif k.startswith('!'):
            notes[k[1:]].append(v)
        elif k.startswith('@'):
            over[k[1:]] = v
        else:
            if k in m:
                raise SystemExit(f'{path}:{ln}: duplicate key {k}')
            m[k] = v
    return m, notes, hnotes, over

class Ctx:
    def __init__(self, book, partial=False):
        self.book = book; self.errors = []; self.warn = []; self.missing = 0; self.segs = 0; self.blocks = 0; self.notes = 0
        self.partial = partial

def build_block(ctx, b, tsv, notes, prefix):
    """Apply translations to block b. Returns final block dict."""
    used = set()
    paras = []
    for p in b['paras']:
        ids = [s['id'] for s in p['segs']]
        ar = {s['id']: s['ar'] for s in p['segs']}
        out = []
        i = 0
        while i < len(ids):
            sid = ids[i]
            # find a key starting with sid (merge or single)
            key = None
            for j in range(len(ids), i, -1):
                cand = '+'.join(ids[i:j])
                if cand in tsv:
                    key = cand; break
            if key is None:
                if not (PARTIAL or ctx.partial):
                    ctx.errors.append(f'{prefix}: missing English for {sid}')
                ctx.missing += 1
                out.append({'ar': ar[sid], 'en': None}); i += 1
                continue
            n = key.count('+') + 1
            en = tsv[key]
            used.add(key)
            a = ' '.join(ar[x] for x in ids[i:i + n])
            if not en:
                ctx.errors.append(f'{prefix}: empty English for {key}')
            if AR.search(en or ''):
                ctx.warn.append(f'{prefix} {key}: Arabic script in English: {en[:60]}')
            for rx, fix in LINT:
                if re.search(rx, en or ''):
                    ctx.warn.append(f'{prefix} {key}: style [{fix}] {re.search(rx, en).group(0)!r}')
            out.append({'ar': a, 'en': en}); i += n
        ctx.segs += len(out)
        paras.append({'kind': p['kind'], 'segments': out})
    for k in tsv:
        if k.split('+')[0][:len(b['key'])] == b['key'] and re.fullmatch(re.escape(b['key']) + r'[a-z]+(\+[a-z0-9]+)*', k.split('+')[0]) and k not in used:
            ctx.errors.append(f'{prefix}: unused/misaligned key {k}')
    blk = {'id': prefix}
    for f in ('number', 'printed_number'):
        if b.get(f) is not None:
            blk[f] = b[f]
    if b['kind'] == 'term':
        s0 = paras[0]['segments'][0]
        if ':' in s0['ar']:
            t_ar = s0['ar'].split(':', 1)[0].strip()
            t_en = s0['en'].split(':', 1)[0].strip() if s0['en'] and ':' in s0['en'] else None
            if t_en is None and s0['en']:
                ctx.warn.append(f'{prefix}: vocabulary English has no colon')
            blk['term'] = {'ar': t_ar, 'en': t_en}
    blk['pages'] = b['pages']
    blk['paragraphs'] = paras
    if notes.get(b['key']):
        blk['notes'] = [{'en': n} for n in notes[b['key']]]
        ctx.notes += len(blk['notes'])
    ctx.blocks += 1
    return blk

def quote_balance(ctx, prefix, blocks):
    txt = ' '.join(s['en'] or '' for b in blocks for p in b['paragraphs'] for s in p['segments'])
    if txt.count('“') != txt.count('”'):
        ctx.warn.append(f'{prefix}: unbalanced “” ({txt.count("“")}/{txt.count("”")})')

def all_tsv_keys_known(ctx, tsv, blocks_keys, prefix):
    for k in tsv:
        base = re.match(r'[a-z]+\d+', k.split('+')[0])
        if not base or base.group(0) not in blocks_keys:
            ctx.errors.append(f'{prefix}: key {k} matches no block')

def check_lock(ctx, name, n, chunk_blocks, tsv_path):
    """Each TSV is locked to the Arabic segments it was written against. A changed
    segmentation then fails loudly instead of silently misaligning translations."""
    if not os.path.exists(tsv_path):
        return
    lock_path = tsv_path[:-4] + '.lock.json'
    cur = {s['id']: s['ar'] for b in chunk_blocks for p in b['paras'] for s in p['segs']}
    if os.path.exists(lock_path):
        old = json.load(open(lock_path))
        for k, v in old.items():
            if cur.get(k) != v:
                ctx.errors.append(f'{name}/{n}: segment {k} Arabic changed since translation (lock mismatch)')
        new = {k: v for k, v in cur.items() if k not in old}
        if new:
            old.update(new); json.dump(old, open(lock_path, 'w'), ensure_ascii=False, indent=0)
    else:
        json.dump(cur, open(lock_path, 'w'), ensure_ascii=False, indent=0)

def assemble(name):
    sk = json.load(open(os.path.join(TR, 'work', name, 'skel.json')))
    bid = BOOK_IDS[name]
    en_dir = os.path.join(HERE, 'en', name)
    meta = json.load(open(os.path.join(HERE, 'en', name, 'meta.json'))) if os.path.exists(os.path.join(en_dir, 'meta.json')) else {}
    ctx = Ctx(name, partial=meta.get('translation', {}).get('status') == 'in progress')
    tsv, notes, hn, over = read_tsv(os.path.join(en_dir, '00.tsv'))
    check_lock(ctx, name, '00', sk['front'] + sk['back'], os.path.join(en_dir, '00.tsv'))
    keys = {b['key'] for b in sk['front'] + sk['back']}
    all_tsv_keys_known(ctx, tsv, keys, f'{name}/00')
    front = [build_block(ctx, b, tsv, notes, f"{bid}.front.{b['key']}") for b in sk['front']]
    back = [build_block(ctx, b, tsv, notes, f"{bid}.back.{b['key']}") for b in sk['back']]
    hadiths = []
    for h in sk['hadiths']:
        n = h['number']
        tsv, notes, hn, over = read_tsv(os.path.join(en_dir, f'{n:02d}.tsv'))
        check_lock(ctx, name, f'{n:02d}', [b for s in h['sections'] for b in s['blocks']], os.path.join(en_dir, f'{n:02d}.tsv'))
        keys = {b['key'] for s in h['sections'] for b in s['blocks']}
        all_tsv_keys_known(ctx, tsv, keys, f'{name}/{n:02d}')
        app = APP[str(h['standard_number'])]
        hd = {
            'id': f'h{n:02d}', 'number': n, 'standard_number': h['standard_number'],
            'collection': h['collection'],
            'heading': {'ar': h['heading']['ar'].rstrip(':').strip(), 'en': f'Hadith {n}'},
            'title': {'ar': app['title']['ar'], 'en': over.get('title', app['title']['en'])},
            'pages': h['pages'],
        }
        if hn:
            hd['notes'] = [{'en': x} for x in hn]
            ctx.notes += len(hn)
        secs = []
        for s in h['sections']:
            blocks = [build_block(ctx, b, tsv, notes, f"{bid}.h{n:02d}.{b['key']}") for b in s['blocks']]
            head = None; secnum = None
            if s.get('heading'):
                har = s['heading']['ar'].rstrip(':').strip()
                m = re.match(r'^(\d+)\s*-?\s*', har)
                if m:  # Fath prints the benefits heading as the chapter's last numbered paragraph
                    secnum = int(m.group(1)); har = har[m.end():]
                head = {'ar': har, 'en': SEC_EN.get((name, s['type']), s['heading']['en'])}
            sec = {'type': s['type'], 'heading': head}
            if secnum is not None:
                sec['number'] = secnum
            sec['blocks'] = blocks
            secs.append(sec)
        quote_balance(ctx, f'{name}/{n:02d}', [b for s in secs for b in s['blocks']])
        hd['sections'] = secs
        segs = [sg for s in secs for b in s['blocks'] for p in b['paragraphs'] for sg in p['segments']]
        hd['translated'] = round(sum(1 for sg in segs if sg['en']) / max(1, len(segs)), 3)
        hadiths.append(hd)
    book = dict(sk['meta']['book'])
    doc = {
        'schema': 'arbaeen.commentary', 'schema_version': '2.0', 'id': bid,
        'book': meta.get('book', book),
        'translation': meta.get('translation', {}),
        'stats': {'hadiths': len(hadiths), 'blocks': ctx.blocks, 'segments': ctx.segs, 'untranslated_segments': ctx.missing, 'editorial_notes': ctx.notes},
        'front_matter': front, 'hadiths': hadiths, 'back_matter': back,
    }
    return doc, ctx

def write_split(doc, bid):
    """index.json (everything but the chapters' sections) + one hNN.json per chapter."""
    d = os.path.join(OUT, bid)
    os.makedirs(d, exist_ok=True)
    index = {k: v for k, v in doc.items() if k != 'hadiths'}
    index['hadiths'] = [{k: v for k, v in h.items() if k != 'sections'} for h in doc['hadiths']]
    index['stats']['translated_chapters'] = sum(1 for h in doc['hadiths'] if h['translated'] >= 1)
    json.dump(index, open(os.path.join(d, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for h in doc['hadiths']:
        json.dump(h, open(os.path.join(d, f"{h['id']}.json"), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return os.path.join(d, 'index.json')

def main():
    os.makedirs(OUT, exist_ok=True)
    rc = 0
    for name in BOOK_IDS:
        if ONLY and name != ONLY:
            continue
        if not os.path.exists(os.path.join(TR, 'work', name, 'skel.json')):
            print(f'{name}: no skeleton in {TR}/work/{name} — skipped (run prep.py or {name}.py first)')
            continue
        doc, ctx = assemble(name)
        if CHECK:
            path = '(check only, nothing written)'
        elif name in SPLIT:
            path = write_split(doc, BOOK_IDS[name])
        else:
            path = os.path.join(OUT, BOOK_IDS[name] + '.json')
            json.dump(doc, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f"{name}: blocks {ctx.blocks}, segments {ctx.segs}, untranslated {ctx.missing}, errors {len(ctx.errors)}, warnings {len(ctx.warn)} -> {os.path.relpath(path)}")
        for e in ctx.errors[:40]:
            print('  ERROR', e)
        for w in ctx.warn[:60]:
            print('  warn ', w)
        if ctx.errors:
            rc = 1
    sys.exit(rc)

main()
