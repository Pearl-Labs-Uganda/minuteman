# Minuteman — Study Partner (frontend)

Next.js (App Router) + React + TypeScript + Tailwind. The frontend for turning a
lecture into study material.

## Layout

A two-pane study workspace, with a slim lecture navigator:

```
┌───────────┬───────────────────────┬───────────────────────┐
│  Lectures │  Chat / Explanations  │   Materials preview    │
│  (rail)   │  (left, primary)      │   (right, primary)     │
│           │                       │                        │
│  audio +  │  AI explanations per  │  PDF / image render;   │
│  slides   │  slide, replay audio, │  PowerPoint / Word     │
│  per      │  ask + gap-fill       │  placeholder (convert  │
│  lecture  │                       │  step comes next)      │
└───────────┴───────────────────────┴───────────────────────┘
```

A **lecture** holds one audio recording (optional) and any number of materials
(PDF, images, PowerPoint, Word). The right pane previews the active material;
the left pane is where the transcript — intelligently mapped to slide pages by
AI — becomes explanations you can read, replay, and ask about.

## Status: layout foundation

This step is the structure and data model. Working now: lectures, adding audio +
materials, switching/among them, native audio replay, in-browser preview of PDFs
and images, chat shell, responsive panels.

Deliberate stubs (the AI step): transcript↔slide mapping ("Map audio to slides"),
gap-filling ("Fill gaps"), the per-slide explanation card, and audio-synced
paging. PowerPoint/Word previews show a placeholder until the conversion pipeline
lands.

## Architecture

```
src/
├── app/                    # layout (fonts via runtime <link>), globals, page
├── components/
│   ├── AppShell.tsx        # rail | chat | preview layout, drag-drop, responsive
│   ├── TopNav.tsx
│   ├── LectureRail.tsx     # lectures, audio, materials + uploads
│   ├── ChatPane.tsx        # explanations, replay, chat, AI action stubs
│   ├── PreviewPane.tsx     # material tabs + viewer (pdf/image/placeholder)
│   ├── Toasts.tsx
│   └── icons.tsx
├── store/useStore.ts       # Zustand: lectures, materials, audio, chat, UI
└── lib/
    ├── types.ts            # Lecture, Material, AudioTrack, SlideExplanation…
    ├── materials.ts        # file-kind detection + labels
    ├── api.ts              # FastAPI client (NEXT_PUBLIC_API_BASE)
    ├── format.ts           # time/bytes/word helpers
    └── useIsMobile.ts
```

All lecture state lives in `src/store/useStore.ts`. The AI features attach to the
existing shapes: `SlideExplanation` (in `types.ts`) is where mapping + gap-fill
output will land, and `requestMapping()` / `fillGaps()` in the store are the
call sites to wire to the backend.

## Run

```bash
CORS_ORIGINS=http://localhost:3000 python backend/run.py   # terminal 1
cd frontend && npm run dev                                  # terminal 2
```

Open http://localhost:3000. `NEXT_PUBLIC_API_BASE` (in `.env.local`) points at
the backend.

## Next steps

- Transcribe the lecture audio (backend already has `/transcribe`) and store
  segments on the lecture's `audio`.
- AI mapping: segments → slide pages (+ start/end times) → `SlideExplanation[]`.
- Gap-filling and slide-aware chat behind `requestMapping` / `fillGaps` / chat.
- PDF paging via pdf.js (replace the native iframe) so paging can sync to audio.
- PowerPoint/Word → PDF/image conversion for preview.
