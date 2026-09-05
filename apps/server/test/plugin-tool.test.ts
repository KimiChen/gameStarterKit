/**
 * 插件工具（tools/plugin/*，docs/PLUGIN.md §1/§5 的实现）契约：
 *  - 所有权推导是 allowlist：受保护路径 / 生成物 / 脚本 / 包清单永远拒绝，镜像与 .meta 随真源归属；
 *  - zip 读写确定性且 fail-closed（zip-slip、符号链接、zip64、坏 CRC 一律拒绝）；
 *  - pack → install → check → upgrade（旧有新无按清单删、本地改动拒绝、同版本不同内容拒绝、降级显式）
 *    → uninstall 的端到端在隔离 fixture 根上跑通（postinstall/git 关闭，只验文件层）；
 *  - 包内出现越权路径（脚本 / 受保护文件）整包拒绝并点名。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkInstalledPlugins } from "../tools/plugin/check";
import { parseCli } from "../tools/plugin/cli";
import { allowDeleteFor, installPlugin, nextStepsFor, reinstallFromTree, runCommand, type CommandRunner } from "../tools/plugin/install";
import { readInstalledLock, renderFilesLock, sha256 } from "../tools/plugin/lock";
import { compareVersions, parsePluginManifest } from "../tools/plugin/manifest";
import {
  classifyPath,
  deriveOwnership,
  isPluginClientDir,
  normalizePackagePath,
  readProtectedPaths,
  type PluginIdentity,
} from "../tools/plugin/ownership";
import { packPlugin } from "../tools/plugin/pack";
import { readPackage, validatePackage } from "../tools/plugin/package";
import { uninstallPlugin } from "../tools/plugin/uninstall";
import { readZip, writeZip } from "../tools/plugin/zip";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PROTECTED = readProtectedPaths(REPOSITORY_ROOT);

const FEATURE_IDENTITY: PluginIdentity = {
  id: "chamber",
  kinds: ["feature"],
  constantName: null,
  domains: ["chamber"],
  fguiPackages: ["Chamber"],
  clientDirs: ["apps/client/src/features/chamber/view", "apps/client/src/features/chamber/logic"],
};

const GAMEPLAY_IDENTITY: PluginIdentity = {
  id: "puzzle",
  kinds: ["gameplay", "feature"],
  constantName: "Puzzle",
  domains: [],
  fguiPackages: [],
  clientDirs: ["apps/client/src/view/rooms/puzzle", "apps/client/src/logic/rooms/puzzle"],
};

function allowed(relative: string, identity: PluginIdentity): boolean {
  return classifyPath(relative, deriveOwnership(identity), PROTECTED).allowed;
}

// ── 所有权推导 ─────────────────────────────────────────────────────────────

test("allowlist：feature 插件的推导集覆盖 feature/domain/客户端/FGUI/测试/文档落点，镜像与 .meta 随真源", () => {
  for (const relative of [
    "plugins/chamber/plugin.json",
    "features/chamber/feature.json",
    "apps/shared/src/protocol/lobbyRpc/domains/chamber.ts",
    "apps/server/src/websocket/chamber/peek.ts",
    "apps/server/src/core/chamber/keys.ts",
    "apps/server/test/lobbyRpcVectors/chamber.ts",
    "apps/server/test/chamber-peek.test.ts",
    "apps/server/test/int/chamber-flow.test.ts",
    "apps/client/test/chamber-logic.test.ts",
    "apps/client/src/features/chamber/index.ts",
    "apps/client/src/features/chamber/view/ChamberView.ts",
    "apps/client/src/features/chamber/view/ChamberView.view.json",
    "apps/Cocos/assets/src/features/chamber/view/ChamberView.ts",
    "apps/Cocos/assets/src/features/chamber/view/ChamberView.ts.meta",
    "apps/Cocos/assets/src/features/chamber.meta",
    "apps/Cocos/assets/src/features/chamber/view.meta",
    "apps/art/fairygui/assets/Chamber/package.xml",
    "apps/Cocos/assets/resources/ui/Chamber.bin",
    "apps/Cocos/assets/resources/ui/Chamber.bin.meta",
    "apps/Cocos/assets/resources/ui/Chamber_atlas0.png",
    "apps/Cocos/assets/resources/ui/Chamber_atlas0.png.meta",
    "docs/chamber/README.md",
  ]) {
    assert.ok(allowed(relative, FEATURE_IDENTITY), `应放行：${relative}`);
  }
  for (const relative of [
    "apps/Cocos/assets/src/features.meta", // 共享祖先目录 .meta 由仓库持有
    "apps/Cocos/assets/src/view/rooms.meta",
    "apps/client/src/features/other/index.ts",
    "apps/server/src/websocket/user/getInfo.ts",
    "apps/server/src/websocket/chamberx/peek.ts",
    "apps/server/test/lobbyRpcVectors/user.ts",
    "apps/server/test/user.test.ts",
    "apps/server/test/chamber", // prefix 规则要求真实文件名长于前缀
    "apps/server/test/chamberx-peek.test.ts", // 前缀后必须紧跟分隔符：tally ⛔ 不吞 tallyBoard-*、red ⛔ 不拥有 redis-*
    "apps/server/test/int/chamberFlow.test.ts",
    "apps/client/test/chamberLogic.test.ts",
    "apps/Cocos/assets/resources/ui/Common_Btn.bin",
    "apps/Cocos/assets/resources/ui/Chamber2.bin",
    "features/chamber2/feature.json",
    "docs/PLUGIN.md",
  ]) {
    assert.ok(!allowed(relative, FEATURE_IDENTITY), `应拒绝：${relative}`);
  }
});

test("allowlist：gameplay 插件的推导集覆盖 manifest/shared/server mode/client module/logic/view/<Constant>Room/resources", () => {
  for (const relative of [
    "apps/shared/schema/gameplays/puzzle/manifest.json",
    "apps/shared/schema/gameplays/puzzle/state.json",
    "apps/shared/src/gameplays/puzzle/wire.ts",
    "apps/server/src/rooms/modes/puzzle/index.ts",
    "apps/client/src/gameplay/modes/puzzle/index.ts",
    "apps/client/src/logic/rooms/puzzle/PuzzleLogic.ts",
    "apps/client/src/view/rooms/puzzle/PuzzleWorldView.ts",
    "apps/client/src/net/rooms/PuzzleRoom.ts",
    "apps/server/test/wire-vectors/puzzle.ts",
    "apps/Cocos/assets/src/net/rooms/PuzzleRoom.ts.meta",
    "apps/Cocos/assets/src/view/rooms/puzzle.meta",
    "apps/Cocos/assets/resources/puzzle/tiles.png",
    "apps/Cocos/assets/resources/puzzle/tiles.png.meta",
    "apps/Cocos/assets/resources/puzzle.meta",
    "features/puzzle/feature.json",
  ]) {
    assert.ok(allowed(relative, GAMEPLAY_IDENTITY), `应放行：${relative}`);
  }
  for (const relative of [
    "apps/shared/src/gameplays/puzzle/skins.generated.ts", // 生成物形态即使在自己目录里也不随包
    "apps/shared/src/gameplays/index.ts",
    "apps/shared/src/gameplays/snake/wire.ts",
    "apps/server/src/rooms/modes/catalog.ts",
    "apps/server/src/rooms/modes/catalog.generated.ts",
    "apps/server/src/rooms/core/RoomProfile.ts",
    "apps/client/src/net/rooms/GameRoomTransport.ts",
    "apps/client/src/net/rooms/SnakeRoom.ts",
    "apps/Cocos/assets/src/net/rooms.meta",
    "apps/server/test/wire-vectors/index.generated.ts",
    "apps/server/test/wire-vectors/index.ts",
    "apps/server/test/wire-vectors/core.ts",
  ]) {
    assert.ok(!allowed(relative, GAMEPLAY_IDENTITY), `应拒绝：${relative}`);
  }
});

test("硬排除与受保护路径永远拒绝：真仓 protected-paths.json 的每条路径对任何插件都不可写", () => {
  const rules = deriveOwnership(FEATURE_IDENTITY);
  for (const protectedPath of PROTECTED) {
    const probe = protectedPath.endsWith("/**") ? `${protectedPath.slice(0, -3)}/probe.ts` : protectedPath;
    assert.ok(!classifyPath(probe, rules, PROTECTED).allowed, `受保护路径必须拒绝：${probe}`);
  }
  for (const relative of [
    "package.json", "apps/server/package.json", "package-lock.json", ".npmrc", "tsconfig.json", "tsconfig.strict.json",
    ".env", ".env.development", ".github/workflows/ci.yml", "scripts/verify-toolchain.mjs", "scripts/plugins/chamber.lock",
    "tools/fgui-codegen/cli.ts", "apps/server/tools/plugin/install.ts", "apps/Cocos/assets/scene.scene",
    "apps/client/src/lib/bitecs/index.ts", "apps/client/src/shared/protocol/rooms.ts", "apps/client/src/app/AppRuntime.ts",
    "apps/shared/src/protocol/rooms.ts", "apps/shared/src/protocol/lobbyRpc/index.ts", "apps/server/src/core/infra/keys.ts",
    "node_modules/x/index.js", "features/chamber/node_modules/x.js", "scripts/protocol.fingerprint", "vendor/x.tgz",
    "docs/features.generated.md", "apps/client/src/generated/features.generated.ts",
  ]) {
    assert.ok(!classifyPath(relative, rules, PROTECTED).allowed, `必须拒绝：${relative}`);
  }
});

test("身份形态闸：坏 id / 缺 constantName / feature 客户端目录越出命名空间 / 非 feature 声明 domains 一律拒绝", () => {
  assert.throws(() => deriveOwnership({ ...FEATURE_IDENTITY, id: "Chamber" }), /id "Chamber" 非法/u);
  assert.throws(() => deriveOwnership({ ...FEATURE_IDENTITY, id: "a/b" }), /id "a\/b" 非法/u);
  assert.throws(() => deriveOwnership({ ...FEATURE_IDENTITY, id: "registry", domains: [] }), /保留字/u);
  assert.throws(() => deriveOwnership({ ...GAMEPLAY_IDENTITY, constantName: null }), /必须声明 constantName/u);
  assert.throws(() => deriveOwnership({ ...FEATURE_IDENTITY, constantName: "Chamber" }), /才声明 constantName/u);
  assert.throws(() => deriveOwnership({ ...FEATURE_IDENTITY, kinds: [] }), /kinds 不能为空/u);
  assert.throws(() => deriveOwnership({ ...GAMEPLAY_IDENTITY, kinds: ["gameplay"], domains: ["x"], clientDirs: [] }), /只有 kinds 含 feature/u);
  assert.throws(() => deriveOwnership({ ...FEATURE_IDENTITY, clientDirs: ["apps/client/src/view"] }), /不在插件 "chamber" 的命名空间内/u);
  assert.throws(() => deriveOwnership({ ...FEATURE_IDENTITY, clientDirs: ["apps/client/src/view/rooms/snake"] }), /不在插件 "chamber" 的命名空间内/u);
  assert.ok(isPluginClientDir("chamber", "apps/client/src/features/chamber/view"));
  assert.ok(isPluginClientDir("chamber", "apps/client/src/view/rooms/chamber"));
  assert.ok(isPluginClientDir("chamber", "apps/client/src/logic/page/chamber/"));
  assert.ok(!isPluginClientDir("chamber", "apps/client/src/logic/page"));
  assert.ok(!isPluginClientDir("chamber", "apps/client/src/features/chamberx"));
});

test("包内路径形态闸：zip-slip / 绝对路径 / 反斜杠 / 控制字符 / 空段一律拒绝", () => {
  for (const raw of ["../x", "a/../b", "/etc/passwd", "C:/x", "a\\b", "a//b", "./a", "", "a/\u0000"]) {
    assert.throws(() => normalizePackagePath(raw), `应拒绝：${JSON.stringify(raw)}`);
  }
  assert.equal(normalizePackagePath("features/chamber/feature.json"), "features/chamber/feature.json");
});

// ── zip ───────────────────────────────────────────────────────────────────

test("zip：确定性写出、往返一致；zip-slip / 符号链接 / zip64 / 坏 CRC 一律拒绝", () => {
  const entries = [
    { path: "b/two.txt", data: Buffer.from("two") },
    { path: "a/one.txt", data: Buffer.from("one".repeat(1000)) },
    { path: "plugin.json", data: Buffer.from("{}") },
  ];
  const first = writeZip(entries);
  const second = writeZip([...entries].reverse());
  assert.ok(first.equals(second), "同一输入集合必须字节级同一输出（与排序无关）");
  const back = readZip(first);
  assert.deepEqual(back.map((entry) => entry.path), ["a/one.txt", "b/two.txt", "plugin.json"]);
  assert.ok(back[0].data.equals(entries[1].data));
  assert.throws(() => writeZip([{ path: "../x", data: Buffer.alloc(0) }]), /非法段/u);
  assert.throws(() => writeZip([{ path: "A.txt", data: Buffer.alloc(0) }, { path: "a.txt", data: Buffer.alloc(0) }]), /重名/u);

  // zip-slip：把 "ab/x" 原地改成 "../x"（同长度，local + central 两处）。
  const slip = Buffer.from(writeZip([{ path: "ab/x", data: Buffer.from("x") }]));
  let index = slip.indexOf("ab/x");
  while (index !== -1) {
    slip.write("../x", index, "utf8");
    index = slip.indexOf("ab/x", index + 1);
  }
  assert.throws(() => readZip(slip), /非法段/u);

  // 符号链接：central directory 的外部属性 unix mode 置 S_IFLNK。
  const link = Buffer.from(writeZip([{ path: "a/link", data: Buffer.from("target") }]));
  const central = link.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  link.writeUInt32LE(0xa1ff0000, central + 38);
  assert.throws(() => readZip(link), /符号链接/u);

  // 坏 CRC：改 central 里的 crc 字段。
  const bad = Buffer.from(writeZip([{ path: "a/one", data: Buffer.from("payload") }]));
  const centralBad = bad.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bad.writeUInt32LE(0xdeadbeef, centralBad + 16);
  assert.throws(() => readZip(bad), /CRC 不符/u);

  // zip64 标记：条目数 0xffff。
  const z64 = Buffer.from(writeZip([{ path: "a/one", data: Buffer.from("payload") }]));
  z64.writeUInt16LE(0xffff, z64.length - 22 + 10);
  assert.throws(() => readZip(z64), /zip64/u);
  assert.throws(() => readZip(Buffer.from("not a zip at all, definitely not")), /找不到 end-of-central-directory/u);
});

// ── pack / install / check / upgrade / uninstall（隔离 fixture 根）──────────

interface Fixture {
  readonly author: string;
  readonly target: string;
}

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-tool-"));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(REPOSITORY_ROOT, "scripts/protected-paths.json"), path.join(root, "scripts/protected-paths.json"));
  return root;
}

function write(root: string, relative: string, content: string | Buffer): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function meta(importer: string): string {
  return `${JSON.stringify({ ver: "4.0.24", importer, imported: true, uuid: sha256(importer).slice(0, 36), files: [], subMetas: {}, userData: {} }, null, 2)}\n`;
}

/** 作者侧工作树：一个带 RPC 域 + 客户端 View/Logic + 镜像 .meta + 测试 + 文档的 feature 插件（id 可换，默认 chamber）。 */
function authorTree(root: string, version: string, id = "chamber"): void {
  const Constant = id.charAt(0).toUpperCase() + id.slice(1);
  write(root, `plugins/${id}/plugin.json`, `${JSON.stringify({
    schemaVersion: 1, id, version, kinds: ["feature"], domains: [id],
    requires: { featureSchemaVersion: 1 }, description: "fixture feature plugin",
  }, null, 2)}\n`);
  write(root, `features/${id}/feature.json`, `${JSON.stringify({
    schemaVersion: 1, id, category: "extra", resident: false,
    viewDirs: [`apps/client/src/features/${id}/view`],
    views: [`apps/client/src/features/${id}/view/${Constant}View.view.json`],
    owners: [{ id, logicDir: `apps/client/src/features/${id}/logic` }],
    routes: [{ id, view: Constant }], menu: [],
  }, null, 2)}\n`);
  write(root, `apps/shared/src/protocol/lobbyRpc/domains/${id}.ts`, "export default {} as never;\n");
  write(root, `apps/server/src/websocket/${id}/peek.ts`, "export default {} as never;\n");
  write(root, `apps/server/src/core/${id}/keys.ts`, `export const k${Constant}Seq = 1;\n`);
  write(root, `apps/server/test/lobbyRpcVectors/${id}.ts`, "export default {};\n");
  write(root, `apps/server/test/${id}-peek.test.ts`, "// fixture test\n");
  write(root, `docs/${id}/README.md`, `# ${id} ${version}\n`);
  const clientFiles: Record<string, string> = {
    [`apps/client/src/features/${id}/index.ts`]: `export const ${id} = 1;\n`,
    [`apps/client/src/features/${id}/view/${Constant}View.ts`]: `export class ${Constant}View {}\n`,
    [`apps/client/src/features/${id}/view/${Constant}View.view.json`]: "{ \"kind\": \"cocos\" }\n",
    [`apps/client/src/features/${id}/logic/${Constant}Logic.ts`]: `export class ${Constant}Logic {}\n`,
  };
  for (const [relative, content] of Object.entries(clientFiles)) {
    write(root, relative, content);
    const mirror = relative.replace("apps/client/src/", "apps/Cocos/assets/src/");
    write(root, mirror, content);
    write(root, `${mirror}.meta`, meta(relative.endsWith(".json") ? "json" : "typescript"));
  }
  for (const dir of [`apps/Cocos/assets/src/features/${id}`, `apps/Cocos/assets/src/features/${id}/view`, `apps/Cocos/assets/src/features/${id}/logic`]) {
    write(root, `${dir}.meta`, meta("directory"));
  }
}

