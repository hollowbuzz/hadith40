// Record yourself reciting a hadith and play it back, faster or slower.
// Recordings stay on this device (IndexedDB); the newest KEEP per hadith are kept.
import { h, clear, svgIcon, toast, onStop } from './ui.js';
import { t, num, isAr } from './i18n.js';
import { state, setSetting } from './store.js';

const DB = 'arbaeen-recordings', STORE = 'rec', KEEP = 10;
export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && window.indexedDB);

// ---------------------------------------------------------------- storage
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('n', 'n');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const x = d.transaction(STORE, mode);
    const out = fn(x.objectStore(STORE));
    x.oncomplete = () => resolve(out?.result ?? out);
    x.onerror = () => reject(x.error);
  });
}
export async function listRecordings(n) {
  const all = await tx('readonly', s => s.index('n').getAll(n));
  return all.sort((a, b) => b.at - a.at);
}
async function saveRecording(rec) {
  await tx('readwrite', s => s.put(rec));
  const all = await listRecordings(rec.n);
  for (const old of all.slice(KEEP)) await tx('readwrite', s => s.delete(old.id));
}
const deleteRecording = id => tx('readwrite', s => s.delete(id));

// ---------------------------------------------------------------- playback (one at a time)
let playing = null; // { audio, url, onDone }
export function stopPlayback() {
  if (!playing) return;
  const p = playing;
  playing = null;
  p.audio.pause();
  URL.revokeObjectURL(p.url);
  p.onDone?.();
}
onStop(stopPlayback);

function play(rec, { onTime, onDone }) {
  stopPlayback();
  const url = URL.createObjectURL(rec.blob);
  const audio = new Audio(url);
  audio.preservesPitch = true;
  audio.playbackRate = speed();
  const p = { audio, url, onDone, id: rec.id };
  playing = p;
  audio.addEventListener('timeupdate', () => onTime?.(audio.currentTime, rec.duration));
  audio.addEventListener('ended', () => { if (playing === p) stopPlayback(); });
  audio.play().catch(() => { if (playing === p) stopPlayback(); });
  return p;
}
const speed = () => (SPEEDS.includes(state.settings.recSpeed) ? state.settings.recSpeed : 1);

// ---------------------------------------------------------------- recording
function pickMime() {
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return types.find(x => MediaRecorder.isTypeSupported?.(x)) || '';
}
const ext = mime => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Record / play back panel for hadith n.
 * compact: the lesson version — record, play back the newest, speed; no history list.
 */
