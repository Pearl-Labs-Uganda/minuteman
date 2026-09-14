"use client";

import { useStore } from "@/store/useStore";

const KIND_STYLES: Record<string, string> = {
  info: "border-pl-edge text-pl-text",
  success: "border-emerald-500/40 text-emerald-300",
  error: "border-red-500/40 text-red-300",
};

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);

  return (
    <div className="fixed top-14 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-el font-label text-xs px-3.5 py-2.5 rounded-lg bg-pl-cont border shadow-lg ${
            KIND_STYLES[t.kind] || KIND_STYLES.info
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
