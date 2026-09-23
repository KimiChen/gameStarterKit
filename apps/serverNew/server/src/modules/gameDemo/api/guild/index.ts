/** gameDemo guild API v1. Caller identity must come from the host authentication context. */
export { GameDemoGuildRpc } from '../../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoGuild'
import { GameDemoGuild } from '../../guild/GameDemoGuild'
export const readGameDemoGuild = (uid: string, sid: number) => new GameDemoGuild().read(uid, sid)

import type {
    IGameDemoGuildCreateReq,
    IGameDemoGuildInviteReq,
    IGameDemoGuildRespondReq,
    IGameDemoGuildLeaveReq,
} from '../../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoGuild'
export const createGameDemoGuild = (uid: string, sid: number, req: IGameDemoGuildCreateReq) =>
    new GameDemoGuild().create(uid, sid, req)
export const inviteGameDemoGuild = (uid: string, sid: number, req: IGameDemoGuildInviteReq) =>
    new GameDemoGuild().invite(uid, sid, req)
export const respondGameDemoGuild = (uid: string, sid: number, req: IGameDemoGuildRespondReq) =>
    new GameDemoGuild().respond(uid, sid, req)
export const leaveGameDemoGuild = (uid: string, sid: number, req: IGameDemoGuildLeaveReq) =>
    new GameDemoGuild().leave(uid, sid, req)
