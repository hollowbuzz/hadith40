// Lesson runner + exercise renderers.
import { HADITH } from './data.js';
import { state, save, addXp, touchStreak, levelInfo, currentStreak } from './store.js';
import { h, $, clear, svgIcon, confetti, speak, stopSpeaking, canSpeak, canListen, listen, sayHighlighter, confirmDialog, shuffle, toast } from './ui.js';
import { t, L, num, isAr } from './i18n.js';
import { sfx, haptic } from './sound.js';
import { prep, normalize, firstLetter } from './text.js';
import { record, settle, crowns } from './srs.js';
import { recorderPanel } from './recorder.js';
import { renderHadith, arEl, ar, nameEl, heading } from './render.js';
import { checkAchievements } from './achievements.js';
import { lightningQuestion, noteAnswer } from './quiz.js';

const H = n => HADITH[n - 1];
let S = null; // active session

export const inLesson = () => !!S;
// debugging aid: inspect the running session from the console
window.__lesson = () => S;
export function closeLesson() {
  stopSpeaking();
  if (S?.timer) clearInterval(S.timer);
  S = null;
  document.body.classList.remove('in-lesson');
  clear($('#lesson'));
  document.removeEventListener('keydown', onKey);
}

let pushed = false; // did we add a '#/lesson' history entry?
function enterRoute() {
  if (location.hash !== '#/lesson') { location.hash = '#/lesson'; pushed = true; }
}
function exit() {
  const back = S?.back || '#/';
  closeLesson();
  if (pushed) { pushed = false; history.back(); }
  else location.replace(back);
}
/** Router hook: the user navigated away (e.g. the phone's back button). */
export function lessonNavigatedAway() { pushed = false; if (S) closeLesson(); }

// =====================================================================
// Session
// =====================================================================
export function runSession({ kind, questions, n = null, back = '#/', rebuild = null }) {
  if (!questions.length) { toast(t('pr.needLearn')); return; }
  closeLesson();
  S = {
    kind, n, back, rebuild,
    queue: questions.slice(), idx: 0, phase: 'answer', ctl: null,
    xp: 0, combo: 0, maxCombo: 0, graded: 0, correct: 0, mistakes: 0,
    hearts: state.settings.hearts ? 5 : null,
    per: {}, start: Date.now(), levelBefore: levelInfo().level,
  };
  document.body.classList.add('in-lesson');
  const root = clear($('#lesson'));
  S.el = {
    bar: h('div.lbar-fill'),
    hearts: h('div.hearts'),
    combo: h('div.combo'),
    body: h('main.lbody'),
    fb: h('div.fb', { 'aria-live': 'polite' }),
    actions: h('div.lfoot-actions'),
    foot: null,
  };
  S.el.foot = h('footer.lfoot', h('div.lfoot-in', S.el.fb, S.el.actions));
  root.append(
    h('header.ltop',
      h('button.icon-btn.lx', { type: 'button', onclick: askQuit, 'aria-label': t('btn.quit') }, svgIcon('x', 26)),
      h('div.lbar', S.el.bar), S.el.combo, S.el.hearts),
    S.el.body, S.el.foot);
  document.addEventListener('keydown', onKey);
  enterRoute();
  updateTop();
  showQuestion();
}

async function askQuit() {
  if (!S) return;
  if (S.graded === 0 || S.phase === 'done') return exit();
  const ok = await confirmDialog({ title: t('quit.title'), body: t('quit.body'), ok: t('btn.quit'), cancel: t('btn.keep'), danger: true });
  if (ok) exit();
}

function updateTop() {
  const done = S.idx + (S.phase === 'feedback' ? 1 : 0);
  S.el.bar.style.width = Math.min(100, (done / S.queue.length) * 100) + '%';
  S.el.hearts.replaceChildren(S.hearts == null ? '' : h('span.heart-ico', '❤'), S.hearts == null ? '' : num(S.hearts));
  S.el.hearts.hidden = S.hearts == null;
  S.el.combo.replaceChildren(S.combo >= 2 ? h('span', '🔥 ' + num(S.combo)) : '');
  S.el.combo.classList.toggle('hot', S.combo >= 5);
}

