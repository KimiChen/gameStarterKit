/**
 * 选服列表 demo 配置（starter kit：服务端静态配置，无 DB）。
 *
 * ⚠ 区服 = 独立实例：`wsUrl` 是每区服游戏服的连接地址，客户端选服后连它。demo 全部指向
 * 同一 dev server（env `AREA_WS_URL` 可覆盖）；真实实现由中心服/调度按 sId 返回各实例地址
 * （同事改这里接配置表/运维后台即可）。
 */
import type { IAreaServer } from "@game/shared";

/** 运维模式（1=灰度/维护中，客户端提示）。env AREA_IS_OPS 可覆盖。 */
export const AREA_IS_OPS = process.env.AREA_IS_OPS ? Number(process.env.AREA_IS_OPS) : 0;

/**
 * demo：无有效 token 时是否仍回填「我的角色」页签（starter kit 默认开）。
 * 客户端走 mock 登录，其 token 过不了 verifyBearer；开此项让「我的」页签有内容可演示。
 * 真实部署置 `AREA_DEMO_UL=0`，只走 token 反查（09·G1：⛔ 不信客户端 sId）。
 */
export const AREA_DEMO_UL = process.env.AREA_DEMO_UL ? Number(process.env.AREA_DEMO_UL) !== 0 : true;

/** demo：所有区服的游戏服地址（本机 dev server）。真实实现每服不同实例地址。 */
const AREA_WS_URL = process.env.AREA_WS_URL ?? "ws://localhost:2568";

/** 全部区服（demo；t：0 正常 1 新服 2 爆满 9 维护 / status：1 流畅 2 繁忙 9 维护）。 */
export const AREA_SERVERS: readonly IAreaServer[] = [
  { sId: 1, name: "一区·启程", t: 0, status: 2, openTime: 1_700_000_000, wsUrl: AREA_WS_URL },
  { sId: 2, name: "二区·同行", t: 2, status: 2, openTime: 1_705_000_000, wsUrl: AREA_WS_URL },
  { sId: 3, name: "三区·并肩", t: 0, status: 1, openTime: 1_710_000_000, wsUrl: AREA_WS_URL },
  { sId: 4, name: "四区·远征", t: 9, status: 9, openTime: 1_712_000_000, wsUrl: AREA_WS_URL },
  { sId: 5, name: "五区·新生", t: 1, status: 1, openTime: 0, wsUrl: AREA_WS_URL },
];

/** serverList 一致性哈希（djb2，对内容稳定；对应原项目 serverList.h，连服/踢人校验用）。 */
export function areaListHash(): string {
  const s = JSON.stringify(AREA_SERVERS);
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; }
  return h.toString(16);
}

/**
 * 用户最近登录过的区服 sId（登录后回填「我的区服」页签）。
 * demo 返回一区（让「我的」页签有内容）；真实实现从 MySQL 登录历史 / Redis 读该 uid 的建角区服。
 * ⛔ 不信客户端传的 sId，一律 token 反查后查库。
 */
export async function getUserRecentServers(_uid: string): Promise<number[]> {
  return [AREA_SERVERS[0].sId];
}
