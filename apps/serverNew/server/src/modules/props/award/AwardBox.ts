import { GameRandom } from '../../../runtime/random/GameRandom'

/**
 * 领取宝箱奖励相关操作
 */
export class AwardBox {
    // 宝箱类型
    //0-全部获得/1-自选其一/2-随机其一
    static readonly BOX_TYPE_ALL = 0 // 全部获得

    static readonly BOX_TYPE_OPTIONAL = 1 // 自选其一

    static readonly BOX_TYPE_RANDOM = 2 // 随机其一

    // 是否合并奖励
    static readonly AWARD_NOT_COMBINE = 0 // 不合并奖励

    static readonly AWARD_COMBINE = 1 // 合并奖励

    // 是否直接打开宝箱
    static readonly OPEN_NOW = 1

    /**
     * openBoxAward
     * 开启宝箱获得奖励
     * @param ItemBoxConf $itemBox
     * @return array|[]ItemBoxDetailAwardsConf
     * @access
     * @static
     */
    public static openBoxAward(itemBox: IConfItem_box) {
        // 随机奖励需要支持【无奖励】的情况，用道具id0表示，即【使用该宝箱时有概率啥都获得不了】，一般会配合必定奖励使用
        /** @var ItemBoxDetailConf $randomItem */
        const randomItem = GameRandom.randomByWeightConfig(itemBox.detail)
        let awards: IConfItem_boxAwards[] = []
        if (randomItem && randomItem.awards) {
            awards = randomItem.awards
        } else {
            awards = []
        }
        return awards
    }
}
