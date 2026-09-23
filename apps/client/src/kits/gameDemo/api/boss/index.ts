import type { NativeLobbyRpcPort as LobbyRpcPort } from '../../../../app/ports';
import type { GameDemoBossId } from '../../../../shared/kits/gameDemo/api/boss/index';
import { GameDemoBossRpc } from '../../../../shared/native/lobbyRpc/domains/gameDemoBoss';
export const listGameDemoBoss = (rpc: Pick<LobbyRpcPort, 'query'>) => rpc.query(GameDemoBossRpc.List, {});
export const fetchGameDemoBoss = (rpc: Pick<LobbyRpcPort, 'query'>, bossId: GameDemoBossId) => rpc.query(GameDemoBossRpc.Get, { bossId });
export const enterGameDemoBoss = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>, bossId: GameDemoBossId) => rpc.sendIdempotent(GameDemoBossRpc.Enter, { bossId });
export const leaveGameDemoBoss = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>, bossId: GameDemoBossId, generation: number) => rpc.sendIdempotent(GameDemoBossRpc.Leave, { bossId, generation });
export const attackGameDemoBoss = (rpc: Pick<LobbyRpcPort, 'sendIdempotent'>, bossId: GameDemoBossId, runId: string, generation: number, autoAttack?: boolean) => rpc.sendIdempotent(GameDemoBossRpc.Attack, { bossId, runId, generation, ...(autoAttack === undefined ? {} : { autoAttack }) });
