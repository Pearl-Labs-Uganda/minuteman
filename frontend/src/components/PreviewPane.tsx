"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LayersIcon,
  MATERIAL_ICONS,
  MicIcon,
  PlayIcon,
  SparklesIcon,
  UploadIcon,
} from "./icons";
import { MATERIAL_LABEL, previewsNatively } from "@/lib/materials";
import { useStore, useActiveLecture } from "@/store/useStore";
import type { Material } from "@/lib/types";

type AssistantMode = "page" | "selection" | "summary";

interface AssistantReply {
  title: string;
  summary: string;
  bullets: string[];
}

function buildAssistantReply({
  mode,
  materialName,
  pageNumber,
  selection,
  lectureTitle,
  transcriptSnippet,
}: {
  mode: AssistantMode;
  materialName: string;
  pageNumber: number;
  selection: string;
  lectureTitle: string;
  transcriptSnippet: string;
}): AssistantReply {
  const cleanSelection = selection.trim();
  const transcriptContext = transcriptSnippet.trim();

  if (mode === "selection" && cleanSelection) {
    const selectionPreview =
      cleanSelection.length > 210
        ? `${cleanSelection.slice(0, 210).trim()}…`
        : cleanSelection;

    return {
      title: "Selected concept",
      summary: `You picked: “${selectionPreview}”. In simpler terms, this means the main idea is to connect the concept with what matters in practice, not just memorize the wording.`,
      bullets: [
        "Focus on the central principle behind the statement.",
        "Map it to an example, case, or real-world use.",
        "Check the lecture transcript for the same idea stated aloud.",
      ],
    };
  }

  if (mode === "summary") {
    return {
      title: "Lecture summary",
      summary: `${lectureTitle} is centered on ${materialName}. The key purpose is to convert what is on the page into a practical idea you can explain on your own.`,
      bullets: [
        transcriptContext
          ? `Lecture audio points toward: ${transcriptContext.slice(0, 120)}${transcriptContext.length > 120 ? "…" : ""}`
          : "No transcript is available yet, so the summary is based on the current material.",
        `Page ${pageNumber} is a good checkpoint for review and recall.`,
        "Try explaining it out loud before looking at the next page.",
      ],
    };
  }

  return {
    title: "Page explanation",
    summary: `On page ${pageNumber} of ${materialName}, the main idea is to understand the core principle being introduced before moving on to the examples. This is usually the part to review slowly and explain in your own words.`,
    bullets: [
      "Identify the big idea before the details.",
      transcriptContext
        ? `Lecture context: ${transcriptContext.slice(0, 140)}${transcriptContext.length > 140 ? "…" : ""}`
        : "Lecture transcript is not available yet, so this is based on the page itself.",
      "Turn the idea into a one-sentence explanation you could teach to someone else.",
    ],
  };
}

function Viewer({ material }: { material: Material }) {
  if (material.kind === "image") {
    return (
      <img
        src={material.fileUrl}
        alt={material.name}
        className="max-w-full max-h-full object-contain rounded-xl shadow-lg border border-pl-edge bg-white"
      />
    );
  }

  if (material.kind === "pdf") {
    return (
      <iframe
        src={material.fileUrl}
        title={material.name}
        className="w-full h-full rounded-xl border border-pl-edge bg-white"
      />
    );
  }

  const Icon = MATERIAL_ICONS[material.kind];
  return (
    <div className="text-center max-w-sm px-6">
      <div className="w-14 h-14 rounded-xl bg-pl-cont border border-pl-edge mx-auto mb-4 flex items-center justify-center">
        <Icon className="w-6 h-6 text-pl-sky" />
      </div>
      <div className="font-headline font-semibold text-pl-text mb-1">
        {MATERIAL_LABEL[material.kind]} preview coming next
      </div>
      <div className="font-body text-sm text-pl-muted leading-relaxed">
        {material.name}
      </div>
      <div className="font-label text-xs text-pl-faint mt-3 leading-relaxed">
        In-browser {MATERIAL_LABEL[material.kind]} rendering needs a conversion
        step — that lands with the materials pipeline. PDFs and images preview
        here today.
      </div>
    </div>
  );
}

