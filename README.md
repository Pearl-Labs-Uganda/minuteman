# Minuteman

A small local web app for transcribing audio with OpenAI Whisper.
FastAPI backend + a single vanilla HTML page. No cloud, no API keys.

## What it does today

- Upload an audio file (wav, m4a, mp3, mp4, webm, ogg, flac, ...).
- Transcribes it locally with Whisper.
- Shows the raw transcript with timestamped segments.
- Lets you copy or download the transcript as `.txt`.
- Saves every transcript to `./transcripts/` automatically.

The UI also has placeholder tabs for **Cleaned-up**, **Minutes**, and **Summary** —
these are wired to backend stubs that return 501 until we plug in an LLM provider.

## Setup

You need Python 3.10+ and `ffmpeg` on your `PATH`.

```bash
# macOS
brew install ffmpeg

# Then in this folder:
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The first transcription will download the Whisper model weights
(`~150 MB` for `base`), so it can take a minute the first time.

## Run

```bash
python app.py
```

Open <http://127.0.0.1:8000> in your browser.

## Configuration

- `WHISPER_MODEL` env var — default model to load: `tiny`, `base`, `small`,
  `medium`, or `large`. You can also override per-request from the dropdown
  in the UI.

```bash
WHISPER_MODEL=small python app.py
```

## Project layout

```
minuteman/
├── app.py                 # FastAPI app + /transcribe endpoint
├── static/
│   └── index.html         # single-page frontend (vanilla HTML/JS/CSS)
├── transcripts/           # saved .txt transcripts (auto-created)
├── requirements.txt
└── README.md
```

## What's next

The polish step (cleaned-up text, meeting minutes, summary report) is stubbed
out in `app.py` under `/cleanup`, `/minutes`, and `/summary`. To enable them
we'll wire one of:

- Anthropic Claude API
- OpenAI API
- A local model via Ollama

Just say the word and we'll plug it in.
