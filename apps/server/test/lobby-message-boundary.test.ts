import assert from "node:assert/strict";
import { test } from "node:test";
import { LOBBY_MSG_RPC } from "@game/shared";
import { LobbyRoom } from "../src/websocket/LobbyRoom";

type MessageHandler = (client: unknown, raw: unknown) => void;

function roomAndHandler(): { room: LobbyRoom; handler: MessageHandler } {
  const room = new LobbyRoom();
  // The base Room constructor starts its clock; this unit test invokes the
  // message boundary directly and must not leave a timer behind.
  room.clock.stop();
  return {
    room,
    handler: (room.messages as Record<string, MessageHandler>)[LOBBY_MSG_RPC],
  };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("Lobby RPC malformed envelopes produce a legal correlated error reply", async () => {
  const { room, handler } = roomAndHandler();
  const sent: unknown[] = [];
  const client = {
    sessionId: "s1",
    auth: undefined,
    send: (_type: string, payload: unknown) => { sent.push(payload); },
  };
  try {
    handler(client, { id: "req-1", type: "user.getInfo", extra: true });
    await nextTurn();
    assert.deepEqual(sent, [{
      id: "req-1",
      ok: false,
      err: { code: "INVALID_PAYLOAD", msg: "WIRE_KEYS at rpc" },
    }]);
  } finally {
    room.clock.stop();
  }
});

test("Lobby RPC async failures and closing sockets are observed without unhandled rejection", async () => {
  const { room, handler } = roomAndHandler();
  const sent: unknown[] = [];
  const client = {
    sessionId: "s2",
    get auth(): never { throw new Error("auth getter failed"); },
    send: (_type: string, payload: unknown) => { sent.push(payload); },
  };
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  try {
    handler(client, { id: "req-2", type: "user.getInfo", payload: {} });
    await nextTurn();
    assert.deepEqual(sent, [{
      id: "req-2",
      ok: false,
      err: { code: "INTERNAL", msg: "" },
    }]);

    const closingClient = {
      sessionId: "s3",
      auth: undefined,
      send: () => { throw new Error("socket already closed"); },
    };
    handler(closingClient, { id: "req-3", type: "user.getInfo", extra: true });
    await nextTurn();
    assert.deepEqual(rejections, []);
  } finally {
    process.off("unhandledRejection", onRejection);
    room.clock.stop();
  }
});
