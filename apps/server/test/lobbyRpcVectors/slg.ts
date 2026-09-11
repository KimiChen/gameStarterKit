import { SlgRpc } from "@game/shared/protocol/lobbyRpc/domains/slg";
import type { LobbyRpcVectorFile } from "./vectorTypes";
const tile = { tileId: 0, ownerUid: "u1", guardPower: 1 };
const march = { marchId: "m1", uid: "u1", fromTile: 0, toTile: 1, departAt: 1000, arriveAt: 2000, status: "marching" as const };
export default {
    [SlgRpc.MapTiles]: { request: { mapId: "senzhiguo", rect: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }, response: { tiles: [tile], revision: 1, myTrophies: 1 } },
    [SlgRpc.TileCapture]: { request: { clientReqId: "c1", tileId: 0 }, response: { tile, outcome: "captured" } },
    [SlgRpc.MarchDispatch]: { request: { clientReqId: "d1", fromTile: 0, toTile: 1 }, response: { march, balance: 99 } },
    [SlgRpc.MarchRecall]: { request: { clientReqId: "r1", marchId: "m1" }, response: { march: { ...march, status: "recalled" } } },
} satisfies LobbyRpcVectorFile;
