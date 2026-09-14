"use client";

import { useEffect, useState } from "react";
import AuthGate from "./AuthGate";
import TopNav from "./TopNav";
import LectureRail from "./LectureRail";
import ChatPane from "./ChatPane";
import PreviewPane from "./PreviewPane";
import Toasts from "./Toasts";
import { isAudioFile, materialKind } from "@/lib/materials";
import { useIsMobile } from "@/lib/useIsMobile";
import { useStore } from "@/store/useStore";

export default function AppShell() {
  const isMobile = useIsMobile();
  const [dragging, setDragging] = useState(false);

  const user = useStore((s) => s.user);
  const authReady = useStore((s) => s.authReady);
  const bootstrap = useStore((s) => s.bootstrap);
  const addMaterial = useStore((s) => s.addMaterial);
  const setAudio = useStore((s) => s.setAudio);
  const railOpen = useStore((s) => s.railOpen);
  const previewOpen = useStore((s) => s.previewOpen);
  const setRailOpen = useStore((s) => s.setRailOpen);
  const setPreviewOpen = useStore((s) => s.setPreviewOpen);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Hide side regions on mobile, show them on desktop.
  useEffect(() => {
    setRailOpen(!isMobile);
    setPreviewOpen(!isMobile);
  }, [isMobile, setRailOpen, setPreviewOpen]);

  // Nothing renders until /auth/me resolves, so the gate never flashes for a
  // signed-in user reloading the page.
  if (!authReady) {
    return <div className="h-screen bg-pl-bg" />;
  }
  if (!user) {
    return (
      <>
        <AuthGate />
        <Toasts />
      </>
    );
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach((f) => {
      if (isAudioFile(f) && materialKind(f) === "other") void setAudio(f);
      else void addMaterial(f);
    });
  };

  const railClass = isMobile
    ? `fixed left-0 top-12 bottom-0 z-40 w-[min(82vw,17rem)] border-r border-pl-edge bg-pl-surf overflow-hidden transition-transform duration-200 ${
        railOpen ? "translate-x-0" : "-translate-x-[110%]"
      }`
    : `shrink-0 border-r border-pl-edge bg-pl-surf overflow-hidden transition-[width] duration-200 ${
        railOpen ? "w-60" : "w-0"
      }`;

  const previewClass = isMobile
    ? `fixed right-0 top-12 bottom-0 z-40 w-[min(92vw,32rem)] border-l border-pl-edge bg-pl-bg overflow-hidden transition-transform duration-200 ${
        previewOpen ? "translate-x-0" : "translate-x-[110%]"
      }`
    : `shrink-0 border-l border-pl-edge bg-pl-bg overflow-hidden transition-[width,flex-basis] duration-200 ${
        previewOpen ? "w-[46%] min-w-[360px]" : "w-0 min-w-0"
      }`;

  const showBackdrop = isMobile && (railOpen || previewOpen);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <TopNav />

      <div className="flex flex-1 overflow-hidden relative">
        <aside className={railClass}>
          <LectureRail />
        </aside>

        {/* LEFT — Chat / Explanations */}
        <main
          className={`relative flex-1 flex flex-col overflow-hidden min-w-0 transition-colors ${
            dragging ? "bg-pl-sky/[0.03] ring-1 ring-inset ring-pl-sky/60" : ""
          }`}
        >
          <ChatPane />
        </main>

        {/* RIGHT — Materials preview */}
        <aside className={previewClass}>
          <PreviewPane />
        </aside>

        {showBackdrop && (
          <div
            className="fixed left-0 right-0 bottom-0 top-12 z-30 bg-[rgba(0,11,26,0.72)]"
            onClick={() => {
              setRailOpen(false);
              setPreviewOpen(false);
            }}
          />
        )}
      </div>

      <Toasts />
    </div>
  );
}
