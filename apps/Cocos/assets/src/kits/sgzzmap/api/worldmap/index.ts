/** sgzzmap 客户端公开面：无引擎依赖，RPC 细节封在门面后面。插件只能 import 这里。 */
import type { LobbyRpcPort } from "../../../../app/ports";
import {
    SgzzmapRpc, type ISgzzTileRes, type ISgzzViewRes, type ISgzzZoomRes,
} from "../../../../shared/protocol/lobbyRpc/domains/sgzzmap";
import type { ISgzzRect } from "../../../../shared/kits/sgzzmap/api/hexmap/index";

export type { ISgzzRect, ISgzzViewRes, ISgzzZoomRes, ISgzzTileRes };
export { SgzzGridState, sgzzGridState } from "../../../../shared/kits/sgzzmap/api/territory/index";
export { sgzzCellOf, sgzzDecodeCell } from "../../../../shared/kits/sgzzmap/api/hexmap/index";

export function fetchSgzzView(rpc: Pick<LobbyRpcPort, "query">, rect: ISgzzRect): Promise<ISgzzViewRes> {
    return rpc.query(SgzzmapRpc.View, { rect });
}
export function fetchSgzzZoom(rpc: Pick<LobbyRpcPort, "query">, level: number, rect: ISgzzRect): Promise<ISgzzZoomRes> {
    return rpc.query(SgzzmapRpc.Zoom, { level, rect });
}
export function fetchSgzzTile(rpc: Pick<LobbyRpcPort, "query">, cell: number): Promise<ISgzzTileRes> {
    return rpc.query(SgzzmapRpc.Tile, { cell });
}