function setActions(...btns) { S.el.actions.replaceChildren(...btns); }
function mainButton(label, onclick, { disabled = false, cls = '' } = {}) {
  const b = h('button.btn.big' + cls, { type: 'button', onclick, disabled }, label);
  S.el.main = b;
  return b;
}

function showQuestion() {
  const q = S.queue[S.idx];
  S.phase = 'answer';
  S.el.foot.className = 'lfoot';
  S.el.fb.replaceChildren();
  const body = clear(S.el.body);
  body.scrollTop = 0;
  const ctx = {
    ready: on => { if (S.el.main && S.phase === 'answer') S.el.main.disabled = !on; },
    submit: () => doCheck(),
  };
  const ctl = RENDER[q.type](q, ctx);
  S.ctl = ctl;
  body.append(h('div.q-wrap', ctl.el));
  body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter');

  if (q.type === 'read') {
    setActions(mainButton(t('btn.gotIt'), () => { sfx.tap(); next(); }));
  } else if (q.type === 'recite') {
    setActions(mainButton(t('btn.reveal'), () => {
      sfx.flip();
      ctl.reveal();
      const grade = (g, label, cls) => h('button.btn' + cls, { type: 'button', onclick: () => doCheck(g) }, label);
      setActions(h('div.grades', grade(0, t('btn.forgot'), '.red'), grade(0.5, t('btn.partly'), '.gold'), grade(1, t('btn.perfect'), '.green')));
    }));
  } else if (q.type === 'match') {
    setActions(mainButton(t('btn.skip'), () => doCheck('skip'), { cls: '.ghost' }));
  } else {
    setActions(mainButton(t('btn.check'), () => doCheck(), { disabled: true }));
  }
  updateTop();
  ctl.focus?.();
}

function doCheck(arg) {
  if (!S || S.phase !== 'answer') return;
  const q = S.queue[S.idx];
  const res = S.ctl.check(arg);
  if (!res) return;
  S.phase = 'feedback';
  const ok = res.ok;
  const quality = res.quality ?? (ok ? 1 : 0);

  // mastery, and rotation (so this prompt waits its turn — sooner if it was missed)
  noteAnswer(q.key, ok);
  if (res.records) res.records.forEach(r => record(r.n, r.facet, r.q));
  else if (q.facet) record(q.n, q.facet, quality);
  const per = S.per[q.n] || (S.per[q.n] = { c: 0, t: 0 });
  per.t++; per.c += quality;

  // score
  S.graded++;
  state.stats.answers++;
  let gained = 0;
  if (ok) {
    S.correct++;
    state.stats.correct++;
    S.combo++;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    gained = q.type === 'recite' ? (quality >= 1 ? 15 : 8) : (q.retry ? 5 : 10);
    if (S.combo > 0 && S.combo % 5 === 0) gained += 5;
    sfx.correct(S.combo - 1);
    haptic(12);
  } else {
    S.mistakes++;
    S.combo = 0;
    if (q.type !== 'recite') { sfx.wrong(); haptic([30, 40, 30]); }
    if (S.hearts != null && q.type !== 'recite') { S.hearts--; setTimeout(() => sfx.heart(), 250); }
    if (!q.retry && q.type !== 'recite' && q.type !== 'match') S.queue.push({ ...q, retry: true });
  }
  if (q.type === 'recite') {
    if (quality >= 1) state.stats.recites++;
    if (quality > 0) sfx.correct(0);
  }
  S.xp += gained;
  state.stats.bestCombo = Math.max(state.stats.bestCombo, S.maxCombo);
  save();

  // feedback sheet
  const foot = S.el.foot;
  foot.className = 'lfoot show ' + (ok ? 'ok' : 'bad');
  const fb = [];
  fb.push(h('div.fb-head', h('span.fb-ico', ok ? '✓' : '✕'),
    h('strong', ok ? t('fb.good') : (res.close ? t('fb.close') : t('fb.bad'))),
    gained ? h('span.fb-xp', '+' + num(gained) + ' ' + t('xp')) : null));
  if (!ok && res.answer) fb.push(h('div.fb-ans', h('span', t('fb.answer') + ' '), res.answer));
  if (ok && S.combo >= 3) fb.push(h('div.fb-combo', t('fb.combo', { n: S.combo })));
  S.el.fb.replaceChildren(...fb);
  setActions(mainButton(t('btn.continue'), next, { cls: ok ? '.green' : '.red' }));
  updateTop();
  if (S.hearts === 0) { setTimeout(failScreen, 700); return; }
  setTimeout(() => S?.el.main?.focus(), 30);
}

