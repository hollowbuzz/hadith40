// Iʿrāb reader: ʿUmar al-ʿUmarī's word-by-word grammatical analysis of al-Nawawī's 42 hadiths.
// Arabic only. The hadith text shows which words have an entry; tapping one opens its iʿrāb.
// Data: data/iraab/iraab-al-arbain-al-nawawiyyah.json (schema "arbaeen.iraab" 1.x), fetched on demand.
import { h, clear, svgIcon, modal } from './ui.js';
import { t, L, num, isAr } from './i18n.js';
import { ar } from './render.js';
import { readerBar } from './sharh.js';
import { sfx } from './sound.js';

export const IRAAB = {
  key: 'iraab', file: 'iraab-al-arbain-al-nawawiyyah', tone: 'gold', count: 42,
  name: { ar: 'إعراب الأربعين النووية', en: 'Iʿrāb al-Arbaʿīn al-Nawawiyyah' },
  author: { ar: 'عمر بن عبد الله العُمري', en: 'ʿUmar ibn ʿAbdillāh al-ʿUmarī' },
  url: 'https://ketabonline.com/ar/books/12753',
};

let loading = null;
export function loadIraab() {
  if (!loading) {
    loading = fetch(`data/iraab/${IRAAB.file}.json`).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
    loading.catch(() => { loading = null; });
  }
  return loading;
}

// ---------------------------------------------------------------- text helpers
const AR = { dir: 'rtl', lang: 'ar' };

/** Arabic text → nodes: sub-heads «الباء»: in bold, ﴿Qurʾān﴾ marked, "(n)" as a footnote number. */
function rich(s, notes = []) {
  const ns = new Set(notes.map(x => x.n).filter(x => x != null));
  return ar(s).split(/(«[^«»]{1,60}»\s*:|﴿[^﴾]*﴾|\(\d+\))/).filter(Boolean).map(part => {
    if (/^«.*:$/.test(part)) return h('strong.ir-sub', part);
    if (part.startsWith('﴿')) return h('span.ir-q', part);
    const m = part.match(/^\((\d+)\)$/);
    if (m && ns.has(+m[1])) return h('sup.ir-fn-mark', num(+m[1]));
    return part;
  });
}
const footnotes = notes => (notes?.length
  ? h('div.ir-fns', notes.map(x => h('p.ir-fn', AR, x.n != null ? h('sup.ir-fn-mark', num(x.n)) : null, ' ', rich(x.ar))))
  : null);

