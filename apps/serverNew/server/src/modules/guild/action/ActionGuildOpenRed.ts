import { timestamp } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { GameIdGenerator } from '../../../runtime/identity/GameIdGenerator'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { PropBean } from '../../props/bean/PropBean'
import { Props } from '../../props/inventory/Props'
import { UserErrors } from '../../user/UserErrors'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'
import { User } from '../../user/bean/User'
import { ReqGuildOpenRed, ResGuildOpenRed } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { Guild } from '../bean/Guild'
import { GuildRedItem } from '../bean/GuildRedItem'
import { GuildRedRecordItem } from '../bean/GuildRedRecordItem'
import { ActionGuild } from './ActionGuild'

interface GuildRedAwardRule {
    type: int
    min: int
}

/**
 * 山头红包
 */
export class ActionGuildOpenRed extends ActionGuild {
    /** 捐献红包 */
    static readonly RED_TYPE_DONATE = 1

    /** 打开方式-均分 */
    static readonly RED_OPEN_TYPE_AVG = 1

    async doAction(req: ReqGuildOpenRed, res: ResGuildOpenRed) {
        const redId = req.id

        const guild = await Guild.load(this.user.guild)
        if (!guild) {
            throw SystemErrors.SysParamErr
        }

        const redItem = guild.reds.get(redId)
        if (!redItem) {
            throw SystemErrors.SysParamErr
        }

        if (redItem.time + Param.GuildRedEnvelopeOverTimes < timestamp()) {
            throw GuildErrors.GuildExpiredRed
        }

        await this.checkTimes(this.user, redItem.cId)

        if (redItem.records.size() >= redItem.maxNum) {
            throw GuildErrors.GuildNoNum
        }
        if (redItem.records.has(this.user.id)) {
            throw GuildErrors.GuildHasOpened
        }

        const awards = await ActionGuildOpenRed.getAwards(redItem, this.user)
        await Props.addProps(this.user, awards, res.awards)
    }

    private async checkTimes(user: User, redId: int) {
        const envelopeConf = C.guild_red_envelope(redId)

        if (envelopeConf.type === ActionGuildOpenRed.RED_TYPE_DONATE) {
            if (user.openRedTimes >= Param.GuildRedEnvelopeTimes) {
                throw GuildErrors.GuildNoRedTimes
            }
            user.openRedTimes++
            return
        }

        if (user.openBossRedTimes >= Param.GuildBossEnvelopeTimes) {
            throw GuildErrors.GuildNoRedTimes
        }
        user.openBossRedTimes++
    }

    /**
     * 发红包
     * @param guild
     * @param fromId
     * @param cId 红包配置id
     * @param maxNum
     * @param stage
     * @returns
     */
    static async addRed(guild: Guild, fromId: int, cId: int, maxNum: int = 0, stage: int = 0) {
        const redItem = new GuildRedItem()
        redItem.uId = fromId
        redItem.cId = cId
        redItem.time = timestamp()

        const user = await User.loadOnlyRead(fromId)
        if (!user) {
            throw UserErrors.UserHUserError
        }
        redItem.uInfo = UserProfileFormatter.format(user)
        redItem.stage = stage

        const conf = C.guild_red_envelope(cId)
        if (!maxNum) {
            // 没有配置固定数量，根据传入的参与人数
            redItem.maxNum = conf.times
        } else {
            redItem.maxNum = maxNum
        }
        redItem.chatId = await GameIdGenerator.getUniqueId(GameIdGenerator.CHAT_UNIQUE_ID)

        // 记录红包奖励内容
        for (let i = 0; i < conf.awards.length; i++) {
            const awardsConf = conf.awards[i]
            const propBean = new PropBean()
            propBean.propId = awardsConf.propId
            propBean.num = awardsConf.num
            propBean.data = JSON.stringify({ type: awardsConf.type, min: awardsConf.minNum })
            redItem.awards.set(i + 1, propBean)
        }

        guild.reds.set(redItem.cId, redItem)
        return redItem
    }

