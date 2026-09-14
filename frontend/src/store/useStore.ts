"use client";

import { create } from "zustand";
import * as api from "@/lib/api";
import { uid } from "@/lib/format";
import { isAudioFile, materialKind } from "@/lib/materials";
import type {
  AudioTrack,
  Lecture,
  LectureDetail,
  LectureSummary,
  Material,
  Message,
  Toast,
  User,
} from "@/lib/types";

interface StoreState {
  // ── Account ───────────────────────────────────────────────────────
  user: User | null;
  /** False until the first /auth/me has resolved, so we don't flash the gate. */
  authReady: boolean;

  // ── Data ──────────────────────────────────────────────────────────
  lectures: Lecture[];
  activeLectureId: string | null;
  /** True while the active lecture's contents are being fetched. */
  hydrating: boolean;
  /** Set while a recording is uploading/transcribing. */
  transcribing: boolean;
  model: string;
  language: string;
  toasts: Toast[];

  // ── UI ────────────────────────────────────────────────────────────
  railOpen: boolean;
  previewOpen: boolean;

  // ── Lifecycle / auth ──────────────────────────────────────────────
  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;

  // ── Lectures ──────────────────────────────────────────────────────
  createLecture: (title?: string) => Promise<void>;
  switchLecture: (id: string) => Promise<void>;
  renameLecture: (title: string) => void;
  deleteLecture: (id: string) => Promise<void>;

  // ── Materials ─────────────────────────────────────────────────────
  addMaterial: (file: File) => Promise<void>;
  removeMaterial: (materialId: string) => Promise<void>;
  setActiveMaterial: (materialId: string) => void;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;

  // ── Audio ─────────────────────────────────────────────────────────
  setAudio: (file: File) => Promise<void>;
  removeAudio: () => Promise<void>;
  setModel: (m: string) => void;
  setLanguage: (l: string) => void;

  // ── Chat + AI (stubs) ─────────────────────────────────────────────
  addMessage: (msg: Omit<Message, "id">) => string;
  sendUserMessage: (text: string) => void;
  requestMapping: () => void;
  fillGaps: () => void;

