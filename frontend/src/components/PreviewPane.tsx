"use client";

import { LayersIcon, MATERIAL_ICONS, SparklesIcon, UploadIcon } from "./icons";
import { MATERIAL_LABEL, previewsNatively } from "@/lib/materials";
import { useStore, useActiveLecture } from "@/store/useStore";
import type { Material } from "@/lib/types";

function Viewer({ material }: { material: Material }) {
  if (material.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={material.fileUrl}
        alt={material.name}
        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
      />
    );
  }

  if (material.kind === "pdf") {
    return (
      <iframe
        src={material.fileUrl}
        title={material.name}
        className="w-full h-full rounded-lg border border-pl-edge bg-white"
      />
    );
  }

  // pptx / docx / other — in-browser rendering needs a conversion step (next task).
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

  const materials = lecture?.materials ?? [];
  const active = materials.find((m) => m.id === lecture?.activeMaterialId);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-pl-bg">
      {/* Header: material tabs */}
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

      {/* Viewer */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">
        {active ? (
          <Viewer material={active} />
        ) : (
          <div className="text-center max-w-xs px-6">
            <div className="w-12 h-12 rounded-full bg-pl-cont border border-pl-edge mx-auto mb-4 flex items-center justify-center">
              <UploadIcon className="w-5 h-5 text-pl-sky" />
            </div>
            <div className="font-headline font-semibold text-pl-text mb-1">
              No materials yet
            </div>
            <div className="font-body text-sm text-pl-muted">
              Add slides or handouts from the left. Your lecture materials
              preview here, page by page.
            </div>
          </div>
        )}
      </div>

      {/* Footer: page + sync (stub) */}
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
          Audio-synced paging · coming next
        </div>
      </div>
    </div>
  );
}
