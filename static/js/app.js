// ============================================================
// Utilities
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 9);

function fmtTime(t) {
  if (t == null || isNaN(t)) return "--:--";
  const m = Math.floor(Math.max(0, t) / 60),
    s = Math.floor(Math.max(0, t) % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtSrtTime(t) {
  const ms = Math.max(0, Math.floor((t || 0) * 1000));
  const h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000),
    ml = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ml).padStart(3, "0")}`;
}
function fmtBytes(b) {
  if (!b) return "";
  return b < 1048576
    ? `${(b / 1024).toFixed(1)} KB`
    : `${(b / 1048576).toFixed(1)} MB`;
}
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(msg, kind = "info") {
  const cls =
    {
      info: "bg-pl-surf border-pl-edge text-pl-text",
      success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
      error: "bg-red-500/10 border-red-500/30 text-red-400",
    }[kind] || "bg-pl-surf border-pl-edge text-pl-text";
  const el = document.createElement("div");
  el.className = `toast-el ${cls} border px-4 py-2.5 rounded-lg text-sm font-label shadow-lg`;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 0.2s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 220);
  }, 2800);
}

function dl(name, content, mime) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: mime })),
    download: name,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ============================================================
// State
// ============================================================
const state = {
  sessions: [],
  activeSessionId: null,
  activeOutput: "transcript",
  queue: [], // { sessionId, trackId }
  queueRunning: false,
};

// Session: { id, name, tracks: Track[], messages: Message[] }
// Track: { id, file, audioUrl, status:'pending'|'transcribing'|'done'|'error', text, segments, language, model, durationSec, errorMsg }
// Message: { id, type:'system'|'transcript'|'user', content, trackId? }

function session() {
  return (
    state.sessions.find((s) => s.id === state.activeSessionId) || null
  );
}

function createSession(name) {
  const s = {
    id: uid(),
    name: name || "Untitled session",
    tracks: [],
    messages: [],
  };
  state.sessions.push(s);
  state.activeSessionId = s.id;
  renderSessions();
  renderFiles();
  renderChat();
  renderStudio();
  updateSessionTitle();
  return s;
}

function switchSession(id) {
  state.activeSessionId = id;
  renderSessions();
  renderFiles();
  renderChat();
  renderStudio();
  updateSessionTitle();
}

function updateSessionTitle() {
  const s = session();
  $("#sessionTitle").textContent = s ? s.name : "";
}

// ============================================================
// Track / queue
// ============================================================
function addTrack(file) {
  const s = session();
  if (!s) return;
  const id = uid();
  const audioUrl = URL.createObjectURL(file);
  const track = {
    id,
    file,
    audioUrl,
    status: "pending",
    text: "",
    segments: [],
    language: null,
    model: null,
    durationSec: null,
    errorMsg: null,
  };
  s.tracks.push(track);
  // Resolve duration
  const tmp = new Audio(audioUrl);
  tmp.addEventListener(
    "loadedmetadata",
    () => {
      track.durationSec = tmp.duration;
      renderFiles();
    },
    { once: true },
  );
  addMessage(
    "system",
    `Added <strong>${escHtml(file.name)}</strong> (${fmtBytes(file.size)})`,
  );
  state.queue.push({ sessionId: s.id, trackId: id });
  renderFiles();
  processQueue();
}

function removeTrack(trackId) {
  const s = session();
  if (!s) return;
  const idx = s.tracks.findIndex((t) => t.id === trackId);
  if (idx < 0) return;
  URL.revokeObjectURL(s.tracks[idx].audioUrl);
  s.tracks.splice(idx, 1);
  renderFiles();
  renderStudio();
}

async function processQueue() {
  if (state.queueRunning || !state.queue.length) return;
  state.queueRunning = true;
  const { sessionId, trackId } = state.queue.shift();
  await transcribeTrack(sessionId, trackId);
  state.queueRunning = false;
  processQueue();
}

async function transcribeTrack(sessionId, trackId) {
  const s = state.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  const track = s.tracks.find((t) => t.id === trackId);
  if (!track) return;
  const modelName = $("#model").value;
  track.status = "transcribing";
  track.model = modelName;
  renderFiles();
  const statusMsgId = addMessage(
    "system",
    `<span class="inline-flex items-center gap-1.5"><span class="inline-block w-3 h-3 border-2 border-pl-edge border-t-pl-sky rounded-full spinner"></span>Transcribing <strong>${escHtml(track.file.name)}</strong> with <em>${modelName}</em>…</span>`,
  );
  setStatus(`Transcribing ${track.file.name}…`, true);

  const form = new FormData();
  form.append("audio", track.file);
  form.append("model", modelName);
  const lang = $("#language").value.trim();
  if (lang) form.append("language", lang);

  try {
    const res = await fetch("/transcribe", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    // Remove "transcribing…" message
    removeMessage(statusMsgId);
    if (!res.ok || !data.ok) {
      track.status = "error";
      track.errorMsg = data.error || res.statusText;
      addMessage(
        "system",
        `<span class="text-red-400">✗ Error transcribing <strong>${escHtml(track.file.name)}</strong>: ${escHtml(track.errorMsg)}</span>`,
      );
      toast(`Failed: ${track.file.name}`, "error");
    } else {
      track.status = "done";
      track.text = String(data.text || "").trim();
      track.segments = (data.segments || []).map((sg) => ({
        ...sg,
        text: String(sg.text || "").trim(),
      }));
      track.language = data.language;
      track.model = data.model;
      addTranscriptCard(track);
      toast(`Done: ${track.file.name}`, "success");
    }
    renderFiles();
    renderStudio();
    const rem = state.queue.filter(
      (q) => q.sessionId === sessionId,
    ).length;
    setStatus(rem > 0 ? `${rem} more queued…` : "", false);
  } catch (err) {
    removeMessage(statusMsgId);
    track.status = "error";
    track.errorMsg = err.message;
    addMessage(
      "system",
      `<span class="text-red-400">✗ Request failed: ${escHtml(err.message)}</span>`,
    );
    renderFiles();
    setStatus("", false);
    toast(`Failed: ${track.file.name}`, "error");
  }
}

// ============================================================
// Status chip
// ============================================================
function setStatus(text, loading) {
  const chip = $("#statusChip");
  if (!text) {
    chip.innerHTML = "";
    return;
  }
  chip.innerHTML = loading
    ? `<span class="inline-flex items-center gap-1.5 text-pl-sky"><span class="inline-block w-2.5 h-2.5 border-2 border-pl-edge border-t-pl-sky rounded-full spinner"></span>${escHtml(text)}</span>`
    : `<span class="text-emerald-400">${escHtml(text)}</span>`;
}

// ============================================================
// Chat messages
// ============================================================
function addMessage(type, content, trackId) {
  const s = session();
  if (!s) return null;
  const id = uid();
  s.messages.push({ id, type, content, trackId });
  appendMessageToDOM({ id, type, content, trackId });
  updateEmptyState();
  return id;
}

function removeMessage(id) {
  const s = session();
  if (!s) return;
  const idx = s.messages.findIndex((m) => m.id === id);
  if (idx >= 0) s.messages.splice(idx, 1);
  const el = document.querySelector(`[data-msg-id="${id}"]`);
  if (el) el.remove();
  updateEmptyState();
}

function appendMessageToDOM(msg) {
  const chat = $("#chatMessages");
  const el = document.createElement("div");
  el.dataset.msgId = msg.id;
  el.className = "msg-in";

  if (msg.type === "system") {
    el.innerHTML = `<div class="flex justify-center"><span class="font-label text-xs text-pl-faint px-3 py-1 bg-pl-cont/50 rounded-full border border-pl-edge/50">${msg.content}</span></div>`;
  } else if (msg.type === "transcript") {
    // Card with collapsed/expanded toggle
    const preview = msg.content.text
      ? msg.content.text.slice(0, 200) +
        (msg.content.text.length > 200 ? "…" : "")
      : "(empty)";
    const hasMore = msg.content.text && msg.content.text.length > 200;
    el.innerHTML = `
      <div class="rounded-xl border border-pl-edge bg-pl-cont overflow-hidden">
          <div class="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-pl-edge/60">
              <div class="flex items-center gap-2 min-w-0">
                  <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                  <span class="font-label font-semibold text-sm text-pl-text truncate">${escHtml(msg.content.filename)}</span>
                  ${msg.content.language ? `<span class="font-mono text-[10px] text-pl-faint uppercase px-1.5 py-0.5 rounded bg-pl-edge/50">${escHtml(msg.content.language)}</span>` : ""}
              </div>
              <span class="font-label text-xs text-pl-muted shrink-0">${msg.content.wordCount} words</span>
          </div>
          <div class="px-4 py-3">
              <div class="msg-preview font-body text-[14px] leading-6 text-pl-text">${escHtml(preview)}</div>
              ${hasMore ? `<div class="msg-full hidden font-body text-[14px] leading-6 text-pl-text whitespace-pre-wrap">${escHtml(msg.content.text)}</div>` : ""}
              ${hasMore ? `<button class="expand-btn font-label text-xs text-pl-sky hover:text-pl-sky-light mt-2 transition-colors">Show more</button>` : ""}
          </div>
      </div>`;
    // Toggle expand
    const btn = el.querySelector(".expand-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        const full = el.querySelector(".msg-full"),
          prev = el.querySelector(".msg-preview");
        const expanded = !full.classList.contains("hidden");
        full.classList.toggle("hidden", expanded);
        prev.classList.toggle("hidden", !expanded);
        btn.textContent = expanded ? "Show more" : "Show less";
      });
    }
  } else if (msg.type === "user") {
    el.innerHTML = `<div class="flex justify-end"><div class="max-w-[80%] rounded-2xl rounded-tr-sm bg-pl-sky/15 border border-pl-sky/20 px-4 py-2.5 font-body text-[14px] text-pl-text leading-6">${escHtml(msg.content)}</div></div>`;
  }

  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function addTranscriptCard(track) {
  const wordCount = track.text.trim().split(/\s+/).filter(Boolean).length;
  addMessage(
    "transcript",
    {
      filename: track.file.name,
      text: track.text,
      language: track.language,
      wordCount,
    },
    track.id,
  );
}

function renderChat() {
  const chat = $("#chatMessages");
  chat.innerHTML = "";
  const s = session();
  if (s) s.messages.forEach((m) => appendMessageToDOM(m));
  updateEmptyState();
}

function updateEmptyState() {
  const s = session();
  const hasMessages = s && s.messages.length > 0;
  $("#chatEmptyState").style.display = hasMessages ? "none" : "";
}

// ============================================================
// Sessions sidebar
// ============================================================
function renderSessions() {
  const list = $("#sessionList");
  list.innerHTML = "";
  state.sessions.forEach((s) => {
    const el = document.createElement("div");
    el.className = `session-item rounded-lg px-2.5 py-1.5 cursor-pointer flex items-center gap-2 ${s.id === state.activeSessionId ? "active" : ""}`;
    el.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3 text-pl-muted shrink-0" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="font-label text-xs text-pl-text truncate flex-1">${escHtml(s.name)}</span>
      <span class="font-label text-[10px] text-pl-faint shrink-0">${s.tracks.length}</span>`;
    el.addEventListener("click", () => switchSession(s.id));
    list.appendChild(el);
  });
}

