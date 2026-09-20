/**
 * mmo kit · `orchestration` api 面（shared，docs/MMO.md §8；MK4-B1）：插件在运行时对世界的**全部**影响 = `handle(event, readApi) → commands[]`。
 * 本文件 = 契约签名（§8.5）+ 零依赖 validator + 预算 / 上限数字（§8.1 / §11.2 冻结或候选）+ 重放摘要工具：
 *  - `OrchestrationEvent`（§8.2 十三种受控事件；v1 ⛔ spellCast / damage）与 `OrchestrationCommand`（§8.3 十五种命令）；
 *  - `defineOrchestration(module)`：形状校验 + freeze，顶层无副作用（启动期逐模块断言，失败进程拒启）；
 *  - `validateOrchestrationCommand(input, path)`：exact keys + 数值域 + 文本长度；未知 op ⇒ 抛（kit 收到即整批丢弃 + suspend）；
 *  - `OrchestrationReadApi`：事件时刻的一致快照，全部同步只读；随机只经 `rng(stream)`（种子 = instanceId + tick + eventSeq + stream）；
 *  - `digestOf` / `stableStringify`：`(eventSeq, eventDigest, commandDigest)` 环形日志与 harness 重放比对用的确定性摘要（FNV-1a，⛔ 依赖 crypto）。
 * 插件只能 import 本门面；本面任何导出变化都要 bump `api.orchestration.version`（新事件 / 新命令 = kit 升级）。
 */
import type { ICreatureTemplate, IItemTemplate, IRegionDef } from "../content/index";
import type { MmoEntityKind } from "../../../../gameplays/mmoWorld/wire";

export const MMO_ORCHESTRATION_VERSION = 1 as const;
export type ScriptScalar = number | string | boolean;
export type EntityId = string;
export type EntityKind = MmoEntityKind;
export interface Vec2 { readonly x: number; readonly y: number }

// ── 预算 / 上限（§8.1；ORCH_TICK_BUDGET_MS / ORCH_SAY_WORLD_PER_MIN 为 §11.2 冻结值，其余为候选，只许收紧）──
export const ORCH_TICK_BUDGET_MS = 2;
export const ORCH_MAX_COMMANDS_PER_TICK = 64;
export const ORCH_MAX_EVENT_QUEUE = 256;
export const ORCH_MAX_VARS_BYTES = 4096;
export const ORCH_MAX_TIMERS = 32;
export const ORCH_MIN_TIMER_MS = 500;
export const ORCH_MAX_PROMPT_CHOICES = 6;
export const ORCH_MAX_PUBLISH_KEYS = 16;
export const ORCH_SAY_WORLD_PER_MIN = 6;
export const ORCH_SAY_NEARBY_PER_MIN = 30;
export const ORCH_TICK_EVERY_DEFAULT = 20;
export const ORCH_TICK_EVERY_MIN = 10;
export const ORCH_TICK_EVERY_MAX = 1200;
export const ORCH_MAX_TEXT = 200;
export const ORCH_MAX_TAG = 32;
export const ORCH_RING_SIZE = 64;
export const ORCH_DEFAULT_LIMITS = Object.freeze({ maxSpawnsAlive: 64, maxGrantCount: 99, maxCurrencyPerGrant: 10_000 });
/** `setVar durable` 触发强制分线检查点的最小间隔（每 pack）。 */
export const ORCH_DURABLE_VAR_MIN_INTERVAL_MS = 30_000;

export type OrchestrationEvent =
    | { readonly kind: "instanceStarted"; readonly recovered: boolean; readonly checkpointRev: number }
    | { readonly kind: "tick"; readonly tick: number; readonly bucket: number }
    | { readonly kind: "timer"; readonly timerId: string; readonly tag: string }
    | { readonly kind: "playerEntered" | "playerLeft"; readonly entityId: EntityId; readonly characterId: string; readonly factionId: string | null }
    | { readonly kind: "regionEntered" | "regionLeft"; readonly regionId: string; readonly entityId: EntityId; readonly entityKind: EntityKind }
    | { readonly kind: "creatureSpawned" | "creatureDied"; readonly entityId: EntityId; readonly templateId: string; readonly spawnId?: string; readonly tag?: string; readonly killerEntityId?: EntityId; readonly pos: Vec2 }
    | { readonly kind: "playerDied"; readonly entityId: EntityId; readonly killerEntityId?: EntityId }
    | { readonly kind: "interact"; readonly actorEntityId: EntityId; readonly targetEntityId: EntityId; readonly interactId: string }
    | { readonly kind: "choice"; readonly actorEntityId: EntityId; readonly promptId: string; readonly choiceId: string }
    | { readonly kind: "lootClaimed"; readonly actorEntityId: EntityId; readonly lootId: string; readonly itemTemplateId: string; readonly count: number }
    | { readonly kind: "grantResult"; readonly opId: string; readonly ok: boolean; readonly reason?: string }
    | { readonly kind: "packSuspended"; readonly reason: string };

