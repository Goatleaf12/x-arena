// index.js — Worker entry point. Forwards every request to the single
// "splat-lobby" Durable Object instance. No logic lives here; see
// lobby-do.js (transport) and room.js (room rules).

import { LobbyRoom } from "./lobby-do.js";

export { LobbyRoom };

export default {
  async fetch(request, env) {
    const id = env.LOBBY.idFromName("splat-lobby");
    const stub = env.LOBBY.get(id);
    return stub.fetch(request);
  },
};
