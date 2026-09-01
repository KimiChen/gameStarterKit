/**
 * PendingOperationJournal（Non-intrusive §7.2 阶段 5b）四条硬约束逐条验证：
 * write-ahead 时序（经 ports.lobbyRpc.sendIdempotent 的真实接入点）、maxEntries
 * fail-closed（⛔ 不淘汰未决条目）、重发字节等同（canonical 不动点）、uid 边界同步
 * 清空；以及 auth-invalid 清空 / final-loss 保留的生命周期分叉与 onDrop 只做状态迁移。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJsonString } from "../src/shared/index";
import {
  JournalFullError,
  PendingOperationJournal,
} from "../src/app/PendingOperationJournal";
import { FrameScheduler } from "../src/app/FrameScheduler";
import { LifecycleBus } from "../src/app/LifecycleBus";
import { createAppPorts } from "../src/app/ports";
import { WebSocketClient } from "../src/net/WebSocketClient";

function makePorts(journal: PendingOperationJournal) {
  return createAppPorts({
    navigation: {
      open: async () => { throw new Error("unused"); },
      replace: async () => { throw new Error("unused"); },
      back: () => {},
      close: () => {},
      closeGroup: () => {},
    } as never,
    journal,
    frameScheduler: new FrameScheduler(),
    lifecycleBus: new LifecycleBus(),
    enterBattle: async () => {},
    track: (unsubscribe) => unsubscribe,
  });
}

test("write-ahead：条目在 send 之前落 inflight；applied/unknown/failed 按结果结算", async () => {
  const journal = new PendingOperationJournal();
  const ports = makePorts(journal);
  const socket = WebSocketClient.inst as unknown as Record<string, any>;
  const originalRpcIdem = socket.rpcIdem;
  const observedAtSend: Array<{ id: string; state: string | undefined; route: string | undefined }> = [];
  try {
    let behavior: "ok" | "conn" | "reject" = "ok";
    socket.rpcIdem = async (_type: string, _payload: unknown, clientReqId: string) => {
      // send 时刻：write-ahead 条目必须已经在 journal 里（状态 inflight）。
      const entry = journal.entryOf(clientReqId);
      observedAtSend.push({ id: clientReqId, state: entry?.state, route: entry?.route });
      if (behavior === "conn") {
        throw Object.assign(new Error("conn"), { code: "CONN_LOST", clientReqId });
      }
      if (behavior === "reject") {
        throw Object.assign(new Error("nope"), { code: "INVALID_PAYLOAD", clientReqId });
      }
      return { ok: true };
    };

    await ports.lobbyRpc.sendIdempotent("user.updateProfile" as never, { nickname: "n" } as never);
    assert.equal(observedAtSend.length, 1);
    assert.equal(observedAtSend[0].state, "inflight", "send 之前必须已落 inflight 条目（write-ahead）");
    assert.equal(observedAtSend[0].route, "user.updateProfile");
    assert.equal(journal.entryOf(observedAtSend[0].id)?.state, "applied", "成功结算 applied");

    behavior = "conn";
    await assert.rejects(
      ports.lobbyRpc.sendIdempotent("user.updateProfile" as never, { nickname: "n2" } as never),
    );
    assert.equal(journal.entryOf(observedAtSend[1].id)?.state, "unknown",
      "连接层失败（CONN_LOST/TIMEOUT）必须结算 ResultUnknown，⛔ 不得当确定失败清掉");

    behavior = "reject";
    await assert.rejects(
      ports.lobbyRpc.sendIdempotent("user.updateProfile" as never, { nickname: "n3" } as never),
    );
    assert.equal(journal.entryOf(observedAtSend[2].id)?.state, "failed",
      "确定性错误回复结算 failed（可淘汰终态）");
  } finally {
    socket.rpcIdem = originalRpcIdem;
  }
});

test("onDrop 只做 inflight → unknown 状态迁移，⛔ 不产生新条目、不触碰终态", () => {
  const journal = new PendingOperationJournal();
  journal.begin({ uid: "u", clientReqId: "a", route: "r", payload: { v: 1 } });
  journal.begin({ uid: "u", clientReqId: "b", route: "r", payload: { v: 2 } });
  journal.settle("b", "applied");
  const sizeBefore = journal.size;
  journal.markInflightUnknown();
  assert.equal(journal.size, sizeBefore, "onDrop ⛔ 不产生新条目");
  assert.equal(journal.entryOf("a")?.state, "unknown");
  assert.equal(journal.entryOf("b")?.state, "applied", "终态条目不受 onDrop 影响");
});

test("maxEntries fail-closed：未决条目 ⛔ 不淘汰；只淘汰终态；超 payload 上限降级 oversize 占位", () => {
  const journal = new PendingOperationJournal({ maxEntries: 2, maxPayloadBytes: 16 });
  journal.begin({ uid: "u", clientReqId: "p1", route: "r", payload: { v: 1 } });
  journal.begin({ uid: "u", clientReqId: "p2", route: "r", payload: { v: 2 } });
  // 两条都未决：达上限必须 fail closed 拒新写（淘汰最旧未决会永久丢 clientReqId）。
  assert.throws(
    () => journal.begin({ uid: "u", clientReqId: "p3", route: "r", payload: { v: 3 } }),
    JournalFullError,
    "达 maxEntries 且无终态可淘汰时必须拒绝新的幂等写",
  );
  assert.equal(journal.entryOf("p1")?.state, "inflight", "fail-closed 不得动未决条目");

  // 有终态时：淘汰最旧终态，新写可入。
  journal.settle("p1", "applied");
  const entry = journal.begin({ uid: "u", clientReqId: "p4", route: "r", payload: { v: 4 } });
  assert.equal(entry.state, "inflight");
  assert.equal(journal.entryOf("p1"), null, "被淘汰的只能是终态条目");
  assert.equal(journal.entryOf("p2")?.state, "inflight", "未决条目必须原位保留");

  // oversize：只保留占位记号（客户端 ⛔ 不算 hash），重发面返回 null。
  journal.settle("p2", "abandoned");
  const big = journal.begin({
    uid: "u",
    clientReqId: "big",
    route: "r",
    payload: { text: "这个payload超过十六字节上限" },
  });
  assert.equal(big.oversize, true);
  assert.equal(big.payload, null, "超限条目只留 oversize 占位，不存 payload 本体");
  assert.equal(journal.resendPayloadOf("big"), null, "oversize 条目不得本地重放");
});

test("重发字节等同：resend 返回 begin 时的规范化串，且是 canonical 不动点（⛔ 不重新规范化）", () => {
  const journal = new PendingOperationJournal();
  const payload = { b: 2, a: [3, { z: 1, y: "文" }], c: "x" };
  journal.begin({ uid: "u", clientReqId: "cid", route: "shop.purchase", payload });
  const stored = journal.resendPayloadOf("cid");
  assert.equal(stored, canonicalJsonString(payload), "存的必须是 shared canonicalizer 的输出");
  assert.equal(canonicalJsonString(JSON.parse(stored!)), stored,
    "canonical 形态必须是 parse→canonicalize 的不动点：重发字节等同");
});

test("uid 边界：任何 uid 变化同步清空整本 journal（clientReqId ⛔ 不跨 uid 复用）", () => {
  const journal = new PendingOperationJournal();
  journal.begin({ uid: "alice", clientReqId: "a1", route: "r", payload: {} });
  assert.equal(journal.currentUid(), "alice");
  journal.begin({ uid: "bob", clientReqId: "b1", route: "r", payload: {} });
  assert.equal(journal.entryOf("a1"), null, "换 uid 必须同步清空旧账号条目");
  assert.equal(journal.entryOf("b1")?.state, "inflight");
  assert.equal(journal.currentUid(), "bob");
});

test("生命周期分叉：auth-invalid 清空（session ended）；final-loss 保留并可重进对账（字节等同重发）", async () => {
  // auth-invalid：clearForSessionEnd。
  const ended = new PendingOperationJournal();
  ended.begin({ uid: "u", clientReqId: "e1", route: "r", payload: {} });
  ended.clearForSessionEnd();
  assert.equal(ended.size, 0);
  assert.equal(ended.currentUid(), null);

  // final-loss：条目保留（inflight → unknown），重进后对账逐条字节等同重发。
  const journal = new PendingOperationJournal();
  const payload = { amount: 5, itemId: "sword" };
  journal.begin({ uid: "u", clientReqId: "f1", route: "shop.purchase", payload });
  journal.markInflightUnknown();
  assert.equal(journal.entryOf("f1")?.state, "unknown", "final-loss 前的在途写保留为 unknown");

  const resent: Array<{ id: string; canonical: string }> = [];
  const pendingAfter = await journal.reconcileAfterRejoin(async (entry, canonical) => {
    resent.push({ id: entry.clientReqId, canonical });
    return "applied";
  });
  assert.deepEqual(resent, [{ id: "f1", canonical: canonicalJsonString(payload) }],
    "对账重发必须使用原存规范化串（字节等同）与原 clientReqId");
  assert.equal(pendingAfter, 0);
  assert.equal(journal.entryOf("f1")?.state, "applied");

  // 无查询/重发通道时：维持 unknown（机制齐；服务端 inspect 消费者留待产品 feature 接入）。
  const held = new PendingOperationJournal();
  held.begin({ uid: "u", clientReqId: "h1", route: "r", payload: {} });
  held.markInflightUnknown();
  assert.equal(await held.reconcileAfterRejoin(), 1, "无对账通道时未决条目保持 unknown");
});