export type OrchestrationEventKind = OrchestrationEvent["kind"];
export const ORCHESTRATION_EVENT_KINDS: readonly OrchestrationEventKind[] = Object.freeze([
    "instanceStarted", "tick", "timer", "playerEntered", "playerLeft", "regionEntered", "regionLeft", "creatureSpawned", "creatureDied", "playerDied", "interact", "choice", "lootClaimed", "grantResult", "packSuspended",
]);

export type OrchestrationCommand =
    | { readonly op: "spawn"; readonly templateId: string; readonly pos: Vec2; readonly tag?: string; readonly despawnAfterMs?: number; readonly leashRegionId?: string }
    | { readonly op: "despawn"; readonly entityId: EntityId }
    | { readonly op: "despawn"; readonly tag: string }
    | { readonly op: "startTimer"; readonly timerId: string; readonly afterMs: number; readonly tag?: string; readonly repeat?: boolean }
    | { readonly op: "cancelTimer"; readonly timerId: string }
    | { readonly op: "grantItem"; readonly toCharacterId: string; readonly itemTemplateId: string; readonly count: number; readonly reason: string }
    | { readonly op: "grantCurrency"; readonly toCharacterId: string; readonly amount: number; readonly reason: string }
    | { readonly op: "sayNearby"; readonly anchorEntityId: EntityId; readonly text: string }
    | { readonly op: "sayWorld"; readonly text: string }
    | { readonly op: "notice"; readonly text: string; readonly level: "info" | "warn" }
    | { readonly op: "setVar"; readonly key: string; readonly value: ScriptScalar; readonly durable?: boolean }
    | { readonly op: "publishState"; readonly key: string; readonly value: ScriptScalar }
    | { readonly op: "prompt"; readonly toEntityId: EntityId; readonly promptId: string; readonly choices: readonly { readonly id: string; readonly label: string }[] }
    | { readonly op: "teleportWithin"; readonly entityId: EntityId; readonly pos: Vec2 }
    | { readonly op: "transfer"; readonly characterId: string; readonly toMapId: string; readonly toPortalId: string }
    | { readonly op: "setRegionEnabled"; readonly regionId: string; readonly enabled: boolean };

export type OrchestrationOp = OrchestrationCommand["op"];

/** 只读实体视图（事件时刻快照）。 */
export interface IEntityView {
    readonly id: EntityId;
    readonly kind: EntityKind;
    readonly templateId: string;
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly hp: number;
    readonly hpMax: number;
    readonly level: number;
    readonly factionId: string | null;
    /** 脚本 spawn 的 tag（kit 撒的怪 / 角色 = null） */
    readonly tag: string | null;
    readonly alive: boolean;
    /** 角色 id（角色实体；其余 null） */
    readonly characterId: string | null;
}

/** 事件时刻的一致快照；全部同步、只读、无 IO。 */
export interface OrchestrationReadApi {
    readonly address: string;
    readonly tick: number;
    readonly packId: string;
    /** 确定性随机：种子 = instanceId + tick + eventSeq + stream（同一事件里同 stream 连续取值也确定） */
    rng(stream: string): number;
    readonly vars: { get(key: string): ScriptScalar | undefined; keys(): readonly string[] };
    readonly world: {
        entity(id: EntityId): IEntityView | null;
        entitiesInRegion(regionId: string, filter?: { readonly kind?: EntityKind; readonly tag?: string; readonly factionId?: string }): readonly EntityId[];
        playersInInstance(): readonly EntityId[];
        isWalkable(pos: Vec2): boolean;
        region(regionId: string): IRegionDef | null;
    };
    readonly content: { creature(id: string): ICreatureTemplate | null; item(id: string): IItemTemplate | null };
    readonly party: { membersInInstance(entityId: EntityId): readonly EntityId[] };
}

export interface OrchestrationLimits {
    readonly maxSpawnsAlive?: number;
    readonly maxGrantCount?: number;
    readonly maxCurrencyPerGrant?: number;
}

