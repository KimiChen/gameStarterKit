// FGUI manifest 的纯校验分支测试；不读写仓库内的设计源或导出物。
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertManifestShape,
  compareRecords,
  componentDeclarations,
  currentManifest,
  outputOwnershipProblems,
  packageDescription,
  resourceDeclarations,
  sourcePathProblems,
  validateUiUrl,
} from "./fgui-manifest.mjs";

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
