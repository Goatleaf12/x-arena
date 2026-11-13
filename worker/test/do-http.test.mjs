// do-http.test.mjs — tests for worker/src/lobby-do.js over its HTTP API.
// Runs in plain node: the Durable Object constructor takes no real ctx
// (it only stores it), and WebSocketPair is stubbed below.
// Run:  node --test test/        (from worker/)

import { test } from "node:test";
import assert from "node:assert/strict";
import { LobbyRoom } from "../src/lobby-do.js";

// Minimal WebSocketPair stand-in: Object.values(pair) must return
// [client, server] in order, and the server side records what it sends
// and which listeners were attached so tests can drive it.
class FakeSocket {
  constructor() {
    this.sent = [];
    this.handlers = {};
    this.closed = false;
  }
  accept() {}
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  addEventListener(type, fn) {
    (this.handlers[type] ??= []).push(fn);
  }
  emit(type, event) {
    for (const fn of this.handlers[type] ?? []) fn(event);
  }
}

class FakeWebSocketPair {
  constructor() {
    this[0] = new FakeSocket();
    this[1] = new FakeSocket();
  }
}

globalThis.WebSocketPair = FakeWebSocketPair;

function makeDo() {
  return new LobbyRoom({}, {});
}

async function call(doInstance, path, { method = "GET", body, headers = {} } = {}) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await doInstance.fetch(req);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // non-JSON (e.g. the 101 upgrade) — caller inspects status instead
  }
  return { status: res.status, data, res };
}

test("health + state endpoints", async () => {
  const lobby = makeDo();
  const health = await call(lobby, "/");
  assert.equal(health.status, 200);
  assert.equal(health.data.service, "splat-lobby");
  const state = await call(lobby, "/lobby/state");
  assert.equal(state.status, 200);
  assert.deepEqual(state.data.occupants, []);
  assert.deepEqual(state.data.chat, []);
  assert.equal(state.data.limits.maxOccupants, 50);
});

test("join -> move -> chat -> state reflects everything; leave clears", async () => {
  const lobby = makeDo();
  const a = await call(lobby, "/lobby/join", { method: "POST", body: { name: "Lux", kind: "agent", character: "momo" } });
  assert.equal(a.status, 200);
  assert.ok(a.data.sessionId);
  const b = await call(lobby, "/lobby/join", { method: "POST", body: { name: "Hans", kind: "human", character: "kiko" } });
  assert.equal(b.status, 200);

  const moved = await call(lobby, "/lobby/move", { method: "POST", body: { sessionId: a.data.sessionId, x: 3, z: -4 } });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.occupant.x, 3);

  const chatted = await call(lobby, "/lobby/chat", { method: "POST", body: { sessionId: b.data.sessionId, text: "halo semua" } });
  assert.equal(chatted.status, 200);
  assert.equal(chatted.data.message.text, "halo semua");

  const state = await call(lobby, "/lobby/state");
  assert.equal(state.data.occupants.length, 2);
  assert.equal(state.data.chat.length, 1);
  assert.equal(state.data.chat[0].name, "Hans");

  const left = await call(lobby, "/lobby/leave", { method: "POST", body: { sessionId: a.data.sessionId } });
  assert.equal(left.data.left, true);
  assert.equal((await call(lobby, "/lobby/state")).data.occupants.length, 1);
});

test("bad input returns 400 JSON, unknown route 404", async () => {
  const lobby = makeDo();
  const bad = await call(lobby, "/lobby/join", { method: "POST", body: { name: "x", kind: "robot" } });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.ok, false);
  const ghost = await call(lobby, "/lobby/chat", { method: "POST", body: { sessionId: "nope", text: "hi" } });
  assert.equal(ghost.status, 400);
  const missing = await call(lobby, "/nope");
  assert.equal(missing.status, 404);
});

test("chat rate limit bites over HTTP (10/min per session)", async () => {
  const lobby = makeDo();
  const { data } = await call(lobby, "/lobby/join", { method: "POST", body: { name: "Spammer", kind: "agent" } });
  for (let i = 0; i < 10; i++) {
    const r = await call(lobby, "/lobby/chat", { method: "POST", body: { sessionId: data.sessionId, text: `m${i}` } });
    assert.equal(r.status, 200, `message ${i} should pass`);
  }
  const over = await call(lobby, "/lobby/chat", { method: "POST", body: { sessionId: data.sessionId, text: "11th" } });
  assert.equal(over.status, 400);
  assert.match(over.data.error, /rate limit/);
});

test("websocket: hello on connect, chat frame broadcasts, ping/pong", async () => {
  // Node's undici Response rejects status 101; the Workers runtime
  // accepts it (this is the documented CF upgrade pattern). Shim it
  // for this test only so the real handler code stays untouched.
  const OrigResponse = globalThis.Response;
  class Response101 extends OrigResponse {
    constructor(body, init) {
      if (init?.status === 101) {
        super(body, { ...init, status: 200 });
        this._status101 = true;
        this.webSocket = init.webSocket ?? null;
      } else {
        super(body, init);
      }
    }
    get status() {
      return this._status101 ? 101 : super.status;
    }
  }
  globalThis.Response = Response101;
  try {
    const lobby = makeDo();
    const { data } = await call(lobby, "/lobby/join", { method: "POST", body: { name: "Sock", kind: "agent" } });
    const sid = data.sessionId;

    // Grab the server-side fake socket by intercepting the pair creation.
    let serverSocket = null;
    const OrigPair = globalThis.WebSocketPair;
    globalThis.WebSocketPair = class extends OrigPair {
      constructor() {
        super();
        serverSocket = this[1];
      }
    };
    const req = new Request(`http://localhost/lobby/ws?sessionId=${sid}`, {
      headers: { upgrade: "websocket" },
    });
    const res = await lobby.fetch(req);
    globalThis.WebSocketPair = OrigPair;
    assert.equal(res.status, 101);
    assert.ok(serverSocket, "server socket was created");
    const hello = JSON.parse(serverSocket.sent[0]);
    assert.equal(hello.type, "hello");
    assert.equal(hello.sessionId, sid);

    // Drive a chat frame through the recorded message listener.
    serverSocket.emit("message", { data: JSON.stringify({ type: "chat", text: "via ws" }) });
    const state = await call(lobby, "/lobby/state");
    assert.equal(state.data.chat.length, 1);
    assert.equal(state.data.chat[0].text, "via ws");

    // Ping gets a pong back on the same socket.
    const sentBefore = serverSocket.sent.length;
    serverSocket.emit("message", { data: JSON.stringify({ type: "ping" }) });
    const pong = JSON.parse(serverSocket.sent[sentBefore]);
    assert.equal(pong.type, "pong");
  } finally {
    globalThis.Response = OrigResponse;
  }
});

test("websocket without sessionId is rejected", async () => {
  const lobby = makeDo();
  const req = new Request("http://localhost/lobby/ws", { headers: { upgrade: "websocket" } });
  const res = await lobby.fetch(req);
  assert.equal(res.status, 400);
});
