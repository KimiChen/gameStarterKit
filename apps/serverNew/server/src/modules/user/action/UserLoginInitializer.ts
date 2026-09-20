import { User } from '../bean/User'

export class UserLoginInitializer {
    static async loadOrCreate(uId: int, name: string, sid: int): Promise<User> {
        let user = await User.load(uId)
        if (!user) {
            user = new User(uId)
            user.sId = sid
            user.name = name
            user.lv = 1
            user.gc = 10000
        }
        if (user.sId === 0) {
            user.sId = sid
        }
        return user
    }
}
