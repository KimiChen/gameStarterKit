/**
 * 区服目录 + `/area/list` 组装 —— WebPlatform 职责（DUAL_MODE §2.7：门户 = **目录** + 身份权威 + 只读投影）。
 *
 * 目录（al / wsUrl / isOps / h）是「客户端进游戏前该去哪」的调度信息，天然属门户；
 * `ul`（我的区）由 char_registry（`characterZones`）回填。MySQL-only（`verifyToken` + `characterZones`）：
 * standalone Fastify 与 apps/server in-process 共用同一函数。
 * ⚠ demo 静态配置；真实实现接配置表/运维后台按 sId 返回各区实例地址（同事改此文件）。
 */
import type { IAreaListRes, IAreaServer } from "@game/shared";
import { verifyToken } from "./auth";
import { characterZones } from "./character";

/** 运维模式（1=灰度/维护中，客户端据此提示）。env AREA_IS_OPS 可覆盖。 */
export const AREA_IS_OPS = process.env.AREA_IS_OPS ? Number(process.env.AREA_IS_OPS) : 0;

/** demo：所有区服的游戏服地址（本机 dev server）。真实实现每服不同实例地址（env AREA_WS_URL 覆盖）。 */
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
 * `/area/list` 组装：目录 + `ul`（用户「我的区」= 建过角的区）。
 * token 可选、**best-effort**：带上且权威校验通过（`verifyToken`，MySQL 一条 PK）→ 回填 `characterZones`；
 * 匿名 / 无效 / 过期 / 掉签 → `ul` 空（⛔ 不抛：选服列表对未登录也要能展示）。
 * ⛔ 不信客户端传的 uid/sId：uid 一律从 token 前缀反查 + 校验（09·G1）。
 */
export async function areaList(token: string | null): Promise<IAreaListRes> {
  let ul: number[] = [];
  if (token) {
    const dot = token.lastIndexOf(".");
    if (dot > 0) {
      const uid = token.slice(0, dot);
      const r = await verifyToken(uid, token);
      if (r.ok) { ul = await characterZones(uid); }
    }
  }
  return { isOps: AREA_IS_OPS, al: [...AREA_SERVERS], ul, h: areaListHash() };
}
