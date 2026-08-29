/**
 * 建角（DUAL_MODE §2.6 / M12a）：玩家**首进某区**时创建该区角色。
 *
 * 两件事，⚠ **顺序固定（M12d 评审后反转，见下）**：
 *  ① `s{sId}_user` per-zone 玩法档（core createUser，唯一合法建点 09·R2）——**先建**；
 *  ② WebPlatform character registry（durable 区成员标记，F4「本区建过角没」判据 + ul 源）——后写。
 *
 * ⚠ **为什么是「档先、char 行后」**（原为反序，是个不可自愈的毒态）：
 * F4 只在 **ABSENT**（热档与冷档全无）分支查 WebPlatform character registry。
 * - 旧序（char 行先）：两步之间崩溃 ⇒ 有 char 行、无档无冷档 ⇒ 下次 `ensureLive` 判 ABSENT + has=true
 *   ⇒ **永久 `USER_DATA_LOST`**，永远走不到 createUser（注释却写着"下次自愈"，与状态机相反）。
 * - 新序（档先）：崩溃 ⇒ 有档 ⇒ 状态是 LIVE、F4 根本不参与 ⇒ 下次进区补写 char 行，**自愈**。
 *   且 F4 判据反而更硬：**有 char 行 ⇒ 曾建过档** ⇒ 现在全无 = 真丢失。
 * 代价：崩溃窗内该区暂不出现在 `ul`（我的区），下次进区即补——非正确性问题。
 * 两步都幂等（createUser 'exists'、char 行 ODKU no-op）。
 *
 * WebPlatform 登录只建账号、不写游戏 Redis；无论 sId=0 还是分区服，玩法档都只在本函数创建。
 */
import { STAMINA_MAX } from "@game/shared";
import { zoneCtx } from "../core/infra/keys";
import { createCharacterUser } from "../core/userRecord";
import { ensureLive, invalidateUserNegcache } from "../core/archive/thaw";
import { webPlatformClient } from "../platform/webPlatformClient";
import { enqueueCharacterRepairIntent, registerCharacterWithRepair } from "./characterRepair";
import {
  markCharacterRegistrationReady,
  readCharacterRegistration,
  type CharacterRegistrationInfo,
  type CharacterRegistrationState,
} from "./characterState";
import {
  CHARACTER_READY_TIMEOUT_MAX_MS,
  CHARACTER_READY_TIMEOUT_MS,
  CHARACTER_REGISTRATION_RECHECK_MS,
} from "../core/infra/config";

/** 首进区角色初始字段（与登录建号一致；缺 musicOn/sfxOn = 读侧默认开，07 字段表）。 */
const zoneCharInit = (): Record<string, string> => {
  const now = Date.now();
  return {
    registerTime: String(now),
    stamina: String(STAMINA_MAX),
    lastStaminaRecoverAt: "0", // 满体力：恢复计时未开始
    avatarId: "-1",
  };
};

/** 幂等建角：**先建 `s{sId}_user`，再 HTTP 登记角色**（顺序理由见文件头）。任一阶段失败都会向上抛，拒绝本次 join；repair intent 供后续重试收敛。 */
export interface CharacterInitializerDependencies {
  /** ensureLive 代表 Redis 快路径及必要时的 MySQL archive 判定/thaw。 */
  ensureLive(uid: string, sId: number): Promise<void>;
  /** createUser 是 Redis 建档的原子写入。 */
  createUser(uid: string, initFields: Record<string, string>): Promise<"ok" | "exists">;
  /** registerCharacterWithRepair 代表 WebPlatform PUT 与 durable repair 落点。 */
  registerCharacterWithRepair(uid: string, sId: number): Promise<void>;
  /** Authoritative fallback for legacy profiles without a local marker. */
  hasCharacter?(uid: string, sId: number): Promise<boolean>;
  /** Persist a repair intent when the legacy existence probe itself is unavailable. */
  enqueueCharacterRepairIntent?(uid: string, sId: number): Promise<void>;
  /** Durable local marker used to avoid an external PUT on every hot-profile join. */
  readCharacterRegistration?(uid: string, sId: number):
    Promise<CharacterRegistrationInfo | CharacterRegistrationState>;
  markCharacterRegistrationReady?(uid: string, sId: number, checkedAtMs?: number): Promise<void>;
  /** Test clock; production defaults to Date.now. */
  nowMs?(): number;
  /** How long a ready marker may bypass the external authority. */
  registrationRecheckMs?: number;
  /** 建角成功后的 Redis 负缓存失效。 */
  invalidateUserNegcache(uid: string): Promise<void>;
}

