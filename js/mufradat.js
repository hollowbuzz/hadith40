// Mufradāt path: the words and phrases of each hadith as al-Tuḥfah al-Rabbāniyyah explains them.
// An optional path beside the main one: an overview of a hadith's mufradāt, then a short test.
// Its stars are kept apart (state.vocab) and never change hadith mastery or review dates.
import { HADITH } from './data.js';
import { state, save } from './store.js';
import { h, clear, svgIcon, shuffle } from './ui.js';
import { t, L, num, isAr } from './i18n.js';
import { ar } from './render.js';
import { loadBook } from './sharh.js';
import { UNIT_RANGES } from './srs.js';
import { newSession, pickFresh } from './quiz.js';
import { runSession } from './lesson.js';

const H = n => HADITH[n - 1];
const TONES = ['green', 'blue', 'purple', 'orange', 'gold'];

// ---------------------------------------------------------------- data
let vocab = null; // Map n → [{ i, term: {ar, en}, gloss, ex: {ar, en} }]
/** After "Term: " — the explanation itself. */
const afterTerm = s => { const k = s.indexOf(':'); return (k > 0 && k < 90 ? s.slice(k + 1) : s).trim(); };
export async function loadVocab() {
  if (vocab) return vocab;
  const book = await loadBook('tuhfah');
  vocab = new Map();
  for (const ch of book.hadiths) {
    const blocks = ch.sections.filter(s => s.type === 'vocabulary').flatMap(s => s.blocks).filter(b => b.term);
    vocab.set(ch.standard_number, blocks.map((b, i) => {
      const segs = b.paragraphs.flatMap(p => p.segments);
      const glossM = b.term.en.match(/“([^”]+)”/);
      return {
        i, term: b.term, gloss: glossM ? glossM[1] : null,
        ex: { ar: afterTerm(segs.map(s => s.ar).join(' ')), en: afterTerm(segs.map(s => s.en).join(' ')) },
      };
    }));
  }
  return vocab;
}

const clip = (s, max) => (s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, '') + ' …');
/** The meaning in the interface language: Arabic gloss, or English with its short gloss first. */
function meaning(e, max = 150) {
  if (isAr()) return clip(e.ex.ar, max);
  const ex = e.ex.en;
  return clip(e.gloss && !ex.toLowerCase().startsWith(e.gloss.toLowerCase()) ? `“${e.gloss}” — ${ex}` : ex, max);
}

export const vocabStars = n => state.vocab?.[n]?.stars || 0;
function saveResult(n, acc) {
  const v = state.vocab || (state.vocab = {});
  const stars = acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : acc >= 0.4 ? 1 : 0;
  const prev = v[n] || { stars: 0, best: 0, runs: 0 };
  v[n] = { stars: Math.max(prev.stars, stars), best: Math.max(prev.best, acc), runs: prev.runs + 1, last: Date.now() };
  save(true);
}

// ---------------------------------------------------------------- questions
/** A test of hadith n's mufradāt: term → meaning and meaning → term, freshest entries first. */
export function buildVocabQuiz(n) {
  const own = vocab.get(n) || [];
  if (!own.length) return [];
  newSession();
  const others = [...vocab.entries()].filter(([m]) => m !== n && Math.abs(m - n) <= 6).flatMap(([, es]) => es);
  const count = Math.min(10, Math.max(4, own.length * 2));
  const qs = [];
  for (let k = 0; k < count; k++) {
    const kind = k % 2 ? 'vmean' : 'vterm';
    const e = pickFresh(own, x => `vocab:${n}:${x.i}:${kind}`);
    const pool = [...shuffle(own.filter(x => x !== e)), ...shuffle(others)]; // same hadith first: closer, harder
    if (kind === 'vterm') {
      const right = meaning(e);
      const wrong = [];
      for (const x of pool) { const m = meaning(x); if (m !== right && !wrong.includes(m)) wrong.push(m); if (wrong.length === 3) break; }
      if (wrong.length < 2) continue;
      qs.push({
        type: 'mcq', kind: 'vterm', key: `vocab:${n}:${e.i}:vterm`, facet: null, n, vocab: true, title: ['q.vterm'],
        prompt: { kind: 'word', ar: e.term.ar },
        options: shuffle([right, ...wrong].map((s, i) => ({ id: i ? 'x' + i : 'ok', text: s, ar: isAr() }))), answer: 'ok',
      });
    } else {
      const wrong = [];
      for (const x of pool) { if (x.term.ar !== e.term.ar && !wrong.includes(x.term.ar)) wrong.push(x.term.ar); if (wrong.length === 3) break; }
      if (wrong.length < 2) continue;
      qs.push({
        type: 'mcq', kind: 'vmean', key: `vocab:${n}:${e.i}:vmean`, facet: null, n, vocab: true, title: ['q.vmean'],
        prompt: { kind: 'meaning', text: meaning(e, 260), ar: isAr() },
        options: shuffle([e.term.ar, ...wrong].map((s, i) => ({ id: i ? 'x' + i : 'ok', text: s, ar: true }))), answer: 'ok',
      });
    }
  }
  return qs;
}

