/**
 * 铜币收益插件（plugins/income）客户端逻辑：弹窗文案、领取闸与在途闸、5 秒心跳节拍、
 * 「该账号没有铜币收益数据」的一次性停用，以及宿主未就绪（runtime null）时 ⛔ 不做假实现。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatDuration,
  IncomeLogic,
  POLL_INTERVAL_SECONDS,
} from "../src/plugins/income/logic/IncomeLogic";
import type { IncomeRuntime } from "../src/plugins/income/logic/incomeRuntime";
import type {
  IIncomeClaimOfflineRes,
  IIncomeGetPendingRes,
  IIncomeSettleOnlineRes,
} from "../src/shared/protocol/lobbyRpc/domains/income";
import { lobbyDataSync } from "../src/net/LobbyDataSync";

class FakeRpcError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const SNAPSHOT: IIncomeGetPendingRes = {
  level: 3,
  intervalSeconds: POLL_INTERVAL_SECONDS,
  perInterval: 334,
  offlineSeconds: 120,
  offlineCopper: 8016,
  copper: 1668,
};

type Stub = {
  readonly runtime: IncomeRuntime;
  readonly calls: {
    pending: number;
    settle: number;
    claim: number;
    opened: number;
    closed: number;
  };
};

function stub(
  options: {
    pending?: () => Promise<IIncomeGetPendingRes>;
    settleOnline?: () => Promise<IIncomeSettleOnlineRes>;
    claimOffline?: () => Promise<IIncomeClaimOfflineRes>;
  } = {},
): Stub {
  const calls = { pending: 0, settle: 0, claim: 0, opened: 0, closed: 0 };
  const runtime: IncomeRuntime = {
    pending: async () => {
      calls.pending += 1;
      return (options.pending ?? (async () => SNAPSHOT))();
    },
    settleOnline: async () => {
      calls.settle += 1;
      return (
        options.settleOnline ?? (async () => ({ copper: 334, balance: 2002 }))
      )();
    },
    claimOffline: async () => {
      calls.claim += 1;
      return (
        options.claimOffline ??
        (async () => ({ copper: 8016, offlineSeconds: 120, balance: 9684 }))
      )();
    },
    open: async () => {
      calls.opened += 1;
    },
    close: () => {
      calls.closed += 1;
    },
  };
  return { runtime, calls };
}

test("income：预览快照驱动弹窗文案；领取后待领清零、余额取服务端回执", async () => {
  const { runtime, calls } = stub();
  const logic = new IncomeLogic(runtime);
  let changed = 0;
  logic.onChanged = () => {
    changed += 1;
  };

  assert.equal(logic.canClaim(), false, "快照未到位时不可领取");
  assert.equal(await logic.refresh(), true);
  assert.equal(calls.pending, 1);
  assert.equal(logic.hasOffline(), true);
  assert.equal(logic.shouldPopup(), true);
  assert.equal(logic.canClaim(), true);
  assert.equal(logic.title(), "离线收益");
  assert.match(logic.body(), /你离线了 2 分/u);
  assert.match(logic.body(), /按 3 级每 5 秒 334 铜币计算/u);
  assert.match(logic.body(), /共获得 8016 铜币/u);
  assert.match(logic.balanceText(), /当前铜币 1668 · 3 级每 5 秒 334/u);

  assert.equal(await logic.claim(), 8016);
  assert.equal(logic.hasOffline(), false, "领取后待领清零");
  assert.equal(logic.balance(), 9684, "余额取服务端回执，⛔ 不自己加");
  assert.equal(logic.currentNotice().kind, "success");
  assert.match(logic.currentNotice().text, /已领取 8016 铜币，当前余额 9684/u);
  assert.equal(logic.canClaim(), false);
  assert.equal(await logic.claim(), 0, "无待领时 no-op，不再发请求");
  assert.equal(calls.claim, 1);

  logic.close();
  assert.equal(calls.closed, 1);
  // refresh（在途开/关）+ claim（在途开/关）= 4 次重绘。
  assert.equal(changed, 4);
});

test("income：5 秒心跳只在攒满一个周期时到点，余量留到下一拍", async () => {
  const { runtime, calls } = stub();
  const logic = new IncomeLogic(runtime);

  assert.equal(logic.tick(2), false);
  assert.equal(logic.tick(2), false);
  assert.equal(logic.tick(1), true, "累计满 5 秒到点");
  assert.equal(logic.tick(4), false, "到点后累计清零，重新攒");
  assert.equal(logic.tick(1), true);
  assert.equal(logic.tick(7), true, "超过一拍仍只算一拍");
  assert.equal(logic.tick(0), false);
  assert.equal(logic.tick(Number.NaN), false);
  assert.equal(logic.tick(-3), false);

  assert.equal(calls.settle, 0, "tick 只判定不发送");
  assert.equal(logic.balance(), 0, "没拉过预览时没有余额快照，⛔ 不凭空造");
  assert.equal(await logic.poll(), 334);
  assert.equal(calls.settle, 1);
  assert.equal(logic.balance(), 0, "心跳不改动不存在的快照");

  // 拉过预览之后，心跳回执才刷新余额（弹窗打开时才需要余额，心跳本身只负责入账）。
  await logic.refresh();
  assert.equal(await logic.poll(), 334);
  assert.equal(logic.balance(), 2002);
});

test("income：错误保留可重试提示，收益账户不因请求失败停用", async () => {
  const lost = stub({
    pending: async () => {
      throw new FakeRpcError("USER_DATA_LOST");
    },
  });
  const logic = new IncomeLogic(lost.runtime);
  assert.equal(await logic.refresh(), false);
  assert.equal(logic.shouldPopup(), false);
  assert.equal(logic.canClaim(), false);
  assert.equal(logic.tick(30), true, "请求失败后仍保留下一拍心跳");
  assert.equal(await logic.poll(), 334);
  assert.equal(lost.calls.settle, 1);
  assert.equal(logic.currentNotice().kind, "error");
  assert.match(logic.currentNotice().text, /USER_DATA_LOST/u);

  const offline = stub({
    settleOnline: async () => {
      throw new FakeRpcError("CONN_LOST");
    },
  });
  const retryable = new IncomeLogic(offline.runtime);
  await retryable.refresh();
  assert.equal(await retryable.poll(), 0);
  assert.match(retryable.currentNotice().text, /网络不可用，稍后自动重试/u);
  assert.equal(retryable.tick(POLL_INTERVAL_SECONDS), true, "仍继续心跳");
});

test("income：宿主未装载（runtime null）时全部 no-op，⛔ 不做假实现", async () => {
  const logic = new IncomeLogic(null);
  assert.equal(logic.isReady(), false);
  assert.equal(logic.canClaim(), false);
  assert.equal(logic.shouldPopup(), false);
  assert.equal(logic.tick(30), false);
  assert.equal(await logic.refresh(), false);
  assert.equal(await logic.claim(), 0);
  assert.equal(await logic.poll(), 0);
  assert.equal(logic.currentNotice().kind, "error");
  logic.close();
});

test("income：余额以统一模块状态为准，领取不需要业务自己记账", async () => {
  // BF8 退出条件：领取成功后即使业务 Logic 不手工改余额，客户端统一状态也由 reply.sync
  // 得到正确余额。这里用**故意与同步值不同**的领取回执，逼出「谁是真源」这个问题。
  lobbyDataSync.reset();
  try {
    const { runtime } = stub({
      claimOffline: async () => ({
        copper: 8016,
        offlineSeconds: 120,
        balance: 4242,
      }),
    });
    const logic = new IncomeLogic(runtime);
    assert.equal(await logic.refresh(), true);
    assert.equal(logic.balance(), 1668, "统一状态未到位时兜底到本次预览快照");

    // 服务端提交后的 reply.sync 到达（与主动 sync 走同一 apply 入口）。
    lobbyDataSync.apply({
      mods: { versions: { user: 1 }, user: { copper: 9684 } },
    });
    assert.equal(logic.balance(), 9684, "统一模块状态必须压过预览快照");
    assert.match(logic.balanceText(), /当前铜币 9684 · 3 级每 5 秒 334/u);

    // 领取回执只服务「本次领取」的展示与确认：它不定义当前余额。
    assert.equal(await logic.claim(), 8016);
    assert.match(
      logic.currentNotice().text,
      /已领取 8016 铜币，当前余额 4242/u,
    );
    assert.equal(
      logic.balance(),
      9684,
      "余额仍由统一状态给出，⛔ 不因回执改写",
    );
    assert.match(
      logic.balanceText(),
      /当前铜币 9684 ·/u,
      "弹窗余额行同样取统一状态",
    );
  } finally {
    lobbyDataSync.reset();
  }
});

test("income：formatDuration 边界", () => {
  assert.equal(formatDuration(0), "0 秒");
  assert.equal(formatDuration(59), "59 秒");
  assert.equal(formatDuration(60), "1 分");
  assert.equal(formatDuration(125), "2 分 5 秒");
  assert.equal(formatDuration(-10), "0 秒");
});
