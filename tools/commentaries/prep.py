"""Build a normalised skeleton for each book with auto-segmented Arabic, and
write per-hadith worksheets (Arabic segments + previous English) for translation.

usage: python3 -I prep.py <scratch_dir>
Inputs (copied into <scratch_dir> on first run): the three draft JSON files in
~/Downloads and the three Shamela .htm exports on the Desktop.
"""
import json, re, sys, os, string, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import htm as htmparse

# Run directly: python3 -I prep.py <scratch_dir>. Imported (e.g. by jami.py), only the helpers are used.
TR = sys.argv[1] if __name__ == '__main__' else None
WORK = os.path.join(TR, 'work') if TR else None
HOME = os.path.expanduser('~')
INPUTS = {
    'fath': ('Downloads/fath_al_qawi_al_matin_ar_en_complete.json',
             'Desktop/تصدير من الشاملة/فتح القوي المتين في شرح الأربعين وتتمة الخمسين للنووي وابن رجب رحمهما الله.htm'),
    'tuhfah': ('Downloads/al_tuhfah_al_rabbaniyyah_ar_en.json',
               'Desktop/تصدير من الشاملة/التحفة الربانية في شرح الأربعين حديثا النووية.htm'),
    'mujaz': ('Downloads/al_sharh_al_mujaz_al_mufid_ar_en.json',
              'Desktop/تصدير من الشاملة/الأحاديث الأربعين النووية مع ما زاد عليها ابن رجب وعليها الشرح الموجز المفيد.htm'),
}
def setup_inputs():
    for name, (j, h) in INPUTS.items():
        if not os.path.exists(os.path.join(TR, name + '.json')):
            os.makedirs(TR, exist_ok=True)
            shutil.copy(os.path.join(HOME, j), os.path.join(TR, name + '.json'))
        if not os.path.exists(os.path.join(TR, name + '_src.json')):
            json.dump(htmparse.parse(os.path.join(HOME, h)), open(os.path.join(TR, name + '_src.json'), 'w'), ensure_ascii=False)
APP = json.load(open(os.path.join(HERE, '..', 'meta.json')))['hadith']

END = '.؟!?؛'
CLOSE = '"»)]\'”’'
MAXW = 38
NOSPLIT = {'وسلم', 'وتعالى', 'وجل', 'وآله', 'وصحبه', 'وسلامه', 'وبركاته', 'وعلا', 'وبارك', 'وأرضاه'}

def nwords(s):
    return len(s.split())

def protected_mask(s):
    """True for chars inside {...}, (...), [...] spans (Qur'an, refs)."""
    mask = [False] * len(s)
    stack = []
    pairs = {'{': '}', '(': ')', '[': ']', '﴿': '﴾'}
    i = 0
    while i < len(s):
        c = s[i]
        if c in pairs:
            # only protect parens if they close within 160 chars
            j = s.find(pairs[c], i + 1)
            lim = 2000 if c in '{﴿' else 160
            if j != -1 and j - i <= lim:
                for k in range(i, j + 1):
                    mask[k] = True
                i = j + 1
                continue
        i += 1
    return mask

def split_points(s, chars, mask):
    pts = []
    for i, c in enumerate(s):
        if c in chars and not mask[i]:
            j = i + 1
            while j < len(s) and s[j] in CLOSE:
                j += 1
            if j < len(s) and s[j] == ' ':
                pts.append(j)
    return pts

def cut(s, pts):
    out, prev = [], 0
    for p in pts:
        out.append(s[prev:p].strip()); prev = p
    out.append(s[prev:].strip())
    return [x for x in out if x]

