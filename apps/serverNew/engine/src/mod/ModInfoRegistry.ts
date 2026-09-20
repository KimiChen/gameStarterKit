import type { ModInfo } from './ModInfo'

/**
 * Bean 模块名 → 模块描述（`modId` / `modName` / `subMod` / 构造类型）。
 *
 * 只保存变更跟踪、持久化别名与 transformer 需要的 Bean 记录，⛔ 不创建或加载任何 wire schema。
 * 模块名到 `modId` 的映射是 Bean 的字段身份，不是网络协议号：新增或调整网络编码时不得动这张表。
 */
export class ModInfoRegistry {
    static mods: { [key: string]: ModInfo } = {}
}
