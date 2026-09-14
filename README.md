# Minuteman

A local study app: record a lecture, transcribe it with OpenAI Whisper, and
keep it alongside the class slides. FastAPI + SQLite backend, Next.js frontend.
Accounts and data stay on your machine — no cloud, no API keys.

## What it does today

- **Accounts** — email + password sign-in; every lecture belongs to one account.
- **Lectures** — the top-level unit: one recording plus its class materials.
- **Transcription** — Whisper runs locally, with timestamped segments.
- **Class materials** — attach PDFs, images, PowerPoint or Word files.
- **Everything persists** — lectures, transcripts, segments, uploaded audio and
  materials, chat history, and even which slide you were on are stored in
  SQLite and come back after a reload or restart.
- Click any transcript line to jump the audio to that moment.

The AI steps — mapping transcript to slides, filling gaps, and the chat
assistant — are still placeholders.

## Project layout

```
minuteman/
├── backend/                # FastAPI + SQLite service
│   ├── app/
│   │   ├── main.py         # app factory, CORS, optional static serving
│   │   ├── config.py       # all environment configuration
│   │   ├── db.py           # SQLAlchemy engine + session
│   │   ├── models.py       # tables (see Data model below)
│   │   ├── schemas.py      # request/response shapes (camelCase on the wire)
│   │   ├── security.py     # password hashing, login cookies, current user
│   │   ├── whisper_service.py  # lazy model loading + device selection
│   │   └── routers/
│   │       ├── auth.py       # register / login / logout / me
│   │       ├── lectures.py   # lecture CRUD + chat messages
│   │       ├── materials.py  # slide uploads + preview
│   │       ├── audio.py      # recording upload, transcription, playback
│   │       └── system.py     # health + LLM stubs
│   ├── run.py              # dev entrypoint
│   └── requirements.txt
├── frontend/               # Next.js 14 + React + TypeScript + Tailwind
│   ├── src/app/            # App Router
│   ├── src/components/     # AuthGate, AppShell, LectureRail, ChatPane, PreviewPane
│   ├── src/store/          # Zustand store (server-backed)
│   └── src/lib/            # API client, types, helpers
├── data/                   # SQLite file + uploaded media (gitignored)
└── README.md
```

## Data model

```
User ─┬─ AuthSession        (login tokens; only a SHA-256 is stored)
      └─ Lecture ─┬─ Material     (pdf / image / pptx / docx)
                  ├─ AudioTrack ── Segment   (one recording per lecture)
                  ├─ Explanation           (AI slide↔audio mapping; empty for now)
                  └─ Message               (chat history)
```

Deleting an account or a lecture cascades to everything beneath it, including
the files on disk. Every query is scoped to the signed-in user, so one account
can never read another's lectures.

The two folders are independent: the backend is a plain JSON API, and the
frontend is a Next.js app that talks to it. In development they run as two
processes on two ports. For a single-process setup, build a static export of
the frontend and the backend will serve it (see Run, below).

## Setup

You need Python 3.10+, Node 18+, and `ffmpeg` on your `PATH`.

```bash
# macOS
brew install ffmpeg

# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Frontend
cd frontend
cp .env.local.example .env.local     # points at http://127.0.0.1:8000
npm install
cd ..
```

The first transcription downloads the Whisper model weights
(`~150 MB` for `base`), so it can take a minute the first time.

## Run

Two terminals, from the repo root:

```bash
# 1) Backend — Whisper API on :8000
python backend/run.py

# 2) Frontend — Next dev server on :3000
cd frontend && npm run dev
```

Open <http://localhost:3000>.

The backend allows the Next dev server's origin by default, so this works with
no extra configuration.

### Single-process alternative

Build a static export and the backend serves the whole app on :8000 — one
port, no CORS:

```bash
cd frontend && npm run export && cd ..
python backend/run.py
```

Open <http://127.0.0.1:8000>.

## Configuration

All settings are environment variables, read in
[`backend/app/config.py`](backend/app/config.py).

| Variable | Default | What it does |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` to expose on your LAN. |
| `PORT` | `8000` | Port to listen on. |
| `RELOAD` | off | Set to `1` for uvicorn auto-reload during development. |
| `WHISPER_MODEL` | `base` | Default model: `tiny`, `base`, `small`, `medium`, `large`. Overridable per-request from the UI dropdown. |
| `WHISPER_DEVICE` | `auto` | `auto` (CUDA → MPS → CPU), or force `cuda` / `mps` / `cpu`. |
| `MAX_UPLOAD_BYTES` | 500 MB | Upload size cap, enforced while streaming. |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated allowed origins, preset for the Next dev server. Set to `""` to disable CORS. |
| `FRONTEND_DIR` | `./frontend/out` | Static export to serve. Missing (the default in dev) means API-only. |
| `DATA_DIR` | `./data` | SQLite file and uploaded media. |
| `DATABASE_URL` | `sqlite:///data/minuteman.db` | Swap for a Postgres URL to move off SQLite. |
| `SESSION_TTL_DAYS` | `30` | How long a login stays valid. |
| `MIN_PASSWORD_LENGTH` | `8` | Minimum password length at registration. |
| `COOKIE_SECURE` | off | Set to `1` to send the login cookie over HTTPS only. Turn on for any real deployment. |
| `REGISTRATION_OPEN` | on | Set to `0` to stop new accounts once yours exists. |
| `MAX_MATERIAL_BYTES` | 100 MB | Size cap for slide uploads. |

```bash
WHISPER_MODEL=small python backend/run.py
```

### Schema changes

Tables are created with SQLAlchemy's `create_all` on boot: missing tables are
added, but existing ones are never altered. Changing a column today means
deleting `data/minuteman.db` and starting over. If the schema keeps moving,
adding Alembic is the next step.

### Keeping your data

Everything lives in `data/` — the SQLite file plus `data/media/<user id>/`.
Back it up by copying that folder; it is gitignored so it never leaves the
machine by accident.

## API

All endpoints except `/health` and `/auth/*` require a signed-in session
cookie, and act only on the caller's own data.

| Endpoint | Method | Notes |
| --- | --- | --- |
| `/health` | GET | Loaded model, compute device, whether registration is open. |
| `/auth/register` · `/auth/login` | POST | JSON `{email, password}`; sets an httpOnly cookie. |
| `/auth/logout` · `/auth/me` | POST · GET | End the session · who am I. |
| `/lectures` | GET · POST | List for the rail · create. |
| `/lectures/{id}` | GET · PATCH · DELETE | Full contents · rename or save view state · delete. |
| `/lectures/{id}/audio` | PUT · DELETE | Upload + transcribe (multipart `file`, `model`, `language`) · remove. |
| `/lectures/{id}/audio/file` | GET | Stream the stored recording. |
| `/lectures/{id}/materials` | POST | Attach a slide deck or image. |
| `/materials/{id}/file` | GET · DELETE | Preview · remove. |
| `/lectures/{id}/messages` | POST | Append to the chat history. |
| `/cleanup` · `/minutes` · `/summary` | POST | Stubs — return 501. |

## What's next

The AI steps — mapping the transcript to slide pages, filling gaps the
recording skipped, and the study chat — are stubbed in
[`backend/app/routers/system.py`](backend/app/routers/system.py) and the
`requestMapping` / `fillGaps` actions in the store. To enable them we'll wire
one of:

- Anthropic Claude API
- OpenAI API
- A local model via Ollama

Just say the word and we'll plug it in.
