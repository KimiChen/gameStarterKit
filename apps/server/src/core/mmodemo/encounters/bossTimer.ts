/**
 * mmodemo · 遭遇 ①「定时 boss」（docs/MMO.md §9.2）：instanceStarted → 每 10 min 一次 repeat timer；timer 到点且狼穴里没有活着的 boss ⇒ 在狼穴
 * 刷一只 tag=boss 的头狼 + notice + sayWorld；boss 被击杀 ⇒ 击杀者所在队伍**在本分线的**每人一枚头狼之牙 + `bossKills` durable 累计。
 * 纯函数：随机只经 api.rng、时间只经 api.tick；⛔ Date / Math.random / 计时器（mmo-orchestration-boundary 机检）。
 */
import type { OrchestrationCommand, OrchestrationEvent, OrchestrationReadApi } from "@game/shared/kits/mmo/api/orchestration/index";

export const BOSS_TIMER_ID = "bossSpawn";
export const BOSS_TAG = "boss";
export const BOSS_TEMPLATE_ID = "alphaWolf";
export const DEN_REGION_ID = "den";
/** 10 分钟一轮（§9.2）；ORCH_MIN_TIMER_MS 500 ≤ 600 000 ≤ 86 400 000 */
export const BOSS_PERIOD_MS = 600_000;
export const BOSS_REWARD_ITEM_ID = "alpha-fang";
export const BOSS_KILLS_VAR = "bossKills";
/** 单事件命令 ≤ 64（ORCH_MAX_COMMANDS_PER_TICK）：1 条 setVar + ≤ 50 条 grantItem，留余量；超出的队员不发（灰盒取舍，README 登记） */
export const BOSS_REWARD_MAX_MEMBERS = 50;
/** 狼穴中心；region 缺席时的兜底（内容包保证 den 存在，用例钉） */
const DEN_FALLBACK_CENTER = Object.freeze({ x: 1900, y: 1900 });

/** 事件联合里 creatureSpawned / creatureDied 共用一个成员形状；分派处已按 kind 收窄。 */
export type CreatureDiedEvent = Extract<OrchestrationEvent, { readonly kind: "creatureSpawned" | "creatureDied" }>;

export function onInstanceStarted(): OrchestrationCommand[] {
    return [{ op: "startTimer", timerId: BOSS_TIMER_ID, afterMs: BOSS_PERIOD_MS, tag: BOSS_TAG, repeat: true }];
}

export function onBossTimer(api: OrchestrationReadApi): OrchestrationCommand[] {
    // 上一只还活着 ⇒ 不叠刷（脚本怪死后由 kit 收回，不复活）
    if (api.world.entitiesInRegion(DEN_REGION_ID, { tag: BOSS_TAG }).length > 0) return [];
    const region = api.world.region(DEN_REGION_ID);
    const center = region?.shape.kind === "circle" ? region.shape.center : DEN_FALLBACK_CENTER;
    const jitter = Math.floor(api.rng("boss") * 120) - 60;
    return [
        { op: "spawn", templateId: BOSS_TEMPLATE_ID, pos: { x: center.x + jitter, y: center.y }, tag: BOSS_TAG },
        { op: "notice", text: "头狼现身于狼穴！", level: "warn" },
        { op: "sayWorld", text: "灰谷：头狼在狼穴现身，集结讨伐。" },
    ];
}

export function onCreatureDied(event: CreatureDiedEvent, api: OrchestrationReadApi): OrchestrationCommand[] {
    if (event.tag !== BOSS_TAG || event.killerEntityId === undefined) return [];
    const kills = Number(api.vars.get(BOSS_KILLS_VAR) ?? 0) + 1;
    const commands: OrchestrationCommand[] = [{ op: "setVar", key: BOSS_KILLS_VAR, value: kills, durable: true }];
    // 只发同队且在本分线的成员（party.membersInInstance 已按分线过滤；不在队 = 只有击杀者自己）
    for (const memberId of api.party.membersInInstance(event.killerEntityId).slice(0, BOSS_REWARD_MAX_MEMBERS)) {
        const member = api.world.entity(memberId);
        if (member?.characterId) commands.push({ op: "grantItem", toCharacterId: member.characterId, itemTemplateId: BOSS_REWARD_ITEM_ID, count: 1, reason: "boss" });
    }
    return commands;
}
