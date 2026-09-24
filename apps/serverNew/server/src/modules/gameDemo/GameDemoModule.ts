import { defineGameModule } from '../../startup/GameModule'
import { GameDemoTicks } from './scheduling/GameDemoTicks'

/**
 * gameDemo：新框架标准开发方式的验证样例。
 *
 * 协议全部由 `apps/shared/schema/protocols/C2S/gameDemo.json` 生成并由 `action/` 承载，本模块只登记
 * 每秒推进活动与 Boss 的定时任务（`scope: 'server'`，全区服一次）。
 */
export const GameDemoModule = defineGameModule({
    name: 'gameDemo',
    startup: [
        {
            name: 'gameDemo-ticks',
            app: 'service',
            phase: 'runtime-ready',
            scope: 'server',
            run: () => GameDemoTicks.start(),
        },
    ],
})
