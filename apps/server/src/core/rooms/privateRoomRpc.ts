/**
 * `room.prepareCreate` / `room.resolve` 的领域逻辑（Non-intrusive §6.8）。
 * endpoint 文件（websocket/room/*.ts）只做 defineRpc 转发——room 目录每个 .ts 皆端点，
 * helper 一律住本目录（core/rooms/）。
 *
 * 两个 handler 都跑在 LobbyRoom 建立的 `zoneCtx.run({sId})` 内，经 `currentZoneId()` 取
 * 权威区号（⛔ 不接受客户端自报 sId），随后向邀请码/ticket 层以显式参数逐层传递。
 *
 * resolve 只读 lease 并签票（MMO PS3）；不依赖 game 进程的 matchmaker 快照，不预留座位。
 * 容量 / start fence 留在入房端判断（GameRoom admission 或 SDK 预留阶段）。
 * resolve 错误纪律（§6.8，⛔ 不把 resolve 变成存在性预言机）：
 *  - 折叠类：码不存在 / 隔离期 / 过期 / mode·profile 不匹配 / 区不匹配 → 同一稳定码
 *    `ROOM_CODE_UNAVAILABLE`，**响应字节完全相同**（同一构造点、同一文案、不回显 code）；
 *  - 码格式非法 → core `INVALID_PAYLOAD`（request validator 已拒）；
 *  - 可重试类：`ROOM_SERVICE_UNAVAILABLE`——协调 Redis 不可达时 ⛔ 绝不降级
 *    为「码不存在」这类确定性结论（§6.5）。
 *
 * 真实原因只进服务端日志与指标，且 ⛔ 不与 code / ticket 同行记录。
 */
import { GAMEPLAY_CATALOG, type RpcReq, type RpcRes } from "@game/shared";
import { RateLimitedError, RpcFault } from "../errors";
import {
  RESOLVE_FAIL_CAPACITY,
  RESOLVE_FAIL_REFILL_PER_S,
  RESOLVE_OK_CAPACITY,
  RESOLVE_OK_REFILL_PER_S,
  RESOLVE_ZONE_FAIL_CAPACITY,
  RESOLVE_ZONE_FAIL_REFILL_PER_S,
} from "../infra/config";
import { currentZoneId, kRl } from "../infra/keys";
import { clientForKey } from "../infra/redisRoute";
import { evalshaWithReload, TOKEN_BUCKET } from "../infra/redisScripts";
import { resolveRoomProfile } from "../../rooms/core/RoomProfile";
import { issueCreationTicket, issueJoinTicket } from "./invite/AccessTicket";
import { readInviteLease } from "./invite/InviteCodeReservation";

/** 折叠类的**唯一**构造点：五种内部原因共用同一 code + 同一文案（逐对字节比较测试钉住）。 */
const ROOM_CODE_UNAVAILABLE_MESSAGE = "邀请码不可用";
const foldedUnavailable = (): RpcFault => new RpcFault("ROOM_CODE_UNAVAILABLE", ROOM_CODE_UNAVAILABLE_MESSAGE);

/**
 * resolve 专用速率桶（§6.8：枚举预算按**准入强度**设定；⛔ 复用 dispatcher 通用 RPC 桶
 * 不算满足本条——桶检查在 handler 内，不动 dispatcher 全局闸位置）。
 * scope 见 docs/SERVER.md §13 登记；kRl 前缀新 scope。
 */
export const RESOLVE_BUCKET_SCOPES = {
  zoneFail: (sId: number) => `room:resolve:zonefail:s${sId}`,
  fail: (uid: string) => `room:resolve:fail:${uid}`,
  ok: (uid: string) => `room:resolve:ok:${uid}`,
} as const;

async function consumeResolveBudget(scope: string, capacity: number, refillPerS: number): Promise<void> {
  const key = kRl(scope);
  let reply: unknown;
  try {
    reply = await evalshaWithReload(clientForKey(key), TOKEN_BUCKET, [key], [capacity, refillPerS, 1]);
  } catch (error) {
    // 限流层基础设施失败：可重试的暂时不可用（⛔ 不放行、也不降级为确定性结论）。
    console.error("[room.resolve] 速率桶基础设施失败", error);
    throw new RpcFault("ROOM_SERVICE_UNAVAILABLE", "私房服务暂不可用，请稍后重试");
  }
  if (reply === -1) throw new RateLimitedError();
}

type CatalogEntry = {
  readonly modeVersion: number;
  readonly profiles: readonly string[];
};

