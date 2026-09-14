"use client";

import { PanelLeftIcon, PanelRightIcon } from "./icons";
import { useStore } from "@/store/useStore";

export default function TopNav() {
  const railOpen = useStore((s) => s.railOpen);
  const previewOpen = useStore((s) => s.previewOpen);
  const toggleRail = useStore((s) => s.toggleRail);
  const togglePreview = useStore((s) => s.togglePreview);
  const user = useStore((s) => s.user);
  const signOut = useStore((s) => s.signOut);

  const cls = (open: boolean) =>
    `w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
      open ? "text-pl-sky bg-pl-sky/10" : "text-pl-muted hover:text-pl-text"
    }`;

  return (
    <nav className="shrink-0 h-12 border-b border-pl-edge/70 bg-pl-bg/95 backdrop-blur z-30 flex items-center px-4 gap-3">
      <button
        onClick={toggleRail}
        className={cls(railOpen)}
        title="Toggle lectures"
      >
        <PanelLeftIcon className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-pl-navy border border-pl-sky/20 flex items-center justify-center">
          <span className="font-headline font-bold text-[10px] text-white tracking-wide">
            PL
          </span>
        </div>
        <span className="font-headline font-semibold text-[14px] text-pl-text">
          Minuteman
        </span>
        <span className="font-label text-xs text-pl-faint hidden sm:inline">
          · Study Partner
        </span>
      </div>

      <div className="flex-1" />

      {user && (
        <div className="flex items-center gap-2.5 mr-1 min-w-0">
          <span
            className="font-label text-xs text-pl-muted truncate max-w-[10rem] hidden sm:inline"
            title={user.email}
          >
            {user.displayName || user.email}
          </span>
          <button
            onClick={() => void signOut()}
            className="font-label text-xs text-pl-faint hover:text-pl-text transition-colors px-2 py-1 rounded hover:bg-pl-cont"
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      )}

      <button
        onClick={togglePreview}
        className={cls(previewOpen)}
        title="Toggle materials preview"
      >
        <PanelRightIcon className="w-4 h-4" />
      </button>
    </nav>
  );
}
