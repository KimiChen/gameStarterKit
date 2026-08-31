// FGUI manifest 的校验分支测试；失败 fixture 不写入或修改仓库内的资源。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  fguiManifestTestHooks,
  assertManifestShape,
  checkManifest,
  compareRecords,
  componentDeclarations,
  currentManifest,
  outputOwnershipProblems,
  parseCliArgs,
  packageDescription,
  resourceDeclarations,
  resolveManifestPath,
  sourcePathProblems,
  validateUiUrl,
} from "./fgui-manifest.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SCRIPT = path.join(ROOT, "scripts/fgui-manifest.mjs");

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function baseManifest(overrides = {}) {
  return {
    version: 1,
    sourceRoot: "apps/art/fairygui/assets",
    exportRoot: "apps/Cocos/assets/resources/ui",
    packages: [],
    exports: [],
    views: [],
    ...overrides,
  };
}

function packageRecord(name, id, outputs = []) {
  return {
    name,
    id,
    source: [],
    components: [],
    resources: [],
    outputs,
  };
}

function resourceMaps() {
  const alpha = {
    name: "Alpha",
    id: "aaaa1111",
    resources: [
      { kind: "component", id: "comp0001", name: "Panel.xml", exported: true },
      { kind: "image", id: "img00001", name: "icons/icon.png", exported: true },
    ],
  };
  const beta = {
    name: "Beta",
    id: "bbbb2222",
    resources: [{ kind: "component", id: "comp0002", name: "Panel.xml", exported: true }],
  };
  return {
    byName: new Map([[alpha.name, alpha], [beta.name, beta]]),
    byId: new Map([[alpha.id, alpha], [beta.id, beta]]),
  };
}

test("manifest records:哈希不符、缺失、多余和非法记录分别被报告", () => {
  const problems = [];
  compareRecords(
    "source",
    [
      { path: "same.xml", sha256: HASH_A },
      { path: "missing.xml", sha256: HASH_A },
      { path: "bad-shape.xml", sha256: "not-a-sha256" },
    ],
    [
      { path: "same.xml", sha256: HASH_B },
      { path: "extra.xml", sha256: HASH_A },
    ],
    problems,
  );

  assert.deepEqual(problems, [
    "source: manifest[2] 记录结构非法",
    "source: 哈希不符 same.xml",
    "source: 缺失 missing.xml",
    "source: 多余 extra.xml",
  ]);
});

test("manifest records:非数组和重复路径也拒绝", () => {
  const problems = [];
  compareRecords("export", {}, [{ path: "x.bin", sha256: HASH_A }], problems);
  compareRecords(
    "export",
    [{ path: "x.bin", sha256: HASH_A }, { path: "x.bin", sha256: HASH_B }],
    [{ path: "x.bin", sha256: HASH_A }, { path: "x.bin", sha256: HASH_A }],
    problems,
  );

  assert.deepEqual(problems, [
    "export: 记录不是数组",
    "export: manifest 重复记录 x.bin",
    "export: 当前 重复记录 x.bin",
  ]);
});

test("manifest source 路径边界:包外、目录穿越和包根本身均报错", () => {
  const problems = sourcePathProblems("Alpha", "apps/art/fairygui/assets", [
    { path: "apps/art/fairygui/assets/Alpha/package.xml", sha256: HASH_A },
    { path: "apps/art/fairygui/assets/Alpha/../Beta/other.xml", sha256: HASH_A },
    { path: "apps/art/fairygui/assets/Alpha2/other.xml", sha256: HASH_A },
    { path: "apps/art/fairygui/assets/Alpha", sha256: HASH_A },
  ]);

  assert.deepEqual(problems, [
    "Alpha source: 路径越界 apps/art/fairygui/assets/Alpha/../Beta/other.xml",
    "Alpha source: 路径越界 apps/art/fairygui/assets/Alpha2/other.xml",
    "Alpha source: 路径越界 apps/art/fairygui/assets/Alpha",
  ]);
});

test("manifest export ownership:一个导出物不能由两个包声明", () => {
  const sharedOutput = { path: "shared_atlas.png", sha256: HASH_A };
  const problems = outputOwnershipProblems([
    packageRecord("Alpha", "aaaa1111", [sharedOutput, { ...sharedOutput }]),
    packageRecord("Beta", "bbbb2222", [sharedOutput]),
    packageRecord("Gamma", "cccc3333", [{ path: "gamma.bin", sha256: HASH_A }]),
  ]);

  assert.deepEqual(problems, ["Cocos export: shared_atlas.png 同时归属 Alpha/Beta"]);
});

