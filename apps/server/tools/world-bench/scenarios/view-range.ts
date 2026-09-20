/**
 * 剧本 view-r100 / view-r300（docs/MMO-PLAN.md MF5a-B6「视野缩小 → 每会话字节下降」）：机器人进 viewFixture dropIn 房
 * （MF5a-B5 的 SQL 视图房夹具，内存真源；每房 8 人），世界里 ENTITY_COUNT 个实体按种子随机游走（服务端定时器改真源，mode 逐 tick 轮询），
 * 机器人每 LOOK_INTERVAL_MS 把视口随机漂移一步；两个剧本只差视距（100 vs 300），其余同参 ⇒ 每会话出站字节应随视距缩小而下降。
 * 机器人侧把 enter / update / leave 记作 delta、baseline 三件记作 baseline（JSON 长度作代理）。
 */
import type { Room as SDKRoom } from "@colyseus/sdk";
import { C2S, GAME_ROOM_PROTOCOL_VERSION, GAMEPLAY_CATALOG, S2C, VIEW_FIXTURE_MAP_SIZE, type IGameRoomJoinOptions } from "@game/shared";
import { gameModeRegistry } from "../../../src/rooms/GameMode";
import { MemoryViewSource, VIEW_FIXTURE_MODE_ID, createViewFixtureMode, type ViewRow } from "../../../test/fixtures/viewFixtureMode";
import { seededRng, type BotStats, type Rng, type Scenario } from "../scenario";

const ENTITY_COUNT = 400;
const ENTITY_STEP = 8;
const WORLD_TICK_MS = 100;
const LOOK_INTERVAL_MS = 500;
const LOOK_STEP = 20;
const WORLD_SEED = 20260919;

function seedWorld(): MemoryViewSource {
  const rng = seededRng(WORLD_SEED);
  const rows: ViewRow[] = [];
  for (let index = 0; index < ENTITY_COUNT; index += 1) {
    rows.push({ id: `n${index}`, x: Math.floor(rng() * VIEW_FIXTURE_MAP_SIZE), y: Math.floor(rng() * VIEW_FIXTURE_MAP_SIZE), rev: 0, ownerUid: null, note: "", noteRev: 0 });
  }
  return new MemoryViewSource(rows);
}

const clamp = (value: number): number => Math.max(0, Math.min(VIEW_FIXTURE_MAP_SIZE, Math.round(value)));

function viewRangeScenario(range: number): Scenario {
  return {
    id: `view-r${range}`,
    description: `viewFixture dropIn 房：${ENTITY_COUNT} 个随机游走实体、视距 ${range}、机器人视口随机漂移（MF5a-B5 观察者同步）`,
    register() {
      const source = seedWorld();
      const worldRng = seededRng(WORLD_SEED + 1);
      // 服务端世界推进：每 WORLD_TICK_MS 让每个实体随机走一步（真源变化 → mode 轮询 → 框架差分）
      const timer = setInterval(() => {
        for (const row of source.load()) {
          source.move(row.id, clamp(row.x + (worldRng() * 2 - 1) * ENTITY_STEP), clamp(row.y + (worldRng() * 2 - 1) * ENTITY_STEP));
        }
      }, WORLD_TICK_MS);
      const unregister = gameModeRegistry.register(VIEW_FIXTURE_MODE_ID, () =>
        createViewFixtureMode({ source, roster: { min: 1, max: 8, autoStart: 1 }, pollTicks: 1, range }) as never);
      return () => { clearInterval(timer); unregister(); };
    },
    joinOptions(sId: number): IGameRoomJoinOptions {
      return { v: GAME_ROOM_PROTOCOL_VERSION, sId, mode: VIEW_FIXTURE_MODE_ID, modeVersion: GAMEPLAY_CATALOG.viewFixture.modeVersion, profile: "dropIn" };
    },
    attach(room: SDKRoom, stats: BotStats, rng: Rng): () => void {
      let viewport = { x: Math.floor(rng() * VIEW_FIXTURE_MAP_SIZE), y: Math.floor(rng() * VIEW_FIXTURE_MAP_SIZE) };
      let firstBaselineBytes = 0;
      let firstBaselineDone = false;
      let currentBaselineId: string | null = null;
      room.onMessage(S2C.ViewFixtureBaselineBegin, (value: unknown) => {
        const begin = value as { baselineId: string };
        if (!firstBaselineDone) { currentBaselineId = begin.baselineId; firstBaselineBytes = JSON.stringify(value).length; }
        stats.baselineBegins += 1;
        stats.baselineBytes += JSON.stringify(value).length;
      });
      room.onMessage(S2C.ViewFixtureBaselineChunk, (value: unknown) => {
        const chunk = value as { baselineId: string };
        const bytes = JSON.stringify(value).length;
        stats.baselineBytes += bytes;
        if (!firstBaselineDone && chunk.baselineId === currentBaselineId) firstBaselineBytes += bytes;
      });
      room.onMessage(S2C.ViewFixtureBaselineEnd, (value: unknown) => {
        const end = value as { baselineId: string };
        stats.baselineBytes += JSON.stringify(value).length;
        if (!firstBaselineDone && end.baselineId === currentBaselineId) {
          firstBaselineDone = true;
          stats.firstBaselineBytes = firstBaselineBytes + JSON.stringify(value).length;
          stats.firstBaselineAtMs = Date.now();
        }
      });
      for (const type of [S2C.ViewFixtureEnter, S2C.ViewFixtureUpdate, S2C.ViewFixtureLeave, S2C.ViewFixturePrivate]) {
        room.onMessage(type, (value: unknown) => {
          stats.deltaMessages += 1;
          stats.deltaBytes += JSON.stringify(value).length;
        });
      }
      room.onMessage("*", () => undefined);
      // 视口漂移：首条立即发（决定兴趣集），之后每 LOOK_INTERVAL_MS 随机走一步（⛔ 不跳出两倍视距，避免整段 baseline 重发）
      const send = (): void => {
        if (!room.connection?.isOpen) return;
        room.send(C2S.ViewFixtureLook, viewport);
        stats.inputsSent += 1;
      };
      send();
      const timer = setInterval(() => {
        viewport = { x: clamp(viewport.x + (rng() * 2 - 1) * LOOK_STEP), y: clamp(viewport.y + (rng() * 2 - 1) * LOOK_STEP) };
        send();
      }, LOOK_INTERVAL_MS);
      return () => clearInterval(timer);
    },
  };
}

export const viewRange100: Scenario = viewRangeScenario(100);
export const viewRange300: Scenario = viewRangeScenario(300);