def split_long(piece):
    if nwords(piece) <= MAXW:
        return [piece]
    mask = protected_mask(piece)
    cands = split_points(piece, '،,:', mask)
    total = nwords(piece)
    best = None
    for p in cands:
        left = nwords(piece[:p])
        if left >= 8 and total - left >= 8:
            score = abs(left - total / 2)
            if best is None or score < best[0]:
                best = (score, p)
    if best is None and total > 45:
        # no punctuation: split before a conjunction (و / ف) near the middle
        toks = piece.split(' ')
        pos = 0; offs = []
        for t in toks:
            offs.append(pos); pos += len(t) + 1
        for k in range(12, len(toks) - 12):
            t = toks[k]
            prev = ' '.join(toks[max(0, k - 3):k])
            if len(t) > 3 and t[0] in 'وف' and not mask[offs[k]] and t not in NOSPLIT \
                    and not prev.endswith(('صلى الله عليه', 'صلى الله', 'رضي الله', 'عز', 'سبحانه', 'الله عليه وآله')):
                score = abs(k - total / 2)
                if best is None or score < best[0]:
                    best = (score, offs[k])
    if best is None:
        return [piece]
    p = best[1]
    return split_long(piece[:p].strip()) + split_long(piece[p:].strip())

def segment(text):
    text = re.sub(r'[ \t]+', ' ', text).strip()
    if not text:
        return []
    mask = protected_mask(text)
    pieces = cut(text, split_points(text, END, mask))
    # merge tiny pieces
    merged = []
    for p in pieces:
        if merged and (nwords(p) < 3 or nwords(merged[-1]) < 3):
            merged[-1] = merged[-1] + ' ' + p
        else:
            merged.append(p)
    out = []
    for p in merged:
        out += split_long(p)
    return out

def is_verse(line):
    return bool(re.search(r'\S\s*…\s*\S', line)) and nwords(line) <= 24 and not line.rstrip().endswith(('.', '؟', '…'))

def letters():
    for a in string.ascii_lowercase:
        yield a
    for a in string.ascii_lowercase:
        for b in string.ascii_lowercase:
            yield a + b

def make_block(key, kind, paras_text, pages, old_en='', **extra):
    """paras_text: list of paragraph strings (verse lines are their own paragraphs
    of kind verse). Returns block with segment ids."""
    gen = letters()
    paras = []
    for ptxt in paras_text:
        if isinstance(ptxt, tuple):  # ('verse', [lines]) or ('label', text)
            k, lines = ptxt
            segs = [{'id': key + next(gen), 'ar': l.strip()} for l in lines]
            paras.append({'kind': k, 'segs': segs})
        else:
            segs = [{'id': key + next(gen), 'ar': x} for x in segment(ptxt)]
            if segs:
                paras.append({'kind': 'prose', 'segs': segs})
    b = {'key': key, 'kind': kind, 'pages': pages, 'old_en': old_en, 'paras': paras}
    b.update(extra)
    return b

def split_lines_to_paras(text, page_breaks_join=True):
    """Split block text on newlines into paragraphs; verse lines grouped."""
    out = []
    verse_buf = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        if is_verse(line):
            verse_buf.append(line)
            continue
        if verse_buf:
            out.append(('verse', verse_buf)); verse_buf = []
        out.append(line)
    if verse_buf:
        out.append(('verse', verse_buf))
    return out

# ---------------------------------------------------------------- page-break joins
def join_pagebreaks(text, src_lines):
    """In Fath, '\n' marks either a real paragraph break or a page break. Join
    page-break newlines that fall mid-sentence."""
    if '\n' not in text:
        return text
    parts = text.split('\n')
    res = parts[0]
    for nxt in parts[1:]:
        prev_tail = res.strip()[-25:]
        pb = False
        for i, l in enumerate(src_lines):
            if l['t'].endswith(prev_tail):
                pb = i + 1 < len(src_lines) and src_lines[i + 1]['page'] != l['page']
                break
        ends_sentence = bool(re.search(r'[.؟!:]["»)\]]?$', res.strip()))
        if pb and not ends_sentence and not is_verse(nxt) and not is_verse(res.split('\n')[-1]):
            res = res.rstrip() + ' ' + nxt.lstrip()
        else:
            res = res.rstrip() + '\n' + nxt.lstrip()
    return res

