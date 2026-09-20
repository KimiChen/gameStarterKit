import { User } from '../bean/User'
import { UserTempBean } from '../bean/UserTempBean'

export class UserTempStore {
    static async load(user: User) {
        return (await UserTempBean.load(user.id)) ?? new UserTempBean(user.id)
    }
}
