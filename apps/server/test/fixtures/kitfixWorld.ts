/**
 * kitfix 世界持久层夹具（MMO MF7b-B5，docs/MMO.md §5.4 MF7b「夹具 kitfix」）：临时根物化的夹具 kit `kitfix` 的两张表 + CheckpointPort 实现 + grant worker。
 *  - `k_kitfix_checkpoint`（per-zone）：分线 / persona 检查点信封（PRIMARY KEY (server_id, scope, key_id, rev)，只追加；load 取最大 rev）；
 *  - `k_kitfix_world_event`（per-zone，role:"world-event"）：框架固定列集；
 *  - `SqlCheckpointPort`：save* 走框架给的世界事务句柄 `tx.query`（kit 表闸内），load* 用 kit 自己的读连接；
 *  - `grantWorker`：`defineKitWorker` 一轮 = 认领门内事件（`claimWorldEvents`）→ `credit(uid, CUR_GOLD, amount, opId = eventId, owner persona)` → 同事务提交。
 * ⛔ 不进生产 registry / 目录；int 用例（world-crash-restart / world-event-dedup）临时物化。
 */
import type { CheckpointEnvelope, CheckpointPort } from "../../src/rooms/core/CheckpointPort";
import { CUR_GOLD } from "../../src/core/infra/config";
import { defineKitWorker, type KitWorldTx, type ResultSetHeader, type RowDataPacket } from "../../src/core/infra/kitApi";
import type { ServerKitCatalogEntry } from "../../src/kits/catalogTypes";

export const KITFIX_ID = "kitfix";
export const KITFIX_CHECKPOINT_TABLE = "k_kitfix_checkpoint";
export const KITFIX_WORLD_EVENT_TABLE = "k_kitfix_world_event";
export const KITFIX_GRANT_WORKER = "grant";

export const KITFIX_WORLD: ServerKitCatalogEntry = {
    id: KITFIX_ID, version: "1.0.0", api: { default: { version: 1, minSupported: 1 } }, modes: [], domains: [], effects: [],
    sqlFiles: ["sql/001-world.sql"],
    sqlTables: [
        { name: KITFIX_CHECKPOINT_TABLE, zone: "per-zone" },
        { name: KITFIX_WORLD_EVENT_TABLE, zone: "per-zone", role: "world-event" },
    ],
    userKeys: [], workers: [{ id: KITFIX_GRANT_WORKER, entry: "apps/server/src/kits/kitfix/workers/grant.ts" }],
};

export const KITFIX_WORLD_SQL = `CREATE TABLE ${KITFIX_CHECKPOINT_TABLE} (
  server_id SMALLINT UNSIGNED NOT NULL,
  scope     VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  key_id    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  rev       BIGINT UNSIGNED NOT NULL,
  envelope  JSON NOT NULL,
  saved_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, scope, key_id, rev)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE ${KITFIX_WORLD_EVENT_TABLE} (
  server_id      SMALLINT UNSIGNED NOT NULL,
  event_id       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  instance_id    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  seq            BIGINT UNSIGNED NOT NULL,
  kind           VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload        JSON NOT NULL,
  status         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  attempts       INT UNSIGNED NOT NULL DEFAULT 0,
  checkpoint_rev BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, event_id),
  UNIQUE KEY uk_kitfix_world_event_seq (server_id, instance_id, seq),
  KEY idx_kitfix_world_event_status (server_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`;

/** kit 自己的只读连接面（load* 用；生产 kit 会走 withKitTx 读，夹具直接给连接）。 */
export interface KitfixReadSql {
    query<T = RowDataPacket[]>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

interface EnvelopeRow extends RowDataPacket { envelope: unknown }

/** CheckpointPort 走 kitfix 表：save 在世界事务内（同 rev 重放 ⇒ 1062 视为幂等），load 取最大 rev。 */
export class SqlCheckpointPort implements CheckpointPort {
    constructor(private readonly read: KitfixReadSql) {}

    private async save(tx: KitWorldTx, scope: "instance" | "persona", keyId: string, envelope: CheckpointEnvelope): Promise<void> {
        try {
            await tx.query<ResultSetHeader>(
                `INSERT INTO ${KITFIX_CHECKPOINT_TABLE} (server_id, scope, key_id, rev, envelope) VALUES (?, ?, ?, ?, CAST(? AS JSON))`,
                [tx.sId, scope, keyId, envelope.rev, JSON.stringify(envelope)]);
        } catch (error) {
            if ((error as { errno?: unknown }).errno === 1062) return; // 同 rev 重放（提交丢响应）：幂等
            throw error;
        }
    }

    private async load(sId: number, scope: "instance" | "persona", keyId: string): Promise<unknown | null> {
        const [rows] = await this.read.query<EnvelopeRow[]>(
            `SELECT envelope FROM ${KITFIX_CHECKPOINT_TABLE} WHERE server_id = ? AND scope = ? AND key_id = ? ORDER BY rev DESC LIMIT 1`, [sId, scope, keyId]);
        if (rows.length === 0) return null;
        const raw = rows[0]!.envelope;
        return typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    }

    saveInstance(tx: KitWorldTx, instanceId: string, envelope: CheckpointEnvelope): Promise<void> { return this.save(tx, "instance", instanceId, envelope); }
    loadInstance(sId: number, instanceId: string): Promise<unknown | null> { return this.load(sId, "instance", instanceId); }
    savePersona(tx: KitWorldTx, personaId: string, envelope: CheckpointEnvelope): Promise<void> { return this.save(tx, "persona", personaId, envelope); }
    loadPersona(sId: number, personaId: string): Promise<unknown | null> { return this.load(sId, "persona", personaId); }
}

/** persona → uid 的解析（事件载荷只带 personaId；credit 需要账号 uid）：夹具用 persona 表回查。 */
export interface PersonaUidResolver { (tx: { query<T = RowDataPacket[]>(sql: string, params?: unknown[]): Promise<T> }, sId: number, personaId: string): Promise<string | null> }

/**
 * grant worker：一轮 = 一条租约守卫事务；认领门内（checkpoint_rev ≤ 已落库 rev）的 grantCurrency 事件，逐条 credit（opId = eventId ⇒ 重放 DUP）；
 * 单条载荷非法 ⇒ deadLetter，⛔ 不拖累整轮。返回 { more } 让入口同区再跑。
 */
export function createGrantWorker(resolveUid: PersonaUidResolver) {
    return defineKitWorker({
        idleMs: 100,
        async pass(tx, ctx) {
            const claimed = await tx.claimWorldEvents(KITFIX_WORLD_EVENT_TABLE, { limit: 8 });
            for (const event of claimed) {
                const payload = event.payload as { personaId?: unknown; amount?: unknown } | null;
                if (event.kind !== "grantCurrency" || !payload || typeof payload.personaId !== "string" || !Number.isSafeInteger(payload.amount) || (payload.amount as number) <= 0) {
                    await tx.deadLetterWorldEvent(KITFIX_WORLD_EVENT_TABLE, event.eventId);
                    continue;
                }
                const uid = await resolveUid(tx as never, ctx.sId, payload.personaId);
                if (uid === null) {
                    await tx.releaseWorldEvent(KITFIX_WORLD_EVENT_TABLE, event.eventId);
                    continue;
                }
                await tx.credit(uid, CUR_GOLD, payload.amount as number, event.eventId, "world-event", { kind: "persona", personaId: payload.personaId });
            }
            return { more: claimed.length > 0 };
        },
    });
}
