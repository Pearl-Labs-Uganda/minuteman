// ── Transcript ────────────────────────────────────────────────────────
export type TranscriptStatus = "idle" | "transcribing" | "done" | "error";

export interface Segment {
  start: number;
  end: number;
  text: string;
}

// ── Class materials ───────────────────────────────────────────────────
export type MaterialKind = "pdf" | "image" | "pptx" | "docx" | "other";
export type MaterialStatus = "ready" | "processing" | "error";

/**
 * A piece of class material attached to a lecture. `fileUrl` is a session-only
 * object URL. `pageCount` is known once the file is processed (null until then).
 * In-browser rendering: images and PDFs preview natively today; pptx/docx need a
 * conversion step (a later backend task) and show a type-aware placeholder.
 */
export interface Material {
  id: string;
  name: string;
  kind: MaterialKind;
  /**
   * Where to load the file from. For a freshly picked file this is a local
   * object URL (instant preview); once stored it is the backend's
   * /materials/{id}/file endpoint.
   */
  fileUrl: string;
  sizeBytes: number;
  pageCount: number | null;
  status: MaterialStatus;
}

// ── Audio ─────────────────────────────────────────────────────────────
export interface AudioTrack {
  id: string;
  name: string;
  /** Object URL while uploading, then the backend's audio endpoint. */
  audioUrl: string;
  durationSec: number | null;
  status: TranscriptStatus;
  segments: Segment[];
  text: string;
  language: string | null;
  /** Whisper model used, once transcribed. */
  model?: string | null;
  errorMsg?: string | null;
}

/**
 * AI mapping output (STUB until the mapping backend exists): links a material
 * page to the stretch of audio that explains it, plus an explanation the AI
 * derives from the transcript — and, where the audio skips something, a
 * gap-filled explanation the AI supplies.
 */
export interface SlideExplanation {
  materialId: string;
  page: number;
  startSec: number | null;
  endSec: number | null;
  explanation: string;
  aiFilled: boolean;
}

// ── Chat ──────────────────────────────────────────────────────────────
export type MessageType = "system" | "user" | "ai";

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  tone?: "plain" | "error" | "ai";
  loading?: boolean;
}

// ── Lecture (the top-level unit) ──────────────────────────────────────
export interface Lecture {
  id: string;
  title: string;
  materials: Material[];
  audio: AudioTrack | null;
  activeMaterialId: string | null;
  /** 1-based page within the active material. */
  activePage: number;
  /** AI-mapped explanations per page (empty until the AI step runs). */
  explanations: SlideExplanation[];
  messages: Message[];
  /**
   * Item count for a rail row whose contents have not been fetched yet.
   * Undefined once the lecture is hydrated, when the real arrays are counted.
   */
  itemCount?: number;
}

// ── Misc ──────────────────────────────────────────────────────────────
export interface Toast {
  id: string;
  msg: string;
  kind: "info" | "success" | "error";
}

// ── Account ───────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

// ── Server payloads ───────────────────────────────────────────────────

/** Row in the lecture rail: counts only, no transcript bodies. */
export interface LectureSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  materialCount: number;
  hasAudio: boolean;
}

/** A fully hydrated lecture, as returned by GET /lectures/{id}. */
export interface LectureDetail {
  id: string;
  title: string;
  activeMaterialId: string | null;
  activePage: number;
  createdAt: string;
  updatedAt: string;
  materials: Array<Omit<Material, "fileUrl">>;
  audio: (Omit<AudioTrack, "audioUrl"> & { sizeBytes: number | null }) | null;
  explanations: SlideExplanation[];
  messages: Message[];
}
