import { GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import type { IContentPack } from "@game/shared/kits/mmo/api/content/index";
import { KIT_CONTRIBUTIONS } from "../src/kits/mmo/contributions.generated";

export const CONTRIBUTED_BLADE_ID = "contributed-blade";

/** 只在测试进程内填充生成表：验证生产默认注册表路径，避免把注入单包误当成多包接线。 */
export function installInventoryContributionForTest(): void {
    const renamed = JSON.parse(JSON.stringify(GREYBOX_PACK).replace(/greybox/gu, "inventory-fixture")) as IContentPack;
    const blade = GREYBOX_PACK.items.find((item) => item.slot === "weapon")!;
    const pack: IContentPack = { ...renamed, items: [...renamed.items, { ...blade, itemId: CONTRIBUTED_BLADE_ID, attrs: { attack: 17 } }] };
    const content = (KIT_CONTRIBUTIONS as unknown as { content: { pluginId: string; value: unknown }[] }).content;
    content.push({ pluginId: "inventoryFixture", value: pack });
}
