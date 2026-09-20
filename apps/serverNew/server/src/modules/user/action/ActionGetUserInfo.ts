import { ModInfoRegistry, ModSync, RootBean } from '@arthropoda/game-engine'
import { CenterGuildModel } from '../../../../generated/persistence/CenterGuildModel'
import { Mod } from '../../../../generated/protocol/server/C2S/mod/Mod'
import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { MailPropItem } from '../../../runtime/protocol/S2S/commom'
import { ActivityClientAssembler } from '../../activity/client/ActivityClientAssembler'
import { ActionFriend } from '../../friend/action/ActionFriend'
import { ActionGuild } from '../../guild/action/ActionGuild'
import { Guild } from '../../guild/bean/Guild'
import { GuildApply } from '../../guild/bean/GuildApply'
import { GuildList } from '../../guild/bean/GuildList'
import { GuildListItemBean } from '../../guild/bean/GuildListItemBean'
import { UserGuildApply } from '../../guild/bean/UserGuildApply'
import { GuildMemberRef } from '../../guild/ref/GuildMemberRef'
import { GuildRef } from '../../guild/ref/GuildRef'
import { BPropBean } from '../../mail/bean/BPropBean'
import { MailItemBean } from '../../mail/bean/MailItemBean'
import { MailLocalization } from '../../mail/language/MailLocalization'
import { MailInboxRepository } from '../../mail/persistence/MailInboxRepository'
import { MailStateAccess } from '../../mail/state/MailStateAccess'
import { HUTask } from '../../task/bean/HUTask'
import { ReqGetUserInfo, ResGetUserInfo } from '../UserC2S'
import { User } from '../bean/User'
import { UserProfileFormatter } from './UserProfileFormatter'
import { UserServerSnapshot } from './UserServerSnapshot'

/** 定义一个可能包含Mod属性和其他属性的类型 */
type PossibleModKeys = keyof Mod | 'hUTask'

/**
 * 所有同步数据模块数据的填充方法
 * 注意:
 * 1.Hash如果为Mod,必须在这边定义加载方法.
 * 2.Hash内的属性Mod,在引擎层会自动加载,无需定义.如果有特殊数据处理,可以在这里定义并返回Hash对象
 * 3.Key为Mod中的字段名,Value为填充方法
 * 4.Key可以不在Mod中,因为Hash层可以不是Mod,但是Mod是定义在Hash属性中的,所以需要有一个数据加载方法(比较少)
 */
const ModSetter: { [K in PossibleModKeys]?: (user: User) => Promise<RootBean | undefined | null> } = {
    user: async (user: User) => user,
    hUTask: async (user: User) => HUTask.load(user.id),
    hServer: async (user: User) => UserServerSnapshot.load(user.sId, false),
    friend: async (user: User) => {
        const friend = await ActionFriend.load(user.id, false)
        if (!friend) {
            return
        }
        await ActionFriend.setModdoList(friend)
        return friend
    },
    guild: async (user: User) => {
        if (user.guild == 0) {
            return
        }
        return ActionGuild.modSetGuild(user.guild)
    },
    guildList: async (user: User) => {
        const guildList = await CenterGuildModel.find({
            where: {
                sid: user.sId,
            },
        })
        const gIds: int[] = []
        guildList.forEach((e) => {
            gIds.push(e.guildId)
        })
        const gl = new GuildList(0)
        const guildApply = await UserGuildApply.load(user.id)
        const guildRefs = await GuildRef.loadAll(gIds)
        for (const [, guildRef] of guildRefs) {
            if (!guildRef.id) continue
            if (guildRef.isDissolution) continue
            const guildItem = new GuildListItemBean(guildRef.id)
            guildItem.id = guildRef.id
            guildItem.lv = guildRef.lv
            guildItem.name = guildRef.name
            guildItem.num = guildRef.members?.size() ?? 0
            guildItem.power = guildRef.power
            guildItem.open = guildRef.open
            guildItem.isApply = guildApply?.records.has(guildRef.id) ? 1 : 0
            guildItem.head = guildRef.head
            gl.l.set(guildItem.id, guildItem)
        }
        return gl
    },
    guildApply: async (user: User) => {
        if (user.guild == 0) {
            return
        }
        const bean = await Guild.load(user.guild)
        const uIds = bean?.applyMembers.keys() ?? []
        if (uIds.length > 0) {
            const userRefs = await GuildMemberRef.loadAll(uIds)
            for (const [, userRef] of userRefs) {
                const apply = new GuildApply(userRef.id)
                apply.userInfo = UserProfileFormatter.format(userRef)
                bean?.guildApply.set(userRef.id, apply)
            }
        }
        return bean
    },
    activity: async (user: User) => {
        return ActivityClientAssembler.pbFormatActivity(user)
    },
    mail: async (user: User) => {
        const mails = await MailInboxRepository.getUserMailAll(user.id)
        if (mails.length == 0) {
            return
        }
        for (const mail of mails) {
            const mailItem = new MailItemBean({
                mId: mail.mId,
                userId: Number(mail.userId),
                mType: mail.mType,
                mFrom: mail.mFrom,
                mFromName: mail.mFromName,
                mFromCid: mail.mFromCid,
                mTitle: MailLocalization.getValueByUserLanguage(user.language, mail.mTitle),
                mContent: MailLocalization.getValueByUserLanguage(user.language, mail.mContent),
                mIsAward: mail.mIsAward,
                mIsRead: mail.mIsRead,
                mDateline: mail.mDateline,
                mParams: mail.mParams,
                mPastTime: mail.mPastTime,
            })

            let awardStr = ''
            if (mail.mAward) {
                awardStr = mail.mAward.replaceAll('\\n', '')
            } else if (mail.mAwardShow) {
                awardStr = mail.mAwardShow
            }
            let awards: MailPropItem[] = []
            if (awardStr) {
                awards = JSON.parse(awardStr)
                if (awards.length > 0) {
                    for (const award of awards) {
                        const propId = award.propId
                        const num = award.num
                        if (!propId || !num) {
                            continue
                        }
                        mailItem.awards.set(mailItem.awards.maxKey() + 1, new BPropBean({ propId: propId, num: num }))
                    }
                }
            }
            const mailInfo = MailStateAccess.getMod(user)
            mailInfo.mails.set(mailItem.mId, mailItem)
        }
        return user
    },
}

