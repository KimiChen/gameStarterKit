import { GiftModel } from '../../../../../generated/persistence/GiftModel'

export class GiftProxy {
    public static async insertGift(data: Partial<GiftModel>): Promise<number> {
        const res = await GiftModel.insert(data)
        return res.identifiers[0].id ?? 0
    }
}
