// First-visit introduction: what the app is and does, then where to start
// (from the beginning, from hadith already memorised, or with everything unlocked).
import { state, save, setSetting } from './store.js';
import { HADITH } from './data.js';
import { h, clear, modal, svgIcon } from './ui.js';
import { t, L, num, isAr, applyLang } from './i18n.js';
import { prog, isLearned, FACETS } from './srs.js';

const DAY = 864e5;

/**
 * Mark hadith as already memorised: learned (level 1), with a "learning" strength until reviews
 * confirm it, and first reviews spread over the next week so they don't all fall due at once.
 */
export function markMemorised(ns) {
  const now = Date.now();
  const todo = ns.filter(n => !isLearned(n));
  todo.forEach((n, i) => {
    const p = prog(n);
    p.box = 1;
    p.learnedAt = now;
    p.due = now + Math.floor((i * 7) / Math.max(1, todo.length)) * DAY;
    for (const f of FACETS) if (!p.f[f].n) p.f[f].s = Math.max(p.f[f].s, 0.65);
  });
  save();
  return todo.length;
}

/** Grid of the 50 hadith to tick; returns { el, selected: Set }. */
/** allowed(n): whether n can be ticked (the practice picker greys out locked hadith). onChange runs after each tick. */
export function hadithPicker(initial = [], { allowed = () => true, onChange = null, note = null } = {}) {
  const selected = new Set(initial.filter(allowed));
  const count = h('span.pick-count');
  const btns = HADITH.map(hd => h('button.pick-n' + (hd.ibnRajab ? '.ir' : ''), {
    type: 'button', 'aria-pressed': 'false', title: L(hd.title), disabled: !allowed(hd.n),
    onclick: e => { selected.has(hd.n) ? selected.delete(hd.n) : selected.add(hd.n); paint(); e.currentTarget.blur?.(); },
  }, allowed(hd.n) ? num(hd.n) : '🔒'));
  const range = (a, b, label) => h('button.tchip', {
    type: 'button',
    onclick: () => { const ns = HADITH.filter(x => x.n >= a && x.n <= b && allowed(x.n)); const all = ns.every(x => selected.has(x.n));
      ns.forEach(x => (all ? selected.delete(x.n) : selected.add(x.n))); paint(); },
  }, label);
  const paint = () => {
    btns.forEach((b, i) => { const on = selected.has(i + 1); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    count.textContent = t('intro.selected', { n: selected.size });
    onChange?.(selected);
  };
  paint();
  const el = h('div.picker',
    h('div.chips.wrap', range(1, 10, t('unit.range', { a: 1, b: 10 })), range(1, 42, t('range.nawawi')), range(43, 50, t('range.ibnRajab')),
      h('button.tchip', { type: 'button', onclick: () => { selected.clear(); paint(); } }, t('intro.clear'))),
    h('div.pick-grid', btns),
    h('div.pick-foot', count, h('small.muted', note || t('intro.pickNote'))));
  return { el, selected };
}

const FEATURES = [
  ['🧭', 'intro.f.learn'], ['🔁', 'intro.f.review'], ['📖', 'intro.f.books'], ['🔊', 'intro.f.audio'], ['📴', 'intro.f.offline'],
];

/** The two-step introduction. onLang() re-renders the app behind it when the language changes. */
export function showIntro({ onLang, onDone } = {}) {
  const box = h('div.intro');
  let step = 1, choice = 'start', picker = null;
  let close = null;
  const finish = () => {
    let msg = t('intro.done.start');
    if (choice === 'known' && picker?.selected.size) {
      const k = markMemorised([...picker.selected]);
      msg = t('intro.done.known', { n: k });
    } else if (choice === 'all') {
      setSetting('unlockAll', true);
      msg = t('intro.done.all');
    }
    state.onboarded = true;
    save(true);
    close();
    onDone?.(msg);
  };
  const langSeg = () => h('div.seg.intro-lang', ['en', 'ar'].map(v => h('button.seg-btn' + ((isAr() ? 'ar' : 'en') === v ? '.on' : ''), {
    type: 'button', onclick: () => { setSetting('lang', v); applyLang(); onLang?.(); paint(); },
  }, v === 'ar' ? 'العربية' : 'English')));

  function paint() {
    clear(box);
    box.dir = isAr() ? 'rtl' : 'ltr';
    if (step === 1) {
      box.append(
        h('div.intro-top', langSeg(),
          h('button.icon-btn.small', { type: 'button', 'aria-label': t('btn.close'), onclick: () => { state.onboarded = true; save(true); close(); } }, svgIcon('x', 18))),
        h('div.intro-hero',
          h('span.intro-logo', { html: '<svg width="64" height="64" aria-hidden="true"><use href="#i-logo"/></svg>' }),
          h('h2', t('app.name')), h('div.muted', t('app.tagline'))),
        h('p.intro-lead', t('intro.lead')),
        h('ul.intro-feats', FEATURES.map(([ico, key]) => h('li', h('span.intro-ico', ico),
          h('span', h('strong', t(key)), h('small', t(key + '.d')))))),
        h('div.intro-cta', h('button.btn.green.big', { type: 'button', onclick: () => { step = 2; paint(); } }, t('intro.next'))));
    } else {
      const card = (id, ico, title, sub) => h('button.intro-choice' + (choice === id ? '.on' : ''), {
        type: 'button', role: 'radio', 'aria-checked': choice === id ? 'true' : 'false',
        onclick: () => { choice = id; paint(); },
      }, h('span.intro-ico', ico), h('span', h('strong', title), h('small', sub)));
      if (choice === 'known' && !picker) picker = hadithPicker();
      box.append(
        h('div.intro-top', h('button.icon-btn.small', { type: 'button', 'aria-label': t('btn.back'), onclick: () => { step = 1; paint(); } }, svgIcon('back', 18))),
        h('h2', t('intro.where')),
        h('div.intro-choices', { role: 'radiogroup' },
          card('start', '🌱', t('intro.c.start'), t('intro.c.start.d')),
          card('known', '✅', t('intro.c.known'), t('intro.c.known.d')),
          choice === 'known' ? picker.el : null,
          card('all', '🔓', t('intro.c.all'), t('intro.c.all.d'))),
        h('div.intro-cta', h('button.btn.green.big', { type: 'button', onclick: finish }, t('intro.go'))));
    }
  }
  paint();
  close = modal(box, { dismissable: false, cls: 'intro-box' });
}

/** Settings: tick the hadith you already know (the picker on its own). */
export function showKnownPicker({ onDone } = {}) {
  const picker = hadithPicker(HADITH.map(x => x.n).filter(isLearned));
  const before = new Set(picker.selected);
  let close = null;
  close = modal(h('div.intro', { dir: isAr() ? 'rtl' : 'ltr' },
    h('h3', t('intro.c.known')), h('p.small.muted', t('intro.c.known.d')),
    picker.el,
    h('div.row.gap.end',
      h('button.btn.ghost', { type: 'button', onclick: () => close() }, t('btn.cancel')),
      h('button.btn.green', {
        type: 'button', onclick: () => {
          const k = markMemorised([...picker.selected].filter(n => !before.has(n)));
          close();
          onDone?.(t('intro.done.known', { n: k }));
        },
      }, t('btn.ok')))), { cls: 'intro-box' });
}
