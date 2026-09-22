import { UtilTime, strtotime, timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { User } from '../../user/bean/User'
import { UserBaseRef } from '../../user/ref/UserBaseRef'
import { SceneCache } from '../../scene/bean/SceneCache'
import { MissionConfigIndex } from '../config/MissionConfigIndex'
import { ModuleOpenType } from '../../user/access/ModuleOpenType'
import { AwardResponse } from '../../../runtime/protocol/C2S/commom'
import { Props } from '../../props/inventory/Props'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'
import { UserServerSnapshot } from '../../user/action/UserServerSnapshot'
import { UserInfoOnlyNetBean } from '../../../../generated/protocol/server/C2S/mod/user/UserInfoOnlyNetBean'
import { RankAwardSelection } from '../rules/RankAwardSelection'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { MissionItem } from '../bean/MissionItem'
import { MissionBossView } from './MissionBossView'

export class ActionMission extends GameAction {
    /**
     * 夔牛场景固定类型
     */
    static readonly TYPE_KUI_COW = 9999

    /**
     * 历练个人信息每日重置
     * @param user
     */
    static dayInit(user: User) {
        for (const [type, mission] of user.mission.missions) {
            if (!C.mission().has(type)) {
                continue
            }
            const freeNum = C.mission(type).times
            const settleNum = RankAwardSelection.calLeftTimes(
                mission.challenge,
                freeNum,
                mission.buyNum,
                mission.settleNum,
            )

            mission.buyNum = 0
            mission.challenge = 0
            mission.settleNum = settleNum
        }
    }

    /**
     * 获取历练个人信息
     * @param user
     * @param type
     * @param init
     * @returns
     */
    static getMissionItem(user: User, type: int, init: boolean = true): MissionItem {
        let item = user.mission.missions.get(type)
        if (!item) {
            item = new MissionItem({ type: type })
        }
        if (init) {
            user.mission.missions.set(type, item)
        }
        return item
    }

    static async formatBossView(sceneId: string, cId: int, type: int, roomId: int): Promise<MissionBossView> {
        let cache: SceneCache | undefined
        if (type == ActionMission.TYPE_KUI_COW) {
            cache = (await SceneCache.load(sceneId, ModuleOpenType.SYS_KUICOW.toString())) ?? undefined
        } else {
            cache = (await SceneCache.load(sceneId, ModuleOpenType.SYS_MISSION.toString())) ?? undefined
        }

        const lastOwnerUId = cache?.lastOwnerUId ?? 0
        const bossBlood = this.getBossLeftHp(type, cId, cache)
        const playerNum = 0
        let dieTime = 0
        if (bossBlood <= 0 && cache?.actors.has(1)) {
            dieTime = cache.actors.get(1)!.deadTime
        }

        const mapId = type == ActionMission.TYPE_KUI_COW ? Param.KuiCowMap : cId
        let ownerInfo: UserInfoOnlyNetBean | undefined = undefined
        if (lastOwnerUId > 0) {
            const ownerUser = await User.loadOnlyRead(lastOwnerUId)
            if (ownerUser) {
                ownerInfo = UserProfileFormatter.format(ownerUser).toModData() as any
            }
        }

        const bossView: MissionBossView = {
            id: mapId,
            hp: bossBlood,
            owner: ownerInfo,
            personNum: playerNum,
            dieTime: dieTime,
            roomId: roomId,
        }

        return bossView
    }

    /**
     * 获取个人历练boss信息，客户端用
     * @param user
     * @param type
     * @returns
     */
    static async getPersonnelBoss(user: User, type: int) {
        const list: MissionBossView[] = []
        for (const [, item] of C.mission(type).more) {
            // 获取当前地图房间记录
            // room = Scene.getMissionRoom(user, type, item.mapId)
            const sceenId = ''
            const cId = item.mapId
            const roomId = 1
            // 生成下发Boss数据
            list.push(await this.formatBossView(sceenId, cId, type, roomId))
        }

        return list
    }

    /**
     * 获取活动历练boss信息，客户端用
     * @param user
     * @returns
     */
    static async getKuiCowBoss(user: User) {
        const hServer = await UserServerSnapshot.load(user.sId)
        // 未解锁活动boss
        if (hServer.currKuiCowLv <= 0) {
            return undefined
        }

        const now = timestamp()
        const [openTime, endTime] = this.getKuiCowTimeRange(now)
        if (now < openTime || now > endTime) {
            // 非活动期间
            return undefined
        }

        // 获取绑定的夔牛房间
        // const room = Scene.getKuiCowRoom(user);
        const sceneId = ''
        const roomId = 1

        // 下发Boos数据
        const bossView = await this.formatBossView(sceneId, hServer.currKuiCowLv, ActionMission.TYPE_KUI_COW, roomId)
        return [bossView]
    }

    /**
     * 获取夔牛活动开始、结束时间
     * @param time
     * @returns
     */
    static getKuiCowTimeRange(time = 0) {
        const dayStartTime = UtilTime.getDayStartTime(time)
        // 历练时段
        const startTime = dayStartTime + Param.KuiCowStart * 3600
        const endTime = startTime + Param.KuiCowTime
        return [startTime, endTime]
    }

    /**
     * 刷新活动历练boss
     * @param sId
     * @returns
     */
    static async refreshKuiCowBoss(sId: int) {
        const hServer = await UserServerSnapshot.load(sId, false)
        let kuiCowOpenId = hServer.kuiCowOpenId
        let cowNexOpenId = kuiCowOpenId + 1

        const allUser = await UserBaseRef.loadAll([sId])

        const realmArr: { [key: int]: int } = {}
        for (const [, user] of allUser) {
            if (realmArr[user.realm]) {
                realmArr[user.realm]++
            } else {
                realmArr[user.realm] = 1
            }
        }

        while (C.kui_cow_open().has(cowNexOpenId)) {
            const conf = C.kui_cow_open(cowNexOpenId)
            const nextNeedLv = conf.realmId
            let num = 0

            for (const realm in realmArr) {
                if (Int(realm) >= nextNeedLv) {
                    num += realmArr[realm]
                }
            }

            if (num < conf.needNum) {
                break
            }

            kuiCowOpenId = cowNexOpenId
            cowNexOpenId++
        }

        if (kuiCowOpenId <= 0) {
            return false
        }

        hServer.kuiCowOpenId = kuiCowOpenId
        hServer.currKuiCowLv = C.kui_cow_open(kuiCowOpenId).monsterLv

        return kuiCowOpenId
    }

    /**
     * getBossLeftHp
     * @param cache
     * @param type
     * @param cId
     * @returns
     */
    static getBossLeftHp(type: int, cId: int, cache?: SceneCache): int {
        if (type == ActionMission.TYPE_KUI_COW) {
            return this.getKuiCowLeftHp(cId, cache)
        } else {
            const mapId = cId
            const monsterId = C.mission(type).more.get(mapId).monsterId

            const leftHp = C.monster(monsterId).hp
            if (cache == null || !cache.actors.has(1)) {
                return leftHp
            }

            const cacheActor = cache.actors.get(1)!
            if (!cacheActor.isDead) {
                return cacheActor.leftHp
            }

            const dieTime = cacheActor.deadTime ?? 0
            const refTime = cacheActor.rebornTime ?? 0
            if (!dieTime || this.isBossReset(mapId, dieTime, refTime)) {
                return leftHp
            }
            return 0
        }
    }

    /**
     * 获取夔牛剩余血量
     * @param cache
     * @param cId
     * @returns
     */
    static getKuiCowLeftHp(cId: int, cache?: SceneCache): int {
        const monsterId = C.kui_cow(cId).monsterId

        const leftHp = C.monster(monsterId).hp
        if (cache == null || !cache.actors.has(1)) {
            return leftHp
        }

        const cacheActor = cache.actors.get(1)!
        if (!cacheActor.isDead) {
            return cacheActor.leftHp
        }

        const dieTime = cacheActor.deadTime
        const nextResetTime = this.findNextResetTime(Param.KuiCowMap, dieTime)
        if (timestamp() >= nextResetTime) {
            return leftHp
        }

        return 0
    }

    /**
     * 判断boss 是否已经复活
     * @param mapId   地图id
     * @param dieTime 死亡时间
     * @param refTime 复活时间
     * @return
     */
    static isBossReset(mapId: int, dieTime: int, refTime: int) {
        const nextResetTime = this.bossNextResetTime(mapId, dieTime, refTime)
        if (timestamp() >= nextResetTime) {
            return true
        }
        return false
    }

    /**
     * 获取boss离现在最近的一次复活时间
     * @param mapId
     * @param dieTime
     * @param refTime
     * @returns
     */
    static bossNextResetTime(mapId: int, dieTime: int, refTime = 0) {
        // 获取地图id对应历练类型
        const missTYpe = MissionConfigIndex.missionMapIdToType[mapId]

        // 历练配置
        const missConf = C.mission(missTYpe)

        // 死亡后重生时间（秒）（-1则，按固定时间刷新）
        const resetCd = missConf.more.get(mapId).resetCd

        if (resetCd >= 0) {
            // 采用cd复活逻辑
            return dieTime + resetCd
        } else {
            return this.findNextResetTime(mapId, dieTime, refTime)
        }
    }

    /**
     * 查找下一个重置时间点
     * @param mapId
     * @param dieTime
     * @param refTime
     * @returns
     */
    static findNextResetTime(mapId: int, dieTime: int, refTime = 0) {
        let now = timestamp()
        if (refTime) {
            if (refTime < now) {
                return refTime
            } else {
                now = refTime
            }
        }
        // 采用固定时间点刷新
        const startTime = strtotime(UtilTime.formatYMD(now))
        for (const time of MissionConfigIndex.missionResetTime[mapId]) {
            const resetTime = time + startTime
            if (dieTime > resetTime) {
                continue
            }
            if (resetTime > now) {
                return resetTime
            }
        }
        return 0
    }

    /**
     * 获取夔牛活动历练截止时间
     * @returns
     */
    static getKuiCowStopTime(): int {
        return strtotime(UtilTime.formatYMD(timestamp())) + Param.KuiCowStart * 3600 + Param.KuiCowTime
    }

    /**
     * 获取玩家可挑战次数
     * @param user
     * @param type
     * @returns
     */
    static getChallengeAbleTimes(user: User | MissionItem, type: int): int {
        let missionItem: MissionItem
        if (user instanceof User) {
            missionItem = this.getMissionItem(user, type, false)
        } else {
            missionItem = user
        }
        if (type === ActionMission.TYPE_KUI_COW) {
            return missionItem.challenge > 0 ? 0 : 1
        }
        const freeTime = C.mission(type).times
        return freeTime + missionItem.settleNum + missionItem.buyNum - missionItem.challenge
    }

    /**
     * 手动|邮件-领取非归属奖励
     * @param user
     * @param byMail
     * @param awardResp
     * @returns
     */
    static async pickUpAwards(user: User, byMail: boolean, awardResp?: AwardResponse) {
        // 判断地图
        const mapId = user.mission.missionAwardsMapId
        if (!mapId) {
            return
        }

        // 获取到历练类型
        const missionType = MissionConfigIndex.missionMapIdToType[mapId]

        // 获取历练bossId
        const missionConf = C.mission(missionType)
        const moreConf = missionConf.more.get(mapId)

        // 非归属者补偿概率掉落
        /** @var MissionMoreOffsetAwardsConf offsetAwards */
        const offsetAwards = GameRandom.randomByWeightConfig(moreConf.offsetAwards)
        if (!offsetAwards || !offsetAwards.propId) {
            return
        }

        // 设置已领取
        user.mission.missionAwardsMapId = 0

        // 发放奖励
        if (!byMail) {
            // 直接获得奖励
            await Props.addProps(user, [offsetAwards], awardResp)
        } else {
            // const monsterConf = C.monster(moreConf.monsterId)
            // 奖励通过邮件发送
            // Push.sendSystemInfoById(
            //     SystemInfoDefine.MissionPickUpAwards,
            //     [
            //         [SystemInfoDefine.PARAM_DEFAULT, missionConf.name],
            //         [SystemInfoDefine.PARAM_REALM, monsterConf.realm],
            //         [SystemInfoDefine.PARAM_MONSTER, moreConf.monsterId],
            //     ],
            //     [Push.ARGS_AWARDS => [offsetAwards], Push.ARGS_UIDS => [user.id]]
            // );
        }
    }
}
