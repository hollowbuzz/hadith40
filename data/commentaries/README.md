# Commentaries (Arabic + English)

Three short commentaries on al-Nawawī's Forty with Ibn Rajab's addition (50 hadiths), aligned Arabic–English sentence by sentence for the app's three reading modes.

| File | Book | Author | Blocks | Segments |
|---|---|---|---|---|
| `fath-al-qawi-al-matin.json` | فتح القوي المتين | ʿAbd al-Muḥsin al-ʿAbbād | 566 | 1,513 |
| `al-tuhfah-al-rabbaniyyah.json` | التحفة الربانية | Ismāʿīl al-Anṣārī | 743 | 992 |
| `al-sharh-al-mujaz-al-mufid.json` | الشرح الموجز المفيد | ʿAbdullāh al-Muḥsin | 494 | 1,085 |

Every segment has English; none is left untranslated. The Arabic was checked word for word against the Shamela `.htm` exports.

## Shape

```
{
  schema: "arbaeen.commentary", schema_version: "2.0", id,
  book:        { short_title, title, subtitle?, author, author_death_ah?, category, publisher, edition,
                 printed_page_count, source: { platform, shamela_publication_date, filename, title_card_ar?, page_numbering } },
  translation: { status, language, revised, method, conventions[], notes[] },
  stats:       { hadiths, blocks, segments, untranslated_segments, editorial_notes },
  front_matter: Block[],
  hadiths: [{
    id: "h01", number,            // number as printed in this book
    standard_number,              // al-Nawawī/Ibn Rajab order (matches the app); differs only for 21/22 in al-Mūjaz
    collection: "nawawi" | "ibn-rajab",
    heading: {ar, en}, title: {ar, en},          // title = the app's title for the hadith
    pages: {start, end}, notes?: [{en}],
    sections: [{
      type: "hadith" | "vocabulary" | "commentary" | "benefits" | "poetry",
      heading: {ar, en} | null, number?,         // number: Fath prints the lessons heading as a numbered paragraph
      blocks: Block[]
    }]
  }],
  back_matter: Block[]
}

Block = {
  id: "<book>.h07.c2",            // stable: section letter n/v/c/b/p + printed or sequential number
  number?, printed_number?,       // numbered commentary paragraphs, vocabulary entries, benefits
  term?: {ar, en},                // al-Tuḥfah vocabulary: the word or phrase explained
  pages: [int],
  paragraphs: [{ kind: "prose" | "verse" | "label", segments: [{ar, en}] }],
  notes?: [{en}]                  // translator's notes on misprints etc.
}
```

## Reading modes

```js
const text = (p, lang) => p.segments.map(s => s[lang]).join(' ');   // a verse paragraph: render one segment per line

// Arabic only / English only: one <p> per paragraph, text(p, 'ar') or text(p, 'en')
// Arabic + English: for each segment, the Arabic line (dir="rtl") with its English directly beneath
```

Segments are a sentence or a short clause. Prose segments join with single spaces in either language. Poetry has one segment per verse, with hemistichs separated by `…` in Arabic and ` / ` in English.

## Rebuilding

The English lives in `tools/commentaries/en/<book>/NN.tsv`: one line per Arabic segment, plus `!` lines for notes. Conventions are in `tools/commentaries/STYLE.md`. To regenerate:

```bash
cd tools/commentaries
python3 -I prep.py "$TMPDIR/arbaeen-tr"       # reads the draft JSONs in ~/Downloads and the .htm exports on the Desktop
python3 -I assemble.py "$TMPDIR/arbaeen-tr"   # validates and writes these files
python3 -I verify.py "$TMPDIR/arbaeen-tr"     # Arabic coverage + alignment check
```

Each `NN.lock.json` records the Arabic every segment was translated against, so a change in segmentation fails the build instead of shifting translations.

## Caveats

The English is a new translation made with Claude (AI). It has not yet been reviewed by a scholar. The authors' views and gradings are translated as theirs. The commentaries are copyrighted publications; check the rights before publishing them in a public repository or app.
