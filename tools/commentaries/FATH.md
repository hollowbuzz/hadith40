# Smoothing the Fatḥ al-Qawī al-Matīn translation — brief for batch editors

The English of al-ʿAbbād's *Fatḥ al-Qawī al-Matīn* (`en/fath/NN.tsv`, ~1,500 segments) is complete and aligned, but in places it reads like a translation: calqued word order, Arabic idioms rendered literally, a few broken sentences, and lists of lessons written as fragments. This pass makes it **smooth, natural and clear for an English-only reader**, and checks it against the Arabic as it goes. It is an edit, not a retranslation: keep what is already good.

| Batch | Chapters | Lines |
|---|---|---|
| 1 | 0–9 (00 = front and back matter; hadith 1–9) | ~480 |
| 2 | 10–28 | ~470 |
| 3 | 29–50 | ~570 |

## Setup (once)

```bash
cd tools/commentaries
python3 -I prep.py <scratch>     # skeletons, worksheets <scratch>/work/fath/NN.txt, and fath_src.json for verify
```

Use your own scratch folder (your session's scratchpad).

## For each chapter NN

1. Read the English straight through, as a reader of the app will see it:
   ```bash
   python3 -I jami.py <scratch> --read NN --book fath
   ```
2. Read it against the Arabic in `<scratch>/work/fath/NN.txt` (same segment ids). Fix:
   - **mistranslations and omissions** (every statement, qualification, name, reference number and hadith number must be there);
   - **broken or ungrammatical sentences** (e.g. "it requires that no one be judged in favour of merely on his claim");
   - **calques** (e.g. "how people are to be judged between in this", "it has come from ʿĀʾishah that", "in the language", "his words … : when a person…" where the part after the colon is not a sentence);
   - **awkward ﷺ placement**: "his ﷺ character", "the Messenger's ﷺ" → "the Prophet's character ﷺ", "the Messenger ﷺ's" is also wrong; put ﷺ after the name or the whole noun phrase.
3. Edit the English in place in `en/fath/NN.tsv`. Keep the ids. You may **merge** adjacent segments (`a+b`) where separate pieces read badly; never split one. Keep `!` notes unless they are wrong.
4. Check:
   ```bash
   python3 -I assemble.py <scratch> --book fath --check
   ```
   0 errors and 0 warnings for your chapters. Then read the chapter through once more with `--read`.

When the batch is done:

```bash
python3 -I assemble.py <scratch> --book fath --out <scratch>/out
python3 -I verify.py <scratch> --book fath --chapters A-B --data <scratch>/out
```

No ratio outliers and no style flags for your chapters, or explain each one.

## How it should read

- Natural English word order and varied sentence openings. Drop a sentence-initial و; render فـ as "so", "then", "thus" or nothing; avoid "verily", "know that" chains and stacked "that … that …".
- **Commentary on a phrase.** Keep al-ʿAbbād's lemma form but make what follows a real sentence:
  `His words “Fear Allah wherever you are”: taqwā originally means placing a shield between yourself and what you fear …`
- **Benefits lists (`b` blocks, «مما يستفاد من الحديث»).** Each item is one clear, grammatical line. Use a noun phrase or a full sentence, and keep to one form within a chapter:
  `The Messenger's perfect sincerity towards his nation ﷺ, seen in the three comprehensive pieces of advice in this hadith.`
  `The command to fear Allah at all times, in every place and every circumstance.`
- **Reporting verbs.** ورد / جاء → "is reported", "is narrated", "comes in"; رواه → "reported it"; أخرجه / خرّجه → "recorded it". Keep numbers like "(746)" exactly as they are.
- **The hadith text (`n` blocks)** keeps its conventional form ("On the authority of …", "Reported by al-Tirmidhī …"); only fix real errors there.
- Al-ʿAbbād's citations of other commentators: "Ibn Daqīq al-ʿĪd said in his commentary on the Forty"; "al-Nawawī said in his commentary on the Forty".
- Square brackets only for words you genuinely add. British spelling. Terms per STYLE.md's glossary and names list (and, where the same term comes up, JAMI.md › "Decided terms", e.g. "as marfūʿ", "the God-fearing", "a reported position of Aḥmad").
- Smooth means well written, not shorter. Never summarise or drop anything.

## Do not

- Edit anything except your own chapters' `en/fath/NN.tsv` (`.lock.json` is rewritten by the check only if needed). Not the scripts, STYLE.md, meta.json, other books, other chapters, or the app.
- Run `assemble.py` without `--check` or `--out <scratch>/out` (plain `assemble.py` writes `data/`; the coordinator does that).
- Commit, push, or switch branches.

## Report when done

Chapters, how many lines you changed per chapter, the final `--check` and `verify.py` lines, the mistranslations or omissions you corrected (id and a few words each), any term choices, and anything you were unsure of.
