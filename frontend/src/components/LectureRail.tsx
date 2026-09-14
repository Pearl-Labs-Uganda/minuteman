"use client";

import { useRef } from "react";
import {
  LayersIcon,
  MATERIAL_ICONS,
  MicIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from "./icons";
import { fmtBytes } from "@/lib/format";
import { MATERIAL_ACCEPT, isAudioFile, materialKind } from "@/lib/materials";
import { useStore, useActiveLecture } from "@/store/useStore";

export default function LectureRail() {
  const audioInput = useRef<HTMLInputElement>(null);
  const materialInput = useRef<HTMLInputElement>(null);

  const lectures = useStore((s) => s.lectures);
  const activeLectureId = useStore((s) => s.activeLectureId);
  const createLecture = useStore((s) => s.createLecture);
  const switchLecture = useStore((s) => s.switchLecture);
  const setAudio = useStore((s) => s.setAudio);
  const removeAudio = useStore((s) => s.removeAudio);
  const addMaterial = useStore((s) => s.addMaterial);
  const removeMaterial = useStore((s) => s.removeMaterial);
  const setActiveMaterial = useStore((s) => s.setActiveMaterial);
  const toast = useStore((s) => s.toast);

  const lecture = useActiveLecture();
  const materials = lecture?.materials ?? [];

  const onMaterials = (list: FileList | null) => {
    if (!list) return;
    Array.from(list).forEach((f) => {
      // A dropped audio file becomes the lecture audio; everything else is material.
      if (isAudioFile(f) && materialKind(f) === "other") setAudio(f);
      else addMaterial(f);
    });
    if (materialInput.current) materialInput.current.value = "";
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Lectures list */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-pl-edge">
        <div className="flex items-center justify-between mb-2">
          <span className="font-label text-[10px] uppercase tracking-widest text-pl-faint">
            Lectures
          </span>
          <button
            onClick={() => createLecture("Untitled lecture")}
            className="font-label text-xs text-pl-sky hover:text-pl-sky-light transition-colors px-1.5 py-0.5 rounded hover:bg-pl-cont"
          >
            + New
          </button>
        </div>
        <div className="space-y-0.5 max-h-40 overflow-y-auto scrollbar-none">
          {lectures.map((l) => {
            const isActive = l.id === activeLectureId;
            return (
              <button
                key={l.id}
                onClick={() => switchLecture(l.id)}
                className={`w-full text-left rounded-lg px-2.5 py-1.5 flex items-center gap-2 border transition-colors ${
                  isActive
                    ? "bg-pl-cont border-pl-sky/25"
                    : "border-transparent hover:bg-pl-edge/60"
                }`}
              >
                <LayersIcon className="w-3.5 h-3.5 text-pl-muted shrink-0" />
                <span className="font-label text-xs text-pl-text truncate flex-1">
                  {l.title}
                </span>
                <span className="font-label text-[10px] text-pl-faint shrink-0">
                  {l.itemCount ?? l.materials.length + (l.audio ? 1 : 0)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Audio */}
      <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-pl-edge">
        <span className="font-label text-[10px] uppercase tracking-widest text-pl-faint block mb-2">
          Audio
        </span>
        <input
          ref={audioInput}
          type="file"
          className="hidden"
          accept="audio/*,video/*,.m4a,.wav,.mp3,.mp4,.webm,.ogg,.flac"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setAudio(f);
            if (audioInput.current) audioInput.current.value = "";
          }}
        />
        {lecture?.audio ? (
          <div className="group rounded-lg px-2 py-1.5 flex items-center gap-2 bg-pl-cont/60 border border-pl-edge">
            <MicIcon className="w-3.5 h-3.5 text-pl-sky shrink-0" />
            <span className="font-label text-xs text-pl-text truncate flex-1">
              {lecture.audio.name}
            </span>
            <button
              onClick={removeAudio}
              title="Remove audio"
              className="text-pl-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
            >
              <TrashIcon className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => audioInput.current?.click()}
            className="w-full inline-flex items-center justify-center gap-1.5 border border-dashed border-pl-edge hover:border-pl-sky/50 text-pl-muted hover:text-pl-text font-label text-xs py-1.5 rounded-lg transition-colors"
          >
            <MicIcon className="w-3.5 h-3.5" />
            Add recording
          </button>
        )}
      </div>

      {/* Materials */}
      <div className="flex-1 min-h-0 flex flex-col px-3 pt-2.5">
        <span className="font-label text-[10px] uppercase tracking-widest text-pl-faint block mb-2 shrink-0">
          Materials
        </span>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none space-y-0.5">
          {materials.map((m) => {
            const Icon = MATERIAL_ICONS[m.kind];
            const isActive = m.id === lecture?.activeMaterialId;
            return (
              <div
                key={m.id}
                onClick={() => setActiveMaterial(m.id)}
                className={`group rounded-lg px-2 py-1.5 flex items-start gap-2 cursor-pointer border transition-colors ${
                  isActive
                    ? "bg-pl-cont border-pl-sky/25"
                    : "border-transparent hover:bg-pl-edge/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-pl-sky shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-label text-xs text-pl-text truncate leading-tight">
                    {m.name}
                  </div>
                  <div className="font-label text-[10px] text-pl-faint">
                    {fmtBytes(m.sizeBytes)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMaterial(m.id);
                  }}
                  title="Remove"
                  className="text-pl-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5"
                >
                  <TrashIcon className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {materials.length === 0 && (
            <p className="font-label text-xs text-pl-faint py-2 text-center leading-snug">
              No slides yet
            </p>
          )}
        </div>
      </div>

      {/* Add materials */}
      <div className="shrink-0 p-3">
        <input
          ref={materialInput}
          type="file"
          className="hidden"
          accept={MATERIAL_ACCEPT}
          multiple
          onChange={(e) => onMaterials(e.target.files)}
        />
        <button
          onClick={() => materialInput.current?.click()}
          className="w-full inline-flex items-center justify-center gap-1.5 bg-pl-orange hover:bg-pl-orange-dark text-white font-label font-semibold text-sm py-2 rounded-full transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5 shrink-0" />
          Add materials
        </button>
        <p className="font-label text-[10px] text-pl-faint text-center mt-1.5 leading-snug">
          PDF · images · PowerPoint · Word
        </p>
      </div>
    </div>
  );
}
