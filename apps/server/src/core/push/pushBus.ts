/**
 * 跨进程投递总线（docs/MMO.md §6.3；MF6a-B2）。
 *
 * - 载体：**coord** Redis 的 `K_STREAM_PUSH`（同 `stream:kick`：控制 / 扇出语义、组内独占 ⇒ 扇出半径 = 能持有该区
 *   连接的节点集）；每节点独立 `$` 游标（`startStreamConsumer`），⛔ 无 consumer group；`XTRIM MINID` 按 PUSH_STREAM_TRIM_MS 裁。
 * - **单一路径**：发布方 ⛔ 不本地直投——本节点命中也经流回读 ⇒ 无自投重复、单进程测试即覆盖跨进程路径。
 * - 条目：`kind ∈ users | realm | guild | room`；`sId` 必带（消费侧只投 `conn.sId === sId`）；`uids` ≤ PUSH_BUS_MAX_UIDS
 *   （超出发布侧自动切多条）；`gid` / `instanceId`；`type ∈ LobbyPushMap`；`data` JSON ≤ PUSH_BUS_MAX_DATA_BYTES
 *   （发布侧与消费侧各过一次 `PUSH_RUNTIME_VALIDATORS[type]`）；`issuedAt`（消费侧 > PUSH_BUS_MAX_AGE_MS 丢弃，时间栅栏）；`origin`（诊断）。
 * - 可靠性：best-effort（XADD 失败只记日志）；party 靠 seq 自愈，聊天本就尽力，交接权威在表。总线不限流，限在产生消息的 RPC。
 * - 本地落地由 websocket 层经 `setPushLocalHandlers` 注入（core ⛔ 反向依赖 websocket）；world 进程只挂 `signalRoom`（D27）。
 *   `room` 类条目的落地在本文件：`registerRoomSignal(instanceId, sId, onSignal)` 登记表（MF4 WorldRoom 用）。
 */
import type Redis from "ioredis";
import { PUSH_RUNTIME_VALIDATORS, type LobbyPushType } from "@game/shared";
import {
  NODE_ID, PUSH_BUS_MAX_AGE_MS, PUSH_BUS_MAX_DATA_BYTES, PUSH_BUS_MAX_UIDS, PUSH_STREAM_TRIM_MS,
} from "../infra/config";
import { K_STREAM_PUSH } from "../infra/keys";
import { coordClient } from "../infra/redisRoute";
import { defaultLifecycle, isAdmissionOpen } from "../infra/lifecycle";
import { startStreamConsumer, type StreamConsumer } from "../infra/streamConsumer";

export type PushKind = "users" | "realm" | "guild" | "room";

export interface PushBusEntry {
  readonly kind: PushKind;
  readonly sId: number;
  readonly type: LobbyPushType;
  readonly data: unknown;
  readonly issuedAt: number;
  readonly origin: string;
  readonly uids?: readonly string[];
  readonly gid?: number;
  readonly instanceId?: string;
}

export type PublishPushInput =
  | { readonly kind: "users"; readonly sId: number; readonly uids: readonly string[]; readonly type: LobbyPushType; readonly data: unknown }
  | { readonly kind: "realm"; readonly sId: number; readonly type: LobbyPushType; readonly data: unknown }
  | { readonly kind: "guild"; readonly sId: number; readonly gid: number; readonly type: LobbyPushType; readonly data: unknown }
  | { readonly kind: "room"; readonly sId: number; readonly instanceId: string; readonly type: LobbyPushType; readonly data: unknown };

/** 本地落地端（websocket/push.ts 注入；返回送达连接数）。 */
export interface PushLocalHandlers {
  pushToUsers(uids: readonly string[], type: LobbyPushType, data: unknown, sId: number): number;
  pushToRealm(sId: number, type: LobbyPushType, data: unknown): Promise<number> | number;
  pushToGuild(gid: number, type: LobbyPushType, data: unknown, sId: number): number;
}

export class PushBusError extends Error {
  constructor(message: string) { super(message); this.name = "PushBusError"; }
}

