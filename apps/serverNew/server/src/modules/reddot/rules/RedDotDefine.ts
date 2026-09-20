export class RedDotDefine {
    static readonly TYPE_DEMO = 'typeDemo' // 红点测试DEMO

    static readonly TYPE_MAIL = 'mail' // 邮件红点

    static readonly TYPE_GUILD_APPLY = 'guildApply' // 申请审批联盟红点

    static readonly TYPE_GUILD_INVITE = 'guildInvite' // 邀请审批联盟红点

    static readonly TYPE_FRIEND_APPLY = 'friendApply' // 好友申请红点

    static readonly TYPE_WorldChat_At = 'worldChatAt' // 世界聊天被@

    static readonly TYPE_GuildChat_At = 'guildChatAt' // 妖盟聊天被@

    static readonly TYPE_TITLE = 'title' // 称号红点

    static readonly TYPE_ARENA_BATTLE_RECORD = 'arenaBattleRecord' //竞技场防守战报红点

    static readonly REDDOT_MAP = [
        RedDotDefine.TYPE_DEMO,
        RedDotDefine.TYPE_GUILD_APPLY,
        RedDotDefine.TYPE_GUILD_INVITE,
        RedDotDefine.TYPE_FRIEND_APPLY,
        RedDotDefine.TYPE_MAIL,
        RedDotDefine.TYPE_WorldChat_At,
        RedDotDefine.TYPE_GuildChat_At,
        RedDotDefine.TYPE_TITLE,
        RedDotDefine.TYPE_ARENA_BATTLE_RECORD,
    ]

    static readonly CHANGE_TYPE_SET = 'set' // 红点赋值

    static readonly CHANGE_TYPE_INCR = 'incr' // 红点增加值

    static readonly CHANGE_TYPE_DECR = 'decr' // 红点减少值
}
