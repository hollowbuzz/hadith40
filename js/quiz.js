// Question generators and session builders.
import { HADITH, TAKHREEJ } from './data.js';
import { prep, phraseText, normalize } from './text.js';
import { state } from './store.js';
import { shuffle, pick, sample } from './ui.js';
import { weakFacets, learnedList, dueList, weakList, isLearned, strength } from './srs.js';

const ALL = HADITH.map(h => h.n);
const H = n => HADITH[n - 1];
const uniqBy = (arr, key) => { const s = new Set(); return arr.filter(x => { const k = key(x); if (s.has(k)) return false; s.add(k); return true; }); };

export const NARRATORS = uniqBy(HADITH.map(h => h.narrator), x => x.ar);
const COMMON_TAKH = ['bm', 'b', 'm', 't'];

// ---------- rotation: prefer what hasn't been asked, was answered wrongly, or was asked longest ago ----------
// state.asked[key] = [minute last asked, last answer right (1/0), times asked]; key = "<type>:<hadith>:<which part>"
const minute = () => Math.floor(Date.now() / 60000);
let sessionKeys = new Set();
/** Start a new lesson: nothing asked in it yet. */
export function newSession() { sessionKeys = new Set(); }
export function noteAnswer(key, ok) {
  if (!key) return;
  const a = state.asked || (state.asked = {});
  a[key] = [minute(), ok ? 1 : 0, ((a[key] && a[key][2]) || 0) + 1];
  const keys = Object.keys(a);
  if (keys.length > 6000) keys.sort((x, y) => a[x][0] - a[y][0]).slice(0, 1000).forEach(k => delete a[k]);
}
function freshness(key) {
  if (sessionKeys.has(key)) return -1;               // already in this lesson: last resort
  const a = state.asked?.[key];
  if (!a) return 1e9 + Math.random() * 1e6;          // never asked: first, in random order
  const age = minute() - a[0];
  return age * (a[1] ? 1 : 4) * (0.75 + Math.random() * 0.5); // missed ones come back four times sooner
}
/** Pick the freshest item; keyOf(item) names the prompt it would produce. */
function pickFresh(items, keyOf) {
  if (!items.length) return null;
  let best = null, bestScore = -Infinity;
  for (const it of items) { const s = freshness(keyOf(it)); if (s > bestScore) { bestScore = s; best = it; } }
  sessionKeys.add(keyOf(best));
  return best;
}
const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

// ---------- helpers ----------
function nearNumbers(n, k) {
  const pool = ALL.filter(x => x !== n);
  const scored = pool.map(x => ({ x, s: Math.abs(x - n) + Math.random() * 6 }));
  return scored.sort((a, b) => a.s - b.s).slice(0, k).map(o => o.x);
}
function otherHadith(n, k, pool = ALL) {
  const p = pool.filter(x => x !== n);
  return sample(p.length >= k ? p : ALL.filter(x => x !== n), k);
}
const prefixOf = w => (w.startsWith('وال') ? 'وال' : w.startsWith('فال') ? 'فال' : w.startsWith('ال') ? 'ال'
  : w.startsWith('و') ? 'و' : w.startsWith('ف') ? 'ف' : w.startsWith('ب') ? 'ب' : '');

function wordDistractors(n, tok, k) {
  const P = prep(n);
  const target = tok.norm, len = target.length, pre = prefixOf(target);
  const score = t => Math.abs(t.norm.length - len) + (prefixOf(t.norm) === pre ? 0 : 2.5) + Math.random() * 2;
  const fromSame = uniqBy(P.blankable.map(i => P.tokens[i]).filter(t => t.norm !== target), t => t.norm)
    .sort((a, b) => score(a) - score(b)).slice(0, 2);
  const others = otherHadith(n, 6).flatMap(m => prep(m).blankable.map(i => prep(m).tokens[i]));
  const used = new Set([target, ...fromSame.map(t => t.norm)]);
  const fromOther = uniqBy(others.filter(t => !used.has(t.norm)), t => t.norm).sort((a, b) => score(a) - score(b));
  return [...fromSame, ...fromOther].slice(0, k).map(t => t.core);
}

/** Options for "which phrase?" questions: the correct one, two from the same hadith, one from another. */
function phraseOptions(n, correct, invalid = new Set()) {
  const P = prep(n);
  const txt = i => phraseText(n, P.phrases[i], false);
  invalid.add(normalize(correct));
  const own = sample(uniqBy(P.phrases.map((_, i) => txt(i)).filter(s => !invalid.has(normalize(s))), normalize), 2);
  const other = otherHadith(n, 4).map(m => phraseText(m, pick(prep(m).phrases), false))
    .filter(s => !invalid.has(normalize(s)) && !own.some(o => normalize(o) === normalize(s)));
  const opts = [correct, ...uniqBy([...own, ...other], normalize).slice(0, 3)];
  return opts.length >= 3 ? shuffle(opts.map((s, i) => ({ id: i ? 'x' + i : 'ok', text: s, ar: true }))) : null;
}

