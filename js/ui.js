// DOM helpers, toasts, dialogs, confetti, text-to-speech.
import { state } from './store.js';
import { audioFor, playHadith, stopAudio } from './audio.js';

/** h('div.card.big', {onclick, dir:'rtl'}, child, [children], 'text') */
export function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (s, r = document) => r.querySelector(s);
export const clear = el => { while (el.firstChild) el.firstChild.remove(); return el; };

export function svgIcon(name, size = 22) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  return span;
}

// ---------- toast ----------
export function toast(msg, { icon = null, ms = 2600, action = null } = {}) {
  const host = $('#toasts');
  const el = h('div.toast', icon ? h('span.toast-ico', icon) : null, h('span', msg),
    action ? h('button.toast-btn', { onclick: () => { action.fn(); el.remove(); } }, action.label) : null);
  host.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, ms);
}

// ---------- modal ----------
export function modal(content, { dismissable = true, cls = '' } = {}) {
  const host = $('#modal');
  clear(host);
  const box = h('div.modal-box' + (cls ? '.' + cls : ''), { role: 'dialog', 'aria-modal': 'true' }, content);
  const close = () => { host.classList.remove('open'); setTimeout(() => clear(host), 250); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape' && dismissable) close(); };
  host.append(h('div.modal-backdrop', { onclick: () => dismissable && close() }), box);
  host.classList.add('open');
  document.addEventListener('keydown', onKey);
  const f = box.querySelector('button, [tabindex]');
  if (f) setTimeout(() => f.focus(), 50);
  return close;
}

export function confirmDialog({ title, body, ok, cancel, danger = false }) {
  return new Promise(resolve => {
    const close = modal([
      h('h3', title),
      body ? h('p.muted', body) : null,
      h('div.row.gap.end',
        h('button.btn.ghost', { onclick: () => { close(); resolve(false); } }, cancel),
        h('button.btn' + (danger ? '.red' : ''), { onclick: () => { close(); resolve(true); } }, ok)),
    ]);
  });
}

// ---------- confetti ----------
export function confetti(count = 140) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#fx');
  const c = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  c.scale(dpr, dpr);
  const colors = ['#22b573', '#f5b82e', '#2fa4e7', '#ef5350', '#8e6cf0', '#ff9f43'];
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 6, hh: 8 + Math.random() * 8,
    col: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  cv.style.display = 'block';
  (function frame(t) {
    const el = t - start;
    c.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      c.save(); c.translate(p.x, p.y); c.rotate(p.r);
      c.globalAlpha = Math.max(0, 1 - el / 2600);
      c.fillStyle = p.col; c.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh * Math.abs(Math.cos(p.r * 2)));
      c.restore();
    }
    if (el < 2600) requestAnimationFrame(frame);
    else { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; }
  })(start);
}

// ---------- text-to-speech ----------
let voices = [];
const voiceListeners = new Set();
function loadVoices() {
  const had = voices.length;
  voices = (speechSynthesis?.getVoices() || []).filter(v => /^ar/i.test(v.lang));
  if (!had && voices.length) voiceListeners.forEach(fn => fn());
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}
/** Call fn once Arabic voices become available (they load asynchronously). */
export const onVoices = fn => voiceListeners.add(fn);
export const canSpeak = () => 'speechSynthesis' in window && voices.length > 0;
export function speak(text, onend) {
  if (!canSpeak()) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voices[0].lang;
  u.voice = voices.find(v => /SA|EG/i.test(v.lang)) || voices[0];
  u.rate = state.settings.ttsRate;
  if (onend) u.onend = onend;
  speechSynthesis.speak(u);
  return true;
}
const stopHooks = new Set();
/** fn runs whenever playback should stop (navigation, a new question, another Listen). */
export const onStop = fn => stopHooks.add(fn);
export function stopSpeaking() { stopAudio(); stopHooks.forEach(fn => fn()); if ('speechSynthesis' in window) speechSynthesis.cancel(); }

/** Hadith n can be heard: a recorded file, or a device voice. */
export const canListen = n => !!audioFor(n) || canSpeak();
/** Play hadith n: its recorded file when there is one (with word timings), else the device voice reads `text`. */
export function listen(n, text, { onEnd = null, onTick = null, from = 0 } = {}) {
  if (audioFor(n)) return playHadith(n, { from, onTick, onEnd });
  return speak(text, onEnd);
}
/** onTick for listen(): marks the spoken word (or paragraph) inside a rendered hadith under `root`. */
export function sayHighlighter(root) {
  return (p, w) => {
    root.querySelectorAll('.say').forEach(x => x.classList.remove('say'));
    if (p < 0) return;
    const para = root.querySelector(`[data-p="${p}"]`);
    if (!para) return;
    if (w < 0) { para.classList.add('say'); return; }
    para.querySelectorAll(`[data-w="${w}"]`).forEach(x => x.classList.add('say'));
  };
}

// ---------- misc ----------
export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const pick = a => a[(Math.random() * a.length) | 0];
export const sample = (a, k) => shuffle(a).slice(0, k);
