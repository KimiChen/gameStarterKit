/**
 * 插件工具（tools/plugin/*，docs/PLUGIN.md §1/§5 的实现）契约：
 *  - 所有权推导是 allowlist：受保护路径 / 生成物 / 脚本 / 包清单永远拒绝，镜像与 .meta 随真源归属；
 *  - zip 读写确定性且 fail-closed（zip-slip、符号链接、zip64、坏 CRC 一律拒绝）；
 *  - pack → install → check → upgrade（旧有新无按清单删、本地改动拒绝、同版本不同内容拒绝、降级显式）
 *    → uninstall 的端到端在隔离 fixture 根上跑通（postinstall/git 关闭，只验文件层）；
 *  - 包内出现越权路径（脚本 / 受保护文件）整包拒绝并点名。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkInstalledPlugins } from "../tools/plugin/check";
import { parseCli } from "../tools/plugin/cli";
import { installPlugin } from "../tools/plugin/install";
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
    "apps/server/test/int/chamberFlow.test.ts",
    "apps/client/test/chamberLogic.test.ts",
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

/** 作者侧工作树：一个带 RPC 域 + 客户端 View/Logic + 镜像 .meta + 测试 + 文档的 feature 插件。 */
function authorTree(root: string, version: string): void {
  write(root, "plugins/chamber/plugin.json", `${JSON.stringify({
    schemaVersion: 1, id: "chamber", version, kinds: ["feature"], domains: ["chamber"],
    requires: { featureSchemaVersion: 1 }, description: "fixture feature plugin",
  }, null, 2)}\n`);
  write(root, "features/chamber/feature.json", `${JSON.stringify({
    schemaVersion: 1, id: "chamber", category: "extra", resident: false,
    viewDirs: ["apps/client/src/features/chamber/view"],
    views: ["apps/client/src/features/chamber/view/ChamberView.view.json"],
    owners: [{ id: "chamber", logicDir: "apps/client/src/features/chamber/logic" }],
    routes: [{ id: "chamber", view: "Chamber" }], menu: [],
  }, null, 2)}\n`);
  write(root, "apps/shared/src/protocol/lobbyRpc/domains/chamber.ts", "export default {} as never;\n");
  write(root, "apps/server/src/websocket/chamber/peek.ts", "export default {} as never;\n");
  write(root, "apps/server/src/core/chamber/keys.ts", "export const kChamberSeq = 1;\n");
  write(root, "apps/server/test/lobbyRpcVectors/chamber.ts", "export default {};\n");
  write(root, "apps/server/test/chamber-peek.test.ts", "// fixture test\n");
  write(root, "docs/chamber/README.md", `# chamber ${version}\n`);
  const clientFiles: Record<string, string> = {
    "apps/client/src/features/chamber/index.ts": "export const chamber = 1;\n",
    "apps/client/src/features/chamber/view/ChamberView.ts": "export class ChamberView {}\n",
    "apps/client/src/features/chamber/view/ChamberView.view.json": "{ \"kind\": \"cocos\" }\n",
    "apps/client/src/features/chamber/logic/ChamberLogic.ts": "export class ChamberLogic {}\n",
  };
  for (const [relative, content] of Object.entries(clientFiles)) {
    write(root, relative, content);
    const mirror = relative.replace("apps/client/src/", "apps/Cocos/assets/src/");
    write(root, mirror, content);
    write(root, `${mirror}.meta`, meta(relative.endsWith(".json") ? "json" : "typescript"));
  }
  for (const dir of ["apps/Cocos/assets/src/features/chamber", "apps/Cocos/assets/src/features/chamber/view", "apps/Cocos/assets/src/features/chamber/logic"]) {
    write(root, `${dir}.meta`, meta("directory"));
  }
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
    assert.ok(report.nextSteps.some((step) => step.includes("protocol-fingerprint")), "带 domain 的插件提示重钉指纹");
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
});
