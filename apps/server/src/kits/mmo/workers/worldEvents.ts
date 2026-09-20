/**
 * mmo kit · worldEvents worker（kit.json workers[].entry；MMO MF7a 形态，docs/MMO.md §7.3 事件批原子规则）：
 * `KIT_WORKER_ZONES=<区> npm --workspace @game/server run worker -- mmo:worldEvents`。
 * 一轮 = 一条租约守卫事务：认领门内（checkpoint_rev ≤ 已落库分线检查点 rev）的 k_mmo_world_event 行，按 kind 落地：
 *  - grantCurrency { personaId, userId, amount }：主账 credit（opId = eventId ⇒ 重放 DUP；owner = persona 主体，§7.1「货币在框架主账」）；
 *  - lootClaimed { actorEntityId, actorCharacterId, lootId, itemTemplateId, count }（MK2-B3 / MK3-B1）：inventory 面 `claimLoot`（并入堆叠 / 空格 / 溢出进 mail，
 *    k_mmo_receipt op_id = eventId；重放只回读回执 ⇒ ⛔ 复制物品）；模板不在包 / 邮箱也满 ⇒ MmoInventoryError ⇒ 死信；
 *  - grantItem { opId, toCharacterId, itemTemplateId, count, reason, packId }（MK4-B1 编排命令）：inventory 面 grantItem，回执 op_id = 载荷 opId
 *    （= orch:<packId>:<eventSeq>:<idx>，跨重启同一命令同一 opId ⇒ 重放零写入）；
 *  - packSuspended { packId, reason }（MK4-B1 审计行）：无效果，认领即 done；
 *  - 未知 kind：一律死信（⛔ 放回 pending 空转）。
 * 单条载荷非法 ⇒ deadLetter，⛔ 不拖累整轮；返回 { more } 让入口同区再跑。K1：只 import kit-api 门面与本 kit 目录。
 */
import { MMO_EVENT_LOOT_CLAIMED, lootClaimedPayloadOf } from "@game/shared/kits/mmo/api/inventory/index";
import { CUR_GOLD, defineKitWorker } from "../../../core/infra/kitApi";
import { MmoInventoryError, claimLoot, grantItem } from "../api/inventory/index";
import { sqlItemStore } from "../persistence/items";

export const MMO_WORLD_EVENT_TABLE = "k_mmo_world_event";
export const MMO_EVENT_GRANT_CURRENCY = "grantCurrency";
export const MMO_EVENT_GRANT_ITEM = "grantItem";
export const MMO_EVENT_PACK_SUSPENDED = "packSuspended";
export { MMO_EVENT_LOOT_CLAIMED };

export interface MmoGrantItemPayload { readonly opId: string; readonly toCharacterId: string; readonly itemTemplateId: string; readonly count: number }

/** grantItem 载荷闸（纯函数）：opId / toCharacterId / itemTemplateId 为 id、count 正整数 ≤ 9999；其余键忽略。 */
export function grantItemPayloadOf(raw: unknown): MmoGrantItemPayload | null {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const value = raw as { opId?: unknown; toCharacterId?: unknown; itemTemplateId?: unknown; count?: unknown };
    const ID = /^[A-Za-z0-9._:-]{1,64}$/u;
    for (const key of ["opId", "toCharacterId", "itemTemplateId"] as const) if (typeof value[key] !== "string" || !ID.test(value[key] as string)) return null;
    if (!Number.isSafeInteger(value.count) || (value.count as number) < 1 || (value.count as number) > 9_999) return null;
    return { opId: value.opId as string, toCharacterId: value.toCharacterId as string, itemTemplateId: value.itemTemplateId as string, count: value.count as number };
}
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
            if (event.kind === MMO_EVENT_PACK_SUSPENDED) continue; // 审计行：认领即 done
            if (event.kind === MMO_EVENT_GRANT_ITEM) {
                const grant = grantItemPayloadOf(event.payload);
                if (grant === null) {
                    await tx.deadLetterWorldEvent(MMO_WORLD_EVENT_TABLE, event.eventId);
                    continue;
                }
                try {
                    await grantItem(sqlItemStore(tx), { opId: grant.opId, characterId: grant.toCharacterId, itemId: grant.itemTemplateId, count: grant.count, kind: MMO_EVENT_GRANT_ITEM });
                } catch (error) {
                    if (!(error instanceof MmoInventoryError)) throw error;
                    await tx.deadLetterWorldEvent(MMO_WORLD_EVENT_TABLE, event.eventId);
                }
                continue;
            }
            if (event.kind === MMO_EVENT_LOOT_CLAIMED) {
                const loot = lootClaimedPayloadOf(event.payload);
                if (loot === null) {
                    await tx.deadLetterWorldEvent(MMO_WORLD_EVENT_TABLE, event.eventId);
                    continue;
                }
                try {
                    await claimLoot(sqlItemStore(tx), loot, event.eventId);
                } catch (error) {
                    if (!(error instanceof MmoInventoryError)) throw error;
                    await tx.deadLetterWorldEvent(MMO_WORLD_EVENT_TABLE, event.eventId);
                }
                continue;
            }
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
