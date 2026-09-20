/**
 * mmo kit · `content` api 面（服务端，docs/MMO.md §7.2）：内容注册表的只读门面——`packForMap(mapId)`、`mapDefOf`、`creature` / `spell` / `item`。
 * 插件只能 import 本门面；内容本身经贡献点交给 kit（MK4），⛔ 不 import 注册表内部。本面任何导出变化都要 bump `api.content.version`。
 */
import type { ICreatureTemplate, IContentPackIndex, IItemTemplate, IMapDef, ISpellTemplate } from "@game/shared/kits/mmo/api/content/index";
import { builtinContent } from "../../content/registry";

export type { ICreatureTemplate, IContentPackIndex, IItemTemplate, IMapDef, ISpellTemplate };

/** 当前生效的内容包索引（MK0 = 内置灰盒；MK4 = 贡献点装载）。 */
export function contentIndex(): IContentPackIndex {
    return builtinContent();
}

/** 承载该图的内容包（MK0 单包：图不在包内 = null）。 */
export function packForMap(mapId: string, index: IContentPackIndex = contentIndex()): IContentPackIndex | null {
    return index.mapById.has(mapId) ? index : null;
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

export function itemOf(itemId: string, index: IContentPackIndex = contentIndex()): IItemTemplate | null {
    return index.itemById.get(itemId) ?? null;
}
