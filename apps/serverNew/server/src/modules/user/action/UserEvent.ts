import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { ActivityRankUpdate } from '../../activity/rank/ActivityRankUpdate'
import { ActivityDefine } from '../../activity/rules/ActivityDefine'
import { User } from '../bean/User'
import { AttrDefine } from '../../attr/rules/AttrDefine'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { PowerScoreRules } from '../rules/PowerScoreRules'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { RankDefine } from '../../rank/rules/RankDefine'
import { RankAccess } from '../../rank/persistence/RankAccess'
import { Attr } from '../../attr/calculation/Attr'
import { UserFp } from './UserFp'
import { UserLevelProgression } from './UserLevelProgression'
import { AwardResponse } from '../../../runtime/protocol/C2S/commom'
import { taBase_roleLogin } from '../../../../generated/telemetry/base/roleLogin'

export class UserEvent {
    //#region 角色

    /**
     * 玩家登陆
     * @param user
     */
    static async userLogin(user: User) {
        if (user.fp > 0) {
            await RankAccess.getRedisRank(RankDefine.TYPE_FP, user.sId).set(user.id, user.fp)
        }

        await taBase_roleLogin(user)
    }

    static async userLeave(user: User) {
        if (user.fp > 0) {
            await RankAccess.getRedisRank(RankDefine.TYPE_FP, user.sId).set(user.id, user.fp)
        }
    }

    /**
     * 玩家升级
     * @param user
     * @param level
     * @param upNum
     */
    static async userLevelUp(user: User, level: int) {
        const lvConf = C.level(level)

        // 等级属性
        const attrs = AttrDefine.attrsFromArrOrObj(lvConf)

        // 种族额外属性加成
        const raceAttr = new AttrTypeBean({
            type: C.race(user.race).recommendAttrId,
            val: lvConf.additionAttr,
        })
        AttrDefine.mergeAttrs(attrs, [raceAttr])

        Attr.updateAttrModItem(user, AttrModDefine.UserLv, attrs)

        // 更新评分
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_LV)

        await RankAccess.getRedisRank(RankDefine.TYPE_LEVEL, user.sId).set(user.id, user.lv)

        // 冲榜活动
        await ActivityRankUpdate.run(user, [ActivityDefine.RankLevel], user.lv)
    }

    //#endregion

    //#region 资源

    /**
     * addProp
     * 添加资源相关事件
     * @param HUser    user
     * @param ItemConf itemConf
     * @param int      num
     * @param          resp
     * @access
     * @static
     */
    static async addProp(user: User, itemConf: IConfItem, num: int, resp?: AwardResponse) {
        // 按道具区分
        switch (itemConf.id) {
            case ItemIdDefine.ITEM_ID_GC:
                // 更新玩家数数版本号
                break
            case ItemIdDefine.ITEM_ID_EXP:
                // 自动升级
                await UserLevelProgression.autoLevelUp(user, resp)
                break
            case ItemIdDefine.ITEM_ID_ACHIEVE_POINT:
                // 更新成就榜
                break
            case ItemIdDefine.ITEM_ID_LOVE:
                break
            case ItemIdDefine.ITEM_ID_POWER: // 精力同步到场景
            case ItemIdDefine.ITEM_ID_SKILL_NUM: // 大招次数同步
                break
            case ItemIdDefine.ITEM_ID_SC:
            case ItemIdDefine.ITEM_ID_GF:
                break
        }
        // 数数埋点
    }

    //#endregion
}