// ============================================================
// Files list
// ============================================================
function renderFiles() {
  const s = session();
  const list = $("#fileList");
  list.innerHTML = "";
  const tracks = s ? s.tracks : [];
  $("#fileEmptyHint").style.display = tracks.length ? "none" : "";

  tracks.forEach((track) => {
    const statusDot = {
      pending:
        '<span class="w-1.5 h-1.5 rounded-full bg-pl-edge shrink-0 mt-0.5"></span>',
      transcribing:
        '<span class="inline-block w-3 h-3 border-2 border-pl-edge border-t-pl-sky rounded-full spinner shrink-0"></span>',
      done: '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-0.5"></span>',
      error:
        '<span class="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-0.5"></span>',
    }[track.status];
    const meta = [
      fmtBytes(track.file.size),
      track.durationSec ? fmtTime(track.durationSec) : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const el = document.createElement("div");
    el.className =
      "file-item group rounded-lg px-2 py-1.5 flex items-start gap-2";
    el.innerHTML = `
      ${statusDot}
      <div class="flex-1 min-w-0">
          <div class="font-label text-xs text-pl-text truncate leading-tight">${escHtml(track.file.name)}</div>
          <div class="font-label text-[10px] text-pl-faint">${meta}</div>
      </div>
      <button data-remove="${track.id}" class="text-pl-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5" title="Remove">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3 h-3 pointer-events-none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
    list.appendChild(el);
  });

  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (btn) removeTrack(btn.dataset.remove);
  });
}

// ============================================================
// Studio (right panel)
// ============================================================
function getOutputContent(type) {
  const s = session();
  if (!s) return null;
  const done = s.tracks.filter((t) => t.status === "done");
  if (!done.length) return null;
  if (type === "transcript") {
    return done.length > 1
      ? done
          .map((t) => `[${t.file.name}]\n${t.text}`)
          .join("\n\n— — —\n\n")
      : done[0].text;
  }
  if (type === "segments") {
    return done
      .map(
        (t) =>
          `[${t.file.name}]\n` +
          t.segments
            .map(
              (sg) =>
                `[${fmtTime(sg.start)} → ${fmtTime(sg.end)}]  ${sg.text}`,
            )
            .join("\n"),
      )
      .join("\n\n");
  }
  if (type === "srt") {
    let idx = 1;
    const parts = [];
    done.forEach((t) =>
      t.segments.forEach((sg) => {
        parts.push(
          `${idx++}\n${fmtSrtTime(sg.start)} --> ${fmtSrtTime(sg.end)}\n${sg.text}`,
        );
      }),
    );
    return parts.join("\n\n");
  }
  return null; // cleaned / minutes / summary — AI, coming soon
}

const OUTPUT_META = {
  transcript: {
    label: "Transcript",
    sub: ".txt · full text",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-pl-sky shrink-0" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  },
  segments: {
    label: "Segments",
    sub: "timestamped",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-pl-sky shrink-0" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  },
  srt: {
    label: "Captions",
    sub: ".srt format",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-pl-sky shrink-0" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>`,
  },
  cleaned: {
    label: "Cleaned-up",
    sub: "AI · soon",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-pl-muted shrink-0" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  },
  minutes: {
    label: "Minutes",
    sub: "AI · soon",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-pl-muted shrink-0" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  },
  summary: {
    label: "Summary",
    sub: "AI · soon",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-pl-muted shrink-0" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  },
};

function renderStudio() {
  const type = state.activeOutput;
  const content = getOutputContent(type);
  const isAiType = ["cleaned", "minutes", "summary"].includes(type);
  const meta = OUTPUT_META[type] || OUTPUT_META.transcript;

  $("#studioEmpty").classList.toggle("hidden", !!(content || isAiType));
  $("#studioCard").classList.toggle("hidden", !(content && !isAiType));
  $("#studioPlaceholder").classList.toggle("hidden", !isAiType);

  if (content && !isAiType) {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    $("#studioCardHeader").innerHTML = `
      <span class="flex items-center gap-1.5 min-w-0 flex-1">
        ${meta.icon}
        <span class="font-label font-semibold text-xs text-pl-text">${meta.label}</span>
        <span class="font-label text-[10px] text-pl-faint">${meta.sub}</span>
      </span>
      <span class="font-label text-[10px] text-pl-faint shrink-0">${words.toLocaleString()} words</span>`;
    $("#studioContent").textContent = content;
    $("#studioWordCount").textContent = `${words.toLocaleString()} words`;
  } else {
    $("#studioWordCount").textContent = "";
  }
}

// Output format selector
document
  .getElementById("outputSelect")
  .addEventListener("change", (e) => {
    state.activeOutput = e.target.value;
    renderStudio();
  });

$("#studioCopyBtn").addEventListener("click", async () => {
  const content = getOutputContent(state.activeOutput);
  if (!content) {
    toast("Nothing to copy yet", "info");
    return;
  }
  try {
    await navigator.clipboard.writeText(content);
    toast("Copied", "success");
  } catch {
    toast("Copy failed", "error");
  }
});

$("#studioDownloadBtn").addEventListener("click", () => {
  const content = getOutputContent(state.activeOutput);
  if (!content) {
    toast("Nothing to download yet", "info");
    return;
  }
  const s = session();
  const base = (s ? s.name : "session")
    .replace(/[^a-z0-9_-]/gi, "-")
    .toLowerCase();
  const exts = { transcript: "txt", segments: "txt", srt: "srt" };
  const mime =
    state.activeOutput === "srt" ? "application/x-subrip" : "text/plain";
  dl(
    `${base}-${state.activeOutput}.${exts[state.activeOutput] || "txt"}`,
    content,
    mime,
  );
});

// ============================================================
// File input & drag-drop
// ============================================================
$("#addSourcesBtn").addEventListener("click", () =>
  $("#audioFile").click(),
);
document
  .getElementById("addSourcesBtnIcon")
  .addEventListener("click", () => $("#audioFile").click());
$("#audioFile").addEventListener("change", () => {
  Array.from($("#audioFile").files).forEach(addTrack);
  $("#audioFile").value = "";
});

const AUDIO_EXT = /\.(m4a|wav|mp3|mp4|webm|ogg|flac)$/i;
function isAudioFile(f) {
  return (
    f.type.startsWith("audio/") ||
    f.type.startsWith("video/") ||
    AUDIO_EXT.test(f.name)
  );
}

const centerMain = $("main");
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  centerMain.classList.add("dz-over");
});
document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) centerMain.classList.remove("dz-over");
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  centerMain.classList.remove("dz-over");
  const files = Array.from(e.dataTransfer.files).filter(isAudioFile);
  if (files.length) files.forEach(addTrack);
});

