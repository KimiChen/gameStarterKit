/**
 * 选服会话状态（对应原项目 launcher.serverList/currentServer）——当前选中区服 + serverList 哈希。
 *
 * 大厅（登录/选服，view 层）写、Main（进房）读；纯状态模块，只 import shared 类型（无 cc/fairygui）。
 * ⚠ 区服 = 独立实例：游戏 HTTP/Colyseus 连接使用目录返回的 gameHttpUrl，
 * gameWsUrl 作为明确的 WS 地址一并保存在会话中，不再从旧 wsUrl 推导。
 */
import { isServerEnterable } from "../logic/areaDirectory";
import type { WebPlatformAreaListResponse, WebPlatformAreaServer } from "../shared/index";

let current: WebPlatformAreaServer | null = null;
let listHash = "";
let serverList: WebPlatformAreaListResponse | null = null;

/** 存 serverList（拉取后）+ 记录一致性哈希（连服/踢人校验用）。 */
export function setServerList(list: WebPlatformAreaListResponse): void {
  serverList = list;
  listHash = list.hash;
}

export function getServerList(): WebPlatformAreaListResponse | null {
  return serverList;
}

/** 目录重拉前清掉旧地址；失败时绝不静默沿用未知的新旧拓扑。 */
export function clearServerList(): void {
  current = null;
  listHash = "";
  serverList = null;
}

/** WebPlatform 目录一致性 hash（进服时可随连接参数带上）。 */
export function getListHash(): string {
  return listHash;
}

/** 选服（选服界面点区服 / 默认选中时调用）。 */
export function chooseServer(server: WebPlatformAreaServer): void {
  current = server;
}

export function getCurrentServer(): WebPlatformAreaServer | null {
  return current;
}

/**
 * 默认选中区服（对应原项目 init 后 currentServer 的默认值）：
 * 最近登录服（ul 顺序，且仍在 al 中、可进入）优先，否则第一个可进入服（isServerEnterable：
 * 非维护且已开服）。全不可进时兜底 al[0]（展示位——进服闸会拦，见 pages.ts onEnter）。
 * 刻意不看 isOps：运维环境也不自动落到维护/未开服上，运维要进的服自己在选服页点（choose 有豁免）。
 */
export function pickDefaultServer(list: WebPlatformAreaListResponse): WebPlatformAreaServer | null {
  for (const serverId of list.myServerIds) {
    const s = list.servers.find((a) => a.serverId === serverId);
    if (s && isServerEnterable(s)) return s; // 最近服不可进 → 看下一个最近服
  }
  return list.servers.find(isServerEnterable) ?? list.servers[0] ?? null;
}
