import { User } from '../bean/User'

export class UserAppearance {
    static change(user: User, num: int) {
        if (num === 0) return
        user.appearance += num
    }
}
