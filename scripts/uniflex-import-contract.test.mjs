import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const converterRoot = process.env.WEB_UI_TO_PSD_ROOT || "/Volumes/wx/src/web-ui-to-psd";
const converter = join(converterRoot, "bin/cli.mjs");
const design = resolve(root, "apps/client/src/ui-uniflex/imported/Backpack/design.json");

let available = true;
try {
    await access(converter);
} catch {
    available = false;
}

test("PSD UniFlex package contract uses manifest.json without page sidecars", {
    skip: available ? false : "web-ui-to-psd is unavailable",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-contract-"));
    const packageDir = join(tempRoot, "package");
    const importDir = join(tempRoot, "import");
    try {
        await execFileAsync(process.execPath, [
            converter, "uniflex-package", "--design", design,
            "--name", "Backpack", "--out", packageDir,
        ], { cwd: root });
        const manifest = JSON.parse(await readFile(join(packageDir, "manifest.json"), "utf8"));
        assert.equal(manifest.version, 1);
        assert.ok(Array.isArray(manifest.assets) && manifest.assets.length > 0);
        assert.ok(manifest.assets.every((asset) => typeof asset.file === "string"));
        assert.equal(await access(join(packageDir, "components.json")).then(() => true).catch(() => false), false);
        assert.equal(await access(join(packageDir, "import.json")).then(() => true).catch(() => false), false);

        await execFileAsync(process.execPath, [
            resolve(root, "scripts/import-uniflex-package.mjs"),
            "--name", "Backpack", "--out", importDir, packageDir,
        ], { cwd: root });
        assert.equal(await access(join(importDir, "manifest.json")).then(() => true), true);
        assert.equal(await access(join(importDir, "design.json")).then(() => true), true);
        assert.equal(await access(join(importDir, "components.json")).then(() => true).catch(() => false), false);
        assert.equal(await access(join(importDir, "import.json")).then(() => true).catch(() => false), false);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});
