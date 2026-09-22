import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HeroRecruitLogic,
  describeHeroRecruitError,
} from "../src/plugins/heroRecruit/logic/HeroRecruitLogic";
import type { HeroRecruitRuntime } from "../src/plugins/heroRecruit/logic/heroRecruitRuntime";

class FakeRpcError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const initial = {
  copper: 1_000,
  ownedHeroIds: [],
  catalog: [
    {
      heroId: 1001,
      name: "赵云",
      title: "龙胆将军",
      rarity: 3,
      copperPrice: 500,
    },
    {
      heroId: 1002,
      name: "貂蝉",
      title: "闭月舞姬",
      rarity: 4,
      copperPrice: 900,
    },
  ],
} as const;

function runtimeWith(
  buy: HeroRecruitRuntime["buy"] = async () => ({
    purchasedHeroId: 1001,
    snapshot: { ...initial, copper: 500, ownedHeroIds: [1001] },
  }),
) {
  const runtime = {
    closed: 0,
    getCatalog: async () => ({ snapshot: initial }),
    buy,
    close() {
      runtime.closed += 1;
    },
  };
  return runtime as typeof runtime & HeroRecruitRuntime;
}

test("heroRecruit：读取服务端目录后按余额与拥有状态开关招募，成功只采用服务端快照", async () => {
  const runtime = runtimeWith();
  const logic = new HeroRecruitLogic(runtime);
  assert.equal(
    logic.canBuy(initial.catalog[0]),
    false,
    "未读取目录前不发写请求",
  );
  assert.equal(await logic.refresh(), true);
  assert.equal(logic.copper(), 1_000);
  assert.equal(logic.canBuy(initial.catalog[0]), true);
  assert.equal(await logic.buy(1001), true);
  assert.equal(logic.copper(), 500);
  assert.equal(logic.owns(1001), true);
  assert.equal(logic.canBuy(initial.catalog[0]), false, "已拥有不可重复招募");
  assert.match(logic.currentNotice().text, /已招募 赵云/u);
  logic.close();
  assert.equal(runtime.closed, 1);
});

test("heroRecruit：余额不足和服务端错误不自行扣款，失败后保留快照可重试", async () => {
  const runtime = runtimeWith(async () => {
    throw new FakeRpcError("HERO_RECRUIT_INSUFFICIENT_COPPER");
  });
  const logic = new HeroRecruitLogic(runtime);
  await logic.refresh();
  assert.equal(await logic.buy(1001), false);
  assert.equal(logic.copper(), 1_000);
  assert.equal(logic.canBuy(initial.catalog[0]), true, "失败后解除在途闸");
  assert.equal(
    describeHeroRecruitError(new FakeRpcError("HERO_RECRUIT_ALREADY_OWNED")),
    "你已经拥有这名英雄",
  );
  assert.match(
    describeHeroRecruitError(new FakeRpcError("TIMEOUT")),
    /不会重复扣款/u,
  );
});

test("heroRecruit：runtime 未装载时不发网络请求", async () => {
  const logic = new HeroRecruitLogic(null);
  assert.equal(await logic.refresh(), false);
  assert.equal(await logic.buy(1001), false);
  assert.match(logic.currentNotice().text, /未就绪/u);
});
