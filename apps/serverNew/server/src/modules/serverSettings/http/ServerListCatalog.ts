import { Language } from '../../mail/http/language/Language'
import { timestamp, strtotime } from '@arthropoda/game-engine'
import { OpsUserModel } from '../../../../generated/persistence/OpsUserModel'
import { ServerListModel as ServerListModel } from '../../../../generated/persistence/ServerListModel'
import { ServerListConfigModel } from '../../../../generated/persistence/ServerListConfigModel'
import { ServerListConfigProxy } from '../persistence/ServerListConfigProxy'
import { FixedServerAddress, FixedServerEndpoint } from '../../../http/FixedServerEndpoint'

/**
 * 区服路由数据
 */
export interface ServerItem {
    id: int // 区号
    sId: int // 区号
    name: string
    wsHost: string
    wsPort: int
    start: int
    wsUrl: string
    portPath: int
    t: int
}

/**
 * 区服路由列表
 */
export class ServerListCatalog {
    /**
     * 推荐
     */
    readonly STATE_RECOMMEND = 1

    /**
     * 火爆
     */
    readonly STATE_HOT = 2

    /**
     * 维护中
     */
    readonly STATE_MAINTAIN = 9

    /**
     * 未开区
     */
    readonly STATE_NOT_OPEN = 10

    /**
     * 获取区服列表
     * @param openId
     * @returns
     */
    async getList(openId: string = '') {
        const servers = await ServerListModel.find({ order: { sId: 'ASC' } })

        if (!servers) {
            return []
        }
        // 运营账号
        let isWhite = false
        if (openId) {
            const opsUser = await OpsUserModel.findOneBy({ openId: openId })
            if (opsUser && opsUser.opsType > 0) {
                isWhite = true
            }
        }

        const now = timestamp()
        let latestOpenTime = 0
        let maxSid = 0
        const l: ServerItem[] = []
        servers.forEach((sv) => {
            const endpoint = FixedServerEndpoint.get(Number(sv.sId))
            if (!endpoint) {
                return
            }
            const wsUrl = `ws://${endpoint.host}:${endpoint.port}`
            const startTime = strtotime(sv.sTime.toUTCString())
            if (startTime > now) {
                // 运营账号
                if (isWhite) {
                    const svItem = this.formatItem(sv, endpoint, wsUrl)
                    svItem.t = this.STATE_NOT_OPEN
                    l.push(svItem)
                }
            } else {
                latestOpenTime = Math.max(latestOpenTime, startTime)
                maxSid = Math.max(maxSid, Number(sv.sId))
                l.push(this.formatItem(sv, endpoint, wsUrl))
            }
        })
        const recommendId = await this.getRecommendId(maxSid, latestOpenTime)

        let recommendCheck = false
        l.forEach((svInfo) => {
            if (svInfo.sId == recommendId) {
                recommendCheck = true
                if (svInfo.t != this.STATE_MAINTAIN) {
                    svInfo.t = this.STATE_RECOMMEND
                }
            }
        })
        if (!recommendCheck) {
            l.forEach((svInfo) => {
                if (svInfo.sId == maxSid) {
                    if (svInfo.t != this.STATE_MAINTAIN) {
                        svInfo.t = this.STATE_RECOMMEND
                    }
                }
            })
        }
        return l
    }

    private formatItem(sv: ServerListModel, endpoint: FixedServerAddress, wsUrl: string): ServerItem {
        const sId = Number(sv.sId)

        const status = this.checkMaintain(sv) ? this.STATE_MAINTAIN : this.STATE_HOT

        return {
            id: sId,
            sId: sId,
            name: sv.sName,
            wsHost: endpoint.host,
            wsPort: endpoint.port,
            start: strtotime(sv.sTime.toUTCString()),
            wsUrl: wsUrl,
            portPath: 1,
            t: status,
        }
    }

    /**
     * 检测维护状态
     * @param sv
     * @returns
     */
    private checkMaintain(sv: ServerListModel) {
        return sv.sMaintainStart > 0 && sv.sMaintainStart < timestamp()
    }

    /**
     * 获取推荐Id
     * @param maxSid 最大区服Id
     * @param latestOpenTime 上一次开服时间
     * @param opts 选项
     * @returns 推荐区服Id
     */
    private async getRecommendId(maxSid: int, latestOpenTime: int, opts: { language?: string } = {}) {
        const configRow = await ServerListConfigProxy.getObj()
        let recommendId = 0
        if (configRow) {
            recommendId = ServerListCatalog.getRecommendIdByServerConfig(configRow, latestOpenTime)
        }
        let langRecommendId = 0
        const language = opts.language
        if (language) {
            const langList = await Language.getServerList()
            langRecommendId = langList[language] ?? 0
        }
        if (langRecommendId > 0) {
            recommendId = Math.min(langRecommendId, maxSid)
        } else if (recommendId == 0) {
            recommendId = maxSid
        } else {
            recommendId = Math.min(recommendId, maxSid)
        }
        return recommendId
    }

    /**
     * 根据配置获取推荐Id
     * @param configRow
     * @param latestOpenTime
     * @returns
     */
    static getRecommendIdByServerConfig(configRow: ServerListConfigModel, latestOpenTime: int): number {
        if (configRow.recommendId > 0) {
            if (configRow.recommendTime > latestOpenTime) {
                return configRow.recommendId
            } else {
                return 0
            }
        }
        if (!configRow.intervalTime || !configRow.serverId) {
            return 0
        }
        const sIds = configRow.serverId.split(',')
        const intervalTime = Int(configRow.intervalTime)
        const goneTime = timestamp() - configRow.intervalStartTime
        const goneNum = Math.ceil(goneTime / intervalTime)
        let mo = goneNum % sIds.length
        mo = mo == 0 ? sIds.length : mo

        const recommendId = sIds[mo - 1] ?? sIds[0]

        return Number(recommendId)
    }
}
