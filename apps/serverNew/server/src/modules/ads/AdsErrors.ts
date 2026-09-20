import { GameError } from '@arthropoda/game-engine'

export class AdsErrors {
    static readonly AdsNotExist = new GameError(12014, '广告不存在')
}
