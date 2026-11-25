# Hadith audio with Google Cloud Text-to-Speech

`generate.py` reads the app's own vowelled Arabic for each hadith and makes one MP3 per hadith in `data/audio/`, plus `data/audio/index.json` with when each paragraph and word starts. The app then:

- plays the recording on **Listen** (hadith page and the "new hadith" lesson card), at the *Listen speed* set in Settings;
- highlights each word as it is spoken (paragraphs, for voices without word timings);
- lets you tap any word in the Read tab to play from there;
- keeps each recording for offline use once it has been played;
- falls back to the device's voice for any hadith without a file.

## 1. Set up Google Cloud (once)

1. In the [Google Cloud console](https://console.cloud.google.com/), create or pick a project. Text-to-Speech needs a billing account on the project.
2. Enable the **Cloud Text-to-Speech API** (APIs & Services → Library).
3. Create an API key (APIs & Services → Credentials → Create credentials → API key). Under *API restrictions*, restrict it to **Cloud Text-to-Speech API**.
4. In Terminal, in this folder:

   ```bash
   export GOOGLE_TTS_API_KEY='your key'
   ```

   Keep the key out of the repository and out of chat. If your organisation doesn't allow API keys, install the gcloud CLI and use `export GOOGLE_TTS_ACCESS_TOKEN=$(gcloud auth print-access-token)` and `export GOOGLE_CLOUD_PROJECT=your-project-id` instead.

## 2. Pick a voice

```bash
python3 -I tools/audio/generate.py --samples
```

This reads hadith 1 in ten voices into `tools/audio/samples/` (not committed). Listen with someone who knows the hadith well.

| Family | Voices | Word highlighting |
|---|---|---|
| WaveNet | `ar-XA-Wavenet-A` (f), `-B` (m), `-C` (m), `-D` (f) | yes |
| Standard | `ar-XA-Standard-A` (f), `-B` (m), `-C` (m), `-D` (f) | yes |
| Chirp 3 HD (most natural) | `ar-XA-Chirp3-HD-Charon`, `-Kore`, `-Puck`, `-Aoede`, and 26 more | paragraphs only (Google gives no word timings for these voices) |

`ar-XA` is Modern Standard Arabic.

## 3. Generate all 50

```bash
python3 -I tools/audio/generate.py --voice ar-XA-Wavenet-B
```

- `--rate 0.9` sets the speaking rate (Standard and WaveNet; the default is 0.9). Students can slow it further with *Listen speed*.
- `--only 2,10-12` redoes just those hadith; `--force` regenerates even unchanged ones. Unchanged hadith (same text, voice and rate) are skipped.
- A different `--voice` without `--only` replaces every file.

Then open the app, listen to every hadith, and regenerate any with a mispronounced word (try another voice for that hadith only if needed). Commit `data/audio/`.

**Cost:** Google bills per character, and SSML tags count. A full run is about 86,000 characters with Standard or WaveNet (each word carries a timing mark) and about 28,000 with Chirp 3 HD. Check [current pricing](https://cloud.google.com/text-to-speech/pricing) and the free monthly allowance.

**Size:** about 0.35 MB per minute of audio (48 kbps mono MP3). The app does not download all of it at install; each file is kept after its first play.

## Preview without Google

```bash
python3 -I tools/audio/generate.py --engine say --only 1,2
```

This uses the macOS Arabic voice and estimated word timings, and writes to `tools/audio/preview/` (not committed). Copy that folder's contents into `data/audio/` to try the player, and delete them before generating the real audio.
