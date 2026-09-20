import { array_unique, strtotime, timestamp } from '@arthropoda/game-engine'
import { GlobalMailTimingModel } from '../../../../../generated/persistence/GlobalMailTimingModel'
import { ServerListProxy } from '../../../serverSettings/persistence/ServerListProxy'
import { GmMailDefine } from '../../rules/GmMailDefine'
import { LanguageDefine } from '../../language/LanguageDefine'
import { GmAction } from '../../../gm/http/GmAction'
import { Language } from '../language/Language'

export class ActionEmailSendEmail extends GmAction {
    private type: number = 0

    private sIds: number[] = []

    private roleIds: number[] = []

    private title = ''

    private content = ''

    private awards: any[] = []

    private propContent: any[] = []

    private props: any[] = []

    private pastTime: number = 0

    private timingTime: number = 0

    private uqid: number = 0

    private initTimeType: number = 0

    private now = 0

    private isTiming = false

    private totalNum = 0 // 发送奖励的总次数

    private ranges: { [key: string]: any } = {} // 邮件范围

    /**
     * sendEmail
     * 发送邮件
     * @param params
     * @access
     * @return bool
     */
    public doAction(params: { [key: string]: any }) {
        const languageType = LanguageDefine.LANGUAGE_TYPE ?? 0
        if (languageType) {
            // 获取多语言标题、内容
            const languageContent = params.language_content ?? null
            const [res, msg] = Language.checkLanguageContent(languageContent)
            if (!res) {
                this.gmContext.setGmMsg(1010, msg, params)
                return false
            }
            ;[this.title, this.content] = Language.getLanguageTitleAndContent(languageContent)
        } else {
            this.title = params.email_title ?? ''
            this.content = params.email_content ?? ''
        }

        this.type = Number(params.type)
        this.sIds = params.server_id ? params.server_id.split(',').map((el: string) => Number(el)) : []
        this.roleIds = params.role_id ? params.role_id.split(',').map((el: string) => Number(el)) : []
        this.propContent = params.prop_content ?? []
        this.props = params.props ?? []
        this.pastTime = strtotime(params.past_time ?? '')
        this.timingTime = strtotime(params.timing_time ?? '')
        this.uqid = Number(params.uqid)
        this.initTimeType = params.init_time_type ? Number(params.init_time_type) : 0
        this.ranges = params.range ?? {}

        this.pastTime = Math.max(0, Number(this.pastTime))
        if (this.pastTime <= timestamp()) {
            // 发送邮件的过期时间不能小于当前时间
            this.gmContext.setGmMsg(1010, '邮件过期时间不能小于当前时间', params)
            return false
        }

        this.timingTime = Math.max(0, Number(this.timingTime))

        this.now = timestamp()
        this.isTiming = this.timingTime > this.now

        if (!this.title || !this.content || !this.uqid || this.uqid < 1) {
            this.gmContext.setGmMsg(2001, 'title, content 不能为空')
            return false
        }

        if (this.timingTime > 0 && this.timingTime < this.now) {
            this.gmContext.setGmMsg(2002, '定时时间小于当前时间')
            return false
        }

        if (this.type == GmMailDefine.TYPE_SERVER) {
            return this.caseTypeServer()
        } else if (this.type == GmMailDefine.TYPE_ROLE) {
            return this.caseTypeRole()
        } else if (this.type == GmMailDefine.TYPE_MUTI) {
            return this.caseTypeMix()
        } else if (this.type == GmMailDefine.TYPE_RANGE) {
            return this.caseTypeServerRange()
        }

        return false
    }

    /**
     * caseTypeServer
     * 全服奖励
     * @access
     * @param $type
     * @param $params
     * @return bool
     */
    public async caseTypeServer() {
        if (!this.sIds.length) {
            this.gmContext.setGmMsg(2001, '区服ID不能为空')
            return false
        }
        if (!Array.isArray(this.props)) {
            this.gmContext.setGmMsg(2004, '奖励格式不正确')
            return false
        }

        const serverItems = await ServerListProxy.getBySidsToArray(this.sIds)
        if (!this.checkSidsValid(this.sIds, serverItems)) {
            return false
        }
        if (!(await this.saveData())) {
            this.gmContext.setGmMsg(2005, '数据保存失败')
            return false
        }

        this.totalNum = 0

        return true
    }

