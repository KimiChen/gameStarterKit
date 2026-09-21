/** Snake personal-run economy boundary. Production always disables the demo adapter. */

import { createHash } from "node:crypto";
import { clientFor } from "../../../core/infra/redisRoute";
import { equippedSkinIdOf } from "./cosmeticProfile";
import { snakeCosmeticStore } from "./cosmeticRpc";
import { kSnakeUser } from "./keys";
import { mergeStoredSnakeFields, enqueueSnakeProfileWrite } from "./profilePersistence";

export const ONLINE_COIN_RELIVE_PLAYER_RELEASED = false;

/**
 * run 起始皮肤解析。⛔ 永不读取 join 自报值——`uid` 由服务端从认证上下文反查后传入
 * （拍板 A「服务端单方面权威」，apps/plugins/snake/README.md §7）。
 *
 * ⚠ `resolve` 必须是**同步**的：`createPlayer` 在同步路径上建实体，不能在这里 await Redis。
 */
export interface SnakeRunSkinResolverInput {
    readonly roomEpochId: string;
    readonly sessionId: string;
    /** 认证 uid；未认证或测试 fixture 未注入身份时为 `null`。 */
    readonly uid: string | null;
}

export interface SnakeRunSkinResolver {
    resolve(input: SnakeRunSkinResolverInput): number;
}

/**
 * 读本次入房前从 Redis 水合的衣柜快照（`onBeforeAdmission` await 预热）；不依赖 lobby 进程内存。
 * 未预热、uid 缺失或装备值失效时回退默认皮肤 1，⛔ 绝不因衣柜数据异常阻塞进房。
 */
export const DEFAULT_SNAKE_RUN_SKIN_RESOLVER: SnakeRunSkinResolver = Object.freeze({
    resolve: ({ uid }: SnakeRunSkinResolverInput) => equippedSkinIdOf(uid),
});

export interface ReliveEconomyInput {
    readonly uid: string;
    readonly roomEpochId: string;
    readonly runId: string;
    readonly deathSeq: number;
    readonly clientReqId: string;
    readonly coinCost: number;
}

export type ReliveEconomyResult =
    | { readonly kind: "success"; readonly receiptId: string; readonly balanceAfter: number }
    | { readonly kind: "insufficientCoins"; readonly balanceAfter: number }
    | { readonly kind: "retryableFailure" }
    | { readonly kind: "systemFailure" };

export interface ReliveEconomyPort {
    /** Production startup assertions depend on this stable discriminator. */
    readonly kind: "s2-test" | "demo-redis" | "disabled";
    balance(input: Pick<ReliveEconomyInput, "uid">): number;
    commit(input: ReliveEconomyInput): ReliveEconomyResult;
}

export type DeterministicReliveOutcome = ReliveEconomyResult["kind"];

/**
 * 非资产型测试账本。operation key 幂等；同一请求重放返回逐字相同的测试结果。
 * 可注入 outcome selector 覆盖四个 S2 分支，默认成功且余额只存在于本对象内存。
 */
export class DeterministicTestReliveEconomy implements ReliveEconomyPort {
    readonly kind = "s2-test" as const;
    private readonly results = new Map<string, ReliveEconomyResult>();
    private balanceValue: number;

    constructor(
        initialBalance = 10_000,
        private readonly outcome: (input: ReliveEconomyInput) => DeterministicReliveOutcome = () => "success",
    ) {
        if (!Number.isSafeInteger(initialBalance) || initialBalance < 0) {
            throw new RangeError("S2 test relive balance must be a non-negative safe integer");
        }
        this.balanceValue = initialBalance;
    }

    commit(input: ReliveEconomyInput): ReliveEconomyResult {
        const key = `${input.roomEpochId}\u0000${input.runId}\u0000${input.deathSeq}\u0000${input.clientReqId}`;
        const previous = this.results.get(key);
        if (previous) return previous;
        const selected = this.outcome(input);
        let result: ReliveEconomyResult;
        if (selected === "success" && this.balanceValue >= input.coinCost) {
            this.balanceValue -= input.coinCost;
            result = {
                kind: "success",
                receiptId: `s2-test:${input.runId}:${input.deathSeq}:${input.clientReqId}`,
                balanceAfter: this.balanceValue,
            };
        } else if (selected === "success" || selected === "insufficientCoins") {
            result = { kind: "insufficientCoins", balanceAfter: this.balanceValue };
        } else if (selected === "retryableFailure") {
            result = { kind: "retryableFailure" };
        } else {
            result = { kind: "systemFailure" };
        }
        this.results.set(key, result);
        return result;
    }

    balance(_input: Pick<ReliveEconomyInput, "uid">): number { return this.balanceValue; }
    get testBalance(): number { return this.balanceValue; }
    get commitCount(): number { return this.results.size; }
}

