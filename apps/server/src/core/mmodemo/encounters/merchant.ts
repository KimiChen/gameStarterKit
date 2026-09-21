/**
 * mmodemo · 行商（docs/MMO.md §9.2「NPC 商人（interact → prompt）」）：对 npc `merchant` 做 `trade` 交互 ⇒ prompt 两个选项；选「领药水」⇒ grantItem 一瓶灰谷药水。
 * v1 命令集没有扣币 / 交易命令（§8.3），所以是「赠送」而不是买卖；⛔ 按角色记领取次数（vars ≤ 4 KB，逐角色键会撑爆）——灰盒取舍，README 登记。
 */
import type { OrchestrationCommand, OrchestrationEvent, OrchestrationReadApi } from "@game/shared/kits/mmo/api/orchestration/index";

export const MERCHANT_NPC_ID = "merchant";
export const TRADE_INTERACT_ID = "trade";
export const TRADE_PROMPT_PREFIX = "trade:";
export const TRADE_GIFT_CHOICE_ID = "gift";
export const TRADE_LEAVE_CHOICE_ID = "leave";
export const TRADE_GIFT_ITEM_ID = "vale-tonic";
/** 模块 `interacts`：interactId → 可作用的模板 id（kit 启动期与内容包 npc.interacts 交叉核对） */
export const MERCHANT_INTERACTS = Object.freeze({ [TRADE_INTERACT_ID]: { targets: [MERCHANT_NPC_ID] } });

export type InteractEvent = Extract<OrchestrationEvent, { readonly kind: "interact" }>;
export type ChoiceEvent = Extract<OrchestrationEvent, { readonly kind: "choice" }>;

export function onInteract(event: InteractEvent): OrchestrationCommand[] {
    if (event.interactId !== TRADE_INTERACT_ID) return [];
    return [{
        op: "prompt", toEntityId: event.actorEntityId, promptId: `${TRADE_PROMPT_PREFIX}${event.targetEntityId}`,
        choices: [{ id: TRADE_GIFT_CHOICE_ID, label: "领一瓶灰谷药水" }, { id: TRADE_LEAVE_CHOICE_ID, label: "下次再来" }],
    }];
}

export function onChoice(event: ChoiceEvent, api: OrchestrationReadApi): OrchestrationCommand[] {
    if (!event.promptId.startsWith(TRADE_PROMPT_PREFIX) || event.choiceId !== TRADE_GIFT_CHOICE_ID) return [];
    const actor = api.world.entity(event.actorEntityId);
    if (!actor?.characterId) return [];
    return [{ op: "grantItem", toCharacterId: actor.characterId, itemTemplateId: TRADE_GIFT_ITEM_ID, count: 1, reason: "merchant" }];
}
