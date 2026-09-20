import { FromData } from '@arthropoda/game-engine'
import { RankRefBase } from '@arthropoda/game-engine'
import { Guild } from '../../guild/bean/Guild'

export class RankGuildRef extends RankRefBase {
    @FromData(Guild, 'guildId')
    guildId: int = 0

    @FromData(Guild, 'head')
    head: int = 0

    @FromData(Guild, 'name')
    name: string = ''

    @FromData(Guild, 'lv')
    lv: int = 0

    @FromData(Guild, 'open')
    open: int = 0

    @FromData(Guild, 'leaderId')
    leaderId: int = 0

    @FromData(Guild, 'like')
    like: int = 0
}
