import { EventArgs, EventHandler as EventHandler, Event, EventCalculate } from '@arthropoda/game-engine'
import { ItemIdDefine } from '../rules/ItemIdDefine'
import { UserLevelProgression } from '../../user/action/UserLevelProgression'
import { taItem_itemChange } from '../../../../generated/telemetry/item/itemChange'
import { Props } from '../inventory/Props'
import { SceneTelemetryContext } from '../../scene/telemetry/SceneTelemetryContext'
import { User } from '../../user/bean/User'
import { AwardResponse } from '../../../runtime/protocol/C2S/commom'

@Event()
export class PropChangedEventArgs extends EventArgs {
    /**
     * 本次变更的归属玩家。
     *
     * 事件处理器不能从全局 `Ctx.user` 取它：道具事件由库存能力发布，可能在任何
     * Action 或延后处理阶段执行。把来源随事件传递，才能保证奖励、自动升级和埋点
     * 都作用于真正发生变更的玩家。
     */
    user!: User

    /**
     * 当前变更可补充进的奖励响应。
     *
     * 这是发布者显式提供的可选输出，不从 `Ctx.call` 读取；事件在没有请求上下文的
     * 场景也能安全处理。
     */
    response?: AwardResponse

    cId: int = 0

    num: int = 0

    reason: string = ''

    params: { [key: string]: any } = {}
}

/**
 * 同步事件
 */
export class PropChangeEventHandler extends EventHandler<PropChangedEventArgs> {
    isSync: boolean = true

    async handler(data: PropChangedEventArgs) {
        const itemConf = C.item(data.cId)
        // 按道具区分
        switch (itemConf.id) {
            case ItemIdDefine.ITEM_ID_GC:
                // 更新玩家数数版本号
                break
            case ItemIdDefine.ITEM_ID_EXP:
                // 自动升级
                await UserLevelProgression.autoLevelUp(data.user, data.response)
                break
        }
    }
}

export class Ta_PropChangeEventHander extends EventHandler<PropChangedEventArgs> {
    async handler(data: PropChangedEventArgs) {
        const conf = C.item(data.cId)
        taItem_itemChange(data.user, {
            item_type: conf.type.toString(),
            item_id: conf.id.toString(),
            item_name: conf.name,
            change: data.num,
            after: Props.getHasNum(data.user, conf.id),
            scene: data.params.sceneName ?? '',
            scene_id: data.params.sceneId ?? '',
            area: data.params.area ?? '',
            reason: data.reason,
            action_mod: SceneTelemetryContext.moduleNameAndReason()[0],
            _important: {},
            EVENT_NAME: '',
        })
    }
}

/**
 * 汇总事件继承自EventCalculate
 */
export class Calc_PropChangeEventHandler extends EventCalculate<PropChangedEventArgs> {
    recordTimes: Map<int, int> = new Map()

    async preHandler(data: PropChangedEventArgs) {
        const times = this.recordTimes.get(data.cId)
        if (!times) {
            this.recordTimes.set(data.cId, data.num)
        } else {
            this.recordTimes.set(data.cId, data.num + times)
        }
    }

    async handler() {
        this.recordTimes.forEach((v, k) => {
            console.log(`calcEvent id:${k} num:${v}`)
        })
    }
}
