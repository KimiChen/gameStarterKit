import type { NativeLobbyRpcPort as LobbyRpcPort } from '../../../../app/ports';
import { GameDemoAlchemyRpc } from '../../../../shared/native/lobbyRpc/domains/gameDemoAlchemy';
export const fetchGameDemoAlchemy = (rpc: Pick<LobbyRpcPort, 'query'>) => rpc.query(GameDemoAlchemyRpc.Get, {});
export const startGameDemoAlchemy = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>, count: number) => rpc.sendIdempotent(GameDemoAlchemyRpc.Start, { count });
export const finishGameDemoAlchemy = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>, batchId: string, early: boolean) => rpc.sendIdempotent(GameDemoAlchemyRpc.Finish, { batchId, early });
