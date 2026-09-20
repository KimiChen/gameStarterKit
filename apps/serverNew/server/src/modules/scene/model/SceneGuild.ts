import { Guild } from '../../guild/bean/Guild'

/**
 * 场景妖盟
 */
export class SceneGuild {
    /** 妖盟Id */
    id: int = 0

    /** 妖盟名字 */
    name: string = ''

    /** 妖盟等级 */
    lv: int = 0

    /** 上次历练结束时间 */
    missionEndTime = 0

    /** 阵法 <id,lv> */
    magics: Map<int, int> = new Map()

    /** 妖盟转model */
    static guildToModel(guild: Guild) {
        const model = new SceneGuild()
        model.id = guild.id
        model.name = guild.name
        model.lv = guild.lv
        model.missionEndTime = guild.missionEndTime

        // 重置生效法阵
        model.magics = new Map()

        // 已激活法阵同步
        if (guild.activeMagicId > 0) {
            const lv = guild.magics.get(guild.activeMagicId) ?? 0
            model.magics.set(guild.activeMagicId, lv)
        }
        return model
    }
}