const defaultCharacterInitializerDependencies: CharacterInitializerDependencies = {
  ensureLive,
  createUser: createCharacterUser,
  registerCharacterWithRepair,
  hasCharacter: (uid, sId) => webPlatformClient.hasCharacter(uid, sId),
  enqueueCharacterRepairIntent,
  readCharacterRegistration,
  markCharacterRegistrationReady,
  nowMs: () => Date.now(),
  registrationRecheckMs: CHARACTER_REGISTRATION_RECHECK_MS,
  invalidateUserNegcache,
};

const normalizeRegistration = (
  value: CharacterRegistrationInfo | CharacterRegistrationState,
): CharacterRegistrationInfo => {
  if (value !== null && typeof value === "object" && "state" in value) {
    const info = value as CharacterRegistrationInfo;
    return {
      state: info.state === "pending" || info.state === "ready" ? info.state : null,
      checkedAtMs: Number.isSafeInteger(info.checkedAtMs) && (info.checkedAtMs as number) >= 0
        ? info.checkedAtMs
        : null,
    };
  }
  // A legacy test/injected reader that only knows the marker state has no
  // freshness proof, so it deliberately falls through to an authority probe.
  return { state: value, checkedAtMs: null };
};

const readClock = (deps: CharacterInitializerDependencies): number => {
  const now = deps.nowMs ? deps.nowMs() : Date.now();
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError(`character registration clock 非法：${String(now)}`);
  }
  return now;
};

const isFreshReadyMarker = (
  info: CharacterRegistrationInfo,
  nowMs: number,
  recheckMs: number,
): boolean => info.state === "ready"
  && info.checkedAtMs !== null
  && nowMs >= info.checkedAtMs
  && nowMs - info.checkedAtMs < recheckMs;

/**
 * 建角编排的显式依赖边界。生产调用走默认实现；测试可以在任一外部阶段注入
 * deferred/rejection，验证 Lobby ready gate 的超时和短路语义，而不伪造模块缓存。
 */
export async function ensureCharacterWithDependencies(
  uid: string,
  sId: number,
  deps: CharacterInitializerDependencies = defaultCharacterInitializerDependencies,
): Promise<void> {
  const recheckMs = deps.registrationRecheckMs ?? CHARACTER_REGISTRATION_RECHECK_MS;
  if (!Number.isSafeInteger(recheckMs) || recheckMs < 1) {
    throw new RangeError(`character registration recheck window 非法：${String(recheckMs)}`);
  }
  // ⚠ **ensureLive 先于 createUser**：冻结回流用户先 thaw 恢复真档，
  // ⛔ 绝不在冻结档上 createUser 建空档（空档上先发生写会致 archive 被删、真档永久丢失）。
  // ⚠ ensureLive 内部抢 lock:{uid}——本函数不得在 withUser 锁内调用（onJoin best-effort 调，安全）。
  await zoneCtx.run({ sId }, async () => {
    await deps.ensureLive(uid, sId);                   // 冻结→thaw 恢复；真新→ABSENT(F4 判)；热→无；真丢→抛
    const created = await deps.createUser(uid, zoneCharInit()); // 幂等：热/解冻→'exists'，真新才建
    const registration = normalizeRegistration(deps.readCharacterRegistration
      ? await deps.readCharacterRegistration(uid, sId)
      : null);
    const nowMs = readClock(deps);
    // New profiles carry `pending` atomically.  A ready marker is the local
    // fast path only inside the recheck window.  Legacy profiles and expired
    // markers consult the external authority so a pre-marker crash or an
    // external deletion can still self-heal.
    if (created === "exists" && isFreshReadyMarker(registration, nowMs, recheckMs)) {
      await deps.invalidateUserNegcache(uid);           // 建后失效负缓存（09·F4）
      return;
    }

    if (created === "exists" && (registration.state === null || registration.state === "ready")) {
      let registered: boolean;
      try {
        registered = deps.hasCharacter ? await deps.hasCharacter(uid, sId) : false;
      } catch (error) {
        try {
          await deps.enqueueCharacterRepairIntent?.(uid, sId);
        } catch (repairError) {
          throw new AggregateError(
            [error, repairError],
            `WebPlatform 角色存在性查询失败且 durable repair intent 写入失败 uid=${uid} sId=${sId}`,
          );
        }
        throw error;
      }
      if (registered) {
        if (deps.markCharacterRegistrationReady) {
          await deps.markCharacterRegistrationReady(uid, sId, readClock(deps));
        }
        await deps.invalidateUserNegcache(uid);
        return;
      }
    }

    await deps.registerCharacterWithRepair(uid, sId);   // pending/新档：失败 durable 留 intent 后仍向上抛
    if (deps.markCharacterRegistrationReady) {
      await deps.markCharacterRegistrationReady(uid, sId, readClock(deps));
    }
    await deps.invalidateUserNegcache(uid);             // 建后失效负缓存（09·F4）
  });
}

