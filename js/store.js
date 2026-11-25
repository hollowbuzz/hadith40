// Persistent state (localStorage) + export / import.
const KEY = 'arbaeen.v1';
export const APP_ID = 'arbaeen-hadith';
export const DATA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  lang: 'auto',          // 'auto' | 'ar' | 'en'
  theme: 'auto',         // 'auto' | 'light' | 'dark'
  showTranslation: true,
  showTashkeel: true,
  arFont: 'amiri',       // 'amiri' | 'scheherazade' | 'naskh' | 'system'
  arSize: 26,            // px
  sound: true,
  volume: 0.7,
  haptics: true,
  dailyGoal: 30,         // XP
  lessonLength: 10,      // questions
  hearts: false,         // hearts (lives) per lesson
  typing: false,         // typed answers (Arabic keyboard)
  unlockAll: false,
  autoListen: false,
  ttsRate: 0.85,
  types: { order: true, blank: true, next: true, number: true, narrator: true, takhreej: true, meaning: true, match: true },
};

function fresh() {
  return {
    v: DATA_VERSION,
    createdAt: Date.now(),
    settings: structuredClone(DEFAULT_SETTINGS),
    progress: {},
    xp: 0,
    daily: {},
    streak: { count: 0, best: 0, lastDay: null },
    stats: { answers: 0, correct: 0, lessons: 0, perfect: 0, bestCombo: 0, lightningBest: 0, weakSessions: 0, recites: 0, timeMs: 0 },
    achievements: {},
  };
}

function merge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base;
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = merge(base[k], v);
    } else if (v !== undefined) {
      base[k] = v;
    }
  }
  return base;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(fresh(), JSON.parse(raw));
  } catch (e) { console.warn('Could not read saved progress', e); }
  return fresh();
}

export const state = load();
const listeners = new Set();
let saveTimer = null;

export function save(now = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Could not save progress', e); }
  };
  if (now) write(); else saveTimer = setTimeout(write, 250);
  listeners.forEach(fn => fn());
}
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
window.addEventListener('pagehide', () => save(true));

export function setSetting(key, value) { state.settings[key] = value; save(); }

// ---------- dates ----------
export function dayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

// ---------- xp / streak / level ----------
export function xpToday() { return state.daily[dayKey()] || 0; }
export function addXp(n) {
  if (!n) return;
  const k = dayKey();
  state.xp += n;
  state.daily[k] = (state.daily[k] || 0) + n;
  save();
}
/** Returns the live streak (0 when it was broken). */
export function currentStreak() {
  const { count, lastDay } = state.streak;
  if (!lastDay) return 0;
  const today = dayKey();
  return (lastDay === today || lastDay === addDays(today, -1)) ? count : 0;
}
/** Called when a lesson is finished. Returns true when the streak grew today. */
export function touchStreak() {
  const today = dayKey();
  const s = state.streak;
  if (s.lastDay === today) return false;
  s.count = s.lastDay === addDays(today, -1) ? s.count + 1 : 1;
  s.lastDay = today;
  s.best = Math.max(s.best, s.count);
  save();
  return true;
}
const T = L => 25 * L * (L + 1);
export function levelInfo(xp = state.xp) {
  let L = 0;
  while (T(L + 1) <= xp) L++;
  const lo = T(L), hi = T(L + 1);
  return { level: L + 1, into: xp - lo, need: hi - lo, pct: (xp - lo) / (hi - lo) };
}

// ---------- export / import ----------
export function exportData() {
  const payload = { app: APP_ID, version: DATA_VERSION, exportedAt: new Date().toISOString(), data: state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `arbaeen-progress-${dayKey()}.json`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function parseImport(text) {
  const obj = JSON.parse(text);
  const data = obj && obj.app === APP_ID ? obj.data : obj;
  if (!data || typeof data !== 'object' || typeof data.progress !== 'object' || typeof data.settings !== 'object') {
    throw new Error('invalid');
  }
  return data;
}

export function replaceState(data) {
  const next = merge(fresh(), data);
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  save(true);
}

export function resetProgress() {
  const settings = state.settings;
  replaceState({ ...fresh(), settings });
}
