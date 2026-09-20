import { UtilTime } from '@arthropoda/game-engine'
import { datetotime, timestamp, timetodate } from '@arthropoda/game-engine'
import { Between, In, LessThan, MoreThan } from '@arthropoda/typeorm'
import { ServerListModel } from '../../../../generated/persistence/ServerListModel'
import { ServerUserModel } from '../../../../generated/persistence/ServerUserModel'
import { PropItem } from '../../../runtime/protocol/C2S/commom'
import { GmExecutionContext } from './GmExecutionContext'
import { RedisInstance } from '@arthropoda/game-engine'

export abstract class GmAction {
    static readonly BIG_DATE = '2029-01-01'

    //配置通知类型
    static readonly FORBID_TAG = 'forbid_tag'

    static readonly MODULE_TAG = 'module_tag'

    static readonly MAIL_TAG = 'mail_tag'

    static readonly ACTIVITY_TAG = 'activity_tag'

    static readonly SERVER_STOP = 'server_stop'

    static readonly MAX_ROLE_NUM = 1000

    constructor(protected gmContext: GmExecutionContext) {}

    public abstract doAction(params: { [key: string]: any }): any

    /**
     * 把客服后台的奖励转成游戏的奖励格式
     * @param props
     * @returns
     */
    transformKefuToAwards(props: any[]): PropItem[] {
        const awards: PropItem[] = []

        for (const prop of props) {
            if (!prop.conf_id || !prop.num) {
                continue
            }

            const award: PropItem = {
                propId: prop.conf_id,
                num: prop.num,
            }

            awards.push(award)
        }

        return awards
    }

    async getServerItem(sId: int) {
        return ServerListModel.findOneBy({ sId: sId })
    }

    async getServerItemsByIds(sIds: int[]) {
        const data = await ServerListModel.find({ where: { sId: In([...sIds]) } })
        if (data.length == 0) {
            return data
        }
        data.sort((a, b) => a.sId - b.sId)

        return data
    }

    checkSidsValid(sIds: int[], serverItems: ServerListModel[]) {
        if (serverItems.length == 0) {
            this.gmContext.setGmMsg(1010, '传递的区服IDs不正确，没有查询到区服', [sIds])
            return false
        }
        if (sIds.length != serverItems.length) {
            this.gmContext.setGmMsg(1011, '传递的区服IDs不正确，存在异常区服ID', [sIds])
            return false
        }
        return true
    }

    checkSidsOpen(serverItems: ServerListModel[]) {
        const nowTime = timestamp()

        for (const serverItem of serverItems) {
            if (datetotime(serverItem.sTime) > nowTime) {
                this.gmContext.setGmMsg(1010, '存在未开启的区服', [serverItem])
                return false
            }
        }

        return true
    }

    async isWillOpenServer() {
        const nowDate = timetodate()
        const openMaxDate = timetodate(this.getServerOpenMaxTime())
        const sv = await ServerListModel.findOne({ where: { sTime: Between(nowDate, openMaxDate) } })
        return sv && sv.sId > 0
    }

    async getCurrentOpenServerId() {
        const nowDate = timetodate()
        const maxSv = await ServerListModel.findOne({ where: { sTime: LessThan(nowDate) }, order: { sId: 'DESC' } })
        return maxSv ? maxSv.sId : 0
    }

    async getAllOpenedServer() {
        const nowDate = timetodate()
        return ServerListModel.find({ where: { sTime: LessThan(nowDate) }, order: { sId: 'DESC' } })
    }

    /**
     * 获取人数,创角人数
     * @param openServerId
     * @returns
     */
    async getServerPeopleNum(openServerId: number): Promise<number> {
        if (ADJUST_OPEN) {
            // 测试环境测试自动开区调整区服人数
            const centerRedis = RedisInstance.getCenterRedis()
            const num = await centerRedis.hGet('serverAutoOpenTestServerNum', String(openServerId))
            if (num) {
                return Number(num)
            }
        }
        const count = await ServerUserModel.countBy({ userSid: openServerId, userInitRole: MoreThan(0) })
        return count
    }

    /**
     * getPeopleNum
     * 获取付费人数
     * @access
     * @param $openServerId
     * @return int
     */
    public async getServerPayNum(openServerId: number): Promise<number> {
        if (ADJUST_OPEN) {
            // 测试环境测试自动开区调整区服付费
            const centerRedis = RedisInstance.getCenterRedis()
            const num = await centerRedis.hGet('serverAutoOpenTestServerPayNum', String(openServerId))
            if (num) {
                return Number(num)
            }
        }
        const count = await ServerUserModel.countBy({ userSid: openServerId, latelyRechargeTime: MoreThan(0) })
        return count
    }

    getPageParams(params: any, fieldPage: string = 'page', fieldLimit: string = 'limit') {
        const page: int = params[fieldPage] ?? 1
        let limit: int = params[fieldLimit] ?? 10
        const offset = (page - 1) * limit
        if (limit > 10000) {
            limit = 10000
        }
        return [offset, limit]
    }

    /**
     * 半年内表明设定了开服时间
     */
    getServerOpenMaxTime() {
        return timestamp() + UtilTime.DAY_SECOND * 180
    }
}
