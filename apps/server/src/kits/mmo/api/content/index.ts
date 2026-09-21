/**
 * mmo kit · `content` api 面（服务端，docs/MMO.md §7.2）：内容注册表的只读门面——`contentPacks()`（贡献包 + 内置灰盒，MK4-B2）、`packForMap(mapId)`、
 * `mapDefOf`、`creature` / `spell` / `item`。插件只能 import 本门面；内容本身经贡献点 `content` 交给 kit（MK4-B2），⛔ 不 import 注册表内部。
 * 本面任何导出变化都要 bump `api.content.version`。
 */
import { mergeItemTemplates, type ICreatureTemplate, type IContentPackIndex, type IItemTemplate, type IMapDef, type ISpellTemplate } from "@game/shared/kits/mmo/api/content/index";
import { builtinContent, contentForMap, contentIndexes } from "../../content/registry";

export type { ICreatureTemplate, IContentPackIndex, IItemTemplate, IMapDef, ISpellTemplate };

/** 内置灰盒包索引（兜底；MK0 起的单包入口，既有调用照旧）。 */
export function contentIndex(): IContentPackIndex {
    return builtinContent();
}

/** 全部已校验内容包（贡献包在前、内置灰盒兜底；启动期 fail-closed）。 */
export function contentPacks(): readonly IContentPackIndex[] {
    return contentIndexes();
}

let cachedItems: Pick<IContentPackIndex, "itemById"> | null = null;

/** 全区物品索引：跨包背包 / 已落库事件均按 itemId 解析，相同 id 的不同定义在装载期拒绝。 */
export function itemCatalog(): Pick<IContentPackIndex, "itemById"> {
    if (cachedItems === null) cachedItems = { itemById: mergeItemTemplates(contentPacks()) };
    return cachedItems;
}

/** 承载该图的内容包（贡献包优先，再内置；图不在任何包内 = null）。 */
export function packForMap(mapId: string, indexes: readonly IContentPackIndex[] = contentIndexes()): IContentPackIndex | null {
    return contentForMap(mapId, indexes);
}

export function mapDefOf(mapId: string, index: IContentPackIndex = contentIndex()): IMapDef | null {
    return index.mapById.get(mapId) ?? null;
}

export function creatureOf(templateId: string, index: IContentPackIndex = contentIndex()): ICreatureTemplate | null {
    return index.creatureById.get(templateId) ?? null;
}

export function spellOf(spellId: string, index: IContentPackIndex = contentIndex()): ISpellTemplate | null {
    return index.spellById.get(spellId) ?? null;
}

export function itemOf(itemId: string, index: Pick<IContentPackIndex, "itemById"> = itemCatalog()): IItemTemplate | null {
    return index.itemById.get(itemId) ?? null;
}
