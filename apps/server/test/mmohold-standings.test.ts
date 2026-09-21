/** MG2-B2：公共面检查点读取 / 坏 var 降级 / 闭合响应 / 64 条安全合计。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { WireValidationError } from "@game/shared/protocol/http";
import {
    MMO_HOLD_MAP_ID, MMO_HOLD_PACK_ID, MMO_HOLD_STANDINGS_MAX_LINES, MMO_HOLD_STANDINGS_MAX_SCORE,
    MmoHoldRpc, validateMmoHoldStandingsReq, validateMmoHoldStandingsRes, type IMmoHoldStandingsRes,
} from "@game/shared/protocol/lobbyRpc/domains/mmohold";
import { CHECKPOINTED_VARS_MAX_ROWS, type CheckpointedVarsRow } from "../src/kits/mmo/api/orchestration/index";
import { ownerOf, readStandings, scoreOf } from "../src/core/mmohold/standings";
import endpoint from "../src/websocket/mmohold/standings";
import vectors from "./lobbyRpcVectors/mmohold";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const example: IMmoHoldStandingsRes = {
    mapId: "holdRidge", packId: "holdRidge",
    lines: [{ instanceId: "wi_a", rev: 1, tick: 20, scores: { dawn: 12, dusk: 4 }, owners: { pointA: "dawn", pointB: "neutral" } }],
    totalScores: { dawn: 12, dusk: 4 },
};

test("readStandings：区号 / map / pack 公共面参数；两阵营与两据点透传；坏 var 归零 / 中立", async () => {
    const calls: unknown[][] = [];
    const rows: readonly CheckpointedVarsRow[] = [
        { instanceId: "wi_a", rev: 7, tick: 1400, vars: { "score:dawn": 35, "score:dusk": 9, "owner:pointA": "dawn", "owner:pointB": "dusk", phase: "active" } },
        { instanceId: "wi_b", rev: 0, tick: 0, vars: {} },
        { instanceId: "wi_c", rev: 2, tick: 10, vars: { "score:dawn": "9", "score:dusk": -1, "owner:pointA": "bogus", "owner:pointB": 1 } },
        { instanceId: "wi_d", rev: 4, tick: 20, vars: { "score:dawn": 2.5, "score:dusk": 4, "owner:pointA": "neutral", "owner:pointB": "dawn" } },
    ];
    const board = await readStandings({ listCheckpointedVars: async (...args) => { calls.push(args); return rows; }, currentZoneId: () => 7 });
    assert.deepEqual(calls, [[7, MMO_HOLD_MAP_ID, MMO_HOLD_PACK_ID]], "公共面参数");
    assert.deepEqual(board.lines.map((line) => [line.instanceId, line.rev, line.tick, line.scores, line.owners]), [
        ["wi_a", 7, 1400, { dawn: 35, dusk: 9 }, { pointA: "dawn", pointB: "dusk" }],
        ["wi_b", 0, 0, { dawn: 0, dusk: 0 }, { pointA: "neutral", pointB: "neutral" }],
        ["wi_c", 2, 10, { dawn: 0, dusk: 0 }, { pointA: "neutral", pointB: "neutral" }],
        ["wi_d", 4, 20, { dawn: 0, dusk: 4 }, { pointA: "neutral", pointB: "dawn" }],
    ]);
    assert.deepEqual(board.totalScores, { dawn: 35, dusk: 13 });
    assert.deepEqual(validateMmoHoldStandingsRes(board), board);
    for (const bad of [-1, 1.5, "1", null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER, MMO_HOLD_STANDINGS_MAX_SCORE + 1]) assert.equal(scoreOf(bad), 0);
    assert.equal(scoreOf(MMO_HOLD_STANDINGS_MAX_SCORE), MMO_HOLD_STANDINGS_MAX_SCORE);
    assert.equal(ownerOf("dawn"), "dawn");
    assert.equal(ownerOf("dusk"), "dusk");
    assert.equal(ownerOf({}), "neutral");
    assert.deepEqual(await readStandings({ listCheckpointedVars: async () => [], currentZoneId: () => 0 }), { mapId: "holdRidge", packId: "holdRidge", lines: [], totalScores: { dawn: 0, dusk: 0 } });
});

test("内容包 / 公共面行数交叉核对；端点与向量；64 条最大分仍可精确合计", () => {
    const pack = JSON.parse(fs.readFileSync(path.resolve(HERE, "../../../apps/plugins/mmohold/content/pack.json"), "utf8")) as { packId: string; maps: { mapId: string }[] };
    assert.equal(pack.packId, MMO_HOLD_PACK_ID);
    assert.ok(pack.maps.some((map) => map.mapId === MMO_HOLD_MAP_ID));
    assert.equal(MMO_HOLD_STANDINGS_MAX_LINES, CHECKPOINTED_VARS_MAX_ROWS);
    assert.equal(endpoint.type, MmoHoldRpc.Standings);
    assert.deepEqual(validateMmoHoldStandingsReq({}), {});
    assert.throws(() => validateMmoHoldStandingsReq({ unexpected: true }), WireValidationError);
    assert.deepEqual(validateMmoHoldStandingsRes(vectors[MmoHoldRpc.Standings]!.response), vectors[MmoHoldRpc.Standings]!.response);
    const many = { ...example, lines: Array.from({ length: 64 }, (_, index) => ({ ...example.lines[0]!, instanceId: `wi_${index}`, scores: { dawn: MMO_HOLD_STANDINGS_MAX_SCORE, dusk: 0 } })), totalScores: { dawn: 64 * MMO_HOLD_STANDINGS_MAX_SCORE, dusk: 0 } };
    assert.ok(Number.isSafeInteger(many.totalScores.dawn));
    assert.deepEqual(validateMmoHoldStandingsRes(many), many);
});

test("响应反向：超行数 / 重复 / 逐阵营合计 / scope / 非法归属 / 不安全数 / 层层未知键拒绝", () => {
    const reject = (input: unknown, code?: string): void => assert.throws(() => validateMmoHoldStandingsRes(input), (error: unknown) => error instanceof WireValidationError && (!code || error.code === code));
    const line = example.lines[0]!;
    reject({ ...example, lines: Array.from({ length: 65 }, (_, index) => ({ ...line, instanceId: `wi_${index}` })) }, "MMO_HOLD_STANDINGS_SIZE");
    reject({ ...example, lines: [line, line] }, "MMO_HOLD_STANDINGS_DUP");
    reject({ ...example, totalScores: { dawn: 13, dusk: 4 } }, "MMO_HOLD_STANDINGS_TOTAL");
    reject({ ...example, totalScores: { dawn: 12, dusk: 5 } }, "MMO_HOLD_STANDINGS_TOTAL");
    reject({ ...example, mapId: "demoVale" }, "MMO_HOLD_STANDINGS_SCOPE");
    reject({ ...example, packId: "demoVale" }, "MMO_HOLD_STANDINGS_SCOPE");
    reject({ ...example, lines: [{ ...line, owners: { pointA: "other", pointB: "neutral" } }] }, "MMO_HOLD_OWNER");
    reject({ ...example, lines: [{ ...line, owners: { pointA: "dawn", pointB: "other" } }] }, "MMO_HOLD_OWNER");
    for (const score of [-1, 0.5, NaN, Infinity, MMO_HOLD_STANDINGS_MAX_SCORE + 1]) reject({ ...example, lines: [{ ...line, scores: { dawn: score, dusk: 4 } }] }, "WIRE_INTEGER");
    reject({ ...example, lines: [{ ...line, rev: 1.5 }] }, "WIRE_INTEGER");
    reject({ ...example, lines: [{ ...line, tick: Number.MAX_SAFE_INTEGER + 1 }] }, "WIRE_INTEGER");
    reject({ ...example, totalScores: { dawn: Number.MAX_SAFE_INTEGER + 1, dusk: 4 } }, "WIRE_INTEGER");
    for (const input of [
        { ...example, extra: 1 }, { ...example, lines: [{ ...line, extra: 1 }] },
        { ...example, lines: [{ ...line, scores: { ...line.scores, other: 1 } }] },
        { ...example, lines: [{ ...line, owners: { ...line.owners, other: "dawn" } }] },
        { ...example, totalScores: { ...example.totalScores, other: 1 } },
    ]) reject(input);
});
