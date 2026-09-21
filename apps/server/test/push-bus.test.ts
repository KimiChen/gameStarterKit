/**
 * 投递总线（docs/MMO.md §6.3；MF6a-B2）单测：编码 / 解析 / 发布切片 / 消费落地，两个「节点」各挂一张假在线表。
 * 变异验证（手工）：deliverToUsers 删 `conn.sId !== sId` → 「串区」转红；deliverPushEntry 删 max-age → 「积压不投递」转红；
 * encodePushEntries 删切片 → 「65 uid」转红；pushToUsers 改成本地直投 → 「恰一次」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type Redis from "ioredis";
import { LobbyPush } from "@game/shared";
import { PUSH_BUS_MAX_AGE_MS, PUSH_BUS_MAX_UIDS } from "../src/core/infra/config";
import {
  PushBusError, _pushBusTestHooks, deliverPushEntry, encodePushEntries, parsePushFields, publishPush,
  createPushConsumer, registerRoomSignal, type PushBusEntry, type PushLocalHandlers,
} from "../src/core/push/pushBus";
import { pushLocalHandlers, pushToRealm, pushToUsers, registerOnline, unregisterOnline } from "../src/websocket/push";

const NOW = 1_700_000_000_000;
const notice = { text: "hello" };

function fakeNode(onlineUids: ReadonlySet<string>, sId: number) {
  const log: string[] = [];
  const handlers: PushLocalHandlers = {
    pushToUsers: (uids, type, data, s) => {
      const hit = uids.filter((uid) => onlineUids.has(uid) && s === sId);
      for (const uid of hit) log.push(`users:${uid}:${type}:${JSON.stringify(data)}`);
      return hit.length;
    },
    pushToRealm: (s, type) => { if (s !== sId) return 0; for (const uid of onlineUids) log.push(`realm:${uid}:${type}`); return onlineUids.size; },
    pushToGuild: (gid, type, _data, s) => { if (s !== sId) return 0; log.push(`guild:${gid}:${type}`); return 1; },
  };
  return { handlers, log };
}

const entryOf = (fields: string[]): PushBusEntry => {
  const entry = parsePushFields(fields);
  assert.ok(entry, "fields 必须可解析");
  return entry;
};

test("encode → parse 往返；data 过 validator；发布侧非法输入 throw PushBusError", () => {
  const [fields] = encodePushEntries({ kind: "users", sId: 1, uids: ["u1", "u2"], type: LobbyPush.ServerNotice, data: notice }, NOW, "node-a");
  assert.deepEqual(entryOf(fields), { kind: "users", sId: 1, type: "server.notice", data: notice, issuedAt: NOW, origin: "node-a", uids: ["u1", "u2"] });
  assert.equal(entryOf(encodePushEntries({ kind: "guild", sId: 2, gid: 9, type: LobbyPush.GuildEvent, data: { seq: 3, guildId: 9 } }, NOW)[0]).gid, 9);
  assert.equal(entryOf(encodePushEntries({ kind: "room", sId: 0, instanceId: "inst-1", type: LobbyPush.ServerNotice, data: notice }, NOW)[0]).instanceId, "inst-1");
  assert.equal(entryOf(encodePushEntries({ kind: "realm", sId: 3, type: LobbyPush.ServerNotice, data: notice }, NOW)[0]).uids, undefined);
  const throws = (input: unknown, label: string) =>
    assert.throws(() => encodePushEntries(input as never, NOW), (e: unknown) => e instanceof PushBusError, label);
  throws({ kind: "users", sId: 1, uids: ["u1"], type: LobbyPush.ServerNotice, data: { text: "x".repeat(2049) } }, "data 2049 B 拒发");
  throws({ kind: "users", sId: 1, uids: ["u1"], type: "no.such.push", data: notice }, "未知 type 拒发");
  throws({ kind: "users", sId: 1, uids: ["u1"], type: LobbyPush.ServerNotice, data: { text: "x", extra: 1 } }, "data 不合 validator 拒发");
  throws({ kind: "users", sId: -1, uids: ["u1"], type: LobbyPush.ServerNotice, data: notice }, "sId 非法");
  throws({ kind: "users", sId: 1, uids: [], type: LobbyPush.ServerNotice, data: notice }, "uids 空");
  throws({ kind: "guild", sId: 1, gid: 0, type: LobbyPush.GuildEvent, data: { seq: 1, guildId: 1 } }, "gid 非法");
});

test("发布切片：65 uid 切两条（64 + 1）；XADD 失败只记日志、返回已成功条数", async () => {
  const captured: string[][] = [];
  const uids = Array.from({ length: PUSH_BUS_MAX_UIDS + 1 }, (_, i) => `u${i}`);
  const n = await publishPush({ kind: "users", sId: 1, uids, type: LobbyPush.ServerNotice, data: notice }, { xadd: async (f) => { captured.push([...f]); }, now: () => NOW });
  assert.equal(n, 2);
  assert.deepEqual(captured.map((f) => entryOf(f).uids?.length), [PUSH_BUS_MAX_UIDS, 1]);
  const originalError = console.error;
  const logs: unknown[] = [];
  console.error = (...args: unknown[]) => { logs.push(args[0]); };
  try {
    const failed = await publishPush({ kind: "realm", sId: 1, type: LobbyPush.ServerNotice, data: notice }, { xadd: async () => { throw new Error("redis down"); }, now: () => NOW });
    assert.equal(failed, 0, "best-effort：失败不 throw");
    assert.equal(logs.length, 1);
  } finally {
    console.error = originalError;
  }
});

test("消费侧严格解析：未知 / 重复字段、坏 sId、超上限 uids、坏 JSON 整条丢弃", () => {
  const [good] = encodePushEntries({ kind: "users", sId: 1, uids: ["u1"], type: LobbyPush.ServerNotice, data: notice }, NOW);
  assert.ok(parsePushFields(good));
  assert.equal(parsePushFields([...good, "extra", "1"]), null, "未知字段");
  assert.equal(parsePushFields([...good, "kind", "realm"]), null, "重复字段");
  const swap = (key: string, value: string): string[] => good.map((v, i) => (i > 0 && good[i - 1] === key ? value : v));
  assert.equal(parsePushFields(swap("sId", "70000")), null, "sId 越界");
  assert.equal(parsePushFields(swap("sId", "-1")), null, "sId 负数");
  assert.equal(parsePushFields(swap("type", "no.such")), null, "未知 type");
  assert.equal(parsePushFields(swap("data", "{not json")), null, "坏 JSON");
  assert.equal(parsePushFields(swap("uids", JSON.stringify(Array.from({ length: 65 }, (_, i) => `u${i}`)))), null, "uids 超上限");
  assert.equal(parsePushFields(swap("uids", "[]")), null, "uids 空");
  assert.equal(parsePushFields(["kind", "users"]), null, "缺字段");
  assert.equal(parsePushFields([]), null);
});

test("落地：时间栅栏（早于 30 s 丢弃）、二次 validator、未知 type 不落地、kind=room 走 signal 登记表", async () => {
  const a = fakeNode(new Set(["u1"]), 1);
  const stale = { ...entryOf(encodePushEntries({ kind: "users", sId: 1, uids: ["u1"], type: LobbyPush.ServerNotice, data: notice }, NOW)[0]) };
  assert.deepEqual(await deliverPushEntry(stale, a.handlers, NOW + PUSH_BUS_MAX_AGE_MS + 1), { outcome: "stale", delivered: 0 });
  assert.deepEqual(await deliverPushEntry(stale, a.handlers, NOW + PUSH_BUS_MAX_AGE_MS), { outcome: "delivered", delivered: 1 });
  const badData: PushBusEntry = { ...stale, data: { text: "" } };
  assert.deepEqual(await deliverPushEntry(badData, a.handlers, NOW), { outcome: "invalid-data", delivered: 0 }, "消费侧再过一次 validator");
  assert.deepEqual(await deliverPushEntry(stale, null, NOW), { outcome: "no-handlers", delivered: 0 }, "未注入落地端（world 进程）不投 users");
  const signals: string[] = [];
  const off = registerRoomSignal("inst-1", 1, (type) => { signals.push(type); });
  const room = entryOf(encodePushEntries({ kind: "room", sId: 1, instanceId: "inst-1", type: LobbyPush.ServerNotice, data: notice }, NOW)[0]);
  assert.deepEqual(await deliverPushEntry(room, null, NOW), { outcome: "delivered", delivered: 1 });
  off();
  assert.deepEqual(await deliverPushEntry(room, null, NOW), { outcome: "delivered", delivered: 0 }, "注销后不再命中");
  assert.deepEqual(signals, ["server.notice"]);
});

test("两节点：users 到达 b 在线的 uid、不到达 a；realm 只到 sId；两节点各恰一次", async () => {
  const a = fakeNode(new Set(["ua"]), 1);
  const b = fakeNode(new Set(["ub"]), 1);
  const s2 = fakeNode(new Set(["ub"]), 2);
  const users = entryOf(encodePushEntries({ kind: "users", sId: 1, uids: ["ub"], type: LobbyPush.ServerNotice, data: notice }, NOW)[0]);
  for (const node of [a, b, s2]) await deliverPushEntry(users, node.handlers, NOW);
  assert.deepEqual(a.log, []);
  assert.deepEqual(b.log, [`users:ub:server.notice:${JSON.stringify(notice)}`]);
  assert.deepEqual(s2.log, [], "同 uid 的 s2 连接不收 s1 的定向投递");
  const realm = entryOf(encodePushEntries({ kind: "realm", sId: 1, type: LobbyPush.ServerNotice, data: notice }, NOW)[0]);
  for (const node of [a, b, s2]) await deliverPushEntry(realm, node.handlers, NOW);
  assert.deepEqual(a.log, ["realm:ua:server.notice"]);
  assert.deepEqual(b.log.slice(1), ["realm:ub:server.notice"]);
  assert.deepEqual(s2.log, [], "pushToRealm(s1) 只到 s1");
  const guild = entryOf(encodePushEntries({ kind: "guild", sId: 2, gid: 7, type: LobbyPush.GuildEvent, data: { seq: 1, guildId: 7 } }, NOW)[0]);
  for (const node of [a, b, s2]) await deliverPushEntry(guild, node.handlers, NOW);
  assert.deepEqual(s2.log, ["guild:7:guild.event"]);
  assert.equal(a.log.length + b.log.length, 3, "guild 只到 s2 节点");
});

test("websocket/push：发布方 ⛔ 不本地直投；本地落地按 conn.sId 分区、每条连接恰一次", async () => {
  const captured: string[][] = [];
  _pushBusTestHooks.publish = { xadd: async (f) => { captured.push([...f]); }, now: () => NOW };
  const sent: string[] = [];
  const conn = (label: string, sId: number) => ({ sink: (type: string) => { sent.push(`${label}:${type}`); }, kick: () => {}, tokenHash: `h-${label}`, sId });
  registerOnline("pb-u1", "pb-s1", conn("u1@s1", 1));
  registerOnline("pb-u1", "pb-s2", conn("u1@s2", 2));
  registerOnline("pb-u2", "pb-s1b", conn("u2@s1", 1));
  try {
    pushToUsers(["pb-u1"], LobbyPush.ServerNotice, notice, 1);
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));
    assert.deepEqual(sent, [], "发布方不得本地直投——本节点命中也必须经流回读");
    assert.equal(captured.length, 1);
    // 模拟本节点消费者读回自己发的条目：只到 s1 连接、恰一次
    const r = await deliverPushEntry(entryOf(captured[0]), pushLocalHandlers, NOW);
    assert.deepEqual(r, { outcome: "delivered", delivered: 1 });
    assert.deepEqual(sent, ["u1@s1:server.notice"], "同 uid 的 s2 连接不收（串区）");
    // 第二个「节点」（假在线表）读同一条：各恰一次
    const b = fakeNode(new Set(["pb-u1"]), 1);
    await deliverPushEntry(entryOf(captured[0]), b.handlers, NOW);
    assert.equal(b.log.length, 1);
    assert.equal(sent.length, 1, "节点 a 不因节点 b 的消费而重复投递");
    // realm：按 realmOnline 索引，s1 两个 uid 各一次，s2 不收
    sent.length = 0;
    captured.length = 0;
    pushToRealm(1, LobbyPush.ServerNotice, notice);
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));
    assert.equal(captured.length, 1);
    const rr = await deliverPushEntry(entryOf(captured[0]), pushLocalHandlers, NOW);
    assert.equal(rr.delivered, 2);
    assert.deepEqual(sent.sort(), ["u1@s1:server.notice", "u2@s1:server.notice"]);
  } finally {
    delete _pushBusTestHooks.publish;
    unregisterOnline("pb-u1", "pb-s1");
    unregisterOnline("pb-u1", "pb-s2");
    unregisterOnline("pb-u2", "pb-s1b");
  }
  // 离线后 realm 索引随之清理：再投 s1 无人
  const realm = entryOf(encodePushEntries({ kind: "realm", sId: 1, type: LobbyPush.ServerNotice, data: notice }, NOW)[0]);
  assert.equal((await deliverPushEntry(realm, pushLocalHandlers, NOW)).delivered, 0);
});


for (const scope of ["room", "lobby"] as const) {
  test(`PS push consumer ${scope}：真实消费循环按角色隔离，即使 world 意外挂入大厅 handlers`, { timeout: 3_000 }, async () => {
    const node = fakeNode(new Set(["ps-user"]), 1);
    const signals: string[] = [];
    const off = registerRoomSignal("ps-world", 1, (type) => { signals.push(type); });
    const inputs = [
      { kind: "users" as const, sId: 1, uids: ["ps-user"], type: LobbyPush.ServerNotice, data: notice },
      { kind: "realm" as const, sId: 1, type: LobbyPush.ServerNotice, data: notice },
      { kind: "guild" as const, sId: 1, gid: 8, type: LobbyPush.GuildEvent, data: { seq: 1, guildId: 8 } },
      { kind: "room" as const, sId: 1, instanceId: "ps-world", type: LobbyPush.ServerNotice, data: notice },
    ];
    const rows = inputs.map((input, index) => [String(index + 1), encodePushEntries(input, NOW)[0]]);
    let markDrained!: () => void;
    const drained = new Promise<void>((resolve) => { markDrained = resolve; });
    let reads = 0;
    let disconnected = false;
    const blockingClient = {
      xread: async () => {
        if (reads++ === 0) return [["push-stream", rows]];
        markDrained();
        return new Promise(() => {});
      },
      disconnect: () => { disconnected = true; },
    };
    const client = { duplicate: () => blockingClient } as unknown as Redis;
    const consumer = createPushConsumer(() => node.handlers, {
      scope, name: `ps-scope-${scope}`, now: () => NOW, client: () => client,
    });
    try {
      await drained;
      assert.deepEqual(signals, scope === "room" ? ["server.notice"] : [], "lobby 不得投递 world 的房间信号");
      assert.deepEqual(node.log, scope === "room" ? [] : [
        'users:ps-user:server.notice:{"text":"hello"}', "realm:ps-user:server.notice", "guild:8:guild.event",
      ], "world 即使有大厅 handlers，也不得消费 users / realm / guild");
    } finally {
      off();
      await consumer.stop();
    }
    assert.equal(disconnected, true, "阻塞 XREAD 专用连接随消费者停止而释放");
  });
}
