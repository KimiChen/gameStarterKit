import { DB, timestamp } from '@arthropoda/game-engine'
import { LessThanOrEqual, QueryRunner } from '@arthropoda/typeorm'
import { GlobalMailModel } from '../../../../../generated/persistence/GlobalMailModel'
import { GlobalMailTimingModel } from '../../../../../generated/persistence/GlobalMailTimingModel'
import { MailRoleLogModel } from '../../../../../generated/persistence/MailRoleLogModel'
import { ReqMailAdd } from '../../MailS2S'
import { ActionMailAdd } from '../../action/ActionMailAdd'
import { ActionMailLoopSendGlobal } from '../../action/ActionMailLoopSendGlobal'
import { ActionTracelessAward } from '../../action/ActionTracelessAward'
import { ActionTracelessReduceItem } from '../../action/ActionTracelessReduceItem'
import { GmMailDefine } from '../../rules/GmMailDefine'
import { QueuedLocalAction } from '../../../../runtime/action/QueuedLocalAction'
import { SystemErrors } from '../../../../runtime/errors/SystemErrors'
import { MailPropItem } from '../../../../runtime/protocol/S2S/commom'

export class GmEmailHandleTiming {
    /**
     * handleTiming
     * 处理定时的邮件，包括给角色发奖的邮件
     * @access
     */
    public async handleTiming() {
        const now = timestamp()
        const rows = await GlobalMailTimingModel.find({
            where: {
                timingTime: LessThanOrEqual(now),
                mailStatus: 0,
            },
        })
        if (rows.length == 0) {
            return
        }
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index]
            if (row.type == GmMailDefine.TYPE_SERVER) {
                await this.caseTypeServer(row)
            } else if (row.type == GmMailDefine.TYPE_ROLE) {
                await this.caseTypeRole(row)
            } else if (row.type == GmMailDefine.TYPE_MUTI) {
                await this.caseTypeMix(row)
            } else if (row.type == GmMailDefine.TYPE_RANGE) {
                await this.caseTypeServerRange(row)
            } else if (row.type == GmMailDefine.TYPE_TRACELESS_ROLE) {
                await this.caseTypeTracelessRole(row)
            } else if (row.type == GmMailDefine.TYPE_TRACELESS_MUTI) {
                await this.caseTypeTracelessMix(row)
            }
        }
        return { num: rows.length }
    }

    private async caseTypeServer(row: GlobalMailTimingModel) {
        const timingId = row.id

        if (!(await this.updateMailStatus(timingId))) {
            return false
        }
        const insertData = new GlobalMailModel()
        insertData.type = row.type
        insertData.uqid = row.uqid
        insertData.title = row.title
        insertData.content = row.content
        insertData.awards = row.awards
        insertData.pastTime = row.pastTime
        insertData.serverId = row.serverId
        insertData.roleId = row.roleId
        insertData.updateTime = row.updateTime
        insertData.initTimeType = row.initTimeType
        insertData.mailRange = row.mailRange

        if (!(await GlobalMailModel.insert(insertData))) {
            await this.updateMailStatus(timingId, 2)
            return false
        }

        const sIds = JSON.parse(row.serverId)
        await QueuedLocalAction.rpc(ActionMailLoopSendGlobal, { sIds: sIds }, 0, 0)
        return true
    }

    private caseTypeServerRange(row: GlobalMailTimingModel) {
        return this.caseTypeServer(row)
    }

    private caseTypeServerChannel(row: GlobalMailTimingModel) {
        return this.caseTypeServer(row)
    }

    private async caseTypeRole(row: GlobalMailTimingModel) {
        const roleIds = row.roleId.split(',').map((el) => Number(el))
        let awards = row.awards ? JSON.parse(row.awards) : []
        awards = Array.isArray(awards) ? awards : []
        const uqid = Number(row.uqid)

        return DB.startTransaction(async (runner) => {
            try {
                if (!(await this.updateMailStatusByRunner(runner, row.id))) {
                    await runner.rollbackTransaction()
                    return false
                }
                // // 记录日志, 重复操作会拦截
                for (const roleId of roleIds) {
                    const res = await this.addMailRoleLogByRunner(
                        runner,
                        uqid,
                        roleId,
                        GmMailDefine.LOG_TYPE_ROLE,
                        awards,
                    )
                    if (!res) {
                        await runner.rollbackTransaction()
                        return false
                    }
                }
                await runner.commitTransaction()
            } catch (e) {
                Log.error('caseTypeRole err:', e, row)
                await runner.rollbackTransaction()
                return false
            }

            const title = row.title
            const content = row.content
            for (const roleId of roleIds) {
                const param: ReqMailAdd = {
                    uId: roleId,
                    uqid: uqid,
                    type: 100,
                    fromId: 0,
                    fromName: '',
                    title: title,
                    content: content,
                    awards: awards,
                    params: '{}',
                    pastTime: Number(row.pastTime),
                }
                await QueuedLocalAction.rpc(ActionMailAdd, param, roleId, 0)
            }

            return true
        })
    }

    private async caseTypeMix(row: GlobalMailTimingModel) {
        let list = row.awards ? JSON.parse(row.awards) : []
        list = Array.isArray(list) ? list : []
        const uqid = Number(row.uqid)

        return DB.startTransaction(async (runner) => {
            try {
                if (!(await this.updateMailStatusByRunner(runner, row.id))) {
                    await runner.rollbackTransaction()
                    return false
                }

                for (const item of list) {
                    const roleId = item.role_id
                    const awards = Array.isArray(item.props) ? item.props : []
                    const res = await this.addMailRoleLogByRunner(
                        runner,
                        uqid,
                        roleId,
                        GmMailDefine.LOG_TYPE_MIX,
                        awards,
                    )
                    if (!res) {
                        await runner.rollbackTransaction()
                        return false
                    }
                }
                await runner.commitTransaction()
            } catch (e) {
                Log.error('caseTypeMix err:', e, row)
                await runner.rollbackTransaction()
                return false
            }
            const title = row.title
            const content = row.content
            for (const item of list) {
                const roleId = item.role_id
                const awards = Array.isArray(item.props) ? item.props : []
                const param: ReqMailAdd = {
                    uId: roleId,
                    uqid: uqid,
                    type: 100,
                    fromId: 0,
                    fromName: '',
                    title: title,
                    content: content,
                    awards: awards,
                    params: '',
                    pastTime: Number(row.pastTime),
                }
                await QueuedLocalAction.rpc(ActionMailAdd, param, roleId, 0)
            }
            return true
        })
    }

    private async caseTypeTracelessRole(row: GlobalMailTimingModel) {
        const roleIds = row.roleId.split(',').map((el) => Number(el))
        let awards = row.awards ? JSON.parse(row.awards) : []
        awards = Array.isArray(awards) ? awards : []
        const uqid = Number(row.uqid)
        const addType = row.addType
        const action = this.getTracelessAction(addType)
        if (!action) {
            throw SystemErrors.SysParamErr.vars([addType])
        }

        await DB.startTransaction(async (runner) => {
            try {
                if (!(await this.updateMailStatusByRunner(runner, row.id))) {
                    await runner.rollbackTransaction()
                    return false
                }

                // 记录日志
                for (const roleId of roleIds) {
                    const res = await this.addMailRoleLogByRunner(
                        runner,
                        uqid,
                        roleId,
                        GmMailDefine.LOG_TYPE_ROLE,
                        awards,
                    )
                    if (!res) {
                        await runner.rollbackTransaction()
                        return false
                    }
                }
                await runner.commitTransaction()
            } catch (e) {
                Log.error('caseTypeTracelessRole err:', e, row)
                await runner.rollbackTransaction()
                return false
            }

            for (const roleId of roleIds) {
                const param = {
                    uId: roleId,
                    uqid: uqid,
                    type: addType,
                    l: awards,
                }
                await QueuedLocalAction.rpc(action, param, roleId, 0)
            }

            return true
        })
    }

    private async caseTypeTracelessMix(row: GlobalMailTimingModel) {
        let list = row.awards ? JSON.parse(row.awards) : []
        list = Array.isArray(list) ? list : []
        const uqid = Number(row.uqid)
        const addType = row.addType
        const action = this.getTracelessAction(addType)
        if (!action) {
            throw SystemErrors.SysParamErr.vars([addType])
        }

        return DB.startTransaction(async (runner) => {
            try {
                if (!(await this.updateMailStatusByRunner(runner, row.id))) {
                    await runner.rollbackTransaction()
                    return false
                }

                for (const item of list) {
                    const roleId = item.role_id
                    const awards = Array.isArray(item.props) ? item.props : []
                    const res = await this.addMailRoleLogByRunner(
                        runner,
                        uqid,
                        roleId,
                        GmMailDefine.LOG_TRACELESS_MIX,
                        awards,
                    )
                    if (!res) {
                        await runner.rollbackTransaction()
                        return false
                    }
                }
                await runner.commitTransaction()
            } catch (e) {
                Log.error('caseTypeTracelessMix err:', e, row)
                await runner.rollbackTransaction()
                return false
            }

            for (const item of list) {
                const roleId = item.roleId
                const awards = Array.isArray(item.props) ? item.props : []
                const param = {
                    uId: roleId,
                    uqid: uqid,
                    type: addType,
                    l: awards,
                }
                await QueuedLocalAction.rpc(action, param, roleId, 0)
            }

            return true
        })
    }

    async updateMailStatusByRunner(runner: QueryRunner, timingId: number, status: number = 1) {
        return runner.manager.update(GlobalMailTimingModel, timingId, { mailStatus: status })
    }

    async updateMailStatus(timingId: number, status: number = 1) {
        return GlobalMailTimingModel.update(timingId, { mailStatus: status })
    }

    public async addMailRoleLogByRunner(
        runner: QueryRunner,
        uqid: number,
        userId: number,
        actionType: number,
        awards: MailPropItem[],
    ): Promise<boolean> {
        const insertData: Partial<MailRoleLogModel> = {
            uqid: uqid,
            userId: String(userId),
            logTime: timestamp(),
            actionType: actionType,
            awards: JSON.stringify(awards),
            actionTime: timestamp(),
            actionStatus: 0,
            failMsg: '',
        }
        const res = await runner.manager.insert(MailRoleLogModel, insertData)
        return res.identifiers.length > 0
    }

    public getTracelessAction(addType: number) {
        if (addType == GmMailDefine.ADD_TYPE_AWARD) {
            return ActionTracelessAward
        } else if (addType == GmMailDefine.ADD_TYPE_REDUCE0) {
            return ActionTracelessReduceItem
        } else if (addType == GmMailDefine.ADD_TYPE_REDUCE_REAL) {
            return ActionTracelessReduceItem
        } else {
            Log.error(`不存在的无痕操作类型:${addType}`)
            return undefined
        }
    }
}
