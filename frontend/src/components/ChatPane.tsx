"use client";

import { useEffect, useRef, useState } from "react";
import { MATERIAL_ICONS, SendIcon, SparklesIcon } from "./icons";
import { useStore, useActiveLecture } from "@/store/useStore";
import { fmtTime, wordCount } from "@/lib/format";
import type { Message } from "@/lib/types";

function ChatMessage({ msg }: { msg: Message }) {
  if (msg.type === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-pl-sky/15 border border-pl-sky/20 px-4 py-2.5 font-body text-[14px] text-pl-text leading-6">
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.type === "ai") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-pl-cont border border-pl-edge px-4 py-2.5 font-body text-[14px] text-pl-text leading-6">
          <span className="inline-flex items-center gap-1.5 font-label text-[10px] uppercase tracking-widest text-pl-sky/70 mb-1">
            <SparklesIcon className="w-3 h-3" />
            AI
          </span>
          <div>{msg.content}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-center">
      <span className="font-label text-xs text-pl-faint px-3 py-1 bg-pl-cont/50 rounded-full border border-pl-edge/50">
        {msg.content}
      </span>
    </div>
  );
}

export default function ChatPane() {
  const lecture = useActiveLecture();
  const renameLecture = useStore((s) => s.renameLecture);
  const sendUserMessage = useStore((s) => s.sendUserMessage);
  const requestMapping = useStore((s) => s.requestMapping);
  const fillGaps = useStore((s) => s.fillGaps);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(true);

  /** Jump the player to a segment's start time. */
  const seekTo = (seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    void el.play().catch(() => {
      /* autoplay can be blocked; the position is still set */
    });
  };

  const messages = lecture?.messages ?? [];
  const active = lecture?.materials.find(
    (m) => m.id === lecture?.activeMaterialId,
  );
  const ActiveIcon = active ? MATERIAL_ICONS[active.kind] : null;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (titleRef.current && lecture) {
      if (titleRef.current.textContent !== lecture.title) {
        titleRef.current.textContent = lecture.title;
      }
    }
  }, [lecture?.id, lecture?.title, lecture]);

  const send = () => {
    if (!draft.trim()) return;
    sendUserMessage(draft);
    setDraft("");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden min-w-0">
      {/* Title */}
      <div className="shrink-0 h-11 px-5 border-b border-pl-edge flex items-center">
        <h1
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => renameLecture(e.currentTarget.textContent || "")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="font-headline font-semibold text-[15px] text-pl-text flex-1 min-w-0 truncate focus:outline-none"
        />
      </div>

      {/* "Now explaining" strip (sync target — AI-driven later) */}
      <div className="shrink-0 px-5 py-2.5 border-b border-pl-edge bg-pl-surf/40 flex items-center gap-2">
        {active && ActiveIcon ? (
          <>
            <ActiveIcon className="w-4 h-4 text-pl-sky shrink-0" />
            <span className="font-label text-xs text-pl-muted truncate">
              Explaining{" "}
              <span className="text-pl-text font-semibold">{active.name}</span>
              {active.pageCount ? ` · page ${lecture?.activePage}` : ""}
            </span>
          </>
        ) : (
          <span className="font-label text-xs text-pl-faint">
            Add a recording and slides to see explanations here
          </span>
        )}
      </div>

      {/* Audio replay + the saved transcript */}
      {lecture?.audio && (
        <div className="shrink-0 border-b border-pl-edge">
          <div className="px-5 py-3">
            <audio
              ref={audioRef}
              key={lecture.audio.id}
              controls
              src={lecture.audio.audioUrl}
              className="w-full h-9"
            />
          </div>

          {lecture.audio.status === "transcribing" && (
            <p className="px-5 pb-3 font-label text-xs text-pl-muted">
              Transcribing {lecture.audio.name}…
            </p>
          )}

          {lecture.audio.status === "error" && (
            <p className="px-5 pb-3 font-label text-xs text-red-400">
              {lecture.audio.errorMsg || "Transcription failed."}
            </p>
          )}

          {lecture.audio.status === "done" && lecture.audio.text && (
            <div className="px-5 pb-3">
              <button
                onClick={() => setTranscriptOpen((v) => !v)}
                className="w-full flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-pl-faint hover:text-pl-muted transition-colors"
              >
                <span>Transcript</span>
                <span className="text-pl-faint/70 normal-case tracking-normal">
                  {wordCount(lecture.audio.text)} words
                  {lecture.audio.language ? ` · ${lecture.audio.language}` : ""}
                </span>
                <span className="flex-1 h-px bg-pl-edge" />
                <span>{transcriptOpen ? "Hide" : "Show"}</span>
              </button>

              {transcriptOpen && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-pl-edge bg-pl-cont/40">
                  {lecture.audio.segments.length > 0 ? (
                    lecture.audio.segments.map((seg, i) => (
                      <button
                        key={i}
                        onClick={() => seekTo(seg.start)}
                        className="w-full text-left flex gap-3 px-3 py-1.5 hover:bg-pl-cont transition-colors"
                        title="Jump to this moment"
                      >
                        <span className="font-mono text-[11px] text-pl-sky/70 shrink-0 pt-0.5">
                          {fmtTime(seg.start)}
                        </span>
                        <span className="font-body text-[13px] text-pl-text leading-5">
                          {seg.text}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 font-body text-[13px] text-pl-text leading-5">
                      {lecture.audio.text}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages / explanations */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className="msg-in">
            <ChatMessage msg={m} />
          </div>
        ))}

        {/* Explanation placeholder for the current slide (AI fills this later) */}
        {active && (
          <div className="rounded-xl border border-dashed border-pl-edge p-4">
            <div className="inline-flex items-center gap-1.5 font-label text-[10px] uppercase tracking-widest text-pl-sky/70 mb-2">
              <SparklesIcon className="w-3 h-3" />
              Slide explanation
            </div>
            <p className="font-body text-sm text-pl-muted leading-relaxed">
              Once a recording is transcribed and mapped, the AI-written
              explanation for this slide appears here — drawn from what was said,
              and filled in where the audio skips a step.
            </p>
          </div>
        )}
      </div>

      {/* AI actions (stubs) */}
      <div className="shrink-0 px-4 pt-2 flex gap-2">
        <button
          onClick={requestMapping}
          className="flex-1 inline-flex items-center justify-center gap-1.5 font-label text-xs py-1.5 rounded-lg border border-pl-edge hover:border-pl-sky/50 text-pl-muted hover:text-pl-text transition-colors"
        >
          <SparklesIcon className="w-3.5 h-3.5" />
          Map audio to slides
        </button>
        <button
          onClick={fillGaps}
          className="flex-1 inline-flex items-center justify-center gap-1.5 font-label text-xs py-1.5 rounded-lg border border-pl-edge hover:border-pl-sky/50 text-pl-muted hover:text-pl-text transition-colors"
        >
          <SparklesIcon className="w-3.5 h-3.5" />
          Fill gaps
        </button>
      </div>

      {/* Chat input */}
      <div className="shrink-0 px-4 py-3">
        <div className="flex items-center gap-2 bg-pl-cont border border-pl-edge rounded-xl px-3 py-2 focus-within:border-pl-sky/50 transition-colors">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            type="text"
            placeholder="Ask about this lecture, or ask the AI to explain a slide…"
            className="flex-1 bg-transparent text-sm text-pl-text placeholder-pl-faint font-body focus:outline-none"
          />
          <button
            onClick={send}
            className="w-7 h-7 rounded-lg bg-pl-sky/20 hover:bg-pl-sky/40 text-pl-sky flex items-center justify-center transition-colors shrink-0"
          >
            <SendIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="font-label text-[10px] text-pl-faint text-center mt-1.5">
          Runs locally · AI study assistant{" "}
          <span className="text-pl-sky/70">coming next</span>
        </p>
      </div>
    </div>
  );
}
