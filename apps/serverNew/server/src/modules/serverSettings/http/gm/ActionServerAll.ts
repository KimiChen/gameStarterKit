import { RedisInstance } from '@arthropoda/game-engine'
import { Server } from './Server'
import { Language } from '../../../mail/http/language/Language'
import { datetotime, timestamp } from '@arthropoda/game-engine'
import { ServerListCatalog } from '../ServerListCatalog'
import { ServerListConfigProxy } from '../../persistence/ServerListConfigProxy'
import { ServerListProxy } from '../../persistence/ServerListProxy'

export class ActionServerAll extends Server {
    /**
     * 获取所有的区服
     * @param params
     */
    public async doAction(params: any) {
        const serverList = await ServerListProxy.getAllList()

        // const svConf = configPlatform(Conf::CROSS_SERVER_LIST); //跨区功能待做
        const svConf: Record<number, any> = {}

        const configObj = await ServerListConfigProxy.getObj()
        if (!configObj) {
            this.gmContext.setGmMsg(1010, 'server list conf must has one record', params)
            return false
        }

        const l: Record<number, lItem> = {}
        const defaultAutoOpenLanguagesInfo: Record<number, AutoOpenLanguagesItem> = {}
        const info = {
            l: new Array<lItem>(),
            server_languages: {},
            auto_switch: {},
            auto_open: {
                opened: 0,
                server_id: 0,
                start_time: '',
                end_time: '',
                open_num: 0,
                last_server_people_num: 0,
                last_server_pay_num: 0,
                people_num: 0,
                last_server_open_num: 0,
                last_server_open_pay_num: 0,
                languages: defaultAutoOpenLanguagesInfo,
            },
        }
        info.server_languages = RedisInstance.getCenterRedis().hGetAll(Language.LANGUAGE_OPEN_SERVER_KEY)

        const setOpenMaxTime = this.getServerOpenMaxTime()
        const now = timestamp()
        let maxId = 0
        let latestOpenTime = 0 // 最近开启的时间
        for (const serverItem of serverList) {
            const sId = Number(serverItem.sId)
            const item: lItem = {
                server_id: 0,
                state: 0,
                server_name: '',
                open_time: 0,
                start_time: 0,
                end_time: 0,
                server_type: 0,
            }
            item.server_id = sId
            item.server_name = serverItem.sName
            item.state = Server.STATE_HOT
            const openTime = datetotime(serverItem.sTime)
            item.open_time = openTime > setOpenMaxTime ? 0 : openTime
            item.start_time = Number(serverItem.sMaintainStart)
            item.start_time = item.start_time == 1 ? 0 : item.start_time
            item.end_time = Number(serverItem.sMaintainEnd)
            if (item.end_time > 0 && item.end_time < now) {
                item.start_time = 0
                item.end_time = 0
            }
            item.server_type = svConf[sId]?.hefu > 0 ? 2 : 1

            l[sId] = item

            if (openTime < now) {
                maxId = Math.max(maxId, sId)

                latestOpenTime = Math.max(latestOpenTime, openTime)
            }
        }

        let recommendId = ServerListCatalog.getRecommendIdByServerConfig(configObj, latestOpenTime)

        if (recommendId == 0) {
            recommendId = maxId
        } else {
            recommendId = Math.min(recommendId, maxId)
        }
        if (Object.hasOwn(l, recommendId)) {
            l[recommendId].state = Server.STATE_NEW
        } else {
            if (maxId > 0) {
                l[maxId].state = Server.STATE_NEW
            }
        }

        info.l = Object.values(l)

        info.auto_switch = {
            server_id: [],
            interval_time: 0,
        }
        if (configObj && configObj.serverId) {
            info.auto_switch = {
                server_id: configObj.serverId.split(','),
                interval_time: Number(configObj.intervalTime),
            }
        }
        const opened =
            configObj.openStatus == Server.OPEN_STATUS_OPEN ? Server.OPEN_STATUS_OPEN : Server.OPEN_STATUS_CLOSE
        let openServerId = Number(configObj.openServerId)
        if (maxId >= openServerId) {
            openServerId = 0
        }
        info.auto_open = {
            opened: opened,
            server_id: openServerId,
            start_time: openServerId ? configObj.openStartTime : '',
            end_time: openServerId ? configObj.openEndTime : '',
            open_num: openServerId ? Number(configObj.openPeopleNum) : 0, // 设置的开服人数
            last_server_people_num: 0,
            last_server_pay_num: 0,
            people_num: 0, // 兼容旧字段
            last_server_open_num: openServerId ? Number(configObj.lastServerOpenNum) : 0,
            last_server_open_pay_num: openServerId ? Number(configObj.lastServerPayNum) : 0,
            languages: {},
        }
        if (maxId > 0) {
            info.auto_open.last_server_people_num = await this.getServerPeopleNum(maxId)
            info.auto_open.people_num = info.auto_open.last_server_people_num // 兼容旧字段
            info.auto_open.last_server_pay_num = await this.getServerPayNum(maxId)
        }

        // 多语言推荐区服自动开区
        const languageList = await Language.getServerList()
        for (const sId of Object.values(languageList)) {
            if (Object.hasOwn(info.auto_open.languages, sId)) {
                continue
            }
            info.auto_open.languages[sId].last_server_people_num = await this.getServerPeopleNum(sId)
            info.auto_open.languages[sId].people_num = info.auto_open.last_server_people_num // 兼容旧字段
            info.auto_open.languages[sId].last_server_pay_num = await this.getServerPayNum(sId)
        }

        return info
    }
}

type lItem = {
    server_id: number
    state: number
    server_name: string
    open_time: number
    start_time: number
    end_time: number
    server_type: number
}

type AutoOpenLanguagesItem = {
    last_server_people_num: number
    people_num: number
    last_server_pay_num: number
}
