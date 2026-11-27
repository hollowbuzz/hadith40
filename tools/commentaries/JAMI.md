# Translating Jāmiʿ al-ʿUlūm wa-l-Ḥikam — brief for batch translators

Ibn Rajab's commentary on the 50 hadith (~186,000 Arabic words, ~8,600 segments) is translated in batches of chapters, several at once. Every batch follows this brief and [STYLE.md](STYLE.md), so the book reads as one translation. **The model is [en/jami/00.tsv](en/jami/00.tsv)** (Ibn Rajab's preface): match its tone and conventions.

| Batch | Chapters | Arabic words |
|---|---|---|
| 1 | 1–4 | ~22,000 |
| 2 | 5–12 | ~24,000 |
| 3 | 13–18 | ~28,000 |
| 4 | 19–25 | ~24,000 |
| 5 | 26–31 | ~26,000 |
| 6 | 32–37 | ~23,000 |
| 7 | 38–45 | ~25,000 |
| 8 | 46–50 | ~14,000 |

## Setup (once)

Use your own scratch folder (your session's scratchpad), never another session's:

```bash
cd tools/commentaries
python3 -I jami.py <scratch>          # skeleton + worksheets → <scratch>/work/jami/NN.txt
```

Segmentation is deterministic: everyone gets the same segment ids.

## For each chapter NN of your batch

1. Read the worksheet `<scratch>/work/jami/NN.txt`: every Arabic segment with its id (`n1a` = the hadith text, `c12b` = commentary paragraph 12, segment b).
2. Write `en/jami/NN.tsv` (two digits): one line per segment, `id<TAB>English`. Format, merges (`c4a+c4b<TAB>…`) and notes (`!c4<TAB>…`) are in STYLE.md › TSV line format. Every segment must be covered exactly once.
3. Check it (writes nothing to `data/`; it records `NN.lock.json`, the Arabic you translated against):
   ```bash
   python3 -I assemble.py <scratch> --book jami --check
   ```
   Your chapters must have **0 errors and 0 warnings**. (Other chapters may still be untranslated; that is expected.)
4. Read your English straight through, the way an English-only reader will see it, and revise until it reads naturally:
   ```bash
   python3 -I jami.py <scratch> --read NN
   ```

When the whole batch is done, assemble into your own scratch folder (never `data/`) and verify from there:

```bash
python3 -I assemble.py <scratch> --book jami --out <scratch>/out
python3 -I verify.py <scratch> --book jami --chapters A-B --data <scratch>/out
```

It must show no ratio outliers and no style flags for your chapters, or you explain each one in your report (a long quotation translated in a short segment, say).

## Readability — the point of this translation

- Write for an educated English reader: natural word order and varied sentence openings, as a skilled human translator would. Do not calque the Arabic.
- Keep every statement, qualification, name and reference. Never summarise or drop anything (isnāds included). Smooth means well written, not shorter.
- A sentence-initial و is usually dropped; فـ becomes "so", "then", "thus", or nothing; إنّ is rarely "verily" or "indeed". Avoid "And verily", "know that" chains, and stacked "that…that…".
- Each segment stands on its own and also flows into the next when read continuously. Where the Arabic splits a sentence so that separate English pieces would be awkward, **merge** the segments (`a+b`); this is common in chains of narration and long quotations. Do not split a segment.
- Square brackets only for words you genuinely add for clarity, or for Qurʾān references.
- British spelling. Consistent terms: use STYLE.md's glossary and names list; when the book has a term STYLE.md lacks, choose one rendering and keep it for the whole batch (list it in your report).

## Conventions specific to Ibn Rajab

| Arabic | English |
|---|---|
| خرّجه فلان / وخرّج فلان من حديث | X recorded it / X recorded, from the hadith of |
| رواه / روينا | X reported / we have narrated |
| حدثنا / أخبرنا / عن | told us / informed us / from |
| بإسناده / إسناده صحيح | with his chain of narration / its chain is authentic |
| الصحيحين، صحيح مسلم، المسند، السنن، الموطأ | the two Ṣaḥīḥs, Ṣaḥīḥ Muslim, the Musnad, the Sunan, the Muwaṭṭaʾ |
| other book titles | transliterated as in STYLE.md (e.g. Gharīb al-Ḥadīth); add an English gloss in brackets only when it helps |
| {Qurʾān} | in “…” with a reference: [al-Naḥl 16:90]. Check the reference; if unsure, leave the number out. |
| رحمه الله after a scholar | (may Allah have mercy on him) |
| وقال آخر: (before verse) | Another poet said: |
| verse | one segment per bayt, hemistichs separated by ` / ` |
| فصل | Section |
| قال الشيخ (= al-Nawawī) | the Shaykh said |

Hadith gradings and the author's opinions are rendered as his, without softening.

### Decided terms (chapters 1–25 use these; keep them)

| Arabic | English |
|---|---|
| المتقون / المتقين | the God-fearing |
| مرفوعاً / موقوفاً | as marfūʿ / as mawqūf. Gloss the **first use in each chapter** (readers open chapters on their own): “as marfūʿ (attributed to the Prophet ﷺ)”, “as mawqūf (stopping short of the Prophet ﷺ)”, or with the name: “as mawqūf on Ibn ʿUmar (his own words)” |
| المرفوع / الموقوف | the marfūʿ version / the mawqūf version (not “the version attributed to the Prophet”) |
| رواية عن أحمد / روايتان عن أحمد | a reported position of Aḥmad / two reported positions of Aḥmad (“Aḥmad, in one reported position”) |
| خرّج رواية عن أحمد | derived a position for Aḥmad |
| أصحابنا | the scholars of our school |

## Do not

- Edit anything except your own chapters' `en/jami/NN.tsv` (`.lock.json` is written by the check). Not jami.py, assemble.py, verify.py, STYLE.md, meta.json, other chapters, or the app.
- Run `assemble.py` without `--check` or `--out <scratch>/out`: plain `assemble.py` writes `data/`, which other batches are reading. The coordinator assembles once batches are done.
- Commit, push, or switch branches.
- Fix the Arabic or the segmentation. If a segment boundary is wrong, merge around it and mention it in your report; if the Arabic has an evident misprint that changes the meaning, translate the intended reading and add a `!` note (STYLE.md › Principles).

## Report when done

Chapters and segment counts, the final `--check` and `verify.py` lines, anything flagged and why, new term choices, and any textual problems you noted.
