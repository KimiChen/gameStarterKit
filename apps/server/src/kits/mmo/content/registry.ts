/**
 * mmo kit 内部模块：内容注册表（docs/MMO.md §7.5「启动期校验 fail-closed」/ §7.6「MK4 改为经贡献点装载」；MK4-B2）。
 * 内容来源 = 贡献点 `content`（`./contributions.generated` 的 data 贡献：插件 JSON 内容包，按插件 id 排序）+ 内置灰盒包（shared TS 字面量，兜底）。
 * 每份都过 `validateContentPack`（任一失败抛 ⇒ 登记 world mode 的组合根拒启）；packId 与 mapId 跨包不得重复（一图一包，v1 ⛔ 多包叠加）；
 * 物品只持久化 itemId：跨包同 id 同模板可复用，不同定义由双端共享 mergeItemTemplates 拒绝。
 * `contentFor(mapId)` 取承载该图的包索引（贡献包优先，再内置）。首次访问即校验并缓存（⛔ 缓存失败态）。⛔ 插件不得 import 本文件（走 api/content）。
 */
import { indexContentPack, mergeItemTemplates, validateContentPack, type IContentPackIndex } from "@game/shared/kits/mmo/api/content/index";
import { GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import { KIT_CONTRIBUTIONS } from "../contributions.generated";

export interface ContentSource { readonly pluginId: string | null; readonly value: unknown }

/** 贡献点 `content` 的填充（codegen 渲染的 JSON 字面量）。 */
export function contributedContentSources(): readonly ContentSource[] {
    const filled = (KIT_CONTRIBUTIONS as { readonly content: readonly { readonly pluginId: string; readonly value: unknown }[] }).content;
    return filled.map((entry) => ({ pluginId: entry.pluginId, value: entry.value }));
}

/** 组合：贡献包（顺序 = 插件 id）在前、内置灰盒兜底；校验 + 索引 + 跨包唯一性。 */
export function contentIndexesOf(sources: readonly ContentSource[], builtin: unknown = GREYBOX_PACK): readonly IContentPackIndex[] {
    const indexes: IContentPackIndex[] = [];
    const packIds = new Map<string, string>();
    const mapIds = new Map<string, string>();
    for (const source of [...sources, { pluginId: null, value: builtin }]) {
        const label = source.pluginId === null ? "builtin" : `plugin:${source.pluginId}`;
        let index: IContentPackIndex;
        try { index = indexContentPack(validateContentPack(source.value)); } catch (error) { throw new Error(`[mmo content] 贡献包 ${label} 不合法：${error instanceof Error ? error.message : String(error)}`); }
        const owner = packIds.get(index.pack.packId);
        if (owner !== undefined) throw new Error(`[mmo content] packId "${index.pack.packId}" 重复：${owner} 与 ${label}`);
        packIds.set(index.pack.packId, label);
        for (const mapId of index.mapById.keys()) {
            const holder = mapIds.get(mapId);
            if (holder !== undefined) throw new Error(`[mmo content] 地图 "${mapId}" 同时在 ${holder} 与 ${label}（一图一包）`);
            mapIds.set(mapId, label);
        }
        indexes.push(index);
    }
    mergeItemTemplates(indexes); // 库存只存 itemId：同 id 的资产语义必须跨包一致。
    return indexes;
}

let cached: readonly IContentPackIndex[] | null = null;

/** 已校验的全部包索引（进程内缓存；校验失败每次都抛，⛔ 缓存失败态）。 */
export function contentIndexes(): readonly IContentPackIndex[] {
    if (cached === null) cached = contentIndexesOf(contributedContentSources());
    return cached;
}

/** 内置灰盒包索引（兜底；MK0 起的单包入口）。 */
export function builtinContent(): IContentPackIndex {
    const all = contentIndexes();
    return all[all.length - 1]!;
}

/** 承载该图的包（贡献包优先）；没有 = null。 */
export function contentForMap(mapId: string, indexes: readonly IContentPackIndex[] = contentIndexes()): IContentPackIndex | null {
    return indexes.find((index) => index.mapById.has(mapId)) ?? null;
}

/** 单测 seam：换一份包（不经缓存）。 */
export function contentIndexOf(pack: unknown): IContentPackIndex {
    return indexContentPack(validateContentPack(pack));
}
