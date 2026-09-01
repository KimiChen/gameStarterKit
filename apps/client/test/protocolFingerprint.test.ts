/**
 * 协议指纹硬闸（E5①，阶段 7 拆分后形态）：apps/shared/src/protocol/** 任何字节变化必须显式重钉
 * scripts/protocol.fingerprint（node scripts/protocol-fingerprint.mjs --write）——
 * 协议是双端单源契约，静默改动 = 双端漂移的第一步；重钉 diff 让变更在 review 可见，
 * 并强制思考两个协议身份整数（GAME_ROOM_PROTOCOL_VERSION / LOBBY_PROTOCOL_VERSION）是否需要
 * 人工 bump（各房型 join 兼容闸分别依赖它们；指纹本身只是字节审计锁，不参与 join 判定）。
 *
 * 覆盖：新锁格式 `g<GAME> l<LOBBY> <sha256>`、双常量 parser 刚性矩阵（旧名残留/缺一/重复/
 * 非字面量）、CLI --check 只读与漂移红、--write 幂等、无参数打印用法退出 1、锁与源一致。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// 脚本域 .mjs（不进 Cocos，不受「相对导入不带扩展名」铁律约束）
import {
  computeFingerprint,
  parseFingerprintLock,
  parseProtocolVersions,
  readProtocolVersions,
  FINGERPRINT_FILE,
} from "../../../scripts/protocol-fingerprint.mjs";

const SCRIPT = join(fileURLToPath(import.meta.url), "../../../../scripts/protocol-fingerprint.mjs");

test("协议指纹：shared/protocol 内容 ⇔ 钉档一致；两个协议身份 ⇔ 钉档一致（新格式 g<GAME> l<LOBBY> <sha256>）", () => {
  const pinned = readFileSync(FINGERPRINT_FILE, "utf8").trim();
  const m = /^g(\d+) l(\d+) ([0-9a-f]{64})$/.exec(pinned);
  assert.ok(m, `protocol.fingerprint 格式非法：${pinned}`);
  const versions = readProtocolVersions();
  assert.equal(Number(m![1]), versions.gameRoom,
    "GAME_ROOM_PROTOCOL_VERSION 与钉档不一致——bump 版本后跑 node scripts/protocol-fingerprint.mjs --write 重钉");
  assert.equal(Number(m![2]), versions.lobby,
    "LOBBY_PROTOCOL_VERSION 与钉档不一致——bump 版本后跑 node scripts/protocol-fingerprint.mjs --write 重钉");
  assert.equal(computeFingerprint(), m![3],
    "shared/protocol 内容与指纹不符——协议被改动：确认变更（必要时人工 bump 对应协议整数）后跑 node scripts/protocol-fingerprint.mjs --write 重钉并连指纹一起提交");
  assert.deepEqual(parseFingerprintLock(pinned), {
    gameRoom: versions.gameRoom,
    lobby: versions.lobby,
    hash: m![3],
  });
});

const VALID_SPLIT = [
  "export const GAME_ROOM_PROTOCOL_VERSION = 7;",
  "export const LOBBY_PROTOCOL_VERSION = 7;",
  "",
].join("\n");

test("协议版本解析：注释中的旧声明不能遮蔽真实 export；两常量各自读出", () => {
  const source = `/* export const GAME_ROOM_PROTOCOL_VERSION = 2; */\n${VALID_SPLIT}`;
  assert.deepEqual(parseProtocolVersions(source), { gameRoom: 7, lobby: 7 });
  assert.deepEqual(
    parseProtocolVersions("export const GAME_ROOM_PROTOCOL_VERSION = 9;\nexport const LOBBY_PROTOCOL_VERSION = 4;\n"),
    { gameRoom: 9, lobby: 4 },
    "两个整数独立读取，允许取值分叉",
  );
});

test("协议版本解析：旧名 PROTOCOL_VERSION 残留必须 throw 指引（含与新常量并存的形态）", () => {
  for (const legacy of [
    "export const PROTOCOL_VERSION = 7;",
    `export const PROTOCOL_VERSION = 7;\n${VALID_SPLIT}`,
    `const PROTOCOL_VERSION = 7;\n${VALID_SPLIT}`,
  ]) {
    assert.throws(() => parseProtocolVersions(legacy), /旧名 PROTOCOL_VERSION|拆分/u, `应拒绝旧名残留：${legacy}`);
  }
  // 命名空间内的旧名不是顶层声明，不触发旧名指引，但字符串/注释更不能触发
  assert.deepEqual(
    parseProtocolVersions(`const quoted = "export const PROTOCOL_VERSION = 99;";\n${VALID_SPLIT}`),
    { gameRoom: 7, lobby: 7 },
  );
});

test("协议版本解析：缺一即拒；重复声明必须失败", () => {
  assert.throws(
    () => parseProtocolVersions("export const GAME_ROOM_PROTOCOL_VERSION = 7;\n"),
    /LOBBY_PROTOCOL_VERSION.*有且仅有一个|有且仅有一个顶层 LOBBY_PROTOCOL_VERSION/u,
  );
  assert.throws(
    () => parseProtocolVersions("export const LOBBY_PROTOCOL_VERSION = 7;\n"),
    /GAME_ROOM_PROTOCOL_VERSION/u,
  );
  assert.throws(
    () => parseProtocolVersions(`export const GAME_ROOM_PROTOCOL_VERSION = 6;\n${VALID_SPLIT}`),
    /有且仅有一个/u,
  );
  assert.throws(
    () => parseProtocolVersions(`${VALID_SPLIT}export const LOBBY_PROTOCOL_VERSION = 8;\n`),
    /有且仅有一个/u,
  );
});

test("协议版本解析：只接受顶层精确 export，字符串和嵌套声明不应伪造版本（对两个常量同刚性）", () => {
  const source = [
    'const quoted = "export const GAME_ROOM_PROTOCOL_VERSION = 99;";',
    "const templated = `// export const LOBBY_PROTOCOL_VERSION = 98;`;",
    "namespace Legacy { export const GAME_ROOM_PROTOCOL_VERSION = 2; }",
    VALID_SPLIT,
  ].join("\n");
  assert.deepEqual(parseProtocolVersions(source), { gameRoom: 7, lobby: 7 });

  for (const name of ["GAME_ROOM_PROTOCOL_VERSION", "LOBBY_PROTOCOL_VERSION"] as const) {
    const other = name === "GAME_ROOM_PROTOCOL_VERSION"
      ? "export const LOBBY_PROTOCOL_VERSION = 7;"
      : "export const GAME_ROOM_PROTOCOL_VERSION = 7;";
    for (const invalid of [
      `export const ${name} = 7`,
      `export const ${name}: number = 7;`,
      `export const ${name} = 7 as const;`,
      `export const ${name} = 0x7;`,
      `export const ${name} = 07;`,
      `export const ${name} = 7_0;`,
      `export const ${name} = 7.0;`,
      `export const ${name} = 0;`,
      `export const ${name} = 9007199254740992;`,
      `export declare const ${name}: number;\nexport const ${name} = 7;`,
      `const ${name} = 6;\nexport const ${name} = 7;`,
      `namespace Legacy { export const ${name} = 7; }`,
    ]) {
      assert.throws(
        () => parseProtocolVersions(`${other}\n${invalid}\n`),
        /PROTOCOL_VERSION|声明/,
        `应拒绝非精确或非顶层声明（${name}）：${invalid}`,
      );
    }
  }
});

