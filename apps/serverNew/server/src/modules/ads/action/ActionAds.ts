import { Map2Array, timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { AwardResponse } from '../../../runtime/protocol/C2S/commom'
import { PropBean } from '../../props/bean/PropBean'
import { Props } from '../../props/inventory/Props'
import { UserErrors } from '../../user/UserErrors'
import { User } from '../../user/bean/User'
import { AdsEntry } from '../AdsC2S'
import { AdsErrors } from '../AdsErrors'
import { AdItem } from '../bean/AdItem'
import { AdsDefine } from '../rules/AdsDefine'

/**
 * 激励广告模块的公共业务逻辑，各协议 Action 继承它复用。
 */
export class ActionAds extends GameAction {
    /**
     * 取玩家的广告记录，没有则按配置创建
     * @param user 玩家
     * @param adId 广告id
     */
    static takeItem(user: User, adId: int): AdItem {
        if (!C.ads_awards().has(adId)) {
            throw AdsErrors.AdsNotExist
        }
        let item = user.ads.get(adId)
        if (item == null) {
            item = new AdItem({ adId })
            user.ads.set(adId, item)
        }
        return item
    }

    /**
     * 过天时清空今日已观看次数。
     * 次数没有独立的每日重置任务，所有读写入口都先经过这里。
     * @param item 广告记录
     * @param now 当前时间
     */
    static prepare(item: AdItem, now: int = timestamp()): void {
        if (AdsDefine.isCrossDay(item.lastTime, now)) {
            item.num = 0
        }
    }

    /**
     * 校验本次观看是否合法，不合法直接抛错
     * @param user 玩家
     * @param item 广告记录
     * @param conf 广告配置
     * @param now 当前时间
     */
    static checkWatchable(user: User, item: AdItem, conf: IConfAds_awards, now: int = timestamp()): void {
        if (!AdsDefine.isUnlocked(user, conf.required)) {
            throw UserErrors.UserNoAdConditon
        }
        if (AdsDefine.resolveCdRemain(item, conf.cd, now) > 0) {
            throw UserErrors.UserAdCding
        }
        if (item.num >= conf.times) {
            throw UserErrors.UserAdTimes
        }
    }

    /**
     * 组装下发给客户端的广告状态
     * @param user 玩家
     * @param item 广告记录
     * @param conf 广告配置
     * @param now 当前时间
     */
    static toEntry(user: User, item: AdItem, conf: IConfAds_awards, now: int = timestamp()): AdsEntry {
        return {
            adId: conf.id,
            desc: conf.desc,
            num: item.num,
            totalNum: item.totalNum,
            times: conf.times,
            cd: conf.cd,
            cdRemain: AdsDefine.resolveCdRemain(item, conf.cd, now),
            unlocked: AdsDefine.isUnlocked(user, conf.required),
        }
    }

    /**
     * 发放广告奖励。
     *
     * 奖励由两部分组成：配置里的道具奖励，以及 practiceTime 折算的挂机收益
     * （按当前修炼地图的每分钟产出直接发放）。
     * @param user 玩家
     * @param conf 广告配置
     * @param res 奖励回包，不传则只入库
     */
    static async grantAwards(user: User, conf: IConfAds_awards, res?: AwardResponse): Promise<void> {
        if (conf.awards.length > 0) {
            await Props.addProps(user, conf.awards, res, true, '广告奖励：' + conf.desc)
        }
        if (conf.practiceTime <= 0) {
            return
        }
        const awardTimes = (conf.practiceTime / Param.PracticeUnitTime) as int
        if (awardTimes <= 0) {
            return
        }
        const awards = new Map<int, PropBean>()
        for (const wait of C.practice(user.practice.practiceId).wait) {
            awards.set(wait.propId, new PropBean({ propId: wait.propId, num: wait.num * awardTimes }))
        }
        await Props.addProps(user, Map2Array(awards)!, res)
    }
}
