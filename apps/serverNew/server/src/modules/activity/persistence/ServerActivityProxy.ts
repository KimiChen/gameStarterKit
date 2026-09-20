import { FindOptionsWhere, QueryBuilder, QueryRunner, SelectQueryBuilder } from '@arthropoda/typeorm'
import { ActivityDefine } from '../rules/ActivityDefine'
import { ServerActivityModel } from '../../../../generated/persistence/ServerActivityModel'
import { DB } from '@arthropoda/game-engine'

export class ServerActivityProxy {
    static async insertActivity(
        sId: number,
        insertData: Pick<
            ServerActivityModel,
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
            | 'crossId'
        >,
        runner: QueryRunner,
    ): Promise<number> {
        const manager = runner.manager
        const result = await manager.insert(ServerActivityModel, { sid: sId, ...insertData })
        return result.identifiers[0].id ?? 0
    }

    static async checkActivityTime(sId: number, name: string, openTs: number, closeTs: number): Promise<boolean> {
        const builder = ServerActivityModel.createQueryBuilder()
        const s = ServerActivityModel.f_status
        const fOpenTs = ServerActivityModel.f_open_ts
        const fCloseTs = ServerActivityModel.f_close_ts
        const pre = `${ServerActivityModel.f_sid}=${sId} and ${ServerActivityModel.f_name}='${name}'`
        const r = await builder
            .where(
                `${pre} and ${s}=${ActivityDefine.STATUS_NORMAL} and ${fOpenTs} >= ${openTs} and ${fCloseTs}<=${closeTs}`,
            )
            .orWhere(
                `${pre} and ${s}=${ActivityDefine.STATUS_NORMAL} and ${fCloseTs} > ${openTs} and ${fOpenTs}<=${openTs}`,
            )
            .orWhere(
                `${pre} and ${s}=${ActivityDefine.STATUS_NORMAL} and ${fOpenTs} < ${closeTs} and ${fCloseTs}>=${closeTs}`,
            )
            .limit(1)
            .getCount()
        return r > 0
    }

    static async updateById(
        sId: number,
        id: number,
        updateData: Partial<ServerActivityModel>,
        runner: QueryRunner,
    ): Promise<boolean> {
        const manager = runner.manager
        const criteria: FindOptionsWhere<ServerActivityModel> = { sid: sId, id: id }
        const result = await manager.update(ServerActivityModel, criteria, updateData)
        return (result.affected ?? 0) > 0
    }

    public static getByNameOpenCloseTime(sId: number, name: string, openTs: number, closeTs: number) {
        return ServerActivityModel.findOneBy({
            name: name,
            openTs: openTs,
            closeTs: closeTs,
            status: ActivityDefine.STATUS_NORMAL,
            sid: sId,
        })
    }

    static async getById(sId: number, activityId: number) {
        return ServerActivityModel.findOneBy({ sid: sId, id: activityId })
    }

    public static getByCrossId(sId: number, crossId: number) {
        return ServerActivityModel.findOneBy({ sid: sId, crossId: crossId })
    }
}
