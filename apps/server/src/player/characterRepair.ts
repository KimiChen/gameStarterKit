/**
 * WebPlatform 角色登记 durable repair（GAME-6）。
 *
 * 正确性语义：
 * - intent 先写游戏组 durable Redis，再把原始 HTTP 失败抛回调用方，⛔ 不静默；
 * - worker 在幂等 PUT 成功前绝不删除 due member；
 * - 进程在 HTTP 前/后任意点崩溃，或多个网关同时取到同一 member，最多重复 PUT，不会丢 intent；
 * - 失败无限重试，但间隔按失败次数指数增长并封顶，达到阈值持续告警。
 */
import {
  CHARACTER_REPAIR_ALERT_ATTEMPTS,
  CHARACTER_REPAIR_BACKOFF_BASE_MS,
  CHARACTER_REPAIR_BACKOFF_MAX_MS,
  CHARACTER_REPAIR_BATCH_SIZE,
  CHARACTER_REPAIR_CONCURRENCY,
  CHARACTER_REPAIR_POLL_MS,
} from "../core/infra/config";
import {
  K_CHARACTER_REPAIR_ATTEMPTS,
  K_CHARACTER_REPAIR_DUE,
} from "../core/infra/keys";
import { clientForKey } from "../core/infra/redisRoute";
import { defineScript, evalshaWithReload } from "../core/infra/redisScripts";
import {
  webPlatformClient,
  type WebPlatformClient,
} from "../platform/webPlatformClient";
import { assertAdmissionOpen, defaultLifecycle } from "../core/infra/lifecycle";
import { storedInt } from "../core/infra/numbers";
import { markCharacterRegistrationReady } from "./characterState";

export interface CharacterRepairIntent {
  userId: string;
  serverId: number;
}

export interface CharacterRepairPassResult {
  selected: number;
  succeeded: number;
  failed: number;
  malformed: number;
}

export interface CharacterRepairPassOptions {
  /** 测试注入；生产缺省使用当前时间。 */
  nowMs?: number;
  /** 测试注入；生产缺省使用 HTTP-only WebPlatform client。 */
  client?: Pick<WebPlatformClient, "registerCharacter">;
  batchSize?: number;
  concurrency?: number;
}

const repairRedis = () => clientForKey(K_CHARACTER_REPAIR_DUE);

/**
 * 失败重排与并发成功清理互斥：
 * - due 已被另一实例成功清掉 ⇒ 原子返回 missing，不重建 attempts；
 * - due 仍在 ⇒ 原子推进 attempts，并只把 nextAttemptMs 向后推。
 */
const CHARACTER_REPAIR_RESCHEDULE = defineScript("characterRepairReschedule", `
local current = redis.call('ZSCORE', KEYS[1], ARGV[1])
if not current then return {0, 0} end

local attempts = redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
local exponent = math.min(math.max(attempts - 1, 0), 30)
local delay = math.min(tonumber(ARGV[4]), tonumber(ARGV[3]) * (2 ^ exponent))
local nextAt = tonumber(ARGV[2]) + delay
if nextAt > tonumber(current) then
  redis.call('ZADD', KEYS[1], nextAt, ARGV[1])
else
  nextAt = tonumber(current)
end
return {attempts, nextAt}
`);

const assertIntent = (userId: string, serverId: number): void => {
  if (userId.length < 1 || userId.length > 128) {
    throw new Error("角色登记 repair intent 的 userId 非法");
  }
  if (!Number.isInteger(serverId) || serverId < 0 || serverId > 65535) {
    throw new Error(`角色登记 repair intent 的 serverId 非法：${String(serverId)}`);
  }
};

/** member 使用 JSON tuple，避免假设 WebPlatform userId 的字符集或手写分隔转义。 */
export function characterRepairMember(userId: string, serverId: number): string {
  assertIntent(userId, serverId);
  return JSON.stringify([userId, serverId]);
}

export function parseCharacterRepairMember(member: string): CharacterRepairIntent | null {
  try {
    const value = JSON.parse(member) as unknown;
    if (!Array.isArray(value) || value.length !== 2) { return null; }
    const [userId, serverId] = value;
    if (typeof userId !== "string"
      || userId.length < 1
      || userId.length > 128
      || !Number.isInteger(serverId)
      || serverId < 0
      || serverId > 65535
      || !Number.isSafeInteger(serverId)) {
      return null;
    }
    return { userId, serverId };
  } catch {
    return null;
  }
}

const assertMulti = (replies: [Error | null, unknown][] | null, operation: string): void => {
  if (replies === null) {
    throw new Error(`character repair ${operation} transaction aborted`);
  }
  for (const [error] of replies) {
    if (error) { throw error; }
  }
};

/**
 * 同步 PUT 失败后的 durable 落点。已存在的 intent 保留当前退避水位，避免玩家反复进房把
 * worker 的退避不断重置为 1s；首次 intent 从一次失败、base delay 开始。
 */
