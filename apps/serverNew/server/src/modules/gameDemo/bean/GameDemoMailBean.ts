import { Bean } from '@arthropoda/game-engine'

/** gameDemo 邮件：附件只有金币，领取时记入宿主 `User.copper`。 */
export class GameDemoMailBean extends Bean {
    id: int = 0
    title: string = ''
    gold: int = 0
    createdAt: int = 0
    read: boolean = false
    claimed: boolean = false
}
