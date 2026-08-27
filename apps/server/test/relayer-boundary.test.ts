import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOutboxMetadata } from "../src/core/economy/relayer";

test("relayer outbox metadata normalizes mysql numeric strings before routing/arithmetic", () => {
  assert.deepEqual(
    normalizeOutboxMetadata({ server_id: "9", attempts: "2" }),
    { serverId: 9, attempts: 2 },
  );
  assert.deepEqual(
    normalizeOutboxMetadata({ server_id: 0, attempts: 0 }),
    { serverId: 0, attempts: 0 },
  );
});

test("relayer outbox metadata rejects malformed or overflowing durable values", () => {
  for (const row of [
    { server_id: "9junk", attempts: "0" },
    { server_id: "1", attempts: "2.5" },
    { server_id: -1, attempts: 0 },
    { server_id: 65_536, attempts: 0 },
    { server_id: 0, attempts: 65_535 },
  ]) {
    assert.throws(() => normalizeOutboxMetadata(row), /outbox\.(server_id|attempts)/);
  }
});
