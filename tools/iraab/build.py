#!/usr/bin/env python3
"""Build data/iraab/iraab-al-arbain-al-nawawiyyah.json from a plain-text extraction of
«إعراب الأربعين النووية» by ʿUmar ibn ʿAbdillāh al-ʿUmarī (ketabonline.com/ar/books/12753).

    python3 -I tools/iraab/build.py <path/to/iraab.txt>

The text comes from a PDF extraction, so this script
  * joins paragraphs that a page break split (sometimes in the middle of a «head»),
  * attaches each page footnote "(n) …" to the paragraph that carries its marker "(n)",
  * repairs extraction artifacts: Qurʾān brackets exported as + … " (→ ﴿ … ﴾), × for ﷺ,
    spaces inside words (FIXES), stray page letters, and spacing around punctuation,
  * splits the iʿrāb into one entry per word or phrase («head»: analysis), keeping the
    analysis of a word's parts («الباء»، «الهاء»…) inside that word's entry.
The author's wording is otherwise left exactly as printed. His postal and e-mail contact
details on the title page are not copied, and the printed table of contents is replaced by
the app's own contents list.
"""
import json, os, re, sys, unicodedata

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'iraab', 'iraab-al-arbain-al-nawawiyyah.json')
META = os.path.join(os.path.dirname(__file__), '..', 'meta.json')  # app titles for hadith 1–42