    /**
     * caseTypeServerRange
     * range的格式如下
     *
     * "channel": [1,2,3],
     * "vip": [1,2,3],
     * "school": [1,2,3],
     * "xiake": [1,2,3],
     * "create_start_time": "2020-10-10 10:10:10",
     * "create_end_time": "2020-12-10 10:10:10",
     * "league": [
     *   {
     *       "server_id": 1,
     *       "league_list": [1,2,3]
     *   },
     *   {
     *   "server_id": 2,
     *   "league_list": [1,2,3]
     *   }
     * ]
     * @access
     */
    public caseTypeServerRange() {
        if (!Object.keys(this.ranges).length) {
            this.gmContext.setGmMsg(2001, '范围参数range不正确')
            return false
        }
        if (this.ranges.create_start_time) {
            this.ranges.create_start_time = strtotime(this.ranges.create_start_time)
        }
        if (this.ranges.create_end_time) {
            this.ranges.create_end_time = strtotime(this.ranges.create_end_time)
        }

        return this.caseTypeServer()
    }

    private async saveData() {
        const hasEmail = await GlobalMailTimingModel.findOneBy({ uqid: this.uqid })
        if (hasEmail) {
            this.gmContext.setGmMsg(2003, '当前邮件已存在')
            return false
        }

        if (this.props.length > 0) {
            this.props = this.transformKefuToAwards(this.props)
        }
        if (this.propContent.length > 0) {
            for (const propContentItem of this.propContent) {
                propContentItem.props = this.transformKefuToAwards(propContentItem.props)
            }
        }

        //提前填充需要非空的字段
        const insertData: Partial<GlobalMailTimingModel> = {
            mailMoreInfo: '',
            mailRange: '',
        }
        insertData.type = this.type
        insertData.uqid = this.uqid
        insertData.title = this.title
        insertData.content = this.content
        const awards = this.props.length ? this.props : this.propContent
        insertData.awards = JSON.stringify(awards)
        insertData.pastTime = this.pastTime
        insertData.serverId = this.sIds.length ? JSON.stringify(this.sIds) : ''
        insertData.roleId = this.roleIds.join(',')
        if (this.isTiming) {
            insertData.timingTime = this.timingTime
        }
        insertData.updateTime = timestamp()
        insertData.totalNum = this.totalNum
        insertData.initTimeType = this.initTimeType
        if (this.type == GmMailDefine.TYPE_RANGE) {
            insertData.mailRange = JSON.stringify(this.ranges)
        }
        const insertRes = await GlobalMailTimingModel.insert(insertData)
        if (insertRes.identifiers.length == 0) {
            return false
        }

        // if ($this->type == Email::TYPE_SERVER || $this->type == Email::TYPE_RANGE) {
        //     ServerSettingModel::updateServerSetting(parent::MAIL_TAG, $this->sIds);
        // }

        return true
    }

    /**
     * caseTypeRole
     * 给多个角色发相同的奖励 role id 不能为空
     * @param $type
     * @param $params
     * @access
     * @return bool
     */
    private async caseTypeRole() {
        if (!this.roleIds || !Array.isArray(this.roleIds)) {
            this.gmContext.setGmMsg(2001, '角色ID不能为空')
            return false
        }
        if (this.roleIds.length > GmAction.MAX_ROLE_NUM) {
            this.gmContext.setGmMsg(2002, '角色ID不能超过1000个')
            return false
        }

        if (!Array.isArray(this.props)) {
            this.gmContext.setGmMsg(2004, '奖励格式不正确')
            return false
        }
        for (const roleId of this.roleIds) {
            if (!roleId || typeof roleId != 'number') {
                this.gmContext.setGmMsg(2002, '角色ID有异常')
                return false
            }
        }
        const uniqNum = array_unique(this.roleIds).length
        if (this.roleIds.length != uniqNum) {
            this.gmContext.setGmMsg(2002, '角色ID存在重复')
            return false
        }

        this.totalNum = this.roleIds.length

        if (!(await this.saveData())) {
            this.gmContext.setGmMsg(2005, '数据保存失败')
            return false
        }

        return true
    }

    /**
     * caseTypeMuti
     * 给多个角色发不同的奖励
     * @param $type
     * @param $params
     * @access
     * @return bool
     */
    private async caseTypeMix() {
        // 判断格式是否正确
        if (!Array.isArray(this.propContent)) {
            this.gmContext.setGmMsg(2004, '奖励格式不正确')
            return false
        }

        const roleIds = []
        for (const roleItem of this.propContent) {
            if (!roleItem || !roleItem.role_id) {
                this.gmContext.setGmMsg(2004, '列表内item格式不正确')
                return false
            }
            roleIds.push(roleItem.role_id)
        }

        if (roleIds.length > GmAction.MAX_ROLE_NUM) {
            this.gmContext.setGmMsg(2002, '角色ID不能超过1000个')
            return false
        }

        const uniqNum = array_unique(roleIds).length
        if (roleIds.length != uniqNum) {
            this.gmContext.setGmMsg(2002, '角色ID存在重复')
            return false
        }

        this.totalNum = roleIds.length

        if (!(await this.saveData())) {
            this.gmContext.setGmMsg(2005, '数据保存失败')
            return false
        }

        return true
    }
}
