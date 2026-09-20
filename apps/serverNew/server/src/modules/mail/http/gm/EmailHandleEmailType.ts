import { getServerIdByUid } from '@arthropoda/game-engine'
import { timestamp } from '@arthropoda/game-engine'
import { MoreThan } from '@arthropoda/typeorm'
import { GmMailDefine } from '../../rules/GmMailDefine'
import { GlobalMailTimingModel } from '../../../../../generated/persistence/GlobalMailTimingModel'
import { MailModel as MailEntity } from '../../../../../generated/persistence/MailModel'

export class EmailHandleEmailType {
    private uqId: number = 0

    private email: GlobalMailTimingModel | null = null

    private emailStatus = 0

    private emailType = 0

    private moreStatus = 0

    private isServerMail = false

    private handleInfo: { [key: string]: any } = {}

    private handleStatus = 0

    private changeMailStatus = 0

    /**
     * changeEmailType
     * 处理changeEmailType的后续行为
     */
    public async handleEmailType() {
        this.email = await GlobalMailTimingModel.findOne({
            where: {
                mailMoreStatus: MoreThan(0),
                mailMoreConfirm: 0,
            },
        })
        if (!this.email) {
            return true
        }
        this.uqId = this.email.uqid
        if (this.uqId < 1) {
            return ['uqid not right']
        }
        this.email.mailMoreConfirm = GmMailDefine.MORE_DOING
        await this.email.save()

        this.emailStatus = this.email.mailStatus
        this.emailType = this.email.type
        this.moreStatus = this.email.mailMoreStatus
        this.isServerMail = [GmMailDefine.TYPE_SERVER, GmMailDefine.TYPE_RANGE].includes(this.emailType)

        this.changeMailStatus = this.moreStatus
        if (this.moreStatus == GmMailDefine.MORE_STATUS_RESUME) {
            this.changeMailStatus = 0
        }

        this.handleInfo.time = timestamp()
        this.handleInfo.l = []

        this.handleStatus = GmMailDefine.MORE_SUCCESS

        if (this.moreStatus == GmMailDefine.MORE_STATUS_BLOCK) {
            await this.handleBlock()
        } else if (this.moreStatus == GmMailDefine.MORE_STATUS_RESUME) {
            await this.handleResume()
        } else if (this.moreStatus == GmMailDefine.MORE_STATUS_DEL) {
            await this.handleDel()
        }

        this.email.mailMoreConfirm = GmMailDefine.MORE_SUCCESS
        this.email.mailMoreInfo = JSON.stringify(this.handleInfo)
        await this.email.save()

        return true
    }

    /**
     * 处理屏蔽的
     */
    private async handleBlock() {
        await this.handleByType()
    }

    /**
     * 处理删除
     */
    private async handleDel() {
        await this.handleByType()
    }

    /**
     * 处理恢复
     */
    private async handleResume() {
        await this.handleByType()
    }

    private async handleByType() {
        if (this.emailType == GmMailDefine.TYPE_SERVER) {
            await this.handleServerMail()
        } else if (this.emailType == GmMailDefine.TYPE_ROLE) {
            await this.handleRoleMail()
        } else if (this.emailType == GmMailDefine.TYPE_RANGE) {
            await this.handleServerMail()
        } else if (this.emailType == GmMailDefine.TYPE_MUTI) {
            await this.handleRoleMail()
        }
    }

    /**
     * handleServerMail
     * 处理区服类型的邮件
     * @access
     */
    private async handleServerMail() {
        const serverIds = JSON.parse(this.email!.serverId)
        for (const serverId of serverIds) {
            await await MailEntity.update({ uqid: this.uqId }, { mMoreStatus: this.changeMailStatus })
            this.handleInfo.l[serverId] = {
                res: 1,
            }
        }
    }

    /**
     * handleRoleMail
     * 处理个人类型的邮件
     * @access
     */
    private async handleRoleMail() {
        if (!this.email) {
            Log.error('error:handleRoleMail this.eamil is undefined')
            return
        }
        let roleIds = []
        if (this.emailType == GmMailDefine.TYPE_ROLE) {
            roleIds = this.email.roleId.split(',')
        } else if (this.emailType == GmMailDefine.TYPE_MUTI) {
            let list = this.email.awards ? JSON.parse(this.email.awards) : []
            list = Array.isArray(list) ? list : []
            for (const item of list) {
                roleIds.push(item.role_id)
            }
        }
        const roleSvs: { [sId: number]: number[] } = {}
        for (const roleId of roleIds) {
            const sId = getServerIdByUid(roleId)
            roleSvs[sId] = roleSvs[sId] ?? []
            roleSvs[sId].push(roleId)
        }

        for (const serverIdKey in roleSvs) {
            const svRoleIds = roleSvs[serverIdKey]
            const serverId = Number(serverIdKey)
            this.handleInfo.l = this.handleInfo.l ?? {}
            this.handleInfo.l[serverId] = {
                res: 1,
                role_id: svRoleIds,
            }
        }

        await MailEntity.update({ uqid: this.uqId }, { mMoreStatus: this.changeMailStatus })
    }
}
