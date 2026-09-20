import json5 from 'json5'
import { Props } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { UserLevelProgression } from '../../user/action/UserLevelProgression'
import { WeaponProgression } from '../../weapon/action/WeaponProgression'
import { PropItem } from '../../../runtime/protocol/C2S/commom'
import { AdjustChange } from './AdjustChange'
import { AdjustEquipmentCommands } from './AdjustEquipmentCommands'

export class AdjustUserBoostCommands extends AdjustChange {
    /**
     * 一键牛逼
     * @group 基础工具
     * @canCustom
     * @sort  99
     */
    async demonUser() {
        const addItems: PropItem[] = []
        for (const itemConf of C.item().values()) {
            let addNum = 999
            if (itemConf.type == ItemIdDefine.ITEM_TYPE_CURRENCY) {
                if (ItemIdDefine.currencyUserFields.get(itemConf.id) == null) continue
                if (itemConf.id == ItemIdDefine.ITEM_ID_SKILL_NUM || itemConf.id == ItemIdDefine.ITEM_ID_SKILL_MP_NUM)
                    continue
                addNum = 99999999
            }
            if (itemConf.type == ItemIdDefine.ITEM_TYPE_EQUIPMENT) addNum = 0
            if (itemConf.type == ItemIdDefine.ITEM_TYPE_BOX) addNum = 1
            addItems.push({ propId: itemConf.id, num: addNum })
        }

        this.user.realm = C.realm().end().id
        this.user.lv = C.level().end().id
        await UserLevelProgression.autoLevelUp(this.user)

        for (let index = 0; index < this.user.gong.sorceryList.length(); index++) {
            const sorcery = this.user.gong.sorceryList.at(index) as number
            const newId = C.gong_sorcery(sorcery).newId
            if (newId != 0) this.user.gong.sorceryList.set(index, newId)
        }

        for (const [, item] of C.weapon()) {
            this.user.weapon.lv = item.id
            WeaponProgression.openSoul(this.user)
            await WeaponProgression.levelUp(this.user, this.user.weapon.lv)
        }

        try {
            await Props.addProps(this.user, addItems)
            await new AdjustEquipmentCommands(this.user).equipAddAll()
        } catch (error) {
            throw new Error(`uId:${this.user.id} 一键高级号报错：${error}`)
        }

        return `{title: '一键牛逼',tableCol:[{title:'道具ID', field:'propId'}, {title:'数量', field:'num'}],tableValue:${json5.stringify(addItems)},obj:{}}`
    }
}
