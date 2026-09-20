/**
 * mmo kit · `inventory` api 面（客户端，docs/MMO.md §7.2；v1 = MK2-B3 掉落半边，v2 = MK3-B1 物品半边）：最近掉落 / 拾取半径；背包视图模型
 * （`bagRows` 按 bag → equip → mail 排、`equippedOf`、`describeBag` HUD 摘要）与 Lobby RPC 入口 `fetchBag` / `moveItem`（插件经本入口，⛔ 自己 import MmoRpc）。
 * ⛔ 不 import cc；本面任何导出变化都要 bump `api.inventory.version`。
 */
import type { LobbyRpcPort } from "../../../../app/ports";
import {
    MMO_BAG_SLOTS, MMO_EQUIP_SLOT_COUNT, MMO_EQUIP_SLOT_INDEX, MMO_LOOT_EXPIRE_MS, MMO_MAIL_SLOTS, MMO_PICKUP_RADIUS, bagAttrs, bagSignature, capacityOf, checkEquip, equipSlotOf,
    equippedTemplates, nearestLoot, planGrant, sortBagItems, type IBagAttrs, type IMmoBagItemWire, type IMmoBagWire, type MmoItemLocation,
} from "../../../../shared/kits/mmo/api/inventory/index";
import type { IItemTemplate } from "../../../../shared/kits/mmo/api/content/index";
import { itemTemplateOf } from "../content/index";
import { MmoRpc, type IMmoBagRes, type IMmoMoveItemReq, type IMmoMoveItemRes } from "../../../../shared/protocol/lobbyRpc/domains/mmo";

export {
    MMO_BAG_SLOTS, MMO_EQUIP_SLOT_COUNT, MMO_EQUIP_SLOT_INDEX, MMO_LOOT_EXPIRE_MS, MMO_MAIL_SLOTS, MMO_PICKUP_RADIUS, bagAttrs, bagSignature, capacityOf, checkEquip, equipSlotOf,
    equippedTemplates, nearestLoot, planGrant, sortBagItems,
};
export type { IBagAttrs, IMmoBagItemWire, IMmoBagRes, IMmoBagWire, IMmoMoveItemRes, MmoItemLocation };

export { itemTemplateOf };

/** 只读背包（mmo.bag）。 */
export function fetchBag(lobbyRpc: Pick<LobbyRpcPort, "query">, characterId: string): Promise<IMmoBagRes> {
    return lobbyRpc.query(MmoRpc.Bag, { characterId });
}

export type MoveItemInput = Omit<IMmoMoveItemReq, "clientReqId">;

/** 移动 / 装备一件（mmo.moveItem，幂等写：clientReqId 由宿主 sendIdempotent 生成）。 */
export function moveItem(lobbyRpc: Pick<LobbyRpcPort, "sendIdempotent">, input: MoveItemInput): Promise<IMmoMoveItemRes> {
    return lobbyRpc.sendIdempotent(MmoRpc.MoveItem, { characterId: input.characterId, itemInstanceId: input.itemInstanceId, location: input.location, slot: input.slot });
}

export interface BagRowView {
    readonly id: string;
    readonly itemId: string;
    readonly name: string;
    readonly count: number;
    readonly location: MmoItemLocation;
    readonly slot: number;
    /** 可装备到的 equip 格（不可装备 ⇒ null） */
    readonly equipSlot: number | null;
}

/** 背包行视图（bag → equip → mail、slot 升序；名字取模板，未知模板用 itemId）。 */
export function bagRows(view: IMmoBagWire | null, templateOf: (itemId: string) => IItemTemplate | null = itemTemplateOf): BagRowView[] {
    if (!view) return [];
    return sortBagItems(view.items).map((item) => {
        const template = templateOf(item.itemId);
        return { id: item.id, itemId: item.itemId, name: template?.name ?? item.itemId, count: item.count, location: item.location, slot: item.slot, equipSlot: template ? equipSlotOf(template.slot) : null };
    });
}

/** 已装备（equip 位置）的行。 */
export function equippedOf(view: IMmoBagWire | null, templateOf: (itemId: string) => IItemTemplate | null = itemTemplateOf): BagRowView[] {
    return bagRows(view, templateOf).filter((row) => row.location === "equip");
}

/** HUD 摘要：「背包 n/24 · 装备 锈剑 · 邮箱 m」（无背包 ⇒ 空串）。 */
export function describeBag(view: IMmoBagWire | null, templateOf: (itemId: string) => IItemTemplate | null = itemTemplateOf): string {
    if (!view) return "";
    const rows = bagRows(view, templateOf);
    const bag = rows.filter((row) => row.location === "bag").length;
    const equipped = rows.filter((row) => row.location === "equip").map((row) => row.name);
    const mail = rows.filter((row) => row.location === "mail").length;
    return `背包 ${bag}/${MMO_BAG_SLOTS}${equipped.length > 0 ? ` · 装备 ${equipped.join(" ")}` : ""}${mail > 0 ? ` · 邮箱 ${mail}` : ""}`;
}