export const SNAKE_DEMO_INITIAL_COINS = 10_000;

export interface DemoRelivePersistenceRecord {
    readonly uid: string;
    readonly coinCost: number;
    readonly initialBalance: number;
}

export type DemoRelivePersistence = (record: DemoRelivePersistenceRecord) => Promise<void>;

const demoOperationKey = (input: ReliveEconomyInput): string =>
    `${input.uid}\u0000${input.roomEpochId}\u0000${input.runId}\u0000${input.deathSeq}`;
const demoBalances = new Map<string, number>();
const demoResults = new Map<string, ReliveEconomyResult>();
/**
 * 已从 Redis 回灌过余额的 uid（失败不记，下次重试）。⚠ 与衣柜 profile 同一道理：
 * 没回灌过的钱包是「默认 10000」，不能据此作真实余额裁决。F13 的旧整档写回曾将回访余额
 * 重置成初始值；如今镜像改增量 CAS，仍保留入房回灌与冷档写回闸。
 */
const coinHydrated = new Set<string>();
const coinHydrations = new Map<string, Promise<void>>();

/** 该 uid 的进程内 demo 余额是否可信（= 能安全写回 Redis）。 */
export function isDemoCoinBalanceHydrated(uid: string): boolean {
    return coinHydrated.has(uid);
}

export type DemoCoinHydration = (uid: string) => Promise<string | null>;

const hydrateCoinFromRedis: DemoCoinHydration = async (uid) =>
    clientFor(uid).hget(kSnakeUser(uid), "coinBalance");

/**
 * 入房前把该 uid 的 demo 余额从 Redis 回灌进来；并发调用共用同一次在途请求并都等它。
 * 读不到（键不存在）也算回灌成功——那就是「新玩家用初始余额」这个事实；
 * 只有 Redis 报错才不标记，留给下次重试，在那之前 `isDemoCoinBalanceHydrated` 为 false。
 */
export async function hydrateDemoCoinBalance(
    uid: string,
    options: { readonly hydration?: DemoCoinHydration; readonly initialBalance?: number;
        readonly reportError?: (error: unknown) => void } = {},
): Promise<void> {
    if (coinHydrated.has(uid)) return;
    let inFlight = coinHydrations.get(uid);
    if (!inFlight) {
        const hydration = options.hydration ?? hydrateCoinFromRedis;
        const initialBalance = options.initialBalance ?? SNAKE_DEMO_INITIAL_COINS;
        const reportError = options.reportError
            ?? ((error: unknown) => console.warn(`[snake] demo 钱包回灌失败，本进程内该 uid 的结算不写回 Redis（uid=${uid}）`, error));
        inFlight = (async (): Promise<void> => {
            let raw: string | null;
            try {
                raw = await hydration(uid);
            } catch (error) {
                reportError(error);
                return;
            }
            if (raw !== null && raw !== undefined) {
                const parsed = Number(raw);
                if (Number.isSafeInteger(parsed) && parsed >= 0) demoBalances.set(uid, parsed);
                else console.warn(`[snake] demo 钱包 coinBalance 非法，按初始余额兜底（uid=${uid}, raw=${raw}）`);
            }
            if (!demoBalances.has(uid)) demoBalances.set(uid, initialBalance);
            coinHydrated.add(uid);
        })().finally(() => {
            if (coinHydrations.get(uid) === inFlight) coinHydrations.delete(uid);
        });
        coinHydrations.set(uid, inFlight);
    }
    await inFlight;
}

export const persistSnakeReliveDebit: DemoRelivePersistence = async (record): Promise<void> => {
    await mergeStoredSnakeFields(record.uid, ["coinBalance"], (raw) => {
        const stored = raw[0] === null ? NaN : Number(raw[0]);
        const balance = Number.isSafeInteger(stored) && stored >= 0 ? stored : record.initialBalance;
        if (balance < record.coinCost) throw new Error("Snake stored coins no longer cover relive");
        return [String(balance - record.coinCost)];
    });
};

/**
 * Demo-only synchronous wallet. Gameplay commits immediately in memory and mirrors only
 * the debit to durable Redis with a field CAS, without waiting on the room hot path.
 */
export class RedisDemoReliveEconomy implements ReliveEconomyPort {
    readonly kind = "demo-redis" as const;

    constructor(
        private readonly initialBalance = SNAKE_DEMO_INITIAL_COINS,
        private readonly persistence: DemoRelivePersistence = persistSnakeReliveDebit,
        private readonly reportError: (error: unknown) => void = (error) => {
            console.warn("[snake] demo relive Redis mirror failed; gameplay result is kept", error);
        },
    ) {
        if (!Number.isSafeInteger(initialBalance) || initialBalance < 0) {
            throw new RangeError("Snake demo balance must be a non-negative safe integer");
        }
    }

