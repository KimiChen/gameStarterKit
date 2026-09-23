export { gameDemoStatus } from '../../../../../generated/lobby-contract/kits/gameDemo/api/growth'
import type { IGameDemoHeroUpgradeReq } from '../../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoHero'
import { GameDemoHero } from '../../hero/GameDemoHero'
export const readGameDemoHero = (uid: string, sId: number) => new GameDemoHero().read(uid, sId)
export const upgradeGameDemoHero = (uid: string, sId: number, req: IGameDemoHeroUpgradeReq) =>
    new GameDemoHero().upgrade(uid, sId, req)
