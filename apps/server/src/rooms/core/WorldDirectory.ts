/**
 * WorldDirectory（MMO MF4-B6，docs/MMO.md §4.4 / §5.4 MF4）：`(sId, mapId, line) → world_instance` 的查找 / 建行。
 * v1 = 进程内 id 缓存 + MySQL 行（`control.findOrCreateInstance` 幂等；行本身每次回读——`authority_epoch` 是权威 CAS 的 expected，
 * ⛔ 不能缓存陈旧值）。分线分配与上限归 MF10：v1 缺省 line = DEFAULT_WORLD_LINE；实例所在节点 publicAddress（D27 / MF8 `endpoint`）也归后续批次。
 * ⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
import { findOrCreateInstance, readInstance, type WorldInstanceRow } from "./control";

/** v1 单分线：MF10 分线分配落地前，缺省都在 0 号线。 */
export const DEFAULT_WORLD_LINE = 0;

/** WorldAddress 字符串形（persona.world_address 列 / 日志；与 MF4-B3 int 用例同形）。 */
export const worldAddressOf = (sId: number, mapId: string, line: number): string => `s${sId}/${mapId}/${line}`;

export interface WorldDirectorySql {
    findOrCreateInstance(sId: number, mapId: string, line: number): Promise<WorldInstanceRow>;
    readInstance(sId: number, instanceId: string): Promise<WorldInstanceRow | null>;
}

export interface WorldDirectoryPort {
    /** 解析（或建）分线实例；返回**新鲜**行（含当前 authority_epoch）。 */
    resolve(sId: number, mapId: string, line?: number): Promise<WorldInstanceRow>;
    /** 丢弃某实例的缓存映射（行被删 / 测试清理）。 */
    forget(sId: number, instanceId: string): void;
}

export class WorldDirectory implements WorldDirectoryPort {
    /** WorldAddress → instanceId（只缓存 id；行每次回读）。 */
    private readonly ids = new Map<string, string>();
    private readonly inflight = new Map<string, Promise<WorldInstanceRow>>();

    constructor(private readonly sql: WorldDirectorySql = { findOrCreateInstance, readInstance }) {}

    async resolve(sId: number, mapId: string, line: number = DEFAULT_WORLD_LINE): Promise<WorldInstanceRow> {
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

/** 进程级目录（WorldRoom 缺省注入；int / 单测注入自己的）。 */
export const worldDirectory = new WorldDirectory();
