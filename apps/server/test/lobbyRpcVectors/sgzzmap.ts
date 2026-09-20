import { SgzzmapRpc } from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import type { LobbyRpcVectorFile } from "./vectorTypes";

// cell = row*10000+col；rect 是 chunk 单位（10 格一块），(75,75) 块覆盖格 750..759
const cell = 7500750;
const rect = { minRow: 75, minCol: 75, maxRow: 75, maxCol: 75 };
const viewer = { uid: "u1", aid: "a1", leaderUid: "", friendAids: [] };
const tile = { cell, ownerUid: "u1", ownerAid: "a1", durability: 1, addition: false, capturingAid: "" };
export default {
    [SgzzmapRpc.View]: {
        request: { rect },
        response: {
            rect, revision: 1, viewer, alliances: ["a1"],
            owners: [{ uid: "u1", alliance: 0 }],
            tiles: [{ cell, owner: 0, durability: 1, addition: false, capturing: -1 }],
        },
    },
    [SgzzmapRpc.Tile]: { request: { cell }, response: { tile, viewer } },
    [SgzzmapRpc.Occupy]: {
        request: { clientReqId: "o1", cell },
        response: { tile, outcome: "captured", heldTiles: 1 },
    },
    [SgzzmapRpc.Abandon]: {
        request: { clientReqId: "a1", cell },
        response: { cell, heldTiles: 0 },
    },
    [SgzzmapRpc.Alliance]: {
        request: { clientReqId: "al1", act: "create", name: "青州军", tag: "青" },
        response: {
            membership: { uid: "u1", allianceId: "a1", role: "leader" },
            alliance: { allianceId: "a1", name: "青州军", tag: "青", leaderUid: "u1", members: 1 },
        },
    },
} satisfies LobbyRpcVectorFile;
