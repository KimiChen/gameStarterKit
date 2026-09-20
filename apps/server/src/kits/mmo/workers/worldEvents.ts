/**
 * mmo kit · worldEvents worker（kit.json workers[].entry；MMO MF7a 形态，docs/MMO.md §7.3 事件批原子规则）：
 * `KIT_WORKER_ZONES=<区> npm --workspace @game/server run worker -- mmo:worldEvents`。
 * 一轮 = 一条租约守卫事务：认领门内（checkpoint_rev ≤ 已落库分线检查点 rev）的 k_mmo_world_event 行，按 kind 落地：
 *  - grantCurrency { personaId, userId, amount }：主账 credit（opId = eventId ⇒ 重放 DUP；owner = persona 主体，§7.1「货币在框架主账」）；
 *  - grantItem / lootClaim（MK2 / MK3 接入）与未知 kind：MK0 一律死信（⛔ 放回 pending 空转）。
 * 单条载荷非法 ⇒ deadLetter，⛔ 不拖累整轮；返回 { more } 让入口同区再跑。K1：只 import kit-api 门面与本 kit 目录。
 */
import { CUR_GOLD, defineKitWorker } from "../../../core/infra/kitApi";

export const MMO_WORLD_EVENT_TABLE = "k_mmo_world_event";
export const MMO_EVENT_GRANT_CURRENCY = "grantCurrency";
/** 一轮最多认领的行数（有界批次）。 */
export const MMO_WORLD_EVENT_CLAIM_LIMIT = 16;

export interface MmoGrantCurrencyPayload {
    readonly personaId: string;
    readonly userId: string;
    readonly amount: number;
}

/** 载荷闸（纯函数，单测直接钉）：非法 ⇒ null。 */
export function grantCurrencyPayloadOf(raw: unknown): MmoGrantCurrencyPayload | null {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const value = raw as { personaId?: unknown; userId?: unknown; amount?: unknown };
    if (typeof value.personaId !== "string" || value.personaId === "" || value.personaId.length > 64) return null;
    if (typeof value.userId !== "string" || value.userId === "" || value.userId.length > 32) return null;
    if (!Number.isSafeInteger(value.amount) || (value.amount as number) <= 0) return null;
    return { personaId: value.personaId, userId: value.userId, amount: value.amount as number };
}

export default defineKitWorker({
    idleMs: 500,
    async pass(tx) {
        const claimed = await tx.claimWorldEvents(MMO_WORLD_EVENT_TABLE, { limit: MMO_WORLD_EVENT_CLAIM_LIMIT });
        for (const event of claimed) {
            if (event.kind !== MMO_EVENT_GRANT_CURRENCY) {
                await tx.deadLetterWorldEvent(MMO_WORLD_EVENT_TABLE, event.eventId);
                continue;
            }
            const payload = grantCurrencyPayloadOf(event.payload);
            if (payload === null) {
                await tx.deadLetterWorldEvent(MMO_WORLD_EVENT_TABLE, event.eventId);
                continue;
            }
            await tx.credit(payload.userId, CUR_GOLD, payload.amount, event.eventId, "world-event", { kind: "persona", personaId: payload.personaId });
        }
        return { more: claimed.length > 0 };
    },
});
