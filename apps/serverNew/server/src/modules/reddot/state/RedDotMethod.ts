import { User } from '../../user/bean/User'

export class RedDotMethod {
    private user: User

    constructor(user: User) {
        this.user = user
    }

    worldChatAt() {}

    private checkChatAtRedDot(type: string, chatType: string) {
        const redDot = this.user.redDot.get(type)
        if (!redDot || redDot.state == 0) {
            return
        }
    }
}