/** 把 fixture 根变成 git 仓并提交现状（git 口径的闸：干净检查、跟踪判定、暂存）。 */
function gitInit(root: string): void {
  const run = (...args: string[]): void => {
    const result = spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} 失败：${result.stderr}`);
  };
  run("init", "-q");
  run("add", "-A");
  run("commit", "-q", "--allow-empty", "-m", "fixture baseline");
}

function gitPorcelain(root: string): string {
  return spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" }).stdout.trim();
}

function makeFixture(version = "1.0.0"): Fixture {
  const author = makeRoot();
  authorTree(author, version);
  const target = makeRoot();
  return { author, target };
}

function cleanup(...roots: string[]): void {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}

test("pack：采集所有权推导集 + 镜像 + .meta，写出确定性 zip 与目录形态；缺 .meta 即失败", () => {
  const { author, target } = makeFixture();
  try {
    const zipFile = path.join(target, "chamber-1.0.0.zip");
    const result = packPlugin({ root: author, id: "chamber", outFile: zipFile });
    assert.equal(result.manifest.version, "1.0.0");
    const paths = result.entries.map((entry) => entry.path);
    for (const expected of [
      "plugins/chamber/plugin.json",
      "features/chamber/feature.json",
      "apps/shared/src/protocol/lobbyRpc/domains/chamber.ts",
      "apps/server/test/lobbyRpcVectors/chamber.ts",
      "apps/client/src/features/chamber/view/ChamberView.ts",
      "apps/Cocos/assets/src/features/chamber/view/ChamberView.ts",
      "apps/Cocos/assets/src/features/chamber/view/ChamberView.ts.meta",
      "apps/Cocos/assets/src/features/chamber.meta",
      "apps/Cocos/assets/src/features/chamber/view.meta",
      "docs/chamber/README.md",
    ]) {
      assert.ok(paths.includes(expected), `包应含 ${expected}`);
    }
    assert.ok(!paths.includes("apps/Cocos/assets/src/features.meta"), "共享祖先目录 .meta ⛔ 不随包");
    const again = packPlugin({ root: author, id: "chamber", outFile: path.join(target, "again.zip") });
    assert.ok(fs.readFileSync(zipFile).equals(fs.readFileSync(again.output)), "同一工作树两次 pack 字节级相同");

    const dirOut = path.join(target, "unpacked");
    packPlugin({ root: author, id: "chamber", outDir: dirOut });
    assert.ok(fs.existsSync(path.join(dirOut, "plugin.json")) && fs.existsSync(path.join(dirOut, "files.lock")));
    const fromDir = readPackage(dirOut);
    const fromZip = readPackage(zipFile);
    assert.deepEqual(fromDir.entries, fromZip.entries, "目录形态与 zip 形态清单一致");

    // 作者忘了让 Creator 落盘 .meta → pack 拒绝并点名。
    fs.rmSync(path.join(author, "apps/Cocos/assets/src/features/chamber/logic/ChamberLogic.ts.meta"));
    assert.throws(() => packPlugin({ root: author, id: "chamber", outFile: path.join(target, "x.zip") }), /缺少 .*ChamberLogic\.ts\.meta/u);
  } finally {
    cleanup(author, target);
  }
});

test("install：首装落盘 + 锁 + plugins/<id>/plugin.json；check 通过；本地改动被 check 与再次 install 点名", () => {
  const { author, target } = makeFixture();
  try {
    const zipFile = path.join(author, "out/chamber.zip");
    packPlugin({ root: author, id: "chamber", outFile: zipFile });
    const dry = installPlugin({ root: target, source: zipFile, git: false, postinstall: false, dryRun: true });
    assert.equal(dry.previousVersion, null);
    assert.ok(!fs.existsSync(path.join(target, "features/chamber/feature.json")), "dry-run 不落盘");

    const report = installPlugin({ root: target, source: zipFile, git: false, postinstall: false });
    assert.equal(report.version, "1.0.0");
    assert.ok(report.written.includes("features/chamber/feature.json"));
    assert.ok(fs.existsSync(path.join(target, "apps/Cocos/assets/src/features/chamber/view/ChamberView.ts.meta")));
    assert.ok(fs.existsSync(path.join(target, "plugins/chamber/plugin.json")));
    const lock = readInstalledLock(target, "chamber");
    assert.ok(lock && lock.manifest.version === "1.0.0" && lock.entries.length === report.written.length);
    assert.ok(fs.readFileSync(path.join(target, "scripts/plugins/chamber.lock"), "utf8").includes("Do not edit"));
    assert.ok(report.nextSteps.some((step) => step.includes("protocol-fingerprint") && step.includes("本次未跑 codegen")), "postinstall:false 时带 domain 的插件只给条件式的指纹提示（没跑 codegen 无从知道是否真变了）");
    assert.equal(checkInstalledPlugins(target).ok, true);

    // 同一包重装 = 幂等（同版本同内容）。
    const again = installPlugin({ root: target, source: zipFile, git: false, postinstall: false });
    assert.deepEqual(again.written, []);
    assert.equal(again.unchanged.length, report.written.length);

    // 本地改动：check 点名；再次 install 拒绝（不覆盖本地改动）。
    fs.appendFileSync(path.join(target, "apps/server/src/core/chamber/keys.ts"), "// local edit\n");
    const check = checkInstalledPlugins(target);
    assert.equal(check.ok, false);
    assert.match(check.plugins[0].problems.join("\n"), /本地改动.*core\/chamber\/keys\.ts/u);
    assert.throws(() => installPlugin({ root: target, source: zipFile, git: false, postinstall: false }), /本地改动会被覆盖丢失/u);
  } finally {
    cleanup(author, target);
  }
});

test("upgrade：旧有新无按清单删除、同版本不同内容拒绝、降级须显式；uninstall 按锁删除并清空目录", () => {
  const { author, target } = makeFixture("1.0.0");
  try {
    const v1 = path.join(author, "out/v1.zip");
    packPlugin({ root: author, id: "chamber", outFile: v1 });
    installPlugin({ root: target, source: v1, git: false, postinstall: false });

    // 同版本不同内容 → 拒绝。
    fs.writeFileSync(path.join(author, "docs/chamber/README.md"), "# chamber changed but version kept\n");
    const v1b = path.join(author, "out/v1b.zip");
    packPlugin({ root: author, id: "chamber", outFile: v1b });
    assert.throws(() => installPlugin({ root: target, source: v1b, git: false, postinstall: false }), /版本相同但内容不同/u);

    // 1.1.0：删 README、加 CHANGELOG。
    fs.rmSync(path.join(author, "docs/chamber/README.md"));
    fs.writeFileSync(path.join(author, "docs/chamber/CHANGELOG.md"), "# 1.1.0\n");
    const manifestFile = path.join(author, "plugins/chamber/plugin.json");
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, "utf8").replace('"1.0.0"', '"1.1.0"'));
    const v2 = path.join(author, "out/v2.zip");
    packPlugin({ root: author, id: "chamber", outFile: v2 });
    const upgrade = installPlugin({ root: target, source: v2, git: false, postinstall: false });
    assert.equal(upgrade.previousVersion, "1.0.0");
    assert.deepEqual(upgrade.deleted, ["docs/chamber/README.md"]);
    assert.ok(upgrade.written.includes("docs/chamber/CHANGELOG.md"));
    assert.ok(!fs.existsSync(path.join(target, "docs/chamber/README.md")), "旧有新无必须删除");
    assert.equal(readInstalledLock(target, "chamber")?.manifest.version, "1.1.0");
    assert.equal(checkInstalledPlugins(target).ok, true);

    // 降级：默认拒绝，显式放行。
    assert.throws(() => installPlugin({ root: target, source: v1, git: false, postinstall: false }), /拒绝降级/u);
    const downgrade = installPlugin({ root: target, source: v1, git: false, postinstall: false, allowDowngrade: true });
    assert.equal(downgrade.version, "1.0.0");
    assert.ok(fs.existsSync(path.join(target, "docs/chamber/README.md")));
    assert.ok(!fs.existsSync(path.join(target, "docs/chamber/CHANGELOG.md")));

    // uninstall：按锁删除、目录清空、锁与 plugin.json 消失；--allow-delete 集合含 feature/domain/View。
    const removal = uninstallPlugin({ root: target, id: "chamber", git: false, postinstall: false });
    assert.deepEqual(removal.allowDelete, ["Chamber", "chamber"]);
    assert.ok(!fs.existsSync(path.join(target, "features/chamber")));
    assert.ok(!fs.existsSync(path.join(target, "apps/Cocos/assets/src/features/chamber")));
    assert.ok(!fs.existsSync(path.join(target, "apps/Cocos/assets/src/features/chamber.meta")));
    assert.ok(!fs.existsSync(path.join(target, "scripts/plugins/chamber.lock")));
    assert.ok(!fs.existsSync(path.join(target, "plugins/chamber")));
    assert.equal(checkInstalledPlugins(target).plugins.length, 0);
    assert.throws(() => uninstallPlugin({ root: target, id: "chamber", git: false, postinstall: false }), /未安装/u);
  } finally {
    cleanup(author, target);
  }
});

test("reinstall-from-tree（E6 方案 ②）：同仓改动不 bump 拒绝并点名；bump 后以树重写锁（吸收变化/新增/删除）；未安装、篡改锁、降级各自拒绝", () => {
  const { author, target } = makeFixture("1.0.0");
  try {
    const v1 = path.join(author, "out/v1.zip");
    packPlugin({ root: author, id: "chamber", outFile: v1 });
    installPlugin({ root: target, source: v1, git: false, postinstall: false });
    const baseline = readInstalledLock(target, "chamber");
    assert.ok(baseline);

    // 宿主仓内直接改插件自有文档：check 红、普通 install 拒绝——这就是 E6 的现场。
    fs.writeFileSync(path.join(target, "docs/chamber/README.md"), "# chamber edited in host repo\n");
    assert.equal(checkInstalledPlugins(target).ok, false);
    assert.throws(() => installPlugin({ root: target, source: v1, git: false, postinstall: false }), /本地改动会被覆盖丢失/u);
    // 不 bump 就想吸收 → 拒绝并点名改动面。
    assert.throws(
      () => reinstallFromTree({ root: target, id: "chamber", git: false, postinstall: false }),
      /版本未变[\s\S]*docs\/chamber\/README\.md/u,
    );

    // bump 到 1.0.1，同时新增一个服务端文件、删掉一个测试：dry-run 只报告不写。
    const manifestFile = path.join(target, "plugins/chamber/plugin.json");
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, "utf8").replace('"1.0.0"', '"1.0.1"'));
    write(target, "apps/server/src/core/chamber/extra.ts", "export const extra = 2;\n");
    fs.rmSync(path.join(target, "apps/server/test/chamber-peek.test.ts"));
    const dry = reinstallFromTree({ root: target, id: "chamber", git: false, postinstall: false, dryRun: true });
    assert.equal(dry.previousVersion, "1.0.0");
    assert.equal(dry.version, "1.0.1");
    assert.deepEqual(dry.written, [], "从树重装 ⛔ 不写任何插件文件");
    assert.deepEqual(dry.adopted?.changed, ["docs/chamber/README.md", "plugins/chamber/plugin.json"]);
    assert.deepEqual(dry.adopted?.added, ["apps/server/src/core/chamber/extra.ts"]);
    assert.deepEqual(dry.deleted, ["apps/server/test/chamber-peek.test.ts"]);
    assert.equal(readInstalledLock(target, "chamber")?.manifest.version, "1.0.0", "dry-run 不改锁");

    const report = reinstallFromTree({ root: target, id: "chamber", git: false, postinstall: false });
    assert.equal(report.version, "1.0.1");
    const rewritten = readInstalledLock(target, "chamber");
    assert.ok(rewritten);
    assert.equal(rewritten.manifest.version, "1.0.1");
    assert.equal(rewritten.entries.length, baseline.entries.length + 1 - 1);
    assert.ok(rewritten.entries.some((entry) => entry.path === "apps/server/src/core/chamber/extra.ts"));
    assert.ok(!rewritten.entries.some((entry) => entry.path === "apps/server/test/chamber-peek.test.ts"));
    assert.equal(rewritten.entries.find((entry) => entry.path === "docs/chamber/README.md")?.sha256, sha256("# chamber edited in host repo\n"));
    assert.equal(checkInstalledPlugins(target).ok, true, "重写后 check 必须绿");
    // 树 ≡ 新锁：再来一次是幂等 no-op（同版本同内容放行）。
    const again = reinstallFromTree({ root: target, id: "chamber", git: false, postinstall: false });
    assert.deepEqual(again.adopted, { added: [], changed: [] });
    assert.deepEqual(again.deleted, []);
    // 从树 pack 出的包 ⇔ 新锁逐条相同（同仓迭代后仍可分发）。
    const repacked = packPlugin({ root: target, id: "chamber", outFile: path.join(target, "out/repacked.zip") });
    assert.deepEqual(repacked.entries, rewritten.entries);

    // 降级：树上版本比锁小 → 拒绝，显式放行。
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, "utf8").replace('"1.0.1"', '"0.9.0"'));
    assert.throws(() => reinstallFromTree({ root: target, id: "chamber", git: false, postinstall: false }), /拒绝降级/u);
    assert.equal(reinstallFromTree({ root: target, id: "chamber", git: false, postinstall: false, allowDowngrade: true }).version, "0.9.0");

    // 篡改锁 → 拒绝（与 install/uninstall 同一道 allowlist）：登记了树上存在的越权文件即拒绝；
    // 树上已不存在的越权条目构不成误删风险（规则演进后改名的旧文件正是这种形态），不拦。
    const lockFile = path.join(target, "scripts/plugins/chamber.lock");
    fs.appendFileSync(lockFile, "scripts/evil.mjs 0000000000000000000000000000000000000000000000000000000000000000\n");
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, "utf8").replace('"0.9.0"', '"0.9.1"'));
    const dropped = reinstallFromTree({ root: target, id: "chamber", git: false, postinstall: false });
    assert.deepEqual(dropped.deleted, ["scripts/evil.mjs"], "不存在的越权条目随重写被丢弃（旧有新无）");
    assert.ok(!readInstalledLock(target, "chamber")?.entries.some((entry) => entry.path === "scripts/evil.mjs"));
    fs.appendFileSync(lockFile, "scripts/evil.mjs 0000000000000000000000000000000000000000000000000000000000000000\n");
    write(target, "scripts/evil.mjs", "process.exit(1)\n");
    assert.throws(() => reinstallFromTree({ root: target, id: "chamber", git: false, postinstall: false }), /锁/u);
    fs.rmSync(path.join(target, "scripts/evil.mjs"));

    // 未安装 → 拒绝（首装必须走 install <zip>）。
    const fresh = makeRoot();
    try {
      authorTree(fresh, "1.0.0");
      assert.throws(() => reinstallFromTree({ root: fresh, id: "chamber", git: false, postinstall: false }), /未安装/u);
    } finally {
      cleanup(fresh);
    }
  } finally {
    cleanup(author, target);
  }
});

test("install：越权路径整包拒绝并点名（脚本 / 受保护文件 / 他人目录）；目标已存在且不属本插件 → 所有权冲突", () => {
  const { author, target } = makeFixture();
  try {
    const dirOut = path.join(author, "out/pkg");
    packPlugin({ root: author, id: "chamber", outDir: dirOut });
    // 先读清单再动文件：readPackage 自证清单与包内条目双向相等，顺序反了它自己就先炸。
    const inject = (relative: string, content: string): void => {
      const entries = readPackage(dirOut).entries.filter((entry) => entry.path !== relative);
      write(dirOut, relative, content);
      fs.writeFileSync(path.join(dirOut, "files.lock"), renderFilesLock([...entries, { path: relative, sha256: sha256(content) }]), "utf8");
    };
    const remove = (relative: string): void => {
      const entries = readPackage(dirOut).entries.filter((entry) => entry.path !== relative);
      fs.rmSync(path.join(dirOut, relative));
      fs.writeFileSync(path.join(dirOut, "files.lock"), renderFilesLock(entries), "utf8");
    };
    // 清单外条目：包自证失败。
    write(dirOut, "scripts/evil.mjs", "process.exit(1)\n");
    assert.throws(() => readPackage(dirOut), /不在 files\.lock 清单里：scripts\/evil\.mjs/u);
    fs.rmSync(path.join(dirOut, "scripts/evil.mjs"));
    // 清单内但越权：硬排除。
    inject("scripts/evil.mjs", "process.exit(1)\n");
    assert.throws(() => validatePackage(readPackage(dirOut), target), /scripts\/evil\.mjs（硬排除目录 scripts）/u);
    remove("scripts/evil.mjs");
    // 受保护路径：第二道闸。
    inject("apps/client/src/Main.ts", "// hijack\n");
    assert.throws(() => validatePackage(readPackage(dirOut), target), /apps\/client\/src\/Main\.ts（受保护路径 apps\/client\/src\/Main\.ts）/u);
    remove("apps/client/src/Main.ts");
    // 他人目录。
    inject("apps/client/src/features/other/index.ts", "export {};\n");
    assert.throws(() => validatePackage(readPackage(dirOut), target), /features\/other\/index\.ts（不在插件所有权推导集内）/u);
    remove("apps/client/src/features/other/index.ts");
    // 包依赖注入：package.json 永远拒绝。
    inject("features/chamber/package.json", "{}\n");
    assert.throws(() => validatePackage(readPackage(dirOut), target), /package\.json（硬排除文件名形态/u);
    remove("features/chamber/package.json");
    assert.doesNotThrow(() => validatePackage(readPackage(dirOut), target));

    // 所有权冲突：目标树已有同路径文件且不属本插件。
    write(target, "apps/server/src/core/chamber/keys.ts", "// someone else's\n");
    assert.throws(() => installPlugin({ root: target, source: dirOut, git: false, postinstall: false }), /所有权冲突/u);
  } finally {
    cleanup(author, target);
  }
});

test("审阅后加固：篡改锁 → install/uninstall 拒绝且不删；锁登记文件缺失 → install 拒绝", () => {
  const { author, target } = makeFixture("1.0.0");
  try {
    const v1 = path.join(author, "out/v1.zip");
    packPlugin({ root: author, id: "chamber", outFile: v1 });
    installPlugin({ root: target, source: v1, git: false, postinstall: false });
    // 把一个框架文件塞进锁（sha 与工作树一致，verifyLockAgainstTree 不会报 modified）。
    write(target, "apps/client/src/Main.ts", "// framework file\n");
    const lockFile = path.join(target, "scripts/plugins/chamber.lock");
    fs.appendFileSync(lockFile, `apps/client/src/Main.ts ${sha256("// framework file\n")}\n`);
    assert.equal(checkInstalledPlugins(target).ok, false, "check 必须点名锁内越权路径");
    const manifestFile = path.join(author, "plugins/chamber/plugin.json");
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, "utf8").replace('"1.0.0"', '"1.1.0"'));
    const v2 = path.join(author, "out/v2.zip");
    packPlugin({ root: author, id: "chamber", outFile: v2 });
    assert.throws(() => installPlugin({ root: target, source: v2, git: false, postinstall: false }), /升级拒绝：已安装锁.*不在插件所有权推导集内/su);
    assert.ok(fs.existsSync(path.join(target, "apps/client/src/Main.ts")), "升级被拒时 ⛔ 不得删除锁内越权路径");
    assert.throws(() => uninstallPlugin({ root: target, id: "chamber", git: false, postinstall: false }), /卸载拒绝：已安装锁.*不在插件所有权推导集内/su);
    assert.ok(fs.existsSync(path.join(target, "apps/client/src/Main.ts")), "卸载被拒时 ⛔ 不得删除锁内越权路径");
    // 修回锁后：锁登记的文件在树中缺失 → 升级拒绝（先修锁或 uninstall --force）。
    const lockText = fs.readFileSync(lockFile, "utf8").split("\n").filter((line) => !line.includes("apps/client/src/Main.ts")).join("\n");
    fs.writeFileSync(lockFile, lockText, "utf8");
    fs.rmSync(path.join(target, "docs/chamber/README.md"));
    assert.throws(() => installPlugin({ root: target, source: v2, git: false, postinstall: false }), /拒绝升级：已安装锁登记的文件在工作树缺失/u);
  } finally {
    cleanup(author, target);
  }
});

test("审阅后加固：只带镜像无真源、受保护目录的镜像、根 plugin.json 与仓内自述不一致 → 整包拒绝", () => {
  const { author, target } = makeFixture();
  try {
    const dirOut = path.join(author, "out/pkg");
    packPlugin({ root: author, id: "chamber", outDir: dirOut });
    const relock = (mutate: () => void): void => {
      const before = readPackage(dirOut).entries;
      mutate();
      const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [path.relative(dirOut, full).split(path.sep).join("/")];
      });
      const present = walk(dirOut).filter((relative) => relative !== "plugin.json" && relative !== "files.lock");
      const known = new Map(before.map((entry) => [entry.path, entry.sha256]));
      fs.writeFileSync(path.join(dirOut, "files.lock"), renderFilesLock(present.map((relative) => ({
        path: relative,
        sha256: known.get(relative) ?? sha256(fs.readFileSync(path.join(dirOut, relative))),
      }))), "utf8");
    };
    // 只带镜像、无真源。
    relock(() => {
      write(dirOut, "apps/Cocos/assets/src/features/chamber/evil.ts", "export const evil = 1;\n");
      write(dirOut, "apps/Cocos/assets/src/features/chamber/evil.ts.meta", meta("typescript"));
    });
    assert.throws(() => validatePackage(readPackage(dirOut), target), /镜像 .*evil\.ts 没有同批的客户端真源/u);
    relock(() => {
      fs.rmSync(path.join(dirOut, "apps/Cocos/assets/src/features/chamber/evil.ts"));
      fs.rmSync(path.join(dirOut, "apps/Cocos/assets/src/features/chamber/evil.ts.meta"));
    });
    assert.doesNotThrow(() => validatePackage(readPackage(dirOut), target));
    // 根 plugin.json 改 version 而仓内自述不变 → 拒绝。
    const rootManifest = path.join(dirOut, "plugin.json");
    const original = fs.readFileSync(rootManifest, "utf8");
    fs.writeFileSync(rootManifest, original.replace('"1.0.0"', '"9.9.9"'), "utf8");
    assert.throws(() => validatePackage(readPackage(dirOut), target), /plugins\/chamber\/plugin\.json 与包根 plugin\.json 字节不同/u);
    fs.writeFileSync(rootManifest, original, "utf8");
    // 受保护目录的镜像：logic/gameplay/<id> 的真源被 gameplayFlow 保护，镜像必须继承。
    const rules = deriveOwnership({ ...FEATURE_IDENTITY, clientDirs: ["apps/client/src/logic/gameplay/chamber"] });
    assert.ok(!classifyPath("apps/client/src/logic/gameplay/chamber/x.ts", rules, PROTECTED).allowed);
    assert.ok(!classifyPath("apps/Cocos/assets/src/logic/gameplay/chamber/x.ts", rules, PROTECTED).allowed, "镜像必须继承真源的受保护路径");
    assert.ok(!classifyPath("apps/Cocos/assets/src/logic/gameplay/chamber/x.ts.meta", rules, PROTECTED).allowed);
  } finally {
    cleanup(author, target);
  }
});

test("审阅后加固：插件 id/domain 与框架既有目录同名 → 目录级所有权冲突拒绝（⛔ 不混入框架目录）", () => {
  const { author, target } = makeFixture();
  try {
    // 目标树里 core/chamber 已被"框架"占用（不在任何锁里）。
    write(target, "apps/server/src/core/chamber/session.ts", "// framework owned\n");
    const zipFile = path.join(author, "out/chamber.zip");
    packPlugin({ root: author, id: "chamber", outFile: zipFile });
    assert.throws(
      () => installPlugin({ root: target, source: zipFile, git: false, postinstall: false }),
      /所有权冲突.*apps\/server\/src\/core\/chamber\/session\.ts/su,
      "推导集内已有不属本插件的文件（即使包里没有同名文件）也必须拒绝",
    );
    fs.rmSync(path.join(target, "apps/server/src/core/chamber"), { recursive: true });
    // 镜像侧同样检查：目标树已有插件专属镜像目录的陌生文件。
    write(target, "apps/Cocos/assets/src/features/chamber/stale.ts", "// someone else\n");
    assert.throws(
      () => installPlugin({ root: target, source: zipFile, git: false, postinstall: false }),
      /所有权冲突.*apps\/Cocos\/assets\/src\/features\/chamber\/stale\.ts/su,
    );
    fs.rmSync(path.join(target, "apps/Cocos/assets/src/features/chamber"), { recursive: true });
    assert.doesNotThrow(() => installPlugin({ root: target, source: zipFile, git: false, postinstall: false }));
    // 升级时本插件自己的文件（在旧锁里）不算冲突。
    assert.doesNotThrow(() => installPlugin({ root: target, source: zipFile, git: false, postinstall: false }));
  } finally {
    cleanup(author, target);
  }
});

test("PLUGIN-REGISTRY §1-3：reinstall-from-tree 的身份变化闸与 git 跟踪闸——扩 domains 到框架域不能把框架文件吸进插件锁", () => {
  const { author, target } = makeFixture("1.0.0");
  try {
    // 目标树里 guild 是框架自己的域（已提交），chamber 是插件。
    write(target, "apps/shared/src/protocol/lobbyRpc/domains/guild.ts", "export default {} as never;\n");
    write(target, "apps/server/src/websocket/guild/join.ts", "export default {} as never;\n");
    write(target, "apps/server/test/lobbyRpcVectors/guild.ts", "export default {};\n");
    gitInit(target);
    const v1 = path.join(author, "out/v1.zip");
    packPlugin({ root: author, id: "chamber", outFile: v1 });
    installPlugin({ root: target, source: v1, git: true, postinstall: false });
    assert.equal(checkInstalledPlugins(target).ok, true);

    // 作者在树上把 guild 写进 domains 并 bump：身份变化 → 拒绝；显式放行后 → guild 文件已被 git 跟踪却不在锁里 → 拒绝并点名。
    const manifestFile = path.join(target, "plugins/chamber/plugin.json");
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, "utf8").replace('"1.0.0"', '"1.0.1"').replace('"chamber"\n  ]', '"chamber",\n    "guild"\n  ]'));
    assert.match(JSON.parse(fs.readFileSync(manifestFile, "utf8")).domains.join(","), /guild/u, "fixture 自检：domains 已含 guild");
    assert.throws(() => reinstallFromTree({ root: target, id: "chamber", git: true, postinstall: false }), /身份与已安装锁不同[\s\S]*domains: chamber → chamber,guild/u);
    assert.throws(
      () => reinstallFromTree({ root: target, id: "chamber", git: true, postinstall: false, allowIdentityChange: true }),
      /已被 git 跟踪却不在已安装锁里[\s\S]*websocket\/guild\/join\.ts[\s\S]*lobbyRpcVectors\/guild\.ts[\s\S]*domains\/guild\.ts/u,
    );
    assert.equal(readInstalledLock(target, "chamber")?.manifest.version, "1.0.0", "被拒时锁不动");
    // check 也点名树上 plugin.json 与锁的身份漂移。
    const drift = checkInstalledPlugins(target);
    assert.equal(drift.ok, false);
    assert.match(drift.plugins[0].problems.join("\n"), /身份与锁不一致.*domains: chamber → chamber,guild/u);
    // 两个 flag 都给才吸收（显式决定，可 review）。
    const adopted = reinstallFromTree({ root: target, id: "chamber", git: true, postinstall: false, allowIdentityChange: true, adoptTracked: true });
    assert.ok(adopted.adopted?.added.includes("apps/server/src/websocket/guild/join.ts"));

    // 对照：作者新写的未跟踪文件不需要任何 flag 就能吸收（这才是 reinstall-from-tree 的日常）。
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, "utf8").replace('"1.0.1"', '"1.0.2"'));
    write(target, "apps/server/src/core/chamber/extra.ts", "export const extra = 2;\n");
    const plain = reinstallFromTree({ root: target, id: "chamber", git: true, postinstall: false });
    assert.deepEqual(plain.adopted?.added, ["apps/server/src/core/chamber/extra.ts"]);
  } finally {
    cleanup(author, target);
  }
});

test("PLUGIN-REGISTRY §1-4：互为前缀的两个插件共存——各自升级、从树重装、卸载其一都不动另一者；锁间重叠被 pack/install/check 点名", () => {
  const authorA = makeRoot();
  const authorB = makeRoot();
  const target = makeRoot();
  try {
    authorTree(authorA, "1.0.0", "chamber");
    authorTree(authorB, "1.0.0", "chamberBoard");
    const zipA = path.join(authorA, "out/a.zip");
    const zipB = path.join(authorB, "out/b.zip");
    packPlugin({ root: authorA, id: "chamber", outFile: zipA });
    packPlugin({ root: authorB, id: "chamberBoard", outFile: zipB });
    installPlugin({ root: target, source: zipA, git: false, postinstall: false });
    installPlugin({ root: target, source: zipB, git: false, postinstall: false });
    assert.equal(checkInstalledPlugins(target).ok, true);
    assert.ok(fs.existsSync(path.join(target, "apps/server/test/chamberBoard-peek.test.ts")));

    // chamber 升级：chamberBoard 的测试文件不算 chamber 推导集内的冲突。
    const manifestA = path.join(authorA, "plugins/chamber/plugin.json");
    fs.writeFileSync(manifestA, fs.readFileSync(manifestA, "utf8").replace('"1.0.0"', '"1.1.0"'));
    const zipA2 = path.join(authorA, "out/a2.zip");
    packPlugin({ root: authorA, id: "chamber", outFile: zipA2 });
    assert.doesNotThrow(() => installPlugin({ root: target, source: zipA2, git: false, postinstall: false }));
    // chamber 从树重装：⛔ 不采集 chamberBoard 的文件。
    const manifestT = path.join(target, "plugins/chamber/plugin.json");
    fs.writeFileSync(manifestT, fs.readFileSync(manifestT, "utf8").replace('"1.1.0"', '"1.1.1"'));
    const rewritten = reinstallFromTree({ root: target, id: "chamber", git: false, postinstall: false });
    assert.ok(!rewritten.adopted?.added.some((relative) => relative.includes("chamberBoard")), "从树重装不得吸收别的插件的文件");
    assert.ok(!readInstalledLock(target, "chamber")?.entries.some((entry) => entry.path.includes("chamberBoard")));
    // 卸载 chamber：chamberBoard 文件与锁完好。
    uninstallPlugin({ root: target, id: "chamber", git: false, postinstall: false });
    assert.ok(fs.existsSync(path.join(target, "apps/server/test/chamberBoard-peek.test.ts")));
    assert.ok(fs.existsSync(path.join(target, "apps/server/src/core/chamberBoard/keys.ts")));
    assert.equal(checkInstalledPlugins(target).ok, true);

    // 锁间重叠：把 chamber 的一个路径塞进 chamberBoard 的锁（模拟规则演进/合并错），install chamber 拒绝并点名所有者；
    // check 报锁间重叠；作者侧 pack 遇到推导集与他锁重叠也拒绝。
    installPlugin({ root: target, source: zipA2, git: false, postinstall: false });
    const lockB = path.join(target, "scripts/plugins/chamberBoard.lock");
    fs.appendFileSync(lockB, `apps/server/src/core/chamber/keys.ts ${sha256("export const kChamberSeq = 1;\n")}\n`);
    const overlapping = checkInstalledPlugins(target);
    assert.equal(overlapping.ok, false);
    assert.match(overlapping.plugins.flatMap((plugin) => plugin.problems).join("\n"), /锁间重叠：apps\/server\/src\/core\/chamber\/keys\.ts 同时登记在 chamber 与 chamberBoard/u);
    assert.throws(() => installPlugin({ root: target, source: zipA2, git: false, postinstall: false }), /已被其它已安装插件的锁登记[\s\S]*属于插件 chamberBoard/u);
    assert.throws(() => packPlugin({ root: target, id: "chamber", outFile: path.join(target, "out/x.zip") }), /与其它已安装插件的锁重叠[\s\S]*属于插件 chamberBoard/u);
  } finally {
    cleanup(authorA, authorB, target);
  }
});

/** 只拦 npm（codegen / sync），git 照常执行：postinstall 失败与参数断言都靠它。 */
function fakeRunner(onNpm: (args: readonly string[], root: string) => void): CommandRunner {
  return (root, command, args, env) => {
    if (command === "npm") {
      onNpm(args, root);
      return;
    }
    runCommand(root, command, args, env);
  };
}

test("PLUGIN-REGISTRY §1-1：postinstall 失败即回滚——无 git：文件与锁按落盘前字节复原；有 git：索引同步、生成物只回退本次新变脏的部分", () => {
  const { author, target } = makeFixture("1.0.0");
  const gitTarget = makeRoot();
  try {
    const v1 = path.join(author, "out/v1.zip");
    packPlugin({ root: author, id: "chamber", outFile: v1 });
    // 无 git：codegen 抛错 → 树上不留任何插件文件、锁、plugins/<id>。
    const boom = fakeRunner((args) => {
      if (args.includes("codegen:features")) throw new Error("route id 重复：chamber（模拟跨插件冲突）");
    });
    assert.throws(() => installPlugin({ root: target, source: v1, git: false, runner: boom }), /postinstall 失败，已回滚到安装前[\s\S]*route id 重复/u);
    for (const relative of ["features/chamber/feature.json", "apps/server/src/core/chamber/keys.ts", "scripts/plugins/chamber.lock", "plugins/chamber/plugin.json", "apps/Cocos/assets/src/features/chamber.meta"]) {
      assert.ok(!fs.existsSync(path.join(target, relative)), `回滚后不得残留：${relative}`);
    }
    assert.ok(!fs.existsSync(path.join(target, "apps/Cocos/assets/src/features/chamber")), "空目录也清掉");
    // 回滚后同一包可以直接重装（不再「受影响路径不干净」）。
    assert.doesNotThrow(() => installPlugin({ root: target, source: v1, git: false, postinstall: false }));

    // 有 git：基线里有一个已跟踪的生成物与一个用户 WIP 改过的生成物；失败的 codegen 改了前者、新建了一个未跟踪生成物。
    write(gitTarget, "apps/client/src/generated/features.generated.ts", "// generated baseline\n");
    write(gitTarget, "apps/client/src/generated/wip.generated.ts", "// wip baseline\n");
    gitInit(gitTarget);
    fs.writeFileSync(path.join(gitTarget, "apps/client/src/generated/wip.generated.ts"), "// user WIP, must survive\n");
    const wipStatus = gitPorcelain(gitTarget);
    assert.match(wipStatus, /wip\.generated\.ts/u);
    const boomGit = fakeRunner((args, root) => {
      if (!args.includes("codegen:features")) return;
      write(root, "apps/client/src/generated/features.generated.ts", "// half-written by failing codegen\n");
      write(root, "apps/shared/src/protocol/lobbyRpc/registry.generated.ts", "// new generated file\n");
      throw new Error("模拟 codegen 写到一半失败");
    });
    assert.throws(() => installPlugin({ root: gitTarget, source: v1, git: true, runner: boomGit }), /已回滚到安装前[\s\S]*生成物回退 2 项/u);
    assert.equal(gitPorcelain(gitTarget), wipStatus, "回滚后 git 状态与安装前逐字相同（用户 WIP 原样留下，其余干净）");
    assert.equal(fs.readFileSync(path.join(gitTarget, "apps/client/src/generated/features.generated.ts"), "utf8"), "// generated baseline\n");
    assert.ok(!fs.existsSync(path.join(gitTarget, "apps/shared/src/protocol/lobbyRpc/registry.generated.ts")));
    assert.ok(!fs.existsSync(path.join(gitTarget, "scripts/plugins/chamber.lock")));
  } finally {
    cleanup(author, target, gitTarget);
  }
});

test("PLUGIN-REGISTRY §1-2：升级删掉域 / View / kind 时 postinstall 以显式 --allow-delete 交给 codegen（并集 kinds 都跑）", () => {
  const { author, target } = makeFixture("1.0.0");
  try {
    const v1 = path.join(author, "out/v1.zip");
    packPlugin({ root: author, id: "chamber", outFile: v1 });
    installPlugin({ root: target, source: v1, git: false, postinstall: false });

    // v2：去掉 chamber 域（descriptor / 端点 / 向量都不在包里）、View 改名 ChamberView → ChamberPanelView。
    const manifestFile = path.join(author, "plugins/chamber/plugin.json");
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, "utf8").replace('"1.0.0"', '"1.1.0"').replace('"domains": [\n    "chamber"\n  ]', '"domains": []'));
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile, "utf8")).domains, [], "fixture 自检：domains 已清空");
    for (const relative of ["apps/shared/src/protocol/lobbyRpc/domains/chamber.ts", "apps/server/src/websocket/chamber/peek.ts", "apps/server/test/lobbyRpcVectors/chamber.ts"]) {
      fs.rmSync(path.join(author, relative));
    }
    const featureFile = path.join(author, "features/chamber/feature.json");
    fs.writeFileSync(featureFile, fs.readFileSync(featureFile, "utf8").replaceAll("ChamberView", "ChamberPanelView").replace('"view": "Chamber"', '"view": "ChamberPanel"'));
    for (const base of ["apps/client/src/features/chamber/view", "apps/Cocos/assets/src/features/chamber/view"]) {
      for (const suffix of [".ts", ".view.json"]) {
        fs.renameSync(path.join(author, `${base}/ChamberView${suffix}`), path.join(author, `${base}/ChamberPanelView${suffix}`));
      }
      if (base.startsWith("apps/Cocos")) {
        for (const suffix of [".ts", ".view.json"]) fs.renameSync(path.join(author, `${base}/ChamberView${suffix}.meta`), path.join(author, `${base}/ChamberPanelView${suffix}.meta`));
      }
    }
    const v2 = path.join(author, "out/v2.zip");
    packPlugin({ root: author, id: "chamber", outFile: v2 });

    const calls: string[][] = [];
    const recorder = fakeRunner((args) => { calls.push([...args]); });
    const dry = installPlugin({ root: target, source: v2, git: false, dryRun: true, runner: recorder });
    assert.deepEqual(dry.allowDelete, { gameplays: [], features: ["Chamber", "chamber"] }, "dry-run 就报告删除面");
    const report = installPlugin({ root: target, source: v2, git: false, runner: recorder });
    assert.deepEqual(report.allowDelete, { gameplays: [], features: ["Chamber", "chamber"] });
    const features = calls.find((args) => args.includes("codegen:features"));
    assert.ok(features, "跑了 codegen:features");
    assert.deepEqual(features.slice(features.indexOf("--") + 1), ["--allow-delete", "Chamber", "--allow-delete", "chamber"]);
    assert.ok(!calls.some((args) => args.includes("codegen:gameplays")), "纯 feature 插件不跑 gameplay codegen");
    assert.ok(calls.some((args) => args.includes("sync:shared")));
    assert.ok(readInstalledLock(target, "chamber")?.entries.some((entry) => entry.path.endsWith("ChamberPanelView.ts")));

    // 首装无删除面；再装同版本（幂等）也无删除面。
    const again = installPlugin({ root: target, source: v2, git: false, postinstall: false });
    assert.deepEqual(again.allowDelete, { gameplays: [], features: [] });
  } finally {
    cleanup(author, target);
  }
});

test("allowDeleteFor：去掉 gameplay kind ⇒ codegen:gameplays --allow-delete <id>；去掉 feature kind ⇒ feature id + 全部域 + 全部 View", () => {
  const both = parsePluginManifest({ schemaVersion: 1, id: "puzzle", version: "1.0.0", kinds: ["gameplay", "feature"], constantName: "Puzzle", domains: ["puzzle"], requires: { featureSchemaVersion: 1, gameplaySchemaVersion: 1 } });
  const featureOnly = parsePluginManifest({ schemaVersion: 1, id: "puzzle", version: "1.1.0", kinds: ["feature"], domains: ["puzzle"], requires: { featureSchemaVersion: 1 } });
  const gameplayOnly = parsePluginManifest({ schemaVersion: 1, id: "puzzle", version: "1.2.0", kinds: ["gameplay"], constantName: "Puzzle", requires: { gameplaySchemaVersion: 1 } });
  assert.deepEqual(allowDeleteFor({ manifest: both, viewNames: ["PuzzleWorld"] }, { manifest: featureOnly, viewNames: ["PuzzleWorld"] }), { gameplays: ["puzzle"], features: [] });
  assert.deepEqual(allowDeleteFor({ manifest: both, viewNames: ["PuzzleWorld"] }, { manifest: gameplayOnly, viewNames: [] }), { gameplays: [], features: ["PuzzleWorld", "puzzle"] });
  assert.deepEqual(allowDeleteFor({ manifest: both, viewNames: ["A", "B"] }, { manifest: both, viewNames: ["B"] }), { gameplays: [], features: ["A"] });
});

test("PLUGIN-REGISTRY §1-1 附带：uninstall 后未提交（索引里是暂存删除）即可重装，不再被「受影响路径不干净」拦住", () => {
  const { author, target } = makeFixture("1.0.0");
  try {
    gitInit(target);
    const v1 = path.join(author, "out/v1.zip");
    packPlugin({ root: author, id: "chamber", outFile: v1 });
    installPlugin({ root: target, source: v1, git: true, postinstall: false });
    spawnSync("git", ["-c", "user.name=f", "-c", "user.email=f@example.invalid", "commit", "-q", "-m", "install chamber"], { cwd: target });
    uninstallPlugin({ root: target, id: "chamber", git: true, postinstall: false });
    assert.match(gitPorcelain(target), /^D  /mu, "卸载后是暂存删除");
    assert.doesNotThrow(() => installPlugin({ root: target, source: v1, git: true, postinstall: false }));
    assert.equal(gitPorcelain(target), "", "重装同一包后索引与 HEAD 一致");
  } finally {
    cleanup(author, target);
  }
});

test("manifest：schema 校验、kinds 语义、requires 兼容轴、版本比较", () => {
  const valid = parsePluginManifest({ schemaVersion: 1, id: "chamber", version: "1.2.3", kinds: ["feature"] });
  assert.equal(valid.constantName, null);
  assert.deepEqual(valid.domains, []);
  assert.throws(() => parsePluginManifest({ schemaVersion: 1, id: "chamber", version: "1.2", kinds: ["feature"] }), /version/u);
  assert.throws(() => parsePluginManifest({ schemaVersion: 1, id: "chamber", version: "1.2.3", kinds: ["feature"], slot: 0 }), /unknown key/u);
  assert.throws(() => parsePluginManifest({ schemaVersion: 1, id: "chamber", version: "1.2.3", kinds: [] }), /kinds 不能为空/u);
  assert.throws(() => parsePluginManifest({ schemaVersion: 2, id: "chamber", version: "1.2.3", kinds: ["feature"] }), /schemaVersion/u);
  assert.equal(compareVersions("1.10.0", "1.9.9") > 0, true);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("0.9.0", "1.0.0") < 0, true);
});

test("CLI 参数：四个子命令、--root seam、重复/未知参数 throw", () => {
  assert.equal(parseCli(["check"]).command, "check");
  const pack = parseCli(["pack", "chamber", "--out", "/tmp/x.zip", "--root", "/tmp/r"]);
  assert.deepEqual(pack, { command: "pack", root: "/tmp/r", id: "chamber", outFile: "/tmp/x.zip" });
  const install = parseCli(["install", "pkg.zip", "--no-git", "--dry-run"]);
  assert.equal(install.command, "install");
  if (install.command === "install") {
    assert.equal(install.git, false);
    assert.equal(install.postinstall, true);
    assert.equal(install.dryRun, true);
  }
  assert.throws(() => parseCli(["install"]), /需要且只需要一个/u);
  assert.throws(() => parseCli(["install", "a", "--bogus"]), /unknown argument/u);
  assert.throws(() => parseCli(["check", "--root"]), /需要一个值/u);
  assert.throws(() => parseCli(["pack", "x", "--out", "a", "--out", "b"]), /duplicate argument/u);
  assert.throws(() => parseCli(["nope"]), /用法/u);
  const fromTree = parseCli(["install", "--reinstall-from-tree", "chamber", "--no-git"]);
  assert.equal(fromTree.command, "reinstall-from-tree");
  assert.ok(fromTree.command === "reinstall-from-tree" && fromTree.id === "chamber" && fromTree.git === false && fromTree.postinstall === true);
  assert.throws(() => parseCli(["install", "--reinstall-from-tree", "./chamber.zip"]), /插件 id，不是包路径/u);
  const gated = parseCli(["install", "--reinstall-from-tree", "chamber", "--allow-identity-change", "--adopt-tracked"]);
  assert.ok(gated.command === "reinstall-from-tree" && gated.allowIdentityChange && gated.adoptTracked);
  assert.throws(() => parseCli(["install", "pkg.zip", "--adopt-tracked"]), /只对 install --reinstall-from-tree 有效/u);
  assert.throws(() => parseCli(["install", "--reinstall-from-tree"]), /只需要一个已安装插件/u);
});

test("nextStepsFor：协议指纹提示按 --check 的实际结果派生，⛔ 不按「带 domain 就一定变了」猜", () => {
  const fake = (manifest: { domains: string[]; kinds: string[] }) =>
    ({ manifest: { ...manifest, fguiPackages: [] }, files: new Map<string, Buffer>(), entries: [] }) as unknown as Parameters<typeof nextStepsFor>[0];
  const root = os.tmpdir();
  const withDomain = fake({ domains: ["chamber"], kinds: ["feature"] });
  const stale = nextStepsFor(withDomain, root, { protocolStale: true });
  assert.ok(stale.some((step) => step.startsWith("协议指纹已过期") && step.includes("protocol-fingerprint.mjs --write")), "过期 ⇒ 明确要求重钉");
  const fresh = nextStepsFor(withDomain, root, { protocolStale: false });
  assert.deepEqual(fresh.filter((step) => step.includes("protocol-fingerprint")), [], "--check 通过 ⇒ 不再要求重钉");
  const unknown = nextStepsFor(withDomain, root, { protocolStale: null });
  assert.ok(unknown.some((step) => step.startsWith("本次未跑 codegen") && step.includes("protocol-fingerprint.mjs --write")), "未跑 codegen ⇒ 条件式提示");
  assert.deepEqual(nextStepsFor(withDomain, root).filter((step) => step.includes("protocol-fingerprint")), unknown.filter((step) => step.includes("protocol-fingerprint")), "缺省上下文 = 未知");
  // gameplay 形态没有 domain 也会改 protocol/（modeIds 等）：未知时同样给条件提示；纯 feature 无 domain 则一句不提。
  assert.ok(nextStepsFor(fake({ domains: [], kinds: ["gameplay"] }), root).some((step) => step.startsWith("本次未跑 codegen")));
  assert.deepEqual(nextStepsFor(fake({ domains: [], kinds: ["feature"] }), root).filter((step) => step.includes("protocol-fingerprint")), []);
  // 过期判定不看 manifest：无 domain 的纯 feature 若 --check 报红也要提示。
  assert.ok(nextStepsFor(fake({ domains: [], kinds: ["feature"] }), root, { protocolStale: true }).some((step) => step.startsWith("协议指纹已过期")));
});