export function recorderPanel(n, { compact = false } = {}) {
  const wrap = h('section.rec' + (compact ? '.compact' : ''));
  if (!canRecord()) {
    wrap.append(h('p.small.muted', t('rec.unsupported')));
    return wrap;
  }
  let rec = null; // { mr, stream, chunks, started, ctx, raf }
  const recBtn = h('button.btn.red.rec-btn', { type: 'button', onclick: () => (rec ? stop() : start()) });
  const timer = h('span.rec-timer');
  const meter = h('span.rec-meter', h('i'));
  const list = h('div.rec-list');
  const speeds = h('div.seg.rec-speeds', { role: 'radiogroup', 'aria-label': t('rec.speed') }, SPEEDS.map(v => h('button.seg-btn', {
    type: 'button', role: 'radio', 'data-v': v,
    onclick: () => { setSetting('recSpeed', v); markSpeed(); if (playing) playing.audio.playbackRate = v; },
  }, num(v) + '×')));
  const markSpeed = () => speeds.querySelectorAll('.seg-btn').forEach(b => {
    const on = +b.dataset.v === speed();
    b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  const paintBtn = () => {
    clear(recBtn).append(svgIcon(rec ? 'pause' : 'mic', 18), h('span', rec ? t('rec.stop') : t('rec.record')));
    recBtn.classList.toggle('on', !!rec);
    timer.textContent = rec ? '0:00' : '';
    meter.hidden = !rec;
  };

  async function start() {
    stopPlayback();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch {
      toast(t('rec.denied'), { icon: '🎙️', ms: 5000 });
      return;
    }
    const mime = pickMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      const r = rec0;
      const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
      const duration = (Date.now() - r.started) / 1000;
      if (duration >= 1 && blob.size) {
        await saveRecording({ id: `${n}-${r.started}`, n, at: r.started, duration, mime: blob.type, blob });
        await paintList(true);
      }
    };
    // a live level meter (and: stop if the panel was removed, e.g. the lesson moved on)
    let ctx = null, an = null, buf = null;
    try {
      ctx = new AudioContext();
      an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      buf = new Uint8Array(an.fftSize);
    } catch { /* no meter */ }
    const rec0 = { mr, stream, started: Date.now(), ctx };
    rec = rec0;
    const tick = () => {
      if (rec !== rec0) return;
      if (!wrap.isConnected) { stop(); return; }
      timer.textContent = clock((Date.now() - rec0.started) / 1000);
      if (an) {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        meter.firstChild.style.width = Math.min(100, peak / 0.9) + '%';
      }
      rec0.raf = requestAnimationFrame(tick);
    };
    mr.start(1000);
    window.addEventListener('hashchange', stop);
    paintBtn();
    tick();
  }

  function stop() {
    if (!rec) return;
    const r = rec;
    rec = null;
    window.removeEventListener('hashchange', stop);
    cancelAnimationFrame(r.raf);
    if (r.mr.state !== 'inactive') r.mr.stop();
    r.stream.getTracks().forEach(tr => tr.stop());
    r.ctx?.close?.();
    paintBtn();
  }

  // ---- the list (or, compact, just the newest)
  async function paintList(autoplayNewest = false) {
    let recs = [];
    try { recs = await listRecordings(n); } catch { /* storage unavailable */ }
    if (compact) recs = recs.slice(0, 1).filter(r => r.at >= opened);
    clear(list);
    if (!recs.length) { if (!compact) list.append(h('p.small.muted', t('rec.none'))); return; }
    recs.forEach((r, i) => list.append(row(r, i)));
    if (autoplayNewest && compact) list.querySelector('.rec-play')?.click();
  }
  const opened = Date.now();

  function row(r, i) {
    const bar = h('span.rec-bar', h('i'));
    const time = h('span.rec-time', clock(r.duration));
    const btn = h('button.icon-btn.small.rec-play', {
      type: 'button', 'aria-label': t('rec.play'),
      onclick: () => {
        if (playing?.id === r.id) { stopPlayback(); return; }
        wrap.querySelectorAll('.rec-row.on').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        clear(btn).append(svgIcon('pause', 18));
        play(r, {
          onTime: (c, d) => { bar.firstChild.style.width = Math.min(100, 100 * c / d) + '%'; time.textContent = clock(c) + ' / ' + clock(d); },
          onDone: () => { el.classList.remove('on'); clear(btn).append(svgIcon('play', 18)); bar.firstChild.style.width = '0'; time.textContent = clock(r.duration); },
        });
      },
    }, svgIcon('play', 18));
    const when = new Date(r.at).toLocaleString(isAr() ? 'ar-EG' : undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const el = h('div.rec-row', btn,
      h('div.rec-info', h('span.rec-when', i === 0 && !compact ? t('rec.latest') + ' · ' + when : when), h('div.rec-prog', bar, time)),
      compact ? null : h('a.icon-btn.small', {
        href: URL.createObjectURL(r.blob), download: `hadith-${n}-${new Date(r.at).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext(r.mime)}`,
        'aria-label': t('rec.download'), title: t('rec.download'),
      }, svgIcon('download', 18)),
      compact ? null : h('button.icon-btn.small', {
        type: 'button', 'aria-label': t('rec.delete'), title: t('rec.delete'),
        onclick: async () => { if (playing?.id === r.id) stopPlayback(); await deleteRecording(r.id); paintList(); },
      }, svgIcon('trash', 18)));
    return el;
  }

  paintBtn();
  markSpeed();
  wrap.append(
    compact ? null : h('h3.rec-title', '🎙️ ' + t('rec.title')),
    compact ? null : h('p.small.muted', t('rec.hint')),
    h('div.rec-ctl', recBtn, timer, meter),
    list,
    h('div.rec-speed-row', h('small.muted', t('rec.speed')), speeds),
    compact ? null : h('p.small.muted', t('rec.private')));
  paintList();
  return wrap;
}
