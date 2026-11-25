import re, html, json, sys
def parse(path):
    s = open(path, encoding='utf-8').read()
    pages = s.split("<div class='PageText'>")[1:]
    out = []
    for pg in pages:
        m = re.search(r"\(ص: (\d+)\)", pg)
        num = int(m.group(1)) if m else None
        body = re.sub(r"<div class='PageHead'>.*?</div>", '', pg, flags=re.S)
        body = re.sub(r"<hr/>", '', body)
        body = body.replace('</p>', '\n').replace('<p>', '\n')
        body = re.sub(r"<[^>]+>", '', body)
        body = html.unescape(body).replace('‌', '').replace('\xa0', ' ')
        for line in body.split('\n'):
            line = re.sub(r'\s+', ' ', line).strip()
            if line: out.append({'page': num, 't': line})
    return out
if __name__ == '__main__':
    r = parse(sys.argv[1]); json.dump(r, open(sys.argv[2], 'w'), ensure_ascii=False, indent=0)
    print(len(r), 'lines')
