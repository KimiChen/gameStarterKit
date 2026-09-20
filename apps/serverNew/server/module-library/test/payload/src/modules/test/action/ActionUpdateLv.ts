import { log } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { RedDotBean } from '../../reddot/bean/RedDotBean'
import { User } from '../../user/bean/User'
import { ReqUpdateLv, ResUpdateLv } from '../TestC2S'
import { TestErrors } from '../TestErrors'
import { HeroBean } from '../bean/HeroBean'
import { SkillBean } from '../bean/SkillBean'
import { UserOnlyNet } from '../bean/UserOnlyNet'

let num = 2
export class ActionUpdateLv extends GameAction {
    async doAction(req: ReqUpdateLv, res: ResUpdateLv) {
        log.info('升级门客等级........')

        const userBase = this.user
        // const userBase1 = await UserBase.load(userBase.uId % 2 === 0 ? userBase.uId + 1 : userBase.uId - 1)
        // userBase1!.exp += 1111
        if (!userBase.hero) {
            throw TestErrors.HeroNull
        }

        // const rs = await doCall(
        //     'S2S/user/UserFieldValUpdate',
        //     {
        //         uId: userBase.id as int,
        //         data: [
        //             {
        //                 field: 'guildRole',
        //                 val: GuildDefine.ROLE_MEMBER.toString(),
        //             },
        //         ],
        //     },
        //     0,
        //     's2',
        // )
        // Log.net.info(rs)

        // num += 1
        // await SessionMgr.sendByServer([userBase.sId], 'chat/MsgChatForbid', {
        //     uId: num,
        // })

        const lv = userBase.hero.lv + req.lv
        // 读取配置表
        const item = C.hero_lv(lv)
        if (!item) {
            throw TestErrors.HeroMaxLv
        }
        if (userBase.gc < item.cost) {
            userBase.gc += 1000000
            // log.info('铜币不足。。。。')
            // throw PropsErrors.PropNoEnough
        }

        let net1 = await UserOnlyNet.load(userBase.id)
        if (!net1) {
            net1 = new UserOnlyNet(userBase.id)
            //net1.buildNet({ lvl: 100, bean1: new TestBean1({ id: 11, val: 12 }) })
            net1.lvl += 100
            //net1.bean1!.val++
        } else {
            net1.delete()
        }
        userBase.hero = new HeroBean()
        if (num % 2 === 0) {
            userBase.hero.lv = 5
            userBase.hero.hId = 10
        } else {
            userBase.hero.lv = 5
            userBase.hero.skill = new SkillBean()
            userBase.hero.skill.hId = 25
        }
        num++

        //测试map<string,的增删改
        if (userBase.redDot.size() < 2) {
            userBase.redDot.set('a1', new RedDotBean({ state: 11, type: 'a1' }))
            userBase.redDot.set('a2', new RedDotBean({ state: 11, type: 'a1' }))
        } else {
            userBase.redDot.get('a1')!.state++
            userBase.redDot.delete('a2')
        }

        userBase.gc -= item.cost
        userBase.deviceId = new Date().toLocaleDateString()
        // const testInfo = new UserTestBean()
        // testInfo.testPower = 22
        // // userBase.buildNet({ testInfo: testInfo })
        // userBase.testInfo!.testBean1!.val += 12
        // userBase.testInfo!.testPower += 1000
        log.info('hero lv : ', userBase.hero!.lv)

        const otherUser = await User.load((userBase.id as int) - 1)
        if (otherUser) {
            otherUser.gong.abPoint += lv * 10000
        }
        userBase.attr.attrs.set(lv, new AttrTypeBean({ type: lv, val: lv }))
        res.success = true
        res.lv = userBase.hero!.lv
        res.gc = userBase.gc
    }
}
