/**
 * 协议指纹硬闸（E5①）：apps/shared/src/protocol/** 任何字节变化必须显式重钉
 * scripts/protocol.fingerprint（node scripts/protocol-fingerprint.mjs）——
 * 协议是双端单源契约，静默改动 = 双端漂移的第一步；重钉 diff 让变更在 review 可见，
 * 并强制思考 PROTOCOL_VERSION 是否需要 bump（旧客户端 join 兼容闸依赖它）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
// 脚本域 .mjs（不进 Cocos，不受「相对导入不带扩展名」铁律约束）
import { computeFingerprint, parseProtocolVersion, readProtocolVersion, FINGERPRINT_FILE } from "../../../scripts/protocol-fingerprint.mjs";

test("协议指纹：shared/protocol 内容 ⇔ 钉档一致；PROTOCOL_VERSION ⇔ 钉档一致", () => {
  const pinned = readFileSync(FINGERPRINT_FILE, "utf8").trim();
  const m = /^v(\d+) ([0-9a-f]{64})$/.exec(pinned);
  assert.ok(m, `protocol.fingerprint 格式非法：${pinned}`);
  assert.equal(Number(m![1]), readProtocolVersion(),
    "PROTOCOL_VERSION 与钉档不一致——bump 版本后跑 node scripts/protocol-fingerprint.mjs 重钉");
  assert.equal(computeFingerprint(), m![2],
    "shared/protocol 内容与指纹不符——协议被改动：确认变更（必要时 bump PROTOCOL_VERSION）后跑 node scripts/protocol-fingerprint.mjs 重钉并连指纹一起提交");
});

test("协议版本解析：注释中的旧声明不能遮蔽真实 export，重复声明必须失败", () => {
  const source = `/* export const PROTOCOL_VERSION = 2; */\nexport const PROTOCOL_VERSION = 7;\n`;
  assert.equal(parseProtocolVersion(source), 7);
  assert.throws(
    () => parseProtocolVersion("export const PROTOCOL_VERSION = 1;\nexport const PROTOCOL_VERSION = 2;\n"),
    /有且仅有一个/,
  );
});

test("协议版本解析：只接受顶层精确 export，字符串和嵌套声明不应伪造版本", () => {
  const source = [
    'const quoted = "export const PROTOCOL_VERSION = 99;";',
    "const templated = `// export const PROTOCOL_VERSION = 98;`;",
    "namespace Legacy { export const PROTOCOL_VERSION = 2; }",
    "export const PROTOCOL_VERSION = 7;",
  ].join("\n");
  assert.equal(parseProtocolVersion(source), 7);

  for (const invalid of [
    "export const PROTOCOL_VERSION = 7",
    "export const PROTOCOL_VERSION: number = 7;",
    "export const PROTOCOL_VERSION = 7 as const;",
    "namespace Legacy { export const PROTOCOL_VERSION = 7; }",
  ]) {
    assert.throws(
      () => parseProtocolVersion(invalid),
      /PROTOCOL_VERSION|声明/,
      `应拒绝非精确或非顶层声明：${invalid}`,
    );
  }
});
