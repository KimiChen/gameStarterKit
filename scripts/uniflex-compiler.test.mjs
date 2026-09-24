import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const binDir = join(root, "vendor/uniflex/bin");
const manifest = JSON.parse(readFileSync(join(binDir, "manifest.json"), "utf8"));
const targets = {
    "darwin-arm64": 0x0100000c,
    "darwin-x64": 0x01000007,
};

test("bundled macOS compilers match their architectures and manifest hashes", () => {
    assert.deepEqual(Object.keys(manifest.binaries).sort(),
        Object.keys(targets).map((target) => `${target}/uniflex-compiler`).sort());
    for (const [target, cpuType] of Object.entries(targets)) {
        const name = `${target}/uniflex-compiler`;
        const executable = join(binDir, name);
        const bytes = readFileSync(executable);
        assert.equal(bytes.readUInt32LE(0), 0xfeedfacf, `${name}: Mach-O 64-bit`);
        assert.equal(bytes.readUInt32LE(4), cpuType, `${name}: CPU type`);
        assert.equal(createHash("sha256").update(bytes).digest("hex"),
            manifest.binaries[name].sha256, `${name}: SHA-256`);
        assert.ok(statSync(executable).mode & 0o111, `${name}: executable bit`);
    }
});

test("compiler wrapper launches the bundled binary for this Mac", {
    skip: process.platform !== "darwin",
}, () => {
    const target = `darwin-${process.arch}`;
    assert.ok(target in targets, `unsupported Node architecture: ${target}`);
    const result = spawnSync(process.execPath, [join(root, "tools/uniflex-compiler.mjs"), "version"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, UNIFLEX_COMPILER: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /uniflex-compiler 0\.1\.0 \(TypeScript 7\.0\.2,/);
});
