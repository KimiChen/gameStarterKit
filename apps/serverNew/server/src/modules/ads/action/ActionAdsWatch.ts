import { timestamp } from '@arthropoda/game-engine'
import { ActionTitle } from '../../title/action/ActionTitle'
import { ReqAdsWatch, ResAdsWatch } from '../AdsC2S'
import { AdsDefine } from '../rules/AdsDefine'
import { ActionAds } from './ActionAds'

/**
 * 上报一次广告观看完成并领取奖励
 */
export class ActionAdsWatch extends ActionAds {
    async doAction(req: ReqAdsWatch, res: ResAdsWatch) {
        const user = this.user
        const now = timestamp()
        // takeItem 会校验广告配置是否存在
        const item = ActionAds.takeItem(user, req.adId)
        const conf = C.ads_awards(req.adId)
        ActionAds.prepare(item, now)
        ActionAds.checkWatchable(user, item, conf, now)

        item.num += 1
        item.totalNum += 1
        item.lastTime = now

        res.award = { awards: [] }
        await ActionAds.grantAwards(user, conf, res.award)

        // 部分广告的奖励是称号（见 AdsDefine.TITLE_AWARDS）。
        // 称号的变更由引擎随本次响应自动下发，不需要往 ResAdsWatch 上加字段：
        // 客户端从 `_mod.title` 里就能看到新称号。
        const titleId = AdsDefine.resolveTitleAward(req.adId)
        if (titleId > 0) {
            ActionTitle.grant(user, titleId, now)
        }

        res.ad = ActionAds.toEntry(user, item, conf, now)
    }
}
