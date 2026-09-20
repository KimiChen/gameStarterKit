import { FromData, RefHash } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { Guild } from '../bean/Guild'
import { GuildMemberBean } from '../bean/GuildMemberBean'

export class GuildRef extends RefHash {
    /**
     * 联盟id
     */
    @FromData(Guild, 'id')
    id: int = 0

    /**
     * 区服id
     */
    @FromData(Guild, 'sId')
    sId: int = 0

    /**
     * 联盟是否解散
     */
    @FromData(Guild, 'isDissolution')
    isDissolution: boolean = false

    /**
     * 联盟图标
     */
    @FromData(Guild, 'head')
    head: int = 0

    /**
     * 联盟名称
     */
    @FromData(Guild, 'name')
    name: string = ''

    /**
     * 联盟等级
     */
    @FromData(Guild, 'lv')
    lv: int = 0

    /**
     * 联盟内成员
     */
    @FromData(Guild, 'members')
    members?: DiffMap<int, GuildMemberBean>

    /**
     * 联盟审核条件
     */
    @FromData(Guild, 'open')
    open: int = 0

    /**
     * 联盟势力
     */
    @FromData(Guild, 'power')
    power: int = 0
}
