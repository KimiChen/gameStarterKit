/**
 * mmo kit characters 面（服务端，MK0-B3）：假 KitTx 记录 SQL / persona 门面调用，⛔ 不连库。
 *  - createCharacter：同一事务里 createPersona(slot) → 插角色行 → 回执；回执存在即重放（零写入）；槽位满 / 槽位已有 / 名字撞各自的错误类；输入闸；
 *  - listCharacters：角色行 + persona 对账（persona 有行、角色无行 ⇒ orphan；status 0 = active）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PersonaSlotTakenError, type KitTx } from "../src/core/infra/kitApi";
import {
  MmoCharacterInputError, MmoNameTakenError, MmoSlotTakenError, MmoSlotsFullError, createCharacter, listCharacters, type CharactersDeps,
} from "../src/kits/mmo/api/characters/index";

interface FakeDb {
  readonly characters: { character_id: string; persona_id: string; user_id: string; slot: number; name: string; class_id: string; faction_id: string; level: number; exp: number; checkpoint_rev: number; map_id: string | null }[];
  readonly receipts: Map<string, unknown>;
  readonly personas: { personaId: string; slot: number; status: 0 | 1; uid: string }[];
  readonly calls: string[];
}

function fakeDeps(db: FakeDb): CharactersDeps {
  const tx = {
    kitId: "mmo", sId: 1,
    async query(sql: string, params: unknown[] = []) {
      db.calls.push(sql.split("\n")[0]!.trim().slice(0, 40));
      if (sql.startsWith("SELECT result FROM k_mmo_receipt")) { const hit = db.receipts.get(String(params[1])); return hit === undefined ? [] : [{ result: JSON.stringify(hit) }]; }
      if (sql.startsWith("SELECT COUNT(*) AS n FROM k_mmo_character")) return [{ n: db.characters.filter((row) => row.user_id === params[1]).length }];
      if (sql.includes("FROM k_mmo_character c WHERE c.server_id = ? AND c.user_id = ?")) return db.characters.filter((row) => row.user_id === params[1]);
      if (sql.includes("FROM k_mmo_character c WHERE c.server_id = ? AND c.persona_id = ?")) return db.characters.filter((row) => row.persona_id === params[1]);
      if (sql.startsWith("INSERT INTO k_mmo_character ")) {
        const [, characterId, personaId, uid, slot, name, classId, factionId] = params as [number, string, string, string, number, string, string, string];
        if (db.characters.some((row) => row.name === name)) { const error = new Error("Duplicate entry for key 'k_mmo_character.uk_mmo_character_name'"); (error as { errno?: number }).errno = 1062; throw error; }
        db.characters.push({ character_id: characterId, persona_id: personaId, user_id: uid, slot, name, class_id: classId, faction_id: factionId, level: 1, exp: 0, checkpoint_rev: 0, map_id: null });
        return { affectedRows: 1 };
      }
      if (sql.startsWith("INSERT INTO k_mmo_receipt")) { db.receipts.set(String(params[1]), JSON.parse(String(params[4]))); return { affectedRows: 1 }; }
      throw new Error(`unexpected sql: ${sql}`);
    },
    async createPersona(uid: string, slot: number) {
      db.calls.push(`createPersona:${slot}`);
      if (db.personas.some((persona) => persona.uid === uid && persona.slot === slot)) throw new PersonaSlotTakenError(uid, "mmo", slot);
      const personaId = `p-${uid}-${slot}`;
      db.personas.push({ personaId, slot, status: 0, uid });
      return personaId;
    },
  } as unknown as KitTx;
  let ids = 0;
  return {
    // 假事务：抛出即回滚（真库里 createPersona 与角色行同一事务，名字撞时 persona 行不会留下）
    run: async (_sId, fn) => {
      const snapshot = { characters: db.characters.length, personas: db.personas.length, receipts: new Map(db.receipts) };
      try {
        return await fn(tx);
      } catch (error) {
        db.characters.splice(snapshot.characters);
        db.personas.splice(snapshot.personas);
        db.receipts.clear();
        for (const [key, value] of snapshot.receipts) db.receipts.set(key, value);
        throw error;
      }
    },
    personas: async (uid) => db.personas.filter((persona) => persona.uid === uid).map(({ personaId, slot, status }) => ({ personaId, slot, status })),
    newId: () => `c-${(ids += 1)}`,
  };
}

const emptyDb = (): FakeDb => ({ characters: [], receipts: new Map(), personas: [], calls: [] });
const input = { slot: 0, name: "Rook", classId: "fighter", factionId: "dawn" } as const;

test("createCharacter：createPersona(slot) → 插角色行 → 回执，全在一个事务；重放回读回执零写入", async () => {
  const db = emptyDb();
  const deps = fakeDeps(db);
  const first = await createCharacter("u1", 1, input, "op-1", deps);
  assert.equal(first.replayed, false);
  assert.deepEqual(first.character, { characterId: "c-1", personaId: "p-u1-0", slot: 0, name: "Rook", classId: "fighter", factionId: "dawn", level: 1, exp: 0, mapId: null, status: "active" });
  assert.deepEqual(db.calls.filter((call) => call.startsWith("createPersona") || call.startsWith("INSERT")).map((call) => call.slice(0, 27)), ["createPersona:0", "INSERT INTO k_mmo_character", "INSERT INTO k_mmo_receipt ("]);
  const before = db.calls.length;
  const replay = await createCharacter("u1", 1, input, "op-1", deps);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.character, first.character);
  assert.equal(db.calls.length - before, 1, "重放只读回执");
  assert.equal(db.characters.length, 1);
});

test("createCharacter：槽位已有 ⇒ MmoSlotTakenError；名字撞 ⇒ MmoNameTakenError；满四个 ⇒ MmoSlotsFullError；输入闸", async () => {
  const db = emptyDb();
  const deps = fakeDeps(db);
  await createCharacter("u1", 1, input, "op-1", deps);
  await assert.rejects(createCharacter("u1", 1, { ...input, name: "Other" }, "op-2", deps), MmoSlotTakenError);
  await assert.rejects(createCharacter("u1", 1, { ...input, slot: 1 }, "op-3", deps), MmoNameTakenError);
  await createCharacter("u1", 1, { ...input, slot: 1, name: "Two" }, "op-4", deps);
  await createCharacter("u1", 1, { ...input, slot: 2, name: "Three" }, "op-5", deps);
  await createCharacter("u1", 1, { ...input, slot: 3, name: "Four" }, "op-6", deps);
  await assert.rejects(createCharacter("u1", 1, { ...input, slot: 3, name: "Five" }, "op-7", deps), MmoSlotsFullError);
  await assert.rejects(createCharacter("u1", 1, { ...input, slot: 9, name: "Six" }, "op-8", deps), MmoCharacterInputError);
  await assert.rejects(createCharacter("u1", 1, { ...input, slot: 0, name: "x" }, "op-9", deps), MmoCharacterInputError);
});

test("listCharacters：角色 + 孤儿 persona 对账；persona status 0 = active、1 = inactive", async () => {
  const db = emptyDb();
  const deps = fakeDeps(db);
  await createCharacter("u1", 1, input, "op-1", deps);
  db.personas.push({ personaId: "p-orphan", slot: 2, status: 0, uid: "u1" });
  db.personas[0]!.status = 1;
  const listing = await listCharacters("u1", 1, deps);
  assert.deepEqual(listing.characters.map((character) => [character.slot, character.name, character.status]), [[0, "Rook", "inactive"]]);
  assert.deepEqual(listing.orphans, [{ personaId: "p-orphan", slot: 2 }]);
  assert.deepEqual(await listCharacters("u2", 1, deps), { characters: [], orphans: [] });
});