// ============================================================
// Chat input
// ============================================================
function sendUserMessage() {
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  addMessage("user", text);
  // Future: send to AI. For now acknowledge
  setTimeout(() => {
    addMessage(
      "system",
      '<span class="text-pl-sky/70">AI assistant is coming in the next version · transcript is ready to view in Studio →</span>',
    );
  }, 400);
}

$("#chatSendBtn").addEventListener("click", sendUserMessage);
$("#chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendUserMessage();
  }
});

// ============================================================
// Session title edits saved back to state
// ============================================================
$("#sessionTitle").addEventListener("blur", () => {
  const s = session();
  if (s) {
    s.name = $("#sessionTitle").textContent.trim() || "Untitled session";
    renderSessions();
  }
});
$("#sessionTitle").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("#sessionTitle").blur();
  }
});

// ============================================================
// New session button
// ============================================================
$("#newSessionBtn").addEventListener("click", () => {
  createSession("Untitled session");
});

// ============================================================
// Responsive helpers
// ============================================================
function isMobile() {
  return window.innerWidth < 768;
}

function updateBackdrop() {
  const srcHidden = document
    .getElementById("sourcesPanel")
    .classList.contains("mob-hidden");
  const studioHidden = document
    .getElementById("studioPanel")
    .classList.contains("mob-hidden");
  document.getElementById("backdrop").style.display =
    !srcHidden || !studioHidden ? "block" : "none";
}

