/**
 * mmodemo · 编排模块（贡献点 `mmo.orchestration`，docs/MMO.md §8.5 / §9.2）：包 `demoVale` 一包一模块。三段遭遇各住 encounters/：
 * 定时 boss（bossTimer）/ 区域伏击（ambush）/ 行商（merchant）；本文件只做事件分派。
 * 只 import kit shared `api/orchestration` 门面与本目录（mmo-orchestration-boundary 机检）；handler 同步纯函数。
 */
import { MMO_ORCHESTRATION_VERSION, defineOrchestration } from "@game/shared/kits/mmo/api/orchestration/index";
import { onChoice, onInteract, MERCHANT_INTERACTS } from "./encounters/merchant";
import { onRegionEntered } from "./encounters/ambush";
import { BOSS_TAG, onBossTimer, onCreatureDied, onInstanceStarted } from "./encounters/bossTimer";

export const DEMO_VALE_PACK_ID = "demoVale";

export const orchestration = defineOrchestration({
    orchestrationVersion: MMO_ORCHESTRATION_VERSION,
    packId: DEMO_VALE_PACK_ID,
    subscribes: ["instanceStarted", "timer", "creatureDied", "regionEntered", "interact", "choice"],
    interacts: MERCHANT_INTERACTS,
    // 伏击 3 + boss 1 ≤ 8；单次发放 1 件（≤ 5）
    limits: { maxSpawnsAlive: 8, maxGrantCount: 5 },
    handle(event, api) {
        switch (event.kind) {
            case "instanceStarted": return onInstanceStarted();
            case "timer": return event.tag === BOSS_TAG ? onBossTimer(api) : [];
            case "creatureDied": return onCreatureDied(event, api);
            case "regionEntered": return onRegionEntered(event, api);
            case "interact": return onInteract(event);
            case "choice": return onChoice(event, api);
            default: return [];
        }
    },
});
