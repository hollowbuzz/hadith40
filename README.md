# Arbaʿīn — الأربعون

A gamified, offline-first web app to **memorise and revise al-Nawawī’s Forty Hadith with Ibn Rajab’s addition (50 hadith)** — in Arabic and English.

The Arabic text is taken verbatim from **«متون طالب العلم – المستوى الأول»**, edited by Shaykh ʿAbd al-Muḥsin al-Qāsim ([Shamela, book 570](https://shamela.ws/book/570/68), pp. 79–140). Hadith 43–50 are Ibn Rajab’s addition.

## Features

- **Learning path** in five units (1–10, 11–20, 21–30, 31–42, Ibn Rajab 43–50); each hadith has 5 mastery levels.
- **Exercises:** word order, fill-in-the-blank (multiple choice or typed with an on-screen Arabic keyboard), “what comes next?”, hadith **numbers** (both directions), **narrators**, **takhrīj**, topics and meanings, matching pairs, and a self-graded **recitation check**.
- **Strength tracking:** every hadith is tracked on five facets (text, number, narrator, takhrīj, meaning). Spaced-repetition review schedules each hadith, and *Weak spots* drills your weakest hadith and facets.
- **Memorise mode:** hide 25–100% of the words (random, from the end, or first letters), then tap a word to peek.
- **Commentaries:** three short commentaries on every hadith, *Fatḥ al-Qawī al-Matīn* (al-ʿAbbād), *al-Tuḥfah al-Rabbāniyyah* (al-Anṣārī) and *al-Sharḥ al-Mūjaz al-Mufīd* (al-Muḥsin). Read them as Arabic only, English only, or each Arabic sentence with its English beneath. Open them from the *Commentary* tab on a hadith page, or from the Library, which also has each book’s introduction and contents. The English is an AI translation, not yet reviewed by a scholar.
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

1. Create a new repository on GitHub, for example `arbaeen`.
2. Push this folder to it:
   ```bash
   git init && git add . && git commit -m "Arbaʿīn app"
   git branch -M main
   git remote add origin https://github.com/<you>/arbaeen.git
   git push -u origin main
   ```
3. On GitHub, open **Settings → Pages**. Under **Source** choose *Deploy from a branch*, then pick **main** and **/ (root)**, and save.
4. Your site is published at `https://<you>.github.io/arbaeen/`. All paths are relative, so it works from a sub-folder.

**Updating:** the service worker is network-first, so online visitors always get the latest files. When you change files, also bump `VERSION` in `sw.js`. This refreshes the offline copy and shows returning users a “new version” prompt.

## Project layout

```
index.html            app shell (+ inline SVG icons)
css/app.css           all styles (light/dark, RTL/LTR, mobile/desktop)
js/app.js             router + views (path, practice, library, hadith page, profile, settings)
js/sharh.js           commentary reader (three books × three reading modes) and book pages
js/lesson.js          lesson runner, exercise screens, lightning round, end screens
js/quiz.js            question generators and session builders
js/srs.js             mastery facets, spaced repetition, strength and weak lists
js/text.js            Arabic normalisation, tokens, phrases, openings
js/store.js           localStorage state, XP/streak/level, export/import
js/i18n.js            English/Arabic UI strings
js/data.js            GENERATED hadith dataset (do not edit by hand)
js/render.js, ui.js, sound.js, achievements.js
sw.js, manifest.webmanifest, icons/
data/shamela-raw.json raw text scraped from Shamela
data/commentaries/    the three commentaries, Arabic + English aligned by sentence (see its README)
tools/                scripts that rebuild js/data.js; tools/commentaries/ rebuilds data/commentaries/
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
