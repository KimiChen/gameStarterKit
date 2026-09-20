import { FindOptionsWhere, QueryRunner } from '@arthropoda/typeorm'
import { ActivityDefine } from '../rules/ActivityDefine'
import { CenterActivityModel } from '../../../../generated/persistence/CenterActivityModel'
import { DB } from '@arthropoda/game-engine'
import { QueryPartialEntity } from '@arthropoda/typeorm/query-builder/QueryPartialEntity'

export class CenterActivityProxy {
    static async insertGetId(
        insertData: Pick<
            CenterActivityModel,
            | 'name'
            | 'type'
            | 'openTs'
            | 'closeTs'
            | 'startTs'
            | 'endTs'
            | 'awardTs'
            | 'salt'
            | 'activityConf'
            | 'activityDetail'
            | 'planCode'
            | 'dailyStartTime'
            | 'dailyEndTime'
            | 'serverId'
        >,
        runner: QueryRunner,
    ): Promise<number> {
        const manager = runner.manager
        const result = await manager.insert(CenterActivityProxy, insertData)
        return result.identifiers[0].id ?? 0
    }

    static async updateById(
        id: number,
        centerUpdateData: Partial<CenterActivityModel>,
        runner: QueryRunner,
    ): Promise<boolean> {
        const manager = runner.manager
        const criteria: FindOptionsWhere<CenterActivityModel> = { id: id }
        const res = await manager.update(CenterActivityModel, criteria, centerUpdateData)
        return (res.affected ?? 0) > 0
    }

    public static async getByNameOpenCloseTime(name: string, openTs: number, closeTs: number, server_id: string) {
        return CenterActivityModel.findOneBy({
            name: name,
            openTs: openTs,
            closeTs: closeTs,
            status: ActivityDefine.STATUS_NORMAL,
            serverId: server_id,
        })
    }
}
