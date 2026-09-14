import type { MaterialKind } from "./types";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const AUDIO_EXT = /\.(m4a|wav|mp3|mp4|webm|ogg|flac|aac|opus|aiff?)$/i;

/** Classify a file into a material kind by extension / MIME type. */
export function materialKind(file: File): MaterialKind {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (IMAGE_EXT.test(name) || type.startsWith("image/")) return "image";
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "pptx";
  if (name.endsWith(".docx") || name.endsWith(".doc")) return "docx";
  return "other";
}

/** True when a file looks like audio/video we can (later) transcribe. */
export function isAudioFile(file: File): boolean {
  return (
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/") ||
    AUDIO_EXT.test(file.name)
  );
}

/** Human labels for each material kind. */
export const MATERIAL_LABEL: Record<MaterialKind, string> = {
  pdf: "PDF",
  image: "Image",
  pptx: "PowerPoint",
  docx: "Word",
  other: "File",
};

/** Whether a material kind previews in-browser today (vs needs conversion). */
export function previewsNatively(kind: MaterialKind): boolean {
  return kind === "pdf" || kind === "image";
}

/** Accept attribute for the material file input. */
export const MATERIAL_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.avif,.pptx,.ppt,.docx,.doc,application/pdf,image/*";
