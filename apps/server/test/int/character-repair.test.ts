import "./env-setup"; // ⚠ 必须第一个 import

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  K_CHARACTER_REPAIR_ATTEMPTS,
  K_CHARACTER_REPAIR_DUE,
  kUser,
} from "../../src/core/infra/keys";
import { clientFor, clientForKey, closeRedis } from "../../src/core/infra/redisRoute";
import { closeMysql } from "../../src/core/infra/mysql";
import { createUser } from "../../src/core/userRecord";
import { zoneCtx } from "../../src/core/infra/keys";
import { readCharacterRegistration } from "../../src/player/characterState";
import {
  characterRepairMember,
  clearCharacterRepairIntent,
  enqueueCharacterRepairIntent,
  processCharacterRepairOnce,
  registerCharacterWithRepair,
  startCharacterRepairWorker,
  stopCharacterRepairWorker,
} from "../../src/player/characterRepair";
import {
  assertRedisUp,
  cleanupUser,
  fakeWebPlatformClient,
  restoreFakeWebPlatformClient,
  sleep,
  testUid,
} from "./helpers";
import { exerciseFaultPoint } from "../faultMatrix";

const redis = () => clientForKey(K_CHARACTER_REPAIR_DUE);
const used: { userId: string; serverId: number }[] = [];
const intent = (name: string, serverId: number) => {
  const value = { userId: testUid(name).slice(0, 64), serverId };
  used.push(value);
  return value;
};

async function seedPendingProfile(item: { userId: string; serverId: number }): Promise<void> {
  assert.equal(await zoneCtx.run({ sId: item.serverId }, () => createUser(item.userId, {
    characterRegistration: "pending",
  })), "ok");
}

before(assertRedisUp);

after(async () => {
  await stopCharacterRepairWorker();
  for (const item of used) {
    await clearCharacterRepairIntent(item.userId, item.serverId).catch(() => {});
    await zoneCtx.run({ sId: item.serverId }, () => cleanupUser(item.userId)).catch(() => {});
  }
  restoreFakeWebPlatformClient();
  await closeRedis();
  await closeMysql();
});

test("PUT 失败：先写 durable intent，再把 WebPlatform 错误显式抛回", async () => {
  await exerciseFaultPoint("webplatform-register", async () => {
    const item = intent("enqueue", 11);
    const member = characterRepairMember(item.userId, item.serverId);
    const wpError = new Error("webplatform unavailable");

    await assert.rejects(
      registerCharacterWithRepair(item.userId, item.serverId, {
        registerCharacter: async () => { throw wpError; },
      }),
      (error: unknown) => error === wpError,
    );

    assert.ok(await redis().zscore(K_CHARACTER_REPAIR_DUE, member), "失败后 due intent 必须持久化");
    assert.equal(
      await redis().hget(K_CHARACTER_REPAIR_ATTEMPTS, member),
      "1",
      "同步 PUT 失败计为第一次 attempt",
    );
  });
});

test("processOnce：幂等 PUT 成功后同时清除 due 与 attempts", async () => {
  const item = intent("success", 12);
  const member = characterRepairMember(item.userId, item.serverId);
  await seedPendingProfile(item);
  await enqueueCharacterRepairIntent(item.userId, item.serverId, 0);

  const result = await processCharacterRepairOnce({
    nowMs: 10_000,
    client: fakeWebPlatformClient,
    batchSize: 1,
    concurrency: 1,
  });
  assert.deepEqual(result, { selected: 1, succeeded: 1, failed: 0, malformed: 0 });
  assert.equal(await redis().zscore(K_CHARACTER_REPAIR_DUE, member), null);
  assert.equal(await redis().hget(K_CHARACTER_REPAIR_ATTEMPTS, member), null);
  assert.equal(
    await fakeWebPlatformClient.hasCharacter(item.userId, item.serverId),
    true,
    "worker 调用 fake 的幂等 character register",
  );
});

test("processOnce：远端 PUT 成功后只把对应区的 profile marker 补为 ready", async () => {
  const item = intent("success-marker", 16);
  const member = characterRepairMember(item.userId, item.serverId);
  const profileKey = zoneCtx.run({ sId: item.serverId }, () => kUser(item.userId));
  const profileClient = clientFor(item.userId);
  try {
    await zoneCtx.run({ sId: item.serverId }, () => createUser(item.userId, {
      characterRegistration: "pending",
    }));
    await enqueueCharacterRepairIntent(item.userId, item.serverId, 0);

    const result = await processCharacterRepairOnce({
      nowMs: 10_000,
      client: fakeWebPlatformClient,
      batchSize: 1,
      concurrency: 1,
    });
    assert.deepEqual(result, { selected: 1, succeeded: 1, failed: 0, malformed: 0 });
    assert.equal(await profileClient.hget(profileKey, "characterRegistration"), "ready",
      "repair worker 必须在远端 PUT 成功后补写本区 marker");
    assert.equal(await profileClient.hget(profileKey, "characterRegistrationCheckedAt"), "10000",
      "repair worker 必须把本轮权威成功时间写入 marker");
    assert.equal(await profileClient.exists(profileKey), 1,
      "marker 更新不得删除或重建错误的 profile");
    assert.equal(await redis().zscore(K_CHARACTER_REPAIR_DUE, member), null);
    assert.equal(await redis().hget(K_CHARACTER_REPAIR_ATTEMPTS, member), null);
  } finally {
    await profileClient.unlink(profileKey).catch(() => {});
  }
});

