import { FashionBean } from '../equip/FashionBean'
import { FashionWearBean } from '../equip/FashionWearBean'

export interface UserFashionBean {
    /**
     * 时装库
     */
    fashions?: Map<int, FashionBean>
    /**
     * 时装穿戴数据
     */
    fashionWear?: Map<int, FashionWearBean>
}