export interface OrchestrationModule {
    readonly orchestrationVersion: typeof MMO_ORCHESTRATION_VERSION;
    readonly packId: string;
    readonly subscribes: readonly OrchestrationEventKind[];
    /** tick 事件节拍（固定步数；10..1200，缺省 20 = 1 Hz） */
    readonly tickEvery?: number;
    /** 自定义交互：interactId → 可作用的模板 id（creature / npc） */
    readonly interacts?: Readonly<Record<string, { readonly targets: readonly string[] }>>;
    readonly limits?: OrchestrationLimits;
    readonly handle: (event: OrchestrationEvent, api: OrchestrationReadApi) => readonly OrchestrationCommand[];
}

export class OrchestrationContractError extends Error {
    constructor(readonly path: string, message: string) {
        super(`[mmo orchestration] ${path}: ${message}`);
        this.name = "OrchestrationContractError";
    }
}

const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/u;
function fail(path: string, message: string): never { throw new OrchestrationContractError(path, message); }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, path: string, required: readonly string[], optional: readonly string[] = []): void => {
    for (const key of required) if (!(key in value)) fail(`${path}.${key}`, "missing");
    for (const key of Object.keys(value)) if (!required.includes(key) && !optional.includes(key)) fail(`${path}.${key}`, "unexpected key");
};
const idOf = (value: unknown, path: string): string => (typeof value === "string" && ID_RE.test(value) ? value : fail(path, "expected id [A-Za-z0-9._:-]{1,64}"));
const intOf = (value: unknown, path: string, min: number, max: number): number => (Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : fail(path, `expected integer in [${min}, ${max}]`));
const numOf = (value: unknown, path: string, min: number, max: number): number => (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fail(path, `expected finite number in [${min}, ${max}]`));
const textOf = (value: unknown, path: string, max: number): string => (typeof value === "string" && value.length >= 1 && value.length <= max && value.trim().length > 0 ? value : fail(path, `expected non-blank string ≤ ${max}`));
const boolOf = (value: unknown, path: string): boolean => (typeof value === "boolean" ? value : fail(path, "expected boolean"));
const vecOf = (value: unknown, path: string): Vec2 => {
    if (!isRecord(value)) fail(path, "expected { x, y }");
    exact(value, path, ["x", "y"]);
    return { x: numOf(value.x, `${path}.x`, 0, 1_000_000), y: numOf(value.y, `${path}.y`, 0, 1_000_000) };
};
const scalarOf = (value: unknown, path: string): ScriptScalar => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : fail(path, "number must be finite");
    if (typeof value === "string") return value.length <= 256 ? value : fail(path, "string ≤ 256");
    return fail(path, "expected scalar (number | string | boolean)");
};

