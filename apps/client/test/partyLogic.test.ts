/**
 * PartyLogic 无头单测（MMO MF6a-B3；逐字照 guildLogic.test.ts）：首拉、迟到唤醒忽略、并发唤醒合流、
 * 窗口外跳号全量刷新、换队重置水位（partyId 是 seq 命名空间）、离队（partyId=0）刷新、拉取失败不逃逸、生命周期。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PartyLogic } from "../src/logic/page/PartyLogic";
import type { IPartyEvent } from "../src/shared/protocol/lobbyRpc/domains/party";

const PID = 7;

function makeDeps(pages: IPartyEvent[][], latestSeqOf: (call: number) => number, pid = PID) {
  let call = 0;
  let pushCb: ((d: { seq: number; partyId: number }) => void) | null = null;
  const calls: number[] = [];
  return {
    calls,
    wake(seq: number, partyId = pid) { pushCb?.({ seq, partyId }); },
    deps: {
      getEvents: async (sinceSeq: number) => {
        calls.push(sinceSeq);
        const events = (pages[call] ?? []).filter((e) => e.seq > sinceSeq);
        const latestSeq = latestSeqOf(call);
        call++;
        return { events, latestSeq, partyId: pid };
      },
      onPush: (_t: unknown, cb: (d: { seq: number; partyId: number }) => void) => {
        pushCb = cb;
        return () => { pushCb = null; };
      },
    },
  };
}

const evt = (seq: number): IPartyEvent => ({ seq, kind: "memberJoin", at: 1000 + seq });
const tick = () => new Promise((r) => setTimeout(r, 0));

test("首拉 + 推送唤醒增量 + 迟到唤醒忽略", async () => {
  const f = makeDeps([[evt(1), evt(2)], [evt(3)]], (c) => (c === 0 ? 2 : 3));
  const logic = new PartyLogic(f.deps);
  const got: number[] = [];
  logic.onEvents = (es) => got.push(...es.map((e) => e.seq));
  await logic.start(0, PID);
  assert.deepEqual(got, [1, 2]);
  assert.equal(logic.seq, 2);
  f.wake(3);
  await tick();
  assert.deepEqual(got, [1, 2, 3]);
  f.wake(3);
  await tick();
  assert.equal(f.calls.length, 2, "重复唤醒不应触发第三次拉取");
});

test("拉取中并发唤醒合流：结束后只补一轮", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let call = 0;
  const calls: number[] = [];
  let pushCb: ((d: { seq: number; partyId: number }) => void) | null = null;
  const logic = new PartyLogic({
    getEvents: async (sinceSeq: number) => {
      calls.push(sinceSeq);
      if (call++ === 0) { await gate; return { events: [evt(1)], latestSeq: 1, partyId: PID }; }
      return { events: [evt(2), evt(3)], latestSeq: 3, partyId: PID };
    },
    onPush: (_t, cb) => { pushCb = cb; return () => {}; },
  });
  const started = logic.start(0, PID);
  pushCb!({ seq: 2, partyId: PID });
  pushCb!({ seq: 3, partyId: PID });
  release();
  await started;
  await tick();
  assert.deepEqual(calls, [0, 1], "两次唤醒合流成一次补拉");
  assert.equal(logic.seq, 3);
});

test("增量跳号（窗口外）触发 onGapRefresh", async () => {
  const f = makeDeps([[evt(1)], [evt(5), evt(6)]], (c) => (c === 0 ? 1 : 6));
  const logic = new PartyLogic(f.deps);
  let gap = 0;
  logic.onGapRefresh = () => { gap++; };
  await logic.start(0, PID);
  f.wake(6);
  await tick();
  assert.equal(gap, 1, "窗口外增量应触发一次全量刷新回调");
  assert.equal(logic.seq, 6);
});

test("换队重置水位：高 seq 队 → 低 seq 队不失聪；离队（partyId=0）触发刷新且不再补拉", async () => {
  let call = 0;
  const calls: number[] = [];
  let pushCb: ((d: { seq: number; partyId: number }) => void) | null = null;
  const B = 9;
  let serverParty = PID;
  const logic = new PartyLogic({
    getEvents: async (sinceSeq: number) => {
      calls.push(sinceSeq);
      call++;
      if (call === 1) { return { events: [], latestSeq: 500, partyId: PID }; }
      if (serverParty === 0) { return { events: [], latestSeq: 0, partyId: 0 }; }
      return { events: [evt(1), evt(2)].filter((e) => e.seq > sinceSeq), latestSeq: 2, partyId: B };
    },
    onPush: (_t, cb) => { pushCb = cb; return () => {}; },
  });
  const got: number[] = [];
  let gap = 0;
  logic.onEvents = (es) => got.push(...es.map((e) => e.seq));
  logic.onGapRefresh = () => { gap++; };
  await logic.start(500, PID);
  assert.equal(logic.seq, 500);
  pushCb!({ seq: 2, partyId: B });
  await tick(); await tick();
  assert.ok(gap >= 1, "换队应触发全量刷新回调");
  assert.deepEqual(got, [1, 2], "B 队事件不得被旧水位挡掉");
  assert.equal(logic.seq, 2);
  assert.equal(logic.currentPartyId, B);
  // 被踢 / 离队：服务端视角 partyId=0 ⇒ 重置为 0 并刷新，⛔ 不补拉
  serverParty = 0;
  const before = calls.length;
  pushCb!({ seq: 3, partyId: B });
  await tick(); await tick();
  assert.equal(logic.currentPartyId, 0);
  assert.equal(calls.length, before + 1, "partyId=0 后不再补拉");
});

test("重复 start 不叠订阅；stop 后清空", async () => {
  const cbs = new Set<(d: { seq: number; partyId: number }) => void>();
  const logic = new PartyLogic({
    getEvents: async () => ({ events: [], latestSeq: 0, partyId: PID }),
    onPush: (_t, cb) => { cbs.add(cb); return () => { cbs.delete(cb); }; },
  });
  await logic.start(0, PID);
  assert.equal(cbs.size, 1);
  await logic.start(0, PID);
  assert.equal(cbs.size, 1, "重复 start 不得叠订阅");
  logic.stop();
  assert.equal(cbs.size, 0, "stop 后订阅清空");
});

test("生命周期：stop 后迟到 pull 结果不触发 events/error/gap；拉取失败走 onPullError 不逃逸", async () => {
  let resolveLate!: (v: { events: never[]; latestSeq: number; partyId: number }) => void;
  const pending = new Promise<{ events: never[]; latestSeq: number; partyId: number }>((r) => { resolveLate = r; });
  const logic = new PartyLogic({
    getEvents: async () => pending,
    onPush: () => () => {},
  });
  let events = 0; let errors = 0; let gaps = 0;
  logic.onEvents = () => { events++; };
  logic.onPullError = () => { errors++; };
  logic.onGapRefresh = () => { gaps++; };
  const started = logic.start(0, PID);
  logic.stop();
  resolveLate({ events: [], latestSeq: 1, partyId: PID });
  await started;
  assert.deepEqual([events, errors, gaps], [0, 0, 0]);

  const failing = new PartyLogic({ getEvents: async () => { throw new Error("offline"); }, onPush: () => () => {} });
  let reported = 0;
  failing.onPullError = () => { reported++; };
  await failing.start(0, PID);
  assert.equal(reported, 1, "拉取失败回调一次且不抛出");
  assert.equal(failing.seq, 0, "失败不动水位");
});