/**
 * 登录时候给的模型数据
 */
const LOGIN_MODS: (keyof Mod)[] = [
    'user',
    'bag',
    'redDot',
    'redDotList',
    'title',
    'activity',
    'tq',
    'friend',
    'mail',
    'guildList',
    'guild',
    'guildApply',
    'mission',
    'hServer',
    'weapon',
    'equip',
]

/**
 * 获取玩家信息
 */
export class ActionGetUserInfo extends GameAction {
    async doAction(req: ReqGetUserInfo, res: ResGetUserInfo) {
        const user = this.user

        // 本次响应已显式返回全部模块数据，禁止框架再自动组装一份变更通知重复推送。
        ModSync.modNotForNet()

        if (req.mods.length == 0) {
            req.mods = LOGIN_MODS
        }
        const modData: { [key: string]: any } = { versions: {} }
        await AutoSetMod(user, req, modData)
        res.mod = modData
    }
}

async function AutoSetMod(user: User, req: ReqGetUserInfo, resMod: { [key: string]: any }) {
    const mods = req.mods as string[]
    const versions = req.versions ?? []

    const hashMap: { [K in PossibleModKeys]?: RootBean } = {
        user: user,
    }

    for (let i = 0; i < mods.length; i++) {
        const mod = mods[i]
        const modInfo = ModInfoRegistry.mods[mod]
        if (!modInfo) {
            throw SystemErrors.SysModNameError.params({ vars: { name: mod } })
        }

        // 加载hash数据对象
        let beanLoaded = undefined
        if (mod in ModSetter) {
            beanLoaded = await ModSetter[mod as PossibleModKeys]!(user)
            if (beanLoaded) {
                hashMap[mod as PossibleModKeys] = beanLoaded
            }
        } else {
            beanLoaded = hashMap[modInfo.modName as PossibleModKeys]
            // 自动加载hashMod方法
            if (!beanLoaded) {
                if (modInfo.modName in ModSetter) {
                    beanLoaded = await ModSetter[modInfo.modName as PossibleModKeys]!(user)
                } else {
                    throw SystemErrors.SysModNameError.params({ vars: { name: mod } })
                }
            }
        }

        if (!beanLoaded) {
            resMod[mod] = {}
            resMod.versions[mod] = 0
            continue
        }

        const toMod = beanLoaded.toModData(false, new Map([[modInfo.subMod ?? '_self', versions[i] ?? 0]]))
        // 子mod
        if (toMod?._subMods) {
            for (const [subName, subMod] of Object.entries(toMod._subMods)) {
                resMod.versions[subName] = beanLoaded.__versions![subName]
                resMod[subName] = subMod
            }
            delete toMod._subMods
        }
        // 父mod
        if (toMod && Object.keys(toMod).length > 0) {
            resMod[mod] = toMod
            resMod.versions[mod] = beanLoaded.__version
        }
    }
}
