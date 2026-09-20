import { AwardResponse, PropItem } from '../../../runtime/protocol/C2S/commom'

export class Award {
    /**
     * 合并重复的奖励
     * @param awards
     * @returns
     */
    static mergeSameProps(awards: PropItem[]) {
        const newAwds: Map<int, PropItem> = new Map()
        this.mergeAwards(newAwds, awards)
        return Array.from(newAwds.values())
    }

    /**
     * 合并两个奖励列表
     * @param awards
     * @param appendAwards 待合并的奖励列表
     */
    static mergeAwards(awards: Map<int, PropItem>, appendAwards: PropItem[]) {
        for (const award of appendAwards) {
            if (award.propId == 0 || award.num == 0) {
                continue
            }
            let item = awards.get(award.propId)
            if (item == null) {
                item = { propId: award.propId, num: award.num }
                awards.set(item.propId, item)
            } else {
                item.num += award.num
            }
        }
    }

    static pbAwards2Resp(props: PropItem[], resp?: AwardResponse) {
        if (resp == null) {
            return
        }
        if (!resp.awards) {
            resp.awards = []
        }
        for (const prop of props) {
            resp.awards.push({
                propId: prop.propId,
                num: prop.num,
            })
        }
    }
}
