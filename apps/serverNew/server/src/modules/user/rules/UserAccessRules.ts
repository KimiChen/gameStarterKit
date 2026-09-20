import { OpsType } from '../access/OpsType'

export class UserAccessRules {
    static isActivityWhitelisted(): boolean {
        return Ctx.user ? OpsType.checkActivity(Ctx.user.opsType) : false
    }
}
