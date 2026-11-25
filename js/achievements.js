// Achievements: definitions + unlock checks.
import { state, save, currentStreak } from './store.js';
import { isLearned, status } from './srs.js';

const count = pred => Array.from({ length: 50 }, (_, i) => i + 1).filter(pred).length;
const learned = () => count(isLearned);
const strong = () => count(n => status(n) === 'strong');

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🌱', test: s => s.stats.lessons >= 1 },
  { id: 'learn5', icon: '📗', test: () => learned() >= 5 },
  { id: 'learn10', icon: '📘', test: () => learned() >= 10 },
  { id: 'learn25', icon: '🧭', test: () => learned() >= 25 },
  { id: 'nawawi', icon: '📜', test: () => count(n => n <= 42 && isLearned(n)) === 42 },
  { id: 'ibnRajab', icon: '🕌', test: () => count(n => n > 42 && isLearned(n)) === 8 },
  { id: 'all50', icon: '👑', test: () => learned() === 50 },
  { id: 'strong10', icon: '💪', test: () => strong() >= 10 },
  { id: 'strong50', icon: '🏆', test: () => strong() === 50 },
  { id: 'streak3', icon: '🔥', test: () => currentStreak() >= 3 },
  { id: 'streak7', icon: '📅', test: () => currentStreak() >= 7 },
  { id: 'streak30', icon: '⛰️', test: () => currentStreak() >= 30 },
  { id: 'perfect', icon: '💎', test: s => s.stats.perfect >= 1 },
  { id: 'combo15', icon: '⚡', test: s => s.stats.bestCombo >= 15 },
  { id: 'xp1000', icon: '⭐', test: s => s.xp >= 1000 },
  { id: 'xp5000', icon: '🌟', test: s => s.xp >= 5000 },
  { id: 'lightning20', icon: '🌩️', test: s => s.stats.lightningBest >= 20 },
  { id: 'weak5', icon: '🛡️', test: s => s.stats.weakSessions >= 5 },
  { id: 'recite10', icon: '🎙️', test: s => s.stats.recites >= 10 },
];

/** Unlock anything newly earned; returns the new achievements. */
export function checkAchievements() {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements[a.id] && a.test(state)) {
      state.achievements[a.id] = Date.now();
      fresh.push(a);
    }
  }
  if (fresh.length) save();
  return fresh;
}
