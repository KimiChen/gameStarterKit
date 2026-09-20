import { ReadonlyBean, RefHash } from '@arthropoda/game-engine'
import { GuildMemberRef } from '../../guild/ref/GuildMemberRef'
import { User } from '../bean/User'
import { UserInfoOnlyNetBean } from '../bean/UserInfoOnlyNetBean'
import { UserBaseRef } from '../ref/UserBaseRef'

export class UserProfileFormatter {
    static format(query: User | ReadonlyBean<User> | UserBaseRef | GuildMemberRef): UserInfoOnlyNetBean {
        if (query instanceof RefHash) {
            return new UserInfoOnlyNetBean({
                id: query.id,
                sId: query.sId,
                activityTime: query.activityTime,
                lv: query.lv,
                name: query.name,
                fp: query.fp,
                realm: query.realm,
                vip: query.vip,
                guild: query.guild,
                guildName: query.guildName,
                head: query.head,
                face: query.face,
                hair: query.hair,
                faceDecorate: query.faceDecorate,
                race: query.race,
                fashionWear: query.fashionWear,
                sex: query.sex,
                equips: query.equips,
                weaponLv: query.weaponLv,
                magicId: query.magicId,
                gongLv: query.gongLv,
            })
        }
        return new UserInfoOnlyNetBean({
            id: query.id,
            sId: query.sId,
            activityTime: query.activityTime,
            lv: query.lv,
            name: query.name,
            fp: query.fp,
            realm: query.realm,
            vip: query.vip,
            guild: query.guild,
            guildName: query.guildName,
            head: query.head,
            face: query.face,
            hair: query.hair,
            faceDecorate: query.faceDecorate,
            race: query.race,
            fashionWear: query.fashion.fashionWear as User['fashion']['fashionWear'],
            sex: query.sex,
            equips: query.equip.equips as User['equip']['equips'],
            weaponLv: query.weapon.lv,
            magicId: query.gong.magicId,
            gongLv: query.gong.lv,
        })
    }
}
