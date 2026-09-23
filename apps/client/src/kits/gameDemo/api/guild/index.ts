import type { NativeLobbyRpcPort as LobbyRpcPort } from '../../../../app/ports';
import { GameDemoGuildRpc } from '../../../../shared/native/lobbyRpc/domains/gameDemoGuild';
export const fetchGameDemoGuild = (rpc: Pick<LobbyRpcPort, 'query'>) => rpc.query(GameDemoGuildRpc.Get, {});
export const createGameDemoGuild = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>, name: string) => rpc.sendIdempotent(GameDemoGuildRpc.Create, { name });
export const inviteGameDemoGuild = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>, targetUid: string) => rpc.sendIdempotent(GameDemoGuildRpc.Invite, { targetUid });
export const respondGameDemoGuild = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>, inviteId: string, accept: boolean) => rpc.sendIdempotent(GameDemoGuildRpc.Respond, { inviteId, accept });
export const leaveGameDemoGuild = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>) => rpc.sendIdempotent(GameDemoGuildRpc.Leave, {});
