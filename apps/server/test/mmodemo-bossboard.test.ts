/**
 * mmodemo 可选域 `mmodemo.bossBoard`（MG1-B2）：用例 readBossBoard 只经 kit orchestration 面 v2 `listCheckpointedVars`（假面注入）——
 * 区号取 currentZoneId、map / pack 用域常量、每分线 rev / tick 透传、bossKills 只认 ≥ 0 安全整数（缺失 / 字符串 / 负数 / 小数 ⇒ 0）、合计 = Σ；
 * 域常量与内容包 / 编排 DEMO_VALE_PACK_ID / kit CHECKPOINTED_VARS_MAX_ROWS 交叉核对；响应 validator 正反向（65 条 / 重复分线 / 合计不符 / 负击杀 / 多键）；
 * 端点默认导出绑定该路由。
 * 变异验证：bossKillsOf 删 `value >= 0` → 「负数 ⇒ 0」转红；validator 删合计比对 → 「合计不符」转红；readBossBoard 把 MMO_DEMO_PACK_ID 写死别的字符串 → 「面参数」转红。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { WireValidationError } from "@game/shared/protocol/http";
import {
    MMO_DEMO_BOSS_BOARD_MAX_LINES, MMO_DEMO_MAP_ID, MMO_DEMO_PACK_ID, MmoDemoRpc, validateMmoDemoBossBoardRes, type IMmoDemoBossBoardRes,
} from "@game/shared/protocol/lobbyRpc/domains/mmodemo";
import { CHECKPOINTED_VARS_MAX_ROWS, type CheckpointedVarsRow } from "../src/kits/mmo/api/orchestration/index";
import { DEMO_VALE_PACK_ID } from "../src/core/mmodemo/mmoOrchestration";
import { BOSS_KILLS_VAR } from "../src/core/mmodemo/encounters/bossTimer";
import { bossKillsOf, readBossBoard } from "../src/core/mmodemo/bossBoard";
import endpoint from "../src/websocket/mmodemo/bossBoard";
import vectors from "./lobbyRpcVectors/mmodemo";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK = JSON.parse(fs.readFileSync(path.resolve(HERE, "../../..", "apps/plugins/mmodemo/content/pack.json"), "utf8")) as { packId: string; maps: { mapId: string }[] };

test("readBossBoard：只经 kit orchestration 面（sId = currentZoneId、map / pack = 域常量），rev / tick 透传，bossKills 只认 ≥ 0 安全整数，合计 = Σ", async () => {
    const calls: unknown[][] = [];
    const rows: readonly CheckpointedVarsRow[] = [
        { instanceId: "wi_a", rev: 7, tick: 1400, vars: { [BOSS_KILLS_VAR]: 3, ambushAt: 1200 } },
        { instanceId: "wi_b", rev: 0, tick: 0, vars: {} },
        { instanceId: "wi_c", rev: 2, tick: 10, vars: { [BOSS_KILLS_VAR]: "9" } },
        { instanceId: "wi_d", rev: 1, tick: 5, vars: { [BOSS_KILLS_VAR]: -1 } },
        { instanceId: "wi_e", rev: 4, tick: 20, vars: { [BOSS_KILLS_VAR]: 2.5 } },
        { instanceId: "wi_f", rev: 5, tick: 25, vars: { [BOSS_KILLS_VAR]: 4 } },
    ];
    const board = await readBossBoard({
        listCheckpointedVars: async (sId, mapId, packId) => { calls.push([sId, mapId, packId]); return rows; },
        currentZoneId: () => 7,
    });
    assert.deepEqual(calls, [[7, MMO_DEMO_MAP_ID, MMO_DEMO_PACK_ID]], "面参数");
    assert.deepEqual(board, {
        mapId: MMO_DEMO_MAP_ID, packId: MMO_DEMO_PACK_ID,
        lines: [
            { instanceId: "wi_a", rev: 7, tick: 1400, bossKills: 3 }, { instanceId: "wi_b", rev: 0, tick: 0, bossKills: 0 }, { instanceId: "wi_c", rev: 2, tick: 10, bossKills: 0 },
            { instanceId: "wi_d", rev: 1, tick: 5, bossKills: 0 }, { instanceId: "wi_e", rev: 4, tick: 20, bossKills: 0 }, { instanceId: "wi_f", rev: 5, tick: 25, bossKills: 4 },
        ],
        totalKills: 7,
    });
    assert.deepEqual(validateMmoDemoBossBoardRes(board), board, "用例产物过响应 validator");
    assert.equal(bossKillsOf(-1), 0, "负数 ⇒ 0");
    assert.equal(bossKillsOf(Number.MAX_SAFE_INTEGER + 2), 0);
    assert.equal(bossKillsOf(0), 0);
    assert.equal(bossKillsOf(12), 12);
    const empty = await readBossBoard({ listCheckpointedVars: async () => [], currentZoneId: () => 0 });
    assert.deepEqual(empty, { mapId: MMO_DEMO_MAP_ID, packId: MMO_DEMO_PACK_ID, lines: [], totalKills: 0 });
});

test("域常量与内容包 / 编排 / kit 面交叉核对；端点绑定路由；向量过 validator", () => {
    assert.equal(MMO_DEMO_PACK_ID, DEMO_VALE_PACK_ID);
    assert.equal(MMO_DEMO_PACK_ID, PACK.packId);
    assert.ok(PACK.maps.some((map) => map.mapId === MMO_DEMO_MAP_ID), "主图在内容包里");
    assert.equal(MMO_DEMO_BOSS_BOARD_MAX_LINES, CHECKPOINTED_VARS_MAX_ROWS);
    assert.equal(endpoint.type, MmoDemoRpc.BossBoard);
    const vector = vectors[MmoDemoRpc.BossBoard]!;
    assert.deepEqual(validateMmoDemoBossBoardRes(vector.response), vector.response);
});

test("响应 validator 反向：65 条 / 重复分线 / 合计不符 / 负击杀 / 多键 / 非整数 rev 一律 WireValidationError", () => {
    const ok: IMmoDemoBossBoardRes = { mapId: "demoVale", packId: "demoVale", lines: [{ instanceId: "wi_a", rev: 1, tick: 20, bossKills: 2 }], totalKills: 2 };
    const reject = (input: unknown, code: string): void => {
        assert.throws(() => validateMmoDemoBossBoardRes(input), (error: unknown) => error instanceof WireValidationError && error.code === code, code);
    };
    reject({ ...ok, lines: Array.from({ length: 65 }, (_x, index) => ({ instanceId: `wi_${index}`, rev: 0, tick: 0, bossKills: 0 })), totalKills: 0 }, "MMO_DEMO_BOSS_BOARD_SIZE");
    reject({ ...ok, lines: [ok.lines[0]!, { ...ok.lines[0]! }], totalKills: 4 }, "MMO_DEMO_BOSS_BOARD_DUP");
    reject({ ...ok, totalKills: 3 }, "MMO_DEMO_BOSS_BOARD_TOTAL");
    reject({ ...ok, lines: [{ ...ok.lines[0]!, bossKills: -2 }], totalKills: -2 }, "WIRE_INTEGER");
    reject({ ...ok, lines: [{ ...ok.lines[0]!, rev: 1.5 }] }, "WIRE_INTEGER");
    assert.throws(() => validateMmoDemoBossBoardRes({ ...ok, extra: 1 }), WireValidationError);
    assert.throws(() => validateMmoDemoBossBoardRes({ ...ok, lines: [{ ...ok.lines[0]!, extra: 1 }] }), WireValidationError);
});