NUM_PREFIX_T = re.compile(r'^\s*(\d+)\s*[-_–]\s*')
NUM_PREFIX_M = re.compile(r'^\s*(?:\((\d+)\)|(\d+)\s*[-_–])\s*')

SEC_HEAD = {
    'المفردات': ('vocabulary', 'Vocabulary'),
    'الفوائد': ('benefits', 'Benefits'),
    'االفوائد': ('benefits', 'Benefits'),
    'الموجز': ('commentary', 'Concise commentary'),
    'شعر': ('poetry', 'Poetry'),
}

def hadith_shell(h):
    return {
        'id': h['id'], 'number': h['number'],
        'standard_number': h.get('standard_number', h['number']),
        'collection': 'ibn-rajab' if h['number'] > 42 else 'nawawi',
        'heading': h['heading'], 'topic_en': h['topic_en'],
        'pages': {'start': h['page_start'], 'end': h['page_end']},
        'old_notes': h.get('notes', []),
        'sections': [],
    }

# ---------------------------------------------------------------- Fath
def build_fath():
    d = json.load(open(os.path.join(TR, 'fath.json')))
    src = json.load(open(os.path.join(TR, 'fath_src.json')))
    out = {'meta': {k: d[k] for k in ('schema_version', 'book', 'translation')}, 'hadiths': []}
    fr = []
    for i, b in enumerate(d['introduction'], 1):
        t = join_pagebreaks(b['ar'], src)
        fr.append(make_block(f'i{i}', 'paragraph', split_lines_to_paras(t), b['pages'], b['en']))
    out['front'] = fr
    c = d['conclusion']
    out['back'] = [make_block('z1', 'paragraph', [c['ar']], c['pages'], c['en'])]
    for h in d['hadiths']:
        hs = hadith_shell(h)
        nar = []
        for i, b in enumerate(h['narrations'], 1):
            t = join_pagebreaks(b['ar'], src)
            nar.append(make_block(f'n{i}', 'hadith', split_lines_to_paras(t), b['pages'], b['en']))
        hs['sections'].append({'type': 'hadith', 'heading': None, 'blocks': nar})
        com = []
        for b in h['commentary']:
            t = join_pagebreaks(b['ar'], src)
            com.append(make_block(f"c{b['number']}", 'entry', split_lines_to_paras(t), b['pages'], b['en'], number=b['number']))
        hs['sections'].append({'type': 'commentary', 'heading': None, 'blocks': com})
        ben = []
        for b in h['benefits']:
            t = join_pagebreaks(b['ar'], src)
            ben.append(make_block(f"b{b['number']}", 'benefit', split_lines_to_paras(t), b['pages'], b['en'], number=b['number']))
        hs['sections'].append({'type': 'benefits', 'heading': h['benefits_heading'], 'blocks': ben})
        out['hadiths'].append(hs)
    return out

# ---------------------------------------------------------------- Tuhfah
def build_tuhfah():
    d = json.load(open(os.path.join(TR, 'tuhfah.json')))
    out = {'meta': {k: d[k] for k in ('schema_version', 'book', 'translation')}, 'hadiths': []}
    out['front'] = [make_block(f'i{i}', 'paragraph', split_lines_to_paras(b['ar']), b['pages'], b['en'])
                    for i, b in enumerate(d['introduction'], 1)]
    c = d['conclusion']
    out['back'] = [make_block('z1', 'paragraph', [c['ar']], c['pages'], c['en'])]
    for h in d['hadiths']:
        hs = hadith_shell(h)
        hs['sections'].append({'type': 'hadith', 'heading': None, 'blocks': [
            make_block(f'n{i}', 'hadith', split_lines_to_paras(b['ar']), b['pages'], b['en'])
            for i, b in enumerate(h['narrations'], 1)]})
        voc = []
        for b in h['vocabulary']:
            voc.append(make_block(f"v{b['number']}", 'term', split_lines_to_paras(b['ar']), b['pages'], b['en'], number=b['number']))
        hs['sections'].append({'type': 'vocabulary', 'heading': h['vocabulary_heading'], 'blocks': voc})
        ben = []
        for b in h['benefits']:
            t = b['ar']; pn = None
            m = NUM_PREFIX_T.match(t)
            if m:
                pn = int(m.group(1)); t = t[m.end():]
            ben.append(make_block(f"b{b['number']}", 'benefit', split_lines_to_paras(t), b['pages'], b['en'],
                                  number=b['number'], printed_number=pn))
        hs['sections'].append({'type': 'benefits', 'heading': h['benefits_heading'], 'blocks': ben})
        out['hadiths'].append(hs)
    return out

