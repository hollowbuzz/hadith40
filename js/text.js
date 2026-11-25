// Arabic text utilities + per-hadith derived data (tokens, phrases, openings).
import { HADITH } from './data.js';

const DIAC = /[ً-ْٰـ]/g;
export const stripTashkeel = s => s.replace(DIAC, '');

export function normalize(s) {
  return stripTashkeel(s)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^ء-يa-z0-9]/gi, '')
    .toLowerCase();
}

/** Qur'an braces → ornate parentheses for display. */
export const ornate = s => s.replace(/\{/g, '﴿').replace(/\}/g, '﴾');

const PUNCT = '«»{}()[]﴿﴾-–—"\'.,،؛;:!?؟';
const isP = ch => PUNCT.includes(ch);

const STOP = new Set(['من', 'في', 'علي', 'الي', 'عن', 'ما', 'لا', 'ان', 'قال', 'الله', 'لله', 'يا', 'ثم', 'او', 'هو', 'هي', 'لم', 'لن',
  'قد', 'كل', 'اذا', 'فقال', 'قلت', 'قالوا', 'صلي', 'عليه', 'وسلم', 'رسول', 'بن', 'ابي', 'ابن', 'انه', 'لك', 'له', 'به', 'بها', 'منه', 'فيه', 'الا', 'وان', 'ومن', 'فان']);

function tokenize(h) {
  const tokens = [];
  h.paras.forEach((segs, para) => {
    segs.forEach(([kind, text]) => {
      for (const raw of text.split(/\s+/)) {
        if (!raw) continue;
        let a = 0, b = raw.length;
        while (a < b && isP(raw[a])) a++;
        while (b > a && isP(raw[b - 1])) b--;
        const core = raw.slice(a, b);
        if (!core) {
          const prev = tokens[tokens.length - 1];
          if (prev && prev.para === para) prev.post += raw;
          continue;
        }
        tokens.push({ i: tokens.length, kind, para, pre: raw.slice(0, a), core, post: raw.slice(b), norm: normalize(core) });
      }
    });
  });
  return tokens;
}

function buildPhrases(tokens) {
  const matn = tokens.filter(t => t.kind === 'm' || t.kind === 'q');
  const phrases = [];
  let cur = [];
  matn.forEach((t, k) => {
    cur.push(t.i);
    const next = matn[k + 1];
    const brk = /[،.؛:!?؟»]/.test(t.post) || !next || next.para !== t.para || next.i !== t.i + 1;
    if ((brk && cur.length >= 2) || cur.length >= 9) { phrases.push(cur); cur = []; }
  });
  if (cur.length) {
    if (phrases.length && cur.length < 2) phrases[phrases.length - 1].push(...cur);
    else phrases.push(cur);
  }
  return phrases;
}

export const PREP = HADITH.map(h => {
  const tokens = tokenize(h);
  const matn = tokens.filter(t => t.kind === 'm' || t.kind === 'q');
  const phrases = buildPhrases(tokens);
  const blankable = matn.filter(t => t.norm.length >= 3 && !STOP.has(t.norm)).map(t => t.i);
  // opening = first 6–10 matn words (to the first natural break after 6)
  const open = [];
  for (const t of matn) {
    open.push(t);
    if (open.length >= 10 || (open.length >= 6 && /[،.؛:!?؟]/.test(t.post))) break;
  }
  const opening = open.map(t => t.core).join(' ') + (open.length < matn.length ? ' …' : '');
  // English gist: the first quoted passage of the translation
  const en0 = h.en.join(' ');
  const qm = en0.match(/“([^”]+)/);
  let gist = (qm ? qm[1] : en0).trim();
  if (gist.length > 170) gist = gist.slice(0, 165).replace(/\s+\S*$/, '') + ' …';
  return { n: h.n, tokens, matn, phrases, blankable, opening, gist };
});

export const prep = n => PREP[n - 1];

/** Text of a list of token indices, optionally keeping punctuation. */
export function phraseText(n, idxs, punct = true) {
  const tk = PREP[n - 1].tokens;
  return idxs.map(i => punct ? tk[i].pre + tk[i].core + tk[i].post : tk[i].core).join(' ')
    .replace(/[«»]/g, '').trim();
}

/** "ا… ب… ج…" first-letter hint for a word. */
export function firstLetter(core) {
  const plain = stripTashkeel(core);
  return plain ? plain[0] + '…' : core;
}
