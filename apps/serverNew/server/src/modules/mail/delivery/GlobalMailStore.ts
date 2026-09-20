import { IdFieldType, ReadonlyBean, timestamp } from '@arthropoda/game-engine'
import { Equal, MoreThan, Or } from '@arthropoda/typeorm'
import { GlobalMailModel } from '../../../../generated/persistence/GlobalMailModel'
import { GlobalMailBean } from '../bean/GlobalMailBean'

export class GlobalMailStore {
    static async loadAll(): Promise<Map<IdFieldType, ReadonlyBean<GlobalMailBean>>>
    static async loadAll(onlyRead: false): Promise<Map<IdFieldType, GlobalMailBean>>
    static async loadAll(
        onlyRead: boolean = true,
    ): Promise<Map<IdFieldType, ReadonlyBean<GlobalMailBean> | GlobalMailBean>> {
        return onlyRead ? GlobalMailBean.loadOnlyReadAll() : GlobalMailBean.loadAll()
    }

    static async getMailsFromDb() {
        const now = timestamp()
        return GlobalMailModel.find({
            where: { pastTime: Or(MoreThan(now), Equal(0)), moreStatus: 0 },
        })
    }
}
