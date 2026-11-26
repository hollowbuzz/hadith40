// App shell: router, header, views.
import { HADITH, SOURCE, TAKHREEJ } from './data.js';
import {
  state, save, onChange, setSetting, xpToday, currentStreak, levelInfo, exportData, parseImport, replaceState,
  resetProgress, dayKey, addDays,
} from './store.js';
import { h, $, clear, svgIcon, toast, modal, confirmDialog, speak, stopSpeaking, canSpeak, onVoices, canListen, listen, sayHighlighter } from './ui.js';
import { loadAudioIndex, onAudioIndex, audioFor, hasAudio, timeOf } from './audio.js';
import { t, L, num, isAr, applyLang, lang } from './i18n.js';
import { sfx, unlockAudio } from './sound.js';
import { prep, normalize, firstLetter } from './text.js';
import {
  FACETS, prog, peek, isLearned, isUnlocked, crowns, status, strength, facetStrength, dueList, weakList,
  learnedList, nextToLearn, toggleFav, isFav, isDue,
} from './srs.js';
import { renderHadith, arEl, ar, crownsEl, strengthBar, statusChip, nameEl, sourceLink, hadithCard, heading } from './render.js';
import { buildLearn, buildPractice, buildMixed, reviewPool, weakPool, recitePool, rangePool, enabledTypes, GEN } from './quiz.js';
import { runSession, runLightning, inLesson, lessonNavigatedAway, plainText } from './lesson.js';
import { ACHIEVEMENTS, checkAchievements } from './achievements.js';
import { sharhTab, bookView, bookCards, BOOKS, MODES, shamelaUrl } from './sharh.js';
import { iraabTab, iraabBookView, iraabCard, IRAAB } from './iraab.js';
import { recorderPanel } from './recorder.js';

const VERSION = '1.4.1';
const H = n => HADITH[n - 1];
const view = () => $('#view');

const UNITS = [
  { from: 1, to: 10, tone: 'green' },
  { from: 11, to: 20, tone: 'blue' },
  { from: 21, to: 30, tone: 'purple' },
  { from: 31, to: 42, tone: 'orange', sub: 'unit.nawawiEnd' },
  { from: 43, to: 50, tone: 'gold', sub: 'unit.ibnRajab' },
];

