// Shared rendering components.
import { HADITH, SOURCE, TAKHREEJ } from './data.js';
import { state } from './store.js';
import { h } from './ui.js';
import { t, L, num, isAr } from './i18n.js';
import { stripTashkeel, ornate, prep } from './text.js';
import { crowns, status, strength, isDue } from './srs.js';

export const ar = s => (state.settings.showTashkeel ? s : stripTashkeel(s));

/** Arabic span with correct direction. */
export const arEl = (text, cls = '') => h('span.ar' + (cls ? '.' + cls : ''), { dir: 'rtl', lang: 'ar' }, ar(text));

export function renderHadith(hd, { translation = state.settings.showTranslation, legend = false } = {}) {
  const wrap = h('div.hadith');
  hd.paras.forEach((segs, i) => {
    const p = h('p.hp.ar', { dir: 'rtl', lang: 'ar' });
    for (const [kind, text] of segs) {
      p.append(h('span.seg-' + kind, ar(kind === 'q' ? ornate(text) : text)));
    }
    wrap.append(p);
    if (translation && hd.en[i]) wrap.append(h('p.hp-en', { dir: 'ltr', lang: 'en' }, hd.en[i]));
  });
  if (legend) {
    wrap.prepend(h('div.legend',
      h('span.lg.lg-i', t('hd.legendNarr')), h('span.lg.lg-m', t('hd.legendMatn')), h('span.lg.lg-t', t('hd.legendTakh'))));
  }
  return wrap;
}

export function heading(hd) {
  return isAr() ? ar(hd.heading) : t('hadithN', { n: hd.n });
}

export function crownsEl(n, size = 14) {
  const c = crowns(n);
  return h('span.crowns', { title: `${t('hd.level')} ${num(c)}/5` },
    Array.from({ length: 5 }, (_, i) => h('span.crown' + (i < c ? '.on' : ''), { style: { width: size + 'px', height: size + 'px' } })));
}

export function strengthBar(s, cls = '') {
  const pct = Math.round(s * 100);
  const tone = s < 0.5 ? 'weak' : s < 0.8 ? 'learning' : 'strong';
  return h('div.sbar' + (cls ? '.' + cls : ''), { role: 'meter', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('div.sbar-fill.' + tone, { style: { width: pct + '%' } }));
}

export function statusChip(n) {
  const s = status(n);
  const chips = [h('span.chip.st-' + s, t('status.' + s))];
  if (isDue(n)) chips.push(h('span.chip.st-due', t('status.due')));
  return chips;
}

/** Name object {ar,en} → element showing the UI-language name (+ Arabic below in English UI). */
export function nameEl(obj) {
  if (isAr()) return h('span.name', arEl(obj.ar));
  return h('span.name', h('span', obj.en), h('small.sub', { dir: 'rtl', lang: 'ar' }, obj.ar));
}

export const takhreejName = key => TAKHREEJ[key];

export function sourceLink(hd) {
  const pg = hd.pages[0];
  return h('a.source', { href: SOURCE.pageUrl + pg.id, target: '_blank', rel: 'noopener' }, t('hd.sourcePage', { p: num(pg.num) }));
}

export function hadithCard(n, { onclick } = {}) {
  const hd = HADITH[n - 1];
  const s = strength(n);
  return h('button.hcard', { onclick, type: 'button' },
    h('div.hcard-num' + (hd.ibnRajab ? '.ir' : ''), num(n)),
    h('div.hcard-body',
      h('div.hcard-title', L(hd.title)),
      h('div.hcard-open', arEl(prep(n).opening)),
      h('div.hcard-meta', h('span.muted', L(hd.narrator)), ...statusChip(n))),
    h('div.hcard-side', crownsEl(n, 12), strengthBar(s, 'mini')));
}
