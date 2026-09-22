/** heroRecruit 域测试向量（插件 heroRecruit 的 codegen 契约 sidecar）。 */
import { HeroRecruitRpc } from "@game/shared/protocol/lobbyRpc/domains/heroRecruit";
import type { LobbyRpcVectorFile } from "./vectorTypes";

const snapshot = {
  copper: 500,
  ownedHeroIds: [1001],
  catalog: [
    {
      heroId: 1001,
      name: "赵云",
      title: "龙胆将军",
      rarity: 3,
      copperPrice: 500,
    },
    {
      heroId: 1002,
      name: "貂蝉",
      title: "闭月舞姬",
      rarity: 4,
      copperPrice: 900,
    },
    {
      heroId: 1003,
      name: "李白",
      title: "青莲剑仙",
      rarity: 5,
      copperPrice: 1500,
    },
  ],
};

export default {
  [HeroRecruitRpc.GetCatalog]: { request: {}, response: { snapshot } },
  [HeroRecruitRpc.Buy]: {
    request: { clientReqId: "c1", heroId: 1001 },
    response: { purchasedHeroId: 1001, snapshot },
  },
} satisfies LobbyRpcVectorFile;