function piecesFor(n, idxs, blankIdx = -1) {
  const tk = prep(n).tokens;
  return idxs.map(i => ({
    pre: tk[i].pre.replace(/[«»]/g, ''), core: tk[i].core, post: tk[i].post.replace(/[«»]/g, ''), blank: i === blankIdx,
  }));
}

// ---------- generators (return null when not applicable) ----------
export const GEN = {
  read: n => ({ type: 'read', facet: null, n }),
  recite: n => ({ type: 'recite', facet: 'text', n }),

  order(n, { first = false } = {}) {
    const P = prep(n);
    const all = P.phrases.map((ph, k) => ({ ph, k }));
    let pool = first ? all.slice(0, 1) : all.filter(x => x.ph.length >= 3 && x.ph.length <= 8);
    if (!pool.length) pool = all.filter(x => x.ph.length >= 2);
    if (!pool.length) return null;
    let { ph, k } = pickFresh(pool, x => `order:${n}:${x.k}`);
    if (ph.length > 8) ph = ph.slice(0, 8);
    const toks = ph.map(i => P.tokens[i]);
    const answer = toks.map(t => t.core);
    let tiles = toks.map((t, j) => ({ id: 't' + j, text: t.core }));
    if (tiles.length <= 6) {
      wordDistractors(n, toks[0], tiles.length <= 4 ? 1 : 2).forEach((w, j) => tiles.push({ id: 'd' + j, text: w }));
    }
    for (let tries = 0; tries < 6; tries++) {
      tiles = shuffle(tiles);
      if (tiles.slice(0, answer.length).map(t => t.text).join(' ') !== answer.join(' ')) break;
    }
    const context = k > 0 ? piecesFor(n, P.phrases[k - 1]) : null;
    return { type: 'order', key: `order:${n}:${k}`, facet: 'text', n, first: k === 0, context, answer, tiles };
  },

  blank(n, { typing = false } = {}) {
    const P = prep(n);
    if (!P.blankable.length) return null;
    const ti = pickFresh(P.blankable, i => `blank:${n}:${i}`);
    const key = `blank:${n}:${ti}`;
    const tok = P.tokens[ti];
    const k = P.phrases.findIndex(ph => ph.includes(ti));
    const idxs = [...(k > 0 ? P.phrases[k - 1] : []), ...P.phrases[k]];
    const pieces = piecesFor(n, idxs, ti);
    if (typing) return { type: 'type', key, facet: 'text', n, pieces, answer: tok.core };
    const opts = [tok.core, ...wordDistractors(n, tok, 3)];
    return {
      type: 'mcq', kind: 'blank', key, facet: 'text', n, prompt: { kind: 'pieces', pieces },
      options: shuffle(opts.map((w, i) => ({ id: i ? 'x' + i : 'ok', text: w, ar: true }))), answer: 'ok',
    };
  },

  next(n) {
    const P = prep(n);
    if (P.phrases.length < 2) return null;
    const k = pickFresh(range(0, P.phrases.length - 1), i => `next:${n}:${i}`);
    const txt = i => phraseText(n, P.phrases[i], false);
    const promptNorm = normalize(txt(k));
    // every successor of an identical phrase is also "correct" → never a distractor
    const valid = new Set(P.phrases.map((_, i) => i).filter(i => i > 0 && normalize(txt(i - 1)) === promptNorm).map(i => normalize(txt(i))));
    [k - 1, k].filter(i => i >= 0).forEach(i => valid.add(normalize(txt(i)))); // never offer what the prompt shows
    const options = phraseOptions(n, txt(k + 1), valid);
    if (!options) return null;
    const ctx = [...(k > 0 ? P.phrases[k - 1] : []), ...P.phrases[k]];
    return {
      type: 'mcq', kind: 'next', key: `next:${n}:${k}`, facet: 'text', n,
      prompt: { kind: 'pieces', pieces: piecesFor(n, ctx), trailing: true }, options, answer: 'ok',
    };
  },

  /** What comes before this phrase? */
  before(n) {
    const P = prep(n);
    if (P.phrases.length < 2) return null;
    const k = pickFresh(range(1, P.phrases.length), i => `before:${n}:${i}`);
    const txt = i => phraseText(n, P.phrases[i], false);
    const promptNorm = normalize(txt(k));
    const valid = new Set(P.phrases.map((_, i) => i).filter(i => i > 0 && normalize(txt(i)) === promptNorm).map(i => normalize(txt(i - 1))));
    [k, k + 1].filter(i => i < P.phrases.length).forEach(i => valid.add(normalize(txt(i))));
    const options = phraseOptions(n, txt(k - 1), valid);
    if (!options) return null;
    const ctx = [...P.phrases[k], ...(k + 1 < P.phrases.length ? P.phrases[k + 1] : [])];
    return {
      type: 'mcq', kind: 'before', key: `before:${n}:${k}`, facet: 'text', n,
      prompt: { kind: 'pieces', pieces: piecesFor(n, ctx), leading: true }, options, answer: 'ok',
    };
  },

  /** A whole phrase is missing between its neighbours. */
  missing(n) {
    const P = prep(n);
    if (P.phrases.length < 3) return null;
    const k = pickFresh(range(1, P.phrases.length - 1), i => `missing:${n}:${i}`);
    const correct = phraseText(n, P.phrases[k], false);
    const shown = new Set([k - 1, k + 1].map(i => normalize(phraseText(n, P.phrases[i], false))));
    if (shown.has(normalize(correct))) return null; // the gap would be indistinguishable from its neighbour
    const options = phraseOptions(n, correct, shown);
    if (!options) return null;
    const gap = { pre: '', core: '', post: '', blank: true };
    return {
      type: 'mcq', kind: 'missing', key: `missing:${n}:${k}`, facet: 'text', n,
      prompt: { kind: 'pieces', pieces: [...piecesFor(n, P.phrases[k - 1]), gap, ...piecesFor(n, P.phrases[k + 1])] },
      options, answer: 'ok',
    };
  },

  /** One word in a phrase was swapped for another: which? */
  spot(n) {
    const P = prep(n);
    const blankable = new Set(P.blankable);
    const pool = P.phrases.map((ph, k) => ({ ph, k })).filter(x => x.ph.length >= 3 && x.ph.some(i => blankable.has(i)));
    if (!pool.length) return null;
    const { ph, k } = pickFresh(pool, x => `spot:${n}:${x.k}`);
    const ti = pick(ph.filter(i => blankable.has(i)));
    const tok = P.tokens[ti];
    const inPhrase = new Set(ph.map(i => P.tokens[i].norm));
    const wrong = wordDistractors(n, tok, 4).find(w => !inPhrase.has(normalize(w)));
    if (!wrong) return null;
    const pieces = piecesFor(n, ph).map((p, j) => (ph[j] === ti ? { ...p, core: wrong, swap: true, fix: tok.core } : p));
    const others = uniqBy(ph.filter(i => i !== ti).map(i => P.tokens[i].core), normalize).filter(w => normalize(w) !== normalize(wrong));
    const opts = [wrong, ...sample(others, 3)];
    if (opts.length < 3) return null;
    return {
      type: 'mcq', kind: 'spot', key: `spot:${n}:${k}`, facet: 'text', n, prompt: { kind: 'pieces', pieces },
      options: shuffle(opts.map((w, i) => ({ id: i ? 'x' + i : 'ok', text: w, ar: true }))), answer: 'ok',
    };
  },

  /** Put 3–4 consecutive phrases in order. */
  chain(n) {
    const P = prep(n);
    const L = P.phrases.length;
    if (L < 3) return null;
    const size = L >= 8 ? 4 : 3;
    const s = pickFresh(range(0, L - size + 1), i => `chain:${n}:${i}`);
    const texts = range(s, s + size).map(i => phraseText(n, P.phrases[i], false));
    if (new Set(texts.map(normalize)).size < texts.length) return null; // repeated phrases → more than one right order
    let tiles = texts.map((x, j) => ({ id: 'p' + j, text: x }));
    for (let tries = 0; tries < 6; tries++) { tiles = shuffle(tiles); if (tiles.some((tl, j) => tl.text !== texts[j])) break; }
    return {
      type: 'order', kind: 'chain', key: `chain:${n}:${s}`, facet: 'text', n, first: s === 0,
      context: s > 0 ? piecesFor(n, P.phrases[s - 1]) : null, answer: texts, tiles,
    };
  },

  /** Which hadith is this phrase from? (a phrase from the middle, not the opening) */
  where(n) {
    const P = prep(n);
    const ks = range(1, P.phrases.length).filter(k => P.phrases[k].length >= 3);
    if (!ks.length) return null;
    const k = pickFresh(ks, i => `where:${n}:${i}`);
    const norm = normalize(phraseText(n, P.phrases[k], false));
    const others = otherHadith(n, 6).filter(m => !normalize(phraseText(m, prep(m).matn.map(t => t.i), false)).includes(norm)).slice(0, 3);
    if (others.length < 3) return null;
    return {
      type: 'mcq', kind: 'where', key: `where:${n}:${k}`, facet: 'meaning', n,
      prompt: { kind: 'pieces', pieces: piecesFor(n, P.phrases[k]), leading: true, trailing: k + 1 < P.phrases.length },
      options: shuffle([n, ...others]).map(x => ({ id: String(x), title: H(x).title })), answer: String(n),
    };
  },

  number(n) {
    const others = nearNumbers(n, 3);
    if (Math.random() < 0.55) {
      return {
        type: 'mcq', kind: 'number', key: `number:${n}`, facet: 'number', n, title: ['q.number'], prompt: { kind: 'opening', n },
        options: shuffle([n, ...others]).map(x => ({ id: String(x), num: x })), answer: String(n), grid: true,
      };
    }
    return {
      type: 'mcq', kind: 'numberRev', key: `numberRev:${n}`, facet: 'number', n, title: ['q.numberRev', { n }], prompt: { kind: 'bignum', n },
      options: shuffle([n, ...others]).map(x => ({ id: String(x), text: prep(x).opening, ar: true })), answer: String(n),
    };
  },

  narrator(n) {
    const c = H(n).narrator;
    const pool = NARRATORS.filter(x => x.ar !== c.ar);
    const opts = [c, ...sample(pool, 3)];
    return {
      type: 'mcq', kind: 'narrator', key: `narrator:${n}`, facet: 'narrator', n, prompt: { kind: 'opening', n },
      options: shuffle(opts).map(x => ({ id: x.ar, name: x })), answer: c.ar,
    };
  },

  takhreej(n) {
    const c = H(n).takhreej;
    const common = COMMON_TAKH.filter(k => k !== c);
    const rest = Object.keys(TAKHREEJ).filter(k => k !== c && !COMMON_TAKH.includes(k));
    const opts = [c, ...sample(common, 2), ...sample(rest, 1)];
    return {
      type: 'mcq', kind: 'takhreej', key: `takhreej:${n}`, facet: 'takhreej', n, prompt: { kind: 'opening', n },
      options: shuffle(opts).map(k => ({ id: k, name: TAKHREEJ[k] })), answer: c,
    };
  },

  meaning(n) {
    const others = otherHadith(n, 3);
    const variants = ['title', 'titleRev'];
    if (state.settings.showTranslation) variants.push('gist', 'gist');
    const v = pick(variants);
    if (v === 'title') {
      return {
        type: 'mcq', kind: 'title', facet: 'meaning', n, prompt: { kind: 'opening', n },
        options: shuffle([n, ...others]).map(x => ({ id: String(x), title: H(x).title })), answer: String(n),
      };
    }
    return {
      type: 'mcq', kind: v, facet: 'meaning', n,
      title: v === 'titleRev' ? ['q.titleRev', { t: H(n).title }] : ['q.meaning'],
      prompt: v === 'gist' ? { kind: 'gist', n } : { kind: 'title', n },
      options: shuffle([n, ...others]).map(x => ({ id: String(x), text: prep(x).opening, ar: true })), answer: String(n),
    };
  },

  match(n, { pool = ALL } = {}) {
    const ns = [n, ...otherHadith(n, 3, pool)];
    const right = Math.random() < 0.5 ? 'title' : 'opening';
    const pairs = ns.map(x => ({ n: x, left: x, right: right === 'title' ? { title: H(x).title } : { ar: shortOpening(x) } }));
    return { type: 'match', facet: 'number', n, pairs, rightKind: right };
  },
};