# Spaces the PDF extraction put inside words (checked one by one against the context).
FIXES = [
    ('د مشق', 'دمشق'), ('أقد م', 'أقدم'), ('يد فع', 'يدفع'), ('آخر ه', 'آخره'), ('ر فعه', 'رفعه'),
    ('جر ه', 'جره'), ('تقد يره', 'تقديره'), ('طيبا ت', 'طيبات'), ('د ل عليه', 'دل عليه'),
    ('والتا ء', 'والتاء'), ('ما ض ', 'ماض '), ('خطا ب', 'خطاب'), ('إ عربها', 'إعربها'),
    ('وجا ز', 'وجاز'), ('سبعما ئة', 'سبعمائة'), ('مخا طب', 'مخاطب'), ('فو الله', 'فوالله'),
]
ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر']
TENS = {'العشرون': 20, 'الثلاثون': 30, 'الأربعون': 40}
UNITS_M = ['الحادي', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع']
LETTER_NAMES = {'الباء', 'اللام', 'الواو', 'الفاء', 'الهاء', 'الكاف', 'التاء', 'الياء', 'النون', 'الميم',
                'الألف', 'السين', 'الهمزة', 'الهمز', 'نا', 'ناء', 'هم', 'ها', 'هما', 'كم', 'كما', 'ي', 'ك', 'ه',
                'الضمير', 'الجملة', 'الجار والمجرور', 'الجار', 'المجرور'}

def hadith_number(line):
    """'الحديث الحادي والعشرون' → 21; None if the line is not a hadith heading."""
    s = re.sub(r'\s+', ' ', line.replace('…', '').strip())
    m = re.fullmatch(r'الحديث (.+)', s)
    if not m or len(s) > 40:
        return None
    w = m.group(1).replace('و ال', 'وال')
    if w in ORDINALS:
        return ORDINALS.index(w) + 1
    if w in TENS:
        return TENS[w]
    m2 = re.fullmatch(r'(\S+) عشر', w)
    if m2 and m2.group(1) in UNITS_M:
        return 10 + UNITS_M.index(m2.group(1)) + 1
    m3 = re.fullmatch(r'(\S+) و(العشرون|الثلاثون|الأربعون)', w)
    if m3 and m3.group(1) in UNITS_M:
        return TENS[m3.group(2)] + UNITS_M.index(m3.group(1)) + 1
    return None


def clean(s):
    s = unicodedata.normalize('NFC', s).replace('‌', '').replace('‏', '').replace('‎', '')
    # Qurʾān brackets: the PDF exported ﴿ as "+" and ﴾ as '"'; a leftover '"' at the end is a stray.
    s = re.sub(r'\+\s*([^"+]*?)\s*"', lambda m: '﴿' + m.group(1).strip() + '﴾', s)
    s = re.sub(r'"\s*$', '', s)
    s = s.replace('×', 'ﷺ')
    for a, b in FIXES:
        s = s.replace(a, b)
    return re.sub(r'[ \t]+', ' ', s).strip()


def tidy(s):
    """Typographic spacing only: no space before . ، : ؛ ? ! or inside « », one space after."""
    s = re.sub(r'«\s+', '«', s)
    s = re.sub(r'\s+»', '»', s)
    s = re.sub(r'\s+([.،,:؛؟!)\]])', r'\1', s)
    s = re.sub(r'([(\[])\s+', r'\1', s)
    s = re.sub(r'([.،:؛؟!])(?=[^\s.،:؛؟!»)\]\d"])', r'\1 ', s)
    s = re.sub(r'»(?=[^\s.،:؛؟!»)\](])', '» ', s)
    s = re.sub(r'(?<=[^\s«(\[])«', ' «', s)
    s = re.sub(r'\.(\s*\.)+', lambda m: '…' if m.group(0).count('.') >= 2 else '.', s)
    return re.sub(r'\s+', ' ', s).strip()


def norm(s):
    s = re.sub(r'[ً-ْٰـ]', '', s)
    s = re.sub(r'\(\d+\)|\d', '', s)
    s = s.translate(str.maketrans('أإآٱىة', 'اااايت'))
    return re.sub(r'[^ء-ي ]', '', s).strip()


TERMINAL = ('.', '؟', '!', '…')


def read_paragraphs(lines):
    """Yield ('para'|'note'|'heading'|'sep'|'iraab'|'end'|'refs', payload) with page-break joins done."""
    out = []
    last_note = False
    one_per_line = False  # the bibliography: one title per line
    for raw in lines:
        line = clean(raw)
        if not line or line in ('ج', '['):
            continue
        if line == '* * *':
            out.append(['sep', None]); last_note = False; continue
        n = hadith_number(line)
        if n:
            out.append(['heading', n]); last_note = False; continue
        if line == 'إعراب الحديث':
            out.append(['iraab', None]); last_note = False; continue
        if line in ('تم بحمد الله', 'المصادر والمراجع'):
            out.append(['end' if line.startswith('تم') else 'refs', line]); last_note = False
            one_per_line = line.startswith('المصادر')
            continue
        m = re.match(r'^\((\d+)\)\s*(.*)$', line)
        if m:
            out.append(['note', [int(m.group(1)), m.group(2)]]); last_note = True; continue
        if last_note and line.startswith('(') and not re.match(r'^\(\d+\)', line):
            out[-1][1][1] += ' ' + line  # a footnote that ran onto a second line
            continue
        last_note = False
        # page-break continuation of the previous paragraph?
        j = len(out) - 1
        while j >= 0 and out[j][0] == 'note':
            j -= 1
        prev = out[j] if j >= 0 and out[j][0] == 'para' else None
        if prev and not one_per_line:
            p = prev[1]
            cont = (line[0] in ':»؛.،' or p.endswith('«')
                    # a sentence cut by the page break (short lines — names, dates — stand alone)
                    or (len(p) >= 50 and not p.endswith(TERMINAL) and not p.endswith(('»', ':'))
                        and not line.startswith(('«', '*')) and not p.startswith('*'))
                    # a «head»: whose analysis moved to the next page
                    or (re.search(r'(»\s*|«[^»]{0,40}):$', p) and not line.startswith('«')))
            if cont:
                prev[1] = p + ' ' + line
                continue
        out.append(['para', line])
    return out


def attach_notes(stream):
    """Turn the stream into paragraphs [{text, notes}] with each footnote on its marker's paragraph."""
    paras = []  # dicts with keys: kind, text, notes, ctx
    for kind, val in stream:
        if kind == 'para':
            paras.append({'kind': 'para', 'text': val, 'notes': []})
        elif kind == 'note':
            n, txt = val
            target = None
            for p in reversed(paras):
                if p['kind'] != 'para':
                    continue
                used = sum(1 for x in p['notes'] if x['n'] == n)
                if p['text'].count(f'({n})') > used:  # one page can restart the numbering, so count
                    target = p
                    break
            if target is None:
                target = next(p for p in reversed(paras) if p['kind'] == 'para')
                target['notes'].append({'n': None, 'ar': tidy(txt)})
            else:
                target['notes'].append({'n': n, 'ar': tidy(txt)})
        else:
            paras.append({'kind': kind, 'val': val})
    return paras


# A head is «word»: — or, as the author sometimes typed it, «word: (no closing guillemet) or
# «word» analysis… (no colon) at the start of a paragraph or right after a full stop or comma.
HEAD = re.compile(r'"?«(?:(?P<a>[^«»]{1,80}?)»\s*(?P<am>\(\d+\))?\s*:|(?P<b>[^«»:.،]{1,40}?)\s*:)')
HEAD_NC = re.compile(r'(?:^|(?<=[.،] ))"?«(?P<c>[^«»]{1,160}?)»\s*(?P<cm>\(\d+\))?(?=\s+[^\s:])')


def find_heads(text):
    found = []
    for m in HEAD.finditer(text):
        found.append((m.start(), m.end(), m.group('a') or m.group('b'), m.group('am') or ''))
    for m in HEAD_NC.finditer(text):
        if not any(a <= m.start() < b for a, b, _, _ in found):
            found.append((m.start(), m.end(), m.group('c'), m.group('cm') or ''))
    return sorted(found)


def is_part(x, head):
    nx, nh = norm(x), norm(head)
    if not nx:
        return True
    if nx in {norm(w) for w in LETTER_NAMES} or re.sub(r'^و', '', nx) in {norm(w) for w in LETTER_NAMES}:
        return True
    if nx in ('و', 'ف'):
        return False  # a lone conjunction belongs to the next word, not this one
    bare = re.sub(r'^[وف]', '', nx)
    return nx in nh or (bare and bare in nh)


def split_entries(text):
    """'«بالنيات»: «الباء»: حرف جر. «النيات»: …' → [{'head', 'ar'}], one per word or phrase."""
    heads = find_heads(text)
    if not heads:
        return None
    if heads[0][0] > 2 and not text.startswith('من قوله'):
        return None  # prose (a quotation, a remark): kept whole
    if heads[0][0] > 2:  # «من قوله ﷺ: «لا تحاسدوا» إلى قوله: «تدابروا»: …» — a range, then entries
        lead = text[:heads[0][0]].strip()
        rest = split_entries(text[heads[0][0]:])
        return [{'head': None, 'markers': [], 'ar': tidy(lead)}] + rest
    tops = [heads[0]]
    for h in heads[1:]:
        right_after = not text[tops[-1][1]:h[0]].strip(' "')  # «تراه»: «ترى»: … — the base form of the same word
        if not right_after and not is_part(h[2], tops[-1][2]):
            tops.append(h)
    items = []
    for k, (start, end_head, head_raw, mark) in enumerate(tops):
        end = tops[k + 1][0] if k + 1 < len(tops) else len(text)
        head = re.sub(r'\(\d+\)', '', head_raw).strip()
        marker = re.findall(r'\(\d+\)', head_raw + mark)
        body = text[end_head:end].strip()
        items.append({'head': tidy(head), 'markers': marker, 'ar': tidy(body)})
    # «و»: حرف عطف. «جعلته»: … — the conjunction is the first letter of the next word: keep them together
    merged = []
    for k, it in enumerate(items):
        if norm(it['head']) in ('و', 'ف') and k + 1 < len(items):
            nxt = items[k + 1]
            nxt['ar'] = tidy(f"«{it['head']}»: {it['ar']} {nxt['ar']}")
            nxt['markers'] = it['markers'] + nxt['markers']
            continue
        merged.append(it)
    return merged


def distribute(items, notes):
    for it in items:
        it['notes'] = []
    for nt in notes:
        tgt = None
        if nt['n'] is not None:
            mk = f"({nt['n']})"
            for it in items:
                have = it['ar'].count(mk) + it.get('markers', []).count(mk)
                if have > sum(1 for x in it['notes'] if x['n'] == nt['n']):
                    tgt = it
                    break
        (tgt or items[-1])['notes'].append(nt)
    for it in items:
        it.pop('markers', None)
        if not it['notes']:
            del it['notes']
    return items


def para_obj(p):
    o = {'ar': tidy(p['text'])}
    if p['notes']:
        o['notes'] = p['notes']
    return o


def main(src):
    lines = open(src, encoding='utf-8').read().split('\n')
    # skip the title page, contact details and printed contents: the body starts at the second «المقدمة»
    starts = [i for i, l in enumerate(lines) if l.strip() == 'المقدمة']
    body = lines[starts[-1] + 1:]
    stream = read_paragraphs(body)
    paras = attach_notes(stream)

    app = {int(k): v for k, v in json.load(open(META, encoding='utf-8'))['hadith'].items()}
    front, hadiths, back, refs = [], [], [], []
    cur, state = None, 'front'
    for p in paras:
        k = p['kind']
        if k == 'heading':
            n = p['val']
            cur = {'id': f'h{n:02d}', 'number': n, 'standard_number': n,
                   'heading': {'ar': '', 'en': f'Hadith {n}'},
                   'text': [], 'iraab': []}
            hadiths.append(cur); state = 'text'; continue
        if k == 'iraab':
            state = 'iraab'; continue
        if k == 'sep':
            continue
        if k == 'end':
            state = 'back'; back.append({'ar': p['val']}); continue
        if k == 'refs':
            state = 'refs'; continue
        if state == 'front':
            front.append(para_obj(p))
        elif state == 'text':
            cur['text'].append(para_obj(p))
        elif state == 'iraab':
            items = split_entries(p['text'])
            if items is None:
                t = tidy(p['text'])
                kind = 'label' if t.startswith('*') or (t.endswith(':') and len(t) < 90) else 'note'
                it = {'kind': kind, 'ar': t.lstrip('* ').strip() if kind == 'label' else t}
                if p['notes']:
                    it['notes'] = p['notes']
                cur['iraab'].append(it)
            else:
                cur['iraab'].extend({'kind': 'entry' if it['head'] else 'note', **{k: v for k, v in it.items() if k != 'head' or v}}
                                    for it in distribute(items, p['notes']))
        elif state == 'back':
            back.append(para_obj(p))
        elif state == 'refs':
            refs.append(tidy(p['text']))

    # a lone «و»/«ف» that ended a paragraph belongs to the first word of the next one
    for h in hadiths:
        items = h['iraab']
        for k in range(len(items) - 2, -1, -1):
            it, nxt = items[k], items[k + 1]
            if it['kind'] == 'entry' and nxt['kind'] == 'entry' and norm(it['head']) in ('و', 'ف'):
                nxt['ar'] = tidy(f"«{it['head']}»: {it['ar']} {nxt['ar']}")
                if it.get('notes'):
                    nxt['notes'] = it['notes'] + nxt.get('notes', [])
                del items[k]

    # printed headings and the app's titles
    heads = {}
    for raw in body:
        n = hadith_number(clean(raw))
        if n and n not in heads:
            heads[n] = re.sub(r'\s+', ' ', clean(raw).replace('…', '').replace('و ال', 'وال')).strip()
    for h in hadiths:
        h['heading']['ar'] = heads[h['number']]
        if h['number'] in app:
            h['title'] = app[h['number']]['title']
        h['collection'] = 'nawawi'

    data = {
        'schema': 'arbaeen.iraab', 'schema_version': '1.0', 'id': 'iraab-al-arbain-al-nawawiyyah',
        'book': {
            'title': {'ar': 'إعراب الأربعين النووية', 'en': 'Iʿrāb al-Arbaʿīn al-Nawawiyyah'},
            'subtitle': {'ar': 'إعراب الأحاديث الاثنين والأربعين', 'en': 'A word-by-word grammatical analysis of al-Nawawī’s forty-two hadiths'},
            'author': {'ar': 'عمر بن عبد الله بن عمر العُمري', 'en': 'ʿUmar ibn ʿAbdillāh ibn ʿUmar al-ʿUmarī'},
            'completed': {'ar': '7 ذي الحجة 1425هـ', 'en': '7 Dhū al-Ḥijjah 1425 AH'},
            'rights': {'ar': 'كل الحقوق محفوظة', 'en': 'All rights reserved (as printed on the title page)'},
            'language': 'ar',
            'source': {
                'platform': 'Jāmiʿ al-Kutub al-Islāmiyyah (ketabonline.com)',
                'url': 'https://ketabonline.com/ar/books/12753',
                'note': 'Not on shamela.ws; ketabonline gives its own source as al-Maktabah al-Shāmilah al-Dhahabiyyah.',
            },
        },
        'notes': [
            'Arabic only: the book is a grammatical analysis in Arabic terminology and is not translated.',
            'Built from a plain-text extraction of the book. Page breaks were joined, footnotes attached to their markers, '
            'Qurʾān brackets (exported as + … ") restored as ﴿ … ﴾, × restored as ﷺ, spaces inside words removed and '
            'spacing around punctuation normalised. The wording is otherwise as printed, including the author’s own slips.',
            'The author’s postal address, e-mail and telephone number on the title page are not copied. The printed '
            'contents list is replaced by the app’s contents.',
            'The introduction mentions a study of wāw al-thamāniyah; it is not part of the text this file was built from.',
            'Each iʿrāb entry is one word or phrase of the hadith («head»: analysis). The analysis of the parts of a word '
            '(«الباء»، «الهاء»…) stays inside that word’s entry. "(n)" in a text marks footnote n of that entry.',
        ],
        'stats': {
            'hadiths': len(hadiths),
            'entries': sum(1 for h in hadiths for it in h['iraab'] if it['kind'] == 'entry'),
            'footnotes': sum(len(x.get('notes', [])) for h in hadiths for x in h['text'] + h['iraab'])
                         + sum(len(x.get('notes', [])) for x in front + back),
        },
        'front_matter': front,
        'hadiths': hadiths,
        'back_matter': back,
        'references': refs,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f"hadiths {len(hadiths)}, entries {data['stats']['entries']}, footnotes {data['stats']['footnotes']} -> {os.path.relpath(OUT)}")
    return data


if __name__ == '__main__':
    main(sys.argv[1])
