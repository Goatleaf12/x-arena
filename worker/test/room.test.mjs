// room.test.mjs — tests for worker/src/room.js (pure logic, no CF runtime).
// Run:  node --test test/        (from worker/)
// or:   npm test                 (from worker/)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, MAX_OCCUPANTS, MAX_NAME_LEN, MAX_CHAT_LEN } from "../src/room.js";

function harness() {
  let t = 1_000_000;
  let n = 0;
  const room = createRoom({ clock: () => t, newId: () => `s${++n}` });
  return { room, advance: (ms) => { t += ms; }, now: () => t };
}

test("join two agents: both appear in state", () => {
  const { room } = harness();
  const a = room.join({ name: "Lux", kind: "agent", character: "momo" });
  const b = room.join({ name: "Hans", kind: "human", character: "bibo" });
  assert.equal(a.sessionId, "s1");
  assert.equal(b.sessionId, "s2");
  const state = room.state();
  assert.equal(state.occupants.length, 2);
  assert.deepEqual(state.occupants.map((o) => o.name), ["Lux", "Hans"]);
  assert.equal(state.occupants[0].x, 0);
  assert.equal(state.occupants[0].character, "momo");
});

test("join without a character is assigned a chibi, round-robin", () => {
  const { room } = harness();
  const names = ["momo", "bibo", "kiko", "pipi", "momo"];
  for (const expected of names) {
    const { occupant } = room.join({ name: `a-${expected}`, kind: "agent" });
    assert.equal(occupant.character, expected);
  }
  // An explicit character still wins over the rotation.
  const { occupant } = room.join({ name: "pick", kind: "human", character: "pipi" });
  assert.equal(occupant.character, "pipi");
});

test("chat messages carry the sender's character and timestamp", () => {
  const { room } = harness();
  const { sessionId } = room.join({ name: "Chatter", kind: "agent", character: "kiko" });
  const msg = room.chat(sessionId, "hello lobby");
  assert.equal(msg.character, "kiko");
  assert.equal(msg.name, "Chatter");
  assert.equal(typeof msg.ts, "number");
});

test("join validation: name, kind, character, room cap", () => {
  const { room } = harness();
  assert.throws(() => room.join({ name: "  ", kind: "agent" }), /name is required/);
  assert.throws(() => room.join({ name: "x".repeat(MAX_NAME_LEN + 1), kind: "agent" }), /too long/);
  assert.throws(() => room.join({ name: "A", kind: "bot" }), /kind must be/);
  assert.throws(() => room.join({ name: "A", kind: "agent", character: "nope" }), /character must be/);
  for (let i = 0; i < MAX_OCCUPANTS; i++) room.join({ name: `agent-${i}`, kind: "agent" });
  assert.throws(() => room.join({ name: "one-more", kind: "agent" }), /room is full/);
});

test("move updates position, clamps to bounds, rejects unknown session", () => {
  const { room } = harness();
  const { sessionId } = room.join({ name: "Mover", kind: "agent" });
  const occ = room.move(sessionId, { x: 5, z: -7 });
  assert.equal(occ.x, 5);
  assert.equal(occ.z, -7);
  const clamped = room.move(sessionId, { x: 999, z: -999 });
  assert.equal(clamped.x, 30);
  assert.equal(clamped.z, -30);
  assert.throws(() => room.move("nope", { x: 1, z: 1 }), /unknown session/);
  assert.throws(() => room.move(sessionId, { x: "a", z: 1 }), /numeric x and z/);
});

test("move rate limit bites after 120/min", () => {
  const { room } = harness();
  const { sessionId } = room.join({ name: "Spammy", kind: "agent" });
  for (let i = 0; i < 120; i++) room.move(sessionId, { x: 0, z: 0 });
  assert.throws(() => room.move(sessionId, { x: 0, z: 0 }), /move rate limit/);
});

test("chat appears in state, length-capped, rate-limited at 10/min", () => {
  const { room } = harness();
  const { sessionId } = room.join({ name: "Chatter", kind: "agent" });
  const msg = room.chat(sessionId, "hello lobby");
  assert.equal(msg.text, "hello lobby");
  assert.equal(room.state().chat.length, 1);
  assert.throws(() => room.chat(sessionId, "x".repeat(MAX_CHAT_LEN + 1)), /too long/);
  assert.throws(() => room.chat(sessionId, "   "), /text is required/);
  for (let i = 0; i < 9; i++) room.chat(sessionId, `m${i}`);
  assert.throws(() => room.chat(sessionId, "one too many"), /chat rate limit/);
});

test("leave removes the occupant", () => {
  const { room } = harness();
  const a = room.join({ name: "A", kind: "agent" });
  room.join({ name: "B", kind: "agent" });
  assert.equal(room.leave(a.sessionId), true);
  assert.equal(room.leave(a.sessionId), false);
  assert.equal(room.state().occupants.length, 1);
  assert.throws(() => room.chat(a.sessionId, "ghost speaks"), /unknown session/);
});

test("chat history is capped at 100 messages", () => {
  const { room, advance } = harness();
  const ids = [];
  for (let i = 0; i < 105; i++) {
    const { sessionId } = room.join({ name: `s${i}`, kind: "agent" });
    ids.push(sessionId);
    room.chat(sessionId, `msg ${i}`);
    advance(61_000); // slide past the per-session chat window each time
  }
  const state = room.state();
  assert.equal(state.chat.length, 100);
  assert.equal(state.chat[0].text, "msg 5");
  assert.equal(state.chat[99].text, "msg 104");
});

test("stale presence is pruned after 90 s of silence", () => {
  const { room, advance } = harness();
  room.join({ name: "Ghost", kind: "agent" });
  const { sessionId } = room.join({ name: "Alive", kind: "human" });
  advance(91_000);
  room.heartbeat(sessionId); // only Alive stays
  const state = room.state();
  assert.deepEqual(state.occupants.map((o) => o.name), ["Alive"]);
});
