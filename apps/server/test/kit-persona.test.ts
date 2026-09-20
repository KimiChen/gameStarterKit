/**
 * MF2-B4 persona 门面（core/infra/kitApi.ts；docs/MMO.md §5 MF2 / M03）单测：假连接按剧本作答，⛔ 不连库（真库在 test/int/kit-persona.test.ts）。
 *  - createPersona：account 作用域 FOR UPDATE 先于 INSERT；slot 硬上限；UNIQUE 冲突（errno 1062）⇒ PersonaSlotTakenError（⛔ 不吞）；
 *    在 persona 行锁之后再 createPersona ⇒ PersonaLockOrderError；
 *  - assertControl：`UPDATE … WHERE control_epoch = ?` 的 Rows matched 判定；0 行 ⇒ 不存在 PersonaNotFoundError / 存在 ControlConflictError；
 *  - 锁序：同一事务内 persona id 必须升序（B 后 A ⇒ PersonaLockOrderError，且 A 不触库）；
 *  - deactivate / delete 的前置（在世界房 / 仍 active）；
 *  - 表闸对 `persona` 表照拒（kit ⛔ 直接 SQL）；冷档代码（core/archive/**）不涉及 persona（不参与 freeze / thaw）。
 * 变异验证：assertControl 删 `control_epoch = ?` 谓词 → 「旧 epoch 0 行」转红；takePersonaLock 删升序判定 → 「乱序锁」转红；
 * createPersona 吞 1062 → 「同槽二建」转红（真库用例同样转红）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validatePersonaId } from "@game/shared";
import { KIT_EFFECT_KINDS } from "@game/shared/kits/catalog.generated";
import {
  ControlConflictError, KitTableAccessError, PERSONA_MAX_SLOTS_HARD, PersonaBusyError, PersonaLockOrderError, PersonaNotFoundError,
  PersonaSlotTakenError, listPersonas, withKitTx, type KitTxDeps,
} from "../src/core/infra/kitApi";
import type { PoolConnection } from "../src/core/infra/mysql";

interface Script {
  /** 库里的 persona 行：id → { epoch, status, world } */
  readonly rows: Map<string, { epoch: number; status: 0 | 1; world: string | null }>;
  /** INSERT 时按 slot 撞 UNIQUE */
  readonly takenSlots?: Set<number>;
}

function fake(script: Script) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const info = (matched: number): string => `Rows matched: ${matched}  Changed: ${matched}  Warnings: 0`;
  const conn = {
    execute: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT persona_id FROM persona WHERE server_id = ? AND user_id = ? AND kit_id = ? FOR UPDATE")) return [[], []];
      if (sql.startsWith("INSERT INTO persona")) {
        if (script.takenSlots?.has(params[4] as number)) { const error = new Error("ER_DUP_ENTRY") as Error & { errno: number }; error.errno = 1062; throw error; }
        return [{ affectedRows: 1 }, []];
      }
      const row = script.rows.get(params[1] as string);
      if (sql.startsWith("UPDATE persona SET updated_at = NOW(3)")) {
        // 谓词按语句实际出现的逐个比对：删掉 control_epoch 谓词的变异 ⇒ 旧 epoch 也能匹配
        const epochOk = !sql.includes("control_epoch = ?") || (row !== undefined && row.epoch === params[3]);
        const matched = row !== undefined && epochOk ? 1 : 0;
        return [{ affectedRows: matched, info: info(matched) }, []];
      }
      if (sql.startsWith("UPDATE persona SET status = 1")) {
        const matched = row !== undefined && row.world === null ? 1 : 0;
        if (matched === 1) row!.status = 1;
        return [{ affectedRows: matched, info: info(matched) }, []];
      }
      if (sql.startsWith("DELETE FROM persona")) {
        const matched = row !== undefined && row.status === 1 && row.world === null ? 1 : 0;
        if (matched === 1) script.rows.delete(params[1] as string);
        return [{ affectedRows: matched }, []];
      }
      return [{ affectedRows: 1 }, []];
    },
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      const row = script.rows.get(params[1] as string);
      return [row === undefined ? [] : [{ control_epoch: row.epoch, status: row.status, world_address: row.world }], []];
    },
  } as unknown as PoolConnection;
  const deps: KitTxDeps = {
    withRcTx: async (fn) => fn(conn),
    debitInTx: async () => 0, creditInTx: async () => 0, insertOutboxIntent: async () => "INSERTED", assertOutboxIntentMatches: async () => undefined,
    invalidateBalanceCache: async () => undefined, kinds: KIT_EFFECT_KINDS,
  };
  return { deps, calls, conn };
}

const A = "a-0123456789abcdefXYZ";
const B = "b-0123456789abcdefXYZ";

test("createPersona：account 作用域 FOR UPDATE 先于 INSERT；返回合法 personaId；meta 缺省 NULL；slot 硬上限；同槽 UNIQUE ⇒ PersonaSlotTakenError", async () => {
  const { deps, calls } = fake({ rows: new Map(), takenSlots: new Set([2]) });
  const id = await withKitTx("arena", 3, (tx) => tx.createPersona("u1", 0, { name: "Ann" }), deps);
  assert.equal(validatePersonaId(id), id);
  assert.match(calls[0]!.sql, /^SELECT persona_id FROM persona WHERE server_id = \? AND user_id = \? AND kit_id = \? FOR UPDATE$/u);
  assert.deepEqual(calls[0]!.params, [3, "u1", "arena"]);
  assert.match(calls[1]!.sql, /^INSERT INTO persona \(server_id, persona_id, user_id, kit_id, slot, meta\)/u);
  assert.deepEqual(calls[1]!.params, [3, id, "u1", "arena", 0, "{\"name\":\"Ann\"}"]);
  calls.splice(0);
  await withKitTx("arena", 3, (tx) => tx.createPersona("u1", 1), deps);
  assert.equal(calls[1]!.params[5], null, "meta 缺省 NULL");
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.createPersona("u1", PERSONA_MAX_SLOTS_HARD), deps), /硬上限 PERSONA_MAX_SLOTS_HARD=16/u);
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.createPersona("u1", -1), deps), TypeError);
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.createPersona("u1", 2), deps), PersonaSlotTakenError, "同槽二建 ⇒ 冲突（⛔ 不吞 1062）");
});

