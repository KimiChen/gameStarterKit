import { User } from '../../user/bean/User'

export abstract class AdjustChange {
    constructor(protected user: User) {}
}