# ---------------------------------------------------------------- Mujaz (rebuilt from source_arabic order)
def build_mujaz():
    d = json.load(open(os.path.join(TR, 'mujaz.json')))
    out = {'meta': {k: d[k] for k in ('schema_version', 'book', 'translation')}, 'hadiths': []}
    out['front'] = [make_block(f'i{i}', 'paragraph', split_lines_to_paras(b['ar']), b['pages'], b['en'])
                    for i, b in enumerate(d['introduction'], 1)]
    out['back'] = [make_block(f'z{i}', 'paragraph', [c['ar']], c['pages'], c['en'])
                   for i, c in enumerate(d['conclusion'], 1)]
    for h in d['hadiths']:
        hs = hadith_shell(h)
        old = {
            'hadith': ' '.join(b['en'] for b in h['narrations']),
            'vocabulary': ' '.join(b['en'] for b in h['vocabulary']),
            'commentary': ' '.join(b['en'] for b in h['commentary']),
            'poetry': ' '.join(b['en'] for b in h['poetry']),
        }
        concl = {c['ar'].strip() for c in d['conclusion']}
        lines = [ln for ln in h['source_arabic'][1:]  # skip "الحديث ..." heading
                 if ln['ar'].strip() not in concl]    # the book's closing line is kept in back matter only
        # group into sections
        secs = [{'type': 'hadith', 'heading': None, 'lines': []}]
        for ln in lines:
            t = ln['ar'].strip()
            key = t.rstrip(':').strip()
            if key in SEC_HEAD and len(t) < 14:
                typ, en = SEC_HEAD[key]
                secs.append({'type': typ, 'heading': {'ar': t.rstrip(':').strip(), 'en': en}, 'lines': []})
                continue
            secs[-1]['lines'].append(ln)
        for s in secs:
            # join page-break line splits
            items = []  # (page_list, text)
            for ln in s['lines']:
                t = ln['ar'].strip(); pg = ln['page']
                if items and not is_verse(t) and not is_verse(items[-1][1].split('\n')[-1]) \
                        and pg != items[-1][0][-1] and not re.search(r'[.؟!:]["»)\]]?$', items[-1][1]) \
                        and not NUM_PREFIX_M.match(t) and t not in ('آخر:', 'وقال آخر:'):
                    items[-1] = (items[-1][0] + [pg], items[-1][1] + ' ' + t)
                else:
                    items.append(([pg], t))
            blocks = []
            if s['type'] == 'benefits':
                seq = 0
                for pgs, t in items:
                    m = NUM_PREFIX_M.match(t)
                    if m or not blocks:
                        seq += 1
                        pn = int(m.group(1) or m.group(2)) if m else None
                        body = t[m.end():] if m else t
                        blocks.append(make_block(f'b{seq}', 'benefit', split_lines_to_paras(body), pgs,
                                                 '', number=seq, printed_number=pn))
                    else:
                        # verse or continuation inside benefits: attach as new para to last block
                        lb = blocks[-1]
                        lb['_extra'] = lb.get('_extra', 0) + 1
                        extra = make_block(lb['key'] + 'xyzw'[lb['_extra'] - 1], 'tmp', split_lines_to_paras(t), pgs)
                        lb['paras'] += extra['paras']; lb['pages'] = sorted(set(lb['pages'] + pgs))
                # attach old english per benefit
                olds = h['benefits']
                for b in blocks:
                    if b['number'] - 1 < len(olds):
                        b['old_en'] = olds[b['number'] - 1]['en']
            else:
                # group consecutive verse lines, keep "آخر:" labels as label paras
                paras = []; pages = []
                for pgs, t in items:
                    pages += pgs
                    if is_verse(t):
                        if paras and isinstance(paras[-1], tuple) and paras[-1][0] == 'verse':
                            paras[-1][1].append(t)
                        else:
                            paras.append(('verse', [t]))
                    elif t in ('آخر:', 'وقال آخر:', 'آخر'):
                        paras.append(('label', [t]))
                    else:
                        paras.append(t)
                prefix = {'hadith': 'n', 'vocabulary': 'v', 'commentary': 'c', 'poetry': 'p'}[s['type']]
                kind = {'hadith': 'hadith', 'vocabulary': 'paragraph', 'commentary': 'paragraph', 'poetry': 'poem'}[s['type']]
                if paras:
                    blocks.append(make_block(prefix + '1', kind, paras, sorted(set(pages)), old.get(s['type'], '')))
            if blocks:
                hs['sections'].append({'type': s['type'], 'heading': s['heading'], 'blocks': blocks})
        out['hadiths'].append(hs)
    return out

