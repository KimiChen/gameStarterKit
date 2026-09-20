import { Mod, ServerHash } from '@arthropoda/game-engine'
import { TestBean1 } from './TestBean1'

@Mod
export class UserOnlyNet extends ServerHash {
    id: int = 0

    name: string = ''

    lvl: int = 1

    bean1?: TestBean1
}
