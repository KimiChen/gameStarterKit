/**
 * world 进程 config（MMO MF4-B6；docs/MMO.md D27 / MMO-PLAN PS4）：WorldRoom 登记 + world 形态玩法装配。
 * PS1 / PS4 的入口拆分（`entries/world.ts` + `WORLD_PORT`）尚未落地，当前由合体入口 `app.config.ts` 合并本文件
 * （`...worldRooms` + `registerWorldRuntime()`）；拆分后本文件原样成为 world 进程的 rooms 表，⛔ 不登记进 lobby / game 的 config。
 *
 * ⚠ `filterBy(["sId","mode","profile","mapId","line"])`：撮合只在同区同玩法同图（同线）内匹配；缺 `line` 的 join 不参与该键过滤
 * （服务端分配，v1 = DEFAULT_WORLD_LINE），房内 onJoin 仍以 onAuth 权威值对 mapId / line 再闸一次（joinById 直连）。
 */
import { defineRoom } from "colyseus";
import { RoomName } from "@game/shared";
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