let localHandlers: PushLocalHandlers | null = null;
/** 各进程入口注入本地落地端（websocket 层挂全部三件；world 进程只挂 room signal 登记表）。 */
export function setPushLocalHandlers(handlers: PushLocalHandlers | null): void { localHandlers = handlers; }
export function getPushLocalHandlers(): PushLocalHandlers | null { return localHandlers; }

// ── room signal 登记表（kind=room 的本进程落地；MF4 WorldRoom 登记 onSignal） ─────────────
const roomSignals = new Map<string, (type: LobbyPushType, data: unknown) => void>();
const roomKey = (sId: number, instanceId: string): string => `${sId}:${instanceId}`;
export function registerRoomSignal(
  instanceId: string, sId: number, onSignal: (type: LobbyPushType, data: unknown) => void,
): () => void {
  const key = roomKey(sId, instanceId);
  roomSignals.set(key, onSignal);
  return () => { if (roomSignals.get(key) === onSignal) roomSignals.delete(key); };
}
export function signalRoom(instanceId: string, sId: number, type: LobbyPushType, data: unknown): number {
  const handler = roomSignals.get(roomKey(sId, instanceId));
  if (!handler) return 0;
  try { handler(type, data); return 1; } catch (e) { console.error(`[push-bus] room signal 处理异常 ${instanceId}`, e); return 0; }
}

// ── 编码 / 解析 ───────────────────────────────────────────────────────────────

const KINDS: ReadonlySet<string> = new Set(["users", "realm", "guild", "room"]);
const UID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const FIELDS: ReadonlySet<string> = new Set(["kind", "sId", "type", "data", "issuedAt", "origin", "uids", "gid", "instanceId"]);

function isPushType(type: unknown): type is LobbyPushType {
  return typeof type === "string" && Object.prototype.hasOwnProperty.call(PUSH_RUNTIME_VALIDATORS, type);
}
function validSid(sId: unknown): sId is number {
  return typeof sId === "number" && Number.isSafeInteger(sId) && sId >= 0 && sId <= 65535;
}

/**
 * 发布侧编码：校验（kind / sId / type / data validator + 字节上限 / uids 形状）→ 平铺 fields；`uids` 超上限按
 * PUSH_BUS_MAX_UIDS 切成多条。非法输入 throw PushBusError（这是发布方的编程错误，⛔ 不静默吞）。
 */
export function encodePushEntries(input: PublishPushInput, issuedAt: number, origin: string = NODE_ID): string[][] {
  if (!input || typeof input !== "object" || !KINDS.has(input.kind)) throw new PushBusError("kind 非法");
  if (!validSid(input.sId)) throw new PushBusError("sId 非法");
  if (!isPushType(input.type)) throw new PushBusError(`type 不在 LobbyPushMap：${String(input.type)}`);
  let data: unknown;
  try {
    data = PUSH_RUNTIME_VALIDATORS[input.type](input.data);
  } catch (e) {
    throw new PushBusError(`data 不合 ${input.type} 的 validator：${e instanceof Error ? e.message : String(e)}`);
  }
  const dataJson = JSON.stringify(data);
  if (Buffer.byteLength(dataJson, "utf8") > PUSH_BUS_MAX_DATA_BYTES) {
    throw new PushBusError(`data 超过 ${PUSH_BUS_MAX_DATA_BYTES} B`);
  }
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) throw new PushBusError("issuedAt 非法");
  const base = ["kind", input.kind, "sId", String(input.sId), "type", input.type, "data", dataJson,
    "issuedAt", String(issuedAt), "origin", origin];
  switch (input.kind) {
    case "users": {
      if (!Array.isArray(input.uids) || input.uids.length === 0) throw new PushBusError("uids 必须是非空数组");
      const uids = [...new Set(input.uids)];
      for (const uid of uids) if (typeof uid !== "string" || !UID_RE.test(uid)) throw new PushBusError("uid 非法");
      const entries: string[][] = [];
      for (let i = 0; i < uids.length; i += PUSH_BUS_MAX_UIDS) {
        entries.push([...base, "uids", JSON.stringify(uids.slice(i, i + PUSH_BUS_MAX_UIDS))]);
      }
      return entries;
    }
    case "realm":
      return [base];
    case "guild":
      if (!Number.isSafeInteger(input.gid) || input.gid < 1) throw new PushBusError("gid 非法");
      return [[...base, "gid", String(input.gid)]];
    case "room":
      if (typeof input.instanceId !== "string" || !UID_RE.test(input.instanceId)) throw new PushBusError("instanceId 非法");
      return [[...base, "instanceId", input.instanceId]];
    default:
      throw new PushBusError("kind 非法");
  }
}