function next() {
  if (!S) return;
  stopSpeaking();
  S.idx++;
  if (S.idx >= S.queue.length) finish();
  else showQuestion();
}

function onKey(e) {
  if (!S || document.querySelector('#modal.open')) return;
  if (e.target && e.target.tagName === 'INPUT' && e.key !== 'Enter') return;
  if (e.key === 'Enter') {
    if (S.el.main && !S.el.main.disabled) { e.preventDefault(); S.el.main.click(); }
    return;
  }
  if (e.key === 'Escape') { askQuit(); return; }
  if (S.phase === 'answer' && S.ctl?.onKey) S.ctl.onKey(e);
}

// =====================================================================
// End screens
// =====================================================================
function failScreen() {
  if (!S) return;
  S.phase = 'done';
  sfx.heart();
  const body = clear(S.el.body);
  S.el.foot.className = 'lfoot';
  S.el.fb.replaceChildren();
  body.append(h('div.end',
    h('div.end-emoji', '💔'),
    h('h2', t('fail.title')),
    h('p.muted', t('fail.body')),
    S.n ? h('div.end-hadith', renderHadith(H(S.n))) : null));
  const retry = S.rebuild;
  setActions(
    h('button.btn.ghost', { type: 'button', onclick: exit }, t('btn.quit')),
    retry ? h('button.btn.big', { type: 'button', onclick: () => { const r = S.rebuild; const k = S.kind, n = S.n, b = S.back; runSession({ kind: k, n, back: b, questions: r(), rebuild: r }); } }, t('btn.retry')) : null);
  save();
}

function finish() {
  S.phase = 'done';
  const ms = Date.now() - S.start;
  const graded = S.graded;
  const perfect = S.mistakes === 0 && graded >= 4;
  if (perfect) { S.xp += 10; state.stats.perfect++; }

  // spaced repetition
  const learnKinds = S.kind === 'learn' || S.kind === 'practice';
  for (const [k, v] of Object.entries(S.per)) {
    const n = +k;
    if (!learnKinds && !(state.progress[n]?.box > 0)) continue;
    settle(n, v.t ? v.c / v.t : 1, { learning: S.kind === 'learn' });
  }
  state.stats.lessons++;
  state.stats.timeMs += ms;
  if (S.kind === 'weak') state.stats.weakSessions++;
  addXp(S.xp);
  const streakGrew = touchStreak();
  const lvl = levelInfo();
  const leveled = lvl.level > S.levelBefore;
  const fresh = checkAchievements();
  save(true);

  // ---- summary ----
  sfx.complete();
  confetti();
  const acc = graded ? Math.round((S.correct / graded) * 100) : 100;
  const mm = Math.floor(ms / 60000), ss = Math.floor(ms / 1000) % 60;
  const tile = (cls, label, value) => h('div.stile.' + cls, h('div.stile-label', label), h('div.stile-value', value));
  const body = clear(S.el.body);
  S.el.foot.className = 'lfoot';
  S.el.fb.replaceChildren();
  const learnedMsg = (S.kind === 'learn' || S.kind === 'practice') && S.n
    ? h('div.end-hadith-badge', h('span.big-num', num(S.n)), h('div', h('strong', L(H(S.n).title)),
      h('div.muted', t('done.crowns', { n: crowns(S.n) }))), crownRow(crowns(S.n)))
    : null;
  body.append(h('div.end',
    h('div.end-emoji.bounce', perfect ? '💎' : '🎉'),
    h('h2', perfect ? t('done.perfect') : t('done.title')),
    learnedMsg,
    h('div.stiles',
      tile('gold', t('done.xp'), '+' + num(S.xp)),
      tile('green', t('done.acc'), num(acc) + '%'),
      tile('blue', t('done.time'), `${num(mm)}:${ss < 10 ? (isAr() ? '٠' : '0') : ''}${num(ss)}`),
      tile('orange', t('done.combo'), num(S.maxCombo))),
    leveled ? h('div.levelup', '⬆ ' + t('levelUp', { n: lvl.level })) : null,
    fresh.length ? h('div.ach-list', fresh.map(a => h('div.ach-new', h('span.ach-ico', a.icon),
      h('div', h('small', t('ach.unlocked')), h('strong', t('ach.' + a.id)))))) : null));
  if (leveled) setTimeout(() => sfx.levelUp(), 700);
  if (fresh.length) setTimeout(() => sfx.achievement(), leveled ? 1600 : 900);
  setActions(mainButton(t('btn.continue'), () => (streakGrew ? streakScreen() : exit()), { cls: '.green' }));
}

