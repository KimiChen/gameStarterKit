import { And, In, LessThan, MoreThan } from '@arthropoda/typeorm'
import { ServerListModel } from '../../../../generated/persistence/ServerListModel'

export class ServerListProxy {
    static async getAllList() {
        const l = await ServerListModel.find()
        if (l.length == 0) {
            return l
        }
        l.sort((a, b) => a.sId - b.sId)
        return l
    }

    public static async getAllSid(): Promise<number[]> {
        const arr = await ServerListModel.find({
            select: {
                sId: true,
            },
        })
        const r = []
        for (const it of arr) {
            r.push(it.sId)
        }
        return r
    }

    public static async getBySidsToArray(sIds: number[]) {
        return ServerListModel.find({
            where: {
                sId: In(sIds),
            },
        })
    }

    public static async getOneBySidToArray(sId: number) {
        return ServerListModel.findOneBy({
            sId: sId,
        })
    }

    public static async getAllToArray() {
        return ServerListModel.find()
    }

    public static async updateBySids(sIds: number[], updateData: Partial<ServerListModel>) {
        return ServerListModel.update(
            {
                sId: In(sIds),
            },
            {
                ...updateData,
            },
        )
    }

    public static async getWillOpenServer(nowTime: Date, openMaxTime: Date) {
        return ServerListModel.findOne({
            where: {
                sTime: And(MoreThan(nowTime), LessThan(openMaxTime)),
            },
        })
    }

    public static async getMaxOpenServerId(time: Date): Promise<number> {
        const item = await ServerListModel.findOne({
            where: {
                sTime: LessThan(time),
            },
            order: {
                sId: 'DESC',
            },
        })
        return item?.sId ?? 0
    }

    public static async getAllSidAndName() {
        return ServerListModel.find({
            select: {
                sId: true,
                sName: true,
            },
        })
    }

    public static async getAllSidAndCrossStatus() {
        return ServerListModel.find({
            select: {
                sId: true,
                // isCross:true
            },
        })
    }
}
