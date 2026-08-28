import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  LOCKED_FILES,
  checkVendorLock,
  discoverVendorFiles,
  writeVendorLock,
} from "./vendor-lock.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "vendor-lock-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  for (const relative of LOCKED_FILES) {
    const destination = path.join(root, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(ROOT, relative), destination);
  }
  return root;
}

test("vendor lock actual-set check rejects an unregistered runtime file", () => {
  const root = fixtureRoot();
  try {
    writeVendorLock(root);
    const extra = path.join(root, "apps/Cocos/extensions/fairygui-cc/runtime/community-patch.mjs");
    writeFileSync(extra, "export {};\n");
    const result = checkVendorLock(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("community-patch.mjs")), result.errors.join("\n"));
    assert.ok(discoverVendorFiles(root).includes("apps/Cocos/extensions/fairygui-cc/runtime/community-patch.mjs"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("vendor lock actual-set check rejects symlinks before hashing outside bytes", () => {
  const root = fixtureRoot();
  const outside = mkdtempSync(path.join(tmpdir(), "vendor-lock-outside-"));
  try {
    writeVendorLock(root);
    const target = path.join(root, LOCKED_FILES[0]);
    const external = path.join(outside, "fairygui.mjs");
    writeFileSync(external, "external bytes\n");
    unlinkSync(target);
    symlinkSync(external, target);
    const result = checkVendorLock(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /应锁文件不存在|实际.*缺少/.test(error)), result.errors.join("\n"));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
