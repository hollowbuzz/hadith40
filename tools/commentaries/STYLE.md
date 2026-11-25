# Translation style sheet (three commentaries)

Shared by the English of: فتح القوي المتين (al-ʿAbbād) · التحفة الربانية (al-Anṣārī) · الشرح الموجز المفيد (al-Muḥsin).
Matches the conventions already used in the Arbaʿīn app (`tools/meta.json`).

## Workflow

1. `python3 -I prep.py` → skeletons + worksheets in the scratch `work/` dir (Arabic auto-split into segments with ids such as `c3a`).
2. Translator writes `en/<book>/<NN>.tsv` (NN = 00 for front/back matter, 01–50 per hadith in the book's own numbering).
3. `python3 -I assemble.py` → validates and writes `data/commentaries/<book>.json`.

### TSV line format

```
c3a<TAB>English for segment c3a
c3b+c3c<TAB>English covering two consecutive segments (merged into one aligned unit)
!c3<TAB>Translator's note attached to block c3 (textual problem, ambiguity)
@title<TAB>(optional) override of the hadith title
# comment
```

Every segment must be covered exactly once. Merges only join consecutive segments in the same paragraph.

## Principles

- Translate everything: no summarising, no omissions, no added commentary. Editorial additions go in [square brackets] (e.g. Qurʾān references) or in `!` notes.
- Each English segment must correspond to its Arabic segment and must also read naturally when the segments are concatenated (English-only mode).
- The Arabic is never changed. Where it has an evident typo, translate the intended reading and add a `!` note: `The printed text reads X; read Y.`
- The author's opinions and gradings are rendered as his, without softening or endorsing.
- British spelling (honour, recognise, behaviour), as in the app.

## Fixed renderings

| Arabic | English |
|---|---|
| صلى الله عليه وسلم | ﷺ |
| صلى الله عليه وآله وسلم / وعلى آله | (Allah bless him and his family and grant them peace) |
| عليه السلام / عليه الصلاة والسلام | (peace be upon him) / (blessings and peace be upon him) |
| رضي الله عنه / عنها / عنهما / عنهم | (may Allah be pleased with him / her / them both / them) |
| رحمه الله / رحمهم الله | (may Allah have mercy on him / them) |
| عز وجل | the Mighty and Majestic |
| تعالى / سبحانه وتعالى / تبارك وتعالى / جل وعلا | the Exalted / Glorified and Exalted is He / Blessed and Exalted is He / Majestic and Exalted is He |
| رواه / أخرجه | reported by / recorded by |
| متفق عليه | agreed upon (al-Bukhārī and Muslim) |
| قوله: "..." | His words, “…” / The words, “…” |
| الحديث الأول | Hadith 1 |

## Terms (first use in a block may add the transliteration in brackets)

faith (īmān) · Islam · excellence (iḥsān) · divine decree (al-qadar) · the Hour · the Hereafter · this world / worldly life (al-dunyā) · Paradise · the Fire · prayer (ṣalāh) · zakāh · fasting · Ḥajj · ʿUmrah · Ramaḍān · wuḍūʾ (ablution) · jihād · emigration (hijrah) · the Sunnah · innovation (bidʿah) · shirk (associating partners with Allah) · tawḥīd · disbelief (kufr) · hypocrisy (nifāq) · lawful (ḥalāl) / unlawful (ḥarām) · doubtful matters (shubuhāt) · obligatory (wājib) · recommended (mustaḥabb) · disliked (makrūh) · permissible (mubāḥ) · the Sharīʿah · sincerity (ikhlāṣ) · showing off (riyāʾ) · sincere counsel (naṣīḥah) · taqwā (fear of Allah / mindfulness of Allah, as context requires) · scrupulousness (waraʿ) · zuhd (detachment from the world) · modesty (ḥayāʾ) · reliance on Allah (tawakkul) · repentance (tawbah) · the Companions · the Successors (Tābiʿūn) · the Salaf · people of knowledge · jurists · hadith scholars · chain of narration (isnād) · text (matn) · authentic (ṣaḥīḥ) · good (ḥasan) · weak (ḍaʿīf) · mursal · marfūʿ · mawqūf · ḥadīth qudsī · prescribed punishment (ḥadd, pl. ḥudūd) · discretionary punishment (taʿzīr) · retaliation (qiṣāṣ) · fixed inheritance shares (farāʾiḍ) · agnatic heirs (ʿaṣabah).
"hadith" (pl. hadiths) is used as an English word; "the Forty" / "the Forty Hadith" for the collection.

## Names (full transliteration, ʿ = ع, ʾ = ء, sun letters not assimilated)

Allah · Muḥammad · Jibrīl · Mīkāʾīl · Isrāfīl · Mūsā · ʿĪsā · Ibrāhīm · Lūṭ · Maryam · Ādam · Nūḥ ·
ʿUmar ibn al-Khaṭṭāb · Abū Bakr · ʿUthmān · ʿAlī · ʿĀʾishah · Abū Hurayrah · Ibn ʿAbbās · Ibn ʿUmar · Ibn Masʿūd · Anas ibn Mālik · Jābir · Abū Dharr · Muʿādh ibn Jabal · al-Nuʿmān ibn Bashīr · Tamīm al-Dārī · Abū Saʿīd al-Khudrī ·
al-Nawawī · Ibn Rajab · Ibn Ḥajar · Ibn Taymiyyah · Ibn al-Qayyim · Ibn Daqīq al-ʿĪd · al-Baghawī · al-Khaṭṭābī · al-Shāfiʿī · Mālik · Aḥmad · Abū Ḥanīfah · al-Bukhārī · Muslim · Abū Dāwūd · al-Tirmidhī · al-Nasāʾī · Ibn Mājah · al-Dāraquṭnī · al-Bayhaqī · al-Ḥākim · Ibn Ḥibbān · al-Ṭabarānī · al-Dārimī ·
Ṣaḥīḥ al-Bukhārī · Ṣaḥīḥ Muslim · Jāmiʿ al-ʿUlūm wa-l-Ḥikam · Fatḥ al-Bārī · Sharḥ al-Sunnah · Maṣābīḥ al-Sunnah · al-Muwaṭṭaʾ ·
Makkah · Madīnah · al-Baṣrah · al-Kūfah · al-Shām · Abyssinia · Mount Uḥud ·
Qadariyyah · Khawārij · Murjiʾah · Muʿtazilah · Jahmiyyah · Ahl al-Sunnah wa-l-Jamāʿah.

Qurʾān (with ʾ), Sunnah, Sharīʿah, Ramaḍān, zakāh — never "Quran", "Gabriel", "Mecca", "Medina", "peace and blessings be upon him".

## Layout conventions (decided while translating)

- Vocabulary entries: `Term (“gloss”): explanation`. A single word is transliterated with its gloss (`Innamā (“only”): …`); a phrase is given as an English quotation (`“To Allah and His Messenger”: …`). The part before the first colon becomes the entry's `term.en`.
- Poetry: one segment per verse (bayt); hemistichs separated by ` / ` to mirror the Arabic `…`. `آخر:` = “Another poet:”.
- Numbered benefits: plain statements without a leading “That …”; the printed number lives in the data, not the text.
- Notes (`!key`) only where a misprint changes the meaning; trivial spelling slips are silently read correctly.
- Qurʾān citations get a bracketed reference [Sūrah n:v] when certain.
