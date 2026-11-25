#!/usr/bin/env python3
"""Download the 50 hadith (al-Nawawi's 40 + Ibn Rajab's addition) from
Shaykh ʿAbd al-Muḥsin al-Qāsim's «متون طالب العلم - المستوى الأول» on Shamela
(book 570, pages 71–132) and save them as data/shamela-raw.json.

Usage:  python3 tools/fetch_shamela.py
Then:   python3 tools/build_data.py
"""
import html as H
import json
import os
import re
import time
import urllib.request

BOOK = 570
FIRST, LAST = 71, 132
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'shamela-raw.json')


def fetch(page_id):
    url = f'https://shamela.ws/book/{BOOK}/{page_id}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (hadith-study-app)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')


def paragraphs(page_html):
    m = re.search(r'<div class="nass margin-top-10"[^>]*data-page-num="(\d+)"[^>]*>(.*?)</div>\s*<div id="appended_pages">',
                  page_html, re.S)
    if not m:
        raise ValueError('page text not found')
    page_num, body = int(m.group(1)), m.group(2)
    body = re.sub(r'<a href="#p\d+" class="btn_tag[^"]*"><span[^>]*></span></a>', '', body)
    out = []
    for pm in re.finditer(r'<p( class="hamesh")?>(.*?)</p>', body, re.S):
        t = re.sub(r'<br\s*/?>', '\n', pm.group(2))
        t = H.unescape(re.sub(r'<[^>]+>', '', t)).strip()
        if t:
            out.append(('foot' if pm.group(1) else 'body', t))
    return page_num, out


def main():
    hadiths, cur = [], None
    for pid in range(FIRST, LAST + 1):
        page_num, paras = paragraphs(fetch(pid))
        time.sleep(0.3)
        for kind, t in paras:
            if kind == 'body' and re.match(r'^الحَدِيثُ\s', t):
                cur = {'heading': re.sub(r'\s*\(\S+\)\s*$', '', t), 'pages': [pid], 'page_nums': [page_num],
                       'paras': [], 'foot': []}
                hadiths.append(cur)
                continue
            if pid not in cur['pages']:
                cur['pages'].append(pid)
                cur['page_nums'].append(page_num)
            if kind == 'foot':
                cur['foot'].append(t)
            else:
                cur['paras'].append({'p': pid, 't': t})
        print('page', pid, 'ok')
    for n, h in enumerate(hadiths, 1):
        h['n'] = n
    assert len(hadiths) == 50, len(hadiths)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(hadiths, f, ensure_ascii=False, indent=1)
    print('wrote', OUT)


if __name__ == '__main__':
    main()