/** 零依赖命令校验：exact keys + 数值域 + 文本长度；未知 op ⇒ 抛（kit 收到即整批丢弃 + suspend）。 */
export function validateOrchestrationCommand(input: unknown, path = "command"): OrchestrationCommand {
    if (!isRecord(input)) fail(path, "expected object");
    const value = input;
    switch (value.op) {
        case "spawn": {
            exact(value, path, ["op", "templateId", "pos"], ["tag", "despawnAfterMs", "leashRegionId"]);
            return {
                op: "spawn", templateId: idOf(value.templateId, `${path}.templateId`), pos: vecOf(value.pos, `${path}.pos`),
                ...(value.tag === undefined ? {} : { tag: textOf(value.tag, `${path}.tag`, ORCH_MAX_TAG) }),
                ...(value.despawnAfterMs === undefined ? {} : { despawnAfterMs: intOf(value.despawnAfterMs, `${path}.despawnAfterMs`, ORCH_MIN_TIMER_MS, 86_400_000) }),
                ...(value.leashRegionId === undefined ? {} : { leashRegionId: idOf(value.leashRegionId, `${path}.leashRegionId`) }),
            };
        }
        case "despawn": {
            if ("entityId" in value) { exact(value, path, ["op", "entityId"]); return { op: "despawn", entityId: idOf(value.entityId, `${path}.entityId`) }; }
            exact(value, path, ["op", "tag"]);
            return { op: "despawn", tag: textOf(value.tag, `${path}.tag`, ORCH_MAX_TAG) };
        }
        case "startTimer": {
            exact(value, path, ["op", "timerId", "afterMs"], ["tag", "repeat"]);
            return {
                op: "startTimer", timerId: idOf(value.timerId, `${path}.timerId`), afterMs: intOf(value.afterMs, `${path}.afterMs`, ORCH_MIN_TIMER_MS, 86_400_000),
                ...(value.tag === undefined ? {} : { tag: textOf(value.tag, `${path}.tag`, ORCH_MAX_TAG) }),
                ...(value.repeat === undefined ? {} : { repeat: boolOf(value.repeat, `${path}.repeat`) }),
            };
        }
        case "cancelTimer": exact(value, path, ["op", "timerId"]); return { op: "cancelTimer", timerId: idOf(value.timerId, `${path}.timerId`) };
        case "grantItem": {
            exact(value, path, ["op", "toCharacterId", "itemTemplateId", "count", "reason"]);
            return { op: "grantItem", toCharacterId: idOf(value.toCharacterId, `${path}.toCharacterId`), itemTemplateId: idOf(value.itemTemplateId, `${path}.itemTemplateId`), count: intOf(value.count, `${path}.count`, 1, 9_999), reason: textOf(value.reason, `${path}.reason`, ORCH_MAX_TAG) };
        }
        case "grantCurrency": {
            exact(value, path, ["op", "toCharacterId", "amount", "reason"]);
            return { op: "grantCurrency", toCharacterId: idOf(value.toCharacterId, `${path}.toCharacterId`), amount: intOf(value.amount, `${path}.amount`, 1, 1_000_000_000), reason: textOf(value.reason, `${path}.reason`, ORCH_MAX_TAG) };
        }
        case "sayNearby": exact(value, path, ["op", "anchorEntityId", "text"]); return { op: "sayNearby", anchorEntityId: idOf(value.anchorEntityId, `${path}.anchorEntityId`), text: textOf(value.text, `${path}.text`, ORCH_MAX_TEXT) };
        case "sayWorld": exact(value, path, ["op", "text"]); return { op: "sayWorld", text: textOf(value.text, `${path}.text`, ORCH_MAX_TEXT) };
        case "notice": {
            exact(value, path, ["op", "text", "level"]);
            if (value.level !== "info" && value.level !== "warn") fail(`${path}.level`, "expected info | warn");
            return { op: "notice", text: textOf(value.text, `${path}.text`, ORCH_MAX_TEXT), level: value.level };
        }
        case "setVar": {
            exact(value, path, ["op", "key", "value"], ["durable"]);
            return { op: "setVar", key: idOf(value.key, `${path}.key`), value: scalarOf(value.value, `${path}.value`), ...(value.durable === undefined ? {} : { durable: boolOf(value.durable, `${path}.durable`) }) };
        }
        case "publishState": exact(value, path, ["op", "key", "value"]); return { op: "publishState", key: idOf(value.key, `${path}.key`), value: scalarOf(value.value, `${path}.value`) };
        case "prompt": {
            exact(value, path, ["op", "toEntityId", "promptId", "choices"]);
            if (!Array.isArray(value.choices) || value.choices.length === 0 || value.choices.length > ORCH_MAX_PROMPT_CHOICES) fail(`${path}.choices`, `expected 1..${ORCH_MAX_PROMPT_CHOICES} choices`);
            const seen = new Set<string>();
            const choices = value.choices.map((choice, index) => {
                if (!isRecord(choice)) fail(`${path}.choices[${index}]`, "expected { id, label }");
                exact(choice, `${path}.choices[${index}]`, ["id", "label"]);
                const id = idOf(choice.id, `${path}.choices[${index}].id`);
                if (seen.has(id)) fail(`${path}.choices[${index}].id`, "duplicate");
                seen.add(id);
                return { id, label: textOf(choice.label, `${path}.choices[${index}].label`, 64) };
            });
            return { op: "prompt", toEntityId: idOf(value.toEntityId, `${path}.toEntityId`), promptId: idOf(value.promptId, `${path}.promptId`), choices };
        }
        case "teleportWithin": exact(value, path, ["op", "entityId", "pos"]); return { op: "teleportWithin", entityId: idOf(value.entityId, `${path}.entityId`), pos: vecOf(value.pos, `${path}.pos`) };
        case "transfer": exact(value, path, ["op", "characterId", "toMapId", "toPortalId"]); return { op: "transfer", characterId: idOf(value.characterId, `${path}.characterId`), toMapId: idOf(value.toMapId, `${path}.toMapId`), toPortalId: idOf(value.toPortalId, `${path}.toPortalId`) };
        case "setRegionEnabled": exact(value, path, ["op", "regionId", "enabled"]); return { op: "setRegionEnabled", regionId: idOf(value.regionId, `${path}.regionId`), enabled: boolOf(value.enabled, `${path}.enabled`) };
        default: return fail(`${path}.op`, `unknown op "${String(value.op)}"`);
    }
}