// ============================================================
// Sidebar toggles
// ============================================================
function togglePanel(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  if (isMobile()) {
    const hidden = panel.classList.toggle("mob-hidden");
    btn.classList.toggle("panel-open", !hidden);
    updateBackdrop();
  } else {
    const collapseClass =
      panelId === "sourcesPanel" ? "src-collapsed" : "collapsed";
    const collapsed = panel.classList.toggle(collapseClass);
    btn.classList.toggle("panel-open", !collapsed);
  }
}

document.getElementById("backdrop").addEventListener("click", () => {
  if (
    !document
      .getElementById("sourcesPanel")
      .classList.contains("mob-hidden")
  )
    togglePanel("sourcesPanel", "toggleSources");
  if (
    !document
      .getElementById("studioPanel")
      .classList.contains("mob-hidden")
  )
    togglePanel("studioPanel", "toggleStudio");
});

let _rsz;
window.addEventListener("resize", () => {
  clearTimeout(_rsz);
  _rsz = setTimeout(() => {
    const mob = isMobile();
    const src = document.getElementById("sourcesPanel");
    const studio = document.getElementById("studioPanel");
    const srcBtn = document.getElementById("toggleSources");
    const studioBtn = document.getElementById("toggleStudio");
    if (!mob) {
      src.classList.remove("mob-hidden");
      studio.classList.remove("mob-hidden");
      srcBtn.classList.add("panel-open");
      studioBtn.classList.add("panel-open");
      document.getElementById("backdrop").style.display = "none";
    } else {
      src.classList.remove("src-collapsed", "collapsed");
      studio.classList.remove("collapsed");
      src.classList.add("mob-hidden");
      studio.classList.add("mob-hidden");
      srcBtn.classList.remove("panel-open");
      studioBtn.classList.remove("panel-open");
      document.getElementById("backdrop").style.display = "none";
    }
  }, 100);
});

document
  .getElementById("toggleSources")
  .addEventListener("click", () =>
    togglePanel("sourcesPanel", "toggleSources"),
  );
document
  .getElementById("toggleStudio")
  .addEventListener("click", () =>
    togglePanel("studioPanel", "toggleStudio"),
  );

// ============================================================
// Bootstrap
// ============================================================
createSession("Untitled session");
// On mobile: start with both panels hidden so the main content is fully visible
if (isMobile()) {
  document.getElementById("sourcesPanel").classList.add("mob-hidden");
  document.getElementById("studioPanel").classList.add("mob-hidden");
  document.getElementById("toggleSources").classList.remove("panel-open");
  document.getElementById("toggleStudio").classList.remove("panel-open");
}