test("assertControl：Rows matched 判定 control_epoch 谓词；旧 epoch ⇒ ControlConflictError（带实际 epoch）；不存在 ⇒ PersonaNotFoundError", async () => {
  const { deps, calls } = fake({ rows: new Map([[A, { epoch: 3, status: 0, world: null }]]) });
  await withKitTx("arena", 3, (tx) => tx.assertControl(A, 3), deps);
  assert.match(calls[0]!.sql, /^UPDATE persona SET updated_at = NOW\(3\) WHERE server_id = \? AND persona_id = \? AND kit_id = \? AND control_epoch = \?$/u);
  assert.deepEqual(calls[0]!.params, [3, A, "arena", 3]);
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.assertControl(A, 2), deps),
    (error: unknown) => error instanceof ControlConflictError && error.expectedEpoch === 2 && error.actualEpoch === 3, "旧 epoch 延迟提交 0 行");
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.assertControl(B, 0), deps), PersonaNotFoundError);
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.assertControl("bad id", 0), deps), /personaId/u);
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.assertControl(A, -1), deps), TypeError);
});

test("锁序：同一事务内 persona id 必须升序（B 后 A 拒且 A 不触库）；persona 行锁之后 ⛔ createPersona；升序 / 跨事务各自重来都放行", async () => {
  const rows = new Map([[A, { epoch: 0, status: 0 as const, world: null }], [B, { epoch: 0, status: 0 as const, world: null }]]);
  const { deps, calls } = fake({ rows });
  await withKitTx("arena", 3, async (tx) => { await tx.assertControl(A, 0); await tx.assertControl(B, 0); }, deps);
  calls.splice(0);
  await assert.rejects(withKitTx("arena", 3, async (tx) => { await tx.assertControl(B, 0); await tx.assertControl(A, 0); }, deps), PersonaLockOrderError);
  assert.equal(calls.filter((call) => call.params[1] === A).length, 0, "乱序的第二把锁在触库前被拒");
  await assert.rejects(withKitTx("arena", 3, async (tx) => { await tx.assertControl(A, 0); await tx.createPersona("u1", 5); }, deps), PersonaLockOrderError);
  await withKitTx("arena", 3, (tx) => tx.assertControl(A, 0), deps);
  await withKitTx("arena", 3, (tx) => tx.assertControl(B, 0), deps);
});

test("deactivate / delete：在世界房拒（Busy）；active 不能删（Busy）；inactive 且不在房才删；不存在 ⇒ NotFound", async () => {
  const rows = new Map([[A, { epoch: 0, status: 0 as const, world: "map1/line2/inst9" as string | null }], [B, { epoch: 0, status: 0 as const, world: null as string | null }]]);
  const { deps } = fake({ rows: rows as Script["rows"] });
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.deactivatePersona(A), deps), (e: unknown) => e instanceof PersonaBusyError && /仍在世界房/u.test(e.message));
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.deletePersona(B), deps), (e: unknown) => e instanceof PersonaBusyError && /仍 active/u.test(e.message));
  await withKitTx("arena", 3, (tx) => tx.deactivatePersona(B), deps);
  await withKitTx("arena", 3, (tx) => tx.deactivatePersona(B), deps); // 幂等
  await withKitTx("arena", 3, (tx) => tx.deletePersona(B), deps);
  assert.equal(rows.has(B), false);
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.deletePersona(B), deps), PersonaNotFoundError);
});

test("listPersonas（事务外只读）：按 slot 升序、列归一化；表闸对 persona 照拒；冷档代码不涉及 persona", async () => {
  const seen: unknown[][] = [];
  const list = await listPersonas("arena", "u1", 3, async (sql, params) => {
    seen.push([sql, params]);
    return [
      { persona_id: B, slot: "1", status: "1", control_epoch: "4", world_address: null, meta: { name: "B" } },
      { persona_id: A, slot: 0, status: 0, control_epoch: 0, world_address: "m/l/i", meta: null },
    ] as never;
  });
  assert.deepEqual(seen[0], ["SELECT persona_id, slot, status, control_epoch, world_address, meta FROM persona WHERE server_id = ? AND user_id = ? AND kit_id = ? ORDER BY slot", [3, "u1", "arena"]]);
  assert.deepEqual(list, [
    { personaId: B, slot: 1, status: 1, controlEpoch: 4, worldAddress: null, meta: { name: "B" } },
    { personaId: A, slot: 0, status: 0, controlEpoch: 0, worldAddress: "m/l/i", meta: null },
  ]);
  await assert.rejects(listPersonas("Arena", "u1", 3, async () => []), TypeError);
  const { deps } = fake({ rows: new Map() });
  await assert.rejects(withKitTx("arena", 3, (tx) => tx.query("SELECT * FROM persona WHERE user_id = ?", ["u1"]), deps), KitTableAccessError, "kit ⛔ 直接 SQL 触碰 persona");
  const archiveDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/core/archive");
  for (const file of fs.readdirSync(archiveDir)) {
    assert.ok(!/persona/iu.test(fs.readFileSync(path.join(archiveDir, file), "utf8")), `${file} 不得涉及 persona（persona 表不参与冷档）`);
  }
});
