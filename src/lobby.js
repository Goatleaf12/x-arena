// lobby.js — SPLAT lobby client (Phase 1), wired into src/main.js since
// 2026-11-14: join on PLAY, occupants render in the arena with name tags,
// chat panel docks in the HUD. Live server:
// https://splat-lobby.oagenthq.workers.dev
//
// The lobby is a mini-Roblox: one shared room where the four chibi
// characters (Momo / Bibo / Kiko / Pipi) gather, move around, and talk.
// Chat is front and center — a visible feed with sender names and times —
// not a hidden side feature. No wallet, no signing, no auth: a session
// id from POST /lobby/join is the only credential, and it is worthless
// outside the lobby.
//
// Colors match src/characters.js exactly — keep them in sync.

// Character palette (same values as src/characters.js).
export const CHARACTER_COLORS = {
  momo: { main: "#ff9ec7", accent: "#ff5d8f", label: "Momo" },
  bibo: { main: "#9b7ede", accent: "#6d28d9", label: "Bibo" },
  kiko: { main: "#4fd1c5", accent: "#0e7490", label: "Kiko" },
  pipi: { main: "#ffd23f", accent: "#f59e0b", label: "Pipi" },
};

export const LOBBY_BOUNDS = { xMin: -30, xMax: 30, zMin: -30, zMax: 30 };

// Display-ready data for rendering occupants in the 3D room.
// label is the name tag drawn above the avatar.
export function occupantDisplay(state) {
  return (state?.occupants ?? []).map((o) => {
    const c = CHARACTER_COLORS[o.character] ?? CHARACTER_COLORS.momo;
    return { ...o, color: c.main, accent: c.accent, label: o.name };
  });
}

function toWsUrl(baseUrl) {
  const u = new URL(baseUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString().replace(/\/$/, "");
}

export class LobbyClient {
  constructor({ baseUrl, onState, onChat, onError, pollMs = 2000 } = {}) {
    if (!baseUrl) throw new Error("LobbyClient needs baseUrl");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.onState = onState ?? (() => {});
    this.onChat = onChat ?? (() => {});
    this.onError = onError ?? (() => {});
    this.pollMs = pollMs;
    this.sessionId = null;
    this.me = null;
    this.state = { occupants: [], chat: [] };
    this.ws = null;
    this.pollTimer = null;
    this.lastTs = null; // ts of the newest chat message seen; null until first state
    this.lastMoveAt = 0;
  }

  async call(path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error ?? `lobby request failed (${res.status})`);
    }
    return data;
  }

  // Join the room. character is optional — the server assigns a chibi
  // round-robin when omitted, so you are always visible.
  async join({ name, kind, character } = {}) {
    const data = await this.call("/lobby/join", { name, kind, character });
    this.sessionId = data.sessionId;
    this.me = data.occupant;
    await this.refresh();
    return data;
  }

  async refresh() {
    const data = await this.call("/lobby/state");
    this.applyState(data);
    return data;
  }

  applyState(data) {
    const fresh = data.chat ?? [];
    // First state sets the baseline silently; afterwards only messages
    // newer than the last one seen fire onChat (no historic spam).
    const newMsgs = this.lastTs === null ? [] : fresh.filter((m) => m.ts > this.lastTs);
    this.state = { occupants: data.occupants ?? [], chat: fresh };
    if (fresh.length) this.lastTs = fresh[fresh.length - 1].ts;
    this.onState(this.state);
    for (const m of newMsgs) this.onChat(m);
  }

  // Live updates: WebSocket when possible, HTTP polling otherwise.
  connect() {
    if (typeof WebSocket === "undefined" || !this.sessionId) {
      this.startPolling();
      return;
    }
    let ws;
    try {
      ws = new WebSocket(`${toWsUrl(this.baseUrl)}/lobby/ws?sessionId=${this.sessionId}`);
    } catch {
      this.startPolling();
      return;
    }
    this.ws = ws;
    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "hello" || msg.type === "state") this.applyState(msg);
      else if (msg.type === "error") this.onError(new Error(msg.error));
    });
    ws.addEventListener("close", () => this.startPolling());
    ws.addEventListener("error", () => {
      try {
        ws.close();
      } catch {
        // already closed
      }
    });
  }

  startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.refresh().catch((err) => this.onError(err));
    }, this.pollMs);
  }

  stop() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // Send a move. Throttled to ~10/s client-side; the server caps at
  // 120/min per session. Coordinates clamp to the room on the server.
  async move(x, z, y = 0) {
    if (!this.sessionId) throw new Error("join first");
    const now = Date.now();
    if (now - this.lastMoveAt < 100) return null; // local throttle
    this.lastMoveAt = now;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "move", x, y, z }));
      return null;
    }
    return this.call("/lobby/move", { sessionId: this.sessionId, x, y, z });
  }

  async chat(text) {
    if (!this.sessionId) throw new Error("join first");
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "chat", text }));
      return null;
    }
    return this.call("/lobby/chat", { sessionId: this.sessionId, text });
  }

  async leave() {
    if (!this.sessionId) return;
    const sid = this.sessionId;
    this.sessionId = null;
    this.stop();
    try {
      await this.call("/lobby/leave", { sessionId: sid });
    } catch {
      // leaving is best-effort; presence expires after 90 s anyway
    }
  }
}

// Mount a chat panel into a DOM container: a scrolling feed (time,
// colored sender name, text) plus an input row. All user text goes
// through textContent, never innerHTML. Returns { destroy, render }.
// Usage: createChatPanel(document.getElementById("lobby-chat"), lobby);
// The panel renders lobby.state.chat on every state update, so the feed
// stays live whether updates arrive by WebSocket or polling.
export function createChatPanel(container, client, { maxMessages = 100 } = {}) {
  if (!container) throw new Error("createChatPanel needs a container element");
  container.classList.add("lobby-chat");
  const feed = document.createElement("div");
  feed.className = "lobby-chat-feed";
  const form = document.createElement("form");
  form.className = "lobby-chat-form";
  const input = document.createElement("input");
  input.className = "lobby-chat-input";
  input.maxLength = 280;
  input.placeholder = "Say something to the room…";
  input.setAttribute("aria-label", "Chat message");
  const send = document.createElement("button");
  send.className = "lobby-chat-send";
  send.type = "submit";
  send.textContent = "Send";
  form.append(input, send);
  container.append(feed, form);

  const seen = new Set();
  function timeOf(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function addMessage(m) {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    const row = document.createElement("div");
    row.className = "lobby-chat-msg";
    const time = document.createElement("span");
    time.className = "lobby-chat-time";
    time.textContent = timeOf(m.ts);
    const name = document.createElement("span");
    name.className = "lobby-chat-name";
    name.textContent = m.name;
    const color = (CHARACTER_COLORS[m.character] ?? CHARACTER_COLORS.momo).accent;
    name.style.color = color;
    const text = document.createElement("span");
    text.className = "lobby-chat-text";
    text.textContent = m.text;
    row.append(time, name, text);
    feed.appendChild(row);
    while (feed.children.length > maxMessages) feed.removeChild(feed.firstChild);
    feed.scrollTop = feed.scrollHeight;
  }
  function render() {
    for (const m of client.state.chat ?? []) addMessage(m);
  }
  const prevOnState = client.onState;
  client.onState = (state) => {
    render();
    prevOnState(state);
  };
  render();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    client.chat(text).catch((err) => client.onError(err));
  });
  return {
    render,
    destroy() {
      client.onState = prevOnState;
      container.replaceChildren();
    },
  };
}
