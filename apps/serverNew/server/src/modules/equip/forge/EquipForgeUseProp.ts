import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { Props } from '../../props/inventory/Props'
import { EquipDefine } from '../rules/EquipDefine'
import { EquipForge } from './EquipForge'

export class EquipForgeUseProp extends EquipForge {
    // #region 炼器执行流程
    /**
     * 重组装备池
     * @return void
     */
    rebuildPool(): void {
        // 重组品质随机池
        // 使用类型
        let useType = this.poolConf.specialCost.get(this.propUseId).useType
        switch (useType) {
            case EquipForge.USE_TYPE_2:
                // 炼器必定获得红色品质的装备
                for (const item of this.poolConf.qualityInfo) {
                    this.qualityPoolsAddPro(EquipDefine.QUALITY_RED, item.pro)
                }
                break
            case EquipForge.USE_TYPE_3:
                for (const item of this.poolConf.qualityInfo) {
                    // 炼器可保证必定获得橙色及以上品质的装备
                    if (item.type <= EquipDefine.QUALITY_ORANGE) {
                        this.qualityPoolsAddPro(EquipDefine.QUALITY_ORANGE, item.pro)
                    } else {
                        this.qualityPoolsAddPro(item.type, item.pro, true)
                    }
                }
                break
            case EquipForge.USE_TYPE_4:
                for (const item of this.poolConf.qualityInfo) {
                    // 炼器可保证必定获得金色及以上品质的装备
                    if (item.type <= EquipDefine.QUALITY_GOLD) {
                        this.qualityPoolsAddPro(EquipDefine.QUALITY_GOLD, item.pro)
                    } else {
                        this.qualityPoolsAddPro(item.type, item.pro, true)
                    }
                }
                break
            default:
                // 随机品质
                for (const item of this.poolConf.qualityInfo) {
                    this.qualityPoolsAddPro(item.type, item.pro, true)
                }
                break
        }

        // 重组装备池
        useType = this.poolConf.specialCost.get(this.propUseId).useType
        const lvRange = this.poolConf.lvRange.get(this.lvRangeId)
        for (const qualityPool of lvRange.qualityPool) {
            if (!this.rebuildQualityPools.has(qualityPool.type)) {
                continue
            }
            for (const equip of qualityPool.equip) {
                // 装备配置
                const equipConf = C.equip(equip.equipId)
                // 炼器可保证必定获得当前阶段最高等级的装备
                if (useType == EquipForge.USE_TYPE_1 && equipConf.level != lvRange.maxLv) {
                    continue
                }
                this.rebuildPools.get(qualityPool.type)?.set(equip.equipId, equip.pro)
            }
        }
    }

    /**
     * 执行打造逻辑
     */
    async draw(): Promise<void> {
        // 开始打造
        for (let i = 0; i < this.drawCount; i++) {
            // 随机品质
            const qId = GameRandom.randomByWeight(this.rebuildQualityPools)
            if (qId == null) {
                throw SystemErrors.SysConfErr
            }

            // 品质池校验
            const pools = this.rebuildPools.get(qId)
            if (pools == null) {
                throw SystemErrors.SysConfErr
            }

            // 根据权重随机出来cardId
            this.drawCId = GameRandom.randomByWeight(pools) ?? 0

            // 重置最新卡配置
            this.updateEquipConfig()

            // 解锁新装备集合
            let forgeEquip = this.forgeEquips.get(this.drawCId)
            if (forgeEquip == null) {
                forgeEquip = { propId: this.drawCId, num: 1 }
                this.forgeEquips.set(this.drawCId, forgeEquip)
            } else {
                forgeEquip.num += 1
            }

            // 跑马灯推送
            this.ledSend()
        }

        // 获得新装备
        if (this.forgeEquips.size > 0) {
            // 获得卡
            await Props.addProps(this.user, Array.from(this.forgeEquips.values()), this.pbRes)
        }
    }
    // #endregion
}
