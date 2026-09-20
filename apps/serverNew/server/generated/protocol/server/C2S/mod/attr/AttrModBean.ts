import { AttrTypeBean } from '../attr/AttrTypeBean'

export interface AttrModBean {
    id: number

    attrs?: Map<int, AttrTypeBean>
}
