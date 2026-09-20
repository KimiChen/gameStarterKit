import { ServerSettingsKeys } from '../rules/ServerSettingsKeys'
import { In } from '@arthropoda/typeorm'
import { ServerSettingModel } from '../../../../generated/persistence/ServerSettingModel'
import { QueryDeepPartialEntity } from '@arthropoda/typeorm/query-builder/QueryPartialEntity'
import { DB } from '@arthropoda/game-engine'
import { RedisLock } from '@arthropoda/game-engine'

export class ServerSettingProxy {
    /** 不存在tag会自动创建 */
    public static async updateServerSetting(tag: string, sIds: number[] | number): Promise<void> {
        const sIdArr: number[] = (Array.isArray(sIds) ? sIds : [sIds]).map((el) => Int(el))

        await RedisLock.runBlock(ServerSettingsKeys.LOCK_INCREMENT_SETTINGS, 3, async () => {
            const result = await ServerSettingModel.findBy({ sId: In(sIdArr), sKey: tag })
            const resultMap = new Map<number, ServerSettingModel>()
            result.forEach((el) => {
                resultMap.set(el.sId, el)
            })
            const upsertItem: QueryDeepPartialEntity<ServerSettingModel>[] = []
            for (const sId of sIdArr) {
                const sVal = (resultMap.get(sId)?.sVal ?? 0) + 1
                const id = resultMap.get(sId)?.id
                upsertItem.push({ id: id, sId: sId, sKey: tag, sVal: sVal })
            }
            await ServerSettingModel.upsert(upsertItem, [])
        })
    }
}