/** Matching key for a word: no vowels, digits or punctuation; hamza/alif and tāʾ marbūṭah folded. */
const fold = s => s.replace(/[ً-ْٰـ]/g, '').replace(/\(\d+\)|\d/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ت').replace(/[^ء-ي]/g, '');

/**
 * Link each entry's head to its words in the hadith text, in order. Returns, for each text token,
 * the index of the entry it opens (or -1). Heads the book repeats («سبق إعرابها») link where they
 * next occur; a head that cannot be found stays unlinked.
 */
function linkWords(tokens, items) {
  const owner = tokens.map(() => -1);
  const keys = tokens.map(tk => fold(tk));
  let cursor = 0;
  const findFrom = (want, from, to) => {
    for (let i = from; i + want.length <= to; i++) {
      let ok = true;
      for (let k = 0, j = i; k < want.length; k++, j++) {
        while (j < keys.length && !keys[j]) j++; // skip punctuation-only tokens
        // the book often parses a leading و/ف on its own («و» then «لا ضرار» for «ولا ضرار»)
        const same = keys[j] === want[k] || (k === 0 && want[k].length > 1 && (keys[j] === 'و' + want[k] || keys[j] === 'ف' + want[k]));
        if (!same) { ok = false; break; }
      }
      if (ok) return i;
    }
    return -1;
  };
  items.forEach((it, idx) => {
    if (it.kind !== 'entry') return;
    const want = it.head.split(/\s+/).map(fold).filter(Boolean);
    if (!want.length) return;
    let at = findFrom(want, cursor, Math.min(keys.length, cursor === 0 ? keys.length : cursor + 40));
    const forward = at >= 0;
    if (!forward) at = findFrom(want, 0, keys.length);
    if (at < 0) return;
    let j = at, got = 0;
    while (got < want.length && j < keys.length) {
      if (keys[j]) { if (owner[j] < 0) owner[j] = idx; got++; }
      j++;
    }
    if (forward) cursor = j;
  });
  return owner;
}

// ---------------------------------------------------------------- chapter
function sectionHead(arText, enText) {
  return h('h3.cm-h' + (isAr() ? '' : '.both'), AR,
    h('span.cm-h-ar', arText), isAr() ? null : h('span.cm-h-en', { dir: 'ltr', lang: 'en' }, enText));
}

function entryEl(it, idx) {
  if (it.kind === 'label') return h('h4.ir-label', { ...AR, 'data-k': 'i' + idx }, rich(it.ar, it.notes), footnotes(it.notes));
  if (it.kind === 'note') return h('div.ir-note', { ...AR, 'data-k': 'i' + idx }, h('p', rich(it.ar, it.notes)), footnotes(it.notes));
  return h('div.ir-item', { ...AR, 'data-k': 'i' + idx, id: 'ir-' + idx },
    h('div.ir-head', ar(it.head)),
    h('div.ir-body', rich(it.ar, it.notes), footnotes(it.notes)));
}

/** Bottom sheet for one entry, with previous/next through the entries in order. */
function openSheet(items, idx, words) {
  const entries = items.map((it, i) => (it.kind === 'entry' ? i : -1)).filter(i => i >= 0);
  const box = h('div.ir-sheet-in');
  let close = null;
  const paint = i => {
    idx = i;
    const it = items[i];
    const pos = entries.indexOf(i);
    words.forEach(w => w.classList.toggle('on', +w.dataset.e === i));
    const go = d => () => { const n = entries[pos + d]; if (n != null) { sfx.tap?.(); paint(n); } };
    clear(box).append(
      h('div.ir-sheet-top', h('small.muted', t('ir.of', { i: pos + 1, n: entries.length })),
        h('button.icon-btn.small', { type: 'button', 'aria-label': t('btn.close'), onclick: () => close() }, svgIcon('x', 18))),
      h('div.ir-head', AR, ar(it.head)),
      h('div.ir-body', AR, rich(it.ar, it.notes), footnotes(it.notes)),
      h('div.ir-nav',
        h('button.btn.ghost', { type: 'button', disabled: pos <= 0, onclick: go(-1) }, svgIcon('prev', 18), h('span', t('ir.prev'))),
        h('button.btn.ghost', { type: 'button', disabled: pos >= entries.length - 1, onclick: go(1) }, h('span', t('ir.next')), svgIcon('next', 18))));
  };
  // Arabic reads right to left: the left arrow moves to the next word.
  box.addEventListener('keydown', e => {
    const pos = entries.indexOf(idx);
    const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    const n = entries[pos + step];
    if (step && n != null) { e.preventDefault(); paint(n); }
  });
  paint(idx);
  close = modal(box, { cls: 'sheet ir-sheet' });
}

function renderChapter(ch) {
  const art = h('article.cm.ir', AR);
  art.append(h('h2.cm-h' + (isAr() ? '' : '.both'), AR, h('span.cm-h-ar', ar(ch.heading.ar)),
    isAr() ? null : h('span.cm-h-en', { dir: 'ltr', lang: 'en' }, ch.heading.en)));

  // the hadith as the book quotes it, its words linked to their entries
  const paras = ch.text.map(p => ar(p.ar).split(/(\s+)/));
  const flat = paras.flat().filter(tk => !/^\s+$/.test(tk));
  const owner = linkWords(flat, ch.iraab);
  const words = [];
  let w = 0;
  const box = h('section.ir-text', ch.text.map((p, pi) => h('div',
    h('p', paras[pi].map(tk => {
      if (/^\s+$/.test(tk)) return tk;
      const e = owner[w++];
      if (e < 0) return markFn(tk, p.notes);
      const el = h('span.ir-w', {
        role: 'button', tabindex: 0, 'data-e': e,
        onclick: () => openSheet(ch.iraab, e, words),
        onkeydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openSheet(ch.iraab, e, words); } },
      }, markFn(tk, p.notes));
      words.push(el);
      return el;
    })),
    footnotes(p.notes))));
  art.append(box, h('p.ir-hint', { dir: isAr() ? 'rtl' : 'ltr' }, t('ir.tap')));

  art.append(sectionHead('إعراب الحديث', 'Iʿrāb of the hadith'), h('div.ir-list', ch.iraab.map(entryEl)));
  return art;
}
const markFn = (tk, notes) => (/\(\d+\)/.test(tk) ? rich(tk, notes) : tk);

