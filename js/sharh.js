// Commentary reader: three commentaries on the Forty, each readable as Arabic only,
// English only, or Arabic with its English directly beneath every sentence.
// Data: data/commentaries/<file>.json (schema "arbaeen.commentary" 2.x), fetched on demand.
import { state, setSetting } from './store.js';
import { h, clear, svgIcon } from './ui.js';
import { t, L, num, isAr } from './i18n.js';
import { ar } from './render.js';

// `numbers`: which block field carries a number the author printed
// (Fatḥ al-Qawī numbers its commentary paragraphs; the other two number only their lessons).
export const BOOKS = [
  {
    key: 'fath', file: 'fath-al-qawi-al-matin', tone: 'green', numbers: 'number', shamela: 11325,
    pub: { ar: 'دار ابن القيم، الدمام، ط1، 1424هـ', en: 'Dār Ibn al-Qayyim, Dammam, 1st ed., 1424 AH' },
    name: { ar: 'فتح القوي المتين', en: 'Fatḥ al-Qawī al-Matīn' }, short: { ar: 'فتح القوي', en: 'Fatḥ al-Qawī' },
    author: { ar: 'عبد المحسن العبّاد', en: 'ʿAbd al-Muḥsin al-ʿAbbād' }, by: { ar: 'العبّاد', en: 'al-ʿAbbād' },
  },
  {
    key: 'tuhfah', file: 'al-tuhfah-al-rabbaniyyah', tone: 'blue', numbers: 'printed_number', shamela: 4469,
    pub: { ar: 'دار نشر الثقافة، الإسكندرية، ط1، 1380هـ', en: 'Dār Nashr al-Thaqāfah, Alexandria, 1st ed., 1380 AH' },
    name: { ar: 'التحفة الربانية', en: 'al-Tuḥfah al-Rabbāniyyah' }, short: { ar: 'التحفة', en: 'al-Tuḥfah' },
    author: { ar: 'إسماعيل الأنصاري', en: 'Ismāʿīl al-Anṣārī' }, by: { ar: 'الأنصاري', en: 'al-Anṣārī' },
  },
  {
    key: 'mujaz', file: 'al-sharh-al-mujaz-al-mufid', tone: 'purple', numbers: 'printed_number', shamela: 8713,
    pub: { ar: 'الجامعة الإسلامية، المدينة المنورة، ط3، 1404هـ', en: 'The Islamic University, Madīnah, 3rd ed., 1404 AH' },
    name: { ar: 'الشرح الموجز المفيد', en: 'al-Sharḥ al-Mūjaz al-Mufīd' }, short: { ar: 'الموجز', en: 'al-Mūjaz' },
    author: { ar: 'عبد الله المحسن', en: 'ʿAbdullāh al-Muḥsin' }, by: { ar: 'المحسن', en: 'al-Muḥsin' },
  },
  {
    // the long one: split per chapter (index.json + hNN.json), English added in batches
    key: 'jami', file: 'jami-al-ulum-wal-hikam', split: true, tone: 'gold', numbers: 'number', shamela: 949,
    pub: { ar: 'دار ابن كثير، ط1، 1429هـ، تحقيق ماهر الفحل', en: 'Dār Ibn Kathīr, 1st ed., 1429 AH, ed. Māhir al-Faḥl' },
    name: { ar: 'جامع العلوم والحكم', en: 'Jāmiʿ al-ʿUlūm wa-l-Ḥikam' }, short: { ar: 'جامع العلوم', en: 'Jāmiʿ al-ʿUlūm' },
    author: { ar: 'ابن رجب الحنبلي', en: 'Ibn Rajab al-Ḥanbalī' }, by: { ar: 'ابن رجب', en: 'Ibn Rajab' },
  },
];
export const MODES = ['ar', 'en', 'both'];

export const shamelaUrl = id => `https://shamela.ws/book/${id}`;
export const bookInfo = key => BOOKS.find(b => b.key === key) || BOOKS[0];
export const currentBook = () => bookInfo(state.settings.sharhBook);
export const currentMode = () => (MODES.includes(state.settings.sharhMode) ? state.settings.sharhMode : 'both');

