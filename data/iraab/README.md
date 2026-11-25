# Iʿrāb al-Arbaʿīn al-Nawawiyyah (Arabic)

«إعراب الأربعين النووية» by ʿUmar ibn ʿAbdillāh al-ʿUmarī (completed 7 Dhū al-Ḥijjah 1425 AH): a word-by-word grammatical analysis of al-Nawawī's 42 hadith. Source: [ketabonline.com/ar/books/12753](https://ketabonline.com/ar/books/12753). The book is not on shamela.ws.

The file is Arabic only. The book is grammatical analysis in Arabic terminology, so it is not translated.

| | |
|---|---|
| Hadith | 42 (al-Nawawī's; Ibn Rajab's addition is not covered) |
| Iʿrāb entries | 1,238 |
| Footnotes | 46, each attached to the passage with its marker |

## Shape

```
{
  schema: "arbaeen.iraab", schema_version: "1.0", id,
  book: { title, subtitle, author, completed, rights, language: "ar", source: { platform, url, note } },
  notes: [string],                       // how the text was prepared (English)
  stats: { hadiths, entries, footnotes },
  front_matter: Para[],                  // the author's introduction and sign-off
  hadiths: [{
    id: "h01", number, standard_number, collection: "nawawi",
    heading: {ar, en}, title: {ar, en},  // title = the app's title for the hadith
    text: Para[],                        // the hadith as the book quotes it
    iraab: Item[]                        // in the book's order
  }],
  back_matter: Para[],
  references: [string]                   // the author's bibliography
}

Para = { ar, notes?: [{ n, ar }] }       // "(n)" in ar marks footnote n
Item = { kind: "entry", head, ar, notes? }   // «head»: ar — one word or phrase of the hadith
     | { kind: "note" | "label", ar, notes? } // a remark, a quotation, or a sub-heading
```

An entry's `ar` keeps the analysis of the word's parts («الباء»، «الهاء»…) and of a conjunction parsed on its own («و»: حرف عطف) at its start, in the author's wording.

## How the app shows it

The Iʿrāb tab on hadith 1–42 shows the hadith as the book quotes it, then the entries. Each word that has an entry is underlined: tapping it opens that entry in a sheet, with previous/next through the entries. The app links an entry's head to the words of the hadith in order (95% of entries link; the rest are phrases the author splits or words he quotes differently, and they still appear in the list).

## Rebuilding

```bash
python3 -I tools/iraab/build.py /path/to/iraab.txt
```

The input is a plain-text extraction of the book's PDF. The script joins paragraphs split by page breaks, attaches footnotes, restores the Qurʾān brackets (exported as `+ … "`) as ﴿ … ﴾ and `×` as ﷺ, removes spaces the extraction put inside words (a checked list), and normalises spacing around punctuation. The author's wording is otherwise as printed, including his own slips. His address, e-mail and telephone number on the title page are not copied, and the printed contents list is replaced by the app's.

## Caveats

- The introduction mentions a study of *wāw al-thamāniyah*. It is not in the text this file was built from.
- The title page says «كل الحقوق محفوظة» (all rights reserved). Check the rights before publishing this file in a public repository or app.
