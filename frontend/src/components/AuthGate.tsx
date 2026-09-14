"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";

/**
 * Sign-in / sign-up screen, shown whenever there is no active session.
 * Everything behind it requires an account, so this is the whole page.
 */
export default function AuthGate() {
  const signIn = useStore((s) => s.signIn);
  const signUp = useStore((s) => s.signUp);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const registering = mode === "register";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (registering) await signUp(email, password, displayName);
      else await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full bg-pl-cont border border-pl-edge text-pl-text rounded-lg px-3 py-2 " +
    "text-sm font-body placeholder-pl-faint focus:outline-none focus:border-pl-sky/50 " +
    "transition-colors disabled:opacity-60";

  return (
    <div className="h-screen flex items-center justify-center bg-pl-bg px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-7">
          <div className="w-8 h-8 rounded-lg bg-pl-navy border border-pl-sky/20 flex items-center justify-center">
            <span className="font-headline font-bold text-[11px] text-white tracking-wide">
              PL
            </span>
          </div>
          <div>
            <div className="font-headline font-semibold text-[15px] text-pl-text">
              Minuteman
            </div>
            <div className="font-label text-[11px] text-pl-faint">
              Study Partner · Pearl Labs
            </div>
          </div>
        </div>

        <h1 className="font-headline font-semibold text-xl text-pl-text mb-1">
          {registering ? "Create your account" : "Welcome back"}
        </h1>
        <p className="font-body text-sm text-pl-muted mb-6">
          {registering
            ? "Your lectures, recordings and transcripts are saved to this machine."
            : "Sign in to reach your saved lectures."}
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          {registering && (
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name (optional)"
              autoComplete="name"
              disabled={busy}
              className={field}
            />
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            disabled={busy}
            className={field}
          />

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={registering ? "new-password" : "current-password"}
              required
              minLength={registering ? 8 : undefined}
              disabled={busy}
              className={field}
            />
            {registering && (
              <p className="font-label text-[11px] text-pl-faint mt-1.5">
                At least 8 characters.
              </p>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="font-label text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-pl-orange hover:bg-pl-orange-dark disabled:opacity-60 disabled:hover:bg-pl-orange text-white font-label font-semibold text-sm py-2.5 rounded-full transition-colors"
          >
            {busy
              ? "Just a moment…"
              : registering
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="font-label text-xs text-pl-muted text-center mt-5">
          {registering ? "Already have an account?" : "No account yet?"}{" "}
          <button
            onClick={() => {
              setMode(registering ? "login" : "register");
              setError(null);
            }}
            className="text-pl-sky hover:text-pl-sky-light transition-colors"
          >
            {registering ? "Sign in" : "Create one"}
          </button>
        </p>

        <p className="font-label text-[11px] text-pl-faint text-center mt-6 leading-relaxed">
          Runs locally · your recordings never leave this machine
        </p>
      </div>
    </div>
  );
}
