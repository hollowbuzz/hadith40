// Recorded hadith audio (data/audio/, made by tools/audio/generate.py) with word timings.
// Falls back to the device's text-to-speech for any hadith without a file.
import { state } from './store.js';

const BASE = 'data/audio/';
let index = null;
let player = null;
let raf = 0;
const listeners = new Set();

/** Load data/audio/index.json once; resolves to the index, or null when there is no audio. */
let loading = null;
export function loadAudioIndex() {
  if (!loading) {
    loading = fetch(BASE + 'index.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(x => { index = x && x.hadith ? x : null; listeners.forEach(fn => fn()); return index; });
  }
  return loading;
}
export const onAudioIndex = fn => listeners.add(fn);
export const audioFor = n => index?.hadith?.[n] || null;
export const hasAudio = () => !!index && Object.keys(index.hadith).length > 0;

/**
 * Play hadith n from `from` seconds. onTick(para, word) fires whenever the spoken paragraph or word changes
 * (word is -1 when the file has no word times); onEnd fires when it finishes or is stopped.
 */
export function playHadith(n, { from = 0, onTick = null, onEnd = null } = {}) {
  const a = audioFor(n);
  if (!a) return false;
  stopAudio();
  const el = new Audio(BASE + a.file + (a.hash ? '?v=' + a.hash : '')); // a new recording gets a new URL
  el.preload = 'auto';
  el.preservesPitch = true;
  el.playbackRate = state.settings.ttsRate;
  let last = '';
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    if (player?.el === el) player = null;
    onTick?.(-1, -1);
    onEnd?.();
  };
  const tick = () => {
    const t = el.currentTime;
    let p = a.paras.findIndex(x => t >= x.start && t < x.end + 0.3);
    let w = -1;
    if (p >= 0) {
      const ws = a.paras[p].words;
      for (let i = 0; i < ws.length; i++) { if (ws[i] != null && ws[i] <= t) w = i; else if (ws[i] != null) break; }
    }
    const key = p + ':' + w;
    if (key !== last) { last = key; onTick?.(p, w); }
    if (!el.paused) raf = requestAnimationFrame(tick);
  };
  el.addEventListener('playing', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
  el.addEventListener('ended', finish);
  el.addEventListener('error', finish);
  player = { el, n, finish };
  if (from > 0) el.addEventListener('loadedmetadata', () => { el.currentTime = from; }, { once: true });
  el.play().catch(finish);
  return true;
}

/** Start time of word w of paragraph p (or of the paragraph when there are no word times). */
export function timeOf(n, p, w) {
  const para = audioFor(n)?.paras?.[p];
  if (!para) return 0;
  return para.words?.[w] ?? para.start;
}

export function stopAudio() {
  if (!player) return;
  const { el, finish } = player;
  el.pause();
  finish();
}
export const audioPlaying = n => !!player && (n == null || player.n === n);
