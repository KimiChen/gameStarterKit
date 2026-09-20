import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { AttributeScale } from '../../attr/rules/AttributeScale'
import { ReqGuildBargain } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { Guild } from '../bean/Guild'
import { ActionGuild } from './ActionGuild'

/**
 * 砍价
 */
export class ActionGuildBargain extends ActionGuild {
    async doAction(req: ReqGuildBargain, res: ResDefault) {
        // 未加入联盟
        const guild = await Guild.load(this.user.guild)
        if (!guild) {
            throw SystemErrors.SysParamErr
        }

        // 检测重置礼包
        await ActionGuild.checkGuildRestGift(guild)
        await ActionGuild.checkUserRestGift(this.user)

        const conf = C.guild_gift(ActionGuild.GUILD_GIFT)

        // 检查是否在砍价期间
        if (!ActionGuild.isCutTime(guild, conf)) {
            throw GuildErrors.GuildNotCutTime
        }

        // 个人砍价次数限制
        if (this.user.dayBargainTimes >= Param.playerDailyCutTimes) {
            throw GuildErrors.GuildNoCutTimes
        }

        // 联盟砍价次数限制
        if (guild.bargainTimes >= C.guild(guild.lv).count) {
            throw GuildErrors.GuildNoCutTimes
        }

        // 原价
        const oriPrice = conf.gifts.get(guild.giftId).costNum
        // 当前价格比例(百分比)
        const curPricePer = (guild.giftPrice / oriPrice) * 100

        const [cutNum, cutPer] = this.getDiscount(curPricePer)

        const before = guild.giftPrice
        const total = Math.floor((oriPrice * cutPer) / AttributeScale.NUMBER_RATIO) + cutNum

        let isSend = false
        if (guild.giftPrice > 0 && total >= guild.giftPrice) {
            isSend = true
        }

        guild.giftPrice -= total
        guild.bargainTimes++
        this.user.dayBargainTimes++

        // 砍价记录
        // GuildBargainLogs.addLog(this.user, 0,
        //     [
        //         'uId'    => this.uId,
        //         'name'   => this.user.name,
        //         'cutNum' => total,
        //         'isBuy'  => false,
        //     ]
        // );

        // 推送change
        // MessageNotice.pushChangeToUser(guild, guild.members.keys());

        // TaModuleGuild.guildGift(this.user, guild, before, guild.giftPrice);

        if (isSend) {
            // 砍到0元的通知
            // Push.sendSystemInfoById(SystemInfoDefine.GuildBargain_117,
            //     [],
            //     [
            //         Push.ARGS_GUILD_ID => guild.id,
            //         Push.ARGS_HUSER => HUser.loadOnlyRead(guild.leaderId)
            //     ]
            // );
        }

        // 任务更新
        // TaskHelper.update(this.user, 1, TaskDefine.TARGET_1085_BARGAIN);
    }

    /**
     * 根据当前价格计算折扣
     */
    getDiscount(curPricePer: int) {
        // 砍价万分比
        let cutPer = 0
        // 砍价固定值
        let cutNum = 0
        for (const cutConf of C.guild_gift(ActionGuild.GUILD_GIFT).cutRule) {
            const [min, max] = cutConf.priceStage

            // 不在对应价格区间的跳过
            if (curPricePer <= min || curPricePer > max) {
                continue
            }

            cutNum = GameRandom.rand(cutConf.cutNum[0], cutConf.cutNum[1])

            // 砍价万分比
            cutPer = GameRandom.rand(cutConf.cutPer[0], cutConf.cutPer[1])
        }

        return [cutNum, cutPer]
    }
}