def worksheet(chunk_title, sections):
    L = [f'# {chunk_title}']
    for sec in sections:
        L.append(f"\n## {sec['type'].upper()}" + (f"  [{sec['heading']['ar']}]" if sec.get('heading') else ''))
        for b in sec['blocks']:
            meta = f"{b['kind']}" + (f" #{b.get('number')}" if b.get('number') is not None else '') + \
                   (f" printed={b.get('printed_number')}" if b.get('printed_number') not in (None, b.get('number')) else '') + \
                   f" pp.{','.join(map(str, b['pages']))}"
            L.append(f"\n### {b['key']}  ({meta})")
            if b.get('old_en') and os.environ.get('SHOW_OLD'):
                L.append('OLD: ' + b['old_en'])
            for pi, p in enumerate(b['paras']):
                if pi:
                    L.append('  --' + ('' if p['kind'] == 'prose' else ' ' + p['kind']))
                elif p['kind'] != 'prose':
                    L.append('  [' + p['kind'] + ']')
                for s in p['segs']:
                    L.append(f"{s['id']}\t{s['ar']}")
    return '\n'.join(L) + '\n'

def main():
    setup_inputs()
    os.makedirs(WORK, exist_ok=True)
    for name, fn in (('fath', build_fath), ('tuhfah', build_tuhfah), ('mujaz', build_mujaz)):
        sk = fn()
        bd = os.path.join(WORK, name)
        os.makedirs(bd, exist_ok=True)
        json.dump(sk, open(os.path.join(bd, 'skel.json'), 'w'), ensure_ascii=False, indent=1)
        nseg = 0
        ws = worksheet(f'{name} front/back matter', [{'type': 'front', 'blocks': sk['front']}, {'type': 'back', 'blocks': sk['back']}])
        open(os.path.join(bd, '00.txt'), 'w').write(ws)
        for h in sk['hadiths']:
            app = APP[str(h['standard_number'])]
            if h.get('old_notes'):
                pass
            title = f"{name} hadith {h['number']} (standard {h['standard_number']}) — {h['topic_en']}\nAPP-TITLE: {app['title']['en']}\nAPP: " + ' '.join(app['en'])
            if h.get('old_notes'):
                title += '\nOLD-NOTES: ' + ' | '.join(h['old_notes'])
            ws = worksheet(title, h['sections'])
            open(os.path.join(bd, f"{h['number']:02d}.txt"), 'w').write(ws)
            for s in h['sections']:
                for b in s['blocks']:
                    for p in b['paras']:
                        nseg += len(p['segs'])
        print(name, 'segments (hadith part):', nseg)

if __name__ == '__main__':
    main()
