/**
 * Snake S2 个人 run 的可替换边界。
 *
 * S2 只允许进程内确定性测试经济：这里没有 Redis/MySQL/ledger import，也不接受真实
 * 资产凭据。生产环境只能绑定 disabled 端口；S2R 会在同一接口上增加可靠实现。
 */

export const ONLINE_COIN_RELIVE_PLAYER_RELEASED = false;

export interface SnakeRunSkinResolver {
    resolve(input: { readonly roomEpochId: string; readonly sessionId: string }): number;
}

export const DEFAULT_SNAKE_RUN_SKIN_RESOLVER: SnakeRunSkinResolver = Object.freeze({
    resolve: () => 1,
});

export interface ReliveEconomyInput {
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
    /** 生产启动断言依赖稳定种类；不得用鸭子类型绕过。 */
    readonly kind: "s2-test" | "disabled";
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
    private balance: number;

    constructor(
        initialBalance = 10_000,
        private readonly outcome: (input: ReliveEconomyInput) => DeterministicReliveOutcome = () => "success",
    ) {
        if (!Number.isSafeInteger(initialBalance) || initialBalance < 0) {
            throw new RangeError("S2 test relive balance must be a non-negative safe integer");
        }
        this.balance = initialBalance;
    }

    commit(input: ReliveEconomyInput): ReliveEconomyResult {
        const key = `${input.roomEpochId}\u0000${input.runId}\u0000${input.deathSeq}\u0000${input.clientReqId}`;
        const previous = this.results.get(key);
        if (previous) return previous;
        const selected = this.outcome(input);
        let result: ReliveEconomyResult;
        if (selected === "success" && this.balance >= input.coinCost) {
            this.balance -= input.coinCost;
            result = {
                kind: "success",
                receiptId: `s2-test:${input.runId}:${input.deathSeq}:${input.clientReqId}`,
                balanceAfter: this.balance,
            };
        } else if (selected === "success" || selected === "insufficientCoins") {
            result = { kind: "insufficientCoins", balanceAfter: this.balance };
        } else if (selected === "retryableFailure") {
            result = { kind: "retryableFailure" };
        } else {
            result = { kind: "systemFailure" };
        }
        this.results.set(key, result);
        return result;
    }

    get testBalance(): number { return this.balance; }
    get commitCount(): number { return this.results.size; }
}

export const DISABLED_RELIVE_ECONOMY: ReliveEconomyPort = Object.freeze({
    kind: "disabled" as const,
    commit: (): ReliveEconomyResult => ({ kind: "systemFailure" }),
});

export function resolveS2ReliveEconomy(
    injected: ReliveEconomyPort | undefined,
    runtimeEnvironment: string | undefined,
): ReliveEconomyPort {
    const environment = runtimeEnvironment ?? process.env.NODE_ENV ?? "development";
    const port = injected ?? (environment === "production"
        ? DISABLED_RELIVE_ECONOMY
        : new DeterministicTestReliveEconomy());
    if (environment === "production" && port.kind === "s2-test") {
        throw new Error("[snake] production cannot bind the S2 deterministic test ReliveEconomyPort");
    }
    return port;
}
