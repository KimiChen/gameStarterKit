import { ClassInfo } from '@arthropoda/game-engine'
import json5 from 'json5'
import { GameAction } from '../../../runtime/action/GameAction'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { UserErrors } from '../UserErrors'
import { ReqUserFieldValUpdate } from '../UserS2S'
import { User } from '../bean/User'

/**
 * 通用修改玩家身上是属性字段
 */
export class ActionUserFieldValUpdate extends GameAction {
    async doAction(req: ReqUserFieldValUpdate, res: ResDefault) {
        const user = await User.load(req.uId)
        if (!user) {
            throw UserErrors.UserNoUser
        }
        for (const item of req.data) {
            const field = user.getClassInfo().fieldMap[item.field]
            if (!field) {
                continue
            }
            // 基础数据类型直接赋值
            if (field.type instanceof ClassInfo) {
                throw new Error(`不支持非基础类型:${json5.stringify(field)}`)
            }
            // 转换为实际类型
            const finalVal = user.parseBaseValue(field, item.val)
            field.setVal(user, finalVal)
        }
    }
}
