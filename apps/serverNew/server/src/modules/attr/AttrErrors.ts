import { GameError } from '@arthropoda/game-engine'

export class AttrErrors {
    static readonly AttrNotExist = new GameError(19001, '属性不存在')
}
