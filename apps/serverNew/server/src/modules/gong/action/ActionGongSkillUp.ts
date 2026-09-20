import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Props } from '../../props/inventory/Props'
import { ReqGongSkillUp, ResGongSkillUp } from '../GongC2S'
import { GongErrors } from '../GongErrors'
import { GongProgression } from './GongProgression'

export class ActionGongSkillUp extends GameAction {
    async doAction(req: ReqGongSkillUp, res: ResGongSkillUp) {
        const user = this.user
        const sorceryId = req.sorceryId

        // 技能不存在
        if (!user.gong.sorceryList.includes(sorceryId)) {
            throw SystemErrors.SysParamError
        }

        const lvConf = C.gong_sorcery(sorceryId)
        const newId = lvConf.newId

        // 没有配置新技能，约定为已满级
        if (newId == 0) {
            throw GongErrors.GongMaxSkillLv
        }

        // 功法等级限制
        if (user.gong.lv < lvConf.gongLevel) {
            throw GongErrors.GongNotEnoughGongLv
        }

        // 升级消耗
        if (lvConf.costPropId > 0 && lvConf.costNum > 0) {
            await Props.costProp(user, lvConf.costPropId, lvConf.costNum)
        }

        // 升级成功 替换新技能
        for (let i = 0; i < user.gong.sorceryList.length(); i++) {
            const sorcery = user.gong.sorceryList.at(i)
            if (sorcery != sorceryId) {
                continue
            }
            user.gong.sorceryList.set(i, newId)
            break
        }

        const conf = C.gong_sorcery(newId)
        if (conf == null || conf.skillId == 0) {
            res.sorceryId = newId
            return
        }
        GongProgression.sorceryLevelUp(user)

        res.sorceryId = newId
    }
}
