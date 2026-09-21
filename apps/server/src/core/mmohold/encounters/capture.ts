/**
 * 据点争夺：每秒按存活角色多数占点；平票 / 无人保留归属但停计分。
 * 一轮达 100 分时，冻结胜方在场名单，用两条批量命令在同 tick 记录所有奖励（不截人数、不留跨 tick 名单）。
 * phase=closed 与奖励同属检查点，恢复只发布状态，不重发奖励、不重启 reopen timer。
 */
import type { OrchestrationCommand, OrchestrationReadApi, ScriptScalar } from "@game/shared/kits/mmo/api/orchestration/index";
import { MMO_FACTION_IDS, type MmoFactionId } from "@game/shared/kits/mmo/api/characters/index";

export const HOLD_PACK_ID = "holdRidge";
export const HOLD_MAP_ID = HOLD_PACK_ID;
export const POINT_IDS = ["pointA", "pointB"] as const;
export const SENTINEL_TEMPLATE_ID = "sentinel";
export const REWARD_ITEM_IDS = ["hold-medal", "hold-banner", "hold-seal"] as const;
export const WIN_SCORE = 100;
export const REWARD_CURRENCY = 25;
export const REOPEN_TIMER_ID = "reopen";
export const REOPEN_MS = 60_000;
export type PointId = (typeof POINT_IDS)[number];
type Owner = MmoFactionId | "neutral";

const neutral = "neutral" as const;
const stateKeys = ["owner:pointA", "owner:pointB", "score:dawn", "score:dusk", "phase", "winner", "round", "reopenIn"] as const;
const faction = (value: unknown): Owner => value === "dawn" || value === "dusk" ? value : neutral;
const numberVar = (api: OrchestrationReadApi, key: string, fallback = 0): number => {
    const value = api.vars.get(key);
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
};
const guardTag = (point: PointId, owner: Owner): string => `hold:${point}:${owner}`;
const factionName = (owner: Owner): string => owner === "dawn" ? "曙光" : owner === "dusk" ? "暮光" : "中立";
const pointName = (point: PointId): string => point === "pointA" ? "A 据点" : "B 据点";
const write = (key: string, value: ScriptScalar, durable = false): OrchestrationCommand[] => [
    { op: "setVar", key, value, ...(durable ? { durable: true } : {}) },
    { op: "publishState", key, value },
];

function reset(api: OrchestrationReadApi, round: number): OrchestrationCommand[] {
    const commands: OrchestrationCommand[] = [{ op: "cancelTimer", timerId: REOPEN_TIMER_ID }];
    for (const point of POINT_IDS) {
        const owner = faction(api.vars.get(`owner:${point}`));
        if (owner !== neutral) commands.push({ op: "despawn", tag: guardTag(point, owner) });
        commands.push({ op: "setRegionEnabled", regionId: point, enabled: true }, ...write(`owner:${point}`, neutral));
    }
    for (const id of MMO_FACTION_IDS) commands.push(...write(`score:${id}`, 0));
    commands.push(...write("phase", "active"), ...write("winner", neutral), ...write("round", round, true), ...write("reopenIn", 0));
    return commands;
}

export function onInstanceStarted(api: OrchestrationReadApi): OrchestrationCommand[] {
    if (api.vars.get("phase") !== "active" && api.vars.get("phase") !== "closed") return reset(api, 1);
    // 已恢复的 timer 自带剩余时间；重新 startTimer 会把已等待时间抹掉。
    return stateKeys.map((key) => ({ op: "publishState", key, value: api.vars.get(key) ?? (key === "round" ? 1 : key.startsWith("score:") || key === "reopenIn" ? 0 : neutral) }));
}

function majority(api: OrchestrationReadApi, point: PointId): Owner {
    let dawn = 0;
    let dusk = 0;
    for (const id of api.world.entitiesInRegion(point, { kind: "character" })) {
        const entity = api.world.entity(id);
        if (!entity?.alive || entity.kind !== "character") continue;
        if (entity.factionId === "dawn") dawn += 1;
        if (entity.factionId === "dusk") dusk += 1;
    }
    return dawn === dusk ? neutral : dawn > dusk ? "dawn" : "dusk";
}