// ---------------------------------------------------------------- hadith page tab
export function iraabTab(n) {
  const box = h('div.iraab');
  if (n > IRAAB.count) {
    box.append(h('p.cm-loading.muted', t('ir.only42', { n })));
    return box;
  }
  const info = h('div.cm-info',
    h('span', L(IRAAB.name), ' · ', L(IRAAB.author)),
    h('a.cm-about', { href: '#/book/iraab' }, t('sh.about'), svgIcon('chev', 14)));
  const content = h('div.cm-content');
  let chapter = null;
  const paint = () => { clear(content); if (chapter) content.append(renderChapter(chapter), foot()); };
  const load = async () => {
    clear(content).append(h('p.cm-loading.muted', t('ir.loading')));
    let data;
    try { data = await loadIraab(); } catch {
      clear(content).append(h('div.cm-loading', h('p.muted', t('ir.error')),
        h('button.btn.small.ghost', { type: 'button', onclick: load }, t('btn.retry'))));
      return;
    }
    chapter = data.hadiths.find(x => x.standard_number === n);
    paint();
  };
  box.append(info, readerBar(content, paint, { modes: false, hint: t('ir.arabicOnly') }), content);
  load();
  return box;
}

const foot = () => h('footer.cm-foot',
  h('p', L(IRAAB.name), ' — ', L(IRAAB.author), '. ', h('a', { href: IRAAB.url, target: '_blank', rel: 'noopener' }, 'ketabonline.com'), '.'));

// ---------------------------------------------------------------- book page (#/book/iraab)
export function iraabBookView(el) {
  el.append(h('div.hd-top', h('a.icon-btn', { href: '#/library', 'aria-label': t('btn.back') }, svgIcon('back', 24))));
  el.append(h('header.bk-head.' + IRAAB.tone,
    h('div.bk-ico', svgIcon('book', 32)),
    h('div', h('h1', L(IRAAB.name)), h('div.muted', L(IRAAB.author)))));
  const body = h('div');
  el.append(body);
  const paint = async () => {
    clear(body).append(h('p.cm-loading.muted', t('ir.loading')));
    let data;
    try { data = await loadIraab(); } catch {
      clear(body).append(h('div.cm-loading', h('p.muted', t('ir.error')),
        h('button.btn.small.ghost', { type: 'button', onclick: paint }, t('btn.retry'))));
      return;
    }
    if (!body.isConnected) return;
    const b = data.book;
    const fact = (label, value) => [h('dt', label), h('dd', value)];
    const prose = blocks => h('article.cm.ir', AR, blocks.map((p, i) => h('div', { 'data-k': 'p' + i },
      h('p.cm-p', AR, rich(p.ar, p.notes)), footnotes(p.notes))));
    const more = (title, content, open = false) => h('details.cm-more', { open }, h('summary', title), h('div.cm-more-body', content));
    const toc = h('div.toc', data.hadiths.map(x => h('a.toc-row', { href: `#/h/${x.standard_number}/iraab` },
      h('span.toc-num', num(x.number)),
      h('span.toc-body', h('strong', L(x.title || x.heading)), h('small.ar', AR, x.heading.ar)),
      h('small.muted.toc-pg', t('ir.entries', { n: x.iraab.filter(it => it.kind === 'entry').length })))));
    const scope = h('div',
      more(t('sh.intro'), prose(data.front_matter)),
      h('h2.toc-title', t('sh.contents')), toc,
      more(t('sh.conclusion'), prose(data.back_matter)),
      more(t('ir.refs'), h('ol.ir-refs', AR, data.references.map(r => h('li', r)))),
      more(t('ir.edition'), h('div', { dir: 'ltr', lang: 'en' }, h('ul', data.notes.map(x => h('li', x))))));
    clear(body).append(
      h('p.bk-title', L(b.subtitle)),
      h('dl.bk-facts',
        fact(t('sh.author'), L(b.author)),
        fact(t('ir.completed'), L(b.completed)),
        fact(t('ir.rights'), L(b.rights)),
        fact(t('ir.source'), h('a', { href: b.source.url, target: '_blank', rel: 'noopener' }, 'ketabonline.com ↗'))),
      readerBar(scope, () => {}, { sticky: false, modes: false, hint: t('ir.arabicOnly') }), scope);
  };
  paint();
}

export const iraabCard = () => h('a.bookcard.' + IRAAB.tone, { href: '#/book/iraab' },
  h('span.bookcard-ico', svgIcon('book', 22)),
  h('span.bookcard-body', h('strong', L(IRAAB.name)), h('small', L(IRAAB.author))));
