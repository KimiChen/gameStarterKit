/**
 * canonicalJsonString golden vectors（Non-intrusive §6.11）。
 *
 * 摘要 preimage 的字节稳定性是双端契约：这里钉死跨嵌套对象 / Unicode key /
 * 数组保序 / 可选字段 / 键序变化的输出与拒绝面。⛔ 其他语言或领域代码不得
 * 自行解释「稳定排序」——一律以本向量为准（实现在 shared lobbyRpc/canonicalJson.ts）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJsonString } from "@game/shared";
import { idemPayloadHash } from "../src/core/idem";

test("golden vectors：标量与空容器", () => {
  assert.equal(canonicalJsonString(null), "null");
  assert.equal(canonicalJsonString(true), "true");
  assert.equal(canonicalJsonString(false), "false");
  assert.equal(canonicalJsonString(0), "0");
  assert.equal(canonicalJsonString(-0), "0", "-0 必须规约为 0（同值必同摘要）");
  assert.equal(canonicalJsonString(1.5), "1.5");
  assert.equal(canonicalJsonString(-42), "-42");
  assert.equal(canonicalJsonString(""), '""');
  assert.equal(canonicalJsonString("a\"b\\c\n"), '"a\\"b\\\\c\\n"');
  assert.equal(canonicalJsonString([]), "[]");
  assert.equal(canonicalJsonString({}), "{}");
});

test("golden vectors：对象键按 UTF-16 码元序稳定排序，键序变化不影响输出", () => {
  assert.equal(canonicalJsonString({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(
    canonicalJsonString({ a: 2, b: 1 }),
    canonicalJsonString({ b: 1, a: 2 }),
    "同一对象的两种声明键序必须产出同一字节串",
  );
  // 大写字母码元 (0x41..) < 小写 (0x61..) < 汉字 (0x4E2D..? 实为 0x4E2D>0x61 视码元而定)
  assert.equal(canonicalJsonString({ b: 0, A: 0, a: 0 }), '{"A":0,"a":0,"b":0}');
});

test("golden vectors：Unicode key（含代理对）按码元序，⛔ 不是码点/locale 序", () => {
  // "Ａ"(Ａ 全角) 码元 0xFF21；"𝕒"(𝕒) 首码元 0xD835；"中" 0x4E2D；"é" 0xE9
  const out = canonicalJsonString({ "Ａ": 1, "𝕒": 2, "中": 3, "é": 4, z: 5 });
  // 码元序：z(0x7A) < 中(0x4E2D)? 否——0x7A < 0x4E2D；顺序: z, 中, é? é=0xE9 < 0x4E2D。
  // 精确序（首码元升序）：z(0x7A) → é(0xE9) → 中(0x4E2D) → 𝕒(0xD835) → Ａ(0xFF21)
  assert.equal(out, '{"z":5,"é":4,"中":3,"𝕒":2,"Ａ":1}');
});

test("golden vectors：数组保序、嵌套对象逐层排序", () => {
  assert.equal(
    canonicalJsonString({ list: [3, 1, 2], nest: { y: { b: 1, a: [true, null] }, x: 0 } }),
    '{"list":[3,1,2],"nest":{"x":0,"y":{"a":[true,null],"b":1}}}',
  );
});

test("golden vectors：可选字段——缺席与存在是不同字节串", () => {
  assert.equal(canonicalJsonString({ nickname: "n" }), '{"nickname":"n"}');
  assert.equal(canonicalJsonString({ nickname: "n", avatarId: 1 }), '{"avatarId":1,"nickname":"n"}');
  assert.notEqual(canonicalJsonString({ nickname: "n" }), canonicalJsonString({ nickname: "n", avatarId: 1 }));
});

test("拒绝面：undefined / 函数 / symbol / bigint / 非有限数 / 非 plain 对象 / 循环引用一律 throw", () => {
  assert.throws(() => canonicalJsonString(undefined), /JSON 值域外|undefined/u);
  assert.throws(() => canonicalJsonString({ a: undefined }), /undefined/u);
  assert.throws(() => canonicalJsonString([1, undefined]), /undefined/u);
  // eslint-disable-next-line no-sparse-arrays
  assert.throws(() => canonicalJsonString([1, , 2]), /undefined|稀疏/u);
  assert.throws(() => canonicalJsonString(() => 0), /JSON 值域外/u);
  assert.throws(() => canonicalJsonString(Symbol("x")), /JSON 值域外/u);
  assert.throws(() => canonicalJsonString(BigInt(1)), /JSON 值域外/u);
  assert.throws(() => canonicalJsonString(NaN), /非有限/u);
  assert.throws(() => canonicalJsonString(Infinity), /非有限/u);
  assert.throws(() => canonicalJsonString(new Date(0)), /plain object/u);
  assert.throws(() => canonicalJsonString(new Map()), /plain object/u);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJsonString(cyclic), /循环引用/u);
  const cyclicArray: unknown[] = [];
  cyclicArray.push(cyclicArray);
  assert.throws(() => canonicalJsonString(cyclicArray), /循环引用/u);
  // 非循环的重复引用（DAG）是合法 JSON 值
  const sharedLeaf = { k: 1 };
  assert.equal(canonicalJsonString([sharedLeaf, sharedLeaf]), '[{"k":1},{"k":1}]');
});

test("idemPayloadHash：从副本排除 clientReqId、不改原对象；route 进 preimage", () => {
  const payload = { clientReqId: "c1", nickname: "n", avatarId: 3 };
  const before = JSON.stringify(payload);
  const h1 = idemPayloadHash("user.updateProfile", payload);
  assert.equal(JSON.stringify(payload), before, "⛔ 不得修改传给 handler 的 validated payload");
  assert.match(h1, /^[0-9a-f]{64}$/u);
  // clientReqId 不同不影响摘要（它已是 key 末段分量）
  assert.equal(idemPayloadHash("user.updateProfile", { ...payload, clientReqId: "c2" }), h1);
  // 业务字段不同 → 摘要不同
  assert.notEqual(idemPayloadHash("user.updateProfile", { ...payload, nickname: "m" }), h1);
  // 键序变化不影响摘要
  assert.equal(idemPayloadHash("user.updateProfile", { avatarId: 3, nickname: "n", clientReqId: "x" }), h1);
  // route type 进 preimage：同 payload 异路由必得异摘要
  assert.notEqual(idemPayloadHash("guild.join", payload), h1);
});
