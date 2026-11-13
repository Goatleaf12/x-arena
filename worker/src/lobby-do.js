// lobby-do.js — Cloudflare Durable Object: one lobby room.
//
// The Worker (index.js) forwards every /lobby/* request to the single
// "splat-lobby" instance of this class. All room rules live in room.js;
// this file only translates HTTP / WebSocket into room calls, enforces a
// per-IP join limit, and broadcasts state changes to live sockets.
//
// Endpoints (all JSON unless noted):
//   GET  /lobby/state            -> { occupants, chat, limits, ts }
//   POST /lobby/join  {name, kind, character?} -> { sessionId, occupant, occupants }
//   POST /lobby/move  {sessionId, x, y?, z?}   -> occupant
//   POST /lobby/chat  {sessionId, text}        -> message
//   POST /lobby/leave {sessionId}              -> { ok }
//   GET  /lobby/ws?sessionId=... -> WebSocket (101). Send JSON frames:
//        {type:"move",x,z} | {type:"chat",text} | {type:"ping"}.
//        Server pushes {type:"state", ...} after every change and a
//        {type:"hello", sessionId, state} on connect.
//   GET  /                             -> { ok: true, service: "splat-lobby" }
//
// Presence is ephemeral and in-memory: if this isolate restarts, the
// room starts empty. That is intentional — a lobby holds no identity
// and no history worth persisting.
//
// Free-tier notes: one Durable Object, no KV/R2/queues, no paid
// bindings. The only cost is Worker requests, inside the free allowance.

import { createRoom } from "./room.js";

const JOIN_PER_MIN_PER_IP = 5;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function errJson(err) {
  const status = err.code === "bad_request" ? 400 : 500;
  return json({ ok: false, error: err.message ?? "internal error" }, status);
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export class LobbyRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = createRoom();
    this.sockets = new Set(); // { socket, sessionId }
    this.joinStamps = new Map(); // ip -> [ts...]
  }

  broadcast() {
    const payload = JSON.stringify({ type: "state", ...this.room.state() });
    for (const entry of [...this.sockets]) {
      try {
        entry.socket.send(payload);
      } catch {
        this.sockets.delete(entry);
      }
    }
  }

  // Remove a socket's occupant once its presence expires naturally.
  // We do NOT delete the occupant on socket close: a dropped connection
  // may reconnect within the 90 s presence window and keep its seat.
  dropSocket(entry) {
    this.sockets.delete(entry);
    try {
      entry.socket.close();
    } catch {
      // already closed
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    try {
      if (url.pathname === "/" && request.method === "GET") {
        return json({ ok: true, service: "splat-lobby", phase: 1 });
      }

      if (url.pathname === "/lobby/ws") {
        return this.handleWs(request, url);
      }

      if (url.pathname === "/lobby/state" && request.method === "GET") {
        return json({ ok: true, ...this.room.state() });
      }

      if (url.pathname === "/lobby/join" && request.method === "POST") {
        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        const now = Date.now();
        const stamps = (this.joinStamps.get(ip) ?? []).filter((t) => t > now - 60_000);
        if (stamps.length >= JOIN_PER_MIN_PER_IP) {
          return json({ ok: false, error: `join rate limit (${JOIN_PER_MIN_PER_IP}/min per IP)` }, 429);
        }
        stamps.push(now);
        this.joinStamps.set(ip, stamps);
        const body = await readBody(request);
        const result = this.room.join(body);
        this.broadcast();
        return json({ ok: true, ...result });
      }

      if (url.pathname === "/lobby/move" && request.method === "POST") {
        const body = await readBody(request);
        const occupant = this.room.move(body.sessionId, body);
        this.broadcast();
        return json({ ok: true, occupant });
      }

      if (url.pathname === "/lobby/chat" && request.method === "POST") {
        const body = await readBody(request);
        const message = this.room.chat(body.sessionId, body.text);
        this.broadcast();
        return json({ ok: true, message });
      }

      if (url.pathname === "/lobby/leave" && request.method === "POST") {
        const body = await readBody(request);
        const ok = this.room.leave(body.sessionId);
        for (const entry of [...this.sockets]) {
          if (entry.sessionId === body.sessionId) this.dropSocket(entry);
        }
        this.broadcast();
        return json({ ok: true, left: ok });
      }

      return json({ ok: false, error: "not found" }, 404);
    } catch (err) {
      return errJson(err);
    }
  }

  handleWs(request, url) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ ok: false, error: "expected websocket" }, 426);
    }
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return json({ ok: false, error: "sessionId query param is required — join over HTTP first" }, 400);
    }
    try {
      this.room.heartbeat(sessionId);
    } catch (err) {
      return errJson(err);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const entry = { socket: server, sessionId };
    this.sockets.add(entry);

    server.send(JSON.stringify({ type: "hello", sessionId, ...this.room.state() }));

    server.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      try {
        if (msg.type === "move") {
          this.room.move(sessionId, msg);
          this.broadcast();
        } else if (msg.type === "chat") {
          this.room.chat(sessionId, msg.text);
          this.broadcast();
        } else if (msg.type === "ping") {
          this.room.heartbeat(sessionId);
          server.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        } else if (msg.type === "leave") {
          this.room.leave(sessionId);
          this.broadcast();
          this.dropSocket(entry);
        }
      } catch (err) {
        try {
          server.send(JSON.stringify({ type: "error", error: err.message ?? "bad frame" }));
        } catch {
          // socket is gone
        }
      }
    });

    server.addEventListener("close", () => this.sockets.delete(entry));
    server.addEventListener("error", () => this.sockets.delete(entry));

    return new Response(null, { status: 101, webSocket: client });
  }
}
