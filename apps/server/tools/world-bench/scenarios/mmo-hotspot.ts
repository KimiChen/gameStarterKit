/**
 * 剧本 mmo-hotspot（MMO MK1-B6，docs/MMO.md §10.1 场景 B「热点」+ §11.2 kill criterion）：mmoWorld 单分线（greybox），HOTSPOT_GRID² 处刷新点 × SPAWN_COUNT 只
 * idle slime 全挤在出生点周围 ±HOTSPOT_RADIUS（10² × 5 = 500 只脚本实体），机器人各一角色从出生点起、每 MOVE_INTERVAL_MS 点地到热点内随机一点
 * （⛔ 离开热点 ⇒ 每人视野常驻 ≈ 兴趣集上限 256）、每 CHAT_INTERVAL_MS 发一句附近聊天（框架 core 世界 token，受众 = 兴趣集含本人的会话 ⇒ 100 人热点里
 * 每句扇出 ≤ 100 份，单 seq 流不可丢类）；视野流 + 私有流 + 附近聊天记作 delta。逐级用 `--bots 25 / 50 / 100` 跑三次（§10.1「逐级」）。
 * ⚠ 施法 / 拾取归 MK2 / MK3，本剧本以聊天 + 点地代替「聚集施法 / 拾取」的推送流深度压力；机器人与服务端同进程，数字只用于比较与阈值判定。
 */
