import { Activity } from './activity/Activity'
import { HServer } from './serverProgress/HServer'
import { ChatDailyItem } from './chat/ChatDailyItem'
import { PayInfoItem } from './pay/PayInfoItem'
import { FirstPayItem } from './pay/FirstPayItem'
import { TaskBoxAwardItem } from './task/TaskBoxAwardItem'
import { TaskProgress } from './task/TaskProgress'
import { UserEquipBean } from './equip/UserEquipBean'
import { UserWeaponBean } from './weapon/UserWeaponBean'
import { UserAttrBean } from './user/UserAttrBean'
import { SceneFightSet } from './scene/SceneFightSet'
import { SceneCdItem } from './scene/SceneCdItem'
import { SceneInviteShieldItem } from './scene/SceneInviteShieldItem'
import { MissionBean } from './mission/MissionBean'
import { TitleBean } from './title/TitleBean'
import { BreakAwardItem } from './equip/BreakAwardItem'
import { TqInfoItem } from './pay/TqInfoItem'
import { MailBean } from './mail/MailBean'
import { PropBean } from './props/PropBean'
import { UserFashionBean } from './equip/UserFashionBean'
import { RedDotBean } from './reddot/RedDotBean'
import { RedDotListBean } from './reddot/RedDotListBean'
import { User } from './base/User'
import { Friend } from './friend/Friend'
import { Guild } from './guild/Guild'
import { GuildList } from './guild/GuildList'
import { TaskTimeLimitItem } from './task/TaskTimeLimitItem'
import { GuildApply } from './guild/GuildApply'
import { GameDemoBossRoom } from './gameDemo/GameDemoBossRoom'
import { GameDemoPlayer } from './gameDemo/GameDemoPlayer'
export interface Mod {
    versions?: Map<string, int>

    activity?: Activity
    hServer?: HServer
    dailyChatList?: Map<int, ChatDailyItem>
    pay?: Map<int, PayInfoItem>
    firstPays?: Map<int, FirstPayItem>
    limitTaskBoxes?: Map<int, TaskBoxAwardItem>
    taskTotal?: Map<int, TaskProgress>
    achieveTask?: Map<int, int>
    equip?: UserEquipBean
    weapon?: UserWeaponBean
    attr?: UserAttrBean
    sceneFightSet?: SceneFightSet
    sceneCd?: Map<string, SceneCdItem>
    sceneShields?: Map<int, SceneInviteShieldItem>
    mission?: MissionBean
    title?: TitleBean
    breakAwards?: Map<int, BreakAwardItem>
    tq?: Map<int, TqInfoItem>
    mail?: MailBean
    bag?: Map<int, PropBean>
    fashion?: UserFashionBean
    redDot?: Map<string, RedDotBean>
    redDotList?: Map<string, RedDotListBean>
    user?: User
    friend?: Friend
    guild?: Guild
    guildList?: GuildList
    dailyTask?: TaskTimeLimitItem
    weekTask?: TaskTimeLimitItem
    guildApply?: Map<int, GuildApply>
    gameDemoBossRoom?: GameDemoBossRoom
    gameDemoPlayer?: GameDemoPlayer
}
