/**
 * mmoWorld 竖屏操作模型（MG1-B1，无头）：摇杆几何（钳半径 / 死区 / 归一化 / y 翻转）与会话限频（首次即发、同向 100 ms 内不重发、
 * 变向立即发、抬手只在动过时发停）；轮盘分槽（数量 / 不重叠 / 落在 hub 的左上象限 / 内圈放不下溢到外圈）；屏幕 ⇄ 世界互逆；
 * 点选（最近命中、排除本人、超出半径落空 ⇒ moveTo、再点同一目标 ⇒ 清除）；布局不越界且中列钮不压摇杆 / 轮盘槽。
 * 变异验证：JoystickSession.move 删 `zero && !moving` 短路 → 「死区内从未动过不发」转红；wheelSlotPositions 删溢圈（capacity 恒 = remaining）→ 「不重叠」转红；
 * pickEntity 删 isSelf 跳过 → 「排除本人」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    JoystickSession, MMO_HUD_TAP_SLOP_PX, MMO_HUD_WORLD_SCALE, cooldownLabel, hudLayout, isTap, joystickFrame, pickEntity, resolveWorldTap, screenToWorld, wheelSlotPositions, worldToScreen,
} from "../src/logic/rooms/mmoWorld/hudControls";
import { JOYSTICK_DEADZONE, MOVE_INTENT_MIN_INTERVAL_MS } from "../src/kits/mmo/api/movement/index";
import type { MmoWorldEntityView } from "../src/logic/rooms/mmoWorld/MmoWorldGameplay";

const entity = (id: string, x: number, y: number, over: Partial<MmoWorldEntityView> = {}): MmoWorldEntityView => ({
    id, kind: "creature", name: id, x, y, hp: 10, hpMax: 10, level: 1, factionId: null, count: null, isSelf: false,
    presentation: { color: [1, 2, 3, 255], size: 30, label: id }, ...over,
});
const close = (actual: number, expected: number, eps = 1e-9): void => assert.ok(Math.abs(actual - expected) <= eps, `${actual} ≠ ${expected}`);

test("joystickFrame：旋钮钳在半径内、死区内零向量、超出半径归一到单位圆、屏幕 y 向上翻成世界 y 向下", () => {
    const origin = { x: -100, y: -300 };
    const inside = joystickFrame(origin, { x: -100 + 5, y: -300 }, 50);
    assert.deepEqual(inside.dir, { x: 0, y: 0 }, "5/50 = 0.1 < 死区 0.15 ⇒ 停");
    assert.deepEqual(inside.knob, { x: -95, y: -300 }, "死区内旋钮仍跟手");
    const far = joystickFrame(origin, { x: -100 + 120, y: -300 }, 50);
    assert.deepEqual(far.knob, { x: -50, y: -300 }, "旋钮钳到半径");
    assert.deepEqual(far.dir, { x: 1, y: 0 });
    const up = joystickFrame(origin, { x: -100, y: -300 + 40 }, 50);
    close(up.dir.x, 0);
    close(up.dir.y, -0.8, 1e-9);
    assert.ok(Math.hypot(up.dir.x, up.dir.y) <= 1 && Math.hypot(up.dir.x, up.dir.y) >= JOYSTICK_DEADZONE);
    const diagonal = joystickFrame(origin, { x: -100 + 80, y: -300 - 80 }, 50);
    close(Math.hypot(diagonal.dir.x, diagonal.dir.y), 1);
    assert.ok(diagonal.dir.x > 0 && diagonal.dir.y > 0, "右下（屏幕 y 向下）= 世界 +x +y");
});

test("JoystickSession：死区内从未动过不发；首次非零立即发；同向 100 ms 内不重发、过间隔重发；变向立即发；回死区发一次停；抬手只在动过时发停", () => {
    const session = new JoystickSession({ x: 0, y: 0 }, 50);
    assert.equal(session.move({ x: 3, y: 0 }, 0).send, null, "死区内且未动过 ⇒ 不发");
    assert.equal(session.end(), false, "没动过 ⇒ 抬手不发停");
    const first = session.move({ x: 50, y: 0 }, 10);
    assert.deepEqual(first.send, { x: 1, y: 0 });
    assert.equal(session.move({ x: 50, y: 0 }, 10 + MOVE_INTENT_MIN_INTERVAL_MS - 1).send, null, "同向未过间隔");
    assert.deepEqual(session.move({ x: 50, y: 0 }, 10 + MOVE_INTENT_MIN_INTERVAL_MS).send, { x: 1, y: 0 }, "过间隔重发（服务端意图保活）");
    assert.deepEqual(session.move({ x: 0, y: 50 }, 10 + MOVE_INTENT_MIN_INTERVAL_MS + 1).send, { x: 0, y: -1 }, "变向立即发");
    assert.deepEqual(session.move({ x: 2, y: 0 }, 10 + MOVE_INTENT_MIN_INTERVAL_MS + 2).send, { x: 0, y: 0 }, "回死区 ⇒ 发一次停");
    assert.equal(session.move({ x: 1, y: 0 }, 10 + MOVE_INTENT_MIN_INTERVAL_MS + 3).send, null, "已停不重发");
    assert.equal(session.end(), false, "已停 ⇒ 抬手不再发停");
    const second = new JoystickSession({ x: 0, y: 0 }, 50);
    second.move({ x: -50, y: 0 }, 0);
    assert.equal(second.end(), true, "动着抬手 ⇒ 发停");
    assert.equal(second.end(), false, "只发一次");
});

test("wheelSlotPositions：数量对、相邻不重叠（弦长 ≥ 槽边长）、落在 hub 左上象限；两技能占内圈两端；放不下溢到外圈", () => {
    for (let count = 0; count <= 8; count++) {
        const slots = wheelSlotPositions(count, 97.5, 49);
        assert.equal(slots.length, count);
        for (const slot of slots) assert.ok(slot.x <= 1e-6 && slot.y >= -1e-6, `槽 ${JSON.stringify(slot)} 不在左上象限`);
        for (let i = 0; i < slots.length; i++) {
            for (let j = i + 1; j < slots.length; j++) {
                const distance = Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.y - slots[j]!.y);
                assert.ok(distance >= 49, `槽 ${i} / ${j} 距离 ${distance.toFixed(1)} < 槽边长（count ${count}）`);
            }
        }
    }
    const two = wheelSlotPositions(2, 100, 40);
    close(two[0]!.x, 0); close(two[0]!.y, 100);
    close(two[1]!.x, -100); close(two[1]!.y, 0);
    const one = wheelSlotPositions(1, 100, 40);
    close(one[0]!.x, -Math.SQRT1_2 * 100); close(one[0]!.y, Math.SQRT1_2 * 100);
    const six = wheelSlotPositions(6, 97.5, 49);
    assert.ok(six.some((slot) => Math.hypot(slot.x, slot.y) > 97.5 + 1), "六槽必有外圈");
});

test("screenToWorld / worldToScreen 互逆且 y 翻转；isTap 按 slop；cooldownLabel 向上取整秒", () => {
    const center = { x: 600, y: 600 };
    const world = screenToWorld({ x: 35, y: 35 }, center);
    close(world.x, 700); close(world.y, 500);
    const back = worldToScreen(world, center);
    close(back.x, 35); close(back.y, 35);
    assert.equal(MMO_HUD_WORLD_SCALE, 0.35);
    assert.equal(isTap({ x: 0, y: 0 }, { x: MMO_HUD_TAP_SLOP_PX, y: 0 }), true);
    assert.equal(isTap({ x: 0, y: 0 }, { x: MMO_HUD_TAP_SLOP_PX + 0.5, y: 0 }), false);
    assert.equal(cooldownLabel(undefined), "");
    assert.equal(cooldownLabel(0), "");
    assert.equal(cooldownLabel(1), "1s");
    assert.equal(cooldownLabel(2400), "3s");
});

test("pickEntity / resolveWorldTap：最近命中、排除本人、大实体命中半径按尺寸放大、落空 ⇒ moveTo、再点同一目标 ⇒ 清除", () => {
    const self = entity("char:me", 600, 600, { isSelf: true, kind: "character" });
    const merchant = entity("npc:merchant", 700, 500, { kind: "npc", presentation: { color: [0, 0, 0, 255], size: 30, label: "行商" } });
    const wolf = entity("wolf:1", 760, 500);
    const boss = entity("boss", 1000, 1000, { presentation: { color: [0, 0, 0, 255], size: 120, label: "头狼" } });
    const entities = [self, merchant, wolf, boss];
    assert.equal(pickEntity(entities, { x: 600, y: 600 }), null, "本人不可点");
    assert.equal(pickEntity(entities, { x: 720, y: 500 })?.id, "npc:merchant", "两者都在半径内取最近");
    assert.equal(pickEntity(entities, { x: 745, y: 500 })?.id, "wolf:1");
    assert.equal(pickEntity(entities, { x: 700 + 80, y: 500 + 80 }), null, "40 px 外落空（最小半径 24 px = 68.6 世界单位）");
    assert.equal(pickEntity(entities, { x: 1000 + 200, y: 1000 })?.id, "boss", "大实体命中半径 = 尺寸 × 0.7 = 84 px = 240 世界单位");
    assert.deepEqual(resolveWorldTap(entities, null, { x: 705, y: 505 }), { type: "target", entityId: "npc:merchant" });
    assert.deepEqual(resolveWorldTap(entities, "npc:merchant", { x: 705, y: 505 }), { type: "target", entityId: null }, "再点同一目标 ⇒ 清除");
    assert.deepEqual(resolveWorldTap(entities, "npc:merchant", { x: 1500, y: 1500 }), { type: "moveTo", x: 1500, y: 1500 });
});

test("hudLayout：摇杆在左下、轮盘 hub 在右下、全部在屏幕内；中列钮不压摇杆与轮盘槽；安全区抬高底边", () => {
    for (const [width, height] of [[375, 812], [750, 1624], [1624, 750]] as const) {
        const layout = hudLayout(width, height, 20);
        const { joystick, wheel } = layout;
        assert.ok(joystick.x < 0 && joystick.x - joystick.radius >= -width * 0.5, `摇杆越左界 ${width}×${height}`);
        assert.ok(joystick.y - joystick.radius >= -height * 0.5 + 20, "摇杆越底界 / 安全区");
        assert.ok(wheel.x > 0 && wheel.x + wheel.hubSize * 0.5 <= width * 0.5, "hub 越右界");
        assert.ok(wheel.y - wheel.hubSize * 0.5 >= -height * 0.5 + 20, "hub 越底界 / 安全区");
        const slots = wheelSlotPositions(4, wheel.radius, wheel.slotSize);
        for (const slot of slots) {
            const x = wheel.x + slot.x;
            const y = wheel.y + slot.y;
            assert.ok(x - wheel.slotSize * 0.5 >= layout.actionX + layout.actionSize * 0.5, "轮盘槽压到中列钮");
            assert.ok(y + wheel.slotSize * 0.5 <= height * 0.5 && x + wheel.slotSize * 0.5 <= width * 0.5, "轮盘槽越界");
        }
        assert.ok(layout.actionX - layout.actionSize * 0.5 >= joystick.x + joystick.radius, "中列钮压到摇杆");
        assert.equal(layout.bottom, -height * 0.5 + 20);
    }
});
