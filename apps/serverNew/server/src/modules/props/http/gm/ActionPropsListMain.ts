import { ItemIdDefine } from '../../rules/ItemIdDefine'
import { GmAction } from '../../../gm/http/GmAction'

interface categoryItem {
    type: int
    name: string
}
interface propsItem {
    conf_id: int
    name: string
    type: int
}

export class ActionPropsListMain extends GmAction {
    public doAction(params: any) {
        const configs = C.item()

        const categoryList: categoryItem[] = []
        const propsList: propsItem[] = []

        ItemIdDefine.ITEM_TYPE_DESC.forEach((value, k) => {
            categoryList.push({ type: k, name: value })
        })
        configs.forEach((value) => {
            const name = value.itemName ? value.itemName : value.name
            propsList.push({ conf_id: value.id, name: name, type: value.type })
        })

        // TODO cdnUrl的问题
        const res = {
            category_list: categoryList,
            props_list: propsList,
            resVer: '',
            cdnUrl: CP.platform.cdn.baseUrl,
        }

        return res
    }
}