  // ── Toasts ────────────────────────────────────────────────────────
  toast: (msg: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;

  // ── UI toggles ────────────────────────────────────────────────────
  setRailOpen: (open: boolean) => void;
  setPreviewOpen: (open: boolean) => void;
  toggleRail: () => void;
  togglePreview: () => void;

  // ── internal ──────────────────────────────────────────────────────
  _updateActive: (patch: (l: Lecture) => Lecture) => void;
  _refreshRail: () => Promise<void>;
}

const AI_SOON =
  "AI transcript↔slide mapping and gap-filling are coming in the next step — this build is the layout foundation.";

/** An un-hydrated rail row: real title and counts, contents loaded on demand. */
function shellFromSummary(s: LectureSummary): Lecture {
  return {
    id: s.id,
    title: s.title,
    materials: [],
    audio: null,
    activeMaterialId: null,
    activePage: 1,
    explanations: [],
    messages: [],
    itemCount: s.materialCount + (s.hasAudio ? 1 : 0),
  };
}

/** Turn a server payload into the shape the UI renders. */
function lectureFromDetail(d: LectureDetail): Lecture {
  return {
    id: d.id,
    title: d.title,
    activeMaterialId: d.activeMaterialId,
    activePage: d.activePage,
    explanations: d.explanations ?? [],
    messages: d.messages ?? [],
    materials: (d.materials ?? []).map(
      (m): Material => ({ ...m, fileUrl: api.materialFileUrl(m.id) }),
    ),
    audio: d.audio
      ? ({ ...d.audio, audioUrl: api.audioFileUrl(d.id) } as AudioTrack)
      : null,
    itemCount: undefined,
  };
}

/**
 * Page and active-material changes fire on every arrow press, so the PATCH
 * that records them is coalesced rather than sent per keystroke.
 */
const viewSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
function saveViewSoon(
  lectureId: string,
  patch: { activeMaterialId?: string | null; activePage?: number; title?: string },
  delay = 500,
) {
  const existing = viewSaveTimers.get(lectureId);
  if (existing) clearTimeout(existing);
  viewSaveTimers.set(
    lectureId,
    setTimeout(() => {
      viewSaveTimers.delete(lectureId);
      void api.updateLecture(lectureId, patch).catch(() => {
        /* view state is a convenience; a failed save is not worth a toast */
      });
    }, delay),
  );
}

export const useStore = create<StoreState>((set, get) => ({
  user: null,
  authReady: false,
  lectures: [],
  activeLectureId: null,
  hydrating: false,
  transcribing: false,
  model: "base",
  language: "",
  toasts: [],
  railOpen: true,
  previewOpen: true,

  // ── Lifecycle / auth ──────────────────────────────────────────────

  bootstrap: async () => {
    try {
      const user = await api.me();
      set({ user, authReady: true });
      await get()._refreshRail();
    } catch {
      // Not signed in (or the API is unreachable) — show the gate.
      set({ user: null, authReady: true, lectures: [], activeLectureId: null });
    }
  },

  signIn: async (email, password) => {
    const user = await api.login(email, password);
    set({ user });
    await get()._refreshRail();
  },

  signUp: async (email, password, displayName) => {
    const user = await api.register(email, password, displayName);
    set({ user });
    await get()._refreshRail();
  },

  signOut: async () => {
    try {
      await api.logout();
    } finally {
      set({ user: null, lectures: [], activeLectureId: null });
    }
  },

  _refreshRail: async () => {
    const summaries = await api.listLectures();

    if (summaries.length === 0) {
      set({ lectures: [], activeLectureId: null });
      await get().createLecture("Untitled lecture");
      return;
    }

    const active = get().activeLectureId;
    const hydrated = get().lectures.find((l) => l.id === active);

    set({
      lectures: summaries.map((s) =>
        s.id === active && hydrated ? hydrated : shellFromSummary(s),
      ),
    });

    // Open the most recent lecture when nothing is selected.
    if (!active || !summaries.some((s) => s.id === active)) {
      await get().switchLecture(summaries[0].id);
    }
  },

  // ── Lectures ──────────────────────────────────────────────────────

  createLecture: async (title) => {
    try {
      const detail = await api.createLecture(title || "Untitled lecture");
      const lecture = lectureFromDetail(detail);
      set((s) => ({
        lectures: [lecture, ...s.lectures],
        activeLectureId: lecture.id,
      }));
    } catch (err) {
      get().toast(errText(err, "Could not create the lecture"), "error");
    }
  },

  switchLecture: async (id) => {
    set({ activeLectureId: id, hydrating: true });
    try {
      const detail = await api.getLecture(id);
      const lecture = lectureFromDetail(detail);
      set((s) => ({
        lectures: s.lectures.map((l) => (l.id === id ? lecture : l)),
        hydrating: false,
      }));
    } catch (err) {
      set({ hydrating: false });
      get().toast(errText(err, "Could not open that lecture"), "error");
    }
  },

  renameLecture: (title) => {
    const id = get().activeLectureId;
    if (!id) return;
    const clean = title.trim() || "Untitled lecture";
    get()._updateActive((l) => ({ ...l, title: clean }));
    saveViewSoon(id, { title: clean }, 600);
  },

  deleteLecture: async (id) => {
    try {
      await api.deleteLecture(id);
      set((s) => ({
        lectures: s.lectures.filter((l) => l.id !== id),
        activeLectureId: s.activeLectureId === id ? null : s.activeLectureId,
      }));
      await get()._refreshRail();
      get().toast("Lecture deleted", "success");
    } catch (err) {
      get().toast(errText(err, "Could not delete the lecture"), "error");
    }
  },

  // ── Materials ─────────────────────────────────────────────────────

  addMaterial: async (file) => {
    const lectureId = get().activeLectureId;
    if (!lectureId) return;

    // Optimistic row so the file appears instantly, with a local preview URL.
    const tempId = uid();
    const localUrl = URL.createObjectURL(file);
    const kind = materialKind(file);
    get()._updateActive((l) => ({
      ...l,
      materials: [
        ...l.materials,
        {
          id: tempId,
          name: file.name,
          kind,
          fileUrl: localUrl,
          sizeBytes: file.size,
          pageCount: kind === "image" ? 1 : null,
          status: "processing",
        },
      ],
      activeMaterialId: l.activeMaterialId ?? tempId,
    }));

    try {
      const saved = await api.uploadMaterial(lectureId, file);
      get()._updateActive((l) => ({
        ...l,
        materials: l.materials.map((m) =>
          m.id === tempId
            ? { ...saved, fileUrl: localUrl, status: "ready" }
            : m,
        ),
        activeMaterialId:
          l.activeMaterialId === tempId ? saved.id : l.activeMaterialId,
      }));
      get().addMessage({ type: "system", content: `Added material: ${file.name}` });
    } catch (err) {
      URL.revokeObjectURL(localUrl);
      get()._updateActive((l) => ({
        ...l,
        materials: l.materials.filter((m) => m.id !== tempId),
        activeMaterialId:
          l.activeMaterialId === tempId ? null : l.activeMaterialId,
      }));
      get().toast(errText(err, `Could not add ${file.name}`), "error");
    }
  },

  removeMaterial: async (materialId) => {
    const previous = get().lectures.find((l) => l.id === get().activeLectureId);
    const material = previous?.materials.find((m) => m.id === materialId);

    get()._updateActive((l) => {
      const materials = l.materials.filter((m) => m.id !== materialId);
      return {
        ...l,
        materials,
        activeMaterialId:
          l.activeMaterialId === materialId
            ? (materials[0]?.id ?? null)
            : l.activeMaterialId,
        activePage: l.activeMaterialId === materialId ? 1 : l.activePage,
      };
    });

    try {
      await api.deleteMaterial(materialId);
      if (material?.fileUrl.startsWith("blob:")) {
        URL.revokeObjectURL(material.fileUrl);
      }
    } catch (err) {
      get().toast(errText(err, "Could not remove that material"), "error");
      if (previous) {
        set((s) => ({
          lectures: s.lectures.map((l) => (l.id === previous.id ? previous : l)),
        }));
      }
    }
  },

  setActiveMaterial: (materialId) => {
    const id = get().activeLectureId;
    get()._updateActive((l) => ({
      ...l,
      activeMaterialId: materialId,
      activePage: 1,
    }));
    if (id) saveViewSoon(id, { activeMaterialId: materialId, activePage: 1 });
  },

  setPage: (page) => {
    const id = get().activeLectureId;
    let saved = 1;
    get()._updateActive((l) => {
      const active = l.materials.find((m) => m.id === l.activeMaterialId);
      const max = active?.pageCount ?? Infinity;
      saved = Math.max(1, Math.min(page, max));
      return { ...l, activePage: saved };
    });
    if (id) saveViewSoon(id, { activePage: saved });
  },

  nextPage: () => {
    const l = get().lectures.find((x) => x.id === get().activeLectureId);
    get().setPage((l?.activePage ?? 1) + 1);
  },

  prevPage: () => {
    const l = get().lectures.find((x) => x.id === get().activeLectureId);
    get().setPage((l?.activePage ?? 1) - 1);
  },

  // ── Audio ─────────────────────────────────────────────────────────

  setAudio: async (file) => {
    const lectureId = get().activeLectureId;
    if (!lectureId) return;

    if (!isAudioFile(file)) {
      get().toast(`${file.name} is not an audio file`, "error");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    const tempId = uid();
    get()._updateActive((l) => {
      if (l.audio?.audioUrl.startsWith("blob:")) {
        URL.revokeObjectURL(l.audio.audioUrl);
      }
      return {
        ...l,
        audio: {
          id: tempId,
          name: file.name,
          audioUrl: localUrl,
          durationSec: null,
          status: "transcribing",
          segments: [],
          text: "",
          language: null,
        },
      };
    });
    set({ transcribing: true });

    const statusId = get().addMessage({
      type: "system",
      loading: true,
      content: `Transcribing ${file.name} with ${get().model}…`,
    });

    try {
      const saved = await api.uploadAudio({
        lectureId,
        file,
        model: get().model,
        language: get().language.trim() || undefined,
      });

      get()._updateActive((l) => ({
        ...l,
        messages: l.messages.filter((m) => m.id !== statusId),
        audio: { ...saved, audioUrl: api.audioFileUrl(lectureId) },
      }));
      URL.revokeObjectURL(localUrl);
      get().addMessage({
        type: "system",
        content: `Transcribed ${file.name} — ${saved.segments.length} segments.`,
      });
      get().toast(`Transcribed ${file.name}`, "success");
    } catch (err) {
      const message = errText(err, "Transcription failed");
      get()._updateActive((l) => ({
        ...l,
        messages: l.messages.filter((m) => m.id !== statusId),
        audio: l.audio
          ? { ...l.audio, status: "error", errorMsg: message }
          : null,
      }));
      get().addMessage({ type: "system", tone: "error", content: message });
      get().toast(message, "error");
    } finally {
      set({ transcribing: false });
    }
  },

  removeAudio: async () => {
    const lectureId = get().activeLectureId;
    if (!lectureId) return;
    const previous = get().lectures.find((l) => l.id === lectureId)?.audio ?? null;

    get()._updateActive((l) => {
      if (l.audio?.audioUrl.startsWith("blob:")) {
        URL.revokeObjectURL(l.audio.audioUrl);
      }
      return { ...l, audio: null };
    });

    try {
      await api.deleteAudio(lectureId);
    } catch (err) {
      get().toast(errText(err, "Could not remove the recording"), "error");
      get()._updateActive((l) => ({ ...l, audio: previous }));
    }
  },

  setModel: (m) => set({ model: m }),
  setLanguage: (l) => set({ language: l }),

  // ── Chat ──────────────────────────────────────────────────────────

  addMessage: (msg) => {
    const id = uid();
    const lectureId = get().activeLectureId;
    get()._updateActive((l) => ({
      ...l,
      messages: [...l.messages, { id, ...msg }],
    }));

    // Transient spinners are UI-only; everything else is worth keeping.
    if (lectureId && !msg.loading) {
      void api
        .addMessage(lectureId, {
          type: msg.type,
          content: msg.content,
          tone: msg.tone ?? null,
        })
        .catch(() => {
          /* the message is already on screen; losing the copy is not fatal */
        });
    }
    return id;
  },

  sendUserMessage: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    get().addMessage({ type: "user", content: trimmed });
    setTimeout(() => {
      get().addMessage({ type: "ai", tone: "ai", content: AI_SOON });
    }, 400);
  },

  requestMapping: () => get().toast(AI_SOON, "info"),
  fillGaps: () => get().toast(AI_SOON, "info"),

  // ── Toasts ────────────────────────────────────────────────────────

  toast: (msg, kind = "info") => {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { id, msg, kind }] }));
    setTimeout(() => get().dismissToast(id), 3600);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ── UI toggles ────────────────────────────────────────────────────

  setRailOpen: (open) => set({ railOpen: open }),
  setPreviewOpen: (open) => set({ previewOpen: open }),
  toggleRail: () => set((s) => ({ railOpen: !s.railOpen })),
  togglePreview: () => set((s) => ({ previewOpen: !s.previewOpen })),

  _updateActive: (patch) =>
    set((s) => ({
      lectures: s.lectures.map((l) =>
        l.id === s.activeLectureId ? patch(l) : l,
      ),
    })),
}));

/** Readable message from an ApiError or anything else that was thrown. */
function errText(err: unknown, fallback: string): string {
  if (err instanceof api.ApiError) return err.message;
  if (err instanceof Error && err.message) return `${fallback}: ${err.message}`;
  return fallback;
}

/** Selector hook for the active lecture. */
export function useActiveLecture(): Lecture | null {
  return useStore(
    (s) => s.lectures.find((l) => l.id === s.activeLectureId) || null,
  );
}