/** 生产默认建角入口；保留独立函数名供 Lobby/其他调用方使用。 */
export function ensureCharacter(uid: string, sId: number): Promise<void> {
  return ensureCharacterWithDependencies(uid, sId);
}

export const CHARACTER_READY_CLOSED_CODE = "CHARACTER_READY_CLOSED" as const;

export class CharacterReadyClosedError extends Error {
  readonly code = CHARACTER_READY_CLOSED_CODE;

  constructor() {
    super("角色初始化已停止：服务正在关闭");
    this.name = "CharacterReadyClosedError";
  }
}

/**
 * Validate the caller-provided deadline before creating a flight or arming a
 * timer.  Node clamps NaN, Infinity and values above its timer range to a
 * near-immediate timeout, which would otherwise turn a caller bug into a
 * misleading ready failure.
 */
export function validateCharacterReadyTimeoutMs(timeoutMs: unknown): number {
  if (typeof timeoutMs !== "number"
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 0
    || timeoutMs > CHARACTER_READY_TIMEOUT_MAX_MS) {
    throw new RangeError(
      `角色初始化 timeoutMs 非法：「${String(timeoutMs)}」——须为 0..${CHARACTER_READY_TIMEOUT_MAX_MS} 的安全整数`,
    );
  }
  return timeoutMs;
}

/** A caller-supplied initializer makes the ownership/race contract deterministic in tests. */
export type CharacterReadyInitializer =
  (uid: string, sId: number) => void | PromiseLike<void>;

interface CharacterReadyFlight {
  readonly work: Promise<void>;
}

/**
 * Coalesces the underlying character initializer while giving every caller
 * its own bounded wait.
 *
 * The map deliberately owns `work`, rather than a timeout-wrapped promise.
 * A caller timing out must not release ownership while Redis/MySQL/WebPlatform
 * writes are still in progress: a second join during that interval must await
 * the same work.  The entry is removed only after the underlying work settles.
 */
export class CharacterReadyCoordinator {
  private readonly flights = new Map<string, CharacterReadyFlight>();
  private admissionOpen = true;
  private draining: Promise<void> | null = null;

  constructor(
    private readonly initializer: CharacterReadyInitializer = ensureCharacter,
  ) {}

  ensure(
    uid: string,
    sId: number,
    timeoutMs = CHARACTER_READY_TIMEOUT_MS,
  ): Promise<void> {
    const deadlineMs = validateCharacterReadyTimeoutMs(timeoutMs);
    if (!this.admissionOpen) {
      // Keep the Promise-returning API stable for LobbyRoom's `await` boundary;
      // callers can map this to their normal join/availability error.
      return Promise.reject(new CharacterReadyClosedError());
    }

    const key = `${uid}\u0000${sId}`;
    const existing = this.flights.get(key);
    const flight = existing ?? this.startFlight(key, uid, sId);
    return this.waitForFlight(flight.work, uid, sId, deadlineMs);
  }