// ---------------------------------------------------------------- loading
const loaded = new Map();
const getJSON = url => fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
/** The whole book — or, for a split book, its index (book, translation, front/back matter, chapter list). */
export function loadBook(key) {
  let p = loaded.get(key);
  if (!p) {
    const b = bookInfo(key);
    p = getJSON(b.split ? `data/commentaries/${b.file}/index.json` : `data/commentaries/${b.file}.json`);
    p.catch(() => loaded.delete(key)); // let a retry fetch again
    loaded.set(key, p);
  }
  return p;
}
/** One chapter (by the app's hadith number), with its sections. */
export async function loadChapter(key, n) {
  const data = await loadBook(key);
  const meta = data.hadiths.find(x => x.standard_number === n);
  if (!meta || !bookInfo(key).split) return meta || null;
  const ck = `${key}:${meta.id}`;
  if (!loaded.has(ck)) {
    const p = getJSON(`data/commentaries/${bookInfo(key).file}/${meta.id}.json`);
    p.catch(() => loaded.delete(ck));
    loaded.set(ck, p);
  }
  return loaded.get(ck);
}

// ---------------------------------------------------------------- rendering
// Headings for sections the book prints without one (shown in the reading language, like the text).
const FALLBACK = {
  commentary: { ar: 'الشرح', en: 'Commentary' },
  vocabulary: { ar: 'المفردات', en: 'Vocabulary' },
  benefits: { ar: 'الفوائد', en: 'Benefits' },
  poetry: { ar: 'شعر', en: 'Poetry' },
};
const DIR = { ar: 'rtl', en: 'ltr' };
const langAttrs = lng => ({ dir: DIR[lng], lang: lng });
const txt = (s, lng) => (lng === 'ar' ? ar(s) : s);

/** "Term: explanation" → the term in bold (vocabulary entries; English glosses run longer than Arabic terms). */
function withTerm(s, lng) {
  const m = s.match(/^([^:]{1,90}):\s*/);
  if (!m || m[1].trim().split(/\s+/).length > (lng === 'ar' ? 7 : 14)) return [s];
  return [h('strong.cm-term', m[1].trim() + ':'), ' ', s.slice(m[0].length)];
}
const words = (seg, lng, vocab) => (vocab ? withTerm(txt(seg[lng], lng), lng) : [txt(seg[lng], lng)]);

const hemistichs = (s, lng) => (lng === 'ar' ? s.split(/\s*…\s*/) : s.split(/\s+\/\s+/)).filter(Boolean);
const bayt = (seg, lng, attrs = {}) =>
  h('div.bayt', { ...langAttrs(lng), ...attrs }, hemistichs(txt(seg[lng], lng), lng).map(x => h('span.hemi', x)));

function renderPara(p, key, mode, vocab) {
  const k = si => `${key}:${si}`;
  // A segment not yet translated (en: null) shows its Arabic in English mode, and no English line in both.
  const untr = s => s.en == null;
  if (mode === 'en' && p.segments.every(untr)) mode = 'ar';
  if (mode !== 'both') {
    const lng = mode;
    if (p.kind === 'verse') return h('div.cm-verse', langAttrs(lng), p.segments.map((s, si) => bayt(s, untr(s) ? 'ar' : lng, { 'data-k': k(si) })));
    if (p.kind === 'label') return h('p.cm-label', langAttrs(lng), txt(p.segments.map(s => s[lng] ?? s.ar).join(' '), lng));
    return h('p.cm-p', langAttrs(lng), p.segments.map((s, si) => [si ? ' ' : '', lng === 'en' && untr(s)
      ? h('span.cm-s.cm-untr', { 'data-k': k(si), dir: 'rtl', lang: 'ar' }, ar(s.ar))
      : h('span.cm-s', { 'data-k': k(si) }, words(s, lng, vocab))]));
  }
  // Arabic + English: each segment is a pair, the English directly beneath its Arabic.
  return h('div.cm-pairs' + (p.kind === 'prose' ? '' : '.' + p.kind), p.segments.map((s, si) => {
    if (p.kind === 'verse') return h('div.cm-pair', { 'data-k': k(si) }, bayt(s, 'ar'), untr(s) ? null : h('div.cm-en', langAttrs('en'), bayt(s, 'en')));
    const cls = p.kind === 'label' ? '.cm-label' : '';
    return h('div.cm-pair', { 'data-k': k(si) },
      h('p.cm-ar' + cls, langAttrs('ar'), words(s, 'ar', vocab)),
      untr(s) ? null : h('p.cm-en' + cls, langAttrs('en'), words(s, 'en', vocab)));
  }));
}

