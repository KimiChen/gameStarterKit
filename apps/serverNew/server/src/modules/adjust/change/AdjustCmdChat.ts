import * as fs from 'fs'
import json5 from 'json5'
import path from 'path'
import { User } from '../../user/bean/User'
import { ApiChangeAction } from '../api/ApiChangeAction'
import { ChangeDocument } from '../http/ChangeDocument'

/**
 * 聊天控制台
 */
export class AdjustCmdChat {
    static readonly Tips = '执行命令格式 @id p1,p2'

    /**
     * @help 下发所有可执行的命令
     * @id 参数1,参数2 执行指定actionId的命令
     * @param user
     * @param text
     * @returns
     */
    static async input(user: User, text: string) {
        if (!ADJUST_OPEN) {
            return false
        }

        if (!text.startsWith('@')) {
            return false
        }

        let msg = ''
        if (text.startsWith('@help')) {
            msg = this.helpText()
        } else {
            const inputArr = text.split('@')
            if (inputArr.length != 2) {
                msg = '输入格式错误:' + text
            } else {
                msg = await this.execCmd(user, inputArr[1])
            }
        }

        this.sendChat(user, msg)

        return true
    }

    static sendChat(user: User, msg: string) {
        // 旧二进制推送已删除；原生 Lobby 领域推送待接入
        Log.info(`[${user.sId}区]调整台聊天 uId=${user.id}: ${msg}`)
    }

    static async execCmd(user: User, actionStr: string) {
        //8 1001,10
        const funcParam = actionStr.split(' ')
        const actionId = parseInt(funcParam[0])
        const action = this.getActionById(actionId)
        if (action == undefined) {
            return `找不到@${actionId},输入@help查看命令编号`
        }
        const actionParams = []
        if (funcParam.length == 2) {
            let index = 0
            for (const p of funcParam[1].split(',')) {
                const node = action.actions[0].childNodeTemplate!.children[index]
                switch (node.ui!.valueType) {
                    case 'number':
                        actionParams[index] = Number(p)
                        break
                    default:
                        actionParams[index] = p
                        break
                }
                index++
            }
        }

        const result = await ApiChangeAction.execAction({
            uId: user.id,
            method: action.route,
            params: actionParams,
        })

        let resMsg = `@${actionId}:${action.route}`
        if (actionParams.length > 0) {
            resMsg += ` 参数:${actionParams}`
        }
        if (result.length > 0) {
            resMsg += ' 结果:' + result
        } else {
            resMsg += ' 执行成功'
        }
        return resMsg
    }

    static getActionById(actionId: int) {
        const documentData = this.loadChangeDocument()
        let funcNum = 1
        for (const item of documentData.nodes) {
            for (const func of item.children) {
                if (funcNum == actionId) {
                    return func
                }
                funcNum++
            }
        }
        return undefined
    }

    static helpText() {
        let groupStr = `${this.Tips}\r\n`
        let funcNum = 1
        const documentData = this.loadChangeDocument()
        for (const item of documentData.nodes) {
            let funcStr = ''
            for (const func of item.children) {
                const funAction = func.actions[0]
                funcStr += `    ${funcNum}.${funAction.desc}`
                funcNum++
                if (funAction.childNodeTemplate!.children.length > 0) {
                    let paramStr = ''
                    for (const param of funAction.childNodeTemplate!.children) {
                        paramStr += `${param.desc},`
                    }
                    funcStr += ` p:[${paramStr}]`
                }
                funcStr += '\r\n'
            }
            groupStr += `${item.desc}\r\n${funcStr}`
        }

        return groupStr
    }

    static loadChangeDocument() {
        const filePath = path.resolve(ROOT_PATH, 'generated', 'adjust', 'change_document.json5')
        const jsonContent = fs.readFileSync(filePath, 'utf-8')
        let jsonData: any
        try {
            jsonData = json5.parse(jsonContent)
        } catch (e) {
            throw new Error(`读取解析json文件:${filePath}报错了!${e}`)
        }
        return jsonData as ChangeDocument
    }
}