function shortOpening(n) {
  const words = prep(n).matn.slice(0, 5).map(t => t.core);
  return words.join(' ') + ' …';
}

// facet → generator types
const FACET_TYPES = {
  text: ['order', 'blank', 'next', 'before', 'missing', 'spot', 'chain'], number: ['number', 'match'],
  narrator: ['narrator'], takhreej: ['takhreej'], meaning: ['meaning', 'where'],
};
const TYPE_WEIGHT = {
  order: 3, blank: 3, next: 2, before: 1.5, missing: 2, spot: 2, chain: 1.5,
  number: 2, narrator: 1.5, takhreej: 1.5, meaning: 1.5, where: 1.5, match: 1,
};

function make(type, n, opts = {}) {
  if (type === 'blank') return GEN.blank(n, { typing: state.settings.typing && Math.random() < 0.4 });
  return GEN[type](n, opts);
}

function weightedPick(types) {
  const total = types.reduce((s, t) => s + (TYPE_WEIGHT[t] || 1), 0);
  let r = Math.random() * total;
  for (const t of types) { r -= TYPE_WEIGHT[t] || 1; if (r <= 0) return t; }
  return types[types.length - 1];
}

// ---------- session builders ----------
export function buildLearn(n) {
  newSession();
  const seq = [['read'], ['order', { first: true }], ['blank'], ['order'], ['narrator'], ['next'], ['missing'],
    ['number'], ['takhreej'], ['meaning'], ['spot'], ['order'], ['recite']];
  return seq.map(([t, o]) => (t === 'read' || t === 'recite') ? GEN[t](n) : make(t, n, o)).filter(Boolean);
}

