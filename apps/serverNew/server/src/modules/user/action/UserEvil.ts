import { User } from '../bean/User'
import { TimesBean } from '../bean/TimesBean'
import { SceneActor } from '../../scene/model/SceneActor'
import { SceneTimeItem } from '../../scene/model/SceneTimeItem'
import { TimeRecovery } from '../../../modules/user/rules/TimeRecovery'

/**
 * 罪恶值(红名)
 */
export class UserEvil {
    /**
     * 初始化罪恶值
     * @param user
     */
    static initEvil(user: User | SceneActor) {
        if (user instanceof SceneActor) {
            user.evil = new SceneTimeItem()
        } else {
            user.evil = new TimesBean(0)
        }
    }

    /**
     * 获取玩家红名值
     * @param HUser|UserBaseRef|SceneActor user
     * @return TimesItem|SceneTimeItem|null
     */
    static getEvil(user: User) {
        // 尝试减少罪恶值
        this.recovery(user)
        return user.evil
    }

    /**
     * @param HUser|UserBaseRef|SceneActor user
     * 罪恶值
     */
    static recovery(user: User) {
        if (user.evil == undefined) {
            this.initEvil(user)
        }

        const beforeNum = -user.evil!.times
        // TimeRecovery.calCusTomCd(user.evil, 'lastTime', 'times', Param.EvilValueReCd, 0)
        const afterNum = -user.evil!.times

        // 数数
        if (user instanceof User) {
            // TaModuleEvil.evilChange(user, beforeNum, afterNum, '时间恢复');
        }
    }

    /**
     * 命中红名阶段
     * @param HUser|UserBaseRef|SceneActor user
     * @param TimesItem|SceneTimeItem|null userEvil
     * @return SceneTimeItem
     */
    static turnSceneEvil(user: User, userEvil?: SceneTimeItem | TimesBean): SceneTimeItem {
        if (userEvil == undefined) {
            userEvil = UserEvil.getEvil(user)!
        }

        if (userEvil instanceof SceneTimeItem) {
            return userEvil
        }

        const sceneEvil = new SceneTimeItem()
        sceneEvil.toModel(userEvil)
        return sceneEvil
    }

    /**
     * 罪恶值改变
     * @param HUser user
     * @param int   num
     * @return void
     */
    static changeNum(user: User, num: int) {
        // 获取玩家红名对象
        const evil = this.getEvil(user)!

        const beforeNum = -evil.times
        // 罪恶值变更
        evil.times = Math.min(num + evil.times, 0)
        const afterNum = -evil.times

        // 同步战场
        // SceneSync.sync_UserAttr(user.id, 'evil', serialize(UserEvil.turnSceneEvil(user, evil)));
        // 数数
        // TaModuleEvil.evilChange(user, beforeNum, afterNum, '击杀玩家');
    }

    /**
     * 命中红名阶段
     * @param HUser|UserBaseRef|SceneActor user
     * @return EvilConf|null
     */
    static userEvilStage(user: User) {
        // 获取玩家红名对象
        const evil = this.getEvil(user)!

        // 当前红名数值
        const evilVal = -evil.times

        // 默认为非红名阶段
        let stage = null

        // 命中对应红名阶段
        for (const [, evilConf] of C.evil()) {
            // 判断最小数值
            if (evilConf.minValue > 0 && evilVal < evilConf.minValue) {
                continue
            }

            // 判断最大数值
            if (evilConf.maxValue > 0 && evilVal > evilConf.maxValue) {
                continue
            }

            stage = evilConf
        }

        return stage
    }
}
