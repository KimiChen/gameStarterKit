/**
 * Project initializer/verifier boundary checks.
 *
 * These tests intentionally exercise paths outside the normal client runtime:
 * package identity must not create duplicate workspace names, and metadata
 * verification must never follow a symlinked directory below its checkout.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertPackageNames, packageNames } from "../../../scripts/lib/project-metadata.mjs";
import { verifyProjectMetadata } from "../../../scripts/verify-project-metadata.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function copyFixtureFile(root: string, relative: string): void {
  const destination = join(root, relative);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(REPO_ROOT, relative), destination);
}

function createValidFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "project-metadata-"));
  for (const relative of [
    "project.metadata.json",
    ".env.development",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "package.json",
    "package-lock.json",
    "apps/shared/package.json",
    "apps/shared/src/index.ts",
    "apps/shared/src/project.ts",
    "apps/server/package.json",
    "apps/Cocos/package.json",
  ]) copyFixtureFile(root, relative);
  for (const relative of [
    "apps/client/src/shared",
    "apps/client/src/lib/bitecs",
    "apps/Cocos/assets/src/shared",
    "apps/Cocos/assets/src/lib/bitecs",
  ]) mkdirSync(join(root, relative), { recursive: true });
  for (const relative of [
    "apps/client/src/lib/colyseus/colyseus.js",
    "apps/Cocos/assets/src/lib/colyseus/colyseus.js",
    "apps/Cocos/extensions/fairygui-cc/runtime/fairygui.mjs",
    "apps/Cocos/extensions/fairygui-cc/runtime/fairygui.d.ts",
  ]) {
    const destination = join(root, relative);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, "fixture");
  }
  return root;
}

function snapshotFixtureFiles(root: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else if (entry.isFile()) {
        snapshot.set(file.slice(root.length + 1), readFileSync(file, "utf8"));
      }
    }
  };
  visit(root);
  return snapshot;
}

test("project package identity rejects workspace name collisions", () => {
  for (const name of ["shared", "Shared", "server"]) {
    const metadata = { name, scope: null, packages: packageNames({ name, scope: null }) };
    assert.throws(
      () => assertPackageNames(metadata),
      /重名.*workspace 包名碰撞/,
      `reserved workspace name should be rejected: ${name}`,
    );
  }
});

test("project metadata verifier rejects duplicate or empty --root arguments", () => {
  const script = join(REPO_ROOT, "scripts/verify-project-metadata.mjs");
  const duplicate = spawnSync(process.execPath, [script, "--root", REPO_ROOT, "--root", REPO_ROOT], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(duplicate.status, 0);
  assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /参数重复：--root/);

  const empty = spawnSync(process.execPath, [script, "--root", ""], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(empty.status, 0);
  assert.match(`${empty.stdout}\n${empty.stderr}`, /--root 需要非空目录参数/);
});

test("project metadata verifier rejects a symlinked parent directory", () => {
  const root = createValidFixture();
  const outside = mkdtempSync(join(tmpdir(), "project-metadata-outside-"));
  try {
    const baseline = verifyProjectMetadata(root);
    assert.equal(baseline.ok, true, baseline.errors.join("\n"));

    rmSync(join(root, "apps"), { recursive: true, force: true });
    symlinkSync(outside, join(root, "apps"), "dir");
    const result = verifyProjectMetadata(root);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((error) => /路径组件不得是符号链接/.test(error) && error.includes("apps")),
      result.errors.join("\n"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("project initializer preflights metadata symlinks before writing other files", () => {
  const root = createValidFixture();
  const outside = mkdtempSync(join(tmpdir(), "project-metadata-init-outside-"));
  const metadataFile = join(root, "project.metadata.json");
  const externalMetadata = join(outside, "project.metadata.json");
  const envFile = join(root, ".env.development");
  const identityFile = join(root, "apps/shared/src/project.ts");
  try {
    cpSync(metadataFile, externalMetadata);
    rmSync(metadataFile);
    symlinkSync(externalMetadata, metadataFile, "file");
    const beforeEnv = readTextForTest(envFile);
    const beforeIdentity = readTextForTest(identityFile);
    const script = join(REPO_ROOT, "scripts/init-project.mjs");
    const result = spawnSync(process.execPath, [
      script,
      "--root", root,
      "--project-id", "arena",
      "--name", "arena-kit",
      "--display-name", "Arena Kit",
      "--scope", "@example",
      "--brand", "ballMove",
      "--force",
      "--skip-verify",
    ], { cwd: REPO_ROOT, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /符号链接/);
    assert.equal(readTextForTest(envFile), beforeEnv, "env must not be partially migrated");
    assert.equal(readTextForTest(identityFile), beforeIdentity, "identity source must not be partially migrated");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("project initializer rewrites bare package module specifiers when adding a scope", () => {
  const root = createValidFixture();
  try {
    const editJson = (relative: string, edit: (value: Record<string, any>) => void): void => {
      const file = join(root, relative);
      const value = JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
      edit(value);
      writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    };
    editJson("package.json", (pkg) => {
      pkg.name = "game";
      // Keep the fixture self-contained: init-project runs this hook after
      // writing projections, but no generated mirror is needed for this test.
      pkg.scripts = { ...(pkg.scripts ?? {}), "sync:shared": "node -e \"\"" };
    });
    editJson("apps/shared/package.json", (pkg) => { pkg.name = "shared"; });
    editJson("apps/server/package.json", (pkg) => {
      pkg.name = "server";
      pkg.dependencies = { ...(pkg.dependencies ?? {}) };
      delete pkg.dependencies["@game/shared"];
      pkg.dependencies.shared = "0.1.0";
    });
    editJson("apps/Cocos/package.json", (pkg) => { pkg.name = "game-client"; });
    editJson("project.metadata.json", (metadata) => {
      metadata.name = "game";
      metadata.scope = null;
      metadata.packages = packageNames({ name: "game", scope: null });
    });

    const source = join(root, "apps/server/src/module-imports.ts");
    mkdirSync(dirname(source), { recursive: true });
    writeFileSync(source, [
      'import { sharedValue } from "shared";',
      "export { serverValue } from 'server/subpath';",
      'const dynamic = import(`shared/feature`);',
      'const ordinary = "shared";',
      'const localPath = "./shared";',
      "",
    ].join("\n"));
    const docs = join(root, "docs/migration.md");
    mkdirSync(dirname(docs), { recursive: true });
    writeFileSync(docs, "apps/shared\nnpm --workspace shared run test\n");

    const script = join(REPO_ROOT, "scripts/init-project.mjs");
    const result = spawnSync(process.execPath, [
      script,
      "--root", root,
      "--project-id", "arena",
      "--name", "arena-kit",
      "--display-name", "Arena Kit",
      "--scope", "@example",
      "--brand", "ballMove",
      "--force",
      "--skip-verify",
    ], { cwd: REPO_ROOT, encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const migrated = readTextForTest(source);
    assert.match(migrated, /from "@example\/shared"/);
    assert.match(migrated, /from '@example\/server\/subpath'/);
    assert.match(migrated, /import\(`@example\/shared\/feature`\)/);
    assert.match(migrated, /const ordinary = "shared"/);
    assert.match(migrated, /const localPath = "\.\/shared"/);
    const migratedDocs = readTextForTest(docs);
    assert.match(migratedDocs, /apps\/shared/);
    assert.match(migratedDocs, /--workspace @example\/shared/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project initializer is idempotent with identical arguments", () => {
  const root = createValidFixture();
  try {
    const packageFile = join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packageFile, "utf8")) as Record<string, any>;
    packageJson.scripts = { ...(packageJson.scripts ?? {}), "sync:shared": "node -e \"\"" };
    writeFileSync(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);

    const script = join(REPO_ROOT, "scripts/init-project.mjs");
    const args = [
      script,
      "--root", root,
      "--project-id", "arena",
      "--name", "arena-kit",
      "--display-name", "Arena Kit",
      "--scope", "@example",
      "--brand", "ballMove",
      "--force",
      "--skip-verify",
    ];
    const first = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: "utf8" });
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    const afterFirst = snapshotFixtureFiles(root);

    const second = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: "utf8" });
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.match(`${second.stdout}\n${second.stderr}`, /已更新 0 个文件/);
    assert.deepEqual(snapshotFixtureFiles(root), afterFirst);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function readTextForTest(file: string): string {
  return readFileSync(file, "utf8");
}
