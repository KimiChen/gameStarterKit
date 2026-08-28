import assert from "node:assert/strict";
import { test } from "node:test";
import { UserRpc, WireValidationError } from "@game/shared";
import { _dispatcherTestHooks } from "../src/websocket/dispatcher";

test("idem only caches contract-valid responses and releases malformed attempts", async () => {
  let pending = false;
  let cached: string | null = null;
  let handlerCalls = 0;
  let releases = 0;

  const store = {
    acquire: async () => {
      if (cached !== null) return { kind: "done" as const, result: cached };
      if (pending) return { kind: "pending" as const };
      pending = true;
      return { kind: "acquired" as const };
    },
    complete: async (resultJson: string) => {
      cached = resultJson;
      pending = false;
    },
    release: async () => {
      releases++;
      pending = false;
    },
  };

  await assert.rejects(
    _dispatcherTestHooks.runValidatedIdem(UserRpc.UpdateProfile, store, async () => {
      handlerCalls++;
      return { ok: true, extra: "must not be cached" };
    }),
    (error: unknown) => {
      assert.equal((error as Error).name, "RpcResponseContractError");
      assert.equal(_dispatcherTestHooks.rpcErrorCode(error), "INTERNAL");
      assert.doesNotMatch((error as Error).message, /must not be cached/);
      return true;
    },
  );
  assert.equal(cached, null, "malformed response must not become a done entry");
  assert.equal(pending, false, "malformed response must release the caller's pending lease");
  assert.equal(releases, 1);

  const retry = await _dispatcherTestHooks.runValidatedIdem(UserRpc.UpdateProfile, store, async () => {
    handlerCalls++;
    return { ok: true };
  });
  assert.deepEqual(retry, { ok: true });
  assert.equal(cached, '{"ok":true}');

  const replay = await _dispatcherTestHooks.runValidatedIdem(UserRpc.UpdateProfile, store, async () => {
    handlerCalls++;
    return { ok: false };
  });
  assert.deepEqual(replay, { ok: true });
  assert.equal(handlerCalls, 2, "a valid done entry must replay without rerunning the handler");
});

test("inbound wire errors stay INVALID_PAYLOAD while malformed done cache is INTERNAL and opaque", async () => {
  assert.equal(
    _dispatcherTestHooks.rpcErrorCode(new WireValidationError("WIRE_KEYS", "rpc")),
    "INVALID_PAYLOAD",
  );

  let handlerCalls = 0;
  const corruptDone = {
    acquire: async () => ({
      kind: "done" as const,
      result: '{"ok":true,"secret":"must not escape"}',
    }),
    complete: async () => { throw new Error("must not complete corrupt cache"); },
    release: async () => { throw new Error("must not release a done cache"); },
  };

  await assert.rejects(
    _dispatcherTestHooks.runValidatedIdem(UserRpc.UpdateProfile, corruptDone, async () => {
      handlerCalls++;
      return { ok: true };
    }),
    (error: unknown) => {
      assert.equal((error as Error).name, "RpcResponseContractError");
      assert.equal(_dispatcherTestHooks.rpcErrorCode(error), "INTERNAL");
      assert.doesNotMatch((error as Error).message, /secret|must not escape/);
      return true;
    },
  );
  assert.equal(handlerCalls, 0, "a corrupt done entry must not rerun the handler");

  const invalidJsonDone = {
    acquire: async () => ({ kind: "done" as const, result: "not-json" }),
    complete: async () => { throw new Error("must not complete invalid JSON"); },
    release: async () => { throw new Error("must not release invalid JSON done"); },
  };
  await assert.rejects(
    _dispatcherTestHooks.runValidatedIdem(UserRpc.UpdateProfile, invalidJsonDone, async () => {
      throw new Error("must not execute after invalid JSON cache");
    }),
    (error: unknown) => {
      assert.equal((error as Error).name, "RpcResponseContractError");
      assert.equal(_dispatcherTestHooks.rpcErrorCode(error), "INTERNAL");
      assert.doesNotMatch((error as Error).message, /not-json|must not execute/);
      return true;
    },
  );

  const handlerWireFailure = {
    acquire: async () => ({ kind: "acquired" as const }),
    complete: async () => { throw new Error("must not complete handler failure"); },
    release: async () => {},
  };
  await assert.rejects(
    _dispatcherTestHooks.runValidatedIdem(UserRpc.UpdateProfile, handlerWireFailure, async () => {
      throw new WireValidationError("WIRE_KEYS", "response");
    }),
    (error: unknown) => {
      assert.equal((error as Error).name, "RpcResponseContractError");
      assert.equal(_dispatcherTestHooks.rpcErrorCode(error), "INTERNAL");
      return true;
    },
  );
});