    /**
     * 获取打开的红包的奖励
     * @param redItem
     * @param user
     * @returns
     */
    static async getAwards(redItem: GuildRedItem, user: User) {
        // 剩下的红包数量
        const leftTimes = redItem.maxNum - redItem.records.size()

        const awards = []

        let isLuckyRed = false
        for (const [, award] of redItem.awards) {
            let addNum = 0
            const data: GuildRedAwardRule = JSON.parse(award.data)
            if (data.type === this.RED_OPEN_TYPE_AVG) {
                // 均分
                addNum = Math.floor(award.num / leftTimes)
            } else {
                // 拼手气
                addNum = this.getRedPacket(leftTimes, award.num, data.min)
                isLuckyRed = true
            }

            awards.push({ propId: award.propId, num: addNum })
            award.num -= addNum
        }

        // 领奖记录
        const recordItem = new GuildRedRecordItem({
            uId: user.id,
            time: timestamp(),
            awards: JSON.stringify(awards),
        })
        recordItem.uInfo = UserProfileFormatter.format(user)
        redItem.records.set(recordItem.uId, recordItem)

        //  计算手气最佳
        if (isLuckyRed && redItem.records.size() === redItem.maxNum) {
            await this.calBest(redItem, user.guild)
        }

        return awards
    }

    /**
     * 二倍均值法计算抢到的红包金额
     * @param leftTimes
     * @param leftNum
     * @param min
     * @returns
     */
    static getRedPacket(leftTimes: int, leftNum: int, min: int) {
        // 仅剩下一个红包，直接给剩下全部金额
        if (leftTimes === 1) {
            return leftNum
        }

        const rand = GameRandom.rand(min, leftNum)

        // 剩下的红包二倍均值
        const doubleAvg = Math.floor((leftNum * 2) / leftTimes)

        return Math.min(doubleAvg, rand)
    }

    static async checkRedExpire(hGuild: Guild) {
        for (const [, red] of hGuild.reds) {
            // 还未过期的跳过
            if (red.time + Param.GuildRedEnvelopeOverTimes > timestamp()) {
                continue
            }
            hGuild.reds.delete(red.id)
        }
    }

    /**
     * 计算手气最佳
     * @param redItem
     * @param guildId
     */
    static async calBest(redItem: GuildRedItem, guildId: int) {
        const redConf = C.guild_red_envelope(redItem.cId)
        // 以第一个奖励id为准
        const bestPropId = redConf.awards[0].propId

        const rankArr: Map<int, int> = new Map()
        for (const [, record] of redItem.records) {
            const decodeAwards = JSON.parse(record.awards)
            /** @var PropBean decodeAward */
            for (const decodeAward of decodeAwards) {
                if (decodeAward.propId !== bestPropId) {
                    continue
                }
                rankArr.set(record.uId, decodeAward.num)
            }
        }

        const entries: [number, number][] = [...rankArr.entries()]
        entries.sort((a, b) => b[0] - a[0])
        const keys: number[] = entries.map(([key]) => key)

        const bestUid = keys[0]
        const worstUid = keys[keys.length - 1]

        // const bestUser = await User.loadOnlyRead(bestUid);
        // if (bestUser) {
        //     // 推送手气最佳消息
        //     Push.sendSystemInfoById(SystemInfoDefine.GuildRedBest_100,
        //         [
        //             [SystemInfoDefine.PARAM_DEFAULT, redConf.name],
        //             [SystemInfoDefine.PARAM_DEFAULT, bestUser.name],
        //         ],
        //         [Push.ARGS_GUILD_ID, guildId])
        // }
    }

    /**
     * 山头红包每日重置
     * @param user
     */
    static async resetDailyOpenTimes(user: User) {
        user.openBossRedTimes = 0
        user.openRedTimes = 0
    }
}
