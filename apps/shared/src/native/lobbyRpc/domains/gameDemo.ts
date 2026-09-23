import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from "../../../protocol/http";
import { type GameDemoStatus, type GameDemoAssets, type GameDemoShopState, type GameDemoMail, type GameDemoMailboxState, type GameDemoMailClaim } from "../../../kits/gameDemo/api/growth/index";
import { defineLobbyRpcDomain, defineRpcQuery, defineRpcIdempotentWrite } from "../../../protocol/lobbyRpc/defineDomain";
import { emptyPayload, requiredId, rpcRecord } from "../../../protocol/lobbyRpc/primitives";

export const GameDemoRpc = { Status: "gameDemo.status", Assets: "gameDemo.assets", Initialize: "gameDemo.initialize", Shop: "gameDemo.shop", Buy: "gameDemo.buy", MailList: "gameDemo.mailList", MailRead: "gameDemo.mailRead", MailClaim: "gameDemo.mailClaim" } as const;
export interface IGameDemoStatusReq { readonly [key: string]: never; }
export type IGameDemoStatusRes = GameDemoStatus;
export interface IGameDemoInitializeReq { clientReqId: string; }
export interface IGameDemoBuyReq { clientReqId: string; product: "herb" | "dew"; count: number; }
export interface IGameDemoMailReq { clientReqId: string; mailId: string; }
export type IGameDemoMailboxRes = GameDemoMailboxState;
export type IGameDemoMailClaimRes = GameDemoMailClaim;
export const validateGameDemoMailReq: RuntimeValidator<IGameDemoMailReq> = input => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["clientReqId", "mailId"], [], "payload");
    return { clientReqId: requiredId(value, "clientReqId"), mailId: boundedString(value.mailId, "payload.mailId", 32, 32) };
};
export function validateGameDemoMail(input: unknown): GameDemoMail {
    const value = rpcRecord(input, "mail");
    assertExactKeys(value, ["id", "title", "gold", "createdAt", "read", "claimed"], [], "mail");
    if (typeof value.read !== "boolean" || typeof value.claimed !== "boolean") throw new WireValidationError("GAME_DEMO_MAIL_FLAGS", "mail");
    return { id: boundedString(value.id, "mail.id", 32, 32), title: boundedString(value.title, "mail.title", 1, 80),
        gold: finiteInteger(value.gold, "mail.gold", 1), createdAt: finiteInteger(value.createdAt, "mail.createdAt", 0), read: value.read, claimed: value.claimed };
}
export const validateGameDemoMailboxRes: RuntimeValidator<IGameDemoMailboxRes> = input => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["revision", "mails"], [], "response");
    if (!Array.isArray(value.mails) || value.mails.length > 100) throw new WireValidationError("GAME_DEMO_MAIL_LIST", "response.mails");
    return { revision: finiteInteger(value.revision, "response.revision", 0), mails: value.mails.map(validateGameDemoMail) };
};
export const validateGameDemoMailClaimRes: RuntimeValidator<IGameDemoMailClaimRes> = input => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["assets", "mailbox"], [], "response");
    return { assets: validateGameDemoAssetsRes(value.assets), mailbox: validateGameDemoMailboxRes(value.mailbox) };
};
export type IGameDemoShopRes = GameDemoShopState;
export const validateGameDemoBuyReq: RuntimeValidator<IGameDemoBuyReq> = input => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["clientReqId", "product", "count"], [], "payload");
    if (value.product !== "herb" && value.product !== "dew") throw new WireValidationError("GAME_DEMO_PRODUCT", "payload.product");
    return { clientReqId: requiredId(value, "clientReqId"), product: value.product, count: finiteInteger(value.count, "payload.count", 1, 100) };
};
export const validateGameDemoShopRes: RuntimeValidator<IGameDemoShopRes> = input => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["assets", "day", "purchased"], [], "response");
    const purchased = rpcRecord(value.purchased, "response.purchased");
    assertExactKeys(purchased, ["herb", "dew"], [], "response.purchased");
    const day = boundedString(value.day, "response.day", 10, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new WireValidationError("GAME_DEMO_DATE", "response.day");
    return { assets: validateGameDemoAssetsRes(value.assets), day, purchased: {
        herb: finiteInteger(purchased.herb, "response.purchased.herb", 0, 100),
        dew: finiteInteger(purchased.dew, "response.purchased.dew", 0, 50),
    } };
};
export type IGameDemoAssetsRes = GameDemoAssets;
export const validateGameDemoInitializeReq: RuntimeValidator<IGameDemoInitializeReq> = input => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["clientReqId"], [], "payload");
    return { clientReqId: requiredId(value, "clientReqId") };
};
export const validateGameDemoAssetsRes: RuntimeValidator<IGameDemoAssetsRes> = input => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["initialized", "revision", "gold", "items"], [], "response");
    if (typeof value.initialized !== "boolean") throw new WireValidationError("GAME_DEMO_INITIALIZED", "response.initialized");
    const items = rpcRecord(value.items, "response.items");
    assertExactKeys(items, ["herb", "dew", "pill", "finePill"], [], "response.items");
    return {
        initialized: value.initialized,
        revision: finiteInteger(value.revision, "response.revision", 0),
        gold: finiteInteger(value.gold, "response.gold", 0),
        items: {
            herb: finiteInteger(items.herb, "response.items.herb", 0),
            dew: finiteInteger(items.dew, "response.items.dew", 0),
            pill: finiteInteger(items.pill, "response.items.pill", 0),
            finePill: finiteInteger(items.finePill, "response.items.finePill", 0),
        },
    };
};
export const validateGameDemoStatusReq: RuntimeValidator<IGameDemoStatusReq> = (input) => emptyPayload(input);
export const validateGameDemoStatusRes: RuntimeValidator<IGameDemoStatusRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["kit", "runtime", "stage"], [], "response");
    if (value.kit !== "gameDemo" || value.runtime !== "serverNew" || value.stage !== "P0") {
        throw new WireValidationError("GAME_DEMO_STATUS", "response");
    }
    return { kit: value.kit, runtime: value.runtime, stage: value.stage };
};
export default defineLobbyRpcDomain({
    domain: "gameDemo",
    contractVersion: 4,
    errorCodes: ["GAME_DEMO_DEV_DISABLED", "GAME_DEMO_LIMIT", "GAME_DEMO_NOT_INITIALIZED", "GAME_DEMO_MAIL_NOT_FOUND", "GAME_DEMO_MAILBOX_FULL"],
    pushes: [],
    routes: [
        defineRpcQuery(GameDemoRpc.Status, { request: validateGameDemoStatusReq, response: validateGameDemoStatusRes }),
        defineRpcQuery(GameDemoRpc.Assets, { request: validateGameDemoStatusReq, response: validateGameDemoAssetsRes }),
        defineRpcIdempotentWrite(GameDemoRpc.Initialize, { request: validateGameDemoInitializeReq, response: validateGameDemoAssetsRes }),
        defineRpcQuery(GameDemoRpc.Shop, { request: validateGameDemoStatusReq, response: validateGameDemoShopRes }),
        defineRpcIdempotentWrite(GameDemoRpc.Buy, { request: validateGameDemoBuyReq, response: validateGameDemoAssetsRes }),
        defineRpcQuery(GameDemoRpc.MailList, { request: validateGameDemoStatusReq, response: validateGameDemoMailboxRes }),
        defineRpcIdempotentWrite(GameDemoRpc.MailRead, { request: validateGameDemoMailReq, response: validateGameDemoMailboxRes }),
        defineRpcIdempotentWrite(GameDemoRpc.MailClaim, { request: validateGameDemoMailReq, response: validateGameDemoMailClaimRes }),
    ],
});
