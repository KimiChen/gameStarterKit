import type {
    IGameDemoAlchemyStartReq,
    IGameDemoAlchemyFinishReq,
} from '../../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoAlchemy'
import { GameDemoAlchemy } from '../../alchemy/GameDemoAlchemy'
export const readGameDemoAlchemy = (uid: string, sId: number) => new GameDemoAlchemy().read(uid, sId)
export const startGameDemoAlchemy = (uid: string, sId: number, req: IGameDemoAlchemyStartReq) =>
    new GameDemoAlchemy().start(uid, sId, req)
export const finishGameDemoAlchemy = (uid: string, sId: number, req: IGameDemoAlchemyFinishReq) =>
    new GameDemoAlchemy().finish(uid, sId, req)
