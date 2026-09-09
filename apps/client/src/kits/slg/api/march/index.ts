/** March v1 public client surface. Phase 2a exposes commands without a march UI or room. */
import type { LobbyRpcPort } from "../../../../app/ports";
import { SlgRpc, type ISlgMarchDispatchRes, type ISlgMarchRecallRes } from "../../../../shared/protocol/lobbyRpc/domains/slg";
export { positionAt } from "../../../../shared/kits/slg/api/march/index";
export type { ISlgMarch } from "../../../../shared/kits/slg/api/march/index";
export type { ISlgMarchDispatchRes, ISlgMarchRecallRes };
export function dispatchMarch(rpc: Pick<LobbyRpcPort, "sendIdempotent">, fromTile: number, toTile: number): Promise<ISlgMarchDispatchRes> {
    return rpc.sendIdempotent(SlgRpc.MarchDispatch, { fromTile, toTile });
}
export function recallMarch(rpc: Pick<LobbyRpcPort, "sendIdempotent">, marchId: string): Promise<ISlgMarchRecallRes> {
    return rpc.sendIdempotent(SlgRpc.MarchRecall, { marchId });
}
