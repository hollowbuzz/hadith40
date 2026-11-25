// Mastery tracking: per-hadith facets (text, number, narrator, takhreej, meaning),
// Leitner-style boxes for spaced review, and strength / weakness ranking.
import { state, save } from './store.js';
import { HADITH } from './data.js';

export const FACETS = ['text', 'number', 'narrator', 'takhreej', 'meaning'];
const DAY = 864e5;
export const INTERVALS = [0, 1, 2, 4, 7, 14, 30, 60]; // days per box
const ALPHA = 0.35;

export function prog(n) {
  let p = state.progress[n];
  if (!p) {
    p = state.progress[n] = { box: 0, due: 0, seen: 0, last: 0, learnedAt: 0, fav: false, f: {} };
  }
  for (const f of FACETS) if (!p.f[f]) p.f[f] = { s: 0, n: 0, c: 0, t: 0 };
  return p;
}
export const peek = n => state.progress[n];

/** Record one answer. q is 0..1 (1 = correct). */
export function record(n, facet, q) {
  const p = prog(n);
  const f = p.f[facet] || (p.f[facet] = { s: 0, n: 0, c: 0, t: 0 });
  f.s = f.s + ALPHA * (q - f.s);
  f.n++;
  if (q >= 0.99) f.c++;
  f.t = Date.now();
  p.seen++;
  p.last = Date.now();
  save();
}

export const isLearned = n => (peek(n)?.box || 0) > 0;

/** Called at the end of a session with per-hadith accuracy. */
export function settle(n, acc, { learning = false } = {}) {
  const p = prog(n);
  const now = Date.now();
  const wasDue = p.box === 0 || p.due <= now;
  if (p.box === 0) {
    if (acc >= 0.6 || learning) { p.box = 1; p.learnedAt = now; }
  } else if (acc >= 0.85) {
    if (wasDue) p.box = Math.min(p.box + 1, INTERVALS.length - 1);
  } else if (acc < 0.6) {
    p.box = Math.max(1, p.box - 1);
  }
  if (p.box > 0 && (wasDue || acc < 0.6)) p.due = now + INTERVALS[p.box] * DAY;
  save();
  return p.box;
}

export const crowns = n => Math.min(5, peek(n)?.box || 0);
export const isDue = n => isLearned(n) && peek(n).due <= Date.now();

function decay(p) {
  if (!p || !p.box) return 1;
  const over = (Date.now() - p.due) / DAY;
  if (over <= 0) return 1;
  return Math.max(0.5, 1 - 0.5 * over / (INTERVALS[p.box] + 3));
}

export function facetStrength(n, facet) {
  const p = peek(n);
  if (!p || !p.f[facet]) return 0;
  return p.f[facet].s * decay(p);
}

/** Overall strength 0..1: half memorisation of the text, half the facts. */
export function strength(n) {
  const p = peek(n);
  if (!p || !p.seen) return 0;
  const d = decay(p);
  const facts = ['number', 'narrator', 'takhreej', 'meaning'].map(f => p.f[f]?.s || 0);
  return d * (0.5 * (p.f.text?.s || 0) + 0.5 * facts.reduce((a, b) => a + b, 0) / facts.length);
}

/** 'new' | 'weak' | 'learning' | 'strong' */
export function status(n) {
  if (!isLearned(n)) return 'new';
  const s = strength(n);
  return s < 0.5 ? 'weak' : s < 0.8 ? 'learning' : 'strong';
}

export function isUnlocked(n) {
  if (state.settings.unlockAll || n === 1) return true;
  return isLearned(n) || isLearned(n - 1);
}

export const learnedList = () => HADITH.map(h => h.n).filter(isLearned);
export const dueList = () => learnedList().filter(isDue).sort((a, b) => peek(a).due - peek(b).due);
export const weakList = () => learnedList()
  .map(n => ({ n, s: strength(n) }))
  .filter(x => x.s < 0.8)
  .sort((a, b) => a.s - b.s)
  .map(x => x.n);

/** Facets of hadith n ordered weakest-first. */
export function weakFacets(n) {
  return FACETS.map(f => ({ f, s: facetStrength(n, f) })).sort((a, b) => a.s - b.s).map(x => x.f);
}

export function nextToLearn() {
  return HADITH.map(h => h.n).find(n => !isLearned(n) && isUnlocked(n)) || null;
}

export function toggleFav(n) { const p = prog(n); p.fav = !p.fav; save(); return p.fav; }
export const isFav = n => !!peek(n)?.fav;
