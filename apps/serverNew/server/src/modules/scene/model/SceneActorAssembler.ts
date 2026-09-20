import { User } from '../../user/bean/User'
import { SceneActor } from './SceneActor'

export class SceneActorAssembler {
    static fromUser(user: User, actor: SceneActor, sysId: int, cId: int) {
        actor.sysId = sysId
        actor.id = user.id as int
        actor.uId = user.id as int
        actor.sId = user.sId
        actor.name = user.name
        actor.guild = user?.guild ?? 0
        actor.lv = user.lv
        actor.realm = user.realm
        actor.magicCd = user.gong.magicCd
        actor.race = user.race
        actor.gongMaster = user.gong.master
        actor.gongLv = user.gong.lv
        actor.fp = user.realmUpFp
        actor.weaponMaster = user.weapon.master
        actor.weaponLv = user.weapon.lv
        actor.equipWearShow = user.equip.equipWearShow
    }
}