export default function PreviewPane() {
  const lecture = useActiveLecture();
  const setActiveMaterial = useStore((s) => s.setActiveMaterial);
  const [selectedText, setSelectedText] = useState("");
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("page");
  const [assistantReply, setAssistantReply] = useState<AssistantReply>({
    title: "Study assistant",
    summary: "Open a PDF and click explain to start learning from the current material.",
    bullets: [
      "Select a phrase to explain it in simpler language.",
      "Use audio to reinforce the concept while reading.",
      "Review the key idea before moving to the next page.",
    ],
  });
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const materials = lecture?.materials ?? [];
  const active = materials.find((m) => m.id === lecture?.activeMaterialId);
  const transcriptText = lecture?.audio?.text ?? "";
  const pageNumber = lecture?.activePage ?? 1;

  useEffect(() => {
    const onSelectionChange = () => {
      const next = window.getSelection()?.toString().trim() ?? "";
      if (next) setSelectedText(next);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const guideText = useMemo(() => {
    if (!active) return "No material selected";
    if (selectedText) return `Selected: ${selectedText.slice(0, 70)}${selectedText.length > 70 ? "…" : ""}`;
    return `Page ${pageNumber}`;
  }, [active, pageNumber, selectedText]);

  const runAssistant = (mode: AssistantMode) => {
    if (!lecture || !active) return;

    setLoading(true);
    setAssistantMode(mode);

    const reply = buildAssistantReply({
      mode,
      materialName: active.name,
      pageNumber,
      selection: selectedText,
      lectureTitle: lecture.title,
      transcriptSnippet: transcriptText,
    });

    window.setTimeout(() => {
      setAssistantReply(reply);
      setLoading(false);
    }, 250);
  };

  const readReplyAloud = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(
      `${assistantReply.title}. ${assistantReply.summary}. ${assistantReply.bullets.join(" ")}`,
    );
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-pl-bg">
      <div className="shrink-0 h-11 px-3 border-b border-pl-edge flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="font-headline font-semibold text-sm text-pl-text shrink-0 pr-1">
          Materials
        </span>
        {materials.map((m) => {
          const Icon = MATERIAL_ICONS[m.kind];
          const isActive = m.id === active?.id;
          return (
            <button
              key={m.id}
              onClick={() => setActiveMaterial(m.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-label text-xs border transition-colors ${
                isActive
                  ? "bg-pl-cont border-pl-sky/30 text-pl-text"
                  : "border-transparent text-pl-muted hover:text-pl-text hover:bg-pl-cont/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="max-w-[9rem] truncate">{m.name}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="min-h-0 flex items-center justify-center p-3 border-b xl:border-b-0 xl:border-r border-pl-edge bg-pl-bg">
          {active ? (
            <div className="w-full h-full rounded-xl border border-pl-edge bg-pl-surf/50 overflow-hidden relative">
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-pl-edge bg-pl-surf/80 backdrop-blur-sm">
                <div className="inline-flex items-center gap-2 text-[11px] font-label uppercase tracking-widest text-pl-faint">
                  <SparklesIcon className="w-3 h-3 text-pl-sky" />
                  {active.kind.toUpperCase()}
                </div>
                <div className="font-label text-[10px] text-pl-muted">
                  {guideText}
                </div>
              </div>
              <div className="h-full pt-10 pb-2">
                <Viewer material={active} />
              </div>
            </div>
          ) : (
            <div className="text-center max-w-xs px-6">
              <div className="w-12 h-12 rounded-full bg-pl-cont border border-pl-edge mx-auto mb-4 flex items-center justify-center">
                <UploadIcon className="w-5 h-5 text-pl-sky" />
              </div>
              <div className="font-headline font-semibold text-pl-text mb-1">
                No materials yet
              </div>
              <div className="font-body text-sm text-pl-muted">
                Add slides or handouts from the left. Your lecture materials preview
                here, page by page.
              </div>
            </div>
          )}
        </div>

        <aside className="min-h-0 flex flex-col bg-pl-surf/50 border-t xl:border-t-0">
          <div className="shrink-0 flex items-center justify-between px-3 py-3 border-b border-pl-edge">
            <div className="inline-flex items-center gap-2 text-[11px] font-label uppercase tracking-widest text-pl-sky/75">
              <SparklesIcon className="w-3.5 h-3.5" />
              Study assistant
            </div>
            <button
              onClick={() => readReplyAloud()}
              className="inline-flex items-center gap-1.5 rounded-full border border-pl-edge bg-pl-cont px-2 py-1 text-[10px] font-label text-pl-text hover:border-pl-sky/40 transition-colors"
            >
              <PlayIcon className="w-3 h-3" />
              {speaking ? "Speaking" : "Read aloud"}
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            <div className="rounded-xl border border-pl-edge bg-pl-bg p-3">
              <div className="font-label text-[10px] uppercase tracking-widest text-pl-faint mb-2">
                {assistantReply.title}
              </div>
              {loading ? (
                <div className="space-y-2">
                  <div className="h-3 w-32 rounded bg-pl-cont animate-pulse" />
                  <div className="h-3 w-full rounded bg-pl-cont animate-pulse" />
                  <div className="h-3 w-5/6 rounded bg-pl-cont animate-pulse" />
                </div>
              ) : (
                <>
                  <p className="font-body text-[14px] leading-6 text-pl-text">
                    {assistantReply.summary}
                  </p>
                  <ul className="mt-3 space-y-2 text-[13px] text-pl-muted leading-5">
                    {assistantReply.bullets.map((b, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-pl-sky/70 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="rounded-xl border border-dashed border-pl-edge bg-pl-surf/30 p-3">
              <div className="font-label text-[10px] uppercase tracking-widest text-pl-faint mb-2">
                Selection
              </div>
              {selectedText ? (
                <p className="font-body text-[13px] text-pl-text leading-5">
                  “{selectedText.slice(0, 180)}{selectedText.length > 180 ? "…" : ""}”
                </p>
              ) : (
                <p className="font-body text-[13px] text-pl-muted leading-5">
                  Highlight text in the material to explain it in simpler language.
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 space-y-2 border-t border-pl-edge p-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => runAssistant("page")}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-pl-edge bg-pl-cont hover:border-pl-sky/40 text-pl-text font-label text-[11px] transition-colors"
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                Explain page
              </button>
              <button
                onClick={() => runAssistant("selection")}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-pl-edge bg-pl-cont hover:border-pl-sky/40 text-pl-text font-label text-[11px] transition-colors"
              >
                <MicIcon className="w-3.5 h-3.5" />
                Explain selection
              </button>
            </div>
            <button
              onClick={() => runAssistant("summary")}
              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-pl-edge bg-pl-sky/10 hover:border-pl-sky/40 text-pl-text font-label text-[11px] transition-colors"
            >
              <LayersIcon className="w-3.5 h-3.5" />
              Summarize lecture
            </button>
          </div>
        </aside>
      </div>

      <div className="shrink-0 px-4 py-2.5 border-t border-pl-edge flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-label text-xs text-pl-faint">
          <LayersIcon className="w-3.5 h-3.5" />
          {active
            ? active.pageCount
              ? `${active.pageCount} page${active.pageCount > 1 ? "s" : ""}`
              : previewsNatively(active.kind)
                ? "Use the viewer's controls to page through"
                : "—"
            : "—"}
        </div>
        <div className="flex-1" />
        <div className="inline-flex items-center gap-1.5 font-label text-xs text-pl-sky/70">
          <SparklesIcon className="w-3.5 h-3.5" />
          {assistantMode === "selection" ? "Selection mode" : assistantMode === "summary" ? "Summary mode" : "Page mode"}
        </div>
      </div>
    </div>
  );
}