export async function enqueueCharacterRepairIntent(
  userId: string,
  serverId: number,
  nowMs = Date.now(),
): Promise<void> {
  const member = characterRepairMember(userId, serverId);
  const redis = repairRedis();
  const replies = await redis.multi()
    .hsetnx(K_CHARACTER_REPAIR_ATTEMPTS, member, "1")
    .zadd(K_CHARACTER_REPAIR_DUE, "NX", nowMs + CHARACTER_REPAIR_BACKOFF_BASE_MS, member)
    .exec();
  assertMulti(replies, "enqueue");
}

/** PUT 成功后的唯一清理出口；两个 key 同 slot，以 MULTI 一起清除。 */
export async function clearCharacterRepairIntent(userId: string, serverId: number): Promise<void> {
  await clearCharacterRepairMember(characterRepairMember(userId, serverId));
}

async function clearCharacterRepairMember(member: string): Promise<void> {
  const replies = await repairRedis().multi()
    .zrem(K_CHARACTER_REPAIR_DUE, member)
    .hdel(K_CHARACTER_REPAIR_ATTEMPTS, member)
    .exec();
  assertMulti(replies, "clear");
}

/**
 * 建角同步路径：先尝试幂等 PUT；失败则 durable 落 intent 后仍抛原错误；成功则清理历史 intent。
 * Redis 也不可用时用 AggregateError 同时暴露两条故障，绝不把“未登记且未持久化”伪装成成功。
 */
export async function registerCharacterWithRepair(
  userId: string,
  serverId: number,
  client: Pick<WebPlatformClient, "registerCharacter"> = webPlatformClient,
): Promise<void> {
  try {
    await client.registerCharacter(userId, serverId);
  } catch (error) {
    try {
      await enqueueCharacterRepairIntent(userId, serverId);
    } catch (repairError) {
      throw new AggregateError(
        [error, repairError],
        `WebPlatform 角色登记失败且 durable repair intent 写入失败 uid=${userId} sId=${serverId}`,
      );
    }
    throw error;
  }
  await clearCharacterRepairIntent(userId, serverId);
}

/**
 * 失败后推进 attempts + nextAttemptMs。due member 此前一直存在；即使本函数中途因 Redis
 * 抖动失败，它仍保持旧 score、下轮会更早重试，语义是“可能重复，绝不丢失”。
 */
async function rescheduleCharacterRepairMember(
  member: string,
  nowMs: number,
): Promise<{ active: boolean; attempts: number; nextAttemptMs: number }> {
  const raw = await evalshaWithReload(
    repairRedis(),
    CHARACTER_REPAIR_RESCHEDULE,
    [K_CHARACTER_REPAIR_DUE, K_CHARACTER_REPAIR_ATTEMPTS],
    [
      member,
      nowMs,
      CHARACTER_REPAIR_BACKOFF_BASE_MS,
      CHARACTER_REPAIR_BACKOFF_MAX_MS,
    ],
  ) as [number | string, number | string];
  const attempts = storedInt(raw?.[0] ?? 0, "character repair attempts", { min: 0, max: Number.MAX_SAFE_INTEGER });
  const nextAttemptMs = storedInt(raw?.[1] ?? 0, "character repair nextAttemptMs", { min: 0, max: Number.MAX_SAFE_INTEGER });
  return { active: attempts > 0, attempts, nextAttemptMs };
}

const errorSummary = (error: unknown): string => {
  const text = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
  return text.slice(0, 300);
};

const shouldAlert = (attempts: number): boolean =>
  attempts >= CHARACTER_REPAIR_ALERT_ATTEMPTS
  && attempts % CHARACTER_REPAIR_ALERT_ATTEMPTS === 0;

async function processMember(
  member: string,
  nowMs: number,
  client: Pick<WebPlatformClient, "registerCharacter">,
): Promise<"succeeded" | "failed" | "malformed"> {
  const intent = parseCharacterRepairMember(member);
  if (!intent) {
    const state = await rescheduleCharacterRepairMember(member, nowMs);
    if (!state.active) { return "malformed"; }
    console.error(
      `[character-repair] 非法 durable intent，保留并退避等待人工处置`
      + ` attempts=${state.attempts} member=${member.slice(0, 160)}`,
    );
    return "malformed";
  }

  try {
    await client.registerCharacter(intent.userId, intent.serverId);
  } catch (error) {
    let state: { active: boolean; attempts: number; nextAttemptMs: number };
    try {
      state = await rescheduleCharacterRepairMember(member, nowMs);
    } catch (repairError) {
      // HTTP 与 durable reschedule 同时失败是最高优先级故障；due member 仍在旧 score，不会丢，
      // 但必须把两条原因都显式带到 worker 顶层告警。
      throw new AggregateError(
        [error, repairError],
        `character repair PUT 与 durable reschedule 同时失败 uid=${intent.userId} sId=${intent.serverId}`,
      );
    }
    if (!state.active) {
      // 另一实例已成功 PUT + 清 intent；本实例的失败结果不应复活它。
      return "failed";
    }
    const detail = `uid=${intent.userId} sId=${intent.serverId}`
      + ` attempts=${state.attempts} nextAttemptMs=${state.nextAttemptMs}`
      + ` error=${errorSummary(error)}`;
    if (shouldAlert(state.attempts)) {
      console.error(`[character-repair] ⚠⚠ 角色登记持续失败 ${detail}`);
    } else {
      console.warn(`[character-repair] 角色登记失败，已 durable 退避 ${detail}`);
    }
    return "failed";
  }

  // 远端成功之后才删；若这里崩溃/Redis 失败，intent 保留，下轮仅重复幂等 PUT。
  await markCharacterRegistrationReady(intent.userId, intent.serverId);
  await clearCharacterRepairMember(member);
  return "succeeded";
}

