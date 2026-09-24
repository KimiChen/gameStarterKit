import { DiffMap, ServerHash } from '@arthropoda/game-engine'
import { GameDemoGuildBean } from './GameDemoGuildBean'
import { GameDemoGuildInviteBean } from './GameDemoGuildInviteBean'
import { GameDemoGuildMemberBean } from './GameDemoGuildMemberBean'

/**
 * 本区服的仙盟目录（单例 id=1）。
 *
 * 「每人只属于一个仙盟」「接受邀请时校验容量」是跨仙盟的不变量，所以目录作为一份整体资源，
 * 由仙盟 Action 声明同一 taskGroupId / bindId 串行写入，而不是按单个仙盟分组。
 */
export class GameDemoGuildDirectory extends ServerHash {
    id: int = 0
    guildSeq: int = 0
    inviteSeq: int = 0
    joinSeq: int = 0
    guilds?: DiffMap<int, GameDemoGuildBean>
    members?: DiffMap<int, GameDemoGuildMemberBean>
    invites?: DiffMap<int, GameDemoGuildInviteBean>
}