/** 消费侧严格解析（同 kickBus.parseKickFields 范式：Redis 来的字段不可信，坏条目整条丢弃）。 */
export function parsePushFields(fields: readonly string[]): PushBusEntry | null {
  try {
    if (!Array.isArray(fields) || fields.length === 0 || fields.length % 2 !== 0) return null;
    const values = new Map<string, string>();
    for (let i = 0; i < fields.length; i += 2) {
      const key = fields[i];
      const value = fields[i + 1];
      if (typeof key !== "string" || typeof value !== "string" || !FIELDS.has(key) || values.has(key)) return null;
      values.set(key, value);
    }
    const kind = values.get("kind");
    if (kind === undefined || !KINDS.has(kind)) return null;
    const sIdRaw = values.get("sId");
    if (sIdRaw === undefined || !/^\d{1,5}$/.test(sIdRaw)) return null;
    const sId = Number(sIdRaw);
    if (!validSid(sId)) return null;
    const type = values.get("type");
    if (!isPushType(type)) return null;
    const dataRaw = values.get("data");
    if (dataRaw === undefined || Buffer.byteLength(dataRaw, "utf8") > PUSH_BUS_MAX_DATA_BYTES) return null;
    let data: unknown;
    try { data = JSON.parse(dataRaw); } catch { return null; }
    const issuedAtRaw = values.get("issuedAt");
    if (issuedAtRaw === undefined || !/^\d{1,16}$/.test(issuedAtRaw)) return null;
    const issuedAt = Number(issuedAtRaw);
    if (!Number.isSafeInteger(issuedAt)) return null;
    const origin = values.get("origin") ?? "";
    const entry: { -readonly [K in keyof PushBusEntry]: PushBusEntry[K] } = { kind: kind as PushKind, sId, type, data, issuedAt, origin };
    if (kind === "users") {
      const uidsRaw = values.get("uids");
      if (uidsRaw === undefined) return null;
      let uids: unknown;
      try { uids = JSON.parse(uidsRaw); } catch { return null; }
      if (!Array.isArray(uids) || uids.length === 0 || uids.length > PUSH_BUS_MAX_UIDS) return null;
      if (!uids.every((uid) => typeof uid === "string" && UID_RE.test(uid))) return null;
      entry.uids = uids as string[];
    } else if (kind === "guild") {
      const gidRaw = values.get("gid");
      if (gidRaw === undefined || !/^\d{1,15}$/.test(gidRaw)) return null;
      entry.gid = Number(gidRaw);
      if (!Number.isSafeInteger(entry.gid) || entry.gid < 1) return null;
    } else if (kind === "room") {
      const instanceId = values.get("instanceId");
      if (instanceId === undefined || !UID_RE.test(instanceId)) return null;
      entry.instanceId = instanceId;
    }
    return entry;
  } catch {
    return null;
  }
}

// ── 发布 ─────────────────────────────────────────────────────────────────────

export interface PublishDeps {
  xadd(fields: readonly string[]): Promise<unknown>;
  now(): number;
}
const productionPublishDeps: PublishDeps = {
  xadd: (fields) => coordClient().xadd(K_STREAM_PUSH, "*", ...fields),
  now: () => Date.now(),
};
/** 测试接缝：替换 XADD / 时钟（⛔ 生产不动）。 */
export const _pushBusTestHooks: { publish?: Partial<PublishDeps> } = {};

/**
 * 发布（best-effort）：非法输入 throw PushBusError；XADD 失败只记日志（返回已成功条数）。
 * ⛔ 本函数不做本地直投——本节点命中也经流回读（单一路径）。
 */