// ── CLI：--check/--write 互斥、只读、幂等（mkdtemp fixture root） ────────────

function createCliFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "protocol-fingerprint-"));
  mkdirSync(join(root, "apps/shared/src/protocol"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "apps/shared/src/protocol/rooms.ts"), VALID_SPLIT);
  writeFileSync(join(root, "apps/shared/src/protocol/http.ts"), "export const X = 1;\n");
  return root;
}

function runCli(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args, "--root", root], { encoding: "utf8" });
}

test("CLI：无参数打印用法并退出 1；--check 与 --write 互斥；未知参数拒绝", () => {
  const bare = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(bare.status, 1, "无参数必须退出 1（⛔ 不再隐式重钉）");
  assert.match(`${bare.stdout}${bare.stderr}`, /--check \| --write/u);

  const root = createCliFixture();
  try {
    const both = runCli(root, "--check", "--write");
    assert.equal(both.status, 1);
    assert.match(`${both.stdout}${both.stderr}`, /互斥/u);
    const unknown = runCli(root, "--frobnicate");
    assert.equal(unknown.status, 1);
    assert.match(`${unknown.stdout}${unknown.stderr}`, /未知参数/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI：--write 首钉新格式且幂等；--check 通过后改协议一字节不重钉 → --check 红且只读", () => {
  const root = createCliFixture();
  try {
    const lockPath = join(root, "scripts/protocol.fingerprint");
    // 锁缺失时 --check 红（fail closed）
    const missing = runCli(root, "--check");
    assert.equal(missing.status, 1);
    assert.match(`${missing.stdout}${missing.stderr}`, /锁文件缺失/u);

    const first = runCli(root, "--write");
    assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
    const firstLock = readFileSync(lockPath, "utf8");
    assert.match(firstLock.trim(), /^g7 l7 [0-9a-f]{64}$/u, "新格式单行首钉");
    const again = runCli(root, "--write");
    assert.equal(again.status, 0);
    assert.equal(readFileSync(lockPath, "utf8"), firstLock, "--write 幂等：相同输入字节级相同锁");

    const ok = runCli(root, "--check");
    assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);

    // 改协议一字节不重钉 → --check 漂移点名，且不得改写锁文件（只读）
    writeFileSync(join(root, "apps/shared/src/protocol/http.ts"), "export const X = 2;\n");
    const drift = runCli(root, "--check");
    assert.equal(drift.status, 1);
    assert.match(`${drift.stdout}${drift.stderr}`, /协议目录字节哈希/u);
    assert.equal(readFileSync(lockPath, "utf8"), firstLock, "--check 不得改写锁文件");

    // 版本漂移单独点名：源 bump 但锁未重钉
    writeFileSync(
      join(root, "apps/shared/src/protocol/rooms.ts"),
      "export const GAME_ROOM_PROTOCOL_VERSION = 8;\nexport const LOBBY_PROTOCOL_VERSION = 7;\n",
    );
    const versionDrift = runCli(root, "--check");
    assert.equal(versionDrift.status, 1);
    assert.match(`${versionDrift.stdout}${versionDrift.stderr}`, /GAME_ROOM_PROTOCOL_VERSION：锁 7 ≠ 源 8/u);

    // --write 重钉后从源读版本（⛔ 不自动 bump：写的就是源里的值）
    const rewrite = runCli(root, "--write");
    assert.equal(rewrite.status, 0);
    assert.match(readFileSync(lockPath, "utf8").trim(), /^g8 l7 [0-9a-f]{64}$/u);
    assert.equal(runCli(root, "--check").status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("锁格式解析：旧格式 v<N> 与畸形行一律拒绝", () => {
  assert.throws(() => parseFingerprintLock(`v7 ${"a".repeat(64)}`), /格式非法/u);
  assert.throws(() => parseFingerprintLock(`g7 l7 ${"a".repeat(63)}`), /格式非法/u);
  assert.throws(() => parseFingerprintLock(`g0 l7 ${"a".repeat(64)}`), /版本整数非法/u);
  assert.throws(() => parseFingerprintLock(`g7 l7 ${"A".repeat(64)}`), /格式非法/u);
  const parsed = parseFingerprintLock(`g7 l7 ${"a".repeat(64)}\n`);
  assert.deepEqual(parsed, { gameRoom: 7, lobby: 7, hash: "a".repeat(64) });
});
