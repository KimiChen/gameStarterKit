import { GameDemoGuildBean } from '../gameDemo/GameDemoGuildBean'
import { GameDemoGuildMemberBean } from '../gameDemo/GameDemoGuildMemberBean'
import { GameDemoGuildInviteBean } from '../gameDemo/GameDemoGuildInviteBean'

export interface GameDemoGuildDirectory {
    id: int

    guildSeq: int

    inviteSeq: int

    joinSeq: int

    guilds?: Map<int, GameDemoGuildBean>

    members?: Map<int, GameDemoGuildMemberBean>

    invites?: Map<int, GameDemoGuildInviteBean>
}
