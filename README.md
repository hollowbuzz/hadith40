# Jawāmiʿ — جوامع

**40 Hadith** · <https://hollowbuzz.github.io/hadith40/>

The name comes from *jawāmiʿ al-kalim*, the concise, comprehensive words these hadith are known for.

A gamified, offline-first web app to **memorise and revise al-Nawawī’s Forty Hadith with Ibn Rajab’s addition (50 hadith)** — in Arabic and English.

The Arabic text is taken verbatim from **«متون طالب العلم – المستوى الأول»**, edited by Shaykh ʿAbd al-Muḥsin al-Qāsim ([Shamela, book 570](https://shamela.ws/book/570/68), pp. 79–140). Hadith 43–50 are Ibn Rajab’s addition.

## Features

- **Learning path** in five units (1–10, 11–20, 21–30, 31–42, Ibn Rajab 43–50); each hadith has 5 mastery levels.
- **Exercises:** word order, fill-in-the-blank (multiple choice or typed with an on-screen Arabic keyboard), “what comes next?”, “what comes before?”, the missing phrase, spot the wrong word, phrase order, “which hadith is this from?”, hadith **numbers** (both directions), **narrators**, **takhrīj**, topics and meanings, matching pairs, and a self-graded **recitation check**.
- **Strength tracking:** every hadith is tracked on five facets (text, number, narrator, takhrīj, meaning). Spaced-repetition review schedules each hadith, and *Weak spots* drills your weakest hadith and facets.
- **Memorise mode:** hide 25–100% of the words (random, from the end, or first letters), then tap a word to peek.
- **Record yourself:** record your recitation (Memorise tab, and in the recitation check) and play it back at 0.75×–2×. Recordings stay on the device, the newest 10 per hadith.
- **Commentaries:** three short commentaries on every hadith, *Fatḥ al-Qawī al-Matīn* (al-ʿAbbād), *al-Tuḥfah al-Rabbāniyyah* (al-Anṣārī) and *al-Sharḥ al-Mūjaz al-Mufīd* (al-Muḥsin). Read them as Arabic only, English only, or each Arabic sentence with its English beneath. Open them from the *Commentary* tab on a hadith page, or from the Library, which also has each book’s introduction and contents. The English is an AI translation, not yet reviewed by a scholar.
- **Iʿrāb:** ʿUmar al-ʿUmarī’s word-by-word grammatical analysis of al-Nawawī’s 42 hadith (Arabic). On the *Iʿrāb* tab, tap an underlined word of the hadith to see its iʿrāb, then step through the words.
- **Recorded audio (optional):** generate the hadith with Google Cloud Text-to-Speech (`tools/audio/`). *Listen* then plays the recording with each word highlighted, a tap on any word plays from there, and recordings work offline once played. Without recordings the app uses the device's voice.
- **Sources:** Settings › About lists every text in the app with a link to the original (Shamela, or ketabonline for the iʿrāb).
- **Duolingo-style game layer:** XP, levels, daily goal, streaks, combos, optional hearts, a 60-second lightning round, achievements, confetti and synthesized sound effects (no audio files).
- **Arabic and English UI** (full RTL), English translation per paragraph, tashkeel toggle, choice of Arabic font and text size, light and dark themes.
- **Your data:** saved in the browser (`localStorage`), with JSON **export and import** in Settings.
- **Offline PWA:** installable, and works offline after the first visit (the commentaries included).

## Run locally

No build step is needed. Serve the folder over HTTP; ES modules and service workers don’t work from `file://`.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Host on GitHub Pages

1. Create a new repository on GitHub, for example `hadith40`.
2. Push this folder to it:
   ```bash
   git init && git add . && git commit -m "Jawāmiʿ app"
   git branch -M main
   git remote add origin https://github.com/<you>/hadith40.git
   git push -u origin main
   ```
3. On GitHub, open **Settings → Pages**. Under **Source** choose *Deploy from a branch*, then pick **main** and **/ (root)**, and save.
4. Your site is published at `https://<you>.github.io/hadith40/`. All paths are relative, so it works from a sub-folder.

**Updating:** the service worker is network-first, so online visitors always get the latest files. When you change files, also bump `VERSION` in `sw.js`. This refreshes the offline copy and shows returning users a “new version” prompt.

## Project layout

```
index.html            app shell (+ inline SVG icons)
css/app.css           all styles (light/dark, RTL/LTR, mobile/desktop)
js/app.js             router + views (path, practice, library, hadith page, profile, settings)
js/sharh.js           commentary reader (three books × three reading modes) and book pages
js/iraab.js           iʿrāb reader (tappable words, entry sheet) and its book page
js/audio.js           recorded-audio player with word timings (falls back to the device voice)
js/lesson.js          lesson runner, exercise screens, lightning round, end screens
js/quiz.js            question generators, session builders, and rotation (unseen and missed prompts first)
js/recorder.js        record yourself and play back at any speed (IndexedDB)
js/srs.js             mastery facets, spaced repetition, strength and weak lists
js/text.js            Arabic normalisation, tokens, phrases, openings
js/store.js           localStorage state, XP/streak/level, export/import
js/i18n.js            English/Arabic UI strings
js/data.js            GENERATED hadith dataset (do not edit by hand)
js/render.js, ui.js, sound.js, achievements.js
sw.js, manifest.webmanifest, icons/
data/shamela-raw.json raw text scraped from Shamela
data/commentaries/    the three commentaries, Arabic + English aligned by sentence (see its README)
data/iraab/           the iʿrāb of the 42 hadith, Arabic (see its README)
data/audio/           hadith recordings + index.json with word timings, once generated (see tools/audio/README.md)
tools/                scripts that rebuild js/data.js; tools/commentaries/ and tools/iraab/ rebuild the books;
                      tools/audio/ generates the recordings
```

## Rebuilding the data

```bash
python3 tools/fetch_shamela.py   # re-download pages 71–132 of book 570 → data/shamela-raw.json
python3 tools/build_data.py      # merge with tools/meta.json → js/data.js
```

`tools/meta.json` holds the titles, short narrator names, takhrīj keys, English translations and editorial corrections. The build script splits each paragraph into narration, matn, Qur’an and takhrīj segments, which the app colours differently.

## Notes on the text

- The Arabic is reproduced as it appears in the Shamela edition, including the edition’s spelling (for example «امْرِاءٍ»).
- **One correction:** in hadith 29, the Shamela text ends the quoted ayah with «يَعْلَمُونَ». The ayah (al-Sajdah 32:17) ends «يَعْمَلُونَ», so the app uses that word and shows a note on the hadith page. Edit or remove it under `corrections` in `tools/meta.json`.
- **The English translations were prepared for this app** directly from the Arabic text, paragraph by paragraph. They are not taken from a published translation. Please have them reviewed by a qualified teacher before relying on them.