import type { Room as SDKRoom } from "@colyseus/sdk";
import { C2S, GAMEPLAY_CATALOG, S2C, WORLD_ROOM_PROTOCOL_VERSION, WorldPhase, type IWorldRoomJoinOptions } from "@game/shared";
import { indexContentPack, validateContentPack, type IContentPack, type ISpawnDef } from "@game/shared/kits/mmo/api/content/index";
import { GREYBOX_CREATURE_ID, GREYBOX_MAP_ID, GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import { kWorldFence, kWorldLease } from "../../../src/core/infra/keys";
import { getPool } from "../../../src/core/infra/mysql";
import { coordClient } from "../../../src/core/infra/redisRoute";
import { createCharacter } from "../../../src/kits/mmo/api/characters/index";
import { mmoOpId } from "../../../src/kits/mmo/host";
import { readControl } from "../../../src/rooms/core/control";
import { worldAddressOf, worldDirectory } from "../../../src/rooms/core/WorldDirectory";
import { issueWorldTicket } from "../../../src/rooms/core/WorldTicket";
import { worldModeRegistry } from "../../../src/rooms/WorldMode";
import { MMO_WORLD_TUNING, createMmoWorldMode } from "../../../src/rooms/modes/mmoWorld/index";
import type { BotStats, Rng, Scenario } from "../scenario";

/** 热点中心 = 出生点 (1000, 1000)；刷新点网格 10² × 5 = 500 只全在 ±HOTSPOT_RADIUS 内。 */
const HOTSPOT_CENTER = { x: 1000, y: 1000 };
const HOTSPOT_RADIUS = 300;
const HOTSPOT_GRID = 10;
const SPAWN_COUNT = 5;
const MOVE_INTERVAL_MS = 300;
const CHAT_INTERVAL_MS = 4_000;
const MODE_ID = "mmoWorld";

function hotspotPack(): IContentPack {
  const spawns: ISpawnDef[] = [];
  for (let row = 0; row < HOTSPOT_GRID; row += 1) {
    for (let col = 0; col < HOTSPOT_GRID; col += 1) {
      spawns.push({
        spawnId: `hot-${row}-${col}`, mapId: GREYBOX_MAP_ID, templateId: GREYBOX_CREATURE_ID,
        pos: {
          x: Math.round(HOTSPOT_CENTER.x - HOTSPOT_RADIUS + ((2 * HOTSPOT_RADIUS) / (HOTSPOT_GRID - 1)) * col),
          y: Math.round(HOTSPOT_CENTER.y - HOTSPOT_RADIUS + ((2 * HOTSPOT_RADIUS) / (HOTSPOT_GRID - 1)) * row),
        },
        count: SPAWN_COUNT, waypoints: [], managed: "kit",
      });
    }
  }
  // 灰盒 v3 有两张图：热点只在 greybox；东郊刷新点去掉（不进本分线）
  return { ...GREYBOX_PACK, packId: "greybox-hotspot", spawns };
}

const nameOf = (uid: string, index: number): string => `h${index}${uid.replace(/[^A-Za-z0-9]/gu, "").slice(-8)}`.slice(0, 16);

export const mmoHotspot: Scenario = {
  id: "mmo-hotspot",
  description: `MMO MK1 场景 B「热点」：mmoWorld 单分线（greybox），${HOTSPOT_GRID * HOTSPOT_GRID * SPAWN_COUNT} 只 idle slime 挤在出生点 ±${HOTSPOT_RADIUS}，机器人各一角色、每 ${MOVE_INTERVAL_MS} ms 点地到热点内随机点、每 ${CHAT_INTERVAL_MS} ms 一句附近聊天；逐级 --bots 25 / 50 / 100`,
  register() {
    const content = indexContentPack(validateContentPack(hotspotPack()));
    // 生产节拍（MMO_WORLD_TUNING：角色位置 10 Hz 进观察者流、本人 pos 回执 20 Hz、兴趣集每 200 ms 重算）——量的是要上线的配置
    return worldModeRegistry.register(MODE_ID, () => createMmoWorldMode({ content, ...MMO_WORLD_TUNING }) as never);
  },
  world: {
    async prepare(uid, sId, index) {
      const created = await createCharacter(uid, sId, { slot: 0, name: nameOf(uid, index), classId: index % 2 === 0 ? "fighter" : "caster", factionId: index % 2 === 0 ? "dawn" : "dusk" }, mmoOpId(uid, sId, "createCharacter", "bench"));
      const personaId = created.character.personaId;
      const control = await readControl(sId, personaId);
      const issued = await issueWorldTicket({ sId, uid, personaId, worldAddress: worldAddressOf(sId, GREYBOX_MAP_ID, 0), controlEpoch: control?.controlEpoch ?? 0, transferId: null, nowMs: Date.now() });
      return { personaId, ticket: issued.ticket, mapId: GREYBOX_MAP_ID, line: 0 };
    },
    async cleanup(uid, sId) {
      const pool = getPool();
      const [rows] = await pool.query("SELECT character_id FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [sId, uid]);
      for (const row of rows as { character_id: string }[]) {
        await pool.execute("DELETE FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ?", [sId, row.character_id]);
        await pool.execute("DELETE FROM k_mmo_receipt WHERE server_id = ? AND character_id = ?", [sId, row.character_id]);
      }
      await pool.execute("DELETE FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [sId, uid]);
      await pool.execute("DELETE FROM persona WHERE server_id = ? AND user_id = ?", [sId, uid]);
    },
    async cleanupAll(sId) {
      const pool = getPool();
      const [instances] = await pool.query("SELECT instance_id FROM world_instance WHERE server_id = ? AND map_id = ?", [sId, GREYBOX_MAP_ID]);
      for (const row of instances as { instance_id: string }[]) {
        await coordClient().unlink(kWorldLease(sId, row.instance_id), kWorldFence(sId, row.instance_id));
        worldDirectory.forget(sId, row.instance_id);
        await pool.execute("DELETE FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ?", [sId, row.instance_id]);
        await pool.execute("DELETE FROM k_mmo_instance WHERE server_id = ? AND instance_id = ?", [sId, row.instance_id]);
      }
      await pool.execute("DELETE FROM world_instance WHERE server_id = ? AND map_id = ?", [sId, GREYBOX_MAP_ID]);
    },
  },
  joinOptions(sId, prepared = {}): IWorldRoomJoinOptions {
    return {
      v: WORLD_ROOM_PROTOCOL_VERSION, sId, mode: MODE_ID, modeVersion: GAMEPLAY_CATALOG.mmoWorld.modeVersion, profile: "world",
      mapId: String(prepared.mapId ?? GREYBOX_MAP_ID), line: Number(prepared.line ?? 0), personaId: String(prepared.personaId), ticket: String(prepared.ticket),
    };
  },
  ready: (state) => (state as { phase?: string } | undefined)?.phase === WorldPhase.Active,
  attach(room: SDKRoom, stats: BotStats, rng: Rng): () => void {
    let firstBaselineBytes = 0;
    let firstBaselineDone = false;
    let currentBaselineId: string | null = null;
    room.onMessage(S2C.MmoWorldBaselineBegin, (value: unknown) => {
      const begin = value as { baselineId: string };
      if (!firstBaselineDone) { currentBaselineId = begin.baselineId; firstBaselineBytes = JSON.stringify(value).length; }
      stats.baselineBegins += 1;
      stats.baselineBytes += JSON.stringify(value).length;
    });
    room.onMessage(S2C.MmoWorldBaselineChunk, (value: unknown) => {
      const chunk = value as { baselineId: string };
      const bytes = JSON.stringify(value).length;
      stats.baselineBytes += bytes;
      if (!firstBaselineDone && chunk.baselineId === currentBaselineId) firstBaselineBytes += bytes;
    });
    room.onMessage(S2C.MmoWorldBaselineEnd, (value: unknown) => {
      const end = value as { baselineId: string };
      stats.baselineBytes += JSON.stringify(value).length;
      if (!firstBaselineDone && end.baselineId === currentBaselineId) {
        firstBaselineDone = true;
        stats.firstBaselineBytes = firstBaselineBytes + JSON.stringify(value).length;
        stats.firstBaselineAtMs = Date.now();
      }
    });
    for (const type of [S2C.MmoWorldEnter, S2C.MmoWorldUpdate, S2C.MmoWorldLeave, S2C.MmoWorldPrivate, S2C.MmoWorldPos, S2C.WorldChat]) {
      room.onMessage(type, (value: unknown) => {
        stats.deltaMessages += 1;
        stats.deltaBytes += JSON.stringify(value).length;
      });
    }
    room.onMessage("*", () => undefined);
    let seq = 0;
    const mover = setInterval(() => {
      if (!room.connection?.isOpen) return;
      seq += 1;
      const angle = rng() * Math.PI * 2;
      const radius = rng() * HOTSPOT_RADIUS;
      room.send(C2S.MmoWorldMove, { seq, target: { x: Math.round(HOTSPOT_CENTER.x + Math.cos(angle) * radius), y: Math.round(HOTSPOT_CENTER.y + Math.sin(angle) * radius) } });
      stats.inputsSent += 1;
    }, MOVE_INTERVAL_MS);
    let line = 0;
    const talker = setInterval(() => {
      if (!room.connection?.isOpen) return;
      line += 1;
      room.send(C2S.WorldChat, { text: `hot ${line} ${Math.floor(rng() * 1000)}` });
      stats.inputsSent += 1;
    }, CHAT_INTERVAL_MS + Math.floor(rng() * 500));
    return () => { clearInterval(mover); clearInterval(talker); };
  },
};
