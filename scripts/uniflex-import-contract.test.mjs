import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { resolveConverter } from "./uniflex-ui-cli.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const env = { ...process.env };
delete env.WEB_UI_TO_PSD_CLI;
delete env.WEB_UI_TO_PSD_ROOT;

let converter;
let available = true;
try {
    converter = await resolveConverter(root, env);
} catch {
    available = false;
}

const PIXEL_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
);

async function writeConverterDesign(directory) {
    await mkdir(join(directory, "assets"), { recursive: true });
    await writeFile(join(directory, "assets/pixel.png"), PIXEL_PNG);
    const sha256 = createHash("sha256").update(PIXEL_PNG).digest("hex");
    const design = {
        schemaVersion: 1,
        kind: "uniflex-design",
        canvas: { width: 8, height: 8 },
        roots: ["root"],
        fonts: {},
        assets: {
            pixel: { path: "assets/pixel.png", sha256, mime: "image/png", width: 1, height: 1 },
        },
        nodes: {
            root: {
                id: "root",
                name: "Component",
                kind: "group",
                frame: { x: 0, y: 0, width: 8, height: 8 },
                opacity: 1,
                visible: true,
                children: ["fill"],
            },
            fill: {
                id: "fill",
                name: "fill",
                kind: "image",
                frame: { x: 0, y: 0, width: 8, height: 8 },
                opacity: 1,
                visible: true,
                asset: "pixel",
            },
        },
    };
    const file = join(directory, "design.json");
    await writeFile(file, JSON.stringify(design));
    return file;
}

test("PSD UniFlex package contract uses manifest.json without page sidecars", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-contract-"));
    const designDir = join(tempRoot, "design");
    const packageDir = join(tempRoot, "package");
    const importRoot = join(tempRoot, "import");
    const resourceDir = join(importRoot, "apps/client/resources/ui/Backpack");
    const pageDir = join(importRoot, "apps/client/src/ui-uniflex/pages/Backpack");
    try {
        const design = await writeConverterDesign(designDir);
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", design,
            "--name", "Backpack", "--out", packageDir,
        ], { cwd: root, env });
        const manifest = JSON.parse(await readFile(join(packageDir, "manifest.json"), "utf8"));
        assert.equal(manifest.version, 1);
        assert.ok(Array.isArray(manifest.assets) && manifest.assets.length > 0);
        assert.ok(manifest.assets.every((asset) => typeof asset.file === "string"));
        assert.equal(await access(join(packageDir, "components.json")).then(() => true).catch(() => false), false);
        assert.equal(await access(join(packageDir, "import.json")).then(() => true).catch(() => false), false);

        await execFileAsync(process.execPath, [
            resolve(root, "scripts/import-uniflex-package.mjs"),
            "--name", "Backpack", "--out", importRoot, packageDir,
        ], { cwd: root });
        assert.equal(await access(join(resourceDir, "manifest.json")).then(() => true), true);
        assert.equal(await access(join(resourceDir, "design.json")).then(() => true), true);
        assert.equal(await access(join(resourceDir, "assets")).then(() => true), true);
        assert.equal(await access(join(pageDir)).then(() => true), true);
        assert.equal(await access(join(pageDir, "Backpack.tsx")).then(() => true), true);
        assert.equal(await access(join(pageDir, "Backpack.authoring.tsx")).then(() => true).catch(() => false), false);
        assert.equal(await access(join(pageDir, "components", "BackpackComponent.tsx")).then(() => true), true);
        assert.equal(await access(join(importRoot, "apps/client/src/ui-uniflex/imported")).then(() => true).catch(() => false), false);
        assert.equal(await access(join(resourceDir, "Backpack.authoring.tsx")).then(() => true).catch(() => false), false);
        assert.equal(await access(join(resourceDir, "IMPORT.md")).then(() => true).catch(() => false), false);
        assert.equal(await access(join(resourceDir, "components.json")).then(() => true).catch(() => false), false);
        assert.equal(await access(join(resourceDir, "import.json")).then(() => true).catch(() => false), false);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("pinned converter restores catalog ConfirmButton from layer identity", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-identity-"));
    try {
        const designDir = join(tempRoot, "design");
        const packageDir = join(tempRoot, "package");
        await mkdir(join(designDir, "assets"), { recursive: true });
        await writeFile(join(designDir, "assets/pixel.png"), PIXEL_PNG);
        const sha256 = createHash("sha256").update(PIXEL_PNG).digest("hex");
        const frame = { x: 0, y: 0, width: 8, height: 8 };
        await writeFile(join(designDir, "design.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-design", canvas: { width: 8, height: 8 },
            roots: ["page"], fonts: {},
            assets: { pixel: { path: "assets/pixel.png", sha256, mime: "image/png", width: 1, height: 1 } },
            nodes: {
                page: {
                    id: "page", name: "Confirm", kind: "group", frame, opacity: 1, visible: true,
                    children: ["button"],
                    identity: { key: "Confirm.root", role: "page", definitionKey: "Confirm" },
                },
                button: {
                    id: "button", name: "ConfirmButton", kind: "group", frame, opacity: 1, visible: true,
                    children: ["fill"],
                    identity: {
                        key: "ConfirmButton:Confirm/ConfirmButton", role: "component",
                        definitionKey: "ConfirmButton",
                    },
                },
                fill: {
                    id: "fill", name: "ActionButton/Background", kind: "image", frame, opacity: 1,
                    visible: true, asset: "pixel",
                    identity: {
                        key: "ConfirmButton:Confirm/ConfirmButton/Background", role: "fill",
                        definitionKey: "ConfirmButton",
                    },
                },
            },
        }));
        await writeFile(join(designDir, "component-declarations.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-component-declarations",
            definitions: [
                { key: "Confirm", source: "apps/client/src/ui-uniflex/pages/Confirm/Confirm.tsx" },
                { key: "ConfirmButton", source: "apps/client/src/ui-uniflex/components/button/ConfirmButton.tsx" },
            ],
            instances: [
                { key: "Confirm.root", definitionKey: "Confirm", role: "page", rootRecordId: 1 },
                {
                    key: "ConfirmButton:Confirm/ConfirmButton", definitionKey: "ConfirmButton",
                    role: "component", rootRecordId: 2,
                },
            ],
        }));
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "Confirm", "--out", packageDir,
        ], { cwd: root, env });
        const source = await readFile(join(packageDir, "Confirm.authoring.tsx"), "utf8");
        assert.match(source, /import \{ ConfirmButton \} from '\.\.\/\.\.\/components\/button\/ConfirmButton'/);
        assert.match(source, /<ConfirmButton /);
        assert.doesNotMatch(source, /ConfirmConfirmButton/);
        assert.deepEqual(await readdir(join(packageDir, "components")), []);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});
