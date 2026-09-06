/** snakeCosmetic 域测试向量（S3-02；随 codegen:plugins 汇入 index.generated.ts）。 */
import {
  SnakeCosmeticRpc,
  type ISnakeCosmeticCatalogEntry,
  type ISnakeCosmeticProfile,
} from "@game/shared/protocol/lobbyRpc/domains/snakeCosmetic";
import type { LobbyRpcVectorFile } from "./vectorTypes";

/**
 * 新 uid 的默认快照：默认皮肤 1、四个碎片键 133/401/403/411
 * （服务端 SNAKE_FRAGMENT_SKIN_IDS 的实测值，由业务目录派生）。
 */
const profile: ISnakeCosmeticProfile = {
  version: 0,
  equippedSkinId: 1,
  ownedSkinIds: [1],
  fragmentBalances: { "133": 0, "401": 0, "403": 0, "411": 0 },
};

// query / natural-write ⇒ 三条 request 都⛔ 不含 clientReqId。
/** 目录条目最小样例（真实目录由服务端从业务目录投影，16 条）。 */
const catalog: readonly ISnakeCosmeticCatalogEntry[] = [
  { skinId: 1, displayName: "小红", rarity: 0, acquisition: "default", fragmentThreshold: null },
  { skinId: 401, displayName: "皮肤 401", rarity: 2, acquisition: "fragmentCraft", fragmentThreshold: 10 },
];

export default {
  [SnakeCosmeticRpc.GetSnapshot]: { request: {}, response: { profile, catalog } },
  [SnakeCosmeticRpc.Equip]: { request: { skinId: 1 }, response: { profile } },
  [SnakeCosmeticRpc.Unlock]: { request: { skinId: 401 }, response: { profile } },
} satisfies LobbyRpcVectorFile;