export async function publishPush(input: PublishPushInput, deps: Partial<PublishDeps> = {}): Promise<number> {
  const xadd = deps.xadd ?? _pushBusTestHooks.publish?.xadd ?? productionPublishDeps.xadd;
  const now = deps.now ?? _pushBusTestHooks.publish?.now ?? productionPublishDeps.now;
  const entries = encodePushEntries(input, now());
  let published = 0;
  for (const fields of entries) {
    try {
      await xadd(fields);
      published++;
    } catch (e) {
      console.error(`[push-bus] XADD 失败 kind=${input.kind} type=${input.type}（best-effort，未投递）`, e);
    }
  }
  return published;
}

// ── 消费 ─────────────────────────────────────────────────────────────────────

export type PushDeliveryOutcome = "delivered" | "stale" | "invalid-data" | "no-handlers" | "unknown" | "out-of-scope";
export type PushConsumerScope = "all" | "lobby" | "room";

/**
 * 单条落地：时间栅栏（issuedAt 早于 PUSH_BUS_MAX_AGE_MS ⇒ 丢弃）→ 再过一次 data validator → 按 kind 分发到本地落地端。
 * 返回 outcome 与送达连接数（诊断 / 测试）。
 */
export async function deliverPushEntry(
  entry: PushBusEntry, local: PushLocalHandlers | null, nowMs: number, scope: PushConsumerScope = "all",
): Promise<{ outcome: PushDeliveryOutcome; delivered: number }> {
  if ((scope === "room" && entry.kind !== "room") || (scope === "lobby" && entry.kind === "room")) {
    return { outcome: "out-of-scope", delivered: 0 };
  }
  if (nowMs - entry.issuedAt > PUSH_BUS_MAX_AGE_MS) return { outcome: "stale", delivered: 0 };
  let data: unknown;
  try {
    data = PUSH_RUNTIME_VALIDATORS[entry.type](entry.data);
  } catch {
    return { outcome: "invalid-data", delivered: 0 };
  }
  if (entry.kind === "room") {
    return { outcome: "delivered", delivered: signalRoom(entry.instanceId ?? "", entry.sId, entry.type, data) };
  }
  if (!local) return { outcome: "no-handlers", delivered: 0 };
  switch (entry.kind) {
    case "users": return { outcome: "delivered", delivered: local.pushToUsers(entry.uids ?? [], entry.type, data, entry.sId) };
    case "realm": return { outcome: "delivered", delivered: await local.pushToRealm(entry.sId, entry.type, data) };
    case "guild": return { outcome: "delivered", delivered: local.pushToGuild(entry.gid ?? 0, entry.type, data, entry.sId) };
    default: return { outcome: "unknown", delivered: 0 };
  }
}

/** 建一个消费者（非单例：int 测试可在同进程起两个各挂不同本地落地端，模拟双节点）。 */
export function createPushConsumer(
  local: () => PushLocalHandlers | null,
  opts: { name?: string; now?: () => number; client?: () => Redis; scope?: PushConsumerScope } = {},
): StreamConsumer {
  const now = opts.now ?? (() => Date.now());
  return startStreamConsumer(opts.name ?? "push", opts.client ?? coordClient, K_STREAM_PUSH, async (fields) => {
    const entry = parsePushFields(fields);
    if (!entry) {
      console.warn("[push-bus] 丢弃非法投递条目");
      return;
    }
    await deliverPushEntry(entry, local(), now(), opts.scope);
  }, { trimMs: PUSH_STREAM_TRIM_MS });
}

let consumer: StreamConsumer | null = null;
let consumerUnregister: (() => void) | null = null;

/** 本节点单例消费（LobbyRoom.onCreate / 进程入口调用，幂等）。 */
export function startPushConsumer(scope: PushConsumerScope = "all"): void {
  if (consumer) return;
  if (!isAdmissionOpen()) return;
  try {
    consumer = createPushConsumer(getPushLocalHandlers, { scope });
  } catch (error) {
    if (!isAdmissionOpen()) return;
    throw error;
  }
  consumerUnregister = defaultLifecycle.register("push-bus", () => stopPushConsumer());
}

export async function stopPushConsumer(): Promise<void> {
  const current = consumer;
  consumer = null;
  consumerUnregister?.();
  consumerUnregister = null;
  await current?.stop();
}