export function buildPractice(n) {
  newSession();
  const len = state.settings.lessonLength;
  // longer hadith get more text questions, so a lesson covers more of the text
  const text = ['order', 'order', 'blank', 'blank', 'next', 'before', 'missing', 'spot', 'chain'];
  const facts = ['number', 'narrator', 'takhreej', 'meaning', 'where', 'match'];
  const words = prep(n).matn.length;
  const pool = [...text, ...(words > 40 ? text : []), ...(words > 100 ? text : []), ...facts];
  const mid = uniqKinds(shuffle(pool), Math.max(4, len - 1));
  const qs = mid.map(t => make(t, n, t === 'match' ? { pool: learnedList().length >= 4 ? learnedList() : ALL } : {})).filter(Boolean);
  qs.push(GEN.recite(n));
  return qs;
}

/** Mixed questions over a pool of hadith. mode: 'review' | 'weak' | 'drill' */
export function buildMixed(pool, { types = enabledTypes(), length = state.settings.lessonLength, mode = 'review' } = {}) {
  newSession();
  if (!pool.length || !types.length) return [];
  const matchPool = pool.length >= 4 ? pool : (learnedList().length >= 4 ? learnedList() : ALL);
  const order = mode === 'drill' ? shuffle(pool) : pool; // review/weak pools come pre-sorted (most urgent first)
  const qs = [];
  let i = 0, guard = 0;
  while (qs.length < length && guard++ < length * 6) {
    const n = order[i++ % order.length];
    let type;
    if (mode === 'weak') {
      const facet = weakFacets(n).find(f => FACET_TYPES[f].some(t => types.includes(t)));
      const opts = facet ? FACET_TYPES[facet].filter(t => types.includes(t)) : types;
      type = weightedPick(opts);
    } else {
      type = weightedPick(types);
    }
    const q = make(type, n, type === 'match' ? { pool: matchPool } : {});
    if (q) qs.push(q);
  }
  return shuffle(qs);
}

