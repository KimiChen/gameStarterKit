/**
 * net/session 会话语义单测（D1' 三场景的无头钉子）：
 * 登录入态 / 踢线（authInvalid 先清态再广播、未登录时吞掉防重复弹窗）/ 换号（clear 后新登）/
 * connLost 保留登录态（非鉴权死亡，可原 token 重连）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearSession, getUserId, isLoggedIn, notifyAuthInvalid, notifyConnLost,
  onAuthInvalid, onConnLost, setSession,
} from "../src/net/session";
import { getToken } from "../src/core/http";

const login = (uid: string) => setSession({ userId: uid, token: `${uid}.${"a".repeat(48)}`, isNew: false });

test("session：登录入态 / 换号 = clear 后新登", () => {
  login("u_1");
  assert.equal(isLoggedIn(), true);
  assert.equal(getUserId(), "u_1");
  assert.ok(getToken().startsWith("u_1."), "token 进 core/http（HTTP Bearer / 房间 join 共用）");

  clearSession(); // 换号第一步
  assert.equal(isLoggedIn(), false);
  assert.equal(getToken(), "", "登出必须清 token（旧号凭证不得残留给新号请求）");
  login("u_2");
  assert.equal(getUserId(), "u_2");
  clearSession();
});

test("session：踢线先清态再广播；未登录时的迟到上报吞掉（防重复弹窗）", () => {
  const reasons: string[] = [];
  const un = onAuthInvalid((r) => {
    reasons.push(r);
    assert.equal(isLoggedIn(), false, "回调触发时会话必须已清（UI 直接回登录页，不会再用旧 token 发请求）");
  });
  login("u_kick");
  notifyAuthInvalid("AUTH_EPOCH_STALE");
  assert.deepEqual(reasons, ["AUTH_EPOCH_STALE"]);
  notifyAuthInvalid("AUTH_REQUIRED"); // 已清态：迟到的第二发不得再广播
  assert.deepEqual(reasons, ["AUTH_EPOCH_STALE"], "未登录状态下的上报必须被吞掉");
  un();
  clearSession();
});

test("session：connLost 保留登录态（非鉴权死亡，可原 token 重连）", () => {
  let lost = 0;
  const un = onConnLost(() => { lost++; });
  login("u_net");
  notifyConnLost();
  assert.equal(lost, 1);
  assert.equal(isLoggedIn(), true, "连接死亡 ≠ 鉴权失效，登录态保留");
  un();
  clearSession();
});

// ── 战斗连接死亡事件（M12d 评审：GameRoom 断线原先无人上报 → Main 卡 inBattle=true） ──

test("battleLost 与 connLost 是两个独立事件（战斗断线 ⛔ 不当成大厅断线）", async () => {
  const { onBattleLost, notifyBattleLost, onConnLost, notifyConnLost } = await import("../src/net/session");
  let battle = 0, conn = 0;
  const offB = onBattleLost(() => { battle++; });
  const offC = onConnLost(() => { conn++; });
  try {
    notifyBattleLost();
    assert.deepEqual([battle, conn], [1, 0], "战斗断线只触发 battleLost");
    notifyConnLost();
    assert.deepEqual([battle, conn], [1, 1], "大厅断线只触发 connLost");
  } finally { offB(); offC(); }
});

test("battleLost 处理器抛错不影响其它订阅者（Main 回滚 + pages 导航互不牵连）", async () => {
  const { onBattleLost, notifyBattleLost } = await import("../src/net/session");
  const seen: string[] = [];
  const off1 = onBattleLost(() => { seen.push("main"); throw new Error("boom"); });
  const off2 = onBattleLost(() => { seen.push("pages"); });
  try {
    notifyBattleLost();
    assert.deepEqual(seen, ["main", "pages"], "前一个抛错，后一个照常收到");
  } finally { off1(); off2(); }
});

test("⛔ battleLost 不清登录态（只是这一局没了，token 仍有效）", async () => {
  const { setSession, isLoggedIn, notifyBattleLost } = await import("../src/net/session");
  setSession({ userId: "u_bl", token: "t_bl", isNew: false });
  notifyBattleLost();
  assert.equal(isLoggedIn(), true, "登录态保留（与 authInvalid 的区别）");
});
