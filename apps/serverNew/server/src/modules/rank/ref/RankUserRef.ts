import { FromData } from '@arthropoda/game-engine'
import { RankRefBase } from '@arthropoda/game-engine'
import { User } from '../../user/bean/User'

export class RankUserRef extends RankRefBase {
    @FromData(User, 'id')
    id: int = 0
}
