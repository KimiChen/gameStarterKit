/**
 * P2-02 风险加权故障/变异测试。
 *
 * 这些用例刻意从已知高风险边界构造「一处变异」：extra key、null/NaN、越界
 * 数值、未知枚举和不可 structured-clone 的输入。每个变异都必须在进入领域
 * 状态或 transport 前失败；测试同时覆盖 worker 失败后的池恢复。用例保持无头，
 * 不依赖 Redis/MySQL，因而可作为每次提交的快速故障闸。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  C2S,
  S2C,
  UserRpc,
  LobbyPush,
  validateC2SPayload,
  validateEffect,
  validateLobbyPush,
  validateLobbyRpcRequest,
  validateRpcEnvelope,
  validateRpcReply,
  validateS2CPayload,
  WireValidationError,
} from "@game/shared";
import { destroyPool, runInPool } from "../src/core/compute/pool";
import type { IBattleSimInput, IBattleSimResult } from "../src/core/compute/tasks/battleSim";
import { LifecycleRegistry } from "../src/core/infra/lifecycle";
import { CharacterReadyCoordinator } from "../src/player/character";
import { exerciseFaultPoint } from "./faultMatrix";

type MutationCase = {
  readonly id: string;
  readonly validate: (value: unknown) => unknown;
  readonly value: unknown;
};

const validEffect = {
  schemaVersion: 1,
  grants: [{ kind: "item", itemId: 7, count: 1 }],
};

const mutationCases: readonly MutationCase[] = [
  {
    id: "rpc.extra-key",
    validate: validateRpcEnvelope,
    value: { id: "r1", type: "user.getInfo", payload: {}, extra: true },
  },
  {
    id: "rpc.null-payload",
    validate: (value) => validateLobbyRpcRequest(UserRpc.GetInfo, value),
    value: { id: "r1", type: "user.getInfo", payload: null },
  },
  {
    id: "rpc.reply-data-and-error",
    validate: validateRpcReply,
    value: { id: "r1", ok: true, data: {}, err: { code: "INTERNAL", msg: "x" } },
  },
  {
    id: "c2s.nan-move",
    validate: (value) => validateC2SPayload(C2S.Move, value),
    value: { dirX: Number.NaN, dirY: 0 },
  },
  {
    id: "c2s.extra-key",
    validate: (value) => validateC2SPayload(C2S.Chat, value),
    value: { text: "hello", admin: true },
  },
  {
    id: "s2c.infinity-pong",
    validate: (value) => validateS2CPayload(S2C.Pong, value),
    value: { clientTime: 1, serverTime: Number.POSITIVE_INFINITY },
  },
  {
    id: "push.unknown-type",
    validate: validateLobbyPush,
    value: { type: "future.admin", data: {} },
  },
  {
    id: "push.extra-key",
    validate: validateLobbyPush,
    value: { type: LobbyPush.MailNew, data: { mailId: 1, body: "unexpected" } },
  },
  {
    id: "effect.unknown-kind",
    validate: validateEffect,
    value: { ...validEffect, grants: [...validEffect.grants, { kind: "gold", count: 1 }] },
  },
  {
    id: "effect.reserved-field",
    validate: validateEffect,
    value: { ...validEffect, grants: [{ kind: "setField", field: "uid", value: "attacker" }] },
  },
  {
    id: "effect.zero-count",
    validate: validateEffect,
    value: { ...validEffect, grants: [{ kind: "item", itemId: 7, count: 0 }] },
  },
  {
    id: "effect.nan-delta",
    validate: validateEffect,
    value: { ...validEffect, grants: [{ kind: "star", delta: Number.NaN }] },
  },
];

test("fault-matrix 子进程收到显式组与故障点配置", () => {
  if (process.env.FAULT_MATRIX !== "1") return;
  assert.match(process.env.FAULT_MATRIX_GROUP ?? "", /^[a-z0-9][a-z0-9-]*$/);
  assert.match(process.env.FAULT_MATRIX_KIND ?? "", /^(unit|integration)$/);
  const points = (process.env.FAULT_MATRIX_FAULT_POINTS ?? "").split(",").filter(Boolean);
  assert.ok(points.length > 0, "fault-matrix 必须向测试传递至少一个 fault point");
  assert.equal(process.env.FAULT_MATRIX_INTEGRATION, "0", "unit 组不得误标成 integration");
});

test("风险加权 wire/effect 变异：每个单点变异均 fail-closed", async () => {
  await exerciseFaultPoint("wire-mutation", () => {
    for (const mutation of mutationCases) {
      assert.throws(
        () => mutation.validate(mutation.value),
        (error: unknown) => error instanceof WireValidationError || error instanceof Error,
        `${mutation.id} 必须拒绝变异输入`,
      );
    }
  });
});

test("故障注入：compute structured-clone 失败后 worker 池仍可用", async () => {
  await exerciseFaultPoint("worker-replacement", async () => {
    // postMessage 的 DataCloneError 发生在 worker 之前；pool 必须归还健康 worker，
    // 不能把异常冒进为 uncaught exception，也不能让下一项任务永久排队。
    await assert.rejects(runInPool("battleSim", (() => "not-cloneable") as unknown as IBattleSimInput));
    const result = await runInPool<IBattleSimInput, IBattleSimResult>("battleSim", {
      iterations: 8,
      attackerLevel: 1,
    });
    assert.equal(result.iterations, 8);
  });
});

test("故障注入：任务异常是受控 reject，后续任务继续完成", async () => {
  await assert.rejects(runInPool("definitely-missing-task", {}));
  const result = await runInPool<IBattleSimInput, IBattleSimResult>("battleSim", {
    iterations: 3,
    attackerLevel: 2,
  });
  assert.equal(result.iterations, 3);
});

test("故障收尾：destroyPool 可等待并允许下一轮重建", async () => {
  await destroyPool();
  const result = await runInPool<IBattleSimInput, IBattleSimResult>("battleSim", {
    iterations: 1,
    attackerLevel: 1,
  });
  assert.equal(result.iterations, 1);
  await destroyPool();
});

test("故障注入：character ready deferred 超时不释放底层 flight", async () => {
  await exerciseFaultPoint("character-ready-deferred", async () => {
    let release!: () => void;
    const work = new Promise<void>((resolve) => { release = resolve; });
    const coordinator = new CharacterReadyCoordinator(() => work);

    // A zero caller budget deterministically exercises the timeout branch while
    // the underlying initializer remains owned by the coordinator.
    await assert.rejects(
      coordinator.ensure("fault-ready", 7, 0),
      /角色初始化超时 uid=fault-ready sId=7/,
    );
    release();
    await coordinator.ensure("fault-ready", 7, 100);
    await coordinator.drain();
  });
});

test("故障注入：lifecycle 启动半失败仍释放其余资源", async () => {
  await exerciseFaultPoint("lifecycle-startup-half-failure", async () => {
    const registry = new LifecycleRegistry();
    const released: string[] = [];
    registry.register("healthy", () => { released.push("healthy"); });
    registry.register("broken", () => {
      released.push("broken");
      throw new Error("injected startup failure");
    });
    await assert.rejects(registry.disposeAll(), AggregateError);
    assert.deepEqual(released, ["broken", "healthy"]);
    assert.equal(registry.size, 0);
  });
});
