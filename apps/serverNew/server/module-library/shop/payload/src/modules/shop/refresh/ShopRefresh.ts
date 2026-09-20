import { mapValues, timestamp, UtilTime } from '@arthropoda/game-engine'
import moment from 'moment'
import { ActivityErrors } from '../../activity/ActivityErrors'
import { Props } from '../../props/inventory/Props'
import { User } from '../../user/bean/User'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { ShopInfoBean } from '../bean/ShopInfoBean'
import { ShopItemBean } from '../bean/ShopItemBean'
import { ShopConst } from '../rules/ShopConst'
import { ShopErrors } from '../ShopErrors'
import { ShopStateStore } from '../state/ShopStateStore'

export class ShopRefresh {
    readonly isAutoRefresh: boolean

    constructor(
        private readonly user: User,
        private readonly shopConfig: IConfShop,
        private readonly detailConfig: Map<int, IConfShopContent>,
        private readonly state: ShopStateStore,
    ) {
        this.isAutoRefresh =
            this.shopConfig.showNum > 0 &&
            this.shopConfig.autoRefresh &&
            Object.keys(this.shopConfig.autoRefresh).length > 0
    }

    getItemExpiredTime(shopItemConf: IConfShopContent) {
        switch (shopItemConf.buyLimitType) {
            case ShopConst.LimitTypeTotal:
                return 0
            case ShopConst.LimitTypeDay:
                return this.getNextRefreshTime()
            case ShopConst.LimitTypeWeek:
                return UtilTime.getNextWeekDayStartTime()
            case ShopConst.LimitTypeMonth:
                return UtilTime.nextMonthTime()
            case ShopConst.LimitTypeActivity:
                throw ActivityErrors.ActivityNotOpen
            default:
                throw SystemErrors.SysParamErr
        }
    }

    getNextRefreshTime() {
        if (!this.isAutoRefresh) {
            return UtilTime.getCurrentResetTime()
        }

        let nextTime = 0
        const nowTime = timestamp()
        const baseDate = moment.unix(nowTime).format('YYYY-MM-DD')
        const dayStartTime = UtilTime.getDayStartTime()
        const times: int[] = []

        const timeStrs = this.shopConfig.autoRefresh as string[]
        for (const timeStr of timeStrs) {
            const itemTime = moment(`${baseDate} ${timeStr}`, 'YYYY-MM-DD HH:mm:ss').unix()
            if (itemTime < dayStartTime) {
                throw SystemErrors.SysConfErr
            }
            times.push(itemTime)
        }
        times.push(moment.unix(times[0]).add(1, 'days').unix())

        for (const itemTime of times) {
            if (nowTime < itemTime) {
                nextTime = itemTime
                break
            }
        }
        return nextTime > 0 ? nextTime : UtilTime.nextDayTime()
    }

    async ensureSchedule(shopInfo?: ShopInfoBean) {
        if (!this.isAutoRefresh) return
        const currentShopInfo = shopInfo ?? (await this.state.getShopInfo(true))
        if (currentShopInfo.showExpiredTime < timestamp()) {
            currentShopInfo.showExpiredTime = this.getNextRefreshTime()
        }
    }

    async manualRefresh() {
        const shopInfo = await this.chargeManualRefresh()
        this.refreshItems(shopInfo)
    }

    private async chargeManualRefresh() {
        if (!this.isAutoRefresh) {
            throw ShopErrors.ShopNoRefresh
        }
        const shopInfo = await this.state.getShopInfo(true)
        if (shopInfo.refreshNum >= this.shopConfig.manualRefresh.length) {
            throw ShopErrors.ShopNoRefreshTimes
        }
        const nextConf = this.shopConfig.manualRefresh[shopInfo.refreshNum]
        await Props.costProp(this.user, nextConf.costItem, nextConf.costNum)
        shopInfo.refreshNum += 1
        return shopInfo
    }

    private refreshItems(shopInfo: ShopInfoBean) {
        const showNum = Math.min(this.shopConfig.showNum, this.detailConfig.size)
        const randomList = GameRandom.randomManyByWeightConfig(mapValues(this.detailConfig), showNum)

        shopInfo.l.clear()
        const goodIds = randomList.map((item) => item.goodsId).sort((left, right) => left - right)
        for (const goodId of goodIds) {
            shopInfo.l.set(goodId, new ShopItemBean({ id: goodId }))
        }
    }
}
