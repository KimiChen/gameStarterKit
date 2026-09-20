import { GameError } from '@arthropoda/game-engine'

export class TestErrors {
    static readonly HeroNull = new GameError(1072, '门客不存在')

    static readonly HeroMaxLv = new GameError(1073, '门客已达最大等级')
}
