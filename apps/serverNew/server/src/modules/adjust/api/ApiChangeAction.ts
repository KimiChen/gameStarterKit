import json5 from 'json5'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { AdjustChatChange } from '../../chat/adjust/AdjustChatChange'
import { AdjustGuild } from '../../guild/adjust/AdjustGuild'
import { AdjustMail } from '../../mail/adjust/AdjustMail'
import { AdjustPropChange } from '../../props/adjust/AdjustPropChange'
import { User } from '../../user/bean/User'
import { AdjustEquipmentCommands } from '../change/AdjustEquipmentCommands'
import { AdjustRuntimeCommands } from '../change/AdjustRuntimeCommands'
import { AdjustUserBoostCommands } from '../change/AdjustUserBoostCommands'
import { AdjustServer } from '../change/AdjustServer'
import { AdjustUser } from '../change/AdjustUser'
import { applyBeanChange } from '../change/applyBeanChange'

export class ApiChangeAction extends CombineClasses(
    class {},
    AdjustPropChange,
    AdjustChatChange,
    AdjustUserBoostCommands,
    AdjustEquipmentCommands,
    AdjustRuntimeCommands,
    AdjustUser,
    AdjustServer,
    AdjustMail,
    AdjustGuild,
) {
    constructor(protected user: User) {
        super()
    }

    static async execAction(reqData: any, ip?: string) {
        const uId: int = reqData.uId ?? 0
        const methodName: string = reqData.method ?? ''
        const params: any = reqData.params ?? {}

        const user = await User.load(uId)
        if (!user) {
            throw SystemErrors.SysParamErr.params({ vars: reqData })
        }

        //记录操作日志
        Log.webadjust.warn(`${uId} method:${methodName},params:${json5.stringify(params)},ip:${ip}`)

        if (methodName === '__dataModify') {
            applyBeanChange(user, reqData.routeList ?? [], reqData.action ?? {})
            return ''
        }

        const actionObj = new ApiChangeAction(user)
        const result = await (actionObj as any)[methodName](...params)
        if (!result) {
            return ''
        }
        if (typeof result == 'object') {
            const data: { [key: string]: any } = { title: methodName }
            if (Array.isArray(result)) {
                data.table = result
            } else {
                data.obj = result
            }
            return json5.stringify(data)
        } else {
            return String(result)
        }
    }
}

// Mixin 函数
function CombineClasses(baseClass: any, ...mixins: any[]) {
    return mixins.reduce((accumulator, current) => {
        Object.getOwnPropertyNames(current.prototype).forEach((name) => {
            if (name !== 'constructor') {
                accumulator.prototype[name] = current.prototype[name]
            }
        })
        return accumulator
    }, baseClass)
}