/**
 * 处理一轮已到期 intent。供测试和运维探针显式调用；Redis/WebPlatform 基础设施异常会 reject，
 * ⛔ 不伪装成“本轮 0 条”。
 */
export async function processCharacterRepairOnce(
  options: CharacterRepairPassOptions = {},
): Promise<CharacterRepairPassResult> {
  const nowMs = options.nowMs ?? Date.now();
  const batchSize = Math.max(1, Math.min(options.batchSize ?? CHARACTER_REPAIR_BATCH_SIZE, 10_000));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? CHARACTER_REPAIR_CONCURRENCY, batchSize));
  const members = await repairRedis().zrangebyscore(
    K_CHARACTER_REPAIR_DUE,
    "-inf",
    nowMs,
    "LIMIT",
    0,
    batchSize,
  );
  const result: CharacterRepairPassResult = {
    selected: members.length,
    succeeded: 0,
    failed: 0,
    malformed: 0,
  };
  if (members.length === 0) { return result; }

  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, members.length) }, async () => {
    while (cursor < members.length) {
      const member = members[cursor++];
      const outcome = await processMember(
        member,
        options.nowMs ?? Date.now(),
        options.client ?? webPlatformClient,
      );
      result[outcome]++;
    }
  });
  await Promise.all(runners);
  return result;
}

interface CharacterRepairWorkerState {
  readonly generation: number;
  started: boolean;
  timer: NodeJS.Timeout | null;
  pass: Promise<CharacterRepairPassResult> | null;
  unregister: (() => void) | null;
  stopPromise: Promise<void> | null;
}

let workerGeneration = 0;
let activeWorker: CharacterRepairWorkerState | null = null;

const scheduleWorkerPass = (state: CharacterRepairWorkerState, delayMs: number): void => {
  if (!state.started || state.timer || activeWorker !== state) { return; }
  state.timer = setTimeout(() => {
    state.timer = null;
    // A newer generation may have started while an older stop awaited its pass.
    if (!state.started || activeWorker !== state) { return; }
    const pass = processCharacterRepairOnce();
    state.pass = pass;
    void pass.catch((error) => {
      console.error("[character-repair] worker 本轮失败；intent 保留，下轮继续", error);
    }).finally(() => {
      if (state.pass === pass) { state.pass = null; }
      if (state.started && activeWorker === state) {
        scheduleWorkerPass(state, CHARACTER_REPAIR_POLL_MS);
      }
    });
  }, delayMs);
  // worker 属网关附属任务，不应单独阻止测试/停服进程退出。
  state.timer.unref();
};

async function stopWorkerState(state: CharacterRepairWorkerState): Promise<void> {
  if (state.stopPromise) { return state.stopPromise; }
  state.started = false;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  // Detach this generation immediately. A restart can now install a new
  // state while the old HTTP pass is still awaiting external I/O.
  if (activeWorker === state) { activeWorker = null; }
  const pass = state.pass;
  const unregister = state.unregister;
  state.stopPromise = (async () => {
    if (pass) {
      await pass.catch(() => { /* 循环侧已告警；stop 只负责等待退出 */ });
    }
    // Always unregister the captured generation. Never consult the mutable
    // global active state here, or an old stop can unregister a new worker.
    unregister?.();
    state.unregister = null;
  })();
  return state.stopPromise;
}

/** 网关启动入口；幂等，多次调用只保留一个本进程循环。 */
export function startCharacterRepairWorker(): void {
  if (activeWorker?.started) { return; }
  if (defaultLifecycle.isClosed) {
    // A real shutdown is terminal; an embedded test can reopen explicitly via
    // resetAdmission before asking a worker to start again.
    assertAdmissionOpen();
    defaultLifecycle.reset();
  }
  if (!defaultLifecycle.isClosed) { assertAdmissionOpen(); }
  const state: CharacterRepairWorkerState = {
    generation: ++workerGeneration,
    started: true,
    timer: null,
    pass: null,
    unregister: null,
    stopPromise: null,
  };
  activeWorker = state;
  state.unregister = defaultLifecycle.register(
    `character-repair:${state.generation}`,
    () => stopWorkerState(state),
  );
  scheduleWorkerPass(state, 0);
}

/** 测试/优雅停服：停止调度并等待当前有界 HTTP pass 收尾。 */
export async function stopCharacterRepairWorker(): Promise<void> {
  const state = activeWorker;
  if (!state) { return; }
  await stopWorkerState(state);
}
