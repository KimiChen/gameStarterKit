import assert from "node:assert/strict";
import { test } from "node:test";
import { GREYBOX_PACK } from "../src/shared/kits/mmo/content/greybox";
import type { IContentPack } from "../src/shared/kits/mmo/api/content/index";
import { KIT_CONTRIBUTIONS } from "../src/kits/mmo/contributions.generated";
import { contentPacks, itemTemplateOf } from "../src/kits/mmo/api/content/index";

test("内容装载：同 itemId 异定义拒绝且不缓存失败；相同模板共享、自定义模板跨包可查", () => {
    const renamed = JSON.parse(JSON.stringify(GREYBOX_PACK).replace(/greybox/gu, "client-inventory")) as IContentPack;
    const item = renamed.items[0]!;
    const entries = (KIT_CONTRIBUTIONS as unknown as { content: { pluginId: string; value: unknown }[] }).content;
    const entry = { pluginId: "inventoryFixture", value: { ...renamed, items: [{ ...item, stackMax: item.stackMax + 1 }, ...renamed.items.slice(1)] } };
    entries.push(entry);
    assert.throws(() => contentPacks(), /conflicting definitions/u);
    const customId = "client-contributed-item";
    entry.value = { ...renamed, items: [...renamed.items, { ...item, itemId: customId }] };
    assert.equal(contentPacks().length, entries.length + 1, "贡献包（含本用例注入的）+ 内置灰盒；⛔ 假设树上没有别的内容插件（MG0 起有 mmodemo）");
    assert.equal(itemTemplateOf(customId)?.itemId, customId);
    assert.equal(itemTemplateOf(item.itemId)?.stackMax, item.stackMax);
});
