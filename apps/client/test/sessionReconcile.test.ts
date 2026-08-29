import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SESSION_PROFILE_RECONCILE_TIMEOUT_MS,
  reconcileSessionProfile,
} from "../src/logic/page/SessionReconcileLogic";
import {
  clearSession,
  commitSessionProfile,
  getSessionIdentity,
  getSessionProfile,
  getUserId,
  isLoggedIn,
  isSessionIdentityCurrent,
  notifyConnLost,
  registerReturnToLogin,
  registerSessionReconciler,
  setSession,
  type SessionReconcileIdentity,
} from "../src/net/session";
import type { IUserView } from "../src/shared/index";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function login(uid: string): SessionReconcileIdentity {
  setSession({ userId: uid, accessToken: `${uid}.access-token`, isNewAccount: false });
  const identity = getSessionIdentity();
  assert.ok(identity);
  return identity;
}

function profile(uid: string, ver: number): IUserView {
  return {
    uid,
    star: ver,
    maxRound: 0,
    wins: ver,
    losses: 0,
    stamina: 100,
    lastStaminaRecoverAt: 0,
    musicOn: true,
    sfxOn: true,
    guildId: 0,
    ver,
  };
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let spin = 0; spin < 100; spin++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(message);
}

test("session profile：按完整 identity 原子提交副本，新登录拒绝旧快照", () => {
  try {
    const oldIdentity = login("u_profile_old");
    const input = profile(oldIdentity.userId, 1);
    assert.equal(commitSessionProfile(oldIdentity, input), true);
    input.wins = 999;
    const first = getSessionProfile();
    assert.equal(first?.wins, 1, "提交边界必须持有自己的档案副本");
    if (first) first.wins = 888;
    assert.equal(getSessionProfile()?.wins, 1, "读取方也不能回写模块内快照");

    const freshIdentity = login("u_profile_new");
    assert.equal(getSessionProfile(), null, "新登录开始时不能沿用旧账号角色快照");
    assert.equal(commitSessionProfile(oldIdentity, profile(oldIdentity.userId, 2)), false,
      "旧 generation 的迟到快照必须被拒绝");
    assert.equal(commitSessionProfile(freshIdentity, profile(freshIdentity.userId, 3)), true);
    assert.equal(getSessionProfile()?.uid, freshIdentity.userId);
  } finally {
    clearSession();
  }
});

test("Lobby 最终断线：并发事件合流一次，原 token 重连并刷新角色快照", async () => {
  const reasons: string[] = [];
  let connects = 0;
  let leaves = 0;
  const infoGate = deferred<{ user: IUserView }>();
  const identity = login("u_reconcile_success");
  commitSessionProfile(identity, profile(identity.userId, 1));
  const offReturn = registerReturnToLogin((reason) => { reasons.push(reason.kind); });
  const offReconcile = registerSessionReconciler(async (captured) => {
    const result = await reconcileSessionProfile(captured, {
      connect: (actual, control) => {
        connects++;
        assert.equal(actual.accessToken, identity.accessToken, "必须复用当前内存 token，不重新签发 session");
        assert.equal(control.timeoutMs, SESSION_PROFILE_RECONCILE_TIMEOUT_MS);
        return { ready: Promise.resolve(), leave: () => { leaves++; } };
      },
      getInfo: () => infoGate.promise,
      isCurrent: isSessionIdentityCurrent,
      commitProfile: commitSessionProfile,
    });
    return result.status === "reconciled";
  });
  try {
    notifyConnLost();
    notifyConnLost();
    await waitFor(() => connects === 1, "重复最终断线必须合流到一个 reconciliation");
    assert.equal(isLoggedIn(), true, "对账完成前保留原会话，不能先清 bearer");
    infoGate.resolve({ user: profile(identity.userId, 2) });
    await waitFor(() => getSessionProfile()?.ver === 2, "GetInfo 新快照必须原子提交");
    assert.equal(isLoggedIn(), true);
    assert.equal(getUserId(), identity.userId);
    assert.equal(leaves, 0, "成功后的 Lobby ownership 必须继续服务当前会话");
    assert.deepEqual(reasons, [], "成功对账不得回登录");
  } finally {
    offReconcile();
    offReturn();
    clearSession();
  }
});

test("Lobby 最终断线：对账失败释放本次 owner，再进入既有回登录事务", async () => {
  const reasons: string[] = [];
  let leaves = 0;
  login("u_reconcile_failure");
  const offReturn = registerReturnToLogin((reason) => { reasons.push(reason.kind); });
  const offReconcile = registerSessionReconciler(async (captured) => {
    try {
      await reconcileSessionProfile(captured, {
        connect: () => ({
          ready: Promise.reject(new Error("lobby unavailable")),
          leave: () => { leaves++; },
        }),
        getInfo: async () => ({ user: profile(captured.userId, 2) }),
        isCurrent: isSessionIdentityCurrent,
        commitProfile: commitSessionProfile,
      });
      return true;
    } catch {
      return false;
    }
  });
  try {
    notifyConnLost();
    await waitFor(() => reasons.length === 1, "对账失败必须落入 returnToLogin");
    assert.deepEqual(reasons, ["CONN_LOST"]);
    assert.equal(leaves, 1, "失败只能释放 reconciliation 自己的精确 ownership");
    assert.equal(isLoggedIn(), false);
    assert.equal(getSessionProfile(), null);
  } finally {
    offReconcile();
    offReturn();
    clearSession();
  }
});

