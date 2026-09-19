/**
 * WorldDirectory（MMO MF4-B6 + MF10-B1，docs/MMO.md §4.4 / §5.4 MF4 / MF10）：`(sId, mapId, line) → world_instance` 的查找 / 建行 + 分线分配。
 * v1 = 进程内 id 缓存 + MySQL 行（`control.findOrCreateInstance` 幂等；行本身每次回读——`authority_epoch` 是权威 CAS 的 expected，
 * ⛔ 不能缓存陈旧值）。分线分配（`allocate`）：按 line 升序找第一条未满的（满 = 登记的 seated ≥ capacity；无登记 = 空实例），
 * 全满则开新线到 `maxLines` 为止（WORLD_MAX_LINES_PER_MAP），再满 ⇒ WorldLinesExhaustedError；指定 line ≥ maxLines ⇒ WorldLineLimitError。
 * 实例所在 world 进程的 publicAddress 由权威房经 WorldRegistry 登记（D27 / MF8 `endpoint`）。
 * ⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
import { WorldLineLimitError, WorldLinesExhaustedError } from "../../core/errors";
import { WORLD_MAX_LINES_PER_MAP } from "../../core/infra/config";
import { findOrCreateInstance, listInstances, readInstance, type WorldInstanceRow } from "./control";
import { redisWorldRegistry, type WorldRegistryPort } from "./WorldRegistry";

/** v1 单分线缺省：未走 allocate 的调用方（房内 onCreate 缺 line 的 join）落 0 号线。 */
export const DEFAULT_WORLD_LINE = 0;

/** WorldAddress 字符串形（persona.world_address 列 / 日志；与 MF4-B3 int 用例同形）。 */
export const worldAddressOf = (sId: number, mapId: string, line: number): string => `s${sId}/${mapId}/${line}`;

export interface WorldDirectorySql {
    findOrCreateInstance(sId: number, mapId: string, line: number): Promise<WorldInstanceRow>;
    readInstance(sId: number, instanceId: string): Promise<WorldInstanceRow | null>;
    /** 某图已有分线（line 升序）；MF10-B1 分配用。 */
    listInstances(sId: number, mapId: string): Promise<WorldInstanceRow[]>;
}

export interface WorldAllocateOptions {
    /** 满员阈值（缺省 WORLD_LINE_CAPACITY 由调用方传入；房内硬上限仍是 mode.capacity）。 */
    readonly capacity: number;
}

export interface WorldDirectoryPort {
    /** 解析（或建）分线实例；返回**新鲜**行（含当前 authority_epoch）。line ≥ maxLines ⇒ WorldLineLimitError。 */
    resolve(sId: number, mapId: string, line?: number): Promise<WorldInstanceRow>;
    /** 分线分配：第一条未满的既有分线，否则开新线；全满且到上限 ⇒ WorldLinesExhaustedError。 */
    allocate(sId: number, mapId: string, options: WorldAllocateOptions): Promise<WorldInstanceRow>;
    /** 丢弃某实例的缓存映射（行被删 / 测试清理）。 */
    forget(sId: number, instanceId: string): void;
}

export interface WorldDirectoryOptions {
    readonly maxLines?: number;
    readonly registry?: WorldRegistryPort;
}

export class WorldDirectory implements WorldDirectoryPort {
    /** WorldAddress → instanceId（只缓存 id；行每次回读）。 */
    private readonly ids = new Map<string, string>();
    private readonly inflight = new Map<string, Promise<WorldInstanceRow>>();
    readonly maxLines: number;
    private readonly registry: WorldRegistryPort;

    constructor(private readonly sql: WorldDirectorySql = { findOrCreateInstance, readInstance, listInstances }, options: WorldDirectoryOptions = {}) {
        this.maxLines = options.maxLines ?? WORLD_MAX_LINES_PER_MAP;
        if (!Number.isSafeInteger(this.maxLines) || this.maxLines < 1) throw new RangeError(`[WorldDirectory] maxLines 必须 ≥ 1：${String(this.maxLines)}`);
        this.registry = options.registry ?? redisWorldRegistry;
    }

    async resolve(sId: number, mapId: string, line: number = DEFAULT_WORLD_LINE): Promise<WorldInstanceRow> {
        if (!Number.isSafeInteger(line) || line < 0) throw new RangeError(`[WorldDirectory] line 非法：${String(line)}`);
        if (line >= this.maxLines) throw new WorldLineLimitError(mapId, line, this.maxLines);
        const key = worldAddressOf(sId, mapId, line);
        const cached = this.ids.get(key);
        if (cached !== undefined) {
            const row = await this.sql.readInstance(sId, cached);
            if (row && row.mapId === mapId && row.line === line) return row;
            this.ids.delete(key); // 行已不在（被清理）：回落到建行路径
        }
        let flight = this.inflight.get(key);
        if (!flight) {
            flight = this.sql.findOrCreateInstance(sId, mapId, line)
                .then((row) => { this.ids.set(key, row.instanceId); return row; })
                .finally(() => { this.inflight.delete(key); });
            this.inflight.set(key, flight);
        }
        return flight;
    }

    async allocate(sId: number, mapId: string, options: WorldAllocateOptions): Promise<WorldInstanceRow> {
        const capacity = options.capacity;
        if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError(`[WorldDirectory] capacity 必须 ≥ 1：${String(capacity)}`);
        const existing = (await this.sql.listInstances(sId, mapId)).filter((row) => row.line < this.maxLines).sort((a, b) => a.line - b.line);
        for (const row of existing) {
            const info = await this.registry.read(sId, row.instanceId);
            const seated = info?.seated ?? 0;
            if (seated < capacity) {
                this.ids.set(worldAddressOf(sId, mapId, row.line), row.instanceId);
                return row;
            }
        }
        // 全满：开第一条空缺的线（既有 line 集合之外的最小值），到上限为止
        const taken = new Set(existing.map((row) => row.line));
        for (let line = 0; line < this.maxLines; line += 1) {
            if (!taken.has(line)) return this.resolve(sId, mapId, line);
        }
        throw new WorldLinesExhaustedError(mapId, this.maxLines);
    }

    forget(sId: number, instanceId: string): void {
        const prefix = `s${sId}/`;
        for (const [key, id] of this.ids) {
            if (id === instanceId && key.startsWith(prefix)) this.ids.delete(key);
        }
    }

    get size(): number {
        return this.ids.size;
    }
}

/** 进程级目录（WorldRoom / world.enter 缺省注入；int / 单测注入自己的）。 */
export const worldDirectory = new WorldDirectory();
