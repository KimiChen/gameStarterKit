import { timestamp } from '@arthropoda/game-engine'
import { LessThan, MoreThan } from '@arthropoda/typeorm'
import { GonggaoLoginModel } from '../../../../generated/persistence/GonggaoLoginModel'
import { GongGaoItem, GongGaoListResponse } from '../../user/http/UserLoginQuery'
import { LINE_GONGGAO, checkLineModuleOpen } from '../rules/LineFeatureRules'

export class LoginAnnouncementQuery {
    static async get(): Promise<GongGaoListResponse> {
        const isOpen = await checkLineModuleOpen(LINE_GONGGAO)
        const response: GongGaoListResponse = {
            s: 0,
            gonggao: { open: isOpen ? 1 : 0 },
        }
        if (!isOpen) return response

        const nowTime = timestamp()
        const rows = await GonggaoLoginModel.find({
            where: { startTime: LessThan(nowTime), endTime: MoreThan(nowTime), isClose: 0 },
            order: { sort: 'ASC' },
        })
        response.gonggao.l = []
        let version = 0
        for (const row of rows) {
            const item: GongGaoItem = {
                id: row.id,
                title: row.title,
                content: row.content,
                ver: row.updateTime,
                type: row.type,
                img: row.img,
                sort: row.sort,
            }
            version = Math.max(version, item.ver)
            response.gonggao.l.push(item)
        }
        response.gonggao.ver = version
        return response
    }
}
