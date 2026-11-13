// room.js — pure lobby-room logic (no Cloudflare imports).
// The Durable Object in lobby-do.js wraps this; the node tests in
// worker/test/ exercise it directly, so keep it runtime-free.
//
// Model (Roblox-style gathering room):
// - One room. Occupants are agents or humans, each ALWAYS one of the four
//   chibi characters (Momo / Bibo / Kiko / Pipi) with a display name shown
//   above their avatar, and an (x, y, z) position on the floor.
// - Chat is the main activity: a readable feed with sender name,
//   character, and timestamp. History keeps the last 100 messages.
// - Everything is ephemeral: presence expires after PRESENCE_TTL_MS of
//   silence, and a room restart clears it all. That is the correct model
//   for a lobby — nobody's identity lives here.
//
// Abuse guards (enforced here, not just documented):
// - max 50 occupants; names <= 32 chars; chat text <= 280 chars.
// - chat: 10 messages per session per rolling 60 s window.
// - move: 120 updates per session per rolling 60 s window.
// - character must be one of the four game characters (or omitted).

export const MAX_OCCUPANTS = 50;
export const MAX_NAME_LEN = 32;
export const MAX_CHAT_LEN = 280;
export const CHAT_HISTORY = 100; // chat is the main activity — keep a readable history
export const CHAT_PER_MIN = 10;
export const MOVE_PER_MIN = 120;
export const PRESENCE_TTL_MS = 90_000;
export const CHARACTERS = ["momo", "bibo", "kiko", "pipi"];

// Lobby floor coordinates. The game arena is about this size; the lobby
// is a flat gathering floor, y is always 0 for now.
export const BOUNDS = { xMin: -30, xMax: 30, zMin: -30, zMax: 30 };

const WINDOW_MS = 60_000;

function bad(message) {
  const err = new Error(message);
  err.code = "bad_request";
  return err;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function pruneWindow(stamps, now) {
  while (stamps.length && stamps[0] <= now - WINDOW_MS) stamps.shift();
  return stamps;
}

export function createRoom(opts = {}) {
  const now = opts.clock ?? (() => Date.now());
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const occupants = new Map(); // sessionId -> occupant
  const chat = []; // { id, sessionId, name, kind, character, text, ts }
  const chatStamps = new Map(); // sessionId -> [ts...]
  const moveStamps = new Map(); // sessionId -> [ts...]
  let nextCharacter = 0; // round-robin so a join without a character still gets a visible chibi

  function touch(occ) {
    occ.lastSeenAt = now();
  }

  function pruneStale() {
    const t = now();
    for (const [id, occ] of occupants) {
      if (t - occ.lastSeenAt > PRESENCE_TTL_MS) {
        occupants.delete(id);
        chatStamps.delete(id);
        moveStamps.delete(id);
      }
    }
  }

  function publicOccupant(occ) {
    return {
      id: occ.id,
      name: occ.name,
      kind: occ.kind,
      character: occ.character,
      x: occ.x,
      y: occ.y,
      z: occ.z,
      joinedAt: occ.joinedAt,
    };
  }

  return {
    join({ name, kind, character } = {}) {
      pruneStale();
      if (typeof name !== "string" || !name.trim()) throw bad("name is required");
      const cleanName = name.trim().slice(0, MAX_NAME_LEN);
      if (name.trim().length > MAX_NAME_LEN) throw bad(`name is too long (max ${MAX_NAME_LEN} chars)`);
      if (kind !== "agent" && kind !== "human") throw bad('kind must be "agent" or "human"');
      if (character !== undefined && character !== null && !CHARACTERS.includes(character)) {
        throw bad(`character must be one of: ${CHARACTERS.join(", ")}`);
      }
      // Roblox model: nobody is invisible. A join without a character is
      // assigned one round-robin so every occupant renders as a chibi.
      const picked = character ?? CHARACTERS[nextCharacter++ % CHARACTERS.length];
      if (occupants.size >= MAX_OCCUPANTS) throw bad(`room is full (max ${MAX_OCCUPANTS})`);
      const id = newId();
      const occ = {
        id,
        name: cleanName,
        kind,
        character: picked,
        x: 0,
        y: 0,
        z: 0,
        joinedAt: now(),
        lastSeenAt: now(),
      };
      occupants.set(id, occ);
      return { sessionId: id, occupant: publicOccupant(occ), occupants: occupants.size };
    },

    leave(sessionId) {
      const ok = occupants.delete(sessionId);
      chatStamps.delete(sessionId);
      moveStamps.delete(sessionId);
      return ok;
    },

    heartbeat(sessionId) {
      const occ = occupants.get(sessionId);
      if (!occ) throw bad("unknown session");
      touch(occ);
      return true;
    },

    move(sessionId, { x, y, z } = {}) {
      const occ = occupants.get(sessionId);
      if (!occ) throw bad("unknown session");
      if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) {
        throw bad("move needs numeric x and z");
      }
      const stamps = pruneWindow(moveStamps.get(sessionId) ?? [], now());
      if (stamps.length >= MOVE_PER_MIN) throw bad(`move rate limit (${MOVE_PER_MIN}/min)`);
      stamps.push(now());
      moveStamps.set(sessionId, stamps);
      occ.x = clamp(x, BOUNDS.xMin, BOUNDS.xMax);
      occ.z = clamp(z, BOUNDS.zMin, BOUNDS.zMax);
      occ.y = typeof y === "number" && Number.isFinite(y) ? clamp(y, 0, 10) : 0;
      touch(occ);
      return publicOccupant(occ);
    },

    chat(sessionId, text) {
      const occ = occupants.get(sessionId);
      if (!occ) throw bad("unknown session");
      if (typeof text !== "string" || !text.trim()) throw bad("text is required");
      if (text.trim().length > MAX_CHAT_LEN) throw bad(`text is too long (max ${MAX_CHAT_LEN} chars)`);
      const stamps = pruneWindow(chatStamps.get(sessionId) ?? [], now());
      if (stamps.length >= CHAT_PER_MIN) throw bad(`chat rate limit (${CHAT_PER_MIN}/min)`);
      stamps.push(now());
      chatStamps.set(sessionId, stamps);
      const msg = {
        id: newId(),
        sessionId,
        name: occ.name,
        kind: occ.kind,
        character: occ.character,
        text: text.trim(),
        ts: now(),
      };
      chat.push(msg);
      while (chat.length > CHAT_HISTORY) chat.shift();
      touch(occ);
      return msg;
    },

    state() {
      pruneStale();
      return {
        occupants: [...occupants.values()].map(publicOccupant),
        chat: [...chat],
        limits: {
          maxOccupants: MAX_OCCUPANTS,
          chatHistory: CHAT_HISTORY,
          chatPerMin: CHAT_PER_MIN,
          movePerMin: MOVE_PER_MIN,
          presenceTtlSec: PRESENCE_TTL_MS / 1000,
          bounds: BOUNDS,
        },
        ts: now(),
      };
    },

    // Test/debug helpers (not exposed over HTTP).
    _size() {
      return occupants.size;
    },
  };
}
