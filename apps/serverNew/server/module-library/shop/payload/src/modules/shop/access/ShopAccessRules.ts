import { FeatureAccess } from '../../user/access/FeatureAccess'
import { User } from '../../user/bean/User'
import { ShopConst } from '../rules/ShopConst'

export class ShopAccessRules {
    constructor(
        private readonly user: User,
        private readonly shopConfig: IConfShop,
    ) {}

    isUnlocked() {
        switch (this.shopConfig.unlockType) {
            case ShopConst.UNLOCK_DEFAULT:
                return true
            case ShopConst.UNLOCK_MODULE:
                return FeatureAccess.check(this.user, this.shopConfig.unlockValue)
        }
        return false
    }
}
