import assert from "node:assert/strict";
import { test } from "node:test";
import { BusyError, ColdUserError } from "../src/core/errors";
import { _outboxTrimTestHooks } from "../src/core/economy/outbox";

test("trimApplied reports two lost attempts as BUSY instead of cold", async () => {
  let attempts = 0;
  await assert.rejects(
    _outboxTrimTestHooks.runTrimAppliedRetries("trim-lost", 7, async () => {
      attempts++;
      return { outcome: "lost", removed: 0 };
    }),
    (error: unknown) => error instanceof BusyError
      && !(error instanceof ColdUserError)
      && error.message === "trimApplied lost lock uid=trim-lost sId=7",
  );
  assert.equal(attempts, 2);
});

test("trimApplied keeps two cold attempts on the cold-user path", async () => {
  let attempts = 0;
  await assert.rejects(
    _outboxTrimTestHooks.runTrimAppliedRetries("trim-cold", 8, async () => {
      attempts++;
      return { outcome: "cold", removed: 0 };
    }),
    (error: unknown) => error instanceof ColdUserError
      && error.message === "trimApplied remained cold uid=trim-cold sId=8",
  );
  assert.equal(attempts, 2);
});

test("trimApplied accumulates chunks removed before a lost retry", async () => {
  const attempts = [
    { outcome: "lost" as const, removed: 500 },
    { outcome: "done" as const, removed: 3 },
  ];
  assert.equal(
    await _outboxTrimTestHooks.runTrimAppliedRetries(
      "trim-partial",
      9,
      async () => attempts.shift() ?? assert.fail("unexpected third trim attempt"),
    ),
    503,
  );
  assert.equal(attempts.length, 0);
});
