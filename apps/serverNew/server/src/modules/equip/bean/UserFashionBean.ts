import { Bean, DiffMap } from '@arthropoda/game-engine'
import { FashionBean } from './FashionBean'
import { FashionWearBean } from './FashionWearBean'

/**
 * 时装系统
 */
export class UserFashionBean extends Bean {
    /**
     * 时装库
     */
    fashions?: DiffMap<int, FashionBean>

    /**
     * 时装穿戴数据
     */
    fashionWear?: DiffMap<int, FashionWearBean>
}
