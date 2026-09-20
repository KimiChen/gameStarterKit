/**
 * mmo kit 客户端 movement 面（MK1-B1，无头，⛔ cc）：dirFromJoystick 死区；IntentThrottle 限频合并；MovementPredictor 与服务端同源 resolveMove
 * 逐步回放一致（每步回执和解不跳）、迟到回执 ⇒ 位置回到回执、在途意图的方向 / 目标保留、旧回执忽略、撞墙预测与服务端一致（⛔ 客户端上报坐标）。
 * 变异验证（改哪一行 → 哪条用例转红）：reconcile 不忽略旧回执 → 「旧回执忽略」红；tick 不用碰撞网格 → 「撞墙」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    IntentThrottle, MovementPredictor, applyIntent, dirFromJoystick, parseCollisionGrid, resolveMove, type IMoveIntent, type IVec2, type MoveState,
} from "../src/kits/mmo/api/movement/index";
import { GREYBOX_PACK } from "../src/shared/kits/mmo/content/greybox";

const SIZE = { w: 2000, h: 2000 };
const GRID = parseCollisionGrid(GREYBOX_PACK.maps[0]!.collision, SIZE);
const round = (value: number): number => Math.round(value * 1000) / 1000;

test("dirFromJoystick：死区内 ⇒ 停；单位圆内原样；超单位圆归一", () => {
    assert.deepEqual(dirFromJoystick(0.1, 0.05), { x: 0, y: 0 });
    assert.deepEqual(dirFromJoystick(0.5, 0), { x: 0.5, y: 0 });
    const far = dirFromJoystick(2, 2);
    assert.deepEqual([round(far.x), round(far.y)], [0.707, 0.707]);
});

test("IntentThrottle：方向变了立即发；不变每 100 ms 一次；停总是立即发一次且不重复；reset 后重新计", () => {
    const throttle = new IntentThrottle(100);
    assert.equal(throttle.shouldSend(0, { x: 1, y: 0 }), true);
    assert.equal(throttle.shouldSend(50, { x: 1, y: 0 }), false, "同向 50 ms 内合并");
    assert.equal(throttle.shouldSend(100, { x: 1, y: 0 }), true, "同向满 100 ms 重发");
    assert.equal(throttle.shouldSend(110, { x: 0, y: 1 }), true, "方向变立即发");
    assert.equal(throttle.shouldSend(120, { x: 0, y: 0 }), true, "停立即发");
    assert.equal(throttle.shouldSend(500, { x: 0, y: 0 }), false, "停不重复");
    throttle.reset();
    assert.equal(throttle.shouldSend(501, { x: 0, y: 0 }), true);
});

interface Scheduled { readonly atStep: number; readonly intent: IMoveIntent }

/** 服务端参考：同一 resolveMove 按固定步推进，意图在其步开始前施加，每步回执 {seq = 最新意图, x, y}。 */
function serverReplay(start: IVec2, intents: readonly Scheduled[], steps: number, speedPerSec: number) {
    let state: MoveState = { x: start.x, y: start.y, dirX: 0, dirY: 0, target: null };
    const echoes: { seq: number; x: number; y: number }[] = [];
    let seq = 0;
    for (let step = 0; step < steps; step += 1) {
        for (const scheduled of intents) {
            if (scheduled.atStep !== step) continue;
            state = applyIntent(state, scheduled.intent, SIZE);
            seq = scheduled.intent.seq;
        }
        const result = resolveMove(state, speedPerSec, 50, SIZE, GRID);
        state = { ...state, x: result.x, y: result.y, target: result.target };
        echoes.push({ seq, x: result.x, y: result.y });
    }
    return { state, echoes };
}

test("MovementPredictor：与服务端参考回放一致（dir → 点地到达 → 停），每步回执和解后位置不跳，回放完 pending 清零", () => {
    const intents: Scheduled[] = [
        { atStep: 0, intent: { seq: 1, dir: { x: 1, y: 0 } } },
        { atStep: 3, intent: { seq: 2, target: { x: 1030, y: 1010 } } },
        { atStep: 8, intent: { seq: 3, dir: { x: 0, y: 0 } } },
    ];
    const reference = serverReplay({ x: 1000, y: 1000 }, intents, 12, 120);
    const predictor = new MovementPredictor({ x: 1000, y: 1000 }, { speedPerSec: 120, size: SIZE, grid: GRID });
    for (let step = 0; step < 12; step += 1) {
        for (const scheduled of intents) if (scheduled.atStep === step) predictor.push(scheduled.intent);
        predictor.tick(50);
        const before = predictor.position();
        predictor.reconcile(reference.echoes[step]!);
        assert.deepEqual([round(predictor.position().x), round(predictor.position().y)], [round(before.x), round(before.y)], `step ${step}：回执 = 预测`);
    }
    assert.deepEqual([round(predictor.position().x), round(predictor.position().y)], [round(reference.state.x), round(reference.state.y)]);
    assert.deepEqual([predictor.lastConfirmedSeq, predictor.pendingCount], [3, 0]);
    assert.deepEqual([reference.state.target, round(reference.state.x)], [null, 1030], "点地已到达（目标清）");
});

test("MovementPredictor：迟到回执（服务端慢两步）⇒ 位置回到回执、在途点地目标保留；旧回执忽略；撞墙预测与服务端一致", () => {
    const predictor = new MovementPredictor({ x: 1000, y: 1000 }, { speedPerSec: 120, size: SIZE, grid: GRID });
    predictor.push({ seq: 1, dir: { x: 1, y: 0 } });
    predictor.tick(150);
    assert.equal(predictor.position().x, 1018, "三步 × 6");
    predictor.push({ seq: 2, target: { x: 1000, y: 1100 } });
    predictor.reconcile({ seq: 1, x: 1006, y: 1000 });
    assert.deepEqual([predictor.position().x, predictor.pendingCount, predictor.lastConfirmedSeq], [1006, 1, 1], "回到回执位置；seq 2 仍在途，其目标保留");
    predictor.tick(50);
    const after = predictor.position();
    assert.ok(after.x < 1006 && after.y > 1000, `按重放的点地目标走 (${after.x}, ${after.y})`);
    predictor.reconcile({ seq: 0, x: 999, y: 999 });
    assert.deepEqual(predictor.position(), after, "旧回执忽略");
    predictor.reconcile({ seq: 2, x: after.x, y: after.y });
    assert.equal(predictor.pendingCount, 0);
    // 撞墙：灰盒墙 x ∈ [1500, 1700)；从 1496 向右每步 6 ⇒ 下一步落墙 ⇒ 原地
    const walled = new MovementPredictor({ x: 1496, y: 1000 }, { speedPerSec: 120, size: SIZE, grid: GRID });
    walled.push({ seq: 1, dir: { x: 1, y: 0 } });
    walled.tick(200);
    assert.equal(walled.position().x, 1496, "预测也撞墙");
    const free = new MovementPredictor({ x: 1496, y: 1000 }, { speedPerSec: 120, size: SIZE, grid: null });
    free.push({ seq: 1, dir: { x: 1, y: 0 } });
    free.tick(200);
    assert.equal(free.position().x, 1520, "无网格四步 × 6");
});