test("Lobby 对账迟到：旧 generation 只释放旧 owner，不覆盖或关闭新登录", async () => {
  const oldReadyGate = deferred<void>();
  const reasons: string[] = [];
  const oldOwner = Symbol("old-owner");
  const newOwner = Symbol("new-owner");
  const connectedOwners = new Set<symbol>();
  const finishedOwners = new Set<symbol>();
  const releasedOwners = new Set<symbol>();
  const oldIdentity = login("u_reconcile_old");
  commitSessionProfile(oldIdentity, profile(oldIdentity.userId, 1));
  const offReturn = registerReturnToLogin((reason) => { reasons.push(reason.kind); });
  const offReconcile = registerSessionReconciler(async (captured) => {
    // ⛔ 每个世代都必须拿到一份**真实可释放**的 ownership：旧世代 leave 写 oldOwner、
    // 新世代 leave 写 newOwner。否则 `releasedOwners.has(newOwner)` 只是恒真断言，
    // 守不住「旧 continuation 释放了新登录 ownership」。
    const isOld = captured.generation === oldIdentity.generation;
    const owner = isOld ? oldOwner : newOwner;
    const result = await reconcileSessionProfile(captured, {
      connect: () => {
        connectedOwners.add(owner);
        return {
          ready: isOld ? oldReadyGate.promise : Promise.resolve(),
          leave: () => { releasedOwners.add(owner); },
        };
      },
      // 新世代自己也提交 ver 7，旧世代的迟到 ver 2 必须提交不进去。
      getInfo: async () => ({ user: profile(captured.userId, isOld ? 2 : 7) }),
      isCurrent: isSessionIdentityCurrent,
      commitProfile: commitSessionProfile,
    });
    finishedOwners.add(owner);
    return result.status === "reconciled";
  });
  try {
    notifyConnLost();
    await Promise.resolve();
    const freshIdentity = login("u_reconcile_new");
    commitSessionProfile(freshIdentity, profile(freshIdentity.userId, 7));

    // 新世代先跑完自己的一次对账并**保留**自己的 ownership：此后 newOwner 进入
    // releasedOwners 的唯一途径就是被旧 continuation 越权释放。
    notifyConnLost();
    await waitFor(() => finishedOwners.has(newOwner), "新登录世代必须能独立完成自己的对账");
    assert.equal(connectedOwners.has(newOwner), true, "新登录世代必须真的建立过 ownership");
    assert.equal(releasedOwners.has(newOwner), false, "对账成功的新 ownership 不得被自己释放");

    // `finishedOwners` 在 reconcileSessionProfile 的 finally（含 await leave）之后才写，
    // 因此这里两个方向的释放都已经落定，可以直接判别旧 continuation 释放了谁。
    oldReadyGate.resolve(undefined);
    await waitFor(() => finishedOwners.has(oldOwner), "旧 reconciliation 必须结束自身");
    assert.equal(releasedOwners.has(newOwner), false, "旧 continuation 无权调用新登录 owner");
    assert.equal(releasedOwners.has(oldOwner), true, "旧 reconciliation 完成后必须释放自己的 owner");
    assert.equal(isLoggedIn(), true);
    assert.equal(getUserId(), freshIdentity.userId);
    assert.equal(getSessionProfile()?.ver, 7, "旧 GetInfo 不得覆盖新账号快照");
    assert.deepEqual(reasons, [], "旧失败不得把新 generation 导航回登录");
  } finally {
    offReconcile();
    offReturn();
    clearSession();
  }
});

test("Lobby 对账控制：join 使用显式 timeout，页面取消后结果 stale 并释放精确 owner", async () => {
  const identity = login("u_reconcile_cancel");
  const readyGate = deferred<void>();
  const controller = new AbortController();
  let leaves = 0;
  try {
    const running = reconcileSessionProfile(identity, {
      connect: (_captured, control) => {
        assert.equal(control.timeoutMs, SESSION_PROFILE_RECONCILE_TIMEOUT_MS);
        assert.strictEqual(control.signal, controller.signal);
        return { ready: readyGate.promise, leave: () => { leaves++; } };
      },
      getInfo: async () => ({ user: profile(identity.userId, 2) }),
      isCurrent: isSessionIdentityCurrent,
      commitProfile: commitSessionProfile,
    }, controller.signal);
    controller.abort();
    readyGate.resolve(undefined);
    assert.deepEqual(await running, { status: "stale" });
    assert.equal(leaves, 1);
    assert.equal(getSessionProfile(), null);
  } finally {
    clearSession();
  }
});
