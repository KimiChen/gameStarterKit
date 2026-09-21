import type { IMmoHudContribution } from "../../kits/mmo/api/content/index";
import { MMO_HOLD_PACK_ID } from "../../shared/protocol/lobbyRpc/domains/mmohold";

/** 贡献模块无引擎静态依赖，View 随进入 holdRidge 动态装载。 */
export const hud: IMmoHudContribution = {
    packId: MMO_HOLD_PACK_ID,
    load: async () => {
        const { MmoHoldHudView } = await import("./view/MmoHoldHudView");
        return { create: (context) => new MmoHoldHudView(context) };
    },
};