const noteEls = notes => (notes || []).map(nt => h('div.note.cm-note', langAttrs('en'), h('strong', 'Translator’s note: '), nt.en));

function renderBlock(b, mode, { vocab = false, n = null } = {}) {
  const body = h('div.cm-body', b.paragraphs.map((p, pi) => renderPara(p, `${b.id}:${pi}`, mode, vocab)), noteEls(b.notes));
  return h('div.cm-block' + (n != null ? '.numbered' : ''), { 'data-id': b.id }, n != null ? h('span.cm-num', num(n)) : null, body);
}

function headingEl(head, mode, tag = 'h3', badge = null) {
  const b = badge != null ? h('span.cm-num', num(badge)) : null;
  if (mode === 'both') {
    return h(tag + '.cm-h.both', h('span.cm-h-ar', langAttrs('ar'), b, ar(head.ar)), h('span.cm-h-en', langAttrs('en'), head.en));
  }
  return h(tag + '.cm-h', langAttrs(mode), b, h('span.cm-h-' + mode, txt(head[mode], mode)));
}

function renderSection(sec, book, mode) {
  const numbered = sec.type === 'commentary' || sec.type === 'benefits';
  const blocks = sec.blocks.map(b => renderBlock(b, mode, {
    vocab: sec.type === 'vocabulary',
    n: numbered ? b[book.numbers] ?? null : null,
  }));
  if (sec.type === 'hadith') return h('section.cm-sec.cm-hadith', blocks);
  return h('section.cm-sec.cm-' + sec.type, headingEl(sec.heading || FALLBACK[sec.type], mode, 'h3', sec.number ?? null), blocks);
}

/** One hadith's chapter from a commentary. */
export function renderChapter(bh, book, mode) {
  const done = bh.translated ?? 1; // share of segments with English (books translated in batches)
  if (done === 0 && mode !== 'ar') mode = 'ar';
  const art = h('article.cm.cm-mode-' + mode, { dir: mode === 'en' ? 'ltr' : 'rtl' }, headingEl(bh.heading, mode, 'h2'));
  if (done < 1) art.append(h('p.note.cm-progress', { dir: isAr() ? 'rtl' : 'ltr' }, done === 0 ? t('sh.enSoon') : t('sh.enPartial', { p: Math.round(done * 100) })));
  for (const sec of bh.sections) {
    art.append(renderSection(sec, book, mode));
    if (sec.type === 'hadith' && bh.notes) art.append(...noteEls(bh.notes));
  }
  return art;
}

/** Front or back matter: a flat list of blocks. */
export function renderMatter(blocks, mode) {
  return h('article.cm.cm-mode-' + mode, { dir: mode === 'en' ? 'ltr' : 'rtl' }, blocks.map(b => renderBlock(b, mode)));
}

// ---------------------------------------------------------------- controls
/**
 * Re-render while keeping the reader's place: the first sentence visible below the
 * sticky bar stays at the same height on screen after the switch.
 */