/** Take k from a shuffled list, letting a kind repeat only once every kind has appeared. */
function uniqKinds(list, k) {
  const out = [], rest = [];
  for (const x of list) (out.includes(x) || out.length >= k ? rest : out).push(x);
  return [...out, ...rest].slice(0, k);
}

export function enabledTypes() {
  return Object.entries(state.settings.types).filter(([, v]) => v).map(([k]) => k);
}

export function reviewPool() {
  const due = dueList();
  if (due.length) return due.slice(0, Math.max(3, state.settings.lessonLength));
  // nothing due → least recently / weakest learned
  return learnedList().sort((a, b) => strength(a) - strength(b)).slice(0, 8);
}
export function weakPool() {
  const w = weakList();
  return w.length ? w.slice(0, 6) : learnedList().sort((a, b) => strength(a) - strength(b)).slice(0, 6);
}
export function recitePool() {
  const due = dueList();
  const rest = learnedList().filter(n => !due.includes(n)).sort((a, b) => strength(a) - strength(b));
  return [...due, ...rest].slice(0, 5);
}

export function rangePool(range, from = 1, to = 50) {
  switch (range) {
    case 'learned': return learnedList();
    case 'nawawi': return ALL.filter(n => n <= 42);
    case 'ibnRajab': return ALL.filter(n => n > 42);
    case 'custom': { const a = Math.min(from, to), b = Math.max(from, to); return ALL.filter(n => n >= a && n <= b); }
    default: return ALL;
  }
}

/** Endless quick-fire questions for the lightning round. */
export function lightningQuestion(pool) {
  const n = pick(pool);
  const type = pick(['number', 'number', 'narrator', 'takhreej', 'meaning']);
  const q = GEN[type](n);
  if (q.kind === 'gist' || q.kind === 'numberRev' || q.kind === 'titleRev') return lightningQuestion(pool); // keep prompts short
  return q;
}

export const isPoolLearned = pool => pool.every(isLearned);
