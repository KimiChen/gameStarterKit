import { User } from '../../user/bean/User'
import { PayClickBean } from '../../pay/bean/PayClickBean'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'

export class AdjustOptionCatalog {
    constructor(protected user: User) {}

    private getUserFieldValue(fieldPath: string) {
        return fieldPath.split('.').reduce((value, fieldName) => value?.[fieldName], this.user as any)
    }

    // 充值-当前可充值的列表
    public async payList() {
        const clickInfoList = await PayClickBean.loadByIds([this.user.id], undefined, { serverId: this.user.sId })
        const rst: { [k: string]: any } = {}
        if (clickInfoList && clickInfoList.size > 0) {
            clickInfoList.forEach((clickInfo) => {
                const itemConf = C.recharge(clickInfo.rechargeId)
                rst[String(clickInfo.id)] = itemConf.name + '-' + itemConf.recharge
            })
        } else {
            rst['0'] = '请先点击充值'
        }
        return rst
    }

    getPropsIdList() {
        const rst: { [k: number]: string } = {}
        C.item().forEach((confItem, id) => {
            rst[id] = String(id) + ':' + confItem.name
        })
        return rst
    }

    getUserPropsList() {
        const rst: { [k: number]: string } = {}

        for (const [propId, fieldPath] of ItemIdDefine.currencyUserFields.entries()) {
            const value = this.getUserFieldValue(fieldPath)
            if (!value) {
                continue
            }
            if (!C.item().has(propId)) {
                continue
            }
            const propConf = C.item(propId)
            rst[propId] = propConf.itemName + ':' + propConf.id + ':' + value
        }
        for (const [propId, val] of this.user.bag) {
            if (!C.item().has(propId)) {
                continue
            }
            const propConf = C.item(propId)
            rst[propId] = propConf.itemName + ':' + propConf.id + ':' + val.num
        }
        return rst
    }

    getAttrList() {
        const list: { [k: int]: string } = {}
        C.attr().forEach((v) => {
            list[v.id] = v.name
        })
        return list
    }
}
