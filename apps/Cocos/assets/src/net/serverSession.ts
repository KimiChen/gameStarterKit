/**
 * 选服会话状态（对应原项目 launcher.serverList/currentServer）——当前选中区服 + serverList 哈希。
 *
 * 大厅（登录/选服，view 层）写、Main（进房）读；纯状态模块，只 import shared 类型（无 cc/fairygui）。
 * ⚠ 区服 = 独立实例：进入游戏时 Main 连 `getCurrentServer().wsUrl`（非固定 serverUrl）。
 */
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
 * 最近登录服（ul[0]，且仍在 al 中）优先，否则第一个非维护服（t!==9）。都没有返回 null。
 */
export function pickDefaultServer(list: IAreaListRes): IAreaServer | null {
  for (const sId of list.ul) {
    const s = list.al.find((a) => a.sId === sId);
    if (s) return s;
  }
  return list.al.find((a) => a.t !== 9) ?? list.al[0] ?? null;
}
