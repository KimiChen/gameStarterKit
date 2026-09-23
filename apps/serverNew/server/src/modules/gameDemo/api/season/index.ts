/** gameDemo season API v1. Mutations still require trusted host identity and explicit developer access. */
export { GameDemoSeasonRpc } from '../../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoSeason'
import { GameDemoSeason } from '../../season/GameDemoSeason'
export const readGameDemoSeason = (uid: string, sId: number) => new GameDemoSeason().read(uid, sId)
