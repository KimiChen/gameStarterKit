import type { NativeLobbyRpcPort as LobbyRpcPort } from '../../../../app/ports';
import { GameDemoSeasonRpc } from '../../../../shared/native/lobbyRpc/domains/gameDemoSeason';
export const fetchGameDemoSeason = (rpc: Pick<LobbyRpcPort, 'query'>) => rpc.query(GameDemoSeasonRpc.Get, {});
export const endGameDemoSeason = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>, seasonId: string) => rpc.sendIdempotent(GameDemoSeasonRpc.End, { seasonId });
