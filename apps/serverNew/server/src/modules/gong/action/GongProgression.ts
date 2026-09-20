import { Attr } from '../../attr/calculation/Attr'
import { AttrDefine } from '../../attr/rules/AttrDefine'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { UserFp } from '../../user/action/UserFp'
import { User } from '../../user/bean/User'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'

export class GongProgression {
    static levelUp(user: User, level: int) {
        const levelConfig = C.gong(level)
        Attr.updateAttrModItem(user, AttrModDefine.Gong, AttrDefine.attrsFromArrOrObj(levelConfig))
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_GONG)
    }

    static sorceryLevelUp(user: User) {
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_SORCERY)
    }
}
