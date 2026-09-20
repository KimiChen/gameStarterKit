import { GiftModel } from '../../../../../../generated/persistence/GiftModel'
import { Gift } from './Gift'

export class ActionGiftGetList extends Gift {
    public async doAction(params: any) {
        const [offset, limit] = this.getPageParams(params, 'page', 'page_size')
        params = this.initWhere(params)
        let builder = GiftModel.createQueryBuilder()
        builder.where('1=1')
        if (params.gift_id) {
            builder = builder.andWhere('id=:id', { id: params.gift_id })
        }
        if (params.price) {
            builder = builder.andWhere('price=:price', { price: params.price })
        }
        if (params.gift_name) {
            builder = builder.andWhere("`desc` like '%:desc%'", { desc: params.gift_name })
        }
        if (params.pay_type) {
            builder = builder.andWhere('pay_type=:pay_type', { pay_type: params.pay_type })
        }
        builder = builder.orderBy(`\`${GiftModel.f_desc}\``, 'DESC').offset(offset).limit(limit)
        const data = await builder.getMany()
        const total = await GiftModel.count()

        return { list: data.map((el) => el.exportOfSnakeField()), total: total }
    }

    public initWhere(params: any) {
        params.gift_id = params.gift_id ?? ''
        params.price = params.price ?? ''
        params.gift_name = params.gift_name ?? ''
        params.pay_type = params.pay_type ?? ''
        return params
    }
}