function keepPlace(scope, bar, repaint) {
  const top = bar.getBoundingClientRect().bottom;
  let key = null, off = 0;
  for (const el of scope.querySelectorAll('[data-k]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > top + 4) { key = el.dataset.k; off = r.top; break; }
  }
  repaint();
  const el = key && scope.querySelector(`[data-k="${CSS.escape(key)}"]`);
  if (el) window.scrollBy(0, el.getBoundingClientRect().top - off);
}

/** Sticky bar: reading mode (unless `modes` is false) + text size. `repaint` redraws everything inside `scope`. */
export function readerBar(scope, repaint, { sticky = true, modes: withModes = true, hint = null } = {}) {
  const bar = h('div.cm-bar' + (sticky ? '' : '.static'));
  const modes = h('div.seg.cm-modes', { role: 'radiogroup', 'aria-label': t('sh.mode') }, MODES.map(m => h('button.seg-btn', {
    type: 'button', role: 'radio', 'data-m': m,
    onclick: () => {
      if (m === currentMode()) return;
      setSetting('sharhMode', m);
      mark();
      keepPlace(scope, bar, repaint);
    },
  }, t('sh.mode.' + m))));
  const mark = () => modes.querySelectorAll('.seg-btn').forEach(b => {
    const on = b.dataset.m === currentMode();
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  const size = d => () => {
    const v = Math.max(18, Math.min(44, state.settings.arSize + d));
    setSetting('arSize', v);
    keepPlace(scope, bar, () => document.documentElement.style.setProperty('--ar-size', v + 'px'));
  };
  mark();
  bar.append(withModes ? modes : h('span.cm-bar-hint', hint), h('div.grow'),
    h('div.sizebtns', { role: 'group', 'aria-label': t('hd.size') },
      h('button.icon-btn.small', { type: 'button', onclick: size(-2), 'aria-label': t('sh.smaller') }, 'A−'),
      h('button.icon-btn.small', { type: 'button', onclick: size(2), 'aria-label': t('sh.larger') }, 'A+')));
  return bar;
}

function bookPicker(onPick) {
  const wrap = h('div.bookpick', { role: 'radiogroup', 'aria-label': t('sh.book') });
  const mark = () => wrap.querySelectorAll('.bookpick-btn').forEach(b => {
    const on = b.dataset.key === currentBook().key;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  BOOKS.forEach(b => wrap.append(h('button.bookpick-btn.' + b.tone, {
    type: 'button', role: 'radio', 'data-key': b.key, title: `${L(b.name)} — ${L(b.author)}`,
    onclick: () => { if (b.key === currentBook().key) return; setSetting('sharhBook', b.key); mark(); onPick(); },
  }, h('strong', L(b.short)), h('small', L(b.by)))));
  mark();
  return wrap;
}

const loadingEl = () => h('p.cm-loading.muted', t('sh.loading'));
const errorEl = retry => h('div.cm-loading', h('p.muted', t('sh.error')),
  h('button.btn.small.ghost', { type: 'button', onclick: retry }, t('btn.retry')));

function footer(data) {
  const b = data.book;
  return h('footer.cm-foot',
    h('p', L(b.title), ' — ', L(b.author), '. ', L(b.publisher), ', ', L(b.edition), '. ',
      b.source?.url ? h('a', { href: b.source.url, target: '_blank', rel: 'noopener' }, t('sh.onShamela')) : null),
    h('p', t('sh.aiNote')));
}

const pagesText = p => (p.start === p.end ? t('sh.page', { a: p.start }) : t('sh.pages', { a: p.start, b: p.end }));

// ---------------------------------------------------------------- hadith page tab
/** The Commentary tab on a hadith page: book picker, sticky mode bar, the chapter for hadith n. */
export function sharhTab(n) {
  const box = h('div.sharh');
  const info = h('div.cm-info');
  const content = h('div.cm-content');
  let chapter = null, data = null;
  const paintChapter = () => {
    clear(content);
    if (chapter) content.append(renderChapter(chapter, currentBook(), currentMode()), footer(data));
  };
  const bar = readerBar(content, paintChapter);
  const load = async () => {
    const book = currentBook();
    chapter = null;
    clear(info);
    clear(content).append(loadingEl());
    try { data = await loadBook(book.key); chapter = await loadChapter(book.key, n); } catch {
      if (book === currentBook()) clear(content).append(errorEl(load));
      return;
    }
    if (book !== currentBook()) return; // the reader picked another book meanwhile
    if (!chapter) { clear(content).append(h('p.cm-loading.muted', t('sh.missing'))); return; }
    info.append(...[
      h('span', L(book.name), ' · ', pagesText(chapter.pages)),
      chapter.number !== n ? h('span.chip', t('sh.bookNum', { n: chapter.number })) : null,
      h('a.cm-about', { href: '#/book/' + book.key }, t('sh.about'), svgIcon('chev', 14)),
    ].filter(Boolean));
    paintChapter();
  };
  box.append(bookPicker(load), info, bar, content);
  load();
  return box;
}

// ---------------------------------------------------------------- book page  (#/book/<key>)
export function bookView(el, key) {
  const book = bookInfo(key);
  el.append(h('div.hd-top',
    h('a.icon-btn', { href: '#/library', 'aria-label': t('btn.back') }, svgIcon('back', 24))));
  el.append(h('header.bk-head.' + book.tone,
    h('div.bk-ico', svgIcon('book', 32)),
    h('div', h('h1', L(book.name)), h('div.muted', L(book.author)))));
  const body = h('div');
  el.append(body);

  const paint = async () => {
    clear(body).append(loadingEl());
    let data;
    try { data = await loadBook(book.key); } catch { clear(body).append(errorEl(paint)); return; }
    if (!body.isConnected) return;
    const b = data.book, tr = data.translation;
    const fact = (label, obj) => [h('dt', label), h('dd', L(obj))];
    const intro = h('div.cm-more-body'), outro = h('div.cm-more-body');
    const scope = h('div');
    const paintMatter = () => {
      const mode = currentMode();
      clear(intro).append(renderMatter(data.front_matter, mode));
      clear(outro).append(renderMatter(data.back_matter, mode));
    };
    const more = (title, content, open = false) => h('details.cm-more', { open }, h('summary', title), content);
    const toc = h('div.toc', data.hadiths.map(x => h('a.toc-row', { href: `#/h/${x.standard_number}/sharh/${book.key}` },
      h('span.toc-num' + (x.collection === 'ibn-rajab' ? '.ir' : ''), num(x.number)),
      h('span.toc-body', h('strong', L(x.title)), h('small.ar', { dir: 'rtl', lang: 'ar' }, x.heading.ar)),
      h('small.muted.toc-pg', pagesText(x.pages), x.translated != null && x.translated < 1
        ? h('span.toc-en', x.translated === 0 ? t('sh.arOnly') : num(Math.round(x.translated * 100)) + '% EN') : null))));
    scope.append(
      more(t('sh.intro'), intro),
      h('h2.toc-title', t('sh.contents')), toc,
      more(t('sh.conclusion'), outro),
      more(t('sh.translation'), h('div.cm-more-body', langAttrs('en'),
        h('p', tr.method),
        h('ul', tr.conventions.map(c => h('li', c))),
        h('ul', tr.notes.map(c => h('li', c))),
        b.source?.page_numbering ? h('p.small.muted', b.source.page_numbering) : null)));
    clear(body).append(
      h('p.bk-title', L(b.title)),
      h('dl.bk-facts', fact(t('sh.author'), b.author), fact(t('sh.publisher'), b.publisher), fact(t('sh.edition'), b.edition),
        h('dt', t('ir.source')), h('dd', h('a', { href: shamelaUrl(book.shamela), target: '_blank', rel: 'noopener' }, t('sh.onShamela') + ' ↗'))),
      readerBar(scope, paintMatter, { sticky: false }), scope, h('p.small.muted', t('sh.aiNote')));
    paintMatter();
  };
  paint();
}

/** Library strip: one card per commentary, then any `extra` cards. */
export function bookCards(extra = []) {
  return h('div.books', BOOKS.map(b => h('a.bookcard.' + b.tone, { href: '#/book/' + b.key },
    h('span.bookcard-ico', svgIcon('book', 22)),
    h('span.bookcard-body', h('strong', L(b.name)), h('small', L(b.author))))), extra);
}
