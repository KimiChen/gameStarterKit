/**
 * GuildLogic 无头单测——logic/ 层「纯 TS 可测」承诺的首个页面级样例。
 * 覆盖唤醒式推送语义：首拉、迟到唤醒忽略、并发唤醒合流、窗口外跳号全量刷新、
 * 换会重置 seq 水位（评审修复：seq 是工会内命名空间）、拉取失败不逃逸。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GuildLogic } from "../src/logic/page/GuildLogic";
import type { IGuildEvent } from "../src/shared/index";

const GID = 7;

function makeDeps(pages: IGuildEvent[][], latestSeqOf: (call: number) => number, gid = GID) {
  let call = 0;
  let pushCb: ((d: { seq: number; guildId: number }) => void) | null = null;
  const calls: number[] = [];
  return {
    calls,
    wake(seq: number, guildId = gid) { pushCb?.({ seq, guildId }); },
    deps: {
      getEvents: async (sinceSeq: number) => {
        calls.push(sinceSeq);
        const events = (pages[call] ?? []).filter((e) => e.seq > sinceSeq);
        const latestSeq = latestSeqOf(call);
        call++;
        return { events, latestSeq, guildId: gid };
      },
      onPush: (_t: unknown, cb: (d: { seq: number; guildId: number }) => void) => {
        pushCb = cb;
        return () => { pushCb = null; };
      },
    },
  };
}

const evt = (seq: number): IGuildEvent => ({ seq, kind: "memberJoin", at: 1000 + seq });
const tick = () => new Promise((r) => setTimeout(r, 0));

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

test("首拉 + 推送唤醒增量 + 迟到唤醒忽略", async () => {
  const f = makeDeps([[evt(1), evt(2)], [evt(3)]], (c) => (c === 0 ? 2 : 3));
  const logic = new GuildLogic(f.deps);
  const got: number[] = [];
  logic.onEvents = (es) => got.push(...es.map((e) => e.seq));

  await logic.start(0, GID);
  assert.deepEqual(got, [1, 2]);
  assert.equal(logic.seq, 2);

  f.wake(3);                                   // 新事件唤醒 → 拉增量
  await tick();
  assert.deepEqual(got, [1, 2, 3]);

  f.wake(3);                                   // 迟到/重复唤醒 → 不再拉
  await tick();
  assert.equal(f.calls.length, 2, "重复唤醒不应触发第三次拉取");
});

test("拉取中并发唤醒合流：结束后只补一轮", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let call = 0;
  const calls: number[] = [];
  let pushCb: ((d: { seq: number; guildId: number }) => void) | null = null;
  const logic = new GuildLogic({
    getEvents: async (sinceSeq: number) => {
      calls.push(sinceSeq);
      if (call++ === 0) { await gate; return { events: [evt(1)], latestSeq: 1, guildId: GID }; }
      return { events: [evt(2), evt(3)], latestSeq: 3, guildId: GID };
    },
    onPush: (_t, cb) => { pushCb = cb; return () => {}; },
  });
  const started = logic.start(0, GID);         // 首拉被 gate 卡住
  pushCb!({ seq: 2, guildId: GID });           // 拉取中来两次唤醒
  pushCb!({ seq: 3, guildId: GID });
  release();
  await started;
  await tick();
  assert.deepEqual(calls, [0, 1], "两次唤醒合流成一次补拉");
  assert.equal(logic.seq, 3);
});

test("增量跳号（窗口外）触发 onGapRefresh", async () => {
  const f = makeDeps([[evt(1)], [evt(5), evt(6)]], (c) => (c === 0 ? 1 : 6));
  const logic = new GuildLogic(f.deps);
  let gap = 0;
  logic.onGapRefresh = () => { gap++; };
  await logic.start(0, GID);
  f.wake(6);                                   // 本地 seq=1，拉到最老是 5 → 跳号
  await tick();
  assert.equal(gap, 1, "窗口外增量应触发一次全量刷新回调");
  assert.equal(logic.seq, 6);
});

test("换会重置水位：高 seq 会 → 低 seq 会不失聪（评审修复）", async () => {
  // 旧会 A 水位 500；换到新会 B（seq 才 2）。响应 guildId=B → 重置水位 → 补拉吃到 B 的事件
  let call = 0;
  const calls: number[] = [];
  let pushCb: ((d: { seq: number; guildId: number }) => void) | null = null;
  const B = 9;
  const logic = new GuildLogic({
    getEvents: async (sinceSeq: number) => {
      calls.push(sinceSeq);
      call++;
      if (call === 1) { return { events: [], latestSeq: 500, guildId: GID }; }  // 首拉：还在 A
      return { events: [evt(1), evt(2)].filter((e) => e.seq > sinceSeq), latestSeq: 2, guildId: B };
    },
    onPush: (_t, cb) => { pushCb = cb; return () => {}; },
  });
  const got: number[] = [];
  let gap = 0;
  logic.onEvents = (es) => got.push(...es.map((e) => e.seq));
  logic.onGapRefresh = () => { gap++; };
  await logic.start(500, GID);
  assert.equal(logic.seq, 500);

  pushCb!({ seq: 2, guildId: B });             // B 会的唤醒：seq 2 < 500，但 guildId 不同 → 必须拉
  await tick(); await tick();
  assert.ok(gap >= 1, "换会应触发全量刷新回调");
  assert.deepEqual(got, [1, 2], "B 会事件不得被旧水位挡掉");
  assert.equal(logic.seq, 2);
  assert.deepEqual(calls, [500, 0], "换会后按归零水位补拉");
});

test("重复 start 不叠订阅：先解旧订阅；stop 后清空（防死页面收唤醒回调）", async () => {
  const cbs = new Set<(d: { seq: number; guildId: number }) => void>();
  const logic = new GuildLogic({
    getEvents: async () => ({ events: [], latestSeq: 0, guildId: GID }),
    onPush: (_t, cb) => { cbs.add(cb); return () => { cbs.delete(cb); }; },
  });
  await logic.start(0, GID);
  assert.equal(cbs.size, 1);
  await logic.start(0, GID); // 无 stop 重进页面：start 内部先解旧订阅再订新
  assert.equal(cbs.size, 1, "重复 start 不得叠订阅");
  logic.stop();
  assert.equal(cbs.size, 0, "stop 后订阅清空");
});

test("生命周期：stop 后迟到 pull 结果不触发 events/error/gap", async () => {
  const pending = deferred<{ events: never[]; latestSeq: number; guildId: number }>();
  const pushRef: { current: ((data: { seq: number; guildId: number }) => void) | null } = { current: null };
  const logic = new GuildLogic({
    getEvents: async () => pending.promise,
    onPush: (_type, cb) => {
      pushRef.current = cb;
      return () => { pushRef.current = null; };
    },
  });
  let events = 0;
  let errors = 0;
  let gaps = 0;
  logic.onEvents = () => { events++; };
  logic.onPullError = () => { errors++; };
  logic.onGapRefresh = () => { gaps++; };
  const started = logic.start(0, GID);
  pushRef.current?.({ seq: 1, guildId: GID });
  logic.stop();
  pending.resolve({ events: [], latestSeq: 1, guildId: GID });
  await started;
  assert.equal(events, 0);
  assert.equal(errors, 0);
  assert.equal(gaps, 0);
});

test("生命周期：旧世代 pull 在途时新首拉不被旧 pulling 状态阻塞", async () => {
  const old = deferred<{ events: never[]; latestSeq: number; guildId: number }>();
  let call = 0;
  const logic = new GuildLogic({
    getEvents: async () => {
      if (call++ === 0) return old.promise;
      return { events: [], latestSeq: 0, guildId: 9 };
    },
    onPush: (_type, _cb) => () => {},
  });
  const first = logic.start(0, GID);
  const second = logic.start(0, 9);
  await second;
  assert.equal(call, 2);
  old.resolve({ events: [], latestSeq: 99, guildId: GID });
  await first;
  assert.equal(logic.seq, 0, "旧世代响应不得覆盖新页面水位");
});

test("stop 清 pendingWake：在途 pull 结束后不再补拉（防回调已关闭页面）", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let calls = 0;
  let pushCb: ((d: { seq: number; guildId: number }) => void) | null = null;
  const logic = new GuildLogic({
    getEvents: async () => { calls++; await gate; return { events: [], latestSeq: 0, guildId: GID }; },
    onPush: (_t, cb) => { pushCb = cb; return () => {}; },
  });
  const started = logic.start(0, GID);   // 首拉被 gate 卡住（pulling=true）
  pushCb!({ seq: 1, guildId: GID });     // 在途唤醒 → pendingWake = true
  logic.stop();                          // 离开页面：pendingWake 必须被清掉
  release();
  await started;
  await tick();
  assert.equal(calls, 1, "stop 后在途 pull 结束不得再补拉");
});

test("拉取失败：不产生 unhandledRejection，回调后续唤醒自愈", async () => {
  let call = 0;
  let pushCb: ((d: { seq: number; guildId: number }) => void) | null = null;
  const logic = new GuildLogic({
    getEvents: async (sinceSeq: number) => {
      if (call++ === 0) { throw new Error("CONN_LOST"); }
      return { events: [evt(1)].filter((e) => e.seq > sinceSeq), latestSeq: 1, guildId: GID };
    },
    onPush: (_t, cb) => { pushCb = cb; return () => {}; },
  });
  const errs: unknown[] = [];
  const got: number[] = [];
  logic.onPullError = (e) => errs.push(e);
  logic.onEvents = (es) => got.push(...es.map((e) => e.seq));

  const rejections: unknown[] = [];
  const onRej = (r: unknown) => rejections.push(r);
  process.on("unhandledRejection", onRej);
  try {
    await logic.start(0, GID);                 // 首拉失败 → 吞掉并回调
    assert.equal(errs.length, 1);
    pushCb!({ seq: 1, guildId: GID });         // 下一次唤醒自愈
    await tick();
    assert.deepEqual(got, [1]);
    await tick();
    assert.equal(rejections.length, 0, "拉取失败不得逃逸为 unhandledRejection");
  } finally {
    process.off("unhandledRejection", onRej);
  }
});