// =====================================================================
// Appearance
// =====================================================================
const FONTS = {
  amiri: { css: "'Amiri', 'Noto Naskh Arabic', serif", href: null },
  scheherazade: { css: "'Scheherazade New', 'Amiri', serif", href: 'https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&display=swap' },
  naskh: { css: "'Noto Naskh Arabic', 'Amiri', serif", href: 'https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap' },
  system: { css: "'Geeza Pro', 'Arabic Typesetting', 'Traditional Arabic', 'Noto Naskh Arabic', serif", href: null },
};
function applyAppearance() {
  const s = state.settings;
  const root = document.documentElement;
  if (s.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', s.theme);
  const f = FONTS[s.arFont] || FONTS.amiri;
  if (f.href && !document.querySelector(`link[href="${f.href}"]`)) document.head.append(h('link', { rel: 'stylesheet', href: f.href }));
  root.style.setProperty('--ar-font', f.css);
  root.style.setProperty('--ar-size', s.arSize + 'px');
  const dark = s.theme === 'dark' || (s.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#12161b' : '#22b573');
}

// =====================================================================
// Header + nav
// =====================================================================
function goalRing(size = 34) {
  const goal = state.settings.dailyGoal, x = xpToday();
  const pct = Math.min(1, x / goal);
  const r = 15, c = 2 * Math.PI * r;
  const span = h('span.ring' + (pct >= 1 ? '.done' : ''), { title: `${t('goal')}: ${num(x)}/${num(goal)} ${t('xp')}` });
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 36 36"><circle cx="18" cy="18" r="${r}" class="ring-bg"/><circle cx="18" cy="18" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 18 18)"/></svg>`;
  span.append(h('span.ring-ico', pct >= 1 ? '✓' : '⚡'));
  return span;
}

function renderHeader() {
  const streak = currentStreak();
  const lv = levelInfo();
  clear($('#stats')).append(
    h('a.pill.streak' + (streak ? '.on' : ''), { href: '#/profile', title: t('streak', { n: streak }) }, h('span.pill-ico', '🔥'), num(streak)),
    h('a.pill.xp', { href: '#/profile', title: t('goal') }, goalRing(26), h('span', num(xpToday()), h('small', '/' + num(state.settings.dailyGoal)))),
    h('a.pill.lvl', { href: '#/profile', title: t('level', { n: lv.level }) }, h('span.pill-ico', '⭐'), num(lv.level)));
  $('#brand-name').textContent = t('app.name');
  $('#brand-sub').textContent = t('app.tagline');
}

const NAV = [
  ['', 'learn', 'nav.learn'], ['practice', 'practice', 'nav.practice'], ['library', 'book', 'nav.library'],
  ['profile', 'user', 'nav.profile'], ['settings', 'gear', 'nav.settings'],
];
function renderNav(active) {
  const due = dueList().length;
  clear($('#nav')).append(...NAV.map(([r, ico, key]) => h('a.nav-item' + (active === r ? '.active' : ''), { href: '#/' + r, 'aria-current': active === r ? 'page' : null },
    h('span.nav-ico', svgIcon(ico, 24), r === 'practice' && due ? h('span.badge', num(due)) : null), h('span.nav-label', t(key)))));
}

// =====================================================================
// Router
// =====================================================================
let currentRoute = null;
let lessonReturn = null; // { route, y } — where to come back to after a lesson
function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name = '', arg, ...rest] = hash.split('/');
  if (name === 'lesson') {
    if (!inLesson()) location.replace('#/');
    else lessonReturn = { route: currentRoute, y: scrollY };
    return;
  }
  lessonNavigatedAway();
  stopSpeaking();
  const back = lessonReturn && lessonReturn.route === hash ? lessonReturn.y : null;
  lessonReturn = null;
  const same = currentRoute === hash;
  currentRoute = hash;
  const views = {
    '': homeView, practice: practiceView, library: libraryView, h: hadithView, profile: profileView, settings: settingsView,
    book: (el, key) => (key === 'iraab' ? iraabBookView(el) : bookView(el, key)),
  };
  const fn = views[name] || homeView;
  const el = clear(view());
  el.className = 'view view-' + (name || 'home');
  fn(el, arg, rest);
  renderNav(name === 'h' || name === 'book' ? 'library' : name);
  renderHeader();
  if (back != null) window.scrollTo(0, back);
  else if (!same) window.scrollTo(0, 0);
}
const rerender = () => { const y = scrollY; route(); window.scrollTo(0, y); };

// =====================================================================
// Home — learning path
// =====================================================================
function homeView(el) {
  const due = dueList();
  const weak = weakList();
  const nxt = nextToLearn();
  const goal = state.settings.dailyGoal, x = xpToday();
  const none = !learnedList().length;

  el.append(h('section.hero',
    h('div.hero-goal', goalRing(64),
      h('div', h('div.hero-k', t('goal')), h('div.hero-v', num(Math.min(x, goal)), h('small', ' / ' + num(goal) + ' ' + t('xp'))),
        x >= goal ? h('div.hero-done', t('goal.done')) : null)),
    h('div.hero-actions',
      h('button.qa.blue' + (due.length ? '' : '.dim'), { type: 'button', onclick: () => startReview() },
        h('span.qa-ico', '🔁'), h('span', h('strong', t('home.review')), h('small', none ? t('home.startFirst') : due.length ? t('home.reviewDue', { n: due.length }) : t('home.noneDue')))),
      h('button.qa.red' + (weak.length ? '' : '.dim'), { type: 'button', onclick: () => startWeak() },
        h('span.qa-ico', '🎯'), h('span', h('strong', t('home.weak')), h('small', none ? t('home.startFirst') : weak.length ? t('home.weakN', { n: weak.length }) : t('home.noWeak')))))));

  if (!nxt && learnedList().length === 50) el.append(h('div.banner.gold', '👑 ' + t('home.allLearned')));

  const path = h('section.path');
  UNITS.forEach((u, ui) => {
    const learnedIn = Array.from({ length: u.to - u.from + 1 }, (_, i) => u.from + i).filter(isLearned).length;
    path.append(h('div.unit.' + u.tone,
      h('div', h('div.unit-k', t('unit', { n: ui + 1 })), h('div.unit-t', u.sub ? t(u.sub) : t('unit.range', { a: u.from, b: u.to })),
        u.sub ? h('div.unit-s', t('unit.range', { a: u.from, b: u.to })) : null),
      h('div.unit-count', num(learnedIn) + '/' + num(u.to - u.from + 1))));
    const nodes = h('div.nodes');
    for (let n = u.from; n <= u.to; n++) {
      const k = n - u.from;
      const off = [0, 1, 2, 1, 0, -1, -2, -1][k % 8];
      const unlocked = isUnlocked(n), learned = isLearned(n);
      const st = status(n);
      const cls = !unlocked ? 'locked' : !learned ? (n === nxt ? 'next' : 'open') : st;
      const node = h('div.node-wrap' + (n === nxt ? '.has-tip' : ''), { style: { '--x': off * 46 + 'px' } },
        n === nxt ? h('div.start-tip', t('home.start')) : null,
        h('button.node.' + cls + '.' + u.tone + (isDue(n) ? '.due' : ''), {
          type: 'button', 'aria-label': `${t('hadithN', { n })} — ${L(H(n).title)}`,
          onclick: () => { sfx.tap(); nodeSheet(n); },
        }, h('span.node-num', unlocked ? num(n) : '🔒'), learned ? h('span.node-ring', { style: { '--p': strength(n) } }) : null),
        learned ? crownsEl(n, 11) : h('div.node-cap', L(H(n).title)));
      nodes.append(node);
    }
    path.append(nodes);
  });
  el.append(path);
  // scroll the "next" node into view on first load
  const tip = el.querySelector('.start-tip');
  if (tip && !sessionStorage.getItem('scrolled')) {
    sessionStorage.setItem('scrolled', '1');
    setTimeout(() => tip.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
  }
}

function nodeSheet(n) {
  const hd = H(n);
  const unlocked = isUnlocked(n), learned = isLearned(n);
  const close = modal([
    h('div.sheet-head',
      h('div.big-num' + (hd.ibnRajab ? '.ir' : ''), num(n)),
      h('div', h('h3', L(hd.title)), h('div.muted', heading(hd)), h('div.chips', ...statusChip(n), hd.ibnRajab ? h('span.chip.ir', t('hd.ibnRajab')) : null))),
    h('div.sheet-open', arEl(prep(n).opening)),
    learned ? h('div.sheet-meter', crownsEl(n, 16), strengthBar(strength(n))) : null,
    !unlocked ? h('p.muted', '🔒 ' + t('home.locked')) : null,
    h('div.row.gap',
      h('button.btn.ghost', { type: 'button', onclick: () => { close(); location.hash = '#/h/' + n; } }, t('home.read')),
      unlocked ? h('button.btn.green.grow', { type: 'button', onclick: () => { close(); learned ? startPractice(n) : startLearn(n); } },
        learned ? t('home.practice') : t('home.learn')) : null),
  ], { cls: 'sheet' });
}

// ---------- starters ----------
const here = () => location.hash || '#/';
export function startLearn(n) { runSession({ kind: 'learn', n, back: here(), questions: buildLearn(n), rebuild: () => buildLearn(n) }); }
export function startPractice(n) { runSession({ kind: 'practice', n, back: here(), questions: buildPractice(n), rebuild: () => buildPractice(n) }); }
function startReview() {
  if (!learnedList().length) return toast(t('pr.needLearn'));
  const pool = reviewPool();
  const make = () => buildMixed(pool, { mode: 'review' });
  runSession({ kind: 'review', back: here(), questions: make(), rebuild: make });
}
function startWeak() {
  if (!learnedList().length) return toast(t('pr.needLearn'));
  const pool = weakPool();
  const make = () => buildMixed(pool, { mode: 'weak' });
  runSession({ kind: 'weak', back: here(), questions: make(), rebuild: make });
}
function startRecite() {
  const pool = recitePool();
  if (!pool.length) return toast(t('pr.needLearn'));
  const make = () => pool.map(n => GEN.recite(n));
  runSession({ kind: 'recite', back: here(), questions: make(), rebuild: make });
}

// =====================================================================
// Practice hub
// =====================================================================
const drill = { types: null, range: 'all', from: 1, to: 10 };
function practiceView(el) {
  const learned = learnedList().length;
  const due = dueList().length;
  const weak = weakList().length;
  const card = (tone, ico, title, sub, onclick, disabled = false) => h('button.pcard.' + tone + (disabled ? '.dim' : ''), { type: 'button', onclick },
    h('span.pcard-ico', ico), h('span.pcard-body', h('strong', title), h('small', sub)), svgIcon('chev', 20));
  el.append(h('h1.page-title', t('pr.title')),
    h('div.pgrid',
      card('blue', '🔁', t('pr.review'), due ? t('pr.reviewSub', { n: due }) : (learned ? t('pr.reviewNone') : t('pr.needLearn')), startReview, !learned),
      card('red', '🎯', t('pr.weak'), learned ? t('pr.weakSub') + (weak ? ` · ${num(weak)}` : '') : t('pr.needLearn'), startWeak, !learned),
      card('gold', '⚡', t('pr.lightning'), t('pr.lightningSub') + ' · ' + t('pr.best', { n: state.stats.lightningBest }),
        () => runLightning(learned >= 4 ? learnedList() : HADITH.map(x => x.n), here())),
      card('purple', '🎙️', t('pr.recite'), learned ? t('pr.reciteSub') : t('pr.needLearn'), startRecite, !learned)));

  // custom drill
  if (!drill.types) drill.types = new Set(enabledTypes());
  const TYPES = ['order', 'blank', 'next', 'before', 'missing', 'spot', 'chain', 'number', 'narrator', 'takhreej', 'meaning', 'where', 'match'];
  const chips = h('div.chips.wrap', TYPES.map(k => h('button.tchip' + (drill.types.has(k) ? '.on' : ''), {
    type: 'button', 'aria-pressed': drill.types.has(k) ? 'true' : 'false',
    onclick: e => { drill.types.has(k) ? drill.types.delete(k) : drill.types.add(k); e.currentTarget.classList.toggle('on'); e.currentTarget.setAttribute('aria-pressed', drill.types.has(k)); sfx.tap(); },
  }, t('type.' + k))));
  const ranges = ['all', 'learned', 'nawawi', 'ibnRajab', 'custom'];
  const fromIn = h('input.num-in', { type: 'number', min: 1, max: 50, value: drill.from, 'aria-label': 'from', onchange: e => { drill.from = clamp(+e.target.value); } });
  const toIn = h('input.num-in', { type: 'number', min: 1, max: 50, value: drill.to, 'aria-label': 'to', onchange: e => { drill.to = clamp(+e.target.value); } });
  const custom = h('div.row.gap.custom-range' + (drill.range === 'custom' ? '' : '.hide'), fromIn, h('span', '–'), toIn);
  const rangeSel = h('div.seg', ranges.map(r => h('button.seg-btn' + (drill.range === r ? '.on' : ''), {
    type: 'button', onclick: e => {
      drill.range = r;
      rangeSel.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('on'));
      e.currentTarget.classList.add('on');
      custom.classList.toggle('hide', r !== 'custom');
    },
  }, t('range.' + r))));
  el.append(h('section.panel',
    h('h2', '🛠️ ' + t('pr.drill')),
    h('div.field', h('label', t('pr.types')), chips),
    h('div.field', h('label', t('pr.range')), rangeSel, custom),
    h('button.btn.big.green', {
      type: 'button', onclick: () => {
        const types = [...drill.types];
        if (!types.length) return toast(t('pr.noneSelected'));
        const pool = rangePool(drill.range, drill.from, drill.to);
        if (!pool.length) return toast(t('pr.needLearn'));
        const make = () => buildMixed(pool, { types, mode: 'drill' });
        runSession({ kind: 'drill', back: here(), questions: make(), rebuild: make });
      },
    }, t('btn.start'))));
}
const clamp = v => Math.max(1, Math.min(50, v | 0 || 1));

// =====================================================================
// Library
// =====================================================================
const lib = { q: '', filter: 'all' };
function libraryView(el) {
  const list = h('div.hlist');
  const paint = () => {
    clear(list);
    const q = lib.q.trim();
    const nq = normalize(q), lq = q.toLowerCase();
    const items = HADITH.filter(hd => {
      const n = hd.n;
      switch (lib.filter) {
        case 'learned': if (!isLearned(n)) return false; break;
        case 'weak': if (status(n) !== 'weak') return false; break;
        case 'due': if (!isDue(n)) return false; break;
        case 'fav': if (!isFav(n)) return false; break;
        case 'ibnRajab': if (!hd.ibnRajab) return false; break;
      }
      if (!q) return true;
      if (/^[0-9٠-٩]+$/.test(q)) return String(n) === q.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
      return (nq && (prep(n).tokens.some(tk => tk.norm.includes(nq)) || normalize(hd.title.ar + hd.narrator.ar).includes(nq)))
        || (hd.title.en + ' ' + hd.narrator.en + ' ' + hd.en.join(' ')).toLowerCase().includes(lq);
    });
    if (!items.length) list.append(h('p.empty', t('lib.none')));
    items.forEach(hd => list.append(hadithCard(hd.n, { onclick: () => { location.hash = '#/h/' + hd.n; } })));
  };
  const search = h('input.search', {
    type: 'search', placeholder: t('lib.search'), value: lib.q, 'aria-label': t('lib.search'),
    oninput: e => { lib.q = e.target.value; paint(); },
  });
  const filters = ['all', 'learned', 'weak', 'due', 'fav', 'ibnRajab'];
  const chips = h('div.chips.scroll', filters.map(f => h('button.fchip' + (lib.filter === f ? '.on' : ''), {
    type: 'button', onclick: e => { lib.filter = f; chips.querySelectorAll('.fchip').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); paint(); },
  }, t('filter.' + f))));
  el.append(h('h1.page-title', t('lib.title')),
    h('h2.sec-label', t('sh.commentaries')), bookCards([iraabCard()]),
    h('h2.sec-label', t('lib.hadith')), h('div.searchbar', svgIcon('search', 20), search), chips, list);
  paint();
}

// =====================================================================
// Hadith page
// =====================================================================
const hv = { tab: 'read', hide: 0, mode: 'random', seed: 1 };
function hadithView(el, arg, [sub, bookKey] = []) {
  const n = Math.max(1, Math.min(50, parseInt(arg, 10) || 1));
  // #/h/<n>/sharh[/<book>] and #/h/<n>/iraab open those tabs (links from a book's contents)
  if (sub === 'sharh' || sub === 'iraab') {
    hv.tab = sub;
    if (sub === 'sharh' && BOOKS.some(b => b.key === bookKey) && state.settings.sharhBook !== bookKey) setSetting('sharhBook', bookKey);
    // applied once: a later re-render must not undo a book picked on the page
    history.replaceState(null, '', '#/h/' + n);
    currentRoute = 'h/' + n;
  }
  const hd = H(n);
  const learned = isLearned(n), unlocked = isUnlocked(n);
  if (hv.n !== n) { hv.n = n; hv.seed = Math.random(); hv.revealed = new Set(); }

  const favBtn = h('button.icon-btn' + (isFav(n) ? '.fav' : ''), {
    type: 'button', 'aria-label': t('hd.fav'), 'aria-pressed': isFav(n) ? 'true' : 'false',
    onclick: e => { const f = toggleFav(n); e.currentTarget.classList.toggle('fav', f); e.currentTarget.setAttribute('aria-pressed', f); sfx.select(); },
  }, svgIcon('star', 24));
  el.append(h('div.hd-top',
    h('a.icon-btn', { href: '#/library', 'aria-label': t('btn.back') }, svgIcon('back', 24)),
    h('div.grow'),
    n > 1 ? h('a.icon-btn', { href: '#/h/' + (n - 1), 'aria-label': t('hd.prev') }, svgIcon('prev', 22)) : null,
    n < 50 ? h('a.icon-btn', { href: '#/h/' + (n + 1), 'aria-label': t('hd.next') }, svgIcon('next', 22)) : null,
    favBtn));

  el.append(h('header.hd-head',
    h('div.big-num.xl' + (hd.ibnRajab ? '.ir' : ''), num(n)),
    h('div.hd-titles',
      h('div.hd-heading', arEl(hd.heading)),
      h('h1', L(hd.title)),
      h('div.chips', ...statusChip(n), hd.ibnRajab ? h('span.chip.ir', t('hd.ibnRajab')) : null, learned ? crownsEl(n, 14) : null))));

  el.append(h('div.facts',
    h('div.fact', h('small', t('hd.narrator')), nameEl(hd.narrator)),
    h('div.fact', h('small', t('hd.takhreej')), nameEl(TAKHREEJ[hd.takhreej])),
    h('div.fact', h('small', t('hd.source')), sourceLink(hd))));

  // Listen: the recorded audio (words highlighted in the Read tab) or the device voice.
  let speaking = false;
  const player = {
    play(from = 0) {
      stopSpeaking();
      speaking = listen(n, plainText(hd), {
        from,
        onTick: (p, w) => { const r = body.querySelector('.reader'); if (r) sayHighlighter(r)(p, w); },
        onEnd: () => { speaking = false; if (listenBtn) listenBtn.lastChild.textContent = t('btn.listen'); },
      });
      if (speaking && listenBtn) listenBtn.lastChild.textContent = t('btn.stop');
    },
    stop() { stopSpeaking(); speaking = false; },
  };
  const listenBtn = canListen(n) ? h('button.btn.ghost', {
    type: 'button', onclick: () => (speaking ? player.stop() : player.play()),
  }, svgIcon('volume', 18), h('span', t('btn.listen'))) : null;
  el.append(h('div.row.gap.hd-actions',
    unlocked ? h('button.btn.green.grow', { type: 'button', onclick: () => (learned ? startPractice(n) : startLearn(n)) }, learned ? t('hd.practice') : t('hd.learn'))
      : h('div.muted.grow', '🔒 ' + t('home.locked')),
    listenBtn));

  const tabs = ['read', 'sharh', 'iraab', 'memorize', 'stats'];
  const body = h('div.tab-body');
  const tabBar = h('div.tabs', { role: 'tablist' }, tabs.map(k => h('button.tab' + (hv.tab === k ? '.on' : ''), {
    type: 'button', role: 'tab', 'aria-selected': hv.tab === k ? 'true' : 'false',
    onclick: () => { hv.tab = k; tabBar.querySelectorAll('.tab').forEach((b, i) => { b.classList.toggle('on', tabs[i] === k); b.setAttribute('aria-selected', tabs[i] === k); }); paintTab(); },
  }, t('hd.' + k))));
  el.append(tabBar, body);

  function paintTab() {
    clear(body);
    if (hv.tab === 'read') body.append(readTab(hd, player));
    else if (hv.tab === 'sharh') body.append(sharhTab(n));
    else if (hv.tab === 'iraab') body.append(iraabTab(n));
    else if (hv.tab === 'memorize') body.append(memorizeTab(hd));
    else body.append(statsTab(n));
  }
  paintTab();
}

function toggleRow(hd, repaint) {
  const s = state.settings;
  const tog = (key, label) => h('label.switch-inline', h('input', {
    type: 'checkbox', checked: s[key], onchange: e => { setSetting(key, e.target.checked); repaint(); },
  }), h('span.sw'), h('span', label));
  const size = d => () => { setSetting('arSize', Math.max(18, Math.min(44, s.arSize + d))); applyAppearance(); };
  return h('div.toolbar',
    tog('showTranslation', t('hd.translation')),
    tog('showTashkeel', t('hd.tashkeel')),
    h('div.grow'),
    h('div.sizebtns', { 'aria-label': t('hd.size') },
      h('button.icon-btn.small', { type: 'button', onclick: size(-2), 'aria-label': '−' }, 'A−'),
      h('button.icon-btn.small', { type: 'button', onclick: size(2), 'aria-label': '+' }, 'A+')));
}

function readTab(hd, player) {
  const box = h('div');
  const paint = () => {
    // with recorded audio, tapping a word plays the hadith from that word
    const recorded = !!audioFor(hd.n);
    const reader = h('article.reader' + (recorded ? '.has-audio' : ''), {
      onclick: recorded ? e => {
        const w = e.target.closest('[data-w]'), p = e.target.closest('[data-p]');
        if (w && p) player.play(timeOf(hd.n, +p.dataset.p, +w.dataset.w));
      } : null,
    }, renderHadith(hd, { legend: true }));
    clear(box).append(toggleRow(hd, paint), reader);
    if (recorded) box.append(h('p.small.muted', t('hd.tapToPlay')));
    hd.notes.forEach(nt => box.append(h('div.note', h('strong', t('hd.note') + ': '), L(nt))));
    if (state.settings.showTranslation) box.append(h('p.small.muted', t('hd.translationNote')));
  };
  paint();
  return box;
}

function memorizeTab(hd) {
  const box = h('div');
  const recPanel = recorderPanel(hd.n); // kept across repaints so a recording isn't cut off
  const tokens = prep(hd.n).tokens;
  // deterministic pseudo-random order per shuffle
  const rank = tokens.map((tk, i) => ({ i, r: frac(Math.sin((i + 1) * 9301 + hv.seed * 49297) * 233280) }));
  const byRandom = rank.slice().sort((a, b) => a.r - b.r).map(x => x.i);
  const paint = () => {
    clear(box);
    const levels = [0, 25, 50, 75, 100];
    const seg = h('div.seg', levels.map(v => h('button.seg-btn' + (hv.hide === v ? '.on' : ''), {
      type: 'button', onclick: () => { hv.hide = v; hv.revealed = new Set(); sfx.tap(); paint(); },
    }, num(v) + '%')));
    const modes = ['random', 'end', 'first'];
    const mseg = h('div.seg', modes.map(m => h('button.seg-btn' + (hv.mode === m ? '.on' : ''), {
      type: 'button', onclick: () => { hv.mode = m; hv.revealed = new Set(); sfx.tap(); paint(); },
    }, t('hd.mode.' + m))));
    const k = Math.round(tokens.length * hv.hide / 100);
    const order = hv.mode === 'end' ? tokens.map((_, i) => tokens.length - 1 - i) : byRandom;
    const hidden = new Set(order.slice(0, k));
    const text = h('div.reader.memo');
    let pIdx = -1, p = null, lastKind = null;
    tokens.forEach(tk => {
      if (tk.para !== pIdx) { pIdx = tk.para; p = h('p.hp.ar', { dir: 'rtl', lang: 'ar' }); text.append(p); lastKind = null; }
      const isHidden = hidden.has(tk.i) && !hv.revealed.has(tk.i);
      const word = hv.mode === 'first' && isHidden ? firstLetter(tk.core) : tk.core;
      const w = h('span.w.seg-' + tk.kind + (isHidden ? (hv.mode === 'first' ? '.fl' : '.hid') : '') + (hv.revealed.has(tk.i) ? '.peek' : ''), {
        onclick: isHidden ? () => { hv.revealed.add(tk.i); sfx.flip(); paint(); } : null,
        role: isHidden ? 'button' : null, tabindex: isHidden ? 0 : null,
      }, ar(word));
      p.append(lastKind === null ? '' : ' ', ar(tk.pre), w, ar(tk.post));
      lastKind = tk.kind;
    });
    box.append(
      h('div.field', h('label', t('hd.hide')), seg),
      h('div.field', mseg),
      h('div.row.gap', h('p.small.muted.grow', t('hd.tapReveal')),
        h('button.btn.small.ghost', { type: 'button', onclick: () => { hv.seed = Math.random(); hv.revealed = new Set(); sfx.flip(); memorizeRefresh(); } }, '🔀 ' + t('hd.shuffle'))),
      text,
      recPanel);
  };
  const memorizeRefresh = () => { const nb = memorizeTab(hd); box.replaceWith(nb); };
  paint();
  return box;
}
const frac = x => x - Math.floor(x);

function statsTab(n) {
  const p = peek(n);
  const box = h('div.stats-tab');
  if (!p || !p.box) box.append(h('p.muted', t('hd.notLearned')));
  else {
    const days = Math.ceil((p.due - Date.now()) / 864e5);
    box.append(h('div.kv', h('span', t('hd.nextReview')),
      h('strong', days <= 0 ? t('hd.dueNow') : days === 1 ? t('hd.tomorrow') : t('hd.inDays', { n: days }))));
    box.append(h('div.kv', h('span', t('hd.level')), crownsEl(n, 16)));
    box.append(h('div.kv', h('span', t('hd.strength')), h('strong', num(Math.round(strength(n) * 100)) + '%')));
  }
  FACETS.forEach(f => {
    const fs = p?.f?.[f];
    box.append(h('div.facet',
      h('div.facet-top', h('span', t('facet.' + f)), h('small.muted', fs?.n ? t('hd.attempts', { c: fs.c, n: fs.n }) : '—')),
      strengthBar(facetStrength(n, f))));
  });
  return box;
}

// =====================================================================
// Profile
// =====================================================================
function profileView(el) {
  const lv = levelInfo();
  const learned = learnedList().length;
  const strong = HADITH.filter(hd => status(hd.n) === 'strong').length;
  const acc = state.stats.answers ? Math.round(100 * state.stats.correct / state.stats.answers) : 0;
  el.append(h('h1.page-title', t('pf.title')));
  el.append(h('section.level-card',
    h('div.level-badge', h('small', t('level', { n: '' }).trim()), h('strong', num(lv.level))),
    h('div.grow',
      h('div.row.space', h('strong', num(state.xp) + ' ' + t('xp')), h('small.muted', t('pf.toNext', { n: lv.need - lv.into, l: lv.level + 1 }))),
      h('div.sbar.big', h('div.sbar-fill.gold', { style: { width: lv.pct * 100 + '%' } })))));
  const tile = (ico, label, value, tone) => h('div.stat.' + tone, h('span.stat-ico', ico), h('strong', value), h('small', label));
  el.append(h('div.stat-grid',
    tile('🔥', t('pf.streak'), num(currentStreak()), 'orange'),
    tile('🏅', t('pf.best'), num(state.streak.best), 'gold'),
    tile('📗', t('pf.learned'), num(learned) + '/' + num(50), 'green'),
    tile('💪', t('pf.strong'), num(strong), 'blue'),
    tile('🎯', t('pf.accuracy'), num(acc) + '%', 'purple'),
    tile('📚', t('pf.lessons'), num(state.stats.lessons), 'red')));

  // mastery map
  const grid = h('div.mastery');
  HADITH.forEach(hd => {
    const s = status(hd.n);
    grid.append(h('a.mcell.' + s + (isDue(hd.n) ? '.due' : '') + (hd.ibnRajab ? '.ir' : ''), {
      href: '#/h/' + hd.n, title: `${num(hd.n)} · ${L(hd.title)} · ${t('status.' + s)}`,
    }, num(hd.n)));
  });
  el.append(h('section.panel', h('h2', t('pf.mastery')), grid,
    h('div.legend-row', ['new', 'weak', 'learning', 'strong'].map(s => h('span.lg-item', h('i.mcell-dot.' + s), t('status.' + s))))));

  // activity heatmap
  const heat = h('div.heat');
  const today = dayKey();
  const dow = (new Date().getDay() + 6) % 7; // Monday = 0
  const start = addDays(today, -(7 * 11 + dow));
  const max = Math.max(state.settings.dailyGoal, ...Object.values(state.daily));
  for (let i = 0; i < 7 * 12; i++) {
    const k = addDays(start, i);
    if (k > today) { heat.append(h('i.hc.future')); continue; }
    const v = state.daily[k] || 0;
    const lvl = v === 0 ? 0 : v < max * 0.25 ? 1 : v < max * 0.5 ? 2 : v < max * 0.85 ? 3 : 4;
    heat.append(h('i.hc.l' + lvl, { title: `${k}: ${num(v)} ${t('xp')}` }));
  }
  el.append(h('section.panel', h('h2', t('pf.activity')), heat));

  // achievements
  el.append(h('section.panel', h('h2', t('pf.achievements')),
    h('div.ach-grid', ACHIEVEMENTS.map(a => {
      const got = state.achievements[a.id];
      return h('div.ach' + (got ? '.got' : ''), { title: t('ach.' + a.id + '.d') },
        h('span.ach-ico', got ? a.icon : '🔒'), h('strong', t('ach.' + a.id)), h('small', t('ach.' + a.id + '.d')));
    }))));
}

// =====================================================================
// Settings
// =====================================================================
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (currentRoute === 'settings') rerender(); });

/** Settings › About: every text in the app, with a link to the original. */
function sourcesList() {
  const ext = (href, label) => h('a.btn.small.ghost', { href, target: '_blank', rel: 'noopener' }, label + ' ↗');
  const row = (title, arTitle, lines, links) => h('li.src',
    h('div.src-main', h('strong', title), isAr() ? null : h('small.ar', { dir: 'rtl', lang: 'ar' }, arTitle),
      lines.filter(Boolean).map(x => h('small', x))),
    h('div.src-links', links));
  return h('div.srcs', h('h3.src-title', t('st.sources')), h('ul.src-list',
    row(L(SOURCE.work), SOURCE.work.ar,
      [`${L(SOURCE.title)} — ${L(SOURCE.editor)}`, t('st.src.hadith')],
      [ext(SOURCE.url, t('sh.onShamela'))]),
    BOOKS.map(b => row(L(b.name), b.name.ar, [L(b.author) + ' · ' + L(b.pub), t('st.src.ai')],
      [ext(shamelaUrl(b.shamela), t('sh.onShamela')), h('a.btn.small.ghost', { href: '#/book/' + b.key }, t('sh.about'))])),
    row(L(IRAAB.name), IRAAB.name.ar, [L(IRAAB.author), t('st.src.iraab')],
      [ext(IRAAB.url, 'ketabonline'), h('a.btn.small.ghost', { href: '#/book/iraab' }, t('sh.about'))])));
}

function settingsView(el) {
  const s = state.settings;
  const set = (k, v, { appearance = false, full = false } = {}) => {
    setSetting(k, v);
    if (appearance) applyAppearance();
    if (full) { applyLang(); rerender(); }
  };
  const seg = (key, opts, labelFn, o = {}) => h('div.seg', opts.map(v => h('button.seg-btn' + (s[key] === v ? '.on' : ''), {
    type: 'button', onclick: e => {
      set(key, v, o);
      e.currentTarget.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('on'));
      e.currentTarget.classList.add('on');
      sfx.tap();
    },
  }, labelFn(v))));
  const sw = (key, label, sub, o = {}) => h('label.setting',
    h('span.setting-text', h('span', label), sub ? h('small', sub) : null),
    h('input', { type: 'checkbox', checked: s[key], onchange: e => { set(key, e.target.checked, o); if (key === 'sound' && e.target.checked) sfx.correct(); } }),
    h('span.sw'));
  const row = (label, control, sub) => h('div.setting.col', h('span.setting-text', h('span', label), sub ? h('small', sub) : null), control);
  const section = (title, ...kids) => h('section.panel', h('h2', title), ...kids);

  el.append(h('h1.page-title', t('st.title')));

  el.append(section(t('st.language') + ' · ' + t('st.theme'),
    row(t('st.language'), seg('lang', ['auto', 'ar', 'en'], v => v === 'auto' ? t('st.lang.auto') : v === 'ar' ? 'العربية' : 'English', { full: true })),
    row(t('st.theme'), seg('theme', ['auto', 'light', 'dark'], v => t('st.theme.' + v), { appearance: true }))));

  const sample = h('div.sample.ar', { dir: 'rtl', lang: 'ar' }, ar('«إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِاءٍ مَا نَوَى»'));
  const sizeIn = h('input.range', {
    type: 'range', min: 18, max: 44, step: 1, value: s.arSize, 'aria-label': t('st.size'),
    oninput: e => { set('arSize', +e.target.value, { appearance: true }); },
  });
  el.append(section(t('st.reading'),
    sw('showTranslation', t('st.translation')),
    sw('showTashkeel', t('st.tashkeel'), null, { full: true }),
    row(t('st.font'), seg('arFont', ['amiri', 'scheherazade', 'naskh', 'system'],
      v => ({ amiri: 'Amiri', scheherazade: 'Scheherazade', naskh: 'Noto Naskh', system: t('st.font.system') }[v]), { appearance: true })),
    row(t('st.size'), sizeIn),
    sample,
    row(t('st.sharhMode'), seg('sharhMode', MODES, v => t('sh.mode.' + v)), t('st.sharhModeSub'))));

  const vol = h('input.range', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, 'aria-label': t('st.volume'), onchange: e => { set('volume', +e.target.value); sfx.correct(); } });
  const rate = h('input.range', { type: 'range', min: 0.5, max: 1.3, step: 0.05, value: s.ttsRate, 'aria-label': t('st.tts'), onchange: e => set('ttsRate', +e.target.value) });
  el.append(section(t('st.sound'),
    sw('sound', t('st.sounds')),
    row(t('st.volume'), vol),
    sw('haptics', t('st.haptics')),
    canSpeak() || hasAudio() ? row(t('st.tts'), rate) : h('p.small.muted', t('st.ttsNone')),
    canSpeak() || hasAudio() ? sw('autoListen', t('st.autoListen')) : null));

  el.append(section(t('st.learning'),
    row(t('st.goal'), seg('dailyGoal', [10, 20, 30, 50], v => `${t('st.goal.' + v)} · ${num(v)}`)),
    row(t('st.length'), seg('lessonLength', [6, 10, 15], v => num(v))),
    sw('hearts', t('st.hearts'), t('st.heartsSub')),
    sw('typing', t('st.typing'), t('st.typingSub')),
    sw('unlockAll', t('st.unlock'), t('st.unlockSub')),
    row(t('st.types'), h('div.chips.wrap', Object.keys(s.types).map(k => h('button.tchip' + (s.types[k] ? '.on' : ''), {
      type: 'button', 'aria-pressed': s.types[k] ? 'true' : 'false',
      onclick: e => {
        const on = !s.types[k];
        if (!on && Object.values(s.types).filter(Boolean).length <= 1) return toast(t('pr.noneSelected'));
        s.types[k] = on; save();
        e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', on); sfx.tap();
      },
    }, t('type.' + k)))))));

  const fileIn = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const data = parseImport(await f.text());
        const ok = await confirmDialog({ title: t('st.import'), body: t('st.importConfirm'), ok: t('btn.replace'), cancel: t('btn.cancel') });
        if (!ok) return;
        replaceState(data);
        applyLang(); applyAppearance(); rerender();
        toast(t('st.importOk'), { icon: '✅' });
      } catch { toast(t('st.importBad'), { icon: '⚠️' }); }
    },
  });
  el.append(section(t('st.data'),
    h('p.small.muted', t('st.dataNote')),
    h('div.row.gap.wrap',
      h('button.btn.blue', { type: 'button', onclick: exportData }, svgIcon('download', 18), h('span', t('st.export'))),
      h('button.btn.ghost', { type: 'button', onclick: () => fileIn.click() }, svgIcon('upload', 18), h('span', t('st.import'))),
      fileIn),
    h('button.btn.red.outline', {
      type: 'button', onclick: async () => {
        const ok = await confirmDialog({ title: t('st.reset'), body: t('st.resetConfirm'), ok: t('btn.reset'), cancel: t('btn.cancel'), danger: true });
        if (!ok) return;
        resetProgress(); rerender(); toast(t('st.resetDone'));
      },
    }, svgIcon('trash', 18), h('span', t('st.reset')))));

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  el.append(section(t('st.about'),
    h('p', t('st.aboutText')),
    sourcesList(),
    h('p.small.muted', t('hd.translationNote')),
    h('p.small.muted', t('st.offline') + ' · ' + t('st.version') + ' ' + VERSION),
    standalone ? h('p.small', '✅ ' + t('st.installed'))
      : installEvt ? h('button.btn.green', { type: 'button', onclick: async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; rerender(); } }, t('st.install')) : null));
}

// =====================================================================
// Service worker (offline)
// =====================================================================
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state !== 'installed') return;
        if (navigator.serviceWorker.controller) {
          toast(t('upd.available'), { ms: 15000, icon: '✨', action: { label: t('upd.reload'), fn: () => nw.postMessage({ type: 'SKIP_WAITING' }) } });
        } else {
          toast(t('offline.ready'), { icon: '📴' });
        }
      });
    });
  }).catch(err => console.warn('SW registration failed', err));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
}

// =====================================================================
// Boot
// =====================================================================
function boot() {
  applyLang();
  applyAppearance();
  const bar = $('.topbar');
  const setBarH = () => document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
  if ('ResizeObserver' in window) new ResizeObserver(setBarH).observe(bar);
  setBarH();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAppearance);
  window.addEventListener('hashchange', route);
  let pending = false;
  onChange(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; renderHeader(); });
  });
  // unlock the WebAudio context on the first gesture (iOS)
  document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
  onVoices(() => { if (/^(h\/|settings)/.test(currentRoute || '')) rerender(); });
  onAudioIndex(() => { if (hasAudio() && /^(h\/|settings)/.test(currentRoute || '')) rerender(); });
  loadAudioIndex();
  checkAchievements();
  if (location.hash === '#/lesson') location.replace('#/');
  route();
  registerSW();
  window.__app = { state, t, lang, HADITH, prep, version: VERSION };
}
boot();
