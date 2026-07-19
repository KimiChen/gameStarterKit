/**
 * ballMove 局内 ECS 无头单测（logic/rooms/ 纯 TS + bitECS，不依赖 cc）。
 * 覆盖：addPlayer/syncPlayer/removePlayer 状态镜像、插值系统逼近 target、
 * getSelfPlayer/forEachPlayer/clear 的实体管理语义。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GameECS } from "../src/logic/rooms/ballMove/GameECS";
import { PlayerModel } from "../src/logic/rooms/ballMove/GameComps";
import type { IPlayerState } from "../src/shared/index";

const player = (id: string, x = 0, y = 0): IPlayerState =>
  ({ id, name: `玩家${id}`, hp: 80, maxHp: 100, alive: true, x, y });

test("ballMove ECS：add/sync/插值/remove/clear", () => {
  const ecs = GameECS.inst;
  ecs.clear(); // 单例跨用例共享，先复位

  // onAdd：状态镜像 + 渲染坐标=服务端坐标 + isSelf
  const eid = ecs.addPlayer(player("s1", 100, 100), true);
  assert.equal(PlayerModel.id[eid], "s1");
  assert.equal(PlayerModel.hp[eid], 80);
  assert.equal(PlayerModel.x[eid], 100);
  assert.equal(ecs.getSelfPlayer(), eid);

  // onChange：坐标只改 target，渲染坐标不动
  ecs.syncPlayer({ ...player("s1"), hp: 60, x: 200, y: 200 });
  assert.equal(PlayerModel.hp[eid], 60);
  assert.equal(PlayerModel.targetX[eid], 200);
  assert.equal(PlayerModel.x[eid], 100);

  // 插值系统：渲染坐标向 target 逼近（k = dt*12）
  ecs.update(1 / 60); // k=0.2 → x: 100→120, y: 100→120
  assert.ok(Math.abs(PlayerModel.x[eid] - 120) < 1e-6);
  for (let i = 0; i < 120; i++) ecs.update(1 / 60);
  assert.ok(Math.abs(PlayerModel.x[eid] - 200) < 1e-3, "足够帧数后应收敛到 target");

  // forEachPlayer
  let count = 0;
  ecs.forEachPlayer(() => count++);
  assert.equal(count, 1);

  // onRemove
  ecs.removePlayer("s1");
  count = 0;
  ecs.forEachPlayer(() => count++);
  assert.equal(count, 0);
  assert.equal(ecs.getSelfPlayer(), null);

  // 未同步到的 id 操作不炸
  ecs.syncPlayer(player("ghost"));
  ecs.removePlayer("ghost");
  ecs.clear();
});