test("readCharacterRegistration：真实 Redis marker 严格解析 checkedAt", async () => {
  const uid = testUid("marker-reader");
  const sId = 17;
  const profileKey = zoneCtx.run({ sId }, () => kUser(uid));
  const profileClient = clientFor(uid);
  try {
    await profileClient.unlink(profileKey);

    await profileClient.hset(profileKey, {
      characterRegistration: "ready",
      characterRegistrationCheckedAt: "123456",
    });
    assert.deepEqual(
      await readCharacterRegistration(uid, sId),
      { state: "ready", checkedAtMs: 123456 },
      "合法的非负安全整数毫秒应被解析为 number",
    );

    for (const value of ["", "-1", "1.5", "NaN", "9007199254740992", "garbage"]) {
      await profileClient.hset(profileKey, "characterRegistrationCheckedAt", value);
      assert.deepEqual(
        await readCharacterRegistration(uid, sId),
        { state: "ready", checkedAtMs: null },
        `非法 checkedAt=${JSON.stringify(value)} 必须退回权威复核`,
      );
    }

    await profileClient.hset(profileKey, "characterRegistration", "unknown");
    await profileClient.hdel(profileKey, "characterRegistrationCheckedAt");
    assert.deepEqual(
      await readCharacterRegistration(uid, sId),
      { state: null, checkedAtMs: null },
      "未知 marker 与缺失时间戳都必须 fail-closed",
    );
  } finally {
    await profileClient.unlink(profileKey).catch(() => {});
  }
});

test("多实例竞态：成功清理后，迟到的失败分支不得复活 intent", async () => {
  const item = intent("race", 13);
  const member = characterRepairMember(item.userId, item.serverId);
  await seedPendingProfile(item);
  await enqueueCharacterRepairIntent(item.userId, item.serverId, 0);

  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const arrive = async (): Promise<void> => {
    arrivals++;
    if (arrivals === 2) { release(); }
    await barrier;
  };

  const successClient = {
    registerCharacter: async () => { await arrive(); },
  };
  const lateFailureClient = {
    registerCharacter: async () => {
      await arrive();
      await sleep(30);
      throw new Error("late failure");
    },
  };

  const [success, failure] = await Promise.all([
    processCharacterRepairOnce({
      nowMs: 10_000, client: successClient, batchSize: 1, concurrency: 1,
    }),
    processCharacterRepairOnce({
      nowMs: 10_000, client: lateFailureClient, batchSize: 1, concurrency: 1,
    }),
  ]);
  assert.equal(success.succeeded, 1);
  assert.equal(failure.failed, 1);
  assert.equal(arrivals, 2, "两个实例都可重复取得同一 intent");
  assert.equal(await redis().zscore(K_CHARACTER_REPAIR_DUE, member), null, "成功后不复活 due");
  assert.equal(await redis().hget(K_CHARACTER_REPAIR_ATTEMPTS, member), null, "成功后不残留 attempts");
});

test("网关 worker start/stop：启动即处理到期 intent，stop 可等待当前 pass", async () => {
  const item = intent("lifecycle", 14);
  const member = characterRepairMember(item.userId, item.serverId);
  await seedPendingProfile(item);
  await enqueueCharacterRepairIntent(item.userId, item.serverId, 0);

  startCharacterRepairWorker();
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline
    && await redis().zscore(K_CHARACTER_REPAIR_DUE, member) !== null) {
    await sleep(20);
  }
  await stopCharacterRepairWorker();

  assert.equal(await redis().zscore(K_CHARACTER_REPAIR_DUE, member), null);
  assert.equal(await redis().hget(K_CHARACTER_REPAIR_ATTEMPTS, member), null);
  assert.equal(await fakeWebPlatformClient.hasCharacter(item.userId, item.serverId), true);
});

test("fault matrix：repair intent Redis wrong-type 失败被显式暴露", async () => {
  await exerciseFaultPoint("redis-repair-intent", async () => {
    const item = intent("redis-fault", 15);
    const member = characterRepairMember(item.userId, item.serverId);
    const client = redis();
    const backup = `${K_CHARACTER_REPAIR_DUE}:fault-backup:${process.pid}:${Date.now()}`;
    const hadDue = (await client.exists(K_CHARACTER_REPAIR_DUE)) === 1;
    if (hadDue) await client.rename(K_CHARACTER_REPAIR_DUE, backup);
    try {
      await client.set(K_CHARACTER_REPAIR_DUE, "wrong-type");
      const webPlatformError = new Error("injected WebPlatform outage");
      await assert.rejects(
        registerCharacterWithRepair(item.userId, item.serverId, {
          registerCharacter: async () => { throw webPlatformError; },
        }),
        (error: unknown) => {
          assert.ok(error instanceof AggregateError);
          assert.ok(error.errors.some((entry) => entry === webPlatformError));
          assert.ok(error.errors.some((entry) => /WRONGTYPE/i.test(String(entry))));
          return true;
        },
      );
      assert.equal(await client.get(K_CHARACTER_REPAIR_DUE), "wrong-type");
    } finally {
      await client.del(K_CHARACTER_REPAIR_DUE);
      await client.hdel(K_CHARACTER_REPAIR_ATTEMPTS, member);
      if (hadDue) await client.rename(backup, K_CHARACTER_REPAIR_DUE);
    }
    // The injected type violation must not leave an untracked intent behind.
    assert.equal(await client.zscore(K_CHARACTER_REPAIR_DUE, member), null);
  });
});