function crownRow(c) {
  return h('div.crown-row', Array.from({ length: 5 }, (_, i) => h('span.crown.big' + (i < c ? '.on' : ''))));
}

function streakScreen() {
  const n = currentStreak();
  sfx.streak();
  const body = clear(S.el.body);
  body.append(h('div.end.streak-end',
    h('div.flame', '🔥'),
    h('div.streak-num', num(n)),
    h('h2', t('streak.up', { n })),
    h('p.muted', t('streak.keep')),
    weekDots()));
  setActions(mainButton(t('btn.continue'), exit, { cls: '.gold' }));
}

function weekDots() {
  const days = [];
  const d = new Date();
  for (let i = 6; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
    const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const label = x.toLocaleDateString(isAr() ? 'ar' : 'en', { weekday: 'narrow' });
    days.push(h('div.wd' + (state.daily[key] ? '.on' : ''), h('span', label), h('i')));
  }
  return h('div.week', days);
}

// =====================================================================
// Lightning round
// =====================================================================
export function runLightning(pool, back = '#/practice') {
  closeLesson();
  const DURATION = 60;
  S = { kind: 'lightning', back, score: 0, wrong: 0, left: DURATION, phase: 'answer', per: {}, el: {}, combo: 0, maxCombo: 0, start: Date.now(), levelBefore: levelInfo().level };
  document.body.classList.add('in-lesson');
  const root = clear($('#lesson'));
  const timeFill = h('div.lbar-fill.time');
  const timeLabel = h('div.ltime');
  const scoreEl = h('div.lscore');
  const body = h('main.lbody');
  S.el = { bar: timeFill, body, foot: h('footer.lfoot'), actions: h('div') };
  root.append(h('header.ltop',
    h('button.icon-btn.lx', { type: 'button', onclick: () => { clearInterval(S.timer); exit(); }, 'aria-label': t('btn.quit') }, svgIcon('x', 26)),
    h('div.lbar', timeFill), timeLabel, scoreEl), body);
  const paint = () => {
    timeFill.style.width = (S.left / DURATION) * 100 + '%';
    timeFill.classList.toggle('low', S.left <= 10);
    timeLabel.textContent = t('lt.time', { n: S.left });
    scoreEl.textContent = '⚡ ' + num(S.score);
  };
  const ask = () => {
    if (!S || S.phase === 'done') return;
    const q = lightningQuestion(pool);
    const ctl = RENDER.mcq(q, {
      ready() {},
      instant(ok) {
        record(q.n, q.facet, ok ? 1 : 0);
        if (ok) { S.score++; S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo); sfx.correct(Math.min(S.combo, 8)); haptic(10); }
        else { S.wrong++; S.combo = 0; sfx.wrong(); haptic([30, 40, 30]); }
        state.stats.answers++; if (ok) state.stats.correct++;
        paint();
        setTimeout(ask, ok ? 350 : 900);
      },
    }, { instant: true });
    S.ctl = ctl;
    clear(body).append(h('div.q-wrap', ctl.el));
    body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter');
  };
  S.timer = setInterval(() => {
    S.left--;
    if (S.left <= 5 && S.left > 0) sfx.tick();
    paint();
    if (S.left <= 0) { clearInterval(S.timer); lightningEnd(); }
  }, 1000);
  document.addEventListener('keydown', onKey);
  enterRoute();
  paint();
  ask();
}

