import { GenModInfo } from '@arthropoda/game-engine'
import { Activity } from '../../src/modules/activity/bean/Activity'
import { HServer } from '../../src/modules/serverProgress/bean/HServer'
import { User } from '../../src/modules/user/bean/User'
import { Friend } from '../../src/modules/friend/bean/Friend'
import { Guild } from '../../src/modules/guild/bean/Guild'
import { GuildList } from '../../src/modules/guild/bean/GuildList'
import { HUTask } from '../../src/modules/task/bean/HUTask'
export const modInfos: { [key: string]: GenModInfo } = {
    activity: { type: Activity },
    hServer: { type: HServer },
    dailyChatList: { type: User, subMod: 'dailyChatList' },
    pay: { type: User, subMod: 'pay' },
    firstPays: { type: User, subMod: 'firstPays' },
    limitTaskBoxes: { type: User, subMod: 'limitTaskBoxes' },
    taskTotal: { type: User, subMod: 'taskTotal' },
    achieveTask: { type: User, subMod: 'achieveTask' },
    equip: { type: User, subMod: 'equip' },
    weapon: { type: User, subMod: 'weapon' },
    attr: { type: User, subMod: 'attr' },
    sceneFightSet: { type: User, subMod: 'sceneFightSet' },
    sceneCd: { type: User, subMod: 'sceneCd' },
    sceneShields: { type: User, subMod: 'sceneShields' },
    mission: { type: User, subMod: 'mission' },
    title: { type: User, subMod: 'title' },
    breakAwards: { type: User, subMod: 'breakAwards' },
    tq: { type: User, subMod: 'tq' },
    mail: { type: User, subMod: 'mail' },
    bag: { type: User, subMod: 'bag' },
    fashion: { type: User, subMod: 'fashion' },
    redDot: { type: User, subMod: 'redDot' },
    redDotList: { type: User, subMod: 'redDotList' },
    user: { type: User },
    friend: { type: Friend },
    guild: { type: Guild },
    guildList: { type: GuildList },
    dailyTask: { type: HUTask, subMod: 'dailyTask' },
    weekTask: { type: HUTask, subMod: 'weekTask' },
    guildApply: { type: Guild, subMod: 'guildApply' },
}
