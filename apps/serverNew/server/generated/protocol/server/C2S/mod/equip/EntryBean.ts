import { AttrTypeBean } from '../attr/AttrTypeBean'

export interface EntryBean {
    /**
     * 词条唯一ID
     */
    cId: int
    /**
     * 词条ID
     */
    id: int
    /**
     * 词条属性
     */
    attrMap?: Map<int, AttrTypeBean>
    /**
     * 是否为特效
     */
    isEffect: int
}