test("manifest structure:顶层、包字段和重复 name/id 均拒绝", () => {
  assert.throws(
    () => assertManifestShape({ version: 1, packages: [], views: [] }),
    /manifest 版本\/结构非法/,
  );
  assert.throws(
    () => assertManifestShape(baseManifest({ packages: [{ name: "Alpha" }] })),
    /manifest packages\[0\] 结构非法/,
  );
  assert.throws(
    () => assertManifestShape(baseManifest({
      packages: [
        packageRecord("Alpha", "same-id"),
        packageRecord("Alpha", "other-id"),
      ],
    })),
    /manifest package 名称重复：Alpha/,
  );
  assert.throws(
    () => assertManifestShape(baseManifest({
      packages: [
        packageRecord("Alpha", "same-id"),
        packageRecord("Beta", "same-id"),
      ],
    })),
    /manifest package id 重复：same-id/,
  );
  assert.doesNotThrow(() => assertManifestShape(baseManifest()));
});

test("currentManifest:只读构建当前资源闭包，不写回 manifest", () => {
  const manifest = currentManifest();
  assert.equal(manifest.version, 1);
  assert.ok(manifest.packages.length > 0);
  assert.ok(manifest.exports.length > 0);
  assert.ok(manifest.views.length > 0);
});

test("checkManifest 编排:五类集合/声明漂移均被直接报告", () => {
  const current = currentManifest();
  const silent = { log() {}, error() {} };
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fgui-manifest-test-"));
  try {
    const packageFixture = current.packages.find((pkg) => pkg.components.length > 0);
    const viewFixture = current.views.find((view) => typeof view.path === "string");
    assert.ok(packageFixture, "当前 manifest 至少需要一个 package fixture");
    assert.ok(viewFixture, "当前 manifest 至少需要一个 View fixture");
    assert.ok(packageFixture.components.length > 0, "当前 manifest package fixture 至少需要一个 component");
    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cases = [
      ["root", (manifest) => { manifest.sourceRoot = "apps/art/other"; }, /manifest root 与当前工程不一致/],
      ["package", (manifest) => {
        manifest.packages.find((pkg) => pkg.name === packageFixture.name).id = "drifted";
      }, new RegExp(`${escapeRegex(packageFixture.name)}: package id 变化`)],
      ["resource", (manifest) => {
        const pkg = manifest.packages.find((entry) => entry.name === packageFixture.name);
        pkg.resources = [...pkg.resources, {
          kind: "image", id: "fixture-resource", name: "fixture.png", exported: true,
        }];
      }, new RegExp(`${escapeRegex(packageFixture.name)}: package\\.xml 资源声明变化`)],
      ["package-missing", (manifest) => {
        // Keep the recorded package and remove it from the freshly built side.
      }, new RegExp(`package 缺失 ${escapeRegex(packageFixture.name)}`), (actual) => ({
        ...actual,
        packages: actual.packages.filter((pkg) => pkg.name !== packageFixture.name),
      })],
      ["package-extra", (manifest) => {
        manifest.packages = manifest.packages.filter((pkg) => pkg.name !== packageFixture.name);
      }, new RegExp(`package 多余 ${escapeRegex(packageFixture.name)}`)],
      ["view-missing", (manifest) => {
        // Keep the recorded View and remove it from the freshly built side.
      }, new RegExp(`View 缺失 ${escapeRegex(viewFixture.path)}`), (actual) => ({
        ...actual,
        views: actual.views.filter((view) => view.path !== viewFixture.path),
      })],
      ["view-extra", (manifest) => {
        manifest.views = manifest.views.filter((view) => view.path !== viewFixture.path);
      }, new RegExp(`View 多余 ${escapeRegex(viewFixture.path)}`)],
      ["component", (manifest) => {
        manifest.packages.find((pkg) => pkg.name === packageFixture.name).components[0].exported = false;
      }, new RegExp(`${escapeRegex(packageFixture.name)}: package\\.xml 组件/导出声明变化`)],
      ["View", (manifest) => {
        manifest.views.find((view) => view.path === viewFixture.path).pkg = "View_Home_Home";
      }, /View AUTO 生成区过期/],
      ["AUTO", (manifest) => {
        manifest.views.find((view) => view.path === viewFixture.path).generatedHash = "0".repeat(64);
      }, /View AUTO 生成区过期/],
    ];
    for (const [label, mutate, expected, actualFactory] of cases) {
      const manifest = structuredClone(current);
      mutate(manifest);
      const manifestPath = path.join(tempRoot, `${label}.json`);
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
      const result = checkManifest({
        manifestPath,
        buildCurrent: () => actualFactory ? actualFactory(current) : current,
        logger: silent,
      });
      assert.equal(result.ok, false, `${label} drift should fail`);
      assert.match(result.problems.join("\n"), expected);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("checkManifest:manifest 缺失与 JSON 解析失败均给出可诊断错误", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fgui-manifest-errors-"));
  try {
    const missing = path.join(tempRoot, "missing.json");
    assert.throws(
      () => checkManifest({ manifestPath: missing, buildCurrent: () => baseManifest(), logger: { log() {}, error() {} } }),
      /manifest 不存在: .*missing\.json/,
    );
    const malformed = path.join(tempRoot, "malformed.json");
    fs.writeFileSync(malformed, "{not-json");
    assert.throws(
      () => checkManifest({ manifestPath: malformed, buildCurrent: () => baseManifest(), logger: { log() {}, error() {} } }),
      /manifest JSON 无法解析:/,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("manifest CLI 参数:显式路径统一用于 check/write，并拒绝歧义参数", () => {
  assert.deepEqual(parseCliArgs([]), {
    mode: "check",
    manifestPath: path.join(ROOT, "scripts/fgui.manifest.json"),
  });
  assert.deepEqual(parseCliArgs(["--write", "--manifest", "tmp/manifest.json"]), {
    mode: "write",
    manifestPath: path.join(ROOT, "tmp/manifest.json"),
  });
  assert.equal(resolveManifestPath("/tmp/fgui-manifest.json"), "/tmp/fgui-manifest.json");
  assert.throws(() => parseCliArgs(["--check", "--write"]), /只能选择一个/);
  assert.throws(() => parseCliArgs(["--manifest"]), /需要非空路径/);
  assert.throws(() => parseCliArgs(["--manifest", "--check"]), /需要非空路径/);
  assert.throws(() => parseCliArgs(["--manifest", "a.json", "--manifest", "b.json"]), /只能指定一次/);
  assert.throws(() => parseCliArgs(["--unknown"]), /未知参数/);
});

test("fgui-manifest CLI:漂移返回非零，--check 不会隐式改写显式 manifest", () => {
  const current = currentManifest();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fgui-manifest-cli-"));
  const manifestPath = path.join(tempRoot, "manifest.json");
  try {
    current.exportRoot = "apps/Cocos/assets/resources/drifted";
    const before = `${JSON.stringify(current, null, 2)}\n`;
    fs.writeFileSync(manifestPath, before);
    const result = spawnSync(process.execPath, [SCRIPT, "--check", "--manifest", manifestPath], {
      cwd: ROOT,
      env: { ...process.env, FGUI_MANIFEST_PATH: undefined },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}${result.stderr}`, /manifest root 与当前工程不一致/);
    assert.equal(fs.readFileSync(manifestPath, "utf8"), before);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("fgui-manifest CLI:--write 写入显式 manifest 路径，环境变量不能静默改道", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fgui-manifest-write-"));
  const manifestPath = path.join(tempRoot, "manifest.json");
  const canonicalPath = path.join(ROOT, "scripts/fgui.manifest.json");
  const canonicalBefore = fs.readFileSync(canonicalPath, "utf8");
  try {
    const writeResult = spawnSync(process.execPath, [SCRIPT, "--write", "--manifest", manifestPath], {
      cwd: ROOT,
      env: { ...process.env, FGUI_MANIFEST_PATH: undefined },
      encoding: "utf8",
    });
    assert.equal(writeResult.status, 0, `${writeResult.stdout}${writeResult.stderr}`);
    assert.equal(fs.readFileSync(manifestPath, "utf8"), `${JSON.stringify(currentManifest(), null, 2)}\n`);
    assert.equal(fs.readFileSync(canonicalPath, "utf8"), canonicalBefore);

    const rejected = spawnSync(process.execPath, [SCRIPT, "--check", "--manifest", manifestPath], {
      cwd: ROOT,
      env: { ...process.env, FGUI_MANIFEST_PATH: path.join(tempRoot, "other.json") },
      encoding: "utf8",
    });
    assert.equal(rejected.status, 2);
    assert.match(`${rejected.stdout}${rejected.stderr}`, /FGUI_MANIFEST_PATH 已禁用/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("package.xml declarations:注释和 resources 外的伪声明不会进入闭包", () => {
  const xml = `<!-- <component name="CommentOnly.xml" exported="true"/> -->
    <packageDescription id="pkg00001"/>
    <resources>
      <component id="comp0001" name="Panel.xml" exported="true"/>
      <image id="img00001" name="panel.png" exported="true"/>
      <folder id="folder01" name="editor-only"/>
    </resources>
    <component name="OutsideResources.xml" exported="true"/>`;

  assert.equal(packageDescription(xml), "pkg00001");
  assert.deepEqual(componentDeclarations(xml), [{ name: "Panel.xml", exported: true }]);
  assert.deepEqual(resourceDeclarations(xml), [
    { kind: "component", id: "comp0001", name: "Panel.xml", exported: true },
    { kind: "image", id: "img00001", name: "panel.png", exported: true },
  ]);
  assert.throws(() => packageDescription("<resources/>"), /缺少 packageDescription/);
  assert.throws(() => packageDescription("<packageDescription name=\"without-id\"/>"), /缺少 packageDescription.id/);
});

test("ui:// closure:合法 name/id 别名通过，未知包、资源和缺失 key 均报错", () => {
  const maps = resourceMaps();

  assert.equal(validateUiUrl("Alpha/Panel.xml", maps), undefined);
  assert.equal(validateUiUrl("Alpha/Panel", maps), undefined);
  assert.equal(validateUiUrl("Alpha/icons/icon.png", maps), undefined);
  assert.equal(validateUiUrl("aaaa1111comp0001", maps), undefined);

  assert.match(validateUiUrl("Missing/Panel.xml", maps), /未知 ui:\/\/ 包 Missing/);
  assert.match(validateUiUrl("Alpha/", maps), /缺少资源 ID\/名称/);
  assert.match(validateUiUrl("Alpha/Unknown.xml", maps), /未知资源 Unknown.xml/);
  assert.match(validateUiUrl("Alpha", maps), /缺少资源 ID\/名称/);
  assert.match(validateUiUrl("aaaa1111", maps), /缺少资源 ID/);
  assert.match(validateUiUrl("aaaa1111missing", maps), /未知资源 ID missing/);
  assert.match(validateUiUrl("unknownbinary", maps), /未知 ui:\/\/ 包\/资源/);
});

test("CDATA 里的字面 <!-- 不得吞掉其后的真实引用", () => {
  // 正则式剥注释若不认 CDATA，`<![CDATA[ ... <!-- ... ]]>` 里的 `<!--` 会一路吃到文件后面
  // 第一个真 `-->`，把中间整段（含真实 src=/ui://）删掉——引用抽取少校验若干条，
  // 失败方向是**误绿**：漏导那些资源时 verify:fgui 依然打 ✔。
  // ⚠ 触发要同时具备「CDATA 内的字面 <!--」与「其后的真注释」两件事，缺一不成立。
  const { extractUiUrls, extractAssetReferences, withoutXmlComments } = fguiManifestTestHooks;
  const source = [
    '<component name="Main">',
    '  <text name="tip"><![CDATA[ 写法：<!-- 注释 ]]></text>',
    '  <image name="realA" src="realResA" url="ui://Pkg/realA"/>',
    '  <!-- 真注释：<image src="ghostRes"/> -->',
    '  <image name="realB" src="realResB"/>',
    '</component>',
  ].join("\n");
  assert.deepEqual(
    extractAssetReferences(source).map((reference) => reference.src),
    ["realResA", "realResB"],
    "CDATA 之后的真实 src= 必须全部保留，注释里的 ghostRes 必须剔除",
  );
  assert.deepEqual(extractUiUrls(source), ["Pkg/realA"], "CDATA 之后的真实 ui:// 必须保留");
  // CDATA 段本身必须原样留在输出里，⛔ 不能被当成注释一并删掉
  assert.match(withoutXmlComments(source), /<!\[CDATA\[ 写法：<!-- 注释 \]\]>/u);
});

test("XML 注释里的 src/pkg/ui:// 引用不是引用", () => {
  const { extractUiUrls, extractAssetReferences, extractPkgReferences } = fguiManifestTestHooks;
  // 注释剥离只有一个实现（withoutXmlComments），声明解析与引用抽取共用它
  assert.equal(typeof fguiManifestTestHooks.withoutXmlComments, "function");
  const source = [
    '<component name="Main">',
    '  <!-- 设计备注：<image src="ghost.png"/> 引用 ui://GhostPkg/ghostItem -->',
    '  <image src="real.png"/>',
    '  <!-- <loader pkg="ghostPkgId"/> -->',
    '</component>',
  ].join("\n");
  assert.deepEqual(extractUiUrls(source), [], "注释里的 ui:// 不得产生引用");
  assert.deepEqual(
    extractAssetReferences(source).map((reference) => reference.src),
    ["real.png"],
    "注释里的 src= 不得产生引用，真实 src= 必须保留",
  );
  // ⚠ 用例名里的 pkg 此前**零断言**：把 parseUiReferences 那处 pkg= 扫描的剥注释单独去掉，
  // 整个 test:fgui 仍然 62/62 全绿。三个抽取器都要各自被守住，⛔ 名字里写了就必须真的断言。
  assert.deepEqual(extractPkgReferences(source), [], "注释里的 pkg= 不得产生包引用");
  assert.deepEqual(
    extractPkgReferences('<loader pkg="realPkgId"/>\n<!-- <loader pkg="ghostPkgId"/> -->'),
    ["realPkgId"],
    "真实 pkg= 必须保留——⛔ 否则上一条可能只是因为剥得太狠",
  );
});
