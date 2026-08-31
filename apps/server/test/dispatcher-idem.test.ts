/**
 * 幂等 v2 dispatcher 状态机单测（Non-intrusive §6.11/§6.12/§6.13，纯内存 fake store）。
 *
 * MemoryIdem 逐字复刻三条 Lua（core/idem.ts）的判定语义——record + hash/leaseId/
 * contractVersion CAS + per-uid 计数；对 Lua 本体的原子性/TTL 断言在 test/int/core.test.ts。
 * 覆盖（§9 阶段 4 退出条件）：同 ID 同 payload 并发互斥与缓存重放；同 ID 异 payload 稳定
 * OPERATION_CONFLICT；done-oversize 既不重跑也不 unknown；per-uid 上限 BUSY；
 * version-mismatch fail-closed 两态；corrupt fail-closed；旧 lease 不能 complete/release
 * 新 lease；complete lost 打孤儿指标；缓存重校验失败 INTERNAL 且记录保留；
 * RpcFault 白名单与敌意对象；inspect 全分支（含授权拒绝与收据优先级演示）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { HANDLER_TIMEOUT_MS } from "../src/core/infra/config";
import { kIdemUser } from "../src/core/infra/keys";
import { RpcFault, toRpcFaultCode } from "../src/core/errors";
import { idemPayloadHash } from "../src/core/idem";
import type { IdemAcquire, IdemCompleteResult } from "../src/core/idem";
import { UserRpc, WireValidationError } from "@game/shared";
import {
  _dispatcherTestHooks,
  type DispatcherTimerApi,
  type InspectDeps,
} from "../src/websocket/dispatcher";

// ── fake store：逐字复刻 Lua 判定语义（去掉任何一条比对，本文件对应用例必红） ──

interface MemoryRecord {
  v: number;
  state: "pending" | "done" | "done-oversize";
  hash: string;
  leaseId?: string;
  resultJson?: string;
  contractVersion: number;
}

class MemoryIdem {
  readonly records = new Map<string, MemoryRecord>();
  readonly counters = new Map<string, number>();
  constructor(
    readonly maxPending = 8,
    readonly maxResultBytes = 32_768,
  ) {}

  acquire(key: string, counterKey: string, args: { hash: string; leaseId: string; contractVersion: number }): IdemAcquire {
    const cur = this.records.get(key);
    if (!cur) {
      const count = this.counters.get(counterKey) ?? 0;
      if (count >= this.maxPending) { return { kind: "busy" }; }
      this.records.set(key, { v: 2, state: "pending", hash: args.hash, leaseId: args.leaseId, contractVersion: args.contractVersion });
      this.counters.set(counterKey, count + 1);
      return { kind: "acquired" };
    }
    if (cur.v !== 2) { return { kind: "corrupt" }; }
    if (cur.state === "pending") {
      // 版本比对先于 hash（§6.11：contractVersion 不进 preimage，升级期异 hash 报 conflict 比 fail-closed 更糟）
      if (cur.contractVersion !== args.contractVersion) { return { kind: "version-mismatch", state: "pending" }; }
      if (cur.hash !== args.hash) { return { kind: "conflict" }; }
      return { kind: "in-progress" };
    }
    if (cur.state === "done" || cur.state === "done-oversize") {
      if (cur.contractVersion !== args.contractVersion) { return { kind: "version-mismatch", state: "done" }; }
      if (cur.hash !== args.hash) { return { kind: "conflict" }; }
      if (cur.state === "done-oversize") { return { kind: "done-oversize" }; }
      if (typeof cur.resultJson !== "string") { return { kind: "corrupt" }; }
      return { kind: "done", result: cur.resultJson };
    }
    return { kind: "corrupt" };
  }

  complete(key: string, counterKey: string, leaseId: string, resultJson: string): IdemCompleteResult {
    const cur = this.records.get(key);
    if (!cur || cur.v !== 2 || cur.state !== "pending" || cur.leaseId !== leaseId) { return "lost"; }
    const oversize = Buffer.byteLength(resultJson, "utf8") > this.maxResultBytes;
    this.records.set(key, oversize
      ? { v: 2, state: "done-oversize", hash: cur.hash, contractVersion: cur.contractVersion }
      : { v: 2, state: "done", hash: cur.hash, resultJson, contractVersion: cur.contractVersion });
    this.counters.set(counterKey, Math.max(0, (this.counters.get(counterKey) ?? 0) - 1));
    return oversize ? "ok-oversize" : "ok";
  }

  release(key: string, counterKey: string, leaseId: string): void {
    const cur = this.records.get(key);
    if (!cur || cur.v !== 2 || cur.state !== "pending" || cur.leaseId !== leaseId) { return; }
    this.records.delete(key);
    this.counters.set(counterKey, Math.max(0, (this.counters.get(counterKey) ?? 0) - 1));
  }

  storeFor(key: string, counterKey: string, args: { hash: string; leaseId: string; contractVersion: number }) {
    return {
      acquire: async (): Promise<IdemAcquire> => this.acquire(key, counterKey, args),
      complete: async (resultJson: string): Promise<IdemCompleteResult> => this.complete(key, counterKey, args.leaseId, resultJson),
      release: async (): Promise<void> => { this.release(key, counterKey, args.leaseId); },
    };
  }
}

let leaseSeq = 0;
const nextLease = (): string => `lease-${leaseSeq++}`;
const KEY = "idem:user.updateProfile:{u1}:c1";
const COUNTER = "idem:pending:{u1}";
const HASH_A = idemPayloadHash(UserRpc.UpdateProfile, { clientReqId: "c1", nickname: "a" });
const HASH_B = idemPayloadHash(UserRpc.UpdateProfile, { clientReqId: "c1", nickname: "b" });

const run = _dispatcherTestHooks.runValidatedIdem;
const codeOf = _dispatcherTestHooks.rpcErrorCode;

function captureWarns(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]): void => { logs.push(args.map(String).join(" ")); };
  return { logs, restore: () => { console.warn = original; } };
}

// ── 同 ID 同 payload：并发互斥 + 缓存命中重放 ────────────────────────────────

test("同 ID 同 payload：并发第二发 IN_PROGRESS；done 后缓存重放不重执行", async () => {
  const mem = new MemoryIdem();
  let handlerCalls = 0;
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const first = run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
    handlerCalls++;
    await gate;
    return { ok: true };
  });
  await Promise.resolve(); // 让第一发先占到 pending
  await assert.rejects(
    run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
      handlerCalls++;
      return { ok: true };
    }),
    (error: unknown) => codeOf(error) === "IN_PROGRESS",
  );
  releaseFirst();
  assert.deepEqual(await first, { ok: true });
  assert.equal(handlerCalls, 1, "并发双发只允许首发执行");

  const replay = await run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
    handlerCalls++;
    return { ok: false };
  });
  assert.deepEqual(replay, { ok: true }, "done 命中必须重放首个结果");
  assert.equal(handlerCalls, 1, "缓存命中不得重执行 handler");
  assert.equal(mem.counters.get(COUNTER), 0, "complete 后 pending 计数归零");
});

// ── 同 ID 异 payload → OPERATION_CONFLICT（本阶段唯一有意的对外行为收紧） ────

test("同 ID 异 payload：pending 与 done 两态都稳定 OPERATION_CONFLICT（去 hash 比对即红）", async () => {
  const mem = new MemoryIdem();
  // done 态冲突
  await run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => ({ ok: true }));
  let handlerCalls = 0;
  await assert.rejects(
    run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_B, leaseId: nextLease(), contractVersion: 1 }), async () => {
      handlerCalls++;
      return { ok: true };
    }),
    (error: unknown) => {
      assert.equal(codeOf(error), "OPERATION_CONFLICT");
      return true;
    },
  );
  assert.equal(handlerCalls, 0, "冲突既不重放也不重执行");
  assert.equal(mem.records.get(KEY)?.state, "done", "冲突不得破坏既有记录");

  // pending 态冲突
  const mem2 = new MemoryIdem();
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => { unblock = resolve; });
  const first = run(UserRpc.UpdateProfile, mem2.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
    await gate;
    return { ok: true };
  });
  await Promise.resolve();
  await assert.rejects(
    run(UserRpc.UpdateProfile, mem2.storeFor(KEY, COUNTER, { hash: HASH_B, leaseId: nextLease(), contractVersion: 1 }), async () => ({ ok: true })),
    (error: unknown) => codeOf(error) === "OPERATION_CONFLICT",
  );
  unblock();
  await first;
});

// ── done-oversize：既不重跑 handler 也不归 unknown ──────────────────────────

test("done-oversize 墓碑：重放 OPERATION_RESULT_EXPIRED，⛔ 不重跑 handler、不当作未执行", async () => {
  const mem = new MemoryIdem(8, 8); // 8 字节上限逼出墓碑
  const warns = captureWarns();
  try {
    const first = await run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => ({ ok: true }));
    assert.deepEqual(first, { ok: true }, "首发调用方仍拿到真实结果（handler 确实成功）");
    assert.equal(mem.records.get(KEY)?.state, "done-oversize");
    assert.ok(warns.logs.some((line) => line.includes("[idem-result-oversize]")), "超限必须计指标");
  } finally {
    warns.restore();
  }
  let handlerCalls = 0;
  await assert.rejects(
    run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
      handlerCalls++;
      return { ok: true };
    }),
    (error: unknown) => {
      // 变异守卫：墓碑若被归成 unknown/未执行，这里会重跑 handler 而不是抛 RESULT_EXPIRED
      assert.equal(codeOf(error), "OPERATION_RESULT_EXPIRED");
      return true;
    },
  );
  assert.equal(handlerCalls, 0, "墓碑既不重跑 handler 也不伪装 unknown");
});

// ── per-uid pending 上限 → BUSY ──────────────────────────────────────────────

test("per-uid pending 上限：超限 acquire 返回 BUSY；释放一个后恢复", async () => {
  const mem = new MemoryIdem(2);
  const gates: (() => void)[] = [];
  const running = [0, 1].map((i) =>
    run(UserRpc.UpdateProfile, mem.storeFor(`${KEY}:${i}`, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
      await new Promise<void>((resolve) => { gates.push(resolve); });
      return { ok: true };
    }));
  await Promise.resolve();
  assert.equal(mem.counters.get(COUNTER), 2);
  await assert.rejects(
    run(UserRpc.UpdateProfile, mem.storeFor(`${KEY}:2`, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => ({ ok: true })),
    (error: unknown) => codeOf(error) === "BUSY",
  );
  gates.forEach((release) => release());
  await Promise.all(running);
  assert.equal(mem.counters.get(COUNTER), 0);
  const after = await run(UserRpc.UpdateProfile, mem.storeFor(`${KEY}:2`, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => ({ ok: true }));
  assert.deepEqual(after, { ok: true }, "计数随 complete 回落后立即可再获取");
});

// ── contractVersion fail-closed 两态 ─────────────────────────────────────────

test("version-mismatch fail-closed：pending 态 IN_PROGRESS、done 态 OPERATION_RESULT_EXPIRED，都不重放不重跑", async () => {
  const mem = new MemoryIdem();
  mem.records.set(KEY, { v: 2, state: "pending", hash: HASH_A, leaseId: "old", contractVersion: 1 });
  let handlerCalls = 0;
  const attempt = (hash: string) =>
    run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash, leaseId: nextLease(), contractVersion: 2 }), async () => {
      handlerCalls++;
      return { ok: true };
    });
  await assert.rejects(attempt(HASH_A), (error: unknown) => codeOf(error) === "IN_PROGRESS");
  // 版本比对必须先于 hash 比对：升级期 validator 重规范化导致的异 hash ⛔ 不得误报 conflict
  await assert.rejects(attempt(HASH_B), (error: unknown) => codeOf(error) === "IN_PROGRESS");

  mem.records.set(KEY, { v: 2, state: "done", hash: HASH_A, resultJson: '{"ok":true}', contractVersion: 1 });
  await assert.rejects(attempt(HASH_A), (error: unknown) => codeOf(error) === "OPERATION_RESULT_EXPIRED");
  assert.equal(handlerCalls, 0, "fail-closed：不重放也不重新执行");
  assert.equal(mem.records.get(KEY)?.state, "done", "记录保留在剩余 TTL 内");
});

// ── corrupt fail-closed ──────────────────────────────────────────────────────

test("corrupt/未知版本记录：INTERNAL，⛔ 不当作未执行、不重跑、不删记录", async () => {
  const mem = new MemoryIdem();
  mem.records.set(KEY, { v: 1, state: "pending", hash: HASH_A, contractVersion: 1 }); // 未知版本
  let handlerCalls = 0;
  await assert.rejects(
    run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
      handlerCalls++;
      return { ok: true };
    }),
    (error: unknown) => {
      assert.equal((error as Error).name, "RpcResponseContractError");
      assert.equal(codeOf(error), "INTERNAL");
      return true;
    },
  );
  assert.equal(handlerCalls, 0);
  assert.ok(mem.records.has(KEY), "corrupt 记录不是我们的 pending，⛔ 不得删除");
});

// ── 旧 lease 不能 complete/release 新 lease ──────────────────────────────────

test("旧 lease 不能覆盖新 lease 的完成结果，也不能删除后来者的 pending", () => {
  const mem = new MemoryIdem();
  assert.equal(mem.acquire(KEY, COUNTER, { hash: HASH_A, leaseId: "L-old", contractVersion: 1 }).kind, "acquired");
  // 模拟 pending 过期后被新请求抢占（int 侧有真 TTL 版本）
  mem.records.delete(KEY);
  mem.counters.set(COUNTER, 0);
  assert.equal(mem.acquire(KEY, COUNTER, { hash: HASH_A, leaseId: "L-new", contractVersion: 1 }).kind, "acquired");

  assert.equal(mem.complete(KEY, COUNTER, "L-old", '{"ok":false}'), "lost", "旧 handler 只能放弃");
  assert.equal(mem.records.get(KEY)?.state, "pending", "旧 lease 不得把新 pending 提升为 done");
  mem.release(KEY, COUNTER, "L-old");
  assert.ok(mem.records.has(KEY), "旧 lease 不得删除后来者的 pending");

  assert.equal(mem.complete(KEY, COUNTER, "L-new", '{"ok":true}'), "ok", "新持有者正常完成");
  const done = mem.records.get(KEY);
  assert.equal(done?.state, "done");
  assert.equal(done?.resultJson, '{"ok":true}');
  assert.equal(mem.complete(KEY, COUNTER, "L-old", '{"ok":false}'), "lost", "done 之后旧 lease 仍不能覆盖");
});

// ── complete lost：孤儿 lease 指标 + 结果仍归本次调用方 ──────────────────────

test("complete 返回 lost：结果仍回给本次调用方、不 release、打 [idem-orphan-lease] 指标", async () => {
  let releases = 0;
  const store = {
    acquire: async (): Promise<IdemAcquire> => ({ kind: "acquired" }),
    complete: async (): Promise<IdemCompleteResult> => "lost",
    release: async (): Promise<void> => { releases++; },
  };
  const warns = captureWarns();
  const before = _dispatcherTestHooks.idemMetricCounters.orphanLease;
  try {
    const result = await run(UserRpc.UpdateProfile, store, async () => ({ ok: true }));
    assert.deepEqual(result, { ok: true }, "本次调用确实执行成功，结果必须返回");
    assert.ok(warns.logs.some((line) => line.includes("[idem-orphan-lease]")));
    assert.equal(_dispatcherTestHooks.idemMetricCounters.orphanLease, before + 1);
  } finally {
    warns.restore();
  }
  assert.equal(releases, 0, "lost 后 pending 归新持有者或归 TTL，⛔ 不归旧 handler");
});

// ── 响应契约：malformed handler 响应释放占位；malformed done 缓存保留记录 ────

test("idem 只缓存契约合法响应；malformed 尝试释放自己的占位后可重试", async () => {
  const mem = new MemoryIdem();
  let handlerCalls = 0;
  await assert.rejects(
    run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
      handlerCalls++;
      return { ok: true, extra: "must not be cached" };
    }),
    (error: unknown) => {
      assert.equal((error as Error).name, "RpcResponseContractError");
      assert.equal(codeOf(error), "INTERNAL");
      assert.doesNotMatch((error as Error).message, /must not be cached/u);
      return true;
    },
  );
  assert.equal(mem.records.has(KEY), false, "malformed 响应不得成为 done 记录，且必须释放自己的 pending");
  assert.equal(mem.counters.get(COUNTER), 0);

  const retry = await run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
    handlerCalls++;
    return { ok: true };
  });
  assert.deepEqual(retry, { ok: true });
  assert.equal(handlerCalls, 2);
});

test("done 缓存重校验失败：INTERNAL、不重跑 handler、记录保留（刻意 fail-closed）", async () => {
  const mem = new MemoryIdem();
  mem.records.set(KEY, { v: 2, state: "done", hash: HASH_A, resultJson: '{"ok":true,"secret":"must not escape"}', contractVersion: 1 });
  let handlerCalls = 0;
  const attempt = () =>
    run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
      handlerCalls++;
      return { ok: true };
    });
  await assert.rejects(attempt(), (error: unknown) => {
    assert.equal((error as Error).name, "RpcResponseContractError");
    assert.equal(codeOf(error), "INTERNAL");
    assert.doesNotMatch((error as Error).message, /secret|must not escape/u);
    return true;
  });
  assert.equal(handlerCalls, 0, "corrupt done 不得重跑 handler");
  assert.equal(mem.records.get(KEY)?.state, "done", "该 clientReqId 在剩余 TTL 内不可用——⛔ 不降级为「当作未执行」");

  mem.records.set(KEY, { v: 2, state: "done", hash: HASH_A, resultJson: "not-json", contractVersion: 1 });
  await assert.rejects(attempt(), (error: unknown) => codeOf(error) === "INTERNAL");
  assert.equal(handlerCalls, 0);
});

test("入站 wire 错误仍是 INVALID_PAYLOAD；handler 内 wire 异常包装为 INTERNAL", async () => {
  assert.equal(codeOf(new WireValidationError("WIRE_KEYS", "rpc")), "INVALID_PAYLOAD");
  const mem = new MemoryIdem();
  await assert.rejects(
    run(UserRpc.UpdateProfile, mem.storeFor(KEY, COUNTER, { hash: HASH_A, leaseId: nextLease(), contractVersion: 1 }), async () => {
      throw new WireValidationError("WIRE_KEYS", "response");
    }),
    (error: unknown) => {
      assert.equal((error as Error).name, "RpcResponseContractError");
      assert.equal(codeOf(error), "INTERNAL");
      return true;
    },
  );
});

// ── RpcFault：白名单与敌意对象 ───────────────────────────────────────────────

test("RpcFault：构造期白名单校验；两读取点语义（dispatcher.rpcErrorCode）", () => {
  const fault = new RpcFault("OPERATION_CONFLICT", "同一 clientReqId 携带了不同 payload");
  assert.equal(fault.name, "RpcFault");
  assert.equal(codeOf(fault), "OPERATION_CONFLICT");
  assert.equal(toRpcFaultCode(fault), "OPERATION_CONFLICT");
  assert.equal(codeOf(new RpcFault("OPERATION_RESULT_EXPIRED")), "OPERATION_RESULT_EXPIRED");
  assert.equal(codeOf(new RpcFault("STALE_FENCE")), "STALE_FENCE", "既有码走 RpcFault 同样合法");

  // 非法码构造期即 TypeError fail-fast
  assert.throws(() => new RpcFault("NOT_A_CODE" as never), TypeError);
  assert.throws(() => new RpcFault(undefined as never), TypeError);
});

test("RpcFault 敌意/伪造对象：一律 INTERNAL，⛔ 不信任裸 .rpcCode", () => {
  // 普通对象伪造 rpcCode：不是受控异常身份 → INTERNAL
  assert.equal(codeOf({ rpcCode: "OPERATION_CONFLICT" }), "INTERNAL");
  assert.equal(codeOf(Object.assign(new Error("x"), { rpcCode: "OPERATION_CONFLICT" })), "INTERNAL");

  // 原型伪造 + 越白名单值：instanceof 过但值不在白名单 → INTERNAL
  const forged = Object.create(RpcFault.prototype) as { rpcCode?: unknown };
  forged.rpcCode = "DROP TABLE";
  assert.equal(codeOf(forged), "INTERNAL");

  // 原型伪造 + hostile getter：读取抛异常必须被吞掉 → INTERNAL
  const hostile = Object.create(RpcFault.prototype) as object;
  Object.defineProperty(hostile, "rpcCode", { get() { throw new Error("hostile getter"); } });
  assert.equal(codeOf(hostile), "INTERNAL");

  // hostile Proxy：getPrototypeOf/属性读取全抛 → INTERNAL（toErrCode 同款防御）
  const proxy = new Proxy({}, {
    getPrototypeOf() { throw new Error("hostile proto"); },
    get() { throw new Error("hostile get"); },
  });
  assert.equal(codeOf(proxy), "INTERNAL");
});

// ── §6.13 inspect 全分支（fake read + 注入表） ───────────────────────────────

const INSPECT_UID = "u1";
const inspectKey = (clientReqId: string): string => kIdemUser(UserRpc.UpdateProfile, INSPECT_UID, clientReqId);

function inspectDeps(backing: Map<string, string>, versions: Record<string, number> = { [UserRpc.UpdateProfile]: 1 }): InspectDeps {
  return {
    read: async (key) => backing.get(key) ?? null,
    tables: {
      groups: { [UserRpc.UpdateProfile]: "profileOps" },
      inspectable: [UserRpc.UpdateProfile],
      versions,
    },
  };
}

const inspect = (deps: InspectDeps, clientReqId: string) =>
  _dispatcherTestHooks.inspectOperationWith(deps, INSPECT_UID, "profileOps", UserRpc.UpdateProfile, clientReqId);

test("inspect：unknown / pending / done（重过 response validator）三分支", async () => {
  const backing = new Map<string, string>();
  const deps = inspectDeps(backing);
  assert.deepEqual(await inspect(deps, "missing"), { kind: "unknown" });

  backing.set(inspectKey("p1"), JSON.stringify({ v: 2, state: "pending", hash: "h", leaseId: "L", contractVersion: 1 }));
  assert.deepEqual(await inspect(deps, "p1"), { kind: "pending" });

  backing.set(inspectKey("d1"), JSON.stringify({ v: 2, state: "done", hash: "h", resultJson: '{"ok":true}', contractVersion: 1 }));
  assert.deepEqual(await inspect(deps, "d1"), { kind: "done", data: { ok: true } });
});

test("inspect：done-oversize → result-expired（变异守卫：归 unknown 即红）", async () => {
  const backing = new Map<string, string>();
  backing.set(inspectKey("o1"), JSON.stringify({ v: 2, state: "done-oversize", hash: "h", contractVersion: 1 }));
  const result = await inspect(inspectDeps(backing), "o1");
  assert.equal(result.kind, "result-expired", "「确定执行过、结果不可得」⛔ 不得归类为「无法确定是否执行过」");
  assert.notEqual(result.kind, "unknown" as string);
});

test("inspect：版本不匹配 fail-closed（pending→pending、done→result-expired）", async () => {
  const backing = new Map<string, string>();
  backing.set(inspectKey("p1"), JSON.stringify({ v: 2, state: "pending", hash: "h", leaseId: "L", contractVersion: 1 }));
  backing.set(inspectKey("d1"), JSON.stringify({ v: 2, state: "done", hash: "h", resultJson: '{"ok":true}', contractVersion: 1 }));
  const deps = inspectDeps(backing, { [UserRpc.UpdateProfile]: 2 });
  assert.deepEqual(await inspect(deps, "p1"), { kind: "pending" });
  assert.deepEqual(await inspect(deps, "d1"), { kind: "result-expired" }, "⛔ 不重放旧契约版本的缓存");
});

test("inspect：腐坏记录/非法缓存体 throw INTERNAL，⛔ 不伪装 unknown", async () => {
  const backing = new Map<string, string>();
  const deps = inspectDeps(backing);
  for (const [id, raw] of [
    ["c1", "not-json"],
    ["c2", JSON.stringify({ v: 1, state: "pending" })],
    ["c3", JSON.stringify({ v: 2, state: "???", hash: "h", contractVersion: 1 })],
    ["c4", JSON.stringify({ v: 2, state: "done", hash: "h", resultJson: "not-json", contractVersion: 1 })],
    ["c5", JSON.stringify({ v: 2, state: "done", hash: "h", resultJson: '{"ok":true,"extra":1}', contractVersion: 1 })],
  ] as const) {
    backing.set(inspectKey(id), raw);
    await assert.rejects(inspect(deps, id), (error: unknown) => {
      assert.equal((error as Error).name, "RpcResponseContractError", `记录 ${id} 必须 fail-closed`);
      assert.equal(codeOf(error), "INTERNAL");
      return true;
    });
  }
});

test("inspect 授权：目标路由不在声明组 / 不可查 / clientReqId 非法 一律拒绝", async () => {
  const backing = new Map<string, string>();
  const deps = inspectDeps(backing);
  // 目标路由无 operationGroup 声明（shop.purchase 不在注入表）
  await assert.rejects(
    _dispatcherTestHooks.inspectOperationWith(deps, INSPECT_UID, "profileOps", "shop.purchase", "c1"),
    (error: unknown) => codeOf(error) === "INVALID_PAYLOAD",
  );
  // 声明组不匹配（能力绑定的组是别人的）
  await assert.rejects(
    _dispatcherTestHooks.inspectOperationWith(deps, INSPECT_UID, "otherGroup", UserRpc.UpdateProfile, "c1"),
    (error: unknown) => codeOf(error) === "INVALID_PAYLOAD",
  );
  // 组匹配但路由未声明 inspectable
  const notInspectable: InspectDeps = {
    read: deps.read,
    tables: { groups: deps.tables.groups, inspectable: [], versions: { [UserRpc.UpdateProfile]: 1 } },
  };
  await assert.rejects(
    _dispatcherTestHooks.inspectOperationWith(notInspectable, INSPECT_UID, "profileOps", UserRpc.UpdateProfile, "c1"),
    (error: unknown) => codeOf(error) === "INVALID_PAYLOAD",
  );
  // clientReqId 越界
  await assert.rejects(inspect(deps, ""), (error: unknown) => codeOf(error) === "INVALID_PAYLOAD");
  await assert.rejects(inspect(deps, "x".repeat(65)), (error: unknown) => codeOf(error) === "INVALID_PAYLOAD");
});

test("inspect 领域适配顺序演示：收据 → generic done → pending → 复读收据 → unknown（双 miss 关闭）", async () => {
  // §6.13：领域查询路由应先查 durable 收据，再查通用短期状态；查询是无锁读，
  // 返回 unknown 前必须**复读一次收据**——关闭「首读收据早于提交点、pending 又被 TTL
  // 抹掉」的双 miss 窗口。undergroundIdle 未实现，这里用收据桩演示该顺序契约。
  const backing = new Map<string, string>();
  const deps = inspectDeps(backing);
  const receipts = new Map<string, { status: string }>();
  let receiptReads = 0;
  const readReceipt = async (id: string): Promise<{ status: string } | null> => {
    receiptReads++;
    return receipts.get(id) ?? null;
  };

  const domainQuery = async (clientReqId: string): Promise<string> => {
    const receipt = await readReceipt(clientReqId);            // 1. durable 收据优先
    if (receipt) { return "applied"; }
    const gate = await inspect(deps, clientReqId);             // 2-4. 通用 transient gate
    if (gate.kind === "done") { return "applied"; }            //    合法 generic done（短窗按版本守卫）
    if (gate.kind === "result-expired") { return "OPERATION_RESULT_EXPIRED"; } // 3. tombstone
    if (gate.kind === "pending") { return "pending"; }         // 4. generic pending
    const late = await readReceipt(clientReqId);               // 5. 复读收据关双 miss 窗
    return late ? "applied" : "unknown";
  };

  // 双 miss 窗口：首读无收据、gate 已被 TTL 抹掉，但提交在两读之间落地 → 复读必须兜住
  receiptReads = 0;
  receipts.set("r1", { status: "applied" });
  assert.equal(await domainQuery("r1"), "applied");
  assert.equal(receiptReads, 1, "收据命中即返回，不再读 gate");

  backing.set(inspectKey("g1"), JSON.stringify({ v: 2, state: "done", hash: "h", resultJson: '{"ok":true}', contractVersion: 1 }));
  assert.equal(await domainQuery("g1"), "applied");
  backing.set(inspectKey("t1"), JSON.stringify({ v: 2, state: "done-oversize", hash: "h", contractVersion: 1 }));
  assert.equal(await domainQuery("t1"), "OPERATION_RESULT_EXPIRED");
  backing.set(inspectKey("p1"), JSON.stringify({ v: 2, state: "pending", hash: "h", leaseId: "L", contractVersion: 1 }));
  assert.equal(await domainQuery("p1"), "pending");

  receiptReads = 0;
  const lateCommit = "late1";
  // 模拟：首读 miss 后收据才落地——复读兜住，⛔ 不得报 unknown
  receipts.delete(lateCommit);
  const firstRead = readReceipt(lateCommit);
  await firstRead;
  receipts.set(lateCommit, { status: "applied" });
  assert.equal(await domainQuery(lateCommit), "applied", "复读收据必须关闭双 miss 窗口");

  receipts.clear();
  assert.equal(await domainQuery("nothing"), "unknown", "全部缺席才允许 unknown");
});

// ── handler deadline timer（沿 v1 用例保留） ────────────────────────────────

test("dispatcher handler deadline unrefs its timer and clears it on success", async () => {
  interface FakeHandle {
    unrefCalls: number;
    cleared: boolean;
    fire: () => void;
  }
  const handles: FakeHandle[] = [];
  const timers: DispatcherTimerApi = {
    setTimeout: (callback, delay) => {
      assert.equal(delay, HANDLER_TIMEOUT_MS);
      const handle: FakeHandle = { unrefCalls: 0, cleared: false, fire: callback };
      handles.push(handle);
      return Object.assign(handle, {
        unref: () => { handle.unrefCalls++; },
      }) as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (raw) => {
      const handle = raw as unknown as FakeHandle;
      assert.equal(handles.includes(handle), true, "必须清理 setTimeout 返回的同一句柄");
      handle.cleared = true;
    },
  };

  let resolve!: (value: string) => void;
  const pending = new Promise<string>((r) => { resolve = r; });
  const result = _dispatcherTestHooks.runWithHandlerTimeout("test", () => pending, timers);
  assert.equal(handles.length, 1);
  assert.equal(handles[0].unrefCalls, 1, "deadline timer 必须 unref");
  resolve("ok");
  assert.equal(await result, "ok");
  assert.equal(handles[0].cleared, true, "handler 成功后必须清理 deadline timer");
});

test("dispatcher handler deadline rejects on timeout and still clears its timer", async () => {
  interface FakeHandle {
    unrefCalls: number;
    cleared: boolean;
    fire: () => void;
  }
  const handles: FakeHandle[] = [];
  const timers: DispatcherTimerApi = {
    setTimeout: (callback, delay) => {
      assert.equal(delay, HANDLER_TIMEOUT_MS);
      const handle: FakeHandle = { unrefCalls: 0, cleared: false, fire: callback };
      handles.push(handle);
      return Object.assign(handle, {
        unref: () => { handle.unrefCalls++; },
      }) as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (raw) => {
      const handle = raw as unknown as FakeHandle;
      assert.equal(handles.includes(handle), true, "必须清理 setTimeout 返回的同一句柄");
      handle.cleared = true;
    },
  };
  const result = _dispatcherTestHooks.runWithHandlerTimeout("slow", () => new Promise<never>(() => {}), timers);
  assert.equal(handles.length, 1);
  handles[0].fire();
  await assert.rejects(result, /handler 超时: slow/u);
  assert.equal(handles[0].unrefCalls, 1);
  assert.equal(handles[0].cleared, true, "超时分支也必须清理 deadline timer");
});
