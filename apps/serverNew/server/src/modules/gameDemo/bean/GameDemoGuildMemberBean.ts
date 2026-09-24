import { Bean } from '@arthropoda/game-engine'

/** 成员归属：joinSeq 决定展示顺序和盟主离开时的转交顺序。 */
export class GameDemoGuildMemberBean extends Bean {
    uid: int = 0
    guildId: int = 0
    joinSeq: int = 0
}