function lightningEnd() {
  S.phase = 'done';
  const best = state.stats.lightningBest;
  const isBest = S.score > best;
  if (isBest) state.stats.lightningBest = S.score;
  const xp = S.score * 2;
  addXp(xp);
  state.stats.lessons++;
  state.stats.bestCombo = Math.max(state.stats.bestCombo, S.maxCombo);
  const streakGrew = S.score > 0 ? touchStreak() : false;
  const lvl = levelInfo();
  const fresh = checkAchievements();
  save(true);
  sfx.complete();
  if (isBest && S.score > 0) confetti();
  const body = clear(S.el.body);
  const root = $('#lesson');
  body.append(h('div.end',
    h('div.end-emoji.bounce', '⚡'),
    h('h2', t('lt.over')),
    h('div.big-score', num(S.score)),
    isBest && S.score > 0 ? h('div.levelup', '🏅 ' + t('lt.newBest')) : h('p.muted', t('pr.best', { n: Math.max(best, S.score) })),
    h('div.stiles.two', h('div.stile.gold', h('div.stile-label', t('done.xp')), h('div.stile-value', '+' + num(xp))),
      h('div.stile.orange', h('div.stile-label', t('done.combo')), h('div.stile-value', num(S.maxCombo)))),
    lvl.level > S.levelBefore ? h('div.levelup', '⬆ ' + t('levelUp', { n: lvl.level })) : null,
    fresh.length ? h('div.ach-list', fresh.map(a => h('div.ach-new', h('span.ach-ico', a.icon), h('div', h('small', t('ach.unlocked')), h('strong', t('ach.' + a.id)))))) : null));
  const foot = h('footer.lfoot', h('div.lfoot-in', h('div'), h('div.lfoot-actions',
    h('button.btn.big.gold', { type: 'button', onclick: () => (streakGrew ? streakScreen() : exit()) }, t('btn.continue')))));
  root.querySelector('footer')?.remove();
  root.append(foot);
  S.el.foot = foot;
  S.el.actions = foot.querySelector('.lfoot-actions');
}

// =====================================================================
// Exercise renderers
// =====================================================================
const MCQ_TITLES = {
  blank: 'q.blank', next: 'q.next', number: 'q.number', numberRev: 'q.numberRev', narrator: 'q.narrator',
  takhreej: 'q.takhreej', title: 'q.title', titleRev: 'q.titleRev', gist: 'q.meaning',
  before: 'q.before', missing: 'q.missing', spot: 'q.spot', where: 'q.where',
};

function qHeader(title, extra) {
  return h('div.q-head', h('h2.q-title', title), extra || null);
}

function piecesEl(pieces, { trailing = false, leading = false, blankEl = null } = {}) {
  const line = h('div.pieces.ar', { dir: 'rtl', lang: 'ar' });
  if (leading) line.append(h('span.blank.dots', '…'), ' ');
  pieces.forEach(p => {
    if (p.blank) {
      line.append(p.pre ? ar(p.pre) : '', blankEl || h('span.blank' + (p.core === '' ? '.wide' : ''), ' '), p.post ? ar(p.post) : '', ' ');
    } else if (p.swap) {
      line.append(ar(p.pre), h('span.swap', { 'data-fix': p.fix }, ar(p.core)), ar(p.post) + ' ');
    } else {
      line.append(ar(p.pre + p.core + p.post) + ' ');
    }
  });
  if (trailing) line.append(h('span.blank.dots', '…'));
  return line;
}

function openingCard(n) {
  return h('div.prompt-card', arEl(prep(n).opening, 'big'));
}

function optionContent(o) {
  if (o.num != null) return h('span.opt-num', num(o.num));
  if (o.name) return nameEl(o.name);
  if (o.title) return isAr() ? h('span', o.title.ar) : h('span', o.title.en);
  if (o.ar) return arEl(o.text);
  return h('span', o.text);
}

