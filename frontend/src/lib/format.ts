/** Short unique id, matches the original app's `uid()`. */
export const uid = (): string => Math.random().toString(36).slice(2, 9);

/** Seconds → `M:SS` (or `H:MM:SS` past an hour). */
export function fmtTime(t: number | null | undefined): string {
  if (t == null || Number.isNaN(t)) return "0:00";
  const total = Math.floor(t);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Seconds → SRT timestamp `HH:MM:SS,mmm`. */
export function fmtSrtTime(t: number): string {
  const ms = Math.floor((t % 1) * 1000);
  const total = Math.floor(t);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** Bytes → human-readable size. */
export function fmtBytes(b: number): string {
  if (!b) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Word count of a string (whitespace-delimited, empties dropped). */
export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

const AUDIO_EXT = /\.(m4a|wav|mp3|mp4|webm|ogg|flac)$/i;

/** Whether a dropped/selected File looks like audio or video we can transcribe. */
export function isAudioFile(f: File): boolean {
  return (
    f.type.startsWith("audio/") ||
    f.type.startsWith("video/") ||
    AUDIO_EXT.test(f.name)
  );
}
