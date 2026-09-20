/**
 * 编排模块夹具（MK4-B1；docs/MMO.md §8.5 形态 + §9 样本 1 的「定时 boss」缩影）：只 import kit shared `api/orchestration` 门面；顶层无副作用；
 * handler 同步纯函数、随机只经 api.rng、时间只经 api.tick。给 mmo-orchestration（运行器 / harness）、mmo-orchestration-boundary（import / 禁用标识符扫描）
 * 与 mmoWorld-mode（接线）三处共用。
 */
import { MMO_ORCHESTRATION_VERSION, defineOrchestration, type OrchestrationCommand } from "@game/shared/kits/mmo/api/orchestration/index";

export const FIXTURE_PACK_ID = "greybox";

/** 定时 boss：instanceStarted → 1 s 后 timer（repeat）→ 在出生点 (1000,1000) 东北 spawn 一只 tag=boss 的 slime + notice；boss 死 ⇒ 击杀者所在队伍每人一件凝胶 + vars.bossKills++（durable）；玩家进图 ⇒ sayNearby 问候；tick ⇒ publishState。 */
export const bossTimer = defineOrchestration({
    orchestrationVersion: MMO_ORCHESTRATION_VERSION,
    packId: FIXTURE_PACK_ID,
    subscribes: ["instanceStarted", "timer", "creatureDied", "playerEntered", "tick", "interact", "choice", "grantResult", "packSuspended"],
    tickEvery: 10,
    interacts: { talk: { targets: ["slime"] } },
    limits: { maxSpawnsAlive: 4 },
    handle(event, api) {
        switch (event.kind) {
            case "instanceStarted": return [{ op: "startTimer", timerId: "bossSpawn", afterMs: 1000, tag: "boss", repeat: true }, { op: "setVar", key: "started", value: true }];
            case "timer": {
                const jitter = Math.floor(api.rng("boss") * 100);
                return [{ op: "spawn", templateId: "slime", pos: { x: 1100 + jitter, y: 900 }, tag: "boss", despawnAfterMs: 30_000 }, { op: "notice", text: `boss ${api.tick}`, level: "warn" }];
            }
            case "creatureDied": {
                if (event.tag !== "boss" || event.killerEntityId === undefined) return [];
                const kills = Number(api.vars.get("bossKills") ?? 0) + 1;
                const commands: OrchestrationCommand[] = [{ op: "setVar", key: "bossKills", value: kills, durable: true }];
                for (const memberId of api.party.membersInInstance(event.killerEntityId)) {
                    const member = api.world.entity(memberId);
                    if (member?.characterId) commands.push({ op: "grantItem", toCharacterId: member.characterId, itemTemplateId: "slime-gel", count: 1, reason: "boss" });
                }
                return commands;
            }
            case "playerEntered": return [{ op: "sayNearby", anchorEntityId: event.entityId, text: "welcome" }];
            case "tick": return [{ op: "publishState", key: "alive", value: api.world.entitiesInRegion("arena", { tag: "boss" }).length }];
            case "interact": return [{ op: "prompt", toEntityId: event.actorEntityId, promptId: `talk:${event.targetEntityId}`, choices: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] }];
            case "choice": return event.choiceId === "yes" ? [{ op: "grantCurrency", toCharacterId: api.world.entity(event.actorEntityId)?.characterId ?? "", amount: 5, reason: "talk" }] : [];
            case "grantResult": return [{ op: "setVar", key: `grant:${event.opId}`, value: event.ok }];
            case "packSuspended": return [{ op: "setVar", key: "neverApplied", value: true }];
            default: return [];
        }
    },
});

/** 预算炸弹：每个 tick 发 65 条 setVar（> 64 ⇒ suspend）。 */
export const commandFlood = defineOrchestration({
    orchestrationVersion: MMO_ORCHESTRATION_VERSION,
    packId: FIXTURE_PACK_ID,
    subscribes: ["tick", "packSuspended"],
    tickEvery: 10,
    handle(event) {
        if (event.kind === "packSuspended") return [];
        return Array.from({ length: 65 }, (_u, i) => ({ op: "setVar" as const, key: `k${i}`, value: i }));
    },
});
