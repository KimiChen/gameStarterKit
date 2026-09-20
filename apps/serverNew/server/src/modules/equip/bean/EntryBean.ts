import { DiffMap } from '@arthropoda/game-engine'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { Bean } from '@arthropoda/game-engine'

/**
 * 词条数据
 */
export class EntryBean extends Bean {
    /**
     * 词条唯一ID
     */
    cId: int = 0

    /**
     * 词条ID
     */
    id: int = 0

    /**
     * 词条属性
     */
    attrMap?: DiffMap<int, AttrTypeBean>

    /**
     * 是否为特效
     */
    isEffect: int = 0
}
