/**
 * mmoSocial 域 ws-RPC 契约——mmo kit（apps/kits/mmo，docs/MMO.md §7.2 social 面）自带的域文件。v1 仅 `partyLocate`：
 * 框架 party 的成员 → 本 kit 的角色 + WorldAddress / mapId（队伍面板「队友在哪」）。世界聊天 / 附近聊天 ⛔ 不在本域（框架 chat 门面 / core 世界 token）。
 * 执行模式：PartyLocate=query。文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, type RuntimeValidator } from "../../http";
import { validatePartyLocate, type IMmoPartyLocate } from "../../../kits/mmo/api/social/index";
import { defineLobbyRpcDomain, defineRpcQuery } from "../defineDomain";
import { requiredId, rpcRecord } from "../primitives";

/** mmoSocial 域路由名 */
export const MmoSocialRpc = {
    /** 定位本账号某角色所在队伍的成员（角色不属本账号 ⇒ MMO_SOCIAL_CHARACTER_FORBIDDEN；不在队 ⇒ party null） */
    PartyLocate: "mmoSocial.partyLocate",
} as const;

export interface IMmoSocialPartyLocateReq {
    characterId: string;
}
export interface IMmoSocialPartyLocateRes {
    party: IMmoPartyLocate | null;
}

/** 路由名 → { req, res } */
export interface MmoSocialRpcMap {
    [MmoSocialRpc.PartyLocate]: { req: IMmoSocialPartyLocateReq; res: IMmoSocialPartyLocateRes };
}

export const validateMmoSocialPartyLocateReq: RuntimeValidator<IMmoSocialPartyLocateReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["characterId"], [], "payload");
    return { characterId: requiredId(value, "characterId") };
};

export const validateMmoSocialPartyLocateRes: RuntimeValidator<IMmoSocialPartyLocateRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["party"], [], "response");
    return { party: value.party === null ? null : validatePartyLocate(value.party, "response.party") };
};

export default defineLobbyRpcDomain({
    domain: "mmoSocial",
    contractVersion: 1,
    errorCodes: ["MMO_SOCIAL_CHARACTER_FORBIDDEN"],
    pushes: [],
    routes: [
        defineRpcQuery(MmoSocialRpc.PartyLocate, { request: validateMmoSocialPartyLocateReq, response: validateMmoSocialPartyLocateRes }),
    ],
});
