import type {
  AudioTrack,
  LectureDetail,
  LectureSummary,
  Material,
  Message,
  User,
} from "./types";

/**
 * Base URL of the Minuteman FastAPI backend.
 *
 * Set NEXT_PUBLIC_API_BASE in .env.local. Empty means "same origin as this
 * page" (correct when FastAPI serves a static export). The trailing slash is
 * trimmed so `apiUrl("/lectures")` never doubles up.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(
  /\/$/,
  "",
);

export const apiUrl = (path: string): string => `${API_BASE}${path}`;

/** Thrown for any non-2xx response, carrying the backend's message. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** True when the failure was "not signed in", so callers can show the gate. */
export const isUnauthorized = (err: unknown): boolean =>
  err instanceof ApiError && err.status === 401;

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail ?? body?.error;
    if (typeof detail === "string") return detail;
    // FastAPI validation errors arrive as a list of {loc, msg}.
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  } catch {
    /* fall through to the status text */
  }
  return res.statusText || `Request failed (${res.status})`;
}

/**
 * fetch wrapper. Always sends the login cookie — the Next dev server and the
 * API are different origins, so credentials must be explicit.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), { credentials: "include", ...init });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// ── Auth ──────────────────────────────────────────────────────────────

export const register = (
  email: string,
  password: string,
  displayName?: string,
) =>
  request<User>(
    "/auth/register",
    jsonInit("POST", { email, password, displayName: displayName || null }),
  );

export const login = (email: string, password: string) =>
  request<User>("/auth/login", jsonInit("POST", { email, password }));

export const logout = () => request<void>("/auth/logout", { method: "POST" });

export const me = () => request<User>("/auth/me");

// ── Lectures ──────────────────────────────────────────────────────────

export const listLectures = () => request<LectureSummary[]>("/lectures");

export const getLecture = (id: string) =>
  request<LectureDetail>(`/lectures/${id}`);

export const createLecture = (title?: string) =>
  request<LectureDetail>("/lectures", jsonInit("POST", { title }));

export const updateLecture = (
  id: string,
  patch: { title?: string; activeMaterialId?: string | null; activePage?: number },
) => request<LectureSummary>(`/lectures/${id}`, jsonInit("PATCH", patch));

export const deleteLecture = (id: string) =>
  request<void>(`/lectures/${id}`, { method: "DELETE" });

export const addMessage = (
  lectureId: string,
  msg: { type: Message["type"]; content: string; tone?: string | null },
) => request<Message>(`/lectures/${lectureId}/messages`, jsonInit("POST", msg));

// ── Materials ─────────────────────────────────────────────────────────

export const uploadMaterial = (lectureId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<Material>(`/lectures/${lectureId}/materials`, {
    method: "POST",
    body: form,
  });
};

export const deleteMaterial = (id: string) =>
  request<void>(`/materials/${id}`, { method: "DELETE" });

/** Direct URL for previewing a stored material (cookie-authenticated). */
export const materialFileUrl = (id: string) =>
  apiUrl(`/materials/${id}/file`);

// ── Audio ─────────────────────────────────────────────────────────────

export interface UploadAudioArgs {
  lectureId: string;
  file: File;
  model?: string;
  language?: string;
}

/** Upload the recording and transcribe it. Replaces any existing audio. */
export const uploadAudio = ({
  lectureId,
  file,
  model = "base",
  language,
}: UploadAudioArgs) => {
  const form = new FormData();
  form.append("file", file);
  form.append("model", model);
  if (language) form.append("language", language);
  return request<AudioTrack>(`/lectures/${lectureId}/audio`, {
    method: "PUT",
    body: form,
  });
};

export const deleteAudio = (lectureId: string) =>
  request<void>(`/lectures/${lectureId}/audio`, { method: "DELETE" });

/** Direct URL for playing back stored audio (cookie-authenticated). */
export const audioFileUrl = (lectureId: string) =>
  apiUrl(`/lectures/${lectureId}/audio/file`);

// ── System ────────────────────────────────────────────────────────────

export interface HealthResponse {
  ok: boolean;
  model: string;
  device: string;
  device_config: string;
  registration_open: boolean;
}

export const health = () => request<HealthResponse>("/health");