    balance(input: Pick<ReliveEconomyInput, "uid">): number {
        return demoBalances.get(input.uid) ?? this.initialBalance;
    }

    commit(input: ReliveEconomyInput): ReliveEconomyResult {
        const operationKey = demoOperationKey(input);
        const previous = demoResults.get(operationKey);
        if (previous) return previous;
        const balance = this.balance(input);
        if (balance < input.coinCost) {
            const result: ReliveEconomyResult = { kind: "insufficientCoins", balanceAfter: balance };
            demoResults.set(operationKey, result);
            return result;
        }
        const balanceAfter = balance - input.coinCost;
        const receiptId = `demo:${createHash("sha256").update(operationKey).digest("hex")}`;
        const result: ReliveEconomyResult = { kind: "success", receiptId, balanceAfter };
        demoBalances.set(input.uid, balanceAfter);
        demoResults.set(operationKey, result);
        const record: DemoRelivePersistenceRecord = {
            uid: input.uid,
            coinCost: input.coinCost,
            initialBalance: this.initialBalance,
        };
        enqueueSnakeProfileWrite(input.uid, () => this.persistence(record), this.reportError);
        return result;
    }
}

/**
 * S4 结算加币：直接落到 S2R 共用的进程内余额，返回新余额。
 * ⚠ 本函数只更新同步玩法余额；S4 终局另将本次奖励增量与养成变化一同 CAS 合并，
 * 不能在这里额外写一次，否则会重复加币。
 */
export function grantDemoCoins(uid: string, amount: number, initialBalance = SNAKE_DEMO_INITIAL_COINS): number {
    const gain = Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
    const next = (demoBalances.get(uid) ?? initialBalance) + gain;
    demoBalances.set(uid, next);
    return next;
}

/** 当前进程内 demo 余额（S4 结算读；⛔ 不触发任何写）。 */
export function demoCoinBalanceOf(uid: string, initialBalance = SNAKE_DEMO_INITIAL_COINS): number {
    return demoBalances.get(uid) ?? initialBalance;
}

/** 测试 seam：清空 demo 钱包。⛔ 运行时不要调用。 */
export function __resetDemoCoinsForTest(): void {
    demoBalances.clear();
    demoResults.clear();
    coinHydrated.clear();
    coinHydrations.clear();
}

/**
 * 入房前预热：每次 join 都刷新该 uid 的衣柜 / 养成档；demo 钱包沿用首次成功回灌。
 *
 * ⚠ 它是 `createPlayer`（同步读装备皮肤）与结算（同步读档算奖励、再按增量镜像）唯一的正确性前提，
 * 由 mode 的 `onBeforeAdmission` **await**。⛔ 不能 fire-and-forget：两处读都在同步路径上，
 * 不等它就等于读默认档（F13）。两份档在同一个 Redis hash 里，但分属两个模块各自的读闸，
 * 这里并行打一次。任一失败都不抛——各自不标记「已回灌」，结算侧的兜底闸据此跳过写回。
 */
export type SnakeProfilePreheat = (uid: string) => Promise<void>;

const preheatFromStorage: SnakeProfilePreheat = async (uid) => {
    await Promise.all([snakeCosmeticStore.hydrate(uid), hydrateDemoCoinBalance(uid)]);
};

/**
 * 预热的环境解析，形态同 `resolveS2ReliveEconomy` / `resolveRewardPersistence`。
 *
 * ⚠ `test` 环境返回 no-op：默认实现经 `clientFor` 真开 Redis 连接，而房间单测是纯内存套件。
 */
export function resolveProfilePreheat(
    injected: SnakeProfilePreheat | undefined,
    runtimeEnvironment: string | undefined,
): SnakeProfilePreheat {
    if (injected) return injected;
    const environment = runtimeEnvironment ?? process.env.NODE_ENV ?? "development";
    return environment === "test" ? async (): Promise<void> => {} : preheatFromStorage;
}

export const DISABLED_RELIVE_ECONOMY: ReliveEconomyPort = Object.freeze({
    kind: "disabled" as const,
    balance: (): number => 0,
    commit: (): ReliveEconomyResult => ({ kind: "systemFailure" }),
});

export function resolveS2ReliveEconomy(
    injected: ReliveEconomyPort | undefined,
    runtimeEnvironment: string | undefined,
): ReliveEconomyPort {
    const environment = runtimeEnvironment ?? process.env.NODE_ENV ?? "development";
    const port = injected ?? (environment === "production"
        ? DISABLED_RELIVE_ECONOMY
        : new RedisDemoReliveEconomy());
    if (environment === "production" && port.kind !== "disabled") {
        throw new Error("[snake] production cannot bind a test/demo ReliveEconomyPort");
    }
    return port;
}
