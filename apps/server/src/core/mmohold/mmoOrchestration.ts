/** holdRidge 内容编排：只经 kit 公开面影响世界；状态全部由 kit 的 vars / timers / 检查点托管。 */
import { MMO_ORCHESTRATION_VERSION, defineOrchestration } from "@game/shared/kits/mmo/api/orchestration/index";
import { onInstanceStarted, onTick, onReopen, HOLD_PACK_ID, REOPEN_TIMER_ID } from "./encounters/capture";

export const orchestration = defineOrchestration({
    orchestrationVersion: MMO_ORCHESTRATION_VERSION,
    packId: HOLD_PACK_ID,
    subscribes: ["instanceStarted", "tick", "timer"],
    tickEvery: 20,
    limits: { maxSpawnsAlive: 4, maxGrantCount: 1, maxCurrencyPerGrant: 25 },
    handle(event, api) {
        switch (event.kind) {
            case "instanceStarted": return onInstanceStarted(api);
            case "tick": return onTick(api);
            case "timer": return event.timerId === REOPEN_TIMER_ID ? onReopen(api) : [];
            default: return [];
        }
    },
});
