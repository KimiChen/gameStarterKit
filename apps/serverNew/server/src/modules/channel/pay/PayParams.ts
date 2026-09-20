import { md5, millisecond } from '@arthropoda/game-engine'
import { randomUUID } from 'crypto'
import { GameRandom } from '../../../runtime/random/GameRandom'

export class PayParams {
    public static getPayCallBackUrl(sdk: string): string {
        return `http://${CP.platform.host}:${CP.platform.port}/callback/pay/${sdk}`
    }

    public static billno(): string {
        return md5(randomUUID() + millisecond() + GameRandom.randomStr(3))
    }
}
