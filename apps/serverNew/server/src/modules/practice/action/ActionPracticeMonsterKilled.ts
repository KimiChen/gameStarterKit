import { Map2Array, log, timestamp } from '@arthropoda/game-engine'
import { PropItem } from '../../../runtime/protocol/C2S/commom'
import { Award } from '../../props/award/Award'
import { PropBean } from '../../props/bean/PropBean'
import { Props } from '../../props/inventory/Props'
import { TaskDefine } from '../../task/rules/TaskDefine'
import { ReqPracticeMonsterKilled, ResPracticeMonsterKilled } from '../PracticeC2S'
import { ActionPractice } from './ActionPractice'

/**
 * 击杀怪物
 */
export class ActionPracticeMonsterKilled extends ActionPractice {
    async doAction(req: ReqPracticeMonsterKilled, res: ResPracticeMonsterKilled) {
        const user = this.user
        const practiceItem = ActionPractice.getPracticeItem(user)
        let killedNum = req.killedNum
        const npcAtkTimes = req.npcAttackTimes
        // 不在修炼内不可请求
        if (!user.practice.practiceId) {
            return
        }

        // TODO:主线任务
        // const isAfterMainTaskId = user.mainTaskId > Param.SteriousManTransMainTaskId
        //
        // if (npcAtkTimes + user.practiceNpcTimes > user.practiceNpcTimesLimit && $isAfterMainTaskId) {
        //     throw SystemErrors.SysParamError
        // }

        if (killedNum > practiceItem.monsterNum) {
            log.info('修炼杀怪奖励异常', [
                '前端击杀数量' + killedNum,
                '后端剩余数量' + practiceItem.monsterNum,
                '地图' + practiceItem.id,
            ])
            killedNum = practiceItem.monsterNum
        }

        for (const killedAward of req.killedAwards ?? []) {
            const awardItem = new PropBean({ propId: killedAward.propId, num: killedAward.num })
            if (
                !practiceItem.preAwards.has(awardItem.propId) ||
                practiceItem.preAwards.get(awardItem.propId)!.num < awardItem.num
            ) {
                // 前端奖励异常
                log.info('修炼杀怪奖励异常', [
                    '玩家uId' + user.id,
                    '前端请求数量' + awardItem.num,
                    '后端剩余数量' + practiceItem.preAwards.get(awardItem.propId)
                        ? practiceItem.preAwards.get(awardItem.propId)?.num
                        : 0,
                    '物品' + awardItem.propId,
                ])
                continue
            }
            // 将预奖励放入可领取列表
            practiceItem.preAwards.get(awardItem.propId)!.num -= awardItem.num
            // 数量为0移除预掉落奖励
            if (practiceItem.preAwards.has(awardItem.propId)) {
                if (practiceItem.preAwards.get(awardItem.propId)!.num == 0) {
                    practiceItem.preAwards.delete(awardItem.propId)
                }
            }
            const awa: IConfPracticeLittleMonsterAward2 = {
                id: 0,
                pro: 0,
                propId: awardItem.propId,
                num: awardItem.num,
            }
            ActionPractice.addKilledAwards(user, practiceItem, [awa], res)
        }
        const awards: Map<int, PropItem> = new Map<int, PropItem>()
        const practiceConf = C.practice(user.practice.practiceId)
        // 点击收益根据境界给
        const clickAwards = C.sterious_man_through(user.practice.practiceNpcBreakLv).click
        // 合并NPC点击奖励
        Award.mergeAwards(awards, clickAwards)
        // 小怪固定掉落奖励
        Award.mergeAwards(awards, practiceConf.littleMonsterAward1)

        // 过了指定主线id 才有奖励
        if (awards.size > 0) {
            await Props.addProps(user, Map2Array(awards)!)
        }
        // 更新杀敌数，和时间
        practiceItem.monsterNum -= killedNum
        user.practice.settledKilledTime = timestamp()

        // TODO:制定主线剧情之后才开始计算次数限制
        // eslint-disable-next-line no-constant-condition
        if (1) {
            user.practice.practiceNpcTimes += npcAtkTimes
        }

        const taskParams: int[][] = []

        // 检查是否可打轮次BOSS
        const turnConf = practiceConf.more.get(practiceItem.turnId)

        if (practiceItem.id !== ActionPractice.PRACTICE_ID_1001) {
            if (
                !practiceItem.canTurnBoss &&
                !practiceItem.isFinish &&
                practiceItem.monsterNum <= 0 &&
                practiceItem.waveId === turnConf.waveOrder
            ) {
                practiceItem.canTurnBoss = 1
                taskParams[taskParams.length] = [
                    practiceItem.turnId,
                    TaskDefine.TARGET_1066_PRACTICE_TURN,
                    practiceItem.id,
                    0,
                ]
            }
        }

        if (npcAtkTimes > 0) {
            taskParams[taskParams.length] = [npcAtkTimes, TaskDefine.TARGET_1061_PARTNER_ATK, 0, 0]
        }

        if (taskParams.length > 0) {
            // TODO: 任务
        }

        return
    }
}
