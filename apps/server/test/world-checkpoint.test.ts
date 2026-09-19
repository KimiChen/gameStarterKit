/**
 * MMO MF7b-B1 CheckpointPort 信封（docs/MMO.md §5.4 MF7b / §7.3）：
 *  - buildCheckpointEnvelope 算 stateHash（canonical：键序无关）；validateCheckpointEnvelope 形状 / 版本窗口 / 摘要三道闸；
 *  - schemaVersion ∉ [minSupported, version] ⇒ CheckpointIncompatibleError（fail-closed，⛔ 不猜着升级）；
 *  - stateHash 不符 / 缺 snapshot / 未知字段 / rev 0 / persona 缺 controlEpoch ⇒ CheckpointCorruptError；
 *  - MemoryCheckpointPort：只留最新 rev、rev 不单调即拒、load 回读的信封能过校验；
 *  - schema 窗口本身的形状闸。
 * 变异验证：validate 删 stateHash 复算 → 「篡改快照被拒」转红；删版本窗口比较 → 「不兼容拒启」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    CheckpointCorruptError, CheckpointIncompatibleError, MemoryCheckpointPort, buildCheckpointEnvelope, checkpointStateHash,
    validateCheckpointEnvelope, validateCheckpointSchema,
} from "../src/rooms/core/CheckpointPort";
import type { WorldTx } from "../src/rooms/core/WorldTx";

const SCHEMA = { version: 3, minSupported: 2 };
const fakeTx = (sId: number, writeSeq: number): WorldTx => ({ sId, writeSeq } as unknown as WorldTx);

test("信封：stateHash 由框架算且键序无关；validate 形状 / 版本窗口 / 摘要三道闸", () => {
    const envelope = buildCheckpointEnvelope({ rev: 1, eventOffset: 0, authorityEpoch: 1, schemaVersion: 3, snapshot: { b: [1, 2], a: "x" } });
    assert.equal(envelope.stateHash, checkpointStateHash({ a: "x", b: [1, 2] }), "键序无关");
    assert.notEqual(envelope.stateHash, checkpointStateHash({ a: "x", b: [2, 1] }), "数组序敏感");
    assert.deepEqual(validateCheckpointEnvelope(envelope, SCHEMA, "instance"), envelope);
    assert.ok(Object.isFrozen(validateCheckpointEnvelope(envelope, SCHEMA, "instance")));
    // 版本窗口
    for (const schemaVersion of [1, 4]) {
        assert.throws(() => validateCheckpointEnvelope({ ...envelope, schemaVersion }, SCHEMA, "instance"), CheckpointIncompatibleError, `schemaVersion ${schemaVersion} 不兼容拒启`);
    }
    assert.doesNotThrow(() => validateCheckpointEnvelope({ ...envelope, schemaVersion: 2 }, SCHEMA, "instance"), "minSupported 边界可加载");
    // 摘要 / 形状
    assert.throws(() => validateCheckpointEnvelope({ ...envelope, snapshot: { a: "y", b: [1, 2] } }, SCHEMA, "instance"), CheckpointCorruptError, "篡改快照被拒");
    assert.throws(() => validateCheckpointEnvelope({ ...envelope, stateHash: "zz" }, SCHEMA, "instance"), CheckpointCorruptError);
    assert.throws(() => validateCheckpointEnvelope({ ...envelope, rev: 0 }, SCHEMA, "instance"), CheckpointCorruptError, "rev ≥ 1");
    assert.throws(() => validateCheckpointEnvelope({ ...envelope, authorityEpoch: 0 }, SCHEMA, "instance"), CheckpointCorruptError, "authorityEpoch ≥ 1");
    assert.throws(() => validateCheckpointEnvelope({ ...envelope, extra: 1 }, SCHEMA, "instance"), CheckpointCorruptError, "未知字段");
    const { snapshot: _dropped, ...noSnapshot } = envelope;
    void _dropped;
    assert.throws(() => validateCheckpointEnvelope(noSnapshot, SCHEMA, "instance"), CheckpointCorruptError, "缺 snapshot");
    assert.throws(() => validateCheckpointEnvelope(envelope, SCHEMA, "persona"), CheckpointCorruptError, "persona 级必带 controlEpoch");
    const persona = buildCheckpointEnvelope({ rev: 2, eventOffset: 5, authorityEpoch: 1, controlEpoch: 0, schemaVersion: 3, snapshot: { x: 1 } });
    assert.equal(validateCheckpointEnvelope(persona, SCHEMA, "persona").controlEpoch, 0);
    assert.throws(() => validateCheckpointEnvelope(null, SCHEMA, "instance"), CheckpointCorruptError);
    assert.throws(() => buildCheckpointEnvelope({ rev: 1, eventOffset: 0, authorityEpoch: 1, schemaVersion: 1, snapshot: undefined as never }), TypeError);
});

test("schema 窗口形状：version ≥ 1、1 ≤ minSupported ≤ version", () => {
    assert.deepEqual(validateCheckpointSchema({ version: 2, minSupported: 1 }), { version: 2, minSupported: 1 });
    assert.throws(() => validateCheckpointSchema({ version: 0, minSupported: 0 }), TypeError);
    assert.throws(() => validateCheckpointSchema({ version: 1, minSupported: 2 }), TypeError);
    assert.throws(() => validateCheckpointSchema(null), TypeError);
});

test("MemoryCheckpointPort：只留最新 rev、rev 不单调即拒、回读信封过校验、分线与 persona 分表", async () => {
    const port = new MemoryCheckpointPort();
    const first = buildCheckpointEnvelope({ rev: 1, eventOffset: 0, authorityEpoch: 1, schemaVersion: 3, snapshot: { tick: 10 } });
    const second = buildCheckpointEnvelope({ rev: 2, eventOffset: 3, authorityEpoch: 1, schemaVersion: 3, snapshot: { tick: 20 } });
    await port.saveInstance(fakeTx(0, 1), "wi_1", first);
    await port.saveInstance(fakeTx(0, 2), "wi_1", second);
    await assert.rejects(port.saveInstance(fakeTx(0, 3), "wi_1", first), /rev 必须单调/u);
    const loaded = await port.loadInstance(0, "wi_1");
    assert.deepEqual(validateCheckpointEnvelope(loaded, SCHEMA, "instance"), second);
    assert.equal(await port.loadInstance(1, "wi_1"), null, "按 sId 分");
    assert.equal(await port.loadPersona(0, "wi_1"), null, "分线 / persona 分表");
    const persona = buildCheckpointEnvelope({ rev: 1, eventOffset: 3, authorityEpoch: 1, controlEpoch: 2, schemaVersion: 3, snapshot: { x: 5 } });
    await port.savePersona(fakeTx(0, 3), "p_alice_0000000001", persona);
    assert.deepEqual(validateCheckpointEnvelope(await port.loadPersona(0, "p_alice_0000000001"), SCHEMA, "persona"), persona);
    assert.deepEqual(port.log, ["instance:wi_1:1@1", "instance:wi_1:2@2", "persona:p_alice_0000000001:1@3"]);
});