const RENDER = {
  read(q) {
    const hd = H(q.n);
    let speaking = false;
    const text = h('div.read-text', renderHadith(hd, { legend: true }));
    const listenBtn = canListen(hd.n) ? h('button.btn.small.ghost', {
      type: 'button',
      onclick: () => {
        if (speaking) { stopSpeaking(); speaking = false; listenBtn.lastChild.textContent = t('btn.listen'); return; }
        speaking = listen(hd.n, plainText(hd), {
          onTick: sayHighlighter(text),
          onEnd: () => { speaking = false; listenBtn.lastChild.textContent = t('btn.listen'); },
        });
        if (speaking) listenBtn.lastChild.textContent = t('btn.stop');
      },
    }, svgIcon('volume', 18), h('span', t('btn.listen'))) : null;
    if (listenBtn && state.settings.autoListen) setTimeout(() => listenBtn.click(), 400);
    return {
      el: h('div.q-read',
        h('div.q-kicker', '✨ ' + t('q.read')),
        h('div.read-head',
          h('div.big-num' + (hd.ibnRajab ? '.ir' : ''), num(hd.n)),
          h('div', h('h2.q-title', L(hd.title)), h('div.muted', heading(hd)),
            hd.ibnRajab ? h('span.chip.ir', t('hd.ibnRajab')) : null),
          listenBtn),
        h('p.hint', t('q.readHint')),
        text),
    };
  },

  mcq(q, ctx, { instant = false } = {}) {
    const title = q.title ? t(...q.title) : t(MCQ_TITLES[q.kind]);
    let prompt;
    switch (q.prompt.kind) {
      case 'opening': prompt = openingCard(q.n); break;
      case 'pieces': prompt = h('div.prompt-card', piecesEl(q.prompt.pieces, { trailing: q.prompt.trailing, leading: q.prompt.leading })); break;
      case 'bignum': prompt = h('div.prompt-card.center', h('div.big-num.xl', num(q.n))); break;
      case 'title': prompt = h('div.prompt-card.center', h('div.prompt-title', L(H(q.n).title))); break;
      case 'gist': prompt = h('div.prompt-card', h('p.gist', { dir: 'ltr', lang: 'en' }, '“' + prep(q.n).gist + '”')); break;
      default: prompt = null;
    }
    let sel = null;
    const btns = q.options.map((o, i) => {
      const b = h('button.opt' + (o.ar ? '.opt-ar' : ''), { type: 'button', 'data-id': o.id, onclick: () => choose(o.id) },
        h('span.opt-key', num(i + 1)), h('span.opt-body', optionContent(o)));
      return b;
    });
    const list = h('div.opts' + (q.grid ? '.grid' : ''), btns);
    function choose(id) {
      if (instant) {
        if (sel) return;
        sel = id;
        const ok = id === q.answer;
        btns.forEach(b => {
          if (b.dataset.id === q.answer) b.classList.add('correct');
          else if (b.dataset.id === id) b.classList.add('wrong');
          b.disabled = true;
        });
        ctx.instant(ok);
        return;
      }
      sel = id;
      btns.forEach(b => b.classList.toggle('sel', b.dataset.id === id));
      sfx.select();
      ctx.ready(true);
    }
    return {
      el: h('div', qHeader(title), prompt, list),
      onKey(e) { const k = parseInt(e.key, 10); if (k >= 1 && k <= btns.length) choose(q.options[k - 1].id); },
      check() {
        if (!sel) return null;
        const ok = sel === q.answer;
        btns.forEach(b => {
          b.disabled = true;
          if (b.dataset.id === q.answer) b.classList.add('correct');
          else if (b.dataset.id === sel) b.classList.add('wrong');
        });
        const right = q.options.find(o => o.id === q.answer);
        const blank = (q.kind === 'blank' || q.kind === 'missing') && prompt?.querySelector('.blank:not(.dots)');
        if (blank) { blank.textContent = ar(right.text); blank.classList.add('filled'); }
        const swap = q.kind === 'spot' && prompt?.querySelector('.swap');
        if (swap) swap.replaceChildren(h('del', swap.textContent), ' ', h('ins', ar(swap.dataset.fix)));
        return { ok, answer: ok ? null : h('span.fb-answer', optionContent(right)) };
      },
    };
  },

  order(q, ctx) {
    const line = h('div.order-line.ar', { dir: 'rtl', lang: 'ar' });
    const bank = h('div.bank.ar', { dir: 'rtl', lang: 'ar' });
    const placed = [];
    const slots = q.tiles.map(tile => {
      const slot = h('span.slot');
      const btn = h('button.tile', { type: 'button', onclick: () => toLine(tile, btn, slot) }, ar(tile.text));
      slot.append(btn);
      bank.append(slot);
      return { tile, btn, slot };
    });
    function toLine(tile, btn, slot) {
      if (btn.parentElement !== slot) return toBank(tile, btn, slot);
      slot.style.width = btn.offsetWidth + 'px';
      slot.style.height = btn.offsetHeight + 'px';
      slot.classList.add('empty');
      line.append(btn);
      placed.push({ tile, btn, slot });
      sfx.select();
      ctx.ready(placed.length > 0);
    }
    function toBank(tile, btn, slot) {
      const i = placed.findIndex(p => p.btn === btn);
      if (i >= 0) placed.splice(i, 1);
      slot.append(btn);
      slot.classList.remove('empty');
      sfx.unselect();
      ctx.ready(placed.length > 0);
    }
    const context = q.context
      ? h('div.prompt-card.ctx', piecesEl(q.context, { trailing: true }))
      : h('div.prompt-card.ctx.center', h('div.muted', L(H(q.n).title) + ' · ' + t('hadithN', { n: q.n })));
    return {
      el: h('div', qHeader(q.kind === 'chain' ? t('q.chain') : q.first ? t('q.orderStart') : t('q.order'),
        !q.first && q.context ? h('div.muted.small', t('q.orderCtx')) : null),
        context, line, bank),
      onKey(e) { if (e.key === 'Backspace' && placed.length) { const p = placed[placed.length - 1]; toBank(p.tile, p.btn, p.slot); } },
      check() {
        if (!placed.length) return null;
        const seq = placed.map(p => p.tile.text);
        const ok = seq.length === q.answer.length && seq.every((w, i) => normalize(w) === normalize(q.answer[i]));
        slots.forEach(s => { s.btn.disabled = true; });
        line.classList.add(ok ? 'ok' : 'bad');
        return { ok, answer: arEl(q.answer.join(' ')) };
      },
    };
  },

  type(q, ctx) {
    const input = h('input.type-in.ar', {
      dir: 'rtl', lang: 'ar', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: 'text',
      'aria-label': t('q.type'),
      oninput: () => ctx.ready(input.value.trim().length > 0),
    });
    const kb = arabicKeyboard(ch => {
      if (ch === '⌫') input.value = input.value.slice(0, -1);
      else input.value += ch;
      sfx.tap();
      ctx.ready(input.value.trim().length > 0);
    });
    return {
      el: h('div', qHeader(t('q.type'), h('div.muted.small', t('q.typeHint'))),
        h('div.prompt-card', piecesEl(q.pieces)), input, kb),
      focus() { if (matchMedia('(pointer: fine)').matches) input.focus(); },
      check() {
        const v = input.value.trim();
        if (!v) return null;
        const a = normalize(v), b = normalize(q.answer);
        const ok = a === b;
        const close = !ok && b.length >= 4 && lev(a, b) === 1;
        input.disabled = true;
        input.classList.add(ok ? 'ok' : 'bad');
        return { ok, close, quality: ok ? 1 : close ? 0.3 : 0, answer: arEl(q.answer) };
      },
    };
  },

  match(q, ctx) {
    const left = shuffle(q.pairs), right = shuffle(q.pairs);
    let selL = null, selR = null, mistakes = 0, matched = 0;
    const missesBy = {};
    const lBtns = left.map(p => h('button.mt', { type: 'button', 'data-n': p.n, onclick: () => pickSide('L', p.n) }, h('span.opt-num', num(p.left))));
    const rBtns = right.map(p => h('button.mt' + (p.right.ar ? '.mt-ar' : ''), { type: 'button', 'data-n': p.n, onclick: () => pickSide('R', p.n) },
      p.right.ar ? arEl(p.right.ar) : h('span', L(p.right.title))));
    function pickSide(side, n) {
      if (side === 'L') selL = selL === n ? null : n; else selR = selR === n ? null : n;
      lBtns.forEach(b => b.classList.toggle('sel', +b.dataset.n === selL));
      rBtns.forEach(b => b.classList.toggle('sel', +b.dataset.n === selR));
      sfx.select();
      if (selL != null && selR != null) {
        const lb = lBtns.find(b => +b.dataset.n === selL), rb = rBtns.find(b => +b.dataset.n === selR);
        if (selL === selR) {
          [lb, rb].forEach(b => { b.classList.remove('sel'); b.classList.add('done'); b.disabled = true; });
          matched++;
          sfx.correct(matched);
          if (matched === q.pairs.length) setTimeout(() => ctx.submit(), 350);
        } else {
          mistakes++;
          missesBy[selL] = (missesBy[selL] || 0) + 1;
          missesBy[selR] = (missesBy[selR] || 0) + 1;
          [lb, rb].forEach(b => { b.classList.remove('sel'); b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 450); });
          sfx.wrong();
          haptic([30, 40, 30]);
        }
        selL = selR = null;
      }
    }
    return {
      el: h('div', qHeader(t('q.match')), h('div.match', h('div.mcol', lBtns), h('div.mcol', rBtns))),
      check(arg) {
        const skipped = arg === 'skip' && matched < q.pairs.length;
        [...lBtns, ...rBtns].forEach(b => { b.disabled = true; });
        const records = q.pairs.map(p => ({ n: p.n, facet: 'number', q: skipped ? 0 : Math.max(0, 1 - 0.5 * (missesBy[p.n] || 0)) }));
        const ok = !skipped && mistakes <= 1;
        return { ok, quality: skipped ? 0 : Math.max(0, 1 - 0.25 * mistakes), records,
          answer: skipped ? h('span', q.pairs.map(p => `${num(p.n)} — ${p.right.ar || L(p.right.title)}`).join(' · ')) : null };
      },
    };
  },

  recite(q) {
    const hd = H(q.n);
    const reveal = h('div.reveal');
    const hintBox = h('div.hint-box');
    const hintBtn = h('button.btn.small.ghost', {
      type: 'button',
      onclick: () => {
        hintBtn.remove();
        hintBox.append(h('p.first-letters.ar', { dir: 'rtl', lang: 'ar' },
          prep(q.n).tokens.filter(tk => tk.kind !== 't').map(tk => firstLetter(tk.core)).join(' ')));
      },
    }, '💡 ' + t('btn.hints'));
    return {
      el: h('div.q-recite',
        qHeader(t('q.recite')),
        h('div.prompt-card.center',
          h('div.big-num.xl' + (hd.ibnRajab ? '.ir' : ''), num(hd.n)),
          h('div.prompt-title', L(hd.title)),
          h('div.muted', heading(hd))),
        h('p.hint', t('q.reciteHint')),
        recorderPanel(q.n, { compact: true }),
        hintBtn, hintBox, reveal),
      reveal() {
        hintBox.remove(); hintBtn.remove(); reveal.append(renderHadith(hd));
        const box = S.el.body; // scroll only the lesson pane, never the page behind it
        box.scrollTo({ top: reveal.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12, behavior: 'smooth' });
      },
      check(g) { if (g == null) return null; return { ok: g >= 0.5, quality: g }; },
    };
  },
};

export function plainText(hd) {
  return hd.paras.map(segs => segs.map(([, x]) => x).join('')).join('\n').replace(/[{}«»]/g, '');
}

function arabicKeyboard(onKey) {
  const rows = ['ضصثقفغعهخحجد', 'شسيبلاتنمكطذ', 'ئءؤرىةوزظأإآ'];
  return h('div.kb', { dir: 'rtl' },
    rows.map(r => h('div.kb-row', [...r].map(ch => h('button.kb-key', { type: 'button', onclick: () => onKey(ch) }, ch)))),
    h('div.kb-row', h('button.kb-key.wide', { type: 'button', onclick: () => onKey('⌫'), 'aria-label': 'backspace' }, '⌫')));
}

function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}
