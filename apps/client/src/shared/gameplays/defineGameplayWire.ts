import { GamePhase, type GamePhaseType } from "../constants/game";
import { guardWire } from "../protocol/http";

/**
 * 玩法 wire token 构造器（Non-intrusive §4.5）。
 *
 * 每个玩法在自己的 `gameplays/<id>/wire.ts` 里用 `defineC2S`/`defineS2C` 声明消息名、
 * 方向、runtime validator、允许 phase 与预算成本；`codegen:gameplays` 以**语法读取**
 * （type/phases/rateCost 必须是字面量）把它们聚合进 `generated/wire-catalog.generated.ts`。
 *
 * 约束：
 *  - wire.ts 顶层只允许 import、接口、const 字面量、defineC2S/defineS2C 调用与
 *    validator 函数声明；computed property/spread/顶层副作用会被生成器拒绝。
 *  - validator 逐字迁移自中央 messages.ts 的同名实现；token.validate 外层统一
 *    `guardWire` 包裹（与原 `guardMessageValidator` 链路等价）。
 */

const ALL_PHASES: readonly GamePhaseType[] = Object.values(GamePhase);

export interface GameplayC2SToken<TPayload, TType extends string = string> {
    readonly dir: "c2s";
    readonly type: TType;
    /** 该输入开放的 phase 白名单（token 声明取代已删除的 GameModeInputs.phases）。 */
    readonly phases: readonly GamePhaseType[];
    /** 每条消息消耗的基础预算份数；现有消息全部为 1，机制为高频输入留位。 */
    readonly rateCost: number;
    validate(input: unknown, path?: string): TPayload;
}

export interface GameplayS2CToken<TPayload, TType extends string = string> {
    readonly dir: "s2c";
    readonly type: TType;
    validate(input: unknown, path?: string): TPayload;
}

export interface GameplayC2SOptions {
    readonly phases: readonly GamePhaseType[];
    readonly rateCost?: number;
}

function assertWireType(type: string, prefix: "c2s." | "s2c."): void {
    if (typeof type !== "string" || type.length <= prefix.length || !type.startsWith(prefix)) {
        throw new TypeError(`[gameplay-wire] 消息名必须以 "${prefix}" 开头且非空：${String(type)}`);
    }
}

function guardedValidator<TPayload>(
    type: string,
    validate: (input: unknown) => TPayload,
): (input: unknown, path?: string) => TPayload {
    if (typeof validate !== "function") {
        throw new TypeError(`[gameplay-wire] ${type} 的 validator 必须是函数`);
    }
    return (input: unknown, path?: string) => guardWire(path ?? "payload", () => validate(input));
}

export function defineC2S<TPayload, TType extends string>(
    type: TType,
    validate: (input: unknown) => TPayload,
    options: GameplayC2SOptions,
): GameplayC2SToken<TPayload, TType> {
    assertWireType(type, "c2s.");
    if (!options || typeof options !== "object" || !Array.isArray(options.phases) || options.phases.length === 0) {
        throw new TypeError(`[gameplay-wire] ${type} 必须声明非空 phases`);
    }
    for (const phase of options.phases) {
        if (!ALL_PHASES.includes(phase)) {
            throw new TypeError(`[gameplay-wire] ${type} 含未知 phase：${String(phase)}`);
        }
    }
    const rateCost = options.rateCost === undefined ? 1 : options.rateCost;
    if (!Number.isSafeInteger(rateCost) || rateCost < 1) {
        throw new TypeError(`[gameplay-wire] ${type} 的 rateCost 必须是 ≥1 的整数`);
    }
    return Object.freeze({
        dir: "c2s" as const,
        type,
        phases: Object.freeze([...options.phases]),
        rateCost,
        validate: guardedValidator(type, validate),
    });
}

export function defineS2C<TPayload, TType extends string>(
    type: TType,
    validate: (input: unknown) => TPayload,
): GameplayS2CToken<TPayload, TType> {
    assertWireType(type, "s2c.");
    return Object.freeze({
        dir: "s2c" as const,
        type,
        validate: guardedValidator(type, validate),
    });
}
