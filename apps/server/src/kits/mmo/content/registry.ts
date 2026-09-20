/**
 * mmo kit 内部模块：内容注册表（docs/MMO.md §7.5「启动期校验 fail-closed」）。MK0 内置灰盒包（shared TS 字面量单源）；
 * MK4 改为读 `./contributions.generated`（贡献点 content）。首次访问即 `validateContentPack`，任一失败抛 ⇒ 登记 world mode 的组合根拒启。
 * ⛔ 插件不得 import 本文件（走 api/content）。
 */
import { indexContentPack, validateContentPack, type IContentPackIndex } from "@game/shared/kits/mmo/api/content/index";
import { GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";

let cached: IContentPackIndex | null = null;

/** 已校验的内置包索引（进程内缓存；校验失败每次都抛，⛔ 缓存失败态）。 */
export function builtinContent(): IContentPackIndex {
    if (cached === null) cached = indexContentPack(validateContentPack(GREYBOX_PACK));
    return cached;
}

/** 单测 seam：换一份包（不经缓存）。 */
export function contentIndexOf(pack: unknown): IContentPackIndex {
    return indexContentPack(validateContentPack(pack));
}
