import { timestamp, UtilTime } from '@arthropoda/game-engine'
import { ActivityItemBean } from '../bean/ActivityItemBean'
import { ActivityStageBean } from '../bean/ActivityStageBean'

export class ActivitySchedule {
    sId: int = 0

    id: int = 0

    name: string = ''

    type: int = 0

    open_ts: int = 0

    close_ts: int = 0

    start_ts: int = 0

    end_ts: int = 0

    award_start: int = 0

    award_end: int = 0

    salt: string = ''

    cross_id: int = 0

    crossSids: int[] = []

    parseTime: int = 0

    startDate: int = 0

    constructor(initData?: ActivityStageBean) {
        if (initData == null) return

        const openInfo = initData.openInfo!
        this.sId = initData.sId
        this.id = openInfo.id
        this.name = openInfo.name
        this.open_ts = openInfo.openTs
        this.close_ts = openInfo.closeTs
        this.start_ts = openInfo.startTs
        this.end_ts = openInfo.endTs
        this.salt = initData.salt
        this.cross_id = openInfo.crossId
        this.crossSids = openInfo.crossSids.copy()
        this.award_start = openInfo.awardStart > 0 ? openInfo.awardStart : openInfo.endTs
        this.award_end = openInfo.closeTs

        if (this.start_ts > 0) this.startDate = UtilTime.getDayStartTime(this.start_ts)
    }

    checkIsOpen() {
        const now = timestamp()
        return now >= this.open_ts && now <= this.close_ts
    }

    checkIsAwardTime(awardDelayTime = 0) {
        const now = timestamp()
        const awardStart = this.award_start + awardDelayTime
        return now >= awardStart && now <= this.award_end
    }

    checkCanSave() {
        const now = timestamp()
        return now >= this.start_ts && now <= this.end_ts
    }

    async getCrossSids() {
        return this.crossSids
    }

    toActivityMod() {
        const item = new ActivityItemBean()
        item.id = this.id
        item.name = this.name
        item.startTs = this.start_ts
        item.endTs = this.end_ts
        item.awardStart = this.award_start
        item.awardEnd = this.award_end
        item.openTs = this.open_ts
        item.closeTs = this.close_ts
        item.crossId = this.cross_id
        item.crossSids.init(this.crossSids)
        return item
    }
}
