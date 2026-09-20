/**
 * world 进程 config（MMO MF4-B6；docs/MMO.md D27 / MMO-PLAN PS4）：WorldRoom 登记 + world 形态玩法装配。
 * PS1 / PS4 的入口拆分（`entries/world.ts` + `WORLD_PORT`）尚未落地，当前由合体入口 `app.config.ts` 合并本文件
 * （`...worldRooms` + `registerWorldRuntime()`）；拆分后本文件原样成为 world 进程的 rooms 表，⛔ 不登记进 lobby / game 的 config。
 *
 * ⚠ `filterBy(["sId","mode","profile","mapId","line"])`：撮合只在同区同玩法同图（同线）内匹配；缺 `line` 的 join 不参与该键过滤
 * （服务端分配，v1 = DEFAULT_WORLD_LINE），房内 onJoin 仍以 onAuth 权威值对 mapId / line 再闸一次（joinById 直连）。
 */
import { defineRoom } from "colyseus";
import type { MatchMakerDriver, Presence } from "@colyseus/core";
import { RedisDriver } from "@colyseus/redis-driver";
import { RedisPresence } from "@colyseus/redis-presence";
import { RoomName } from "@game/shared";
import { WORLD_MULTI_PROCESS_VERDICT, WORLD_PUBLIC_ADDRESS } from "./core/infra/config";
import type { WorldMultiProcessVerdict } from "./core/infra/worldMultiProcess";
import { WorldRoom } from "./rooms/WorldRoom";
import { assertWorldProfilesConfigured } from "./rooms/core/WorldProfile";
import { registerDefaultWorldModes } from "./rooms/modes/catalog";

let registered = false;

/** world 形态玩法登记（codegen 分表 `registerGeneratedWorldModes`）+ WorldProfile 启动期断言；幂等（合体入口与 world 入口都可调）。 */
export function registerWorldRuntime(): void {
    if (registered) return;
    registered = true;
    registerDefaultWorldModes();
    assertWorldProfilesConfigured();
}

export const worldRooms = {
    [RoomName.World]: defineRoom(WorldRoom).filterBy(["sId", "mode", "profile", "mapId", "line"]),
};

// ── MMO MF10-B2：多 world 进程启用路径（只在多个 world 进程之间；lobby / game 进程不需要，D27）──────────────────────────────

/** 放置钩子（`selectProcessIdToCreateRoom`）：按 roomName / 客户端 options 决定在哪个 world 进程建房；缺省不装 = Colyseus「最少房间」策略。 */
export interface WorldPlacementPort {
    select(roomName: string, options: unknown): Promise<string>;
}

export interface WorldServerOptionsInput {
    /** 缺省 = config.ts 加载期裁决（WORLD_MULTI_PROCESS + REDIS_COLYSEUS_URL 断言）。 */
    readonly verdict?: WorldMultiProcessVerdict;
    /** 缺省 WORLD_PUBLIC_ADDRESS（host[:port]）。 */
    readonly publicAddress?: string;
    /** driver / presence 工厂（单测注入假件；⛔ 生产改动）。 */
    readonly factories?: { driver(url: string): MatchMakerDriver; presence(url: string): Presence };
    readonly placement?: WorldPlacementPort | null;
}

export interface WorldServerOptions {
    driver?: MatchMakerDriver;
    presence?: Presence;
    publicAddress?: string;
    selectProcessIdToCreateRoom?: (roomName: string, options: unknown) => Promise<string>;
}

const productionFactories = {
    driver: (url: string): MatchMakerDriver => new RedisDriver(url),
    presence: (url: string): Presence => new RedisPresence(url),
};

/**
 * world 进程的 Server 选项片段：未启用 ⇒ `{}`（Colyseus 单进程缺省 driver / presence）；启用 ⇒ RedisDriver / RedisPresence 构造于
 * REDIS_COLYSEUS_URL（已断言独立实例）+ publicAddress + 可选放置钩子。合体入口 app.config.ts 与拆分后的 world 入口都用它。
 */
export function worldServerOptions(input: WorldServerOptionsInput = {}): WorldServerOptions {
    const verdict = input.verdict ?? WORLD_MULTI_PROCESS_VERDICT;
    if (!verdict.enabled) return {};
    const factories = input.factories ?? productionFactories;
    const options: WorldServerOptions = { driver: factories.driver(verdict.colyseusUrl), presence: factories.presence(verdict.colyseusUrl) };
    const publicAddress = input.publicAddress ?? WORLD_PUBLIC_ADDRESS;
    if (publicAddress !== "") options.publicAddress = publicAddress;
    const placement = input.placement ?? null;
    if (placement) options.selectProcessIdToCreateRoom = (roomName, options) => placement.select(roomName, options);
    return options;
}
