/**
 * MMO MF4-B1（docs/MMO.md §5.4 MF4 / docs/MMO-PLAN.md MF4-B1）：shared 世界协议一次定型——`RoomName.World`、
 * `WORLD_ROOM_PROTOCOL_VERSION = 1`、`WorldPhase`、`IWorldRoomJoinOptions` exact 校验器、三个世界错误码。
 * 变异验证：validateWorldRoomJoinOptions 删 exact keys 断言 → 「多余键 / 缺键被拒」转红；删 personaId 形状校验 → 「坏 personaId」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    ERROR_CODE_VALUES, ErrorCode, ErrorMessage, GAME_ROOM_PROTOCOL_VERSION, LOBBY_PROTOCOL_VERSION, RoomName, WORLD_ROOM_PROTOCOL_VERSION,
    WireValidationError, WorldPhase, validateWorldMapId, validateWorldRoomJoinOptions,
} from "@game/shared";

const PID = "p_0123456789abcdefXYZ";
const TICKET = "t".repeat(24);
const base = () => ({ v: WORLD_ROOM_PROTOCOL_VERSION, token: "tok", sId: 1, mode: "worldFixture", modeVersion: 1, profile: "world", mapId: "m1", personaId: PID, ticket: TICKET });

test("常量：RoomName.World / WORLD_ROOM_PROTOCOL_VERSION=1（与 GAME_ROOM / LOBBY 分离）/ WorldPhase 四态 / 三个世界错误码有文案", () => {
    assert.equal(RoomName.World, "world");
    assert.equal(WORLD_ROOM_PROTOCOL_VERSION, 1);
    assert.notEqual(WORLD_ROOM_PROTOCOL_VERSION, GAME_ROOM_PROTOCOL_VERSION);
    assert.notEqual(WORLD_ROOM_PROTOCOL_VERSION, LOBBY_PROTOCOL_VERSION);
    assert.deepEqual(Object.values(WorldPhase), ["recovering", "active", "draining", "offline"]);
    for (const code of [ErrorCode.WorldNotAuthoritative, ErrorCode.WorldTicketInvalid, ErrorCode.WorldDraining]) {
        assert.ok(ERROR_CODE_VALUES.includes(code));
        assert.ok(ErrorMessage[code].length > 0);
        assert.ok(code >= 4101 && code <= 4103, "4xxx persona / 世界段");
    }
});

test("validateWorldRoomJoinOptions：完整信封通过；line / resumeSeq 可选条件展开；缺键 / 多余键 / 坏形状一律拒", () => {
    const full = validateWorldRoomJoinOptions({ ...base(), line: 2, resumeSeq: 17 });
    assert.deepEqual(full, { ...base(), line: 2, resumeSeq: 17 });
    const minimal = validateWorldRoomJoinOptions(base());
    assert.equal(Object.prototype.hasOwnProperty.call(minimal, "line"), false, "可选字段 ⛔ 不得赋 undefined");
    assert.equal(Object.prototype.hasOwnProperty.call(minimal, "resumeSeq"), false);
    const rejects = (input: unknown, code: RegExp | string, label: string): void => {
        assert.throws(() => validateWorldRoomJoinOptions(input),
            (error: unknown) => error instanceof WireValidationError && (typeof code === "string" ? error.code === code : code.test(error.code)),
            label);
    };
    rejects({ ...base(), extra: 1 }, /^WIRE_/u, "多余键");
    for (const key of ["mode", "modeVersion", "profile", "mapId", "personaId", "ticket"]) {
        const input: Record<string, unknown> = { ...base() };
        delete input[key];
        rejects(input, /^WIRE_/u, `缺 ${key}`);
    }
    rejects({ ...base(), personaId: "short" }, /^WIRE_/u, "坏 personaId 长度");
    rejects({ ...base(), personaId: `${"x".repeat(16)}!` }, "PERSONA_ID", "坏 personaId 字符");
    rejects({ ...base(), ticket: "t".repeat(8) }, /^WIRE_/u, "ticket 过短");
    rejects({ ...base(), ticket: `${"t".repeat(20)}!` }, "WORLD_TICKET", "ticket 字符集");
    rejects({ ...base(), mapId: "bad map" }, "WORLD_MAP_ID", "mapId 形状");
    rejects({ ...base(), line: -1 }, /^WIRE_/u, "line 越界");
    rejects({ ...base(), line: 0x10000 }, /^WIRE_/u, "line 越界");
    rejects({ ...base(), resumeSeq: 1.5 }, /^WIRE_/u, "resumeSeq 非整数");
    rejects({ ...base(), mode: "" }, /^WIRE_/u, "mode 空");
    rejects({ ...base(), profile: "wo rld" }, "ROOM_PROFILE", "profile 形状");
    rejects({ ...base(), v: 0 }, /^WIRE_/u, "v 越界");
    rejects({ ...base(), sId: 70000 }, /^WIRE_/u, "sId 越界");
    rejects(null, "ROOM_OPTIONS_OBJECT", "非对象");
    assert.equal(validateWorldMapId("map-01.a_b"), "map-01.a_b");
});
