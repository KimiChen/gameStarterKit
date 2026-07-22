/**
 * 选服会话状态（对应原项目 launcher.serverList/currentServer）——当前选中区服 + serverList 哈希。
 *
 * 大厅（登录/选服，view 层）写、Main（进房）读；纯状态模块，只 import shared 类型（无 cc/fairygui）。
 * ⚠ 区服 = 独立实例：进入游戏时 Main 连 `getCurrentServer().wsUrl`（非固定 serverUrl）。
 */
import { isServerEnterable } from "../shared/index";
import type { IAreaListRes, IAreaServer } from "../shared/index";

let current: IAreaServer | null = null;
let listHash = "";
let serverList: IAreaListRes | null = null;

/** 存 serverList（拉取后）+ 记录一致性哈希（连服/踢人校验用）。 */
export function setServerList(list: IAreaListRes): void {
  serverList = list;
  listHash = list.h;
}

export function getServerList(): IAreaListRes | null {
  return serverList;
}

/** serverList 一致性哈希（进服时随连接参数带上，对应原项目 serverList.h）。 */
export function getListHash(): string {
  return listHash;
}

/** 选服（选服界面点区服 / 默认选中时调用）。 */
export function chooseServer(server: IAreaServer): void {
  current = server;
}

export function getCurrentServer(): IAreaServer | null {
  return current;
}

/**
 * 默认选中区服（对应原项目 init 后 currentServer 的默认值）：
 * 最近登录服（ul 顺序，且仍在 al 中、可进入）优先，否则第一个可进入服（isServerEnterable：
 * 非维护且已开服）。全不可进时兜底 al[0]（展示位——进服闸会拦，见 pages.ts onEnter）。
 * 刻意不看 isOps：运维环境也不自动落到维护/未开服上，运维要进的服自己在选服页点（choose 有豁免）。
 */
export function pickDefaultServer(list: IAreaListRes): IAreaServer | null {
  for (const sId of list.ul) {
    const s = list.al.find((a) => a.sId === sId);
    if (s && isServerEnterable(s)) return s; // 最近服不可进 → 看下一个最近服
  }
  return list.al.find(isServerEnterable) ?? list.al[0] ?? null;
}
