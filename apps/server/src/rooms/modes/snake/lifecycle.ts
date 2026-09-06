/** Snake personal-run economy boundary. Production always disables the demo adapter. */

import { createHash } from "node:crypto";
import { clientFor } from "../../../core/infra/redisRoute";
import { equippedSkinIdOf } from "./cosmeticProfile";
import { kSnakeUser } from "./keys";

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
 * 自 S3-03 起读进程内已预热的衣柜 profile（由普通 Lobby RPC `snakeCosmetic.getSnapshot` 预热）。
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
    readonly coinBalance: number;
}

export type DemoRelivePersistence = (record: DemoRelivePersistenceRecord) => Promise<void>;

const demoOperationKey = (input: ReliveEconomyInput): string =>
    `${input.uid}\u0000${input.roomEpochId}\u0000${input.runId}\u0000${input.deathSeq}`;
const demoBalances = new Map<string, number>();
const demoResults = new Map<string, ReliveEconomyResult>();

const persistDemoRelive: DemoRelivePersistence = async (record): Promise<void> => {
    await clientFor(record.uid).hset(kSnakeUser(record.uid), "coinBalance", String(record.coinBalance));
};

/**
 * Demo-only synchronous wallet. Gameplay commits immediately in memory and mirrors only
 * the resulting balance to durable Redis without waiting on the room hot path.
 */
export class RedisDemoReliveEconomy implements ReliveEconomyPort {
    readonly kind = "demo-redis" as const;

    constructor(
        private readonly initialBalance = SNAKE_DEMO_INITIAL_COINS,
        private readonly persistence: DemoRelivePersistence = persistDemoRelive,
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
            coinBalance: balanceAfter,
        };
        void this.persistence(record).catch(this.reportError);
        return result;
    }
}

/**
 * S4 结算加币：直接落到 S2R 共用的进程内余额，返回新余额。
 * ⚠ ⛔ 本函数不写 Redis——S4 终局用**一条** HSET 连同 cosmetic/progression 字段一起镜像，
 * 在这里各写各的会造出「两条 fire-and-forget 各持过期快照互相覆盖」的窗口。
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
