import { DiffMap } from '../../../../src/differ/map'
import { FromData, RefHash } from '../../../../src/differ/RefHash'
import { HeroBase } from '../../differ/bean/HeroBase'
import { UserBase } from '../../differ/bean/UserBase'

export class UserScene extends RefHash {
    @FromData(UserBase, 'name')
    name: string = ''

    @FromData(UserBase, 'lvl')
    lvl: number = 0

    @FromData(UserBase, 'heros')
    heros?: DiffMap<number, HeroBase>

    @FromData(UserBase, 'hero')
    hero?: HeroBase
}
