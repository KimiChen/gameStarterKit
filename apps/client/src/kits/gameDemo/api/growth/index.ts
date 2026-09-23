import type { NativeLobbyRpcPort as LobbyRpcPort } from "../../../../app/ports";
import { GameDemoHeroRpc } from '../../../../shared/native/lobbyRpc/domains/gameDemoHero';
export const fetchGameDemoHero = (rpc: Pick<LobbyRpcPort, 'query'>) => rpc.query(GameDemoHeroRpc.Get, {});
export const upgradeGameDemoHero = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>, pill: 'normal' | 'fine', count: 1 | 10) => rpc.sendIdempotent(GameDemoHeroRpc.Upgrade, { pill, count });
import type { GameDemoMailboxState, GameDemoMailClaim } from "../../../../shared/kits/gameDemo/api/growth/index";
import { GameDemoRpc, type IGameDemoStatusRes, type IGameDemoAssetsRes, type IGameDemoShopRes } from "../../../../shared/native/lobbyRpc/domains/gameDemo";

export function fetchGameDemoStatus(rpc: Pick<LobbyRpcPort, "query">): Promise<IGameDemoStatusRes> {
    return rpc.query(GameDemoRpc.Status, {});
}
export function fetchGameDemoAssets(rpc: Pick<LobbyRpcPort, "query">): Promise<IGameDemoAssetsRes> {
    return rpc.query(GameDemoRpc.Assets, {});
}
export function initializeGameDemo(rpc: Pick<LobbyRpcPort, "sendIdempotent">): Promise<IGameDemoAssetsRes> {
    return rpc.sendIdempotent(GameDemoRpc.Initialize, {});
}
export function fetchGameDemoShop(rpc: Pick<LobbyRpcPort, "query">): Promise<IGameDemoShopRes> {
    return rpc.query(GameDemoRpc.Shop, {});
}
export function buyGameDemoMaterial(rpc: Pick<LobbyRpcPort, "sendIdempotent">, product: "herb" | "dew", count: number): Promise<IGameDemoAssetsRes> {
    return rpc.sendIdempotent(GameDemoRpc.Buy, { product, count });
}
export function fetchGameDemoMail(rpc: Pick<LobbyRpcPort, "query">): Promise<GameDemoMailboxState> {
    return rpc.query(GameDemoRpc.MailList, {});
}
export function readGameDemoMail(rpc: Pick<LobbyRpcPort, "sendIdempotent">, mailId: string): Promise<GameDemoMailboxState> {
    return rpc.sendIdempotent(GameDemoRpc.MailRead, { mailId });
}
export function claimGameDemoMail(rpc: Pick<LobbyRpcPort, "sendIdempotent">, mailId: string): Promise<GameDemoMailClaim> {
    return rpc.sendIdempotent(GameDemoRpc.MailClaim, { mailId });
}
