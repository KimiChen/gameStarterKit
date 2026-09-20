import { timestamp } from '@arthropoda/game-engine'
import { AdsEntry, ReqAdsList, ResAdsList } from '../AdsC2S'
import { ActionAds } from './ActionAds'

/**
 * 拉取激励广告列表
 */
export class ActionAdsList extends ActionAds {
    async doAction(req: ReqAdsList, res: ResAdsList) {
        const user = this.user
        const now = timestamp()
        const ads: AdsEntry[] = []
        C.ads_awards().forEach((conf) => {
            const item = ActionAds.takeItem(user, conf.id)
            ActionAds.prepare(item, now)
            ads.push(ActionAds.toEntry(user, item, conf, now))
        })
        ads.sort((left, right) => left.adId - right.adId)
        res.ads = ads
    }
}
