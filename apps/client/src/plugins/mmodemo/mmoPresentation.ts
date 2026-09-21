/**
 * mmodemo · 表现映射（贡献点 `mmo.presentation`，docs/MMO.md §7.5 / §9.2「占位胶囊 + 灰盒贴图」）：presentationId → 2D 公告板颜色 / 尺寸（`model` 3D 预留）。
 * 键与内置灰盒（BUILTIN_PRESENTATION）不重叠（用例钉），⛔ 覆盖 kit 的映射；只 import kit 客户端 `api/content` 门面（K1 边界）。
 */
import type { IPresentationMap } from "../../kits/mmo/api/content/index";

export const presentation: IPresentationMap = Object.freeze({
    // 职业（demoVale 的职业模板用自己的表现 id，与灰盒 fighter / caster 分开）
    "vale-fighter": { label: "战士", color: [90, 140, 220, 255], size: 44 },
    "vale-caster": { label: "法师", color: [170, 110, 230, 255], size: 44 },
    // 怪物 / boss / NPC
    wolf: { label: "灰狼", color: [120, 120, 125, 255], size: 38 },
    "vale-boar": { label: "林猪", color: [150, 100, 60, 255], size: 42 },
    "alpha-wolf": { label: "头狼", color: [60, 60, 70, 255], size: 60 },
    merchant: { label: "行商", color: [220, 180, 90, 255], size: 44 },
    // 物品（kind loot 的 templateId = itemId）
    "wolf-fang": { label: "狼牙", color: [235, 235, 220, 255], size: 16 },
    "wolf-pelt": { label: "狼皮", color: [140, 130, 120, 255], size: 18 },
    "boar-tusk": { label: "猪牙", color: [225, 215, 190, 255], size: 16 },
    "alpha-fang": { label: "头狼之牙", color: [250, 240, 200, 255], size: 20 },
    "iron-sword": { label: "铁剑", color: [190, 195, 205, 255], size: 20 },
    "oak-staff": { label: "橡木杖", color: [150, 110, 60, 255], size: 20 },
    "leather-vest": { label: "皮甲", color: [130, 90, 50, 255], size: 20 },
    "hunter-cloak": { label: "猎人斗篷", color: [70, 110, 60, 255], size: 20 },
    "amber-charm": { label: "琥珀护符", color: [240, 170, 50, 255], size: 16 },
    "vale-tonic": { label: "灰谷药水", color: [90, 200, 160, 255], size: 16 },
});
