// Small synthesized sound kit (WebAudio) — no audio files, works offline.
import { state } from './store.js';

let ctx = null, master = null;

function ac() {
  if (!state.settings.sound) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.value = state.settings.volume;
  return ctx;
}

function tone(freq, { type = 'sine', dur = 0.15, vol = 0.3, at = 0, attack = 0.005, slide = null, filter = null } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    o.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Create/resume the audio context inside a user gesture (needed on iOS). */
export function unlockAudio() { ac(); }

const semi = (f, n) => f * Math.pow(2, n / 12);

export const sfx = {
  tap() { tone(540, { type: 'sine', dur: 0.06, vol: 0.12 }); },
  select() { tone(720, { type: 'triangle', dur: 0.08, vol: 0.18 }); },
  unselect() { tone(480, { type: 'triangle', dur: 0.07, vol: 0.14 }); },
  correct(combo = 0) {
    const up = Math.min(combo, 8);
    tone(semi(659.25, up), { type: 'triangle', dur: 0.14, vol: 0.28 });
    tone(semi(987.77, up), { type: 'triangle', dur: 0.26, vol: 0.28, at: 0.09 });
    tone(semi(1975.5, up), { type: 'sine', dur: 0.2, vol: 0.06, at: 0.09 });
  },
  wrong() {
    tone(220, { type: 'sawtooth', dur: 0.28, vol: 0.16, slide: 140, filter: 900 });
    tone(165, { type: 'square', dur: 0.22, vol: 0.06, at: 0.05, filter: 600 });
  },
  complete() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.22, vol: 0.25, at: i * 0.09 }));
    [523.25, 659.25, 783.99].forEach(f => tone(f * 2, { type: 'sine', dur: 0.7, vol: 0.09, at: 0.4 }));
  },
  levelUp() {
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, { type: 'square', dur: 0.16, vol: 0.09, at: i * 0.075, filter: 3000 }));
    tone(1046.5, { type: 'triangle', dur: 0.8, vol: 0.2, at: 0.5 });
  },
  streak() {
    tone(300, { type: 'sawtooth', dur: 0.35, vol: 0.06, slide: 1200, filter: 2500 });
    [880, 1174.7, 1760].forEach((f, i) => tone(f, { type: 'sine', dur: 0.35, vol: 0.18, at: 0.3 + i * 0.08 }));
  },
  achievement() {
    for (let i = 0; i < 7; i++) tone(1400 + Math.random() * 1400, { type: 'sine', dur: 0.12, vol: 0.1, at: i * 0.05 });
    tone(1567.98, { type: 'triangle', dur: 0.5, vol: 0.15, at: 0.35 });
  },
  heart() { tone(180, { type: 'sine', dur: 0.25, vol: 0.3, slide: 90 }); },
  tick() { tone(1200, { type: 'square', dur: 0.03, vol: 0.05, filter: 4000 }); },
  flip() { tone(900, { type: 'sine', dur: 0.08, vol: 0.1, slide: 1300 }); },
};

export function haptic(pattern = 15) {
  const activated = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  if (state.settings.haptics && navigator.vibrate && activated) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}
