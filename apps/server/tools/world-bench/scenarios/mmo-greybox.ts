/**
 * 剧本 mmo-greybox（MMO MK0-B6，docs/MMO.md §10.1 场景 A「灰盒」首次数字）：机器人各一角色（characters 面建角 + world.enter 同形凭据）进 mmoWorld
 * 单分线（greybox 图；灰盒包扩成 SPAWN_GRID² 处刷新点 × SPAWN_COUNT 只 idle slime = 脚本实体），每 MOVE_INTERVAL_MS 按种子随机方向发 `c2s.mmoWorld.move`
 * （STOP_RATIO 停），视野流 enter / update / leave / private 记作 delta、baseline 三件记作 baseline（JSON 长度作代理）；周期检查点（30 s）照常落库
 * （DB 写耗时归 tick 采样）。跑完删角色 / persona / 分线行。⚠ 机器人与服务端同进程，数字只用于比较与阈值设定（§11.2）。
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
import { createMmoWorldMode } from "../../../src/rooms/modes/mmoWorld/index";
import type { BotStats, Rng, Scenario } from "../scenario";

/** 刷新点网格边长（SPAWN_GRID² 处）与每处只数：8² × 3 = 192 只脚本实体（§10.1 场景 A：100–200）。 */
const SPAWN_GRID = 8;
const SPAWN_COUNT = 3;
const MOVE_INTERVAL_MS = 300;
const STOP_RATIO = 0.1;
const MODE_ID = "mmoWorld";

/** 灰盒包扩容：同一张图，刷新点铺满全图（确定性）。 */
function benchPack(): IContentPack {
  const map = GREYBOX_PACK.maps[0]!;
  const spawns: ISpawnDef[] = [];
  for (let row = 0; row < SPAWN_GRID; row += 1) {
    for (let col = 0; col < SPAWN_GRID; col += 1) {
      spawns.push({
        spawnId: `bench-${row}-${col}`, mapId: GREYBOX_MAP_ID, templateId: GREYBOX_CREATURE_ID,
        pos: { x: Math.round((map.size.w / (SPAWN_GRID + 1)) * (col + 1)), y: Math.round((map.size.h / (SPAWN_GRID + 1)) * (row + 1)) },
        count: SPAWN_COUNT, waypoints: [], managed: "kit",
      });
    }
  }
  return { ...GREYBOX_PACK, packId: "greybox-bench", spawns };
}

const nameOf = (uid: string, index: number): string => `b${index}${uid.replace(/[^A-Za-z0-9]/gu, "").slice(-8)}`.slice(0, 16);

export const mmoGreybox: Scenario = {
  id: "mmo-greybox",
  description: `MMO MK0 场景 A：mmoWorld 单分线（greybox），${SPAWN_GRID * SPAWN_GRID * SPAWN_COUNT} 只 idle slime，机器人各一角色（建角 + 凭据），每 ${MOVE_INTERVAL_MS} ms 按种子随机方向 move（${STOP_RATIO * 100}% 停）；周期检查点照常落库`,
  register() {
    const content = indexContentPack(validateContentPack(benchPack()));
    return worldModeRegistry.register(MODE_ID, () => createMmoWorldMode({ content }) as never);
  },
  world: {
    async prepare(uid, sId, index) {
      const created = await createCharacter(uid, sId, { slot: 0, name: nameOf(uid, index), classId: "fighter", factionId: "dawn" }, mmoOpId(uid, sId, "createCharacter", "bench"));
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
    for (const type of [S2C.MmoWorldEnter, S2C.MmoWorldUpdate, S2C.MmoWorldLeave, S2C.MmoWorldPrivate]) {
      room.onMessage(type, (value: unknown) => {
        stats.deltaMessages += 1;
        stats.deltaBytes += JSON.stringify(value).length;
      });
    }
    room.onMessage("*", () => undefined);
    let seq = 0;
    const timer = setInterval(() => {
      if (!room.connection?.isOpen) return;
      seq += 1;
      const stop = rng() < STOP_RATIO;
      const angle = rng() * Math.PI * 2;
      room.send(C2S.MmoWorldMove, { seq, dir: stop ? { x: 0, y: 0 } : { x: Math.cos(angle), y: Math.sin(angle) } });
      stats.inputsSent += 1;
    }, MOVE_INTERVAL_MS);
    return () => clearInterval(timer);
  },
};