function startTest(n) {
  const make = () => buildVocabQuiz(n);
  runSession({ kind: 'vocab', n, back: '#/mufradat/' + n, questions: make(), rebuild: make, onFinish: acc => saveResult(n, acc) });
}

// ---------------------------------------------------------------- views (#/mufradat, #/mufradat/<n>)
const starsEl = (s, size = '') => h('span.vstars' + size, { 'aria-label': `${s}/3` }, [0, 1, 2].map(i => h('i' + (i < s ? '.on' : ''), '★')));
const loading = () => h('p.cm-loading.muted', t('sh.loading'));
const failed = retry => h('div.cm-loading', h('p.muted', t('sh.error')), h('button.btn.small.ghost', { type: 'button', onclick: retry }, t('btn.retry')));

export function mufradatView(el, arg) {
  const n = parseInt(arg, 10);
  if (n >= 1 && n <= 50) return overview(el, n);
  el.append(h('h1.page-title', '📚 ' + t('mf.title')), h('p.muted.mf-lead', t('mf.lead')));
  const body = h('div');
  el.append(body);
  const paint = async () => {
    clear(body).append(loading());
    try { await loadVocab(); } catch { clear(body).append(failed(paint)); return; }
    if (!body.isConnected) return;
    clear(body);
    UNIT_RANGES.forEach(([a, b], u) => {
      body.append(h('h2.sec-label', t('unit', { n: u + 1 }) + ' · ' + t('unit.range', { a, b })));
      body.append(h('div.mf-list', HADITH.filter(x => x.n >= a && x.n <= b).map(hd => {
        const c = vocab.get(hd.n)?.length || 0;
        return h(c ? 'a.mf-row' : 'div.mf-row.empty', { href: c ? '#/mufradat/' + hd.n : null },
          h('span.mf-num.' + TONES[u], num(hd.n)),
          h('span.mf-body', h('strong', L(hd.title)), h('small.muted', c ? t('mf.count', { n: c }) : t('mf.none'))),
          c ? starsEl(vocabStars(hd.n)) : null);
      })));
    });
    body.append(h('p.small.muted', t('mf.source')));
  };
  paint();
}

function overview(el, n) {
  const hd = H(n);
  el.append(h('div.hd-top',
    h('a.icon-btn', { href: '#/mufradat', 'aria-label': t('btn.back') }, svgIcon('back', 24)),
    h('div.grow'),
    n > 1 ? h('a.icon-btn', { href: '#/mufradat/' + (n - 1), 'aria-label': t('hd.prev') }, svgIcon('prev', 22)) : null,
    n < 50 ? h('a.icon-btn', { href: '#/mufradat/' + (n + 1), 'aria-label': t('hd.next') }, svgIcon('next', 22)) : null));
  el.append(h('header.hd-head',
    h('div.big-num' + (hd.ibnRajab ? '.ir' : ''), num(n)),
    h('div.hd-titles', h('div.hd-heading', t('mf.title')), h('h1', L(hd.title)), starsEl(vocabStars(n), '.big'))));
  const body = h('div');
  el.append(body);
  const paint = async () => {
    clear(body).append(loading());
    try { await loadVocab(); } catch { clear(body).append(failed(paint)); return; }
    if (!body.isConnected) return;
    const es = vocab.get(n) || [];
    clear(body);
    if (!es.length) { body.append(h('p.cm-loading.muted', t('mf.none'))); return; }
    body.append(
      h('p.small.muted', t('mf.overviewHint', { n: es.length })),
      h('div.mf-cards', es.map(e => h('article.mf-card',
        h('div.mf-term', { dir: 'rtl', lang: 'ar' }, ar(e.term.ar)),
        !isAr() ? h('div.mf-gloss', e.gloss ? '“' + e.gloss + '”' : e.term.en) : null,
        h('p.mf-ar', { dir: 'rtl', lang: 'ar' }, ar(e.ex.ar)),
        state.settings.showTranslation ? h('p.mf-en', { dir: 'ltr', lang: 'en' }, e.ex.en) : null))),
      h('div.intro-cta.mf-cta', h('button.btn.green.big', { type: 'button', onclick: () => startTest(n) }, '✏️ ' + t('mf.test'))),
      h('p.small.muted', t('mf.source')));
  };
  paint();
}

/** Small entry card for the home and practice pages. */
export const mufradatCard = () => h('a.mf-entry', { href: '#/mufradat' },
  h('span.mf-entry-ico', '📚'), h('span', h('strong', t('mf.title')), h('small', t('mf.entry'))), svgIcon('chev', 20));
