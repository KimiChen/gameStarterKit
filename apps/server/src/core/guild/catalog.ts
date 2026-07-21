/**
 * 工会目录（demo：config 驱动无 DB——与选服/公告/商店 SKU 同一先例）。
 *
 * ⚠ join 必须校验 gid ∈ 目录（join.ts 用 guildExists）：`guild:evt:seq/log` 是
 * INCR/LPUSH **隐式创建**的无 TTL 键，且 durable 实例 noeviction——放行任意 gid =
 * 恶意客户端遍历 gid 即可无限铸键写满实例（noeviction 写满 = 全服写入失败）。
 * per-uid 限流只降速、不封顶键数，存在性校验才是硬上限。
 *
 * 真实工会系统落地时：本目录换成库表/服务（建会流程负责铸键权），join 换存在性
 * 查询，并同步更新 docs/SERVER.md §10/§13 与本注释。
 */
export interface IGuildEntry {
  gid: number;
  name: string;
}

export const GUILD_CATALOG: readonly IGuildEntry[] = [
  { gid: 1, name: "开拓者" },
  { gid: 2, name: "夜航船" },
  { gid: 3, name: "同文馆" },
  { gid: 4, name: "不夜城" },
];

const GID_SET = new Set(GUILD_CATALOG.map((g) => g.gid));

/** gid 是否在目录内（join 的硬校验；O(1)）。 */
export const guildExists = (gid: number): boolean => GID_SET.has(gid);