  /** Stop admitting new work while allowing already-started work to settle. */
  clear(): void {
    this.admissionOpen = false;
  }

  /** Re-open admission without duplicating a flight that is still in progress. */
  reset(): void {
    this.admissionOpen = true;
  }

  isAdmissionOpen(): boolean {
    return this.admissionOpen;
  }

  /**
   * Close admission and wait until every underlying initializer has settled.
   * The drain intentionally resolves after rejected work too: shutdown must
   * continue to close Redis/MySQL/WebPlatform, while the caller-specific wait
   * promises still receive the original initializer error.
   */
  drain(): Promise<void> {
    this.admissionOpen = false;
    if (this.draining) { return this.draining; }

    const run = (async () => {
      // A reset is useful in embedded test runners.  Re-check the map after
      // each batch so a flight that was already admitted before `clear()` is
      // never left behind, even if it settles during the first snapshot.
      while (this.flights.size > 0) {
        const flights = [...new Set(this.flights.values())];
        await Promise.allSettled(flights.map((flight) => flight.work));
        await Promise.resolve();
      }
    })();
    let draining!: Promise<void>;
    draining = run.finally(() => {
      if (this.draining === draining) { this.draining = null; }
    });
    this.draining = draining;
    return draining;
  }

  private startFlight(key: string, uid: string, sId: number): CharacterReadyFlight {
    // Install the flight before invoking user/injected code.  This makes
    // re-entrant calls share the same work while still starting the initializer
    // immediately (rather than adding an avoidable microtask delay).  A
    // synchronously thrown initializer is converted to the same observed
    // rejected promise as an async failure.
    let resolveWork!: () => void;
    let rejectWork!: (error: unknown) => void;
    const work = new Promise<void>((resolve, reject) => {
      resolveWork = resolve;
      rejectWork = reject;
    });
    const flight: CharacterReadyFlight = { work };
    this.flights.set(key, flight);

    // Observe both outcomes independently of caller timeouts.  The rejection
    // handler intentionally does not rethrow, so this observer can never become
    // an unhandled rejection; callers still receive the original `work` error.
    void work.then(
      () => { this.finishFlight(key, flight); },
      () => { this.finishFlight(key, flight); },
    );
    try {
      Promise.resolve(this.initializer(uid, sId)).then(resolveWork, rejectWork);
    } catch (error) {
      rejectWork(error);
    }
    return flight;
  }

  private finishFlight(key: string, flight: CharacterReadyFlight): void {
    if (this.flights.get(key) === flight) {
      this.flights.delete(key);
    }
  }

  private waitForFlight(
    work: Promise<void>,
    uid: string,
    sId: number,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) { return; }
        settled = true;
        reject(new Error(`角色初始化超时 uid=${uid} sId=${sId}`));
      }, timeoutMs);
      timer.unref?.();

      work.then(() => {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        resolve();
      }, (error: unknown) => {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }
}

const characterReadyCoordinator = new CharacterReadyCoordinator();

export function ensureCharacterReady(
  uid: string,
  sId: number,
  timeoutMs = CHARACTER_READY_TIMEOUT_MS,
): Promise<void> {
  return characterReadyCoordinator.ensure(uid, sId, timeoutMs);
}

/** 停服时关闭 admission；未完成的底层 work 保留合流所有权，直到真正 settle。 */
export function clearCharacterReadyFlights(): void {
  characterReadyCoordinator.clear();
}

/** 停服边界：在关闭 Redis/MySQL/WebPlatform 前等待已接纳的建角 work 收尾。 */
export function drainCharacterReadyFlights(): Promise<void> {
  return characterReadyCoordinator.drain();
}

/** 测试/同进程重启：重开 admission，但不复制仍在执行的底层 initializer。 */
export function resetCharacterReadyFlights(): void {
  characterReadyCoordinator.reset();
}

/** 当前是否仍接受新的 ready 请求（启动/停服诊断与 focused tests 使用）。 */
export function isCharacterReadyAdmissionOpen(): boolean {
  return characterReadyCoordinator.isAdmissionOpen();
}
