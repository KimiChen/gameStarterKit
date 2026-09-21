/**
 * 选服会话状态（对应原项目 launcher.serverList/currentServer）——当前选中区服。
 *
 * 大厅（登录/选服，view 层）写、进房装配读；纯状态与发现事务（无 cc/fairygui）。
 * 游戏 HTTP 使用目录 gameHttpUrl；角色 WS 使用 /version 的发现值，
 * 缺字段回落目录明确给出的 gameWsUrl，不从 HTTP 地址推导。
 */
import { isServerEnterable } from "../logic/areaDirectory";
import {
  GameHttpContractMap,
  validateWebPlatformAreaListResponse,
  type WebPlatformAreaListResponse,
  type WebPlatformAreaServer,
} from "../shared/index";

interface ServerSnapshot {
  readonly list: WebPlatformAreaListResponse | null;
  readonly current: WebPlatformAreaServer | null;
  readonly endpoints: ServerEndpoints | null;
}

/** 游戏 HTTP /version 的发现结果；外部区服目录契约保持不变。 */
export interface ServerEndpoints {
  readonly lobbyWs: string;
  readonly gameWs: string;
  readonly worldWs: string;
}

// Keep the list and selection in one replaceable snapshot. Consumers must
// never observe a freshly fetched list paired with an old selection.
let snapshot: ServerSnapshot = { list: null, current: null, endpoints: null };
let endpointDiscovery = 0;

function sameEndpointBinding(left: WebPlatformAreaServer | null, right: WebPlatformAreaServer | null): boolean {
  return left !== null && right !== null && left.serverId === right.serverId
    && left.gameHttpUrl === right.gameHttpUrl && left.gameWsUrl === right.gameWsUrl;
}

/**
 * The directory response crosses an async/network boundary.  Keep an owned
 * copy so a view retaining the response (or mutating a getter result) cannot
 * split `list`, `current`, and the selected server into a mixed-generation snapshot.
 */
function cloneServer(server: WebPlatformAreaServer): WebPlatformAreaServer {
  return { ...server };
}

function cloneList(list: WebPlatformAreaListResponse): WebPlatformAreaListResponse {
  return {
    ...list,
    servers: list.servers.map(cloneServer),
    myServerIds: [...list.myServerIds],
  };
}

function cloneSnapshotList(list: WebPlatformAreaListResponse | null): WebPlatformAreaListResponse | null {
  return list ? cloneList(list) : null;
}

/** 原子替换 serverList 与当前选中区（拉取成功后调用）。 */
export function setServerList(input: unknown): void {
  // Keep this module's public write boundary defensive even when a caller has
  // a static `WebPlatformAreaListResponse` type. The validator returns an owned
  // normalized copy; assignment happens only after validation succeeds, so a
  // malformed refresh cannot poison the previous known-good snapshot.
  const ownedList = validateWebPlatformAreaListResponse(input);
  const previousId = snapshot.current?.serverId;
  const current = (previousId === undefined
    ? null
    : ownedList.servers.find((server) => server.serverId === previousId))
    ?? pickDefaultServer(ownedList);
  snapshot = {
    list: ownedList,
    current: current ? cloneServer(current) : null,
    endpoints: sameEndpointBinding(snapshot.current, current) ? snapshot.endpoints : null,
  };
}

export function getServerList(): WebPlatformAreaListResponse | null {
  return cloneSnapshotList(snapshot.list);
}

/** 选服（选服界面点区服 / 默认选中时调用）。 */
export function chooseServer(server: WebPlatformAreaServer): void {
  // Store the canonical object from the current snapshot when possible.  This
  // prevents a caller retaining a stale server record after a refresh.
  const canonical = snapshot.list?.servers.find((item) => item.serverId === server.serverId) ?? server;
  snapshot = {
    ...snapshot,
    current: cloneServer(canonical),
    endpoints: sameEndpointBinding(snapshot.current, canonical) ? snapshot.endpoints : null,
  };
}

export function getCurrentServer(): WebPlatformAreaServer | null {
  return snapshot.current ? cloneServer(snapshot.current) : null;
}

function currentEndpoint(role: keyof ServerEndpoints): string {
  const current = snapshot.current;
  if (!current) throw new Error("[serverSession] 尚未选择区服，不能建立 WS 连接");
  return snapshot.endpoints?.[role] ?? current.gameWsUrl;
}

export const getCurrentLobbyWsUrl = (): string => currentEndpoint("lobbyWs");
export const getCurrentGameWsUrl = (): string => currentEndpoint("gameWs");
export const getCurrentWorldWsUrl = (): string => currentEndpoint("worldWs");

/**
 * 发现与发布使用同一份选服快照。切服、目录刷新或更新的发现请求使旧响应失效；
 * 失败保留已有结果并向调用方报错，只有合法旧版响应可以回落目录端点。
 */
export async function discoverServerEndpoints(
  server: WebPlatformAreaServer,
  load: () => Promise<unknown>,
): Promise<ServerEndpoints> {
  const selected = snapshot;
  if (!selected.current || !sameEndpointBinding(selected.current, server)) throw new Error("[serverSession] 所选区服已变更");
  const fallback = selected.current.gameWsUrl;
  const discovery = ++endpointDiscovery;
  const response = GameHttpContractMap.Version.response(await load());
  if (selected !== snapshot || discovery !== endpointDiscovery) {
    throw new Error("[serverSession] 端点发现已失效，请重新进入区服");
  }
  const endpoints: ServerEndpoints = {
    lobbyWs: response.lobbyWs || fallback,
    gameWs: response.gameWs || fallback,
    worldWs: response.worldWs || fallback,
  };
  snapshot = { ...selected, endpoints };
  return { ...endpoints };
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