/** 形状校验 + freeze（顶层无副作用；kit 启动期逐模块断言，失败进程拒启）。 */
export function defineOrchestration(module: OrchestrationModule): OrchestrationModule {
    if (!isRecord(module)) fail("module", "expected object");
    if (module.orchestrationVersion !== MMO_ORCHESTRATION_VERSION) fail("module.orchestrationVersion", `expected ${MMO_ORCHESTRATION_VERSION}`);
    idOf(module.packId, "module.packId");
    if (!Array.isArray(module.subscribes) || module.subscribes.length === 0) fail("module.subscribes", "expected non-empty array");
    const seen = new Set<string>();
    for (const kind of module.subscribes) {
        if (typeof kind !== "string" || !ORCHESTRATION_EVENT_KINDS.includes(kind as OrchestrationEventKind)) fail("module.subscribes", `unknown event kind "${String(kind)}"`);
        if (seen.has(kind)) fail("module.subscribes", `duplicate "${kind}"`);
        seen.add(kind);
    }
    if (module.tickEvery !== undefined) intOf(module.tickEvery, "module.tickEvery", ORCH_TICK_EVERY_MIN, ORCH_TICK_EVERY_MAX);
    if (module.interacts !== undefined) {
        if (!isRecord(module.interacts)) fail("module.interacts", "expected record");
        for (const [interactId, spec] of Object.entries(module.interacts)) {
            idOf(interactId, "module.interacts");
            if (!isRecord(spec) || !Array.isArray(spec.targets) || spec.targets.length === 0) fail(`module.interacts.${interactId}`, "expected { targets: [templateId…] }");
            for (const target of spec.targets) idOf(target, `module.interacts.${interactId}.targets`);
        }
    }
    if (module.limits !== undefined) {
        if (!isRecord(module.limits)) fail("module.limits", "expected record");
        exact(module.limits as Record<string, unknown>, "module.limits", [], ["maxSpawnsAlive", "maxGrantCount", "maxCurrencyPerGrant"]);
        for (const key of ["maxSpawnsAlive", "maxGrantCount", "maxCurrencyPerGrant"] as const) if (module.limits[key] !== undefined) intOf(module.limits[key], `module.limits.${key}`, 1, 1_000_000);
    }
    if (typeof module.handle !== "function") fail("module.handle", "expected function");
    for (const key of Object.keys(module)) if (!["orchestrationVersion", "packId", "subscribes", "tickEvery", "interacts", "limits", "handle"].includes(key)) fail(`module.${key}`, "unexpected key");
    return Object.freeze({ ...module, subscribes: Object.freeze([...module.subscribes]) });
}

/** 生效上限（模块声明与 kit 硬上限取小；缺省 ORCH_DEFAULT_LIMITS）。 */
export function effectiveLimits(module: Pick<OrchestrationModule, "limits">): Required<OrchestrationLimits> {
    return {
        maxSpawnsAlive: Math.min(ORCH_DEFAULT_LIMITS.maxSpawnsAlive, module.limits?.maxSpawnsAlive ?? ORCH_DEFAULT_LIMITS.maxSpawnsAlive),
        maxGrantCount: Math.min(ORCH_DEFAULT_LIMITS.maxGrantCount, module.limits?.maxGrantCount ?? ORCH_DEFAULT_LIMITS.maxGrantCount),
        maxCurrencyPerGrant: Math.min(ORCH_DEFAULT_LIMITS.maxCurrencyPerGrant, module.limits?.maxCurrencyPerGrant ?? ORCH_DEFAULT_LIMITS.maxCurrencyPerGrant),
    };
}

// ── 重放摘要（零依赖）──────────────────────────────────────────────────────────

/** 键排序的稳定 JSON（对象键升序、数组按序；undefined 省略）。 */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value === undefined ? null : value);
    if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

/** FNV-1a 32 位（十六进制 8 位）：环形日志 / 重放比对的摘要（⛔ 安全用途）。 */
export function digestOf(value: unknown): string {
    const text = stableStringify(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/** 环形日志条目（随分线检查点进 state_hash）。 */
export interface OrchestrationRingEntry { readonly seq: number; readonly eventDigest: string; readonly commandDigest: string }

/** 序列化后的 vars 字节数（UTF-16 code unit 计；上限 ORCH_MAX_VARS_BYTES）。 */
export function varsBytesOf(vars: Readonly<Record<string, ScriptScalar>>): number {
    return stableStringify(vars).length;
}
