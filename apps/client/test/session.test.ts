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
