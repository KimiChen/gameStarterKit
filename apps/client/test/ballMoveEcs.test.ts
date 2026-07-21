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

test("eid 复用防残值：addPlayer 必须全量覆写 PlayerModel 每个字段", () => {
  // bitECS 的 removeEntity 会回收 eid，SoA 数组保留旧值——新实体的唯一防线是
  // addPlayer 全字段赋值。本测试机检这条约定：给 PlayerModel 新增字段却漏改
  // addPlayer 时，复用 eid 上该字段为 undefined（或残留前任的值），当场红。
  const ecs = GameECS.inst;
  ecs.clear();

  // 先用 filler 烧掉前面用例已触碰过的 eid（单例共进程，eid 1 被上一用例的
  // addPlayer/syncPlayer 写过全部字段——若在它上面演练回收，syncPlayer 路径的
  // 残值会把 undefined 兜底网填住，漏改 addPlayer 也测不红）。烧掉后，回收演练
  // 发生在本用例独占的全新 eid 上，字段只来自 recycle-a 的 addPlayer。
  ecs.addPlayer(player("filler"), false);
  const first = ecs.addPlayer({ ...player("recycle-a", 300, 300), hp: 1, alive: false }, true);
  ecs.removePlayer("recycle-a");
  const second = ecs.addPlayer(player("recycle-b", 50, 60), false);
  assert.equal(second, first, "removeEntity 后 eid 应被回收复用（前提不成立则本测试失去意义）");

  for (const key of Object.keys(PlayerModel) as (keyof typeof PlayerModel)[]) {
    assert.notEqual(PlayerModel[key][second], undefined,
      `PlayerModel.${String(key)} 在 addPlayer 里没有赋值——eid 复用会读到 undefined/残值，新增字段必须同步进 addPlayer`);
  }
  assert.equal(PlayerModel.id[second], "recycle-b");
  assert.equal(PlayerModel.hp[second], 80, "hp 残留了前任实体的值");
  assert.equal(PlayerModel.alive[second], true, "alive 残留了前任实体的值");
  assert.equal(PlayerModel.isSelf[second], false, "isSelf 残留了前任实体的值");
  assert.equal(PlayerModel.x[second], 50, "渲染坐标未按新实体重置");
  ecs.clear();
});
