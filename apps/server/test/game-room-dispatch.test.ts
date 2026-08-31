/**
 * catch-all dispatcher 专测（Non-intrusive §4.5 阶段 2b）：
 *  - 房间只注册 catch-all（"_"）且 `messages` 是每实例对象（Colyseus `Room.__init()`
 *    会 delete 该键，模块级共享常量会让第一间房之后的所有房间永久没有 catch-all）；
 *  - 未知/畸形 type 也消耗基础预算（flood 不因拼错消息名而免费）；
 *  - 非普通对象 payload（Uint8Array/Buffer/数组——二进制帧 fallback 会把原始字节原样
 *    交入 catch-all）被 exact validator 的原型检查拒绝；
 *  - rateCost > 1 的追加预算消耗机制（现有消息全部 1，用可观察点覆盖机制本身）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    ErrorCode,
    GamePhase,
    S2C,
    type C2SType,
} from "@game/shared";
import { GAME_ROOM_MAX_MESSAGES_PER_SECOND, GameRoom } from "../src/rooms/GameRoom";
import { createBallMoveGameMode } from "../src/rooms/modes/ballMove/index";

type SentMessage = [string, unknown];

function dispatch(room: GameRoom, type: unknown, sender: unknown, payload: unknown): void {
    (room.messages as unknown as { _: (c: unknown, t: unknown, p: unknown) => void })._(sender, type, payload);
}

function probeRoom(): {
    room: GameRoom;
    sender: { sessionId: string; auth: object; send(type: string, payload: unknown): void };
    sent: SentMessage[];
    captured: Array<{ type: C2SType; payload: unknown }>;
} {
    const captured: Array<{ type: C2SType; payload: unknown }> = [];
    const capture = (type: C2SType) => (_context: unknown, payload: unknown) => {
        captured.push({ type, payload });
    };
    const room = new GameRoom({
        seed: 1,
        clock: () => 0,
        mode: {
            ...createBallMoveGameMode(),
            commands: {
                [C2S.Move]: capture(C2S.Move),
                [C2S.CastSkill]: capture(C2S.CastSkill),
            },
        } as never,
    });
    const sent: SentMessage[] = [];
    const sender = {
        sessionId: "dispatch-probe",
        auth: { userId: "u-dispatch", sId: 0, mode: room.gameplayModeId },
        send(type: string, payload: unknown) { sent.push([type, payload]); },
    };
    return { room, sender, sent, captured };
}

function errorCount(sent: SentMessage[]): number {
    return sent.filter(([type]) => type === S2C.Error).length;
}

test("GameRoom 只注册 catch-all，且 messages 是每实例对象", () => {
    const roomA = new GameRoom({ seed: 11, mode: createBallMoveGameMode() });
    const roomB = new GameRoom({ seed: 12, mode: createBallMoveGameMode() });
    assert.deepEqual(Object.keys(roomA.messages), ["_"], "不得残留任何具名 handler（绕闸暗道）");
    assert.deepEqual(Object.keys(roomB.messages), ["_"]);
    assert.notStrictEqual(roomA.messages, roomB.messages, "messages 必须是每实例对象");
    // Room.__init() 注册 catch-all 后会 delete 该键；另一间房不得受影响。
    delete (roomA.messages as Record<string, unknown>)["_"];
    assert.deepEqual(Object.keys(roomB.messages), ["_"], "共享常量会让后续房间永久失去 catch-all");
});

test("未知/非法 type 也计费：拼错消息名不能白嫖预算，且必回 1 条 BadRequest", () => {
    const { room, sender, sent } = probeRoom();
    room.state.phase = GamePhase.Playing;

    for (const badType of ["c2s.nope", 42, undefined, null, Symbol("x"), "s2c.skillResult"]) {
        sent.length = 0;
        dispatch(room, badType, sender, {});
        assert.equal(errorCount(sent), 1, `type=${String(badType)} 必须恰好回 1 条 Error`);
        assert.equal(
            (sent[0][1] as { code: number }).code,
            ErrorCode.BadRequest,
            `type=${String(badType)} 错误码必须是 BadRequest`,
        );
    }
    // "s2c.pong" 在 owners 表里（core），但不是 C2S——validate 一步兜住，同样 BadRequest。
    sent.length = 0;
    dispatch(room, "s2c.pong", sender, { clientTime: 1, serverTime: 2 });
    assert.equal(errorCount(sent), 1);

    // 计费验证：注入 clock 恒 0 → 预算窗口永不滚动。用未知 type 灌满窗口后，
    // 一条完全合法的 Ping 也必须因超限被拒（若未知消息不计费，这里会收到 Pong）。
    const fresh = probeRoom();
    for (let i = 0; i < GAME_ROOM_MAX_MESSAGES_PER_SECOND; i++) {
        dispatch(fresh.room, "c2s.flood.unknown", fresh.sender, {});
    }
    fresh.sent.length = 0;
    dispatch(fresh.room, C2S.Ping, fresh.sender, { clientTime: 1 });
    assert.equal(fresh.sent.some(([type]) => type === S2C.Pong), false, "超限后不得再回 Pong");
    assert.equal(errorCount(fresh.sent), 1, "超限必须回 BadRequest");
});

test("非普通对象 payload 拒收：二进制帧 fallback 的 Uint8Array/Buffer 原样交入也必须被拒", () => {
    const { room, sender, sent, captured } = probeRoom();
    room.state.phase = GamePhase.Playing;
    const hostilePayloads: readonly unknown[] = [
        new Uint8Array([1, 2, 3]),
        Buffer.from("dirX"),
        [],
        [{ dirX: 1, dirY: 0 }],
        "dirX=1",
        42,
        null,
        undefined,
        new Map([["dirX", 1]]),
    ];
    for (const payload of hostilePayloads) {
        sent.length = 0;
        dispatch(room, C2S.Move, sender, payload);
        assert.deepEqual(captured, [], `非普通对象 payload 不得到达 commands：${String(payload)}`);
        assert.equal(errorCount(sent), 1, `payload=${String(payload)} 必须恰好回 1 条 Error`);
        assert.equal((sent[0][1] as { code: number }).code, ErrorCode.BadRequest);
    }
});

test("rateCost 机制：>1 的消息在 exact validate 后追加消耗基础预算，超限即拒", () => {
    const { room, sender, sent, captured } = probeRoom();
    room.state.phase = GamePhase.Playing;
    // 现有消息 rateCost 全部为 1；机制用可替换的读取点验证（fixture token 的 catalog
    // 侧覆盖见 gameplay-codegen.test.ts 的 wire fixture 用例）。
    (room as unknown as { wireRateCost(type: string): number }).wireRateCost =
        (type) => (type === C2S.Move ? 3 : 1);
    const internals = room as unknown as {
        messageBudget: Map<string, { windowStart: number; count: number }>;
    };

    dispatch(room, C2S.Move, sender, { dirX: 1, dirY: 0 });
    assert.equal(captured.length, 1, "预算充足时 rateCost=3 的消息正常分发");
    assert.equal(
        internals.messageBudget.get(sender.sessionId)?.count,
        3,
        "一条 rateCost=3 的消息必须消耗 3 份基础预算",
    );

    // 剩余预算不足以覆盖追加消耗：分发中止、handler 不得执行。
    internals.messageBudget.set(sender.sessionId, {
        windowStart: 0,
        count: GAME_ROOM_MAX_MESSAGES_PER_SECOND - 2,
    });
    sent.length = 0;
    captured.length = 0;
    dispatch(room, C2S.Move, sender, { dirX: 1, dirY: 0 });
    assert.deepEqual(captured, [], "追加消耗越限时 handler 不得执行");
    assert.equal(errorCount(sent), 1, "越限必须回 BadRequest");

    // 同预算下 rateCost=1 的消息仍可通过（证明拒绝确实来自追加消耗）。
    internals.messageBudget.set(sender.sessionId, {
        windowStart: 0,
        count: GAME_ROOM_MAX_MESSAGES_PER_SECOND - 2,
    });
    sent.length = 0;
    dispatch(room, C2S.CastSkill, sender, { skillId: 1 });
    assert.equal(errorCount(sent), 0, "rateCost=1 的消息在同一预算余量下必须放行");
});