function changeOwner(api: OrchestrationReadApi, point: PointId, oldOwner: Owner, newOwner: MmoFactionId): OrchestrationCommand[] {
    const commands = write(`owner:${point}`, newOwner);
    if (oldOwner !== neutral) commands.push({ op: "despawn", tag: guardTag(point, oldOwner) });
    const region = api.world.region(point);
    const center = region?.shape.kind === "circle" ? region.shape.center : { x: point === "pointA" ? 600 : 1000, y: 600 };
    for (const offset of [-55, 55]) {
        const pos = { x: center.x + offset, y: center.y + 50 };
        if (api.world.isWalkable(pos)) commands.push({ op: "spawn", templateId: SENTINEL_TEMPLATE_ID, pos, tag: guardTag(point, newOwner), leashRegionId: point });
    }
    commands.push({ op: "notice", text: `${factionName(newOwner)}占领${pointName(point)}。`, level: "info" });
    return commands;
}

function closeRound(api: OrchestrationReadApi, winner: MmoFactionId): OrchestrationCommand[] {
    const round = numberVar(api, "round", 1);
    const recipients = [...new Set(api.world.playersInInstance().map((id) => api.world.entity(id))
        .filter((entity) => entity?.kind === "character" && entity.factionId === winner && entity.characterId !== null)
        .map((entity) => entity!.characterId!))].sort();
    const commands: OrchestrationCommand[] = [
        ...write("phase", "closed", true), ...write("winner", winner), ...write("reopenIn", REOPEN_MS / 1000),
        { op: "sayWorld", text: `争旗山脊：${factionName(winner)}获得第${round}轮胜利！据点60秒后重新开放。` },
        ...POINT_IDS.map((regionId) => ({ op: "setRegionEnabled" as const, regionId, enabled: false })),
        { op: "startTimer", timerId: REOPEN_TIMER_ID, afterMs: REOPEN_MS },
    ];
    if (recipients.length > 0) commands.push(
        { op: "grantItem", toCharacterIds: recipients, itemTemplateId: REWARD_ITEM_IDS[(round - 1) % REWARD_ITEM_IDS.length]!, count: 1, reason: "hold-victory" },
        { op: "grantCurrency", toCharacterIds: recipients, amount: REWARD_CURRENCY, reason: "hold-victory" },
    );
    return commands;
}

export function onTick(api: OrchestrationReadApi): OrchestrationCommand[] {
    if (api.vars.get("phase") === "closed") return write("reopenIn", Math.max(0, numberVar(api, "reopenIn") - 1));
    const commands: OrchestrationCommand[] = [];
    const scores: Record<MmoFactionId, number> = { dawn: numberVar(api, "score:dawn"), dusk: numberVar(api, "score:dusk") };
    for (const point of POINT_IDS) {
        const next = majority(api, point);
        if (next === neutral) continue;
        const previous = faction(api.vars.get(`owner:${point}`));
        if (previous !== next) commands.push(...changeOwner(api, point, previous, next));
        scores[next] = Math.min(WIN_SCORE, scores[next] + 1);
    }
    for (const id of MMO_FACTION_IDS) {
        if (scores[id] !== numberVar(api, `score:${id}`)) commands.push(...write(`score:${id}`, scores[id]));
    }
    if (scores.dawn >= WIN_SCORE || scores.dusk >= WIN_SCORE) {
        // 两点同秒双达标时先比较本轮总分；仍相同时轮流给先手，避免固定阵营永远占优。
        const winner: MmoFactionId = scores.dawn === scores.dusk ? (numberVar(api, "round", 1) % 2 === 1 ? "dawn" : "dusk") : scores.dawn > scores.dusk ? "dawn" : "dusk";
        commands.push(...closeRound(api, winner));
    }
    return commands;
}

export function onReopen(api: OrchestrationReadApi): OrchestrationCommand[] {
    if (api.vars.get("phase") !== "closed") return [];
    return [...reset(api, numberVar(api, "round", 1) + 1), { op: "notice", text: "争旗山脊：新一轮据点争夺开始。", level: "info" }];
}