export async function handleRoomPrepareCreate(
  uid: string,
  payload: RpcReq<"room.prepareCreate">,
): Promise<RpcRes<"room.prepareCreate">> {
  const sId = currentZoneId();
  const entry = (GAMEPLAY_CATALOG as Readonly<Partial<Record<string, CatalogEntry>>>)[payload.mode];
  if (!entry || !entry.profiles.includes(payload.profile)) {
    throw new RpcFault("INVALID_PAYLOAD", "未知玩法或未声明的 profile");
  }
  if (payload.modeVersion !== entry.modeVersion) {
    throw new RpcFault("INVALID_PAYLOAD", "玩法版本与服务端不一致，请更新客户端");
  }
  let accessKind: string;
  try {
    accessKind = resolveRoomProfile(payload.mode, payload.profile).accessPolicy.kind;
  } catch {
    throw new RpcFault("INVALID_PAYLOAD", "profile 不可用");
  }
  if (accessKind !== "invite-code") {
    throw new RpcFault("INVALID_PAYLOAD", "该 profile 不是邀请码私房");
  }
  let issued: Awaited<ReturnType<typeof issueCreationTicket>>;
  try {
    issued = await issueCreationTicket({
      sId,
      uid,
      mode: payload.mode,
      modeVersion: payload.modeVersion,
      profile: payload.profile,
      nowMs: Date.now(),
    });
  } catch (error) {
    // 单条 Lua 可能已落盘也可能没有：结果未知（重试安全——旧 ticket 随 exp 自然回收，
    // 配额成员同样按 score 剪除）。⛔ 不降级为确定性拒绝。
    console.error("[room.prepareCreate] creation ticket 签发结果未知", error);
    throw new RpcFault("ROOM_RESULT_UNKNOWN", "私房服务暂不可用，请稍后重试");
  }
  if (issued.kind === "quota") {
    throw new RpcFault("ROOM_QUOTA_EXCEEDED", "同时开启的私房数量已达上限");
  }
  return { creationTicket: issued.ticket, expiresAt: issued.expiresAt };
}

export async function handleRoomResolve(
  uid: string,
  payload: RpcReq<"room.resolve">,
): Promise<RpcRes<"room.resolve">> {
  const sId = currentZoneId();
  // 失败预算前置（每次尝试都计费）：全区失败上限对抗多账号横扫，再扣 per-uid 失败预算。
  await consumeResolveBudget(RESOLVE_BUCKET_SCOPES.zoneFail(sId), RESOLVE_ZONE_FAIL_CAPACITY, RESOLVE_ZONE_FAIL_REFILL_PER_S);
  await consumeResolveBudget(RESOLVE_BUCKET_SCOPES.fail(uid), RESOLVE_FAIL_CAPACITY, RESOLVE_FAIL_REFILL_PER_S);

  let lease: Awaited<ReturnType<typeof readInviteLease>>;
  try {
    lease = await readInviteLease(sId, payload.code);
  } catch (error) {
    console.error("[room.resolve] 邀请码读取基础设施失败", error);
    throw new RpcFault("ROOM_SERVICE_UNAVAILABLE", "私房服务暂不可用，请稍后重试");
  }
  if (lease === "unavailable") throw foldedUnavailable();
  // mode/profile 不匹配（catalog 已不再声明该组合）与区不匹配同属折叠类。
  const entry = (GAMEPLAY_CATALOG as Readonly<Partial<Record<string, CatalogEntry>>>)[lease.mode];
  if (!entry || !entry.profiles.includes(lease.profile)) throw foldedUnavailable();

  // 成功预算独立于失败预算（§6.8：至少区分 per-uid 失败与成功预算）。
  await consumeResolveBudget(RESOLVE_BUCKET_SCOPES.ok(uid), RESOLVE_OK_CAPACITY, RESOLVE_OK_REFILL_PER_S);

  let ticket: { ticket: string; expiresAt: number };
  try {
    ticket = await issueJoinTicket({
      sId,
      uid,
      roomId: lease.roomId,
      mode: lease.mode,
      modeVersion: lease.modeVersion,
      profile: lease.profile,
      code: payload.code,
      generation: lease.generation,
      nowMs: Date.now(),
    });
  } catch (error) {
    console.error("[room.resolve] join ticket 签发基础设施失败", error);
    throw new RpcFault("ROOM_SERVICE_UNAVAILABLE", "私房服务暂不可用，请稍后重试");
  }
  return {
    roomId: lease.roomId,
    mode: lease.mode,
    modeVersion: lease.modeVersion,
    profile: lease.profile,
    joinTicket: ticket.ticket,
    expiresAt: ticket.expiresAt,
  };
}
