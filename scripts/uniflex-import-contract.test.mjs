import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { resolveConverter } from "./uniflex-ui-cli.mjs";
import { artComponentPsdPath, artPsdPath } from "./lib/uniflex-art.mjs";

function findTextLayer(layer, namePrefix) {
    if (layer.text && String(layer.name || "").startsWith(namePrefix)) return layer;
    for (const child of layer.children || []) {
        const found = findTextLayer(child, namePrefix);
        if (found) return found;
    }
    return null;
}

function findLayer(layer, predicate) {
    if (predicate(layer)) return layer;
    for (const child of layer.children || []) {
        const found = findLayer(child, predicate);
        if (found) return found;
    }
    return null;
}

function removeLayer(root, predicate) {
    function walk(children) {
        if (!children) return false;
        const at = children.findIndex(predicate);
        if (at >= 0) {
            children.splice(at, 1);
            return true;
        }
        return children.some((child) => walk(child.children));
    }
    return walk(root.children);
}

// Same derivation as the converter's linkedFileGuid (uniflex-linked-psd.mjs).
function linkedFileGuid(seed) {
    const hex = createHash("sha256").update(String(seed)).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`
        + `-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function repaintLayer(layer, createCanvas, paint) {
    const width = layer.right - layer.left;
    const height = layer.bottom - layer.top;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    paint(context, width, height);
    layer.canvas = canvas;
    layer.imageData = context.getImageData(0, 0, width, height);
}

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
    const pageDir = join(importRoot, "apps/client/src/ui-uniflex/modules/Backpack");
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

test("authoring import replaces leftover dump components instead of merging", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-replace-authoring-"));
    const designDir = join(tempRoot, "design");
    const packageDir = join(tempRoot, "package");
    const importRoot = join(tempRoot, "import");
    const pageDir = join(importRoot, "apps/client/src/ui-uniflex/modules/Backpack");
    try {
        const design = await writeConverterDesign(designDir);
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", design,
            "--name", "Backpack", "--out", packageDir,
        ], { cwd: root, env });
        await mkdir(join(pageDir, "components"), { recursive: true });
        await writeFile(join(pageDir, "components/LeftoverDump.tsx"), "export const LeftoverDump = 1;\n");
        const leftoverAsset = join(importRoot, "apps/client/resources/ui/Backpack/assets/leftover.bin");
        await mkdir(join(importRoot, "apps/client/resources/ui/Backpack/assets"), { recursive: true });
        await writeFile(leftoverAsset, "stale");
        await execFileAsync(process.execPath, [
            resolve(root, "scripts/import-uniflex-package.mjs"),
            "--update", "--name", "Backpack", "--out", importRoot, packageDir,
        ], { cwd: root });
        assert.equal(await access(join(pageDir, "Backpack.tsx")).then(() => true), true);
        assert.equal(await access(join(pageDir, "components", "BackpackComponent.tsx")).then(() => true), true);
        assert.equal(await access(join(pageDir, "components", "LeftoverDump.tsx")).then(() => true).catch(() => false), false);
        assert.equal(await access(leftoverAsset).then(() => true).catch(() => false), false);
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
                { key: "Confirm", source: "apps/client/src/ui-uniflex/modules/Confirm/Confirm.tsx" },
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
            "--name", "Confirm", "--source-root", tempRoot, "--out", packageDir,
        ], { cwd: root, env });
        const source = await readFile(join(packageDir, "Confirm.authoring.tsx"), "utf8");
        assert.match(source, /import \{ ConfirmButton \} from '\.\.\/\.\.\/components\/button\/ConfirmButton'/);
        assert.match(source, /<ConfirmButton /);
        assert.doesNotMatch(source, /ConfirmConfirmButton/);
        const dumped = await readdir(join(packageDir, "components")).catch((error) => {
            if (error.code === "ENOENT") return [];
            throw error;
        });
        assert.deepEqual(dumped, []);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("pinned converter restores MailBattleRow and BackpackTab from layer identity", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-complex-identity-"));
    try {
        const frame = { x: 10, y: 236, width: 730, height: 163 };
        const designDir = join(tempRoot, "design");
        const packageDir = join(tempRoot, "package");
        await mkdir(designDir, { recursive: true });
        await writeFile(join(designDir, "design.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-design", canvas: { width: 750, height: 1334 },
            roots: ["page"], fonts: {}, assets: {},
            nodes: {
                page: {
                    id: "page", name: "MailBattleReport", kind: "group",
                    frame: { x: 0, y: 0, width: 750, height: 1334 }, opacity: 1, visible: true,
                    children: ["row"],
                    identity: { key: "MailBattleReport.root", role: "page", definitionKey: "MailBattleReport" },
                },
                row: {
                    id: "row", name: "MailBattleRow", kind: "group", frame, opacity: 1, visible: true,
                    children: [],
                    identity: {
                        key: "MailBattleRow:MailBattleReport/MailBattleRow:0", role: "component",
                        definitionKey: "MailBattleRow",
                    },
                },
            },
        }));
        await writeFile(join(designDir, "component-declarations.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-component-declarations",
            definitions: [
                { key: "MailBattleReport", source: "apps/client/src/ui-uniflex/modules/MailBattleReport/MailBattleReport.tsx" },
                { key: "MailBattleRow", source: "apps/client/src/ui-uniflex/modules/MailBattleReport/MailBattleRow.tsx" },
            ],
            instances: [
                { key: "MailBattleReport.root", definitionKey: "MailBattleReport", role: "page", rootRecordId: 1 },
                {
                    key: "MailBattleRow:MailBattleReport/MailBattleRow:0", definitionKey: "MailBattleRow",
                    role: "component", rootRecordId: 2,
                },
            ],
        }));
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "MailBattleReport", "--source-root", tempRoot, "--out", packageDir,
        ], { cwd: root, env });
        const source = await readFile(join(packageDir, "MailBattleReport.authoring.tsx"), "utf8");
        assert.match(source, /import \{ MailBattleRow \} from '\.\/MailBattleRow'/);
        assert.match(source, /<MailBattleRow /);
        assert.doesNotMatch(source, /MailBattleReportMailBattleRow/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("pinned converter copies unique page-local panels and overlays For defaultItems", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-nested-overlay-"));
    try {
        const pageDir = join(tempRoot, "apps/client/src/ui-uniflex/modules/AllianceTech");
        const packageDir = join(tempRoot, "package");
        const designDir = join(tempRoot, "design");
        await mkdir(pageDir, { recursive: true });
        await mkdir(designDir, { recursive: true });
        await writeFile(join(pageDir, "AllianceTechNode.tsx"),
            "export const AllianceTechNode = defineComponent((p) => <view name=\"AllianceTechNode\" />);\n");
        await writeFile(join(pageDir, "AllianceTechPanel.tsx"), `import { AllianceTechNode } from './AllianceTechNode';
export const DEFAULT_ALLIANCE_TECH_NODES = [
    { id: 'shield', kind: 'shield', left: 294, top: 158, level: 5, maxLevel: 5 },
    { id: 'heart', kind: 'heart', left: 57, top: 421, parentIds: ['shield'], level: 1, maxLevel: 5 },
];
export const AllianceTechPanel = defineComponent((p) => {
    const nodes = p.nodes ?? DEFAULT_ALLIANCE_TECH_NODES;
    return (
        <view name="AllianceTech">
            <For each={nodes} key="id">
                {(node) => <AllianceTechNode node={node} />}
            </For>
        </view>
    );
});
`);
        await writeFile(join(pageDir, "AllianceTech.tsx"), `import { AllianceTechPanel } from './AllianceTechPanel';
export const AllianceTech = defineView(() => (
    <view name="AllianceTechPage">
        <AllianceTechPanel />
    </view>
));
`);
        const page = { x: 0, y: 0, width: 750, height: 1624 };
        await writeFile(join(designDir, "design.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-design", canvas: { width: 750, height: 1624 },
            roots: ["page"], fonts: {}, assets: {},
            nodes: {
                page: {
                    id: "page", name: "AllianceTechPage", kind: "group", frame: page,
                    opacity: 1, visible: true, children: ["panel"],
                    identity: { key: "AllianceTech.root", role: "page", definitionKey: "AllianceTech" },
                },
                panel: {
                    id: "panel", name: "AllianceTech", kind: "group", frame: page,
                    opacity: 1, visible: true, children: ["node0", "node1"],
                    identity: {
                        key: "AllianceTechPanel:AllianceTechPage/AllianceTech", role: "component",
                        definitionKey: "AllianceTechPanel",
                    },
                },
                node0: {
                    id: "node0", name: "AllianceTechNode", kind: "group",
                    frame: { x: 310, y: 170, width: 165, height: 192 },
                    opacity: 1, visible: true, children: [],
                    identity: {
                        key: "AllianceTechNode:AllianceTechPage/AllianceTech/AllianceTechNode:0",
                        role: "component", definitionKey: "AllianceTechNode",
                    },
                },
                node1: {
                    id: "node1", name: "AllianceTechNode", kind: "group",
                    frame: { x: 57, y: 421, width: 164, height: 190 },
                    opacity: 1, visible: true, children: [],
                    identity: {
                        key: "AllianceTechNode:AllianceTechPage/AllianceTech/AllianceTechNode:1",
                        role: "component", definitionKey: "AllianceTechNode",
                    },
                },
            },
        }));
        await writeFile(join(designDir, "component-declarations.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-component-declarations",
            definitions: [
                { key: "AllianceTech", source: "apps/client/src/ui-uniflex/modules/AllianceTech/AllianceTech.tsx" },
                { key: "AllianceTechPanel", source: "apps/client/src/ui-uniflex/modules/AllianceTech/AllianceTechPanel.tsx" },
                { key: "AllianceTechNode", source: "apps/client/src/ui-uniflex/modules/AllianceTech/AllianceTechNode.tsx" },
            ],
            instances: [
                { key: "AllianceTech.root", definitionKey: "AllianceTech", role: "page", rootRecordId: 1 },
                {
                    key: "AllianceTechPanel:AllianceTechPage/AllianceTech", definitionKey: "AllianceTechPanel",
                    role: "component", rootRecordId: 2,
                },
                {
                    key: "AllianceTechNode:AllianceTechPage/AllianceTech/AllianceTechNode:0",
                    definitionKey: "AllianceTechNode", role: "component", rootRecordId: 3,
                },
                {
                    key: "AllianceTechNode:AllianceTechPage/AllianceTech/AllianceTechNode:1",
                    definitionKey: "AllianceTechNode", role: "component", rootRecordId: 4,
                },
            ],
        }));
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "AllianceTechRestored", "--source-root", tempRoot, "--out", packageDir,
        ], { cwd: root, env });
        const pageSource = await readFile(join(packageDir, "AllianceTechRestored.authoring.tsx"), "utf8");
        const panel = await readFile(join(packageDir, "restored/modules/AllianceTech/AllianceTechPanel.tsx"), "utf8");
        assert.match(pageSource, /from '\.\.\/\.\.\/restored\/modules\/AllianceTech\/AllianceTechPanel'/);
        assert.match(panel, /id: 'shield', kind: 'shield', left: 310, top: 170/);
        assert.match(panel, /from '\.\/AllianceTechNode'/);
        assert.equal(await access(join(packageDir, "AllianceTechPanel.tsx")).then(() => true).catch(() => false), false);
        assert.equal(await access(join(packageDir, "AllianceTechNode.tsx")).then(() => true).catch(() => false), false);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("import merges restored/ copies without wiping other restored files", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-restored-merge-"));
    const packageDir = join(tempRoot, "package");
    const importRoot = join(tempRoot, "import");
    try {
        await mkdir(join(packageDir, "assets"), { recursive: true });
        await mkdir(join(packageDir, "restored/pages/Backpack/components"), { recursive: true });
        await mkdir(join(importRoot, "apps/client/src/ui-uniflex/restored/components/button"),
            { recursive: true });
        await writeFile(join(packageDir, "design.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-design", name: "BackpackItemCard",
            canvas: { width: 8, height: 8 }, roots: [], fonts: {}, assets: {}, nodes: {},
        }));
        await writeFile(join(packageDir, "manifest.json"), JSON.stringify({
            version: 1, assets: [],
        }));
        await writeFile(join(packageDir, "restored/pages/Backpack/components/BackpackItemCard.tsx"),
            "export const BackpackItemCard = 1;\n");
        await writeFile(join(importRoot, "apps/client/src/ui-uniflex/restored/components/button/ActionButton.tsx"),
            "export const ActionButton = 1;\n");
        await execFileAsync(process.execPath, [
            resolve(root, "scripts/import-uniflex-package.mjs"),
            "--update", "--name", "BackpackItemCard", "--out", importRoot, packageDir,
        ], { cwd: root });
        const restored = join(importRoot, "apps/client/src/ui-uniflex/restored");
        assert.equal(await readFile(join(restored, "pages/Backpack/components/BackpackItemCard.tsx"), "utf8"),
            "export const BackpackItemCard = 1;\n");
        assert.equal(await readFile(join(restored, "components/button/ActionButton.tsx"), "utf8"),
            "export const ActionButton = 1;\n");
        assert.equal(await access(join(importRoot, "apps/client/src/ui-uniflex/modules/BackpackItemCard"))
            .then(() => true).catch(() => false), false);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("editing BackpackItemCard PSD overlays the shared restored copy and leaves originals", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const psdPath = artComponentPsdPath(root, "BackpackItemCard");
    await access(psdPath);
    const converterRequire = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    const { createCanvas } = converterRequire("@napi-rs/canvas");
    const { initializeCanvas, readPsd, writePsdBuffer } = converterRequire("ag-psd");
    initializeCanvas(createCanvas);
    function findPlaced(layer) {
        if (layer.placedLayer) return layer;
        for (const child of layer.children || []) {
            const found = findPlaced(child);
            if (found) return found;
        }
        return null;
    }
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-card-component-edit-"));
    try {
        const psd = readPsd(await readFile(psdPath), { useImageData: true });
        const slot = findPlaced(psd);
        assert.ok(slot, "BackpackItemCard.psd should link ItemSlot as a placed smart object");
        const dx = 8;
        slot.left += dx;
        slot.right += dx;
        slot.placedLayer.transform = slot.placedLayer.transform.map((value, index) =>
            index % 2 === 0 ? value + dx : value);
        const edited = join(tempRoot, "component.psd");
        await writeFile(edited, writePsdBuffer(psd));
        const designDir = join(tempRoot, "design");
        const packageDir = join(tempRoot, "package");
        const importRoot = join(tempRoot, "import");
        await execFileAsync(converter.command, [
            ...converter.args, "psd-import", "--file", edited, "--out", designDir,
        ], { cwd: root, env });
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "BackpackItemCard", "--source-root", root, "--out", packageDir,
        ], { cwd: root, env });
        const overlayed = await readFile(
            join(packageDir, "restored/modules/backpack/Backpack/components/BackpackItemCard.tsx"), "utf8");
        assert.match(overlayed, /<ItemSlot theme=\{p\.theme\} left=\{8\} top=\{0\}/);
        assert.match(overlayed, /gamecomponents\/item\/ItemSlot'/);
        const original = await readFile(
            resolve(root, "apps/client/src/ui-uniflex/modules/backpack/Backpack/components/BackpackItemCard.tsx"),
            "utf8");
        assert.match(original, /<ItemSlot theme=\{p\.theme\} left=\{0\} top=\{0\}/);
        await execFileAsync(process.execPath, [
            resolve(root, "scripts/import-uniflex-package.mjs"),
            "--update", "--name", "BackpackItemCard", "--out", importRoot, packageDir,
        ], { cwd: root });
        assert.equal(await readFile(join(importRoot,
            "apps/client/src/ui-uniflex/restored/modules/backpack/Backpack/components/BackpackItemCard.tsx"),
        "utf8"), overlayed);
        assert.equal(await access(join(importRoot,
            "apps/client/src/ui-uniflex/modules/BackpackItemCard")).then(() => true).catch(() => false),
            false);
        assert.match(await readFile(
            resolve(root, "apps/client/src/ui-uniflex/modules/backpack/Backpack/components/BackpackItemCard.tsx"),
            "utf8"), /<ItemSlot theme=\{p\.theme\} left=\{0\} top=\{0\}/);
        assert.match(await readFile(
            resolve(root, "apps/client/src/ui-uniflex/modules/backpack/Backpack/Backpack.tsx"), "utf8"),
            /from '\.\/components\/BackpackItemCard'/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("editing Confirm PSD text rewrites ?? fallbacks and reports pure bindings", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const psdPath = artPsdPath(root, { componentName: "Confirm" });
    await access(psdPath);
    const converterRequire = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    const { createCanvas } = converterRequire("@napi-rs/canvas");
    const { initializeCanvas, readPsd, writePsdBuffer } = converterRequire("ag-psd");
    initializeCanvas(createCanvas);
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-confirm-text-edit-"));
    try {
        const psd = readPsd(await readFile(psdPath), { useImageData: true });
        const title = findTextLayer(psd, "PopupFrame/Title");
        const message = findTextLayer(psd, "Confirm/Message");
        assert.ok(title && message, "Confirm.psd should keep editable Title/Message text layers");
        // Glyphs are reused from the original art so the font coverage check passes.
        title.text.text = "UniFlex 本地预览";
        message.text.text = "本地运行预览";
        const edited = join(tempRoot, "screen.psd");
        await writeFile(edited, writePsdBuffer(psd));
        const designDir = join(tempRoot, "design");
        const packageDir = join(tempRoot, "package");
        await execFileAsync(converter.command, [
            ...converter.args, "psd-import", "--file", edited, "--out", designDir,
            "--font-dir", resolve(root, "apps/art/uniflex/fonts"),
        ], { cwd: root, env });
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "ConfirmRestored", "--source-root", root, "--out", packageDir,
        ], { cwd: root, env });
        const restored = await readFile(join(packageDir, "ConfirmRestored.authoring.tsx"), "utf8");
        assert.match(restored, /title=\{params\.title \?\? "UniFlex 本地预览"\}/);
        assert.match(restored, /value=\{params\.message\}/);
        assert.ok(!restored.includes("本地运行预览"),
            "pure binding without a ?? fallback must not be rewritten");
        const report = await readFile(join(packageDir, "IMPORT.md"), "utf8");
        assert.match(report, /Text and style write-back/);
        assert.match(report, /fallback: .*PopupFrame\.title/);
        // Confirm/Message is now rendered through AbsoluteThemeText, so the raw
        // <text> write-back cannot locate a tag and degrades to not-found.
        assert.match(report, /not-found: .*ConfirmRestored\/Message\.value/);
        assert.match(await readFile(
            resolve(root, "apps/client/src/ui-uniflex/modules/popup/Confirm/Confirm.tsx"), "utf8"),
            /title=\{params\.title \?\? '提示'\}/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("editing ActionButton PSD text skips pure prop bindings and reports them", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const psdPath = artComponentPsdPath(root, "ActionButton");
    await access(psdPath);
    const converterRequire = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    const { createCanvas } = converterRequire("@napi-rs/canvas");
    const { initializeCanvas, readPsd, writePsdBuffer } = converterRequire("ag-psd");
    initializeCanvas(createCanvas);
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-action-button-text-edit-"));
    try {
        const psd = readPsd(await readFile(psdPath), { useImageData: true });
        const label = findTextLayer(psd, "ActionButton/IconLabel");
        assert.ok(label, "ActionButton.psd should keep the IconLabel text layer editable");
        label.text.text = "2000";
        const edited = join(tempRoot, "component.psd");
        await writeFile(edited, writePsdBuffer(psd));
        const designDir = join(tempRoot, "design");
        const packageDir = join(tempRoot, "package");
        await execFileAsync(converter.command, [
            ...converter.args, "psd-import", "--file", edited, "--out", designDir,
            "--font-dir", resolve(root, "apps/art/uniflex/fonts"),
        ], { cwd: root, env });
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "ActionButton", "--source-root", root, "--out", packageDir,
        ], { cwd: root, env });
        const restored = await readFile(
            join(packageDir, "restored/components/button/ActionButton.tsx"), "utf8");
        assert.match(restored, /name="ActionButton\/IconLabel" value=\{p\.label\}/);
        assert.ok(!restored.includes("2000"),
            "value={p.label} has no ?? fallback and must stay untouched");
        const report = await readFile(join(packageDir, "IMPORT.md"), "utf8");
        assert.match(report, /bound: .*ActionButton\/IconLabel\.value/);
        const original = await readFile(
            resolve(root, "apps/client/src/ui-uniflex/components/button/ActionButton.tsx"), "utf8");
        assert.match(original, /name="ActionButton\/IconLabel" value=\{p\.label\}/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("edited For list item text lands in the defaultItems object literals", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-for-text-edit-"));
    try {
        const pageDir = join(tempRoot, "apps/client/src/ui-uniflex/pages/Rows");
        const packageDir = join(tempRoot, "package");
        const designDir = join(tempRoot, "design");
        await mkdir(pageDir, { recursive: true });
        await mkdir(join(designDir, "fonts"), { recursive: true });
        const font = await readFile(
            resolve(root, "apps/art/uniflex/fonts/1846353947485b97-0-400.ttf"));
        await writeFile(join(designDir, "fonts/regular.ttf"), font);
        const fontSha = createHash("sha256").update(font).digest("hex");
        await writeFile(join(pageDir, "Row.tsx"), `import { defineComponent } from '@uniflex/compiler';
export const Row = defineComponent((p) => (
    <view name="Row">
        <text name="Row/Title" value={p.title} style={{}} />
    </view>
));
`);
        await writeFile(join(pageDir, "RowsPanel.tsx"), `import { defineComponent, For } from '@uniflex/compiler';
import { Row } from './Row';
export const DEFAULT_ROWS = [
    { id: 'r0', title: '旧标题零' },
    { id: 'r1', title: '旧标题一' },
];
export const RowsPanel = defineComponent((p) => {
    const rows = p.rows ?? DEFAULT_ROWS;
    return (
        <view name="RowsPanel">
            <For each={rows} key="id">
                {(row) => <Row title={row.title} />}
            </For>
        </view>
    );
});
`);
        await writeFile(join(pageDir, "Rows.tsx"), `import { defineView } from '@uniflex/compiler';
import { RowsPanel } from './RowsPanel';
export const Rows = defineView(() => (
    <view name="RowsPage">
        <RowsPanel />
    </view>
));
`);
        const frame = { x: 0, y: 0, width: 750, height: 1624 };
        const textNode = (id, key, value) => ({
            id, name: "Row/Title", kind: "text",
            frame: { x: 0, y: 0, width: 200, height: 40 }, opacity: 1, visible: true,
            text: {
                value, fontId: "font-regular", size: 20, lineHeight: 24,
                align: "left", wrap: false, color: "#ffffff",
                outlineWidth: 0, outlineColor: "#000000",
            },
            identity: { key, role: "node", definitionKey: "Row" },
        });
        const rowNode = (id, index, textId) => ({
            id, name: "Row", kind: "group",
            frame: { x: 0, y: index * 100, width: 750, height: 100 }, opacity: 1, visible: true,
            children: [textId],
            identity: {
                key: `Row:Rows/RowsPanel/Row:${index}`, role: "component", definitionKey: "Row",
            },
        });
        await writeFile(join(designDir, "design.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-design", canvas: { width: 750, height: 1624 },
            roots: ["page"], assets: {},
            fonts: { "font-regular": { path: "fonts/regular.ttf", sha256: fontSha, weight: 400 } },
            nodes: {
                page: {
                    id: "page", name: "RowsPage", kind: "group", frame,
                    opacity: 1, visible: true, children: ["panel"],
                    identity: { key: "Rows.root", role: "page", definitionKey: "Rows" },
                },
                panel: {
                    id: "panel", name: "RowsPanel", kind: "group", frame,
                    opacity: 1, visible: true, children: ["row0", "row1"],
                    identity: {
                        key: "RowsPanel:Rows/RowsPanel", role: "component",
                        definitionKey: "RowsPanel",
                    },
                },
                row0: rowNode("row0", 0, "text0"),
                text0: textNode("text0", "Row:Rows/RowsPanel/Row:0/Row/Title", "新标题零"),
                row1: rowNode("row1", 1, "text1"),
                text1: textNode("text1", "Row:Rows/RowsPanel/Row:1/Row/Title", "新标题一"),
            },
        }));
        await writeFile(join(designDir, "component-declarations.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-component-declarations",
            definitions: [
                { key: "Rows", source: "apps/client/src/ui-uniflex/pages/Rows/Rows.tsx" },
                { key: "RowsPanel", source: "apps/client/src/ui-uniflex/pages/Rows/RowsPanel.tsx" },
                { key: "Row", source: "apps/client/src/ui-uniflex/pages/Rows/Row.tsx" },
            ],
            instances: [
                { key: "Rows.root", definitionKey: "Rows", role: "page", rootRecordId: 1 },
                { key: "RowsPanel:Rows/RowsPanel", definitionKey: "RowsPanel", role: "component", rootRecordId: 2 },
                { key: "Row:Rows/RowsPanel/Row:0", definitionKey: "Row", role: "component", rootRecordId: 3 },
                { key: "Row:Rows/RowsPanel/Row:1", definitionKey: "Row", role: "component", rootRecordId: 4 },
            ],
        }));
        await writeFile(join(designDir, "uniflex-export-baseline.json"), JSON.stringify({
            kind: "uniflex-design-snapshot", schemaVersion: 1,
            canvas: { width: 750, height: 1624 },
            nodes: [
                {
                    id: 101, kind: "text", name: "Row/Title", value: "旧标题零",
                    identity: { key: "Row:Rows/RowsPanel/Row:0/Row/Title", role: "node" },
                },
                {
                    id: 102, kind: "text", name: "Row/Title", value: "旧标题一",
                    identity: { key: "Row:Rows/RowsPanel/Row:1/Row/Title", role: "node" },
                },
            ],
        }));
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "RowsRestored", "--source-root", tempRoot, "--out", packageDir,
        ], { cwd: root, env });
        const panel = await readFile(
            join(packageDir, "restored/pages/Rows/RowsPanel.tsx"), "utf8");
        assert.match(panel, /\{ id: 'r0', title: "新标题零" \}/);
        assert.match(panel, /\{ id: 'r1', title: "新标题一" \}/);
        const report = await readFile(join(packageDir, "IMPORT.md"), "utf8");
        assert.match(report, /item-field: .*Row:0\.title/);
        assert.match(report, /item-field: .*Row:1\.title/);
        const original = await readFile(join(pageDir, "RowsPanel.tsx"), "utf8");
        assert.match(original, /title: '旧标题零'/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("PSD typography, opacity and fill color write back component props and style", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const converterRequire = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    const { createCanvas } = converterRequire("@napi-rs/canvas");
    const { initializeCanvas, readPsd, writePsdBuffer } = converterRequire("ag-psd");
    initializeCanvas(createCanvas);
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-style-edit-"));
    try {
        // Typography + opacity on the expanded PopupFrame instance of the Confirm page.
        const confirmPsd = readPsd(await readFile(
            artPsdPath(root, { componentName: "Confirm" })), { useImageData: true });
        const popupFrame = findLayer(confirmPsd, (layer) => layer.children
            && String(layer.name || "").startsWith("PopupFrame"));
        const title = findLayer(popupFrame, (layer) => layer.text
            && String(layer.name || "").startsWith("PopupFrame/Title"));
        assert.ok(title?.text, "PopupFrame/Title should stay editable");
        title.text.paragraphStyle.justification = "right";
        title.text.style.leading = 48;
        title.text.style.fauxBold = false;
        popupFrame.opacity = 0.6;
        const editedConfirm = join(tempRoot, "confirm.psd");
        await writeFile(editedConfirm, writePsdBuffer(confirmPsd));
        const confirmDesign = join(tempRoot, "confirm-design");
        await execFileAsync(converter.command, [
            ...converter.args, "psd-import", "--file", editedConfirm, "--out", confirmDesign,
            "--font-dir", resolve(root, "apps/art/uniflex/fonts"),
        ], { cwd: root, env });

        const pageSource = `import { defineView } from '@uniflex/compiler';
export const Confirm = defineView(() => (
    <view name="Confirm" style={{ width: 750, height: 1624 }}>
        <PopupFrame title="提示" />
    </view>
));
`;
        const popupFrameSource = (declared) => `import { defineComponent } from '@uniflex/compiler';
export interface PopupFrameProps {
    readonly title: string;${declared ? `
    readonly titleAlign?: string;
    readonly titleLineHeight?: number;
    readonly titleBold?: boolean;
    readonly opacity?: number;` : ""}
}
export const PopupFrame = defineComponent<PopupFrameProps>((p) => (
    <view name="PopupFrame" style={{ position: 'relative' }}>
        <text name="PopupFrame/Title" value={p.title} style={{ position: 'absolute', left: 90, top: 18, width: 528, height: 58, fontSize: 40, color: '#ffffff', outlineColor: '#593d84', outlineWidth: 2, horizontalAlign: 'center', lineHeight: 40, bold: true }} />
    </view>
));
`;
        const stageSource = async (declared) => {
            const sourceRoot = join(tempRoot, declared ? "src-full" : "src-min");
            const base = join(sourceRoot, "apps/client/src/ui-uniflex");
            await mkdir(join(base, "modules/popup/Confirm"), { recursive: true });
            await mkdir(join(base, "components/popup"), { recursive: true });
            await writeFile(join(base, "modules/popup/Confirm/Confirm.tsx"), pageSource);
            await writeFile(join(base, "components/popup/PopupFrame.tsx"), popupFrameSource(declared));
            return sourceRoot;
        };
        const runConfirmPackage = async (sourceRoot, outDir) => {
            await execFileAsync(converter.command, [
                ...converter.args, "uniflex-package", "--design", join(confirmDesign, "design.json"),
                "--name", "ConfirmRestored", "--source-root", sourceRoot, "--out", outDir,
            ], { cwd: root, env });
            return {
                authoring: await readFile(join(outDir, "ConfirmRestored.authoring.tsx"), "utf8"),
                report: await readFile(join(outDir, "IMPORT.md"), "utf8"),
            };
        };
        const full = await runConfirmPackage(await stageSource(true), join(tempRoot, "pkg-full"));
        assert.match(full.authoring, /opacity=\{0\.6\}/);
        assert.match(full.authoring, /titleAlign=\{"right"\}/);
        assert.match(full.authoring, /titleLineHeight=\{48\}/);
        assert.match(full.authoring, /titleBold=\{false\}/);
        assert.match(full.report, /applied: .*PopupFrame\.opacity/);
        assert.match(full.report, /applied: .*PopupFrame\.titleAlign/);
        assert.match(full.report, /applied: .*PopupFrame\.titleLineHeight/);
        assert.match(full.report, /applied: .*PopupFrame\.titleBold/);
        const min = await runConfirmPackage(await stageSource(false), join(tempRoot, "pkg-min"));
        assert.doesNotMatch(min.authoring, /titleAlign=|titleLineHeight=|titleBold=|opacity=\{0\.6\}/);
        assert.match(min.report, /undeclared: .*PopupFrame\.titleAlign/);
        assert.match(min.report, /undeclared: .*PopupFrame\.titleLineHeight/);
        assert.match(min.report, /undeclared: .*PopupFrame\.titleBold/);
        assert.match(min.report, /undeclared: .*PopupFrame\.opacity/);

        // Uniform fill repaint writes backgroundColor into the real page root view.
        const mailPsd = readPsd(await readFile(
            artPsdPath(root, { componentName: "MailBattleReport" })), { useImageData: true });
        const pageFill = findLayer(mailPsd, (layer) => !layer.children
            && String(layer.name || "").startsWith("MailBattleReport / fill"));
        const anonFill = findLayer(mailPsd, (layer) => !layer.children
            && String(layer.name || "").startsWith("Background / fill"));
        assert.ok(pageFill && anonFill, "mail page should keep both fill layers");
        repaintLayer(pageFill, createCanvas, (g, w, h) => {
            g.fillStyle = "#112233";
            g.fillRect(0, 0, w, h);
        });
        repaintLayer(anonFill, createCanvas, (g, w, h) => {
            g.fillStyle = "#AABBCC";
            g.fillRect(0, 0, w, h);
        });
        const editedMail = join(tempRoot, "mail.psd");
        await writeFile(editedMail, writePsdBuffer(mailPsd));
        const mailDesign = join(tempRoot, "mail-design");
        await execFileAsync(converter.command, [
            ...converter.args, "psd-import", "--file", editedMail, "--out", mailDesign,
            "--font-dir", resolve(root, "apps/art/uniflex/fonts"),
        ], { cwd: root, env });
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(mailDesign, "design.json"),
            "--name", "MailBattleReportRestored", "--source-root", root,
            "--out", join(tempRoot, "pkg-mail"),
        ], { cwd: root, env });
        const mailAuthoring = await readFile(
            join(tempRoot, "pkg-mail/MailBattleReportRestored.authoring.tsx"), "utf8");
        assert.match(mailAuthoring, /backgroundColor: "#112233"/);
        const mailReport = await readFile(join(tempRoot, "pkg-mail/IMPORT.md"), "utf8");
        assert.match(mailReport, /style: .*MailBattleReportRestored\.backgroundColor/);
        assert.match(mailReport,
            /not-found: .*MailBattleReport\.root\/_:0\.backgroundColor/);
        assert.doesNotMatch(await readFile(
            resolve(root, "apps/client/src/ui-uniflex/modules/mail/MailBattleReport/MailBattleReport.tsx"),
            "utf8"), /#112233/i, "the original page source must stay untouched");
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("repainting a fill non-uniformly keeps the bitmap swap path", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const psdPath = artPsdPath(root, { componentName: "MailBattleReport" });
    await access(psdPath);
    const converterRequire = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    const { createCanvas } = converterRequire("@napi-rs/canvas");
    const { initializeCanvas, readPsd, writePsdBuffer } = converterRequire("ag-psd");
    initializeCanvas(createCanvas);
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-fill-split-"));
    try {
        const psd = readPsd(await readFile(psdPath), { useImageData: true });
        const pageFill = findLayer(psd, (layer) => !layer.children
            && String(layer.name || "").startsWith("MailBattleReport / fill"));
        assert.ok(pageFill, "page root fill layer should exist");
        repaintLayer(pageFill, createCanvas, (g, w, h) => {
            g.fillStyle = "#112233";
            g.fillRect(0, 0, w / 2, h);
            g.fillStyle = "#445566";
            g.fillRect(w / 2, 0, w - w / 2, h);
        });
        const edited = join(tempRoot, "screen.psd");
        await writeFile(edited, writePsdBuffer(psd));
        const designDir = join(tempRoot, "design");
        await execFileAsync(converter.command, [
            ...converter.args, "psd-import", "--file", edited, "--out", designDir,
            "--font-dir", resolve(root, "apps/art/uniflex/fonts"),
        ], { cwd: root, env });
        const design = JSON.parse(await readFile(join(designDir, "design.json"), "utf8"));
        const fill = Object.values(design.nodes).find((node) =>
            node.identity?.role === "fill" && node.identity.key === "MailBattleReport.root");
        assert.ok(fill, "fill node should exist in the design");
        assert.equal(fill.identity.imageChanged, true, "non-uniform fill stays a bitmap swap");
        assert.equal(fill.identity.fillColor, undefined);
        const sourceRoot = join(tempRoot, "src");
        const base = join(sourceRoot, "apps/client/src/ui-uniflex/pages/MailBattleReport");
        await mkdir(base, { recursive: true });
        await writeFile(join(base, "MailBattleReport.tsx"), `import { defineView } from '@uniflex/compiler';
export const MailBattleReport = defineView(() => (
    <view name="MailBattleReport" style={{ width: 750, height: 1334, backgroundColor: '#F3EFE9' }} />
));
`);
        const packageDir = join(tempRoot, "package");
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "MailBattleReportRestored", "--source-root", sourceRoot, "--out", packageDir,
        ], { cwd: root, env });
        const authoring = await readFile(
            join(packageDir, "MailBattleReportRestored.authoring.tsx"), "utf8");
        assert.doesNotMatch(authoring, /#112233|#445566/i);
        const report = await readFile(join(packageDir, "IMPORT.md"), "utf8");
        assert.doesNotMatch(report, /backgroundColor/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("native named node opacity writes into the style object", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-native-opacity-"));
    try {
        const pageDir = join(tempRoot, "apps/client/src/ui-uniflex/pages/Cards");
        const designDir = join(tempRoot, "design");
        const packageDir = join(tempRoot, "package");
        await mkdir(pageDir, { recursive: true });
        await mkdir(designDir, { recursive: true });
        await writeFile(join(pageDir, "Cards.tsx"), `import { defineView } from '@uniflex/compiler';
export const Cards = defineView(() => (
    <view name="Cards" style={{ width: 750, height: 1624 }}>
        <view name="Cards/Card" style={{ position: 'absolute', left: 0, top: 0, width: 100, height: 100 }} />
    </view>
));
`);
        const frame = { x: 0, y: 0, width: 750, height: 1624 };
        await writeFile(join(designDir, "design.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-design", canvas: { width: 750, height: 1624 },
            roots: ["page"], assets: {}, fonts: {},
            nodes: {
                page: {
                    id: "page", name: "Cards", kind: "group", frame,
                    opacity: 1, visible: true, children: ["card"],
                    identity: { key: "Cards.root", role: "page", definitionKey: "Cards" },
                },
                card: {
                    id: "card", name: "Cards/Card", kind: "group",
                    frame: { x: 0, y: 0, width: 100, height: 100 },
                    opacity: 0.5, visible: true, children: [],
                    identity: { key: "Cards.root/Cards/Card", role: "node", definitionKey: "Cards" },
                },
            },
        }));
        await writeFile(join(designDir, "component-declarations.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-component-declarations",
            definitions: [
                { key: "Cards", source: "apps/client/src/ui-uniflex/pages/Cards/Cards.tsx" },
            ],
            instances: [
                { key: "Cards.root", definitionKey: "Cards", role: "page", rootRecordId: 1 },
            ],
        }));
        await writeFile(join(designDir, "uniflex-export-baseline.json"), JSON.stringify({
            kind: "uniflex-design-snapshot", schemaVersion: 1,
            canvas: { width: 750, height: 1624 },
            nodes: [
                {
                    id: 1, kind: "view", name: "Cards/Card",
                    identity: { key: "Cards.root/Cards/Card", role: "node" },
                },
            ],
        }));
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "CardsRestored", "--source-root", tempRoot, "--out", packageDir,
        ], { cwd: root, env });
        const restored = await readFile(join(packageDir, "CardsRestored.authoring.tsx"), "utf8");
        assert.match(restored,
            /<view name="CardsRestored\/Card" style=\{\{ position: 'absolute', left: 0, top: 0, width: 100, height: 100, opacity: 0\.5 \}\} \/>/);
        const report = await readFile(join(packageDir, "IMPORT.md"), "utf8");
        assert.match(report, /style: .*CardsRestored\/Card\.opacity/);
        assert.match(await readFile(join(pageDir, "Cards.tsx"), "utf8"),
            /width: 100, height: 100 \}\}/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

const CONFIRM_FIXTURE_PAGE = `import { defineView } from '@uniflex/compiler';
import { CancelButton } from '../../../components/button/CancelButton';
import { ConfirmButton } from '../../../components/button/ConfirmButton';

export const Confirm = defineView((context) => {
    const params = context.params;
    return (
        <view name="Confirm" style={{ width: 750, height: 1624 }}>
            <text name="Confirm/Message" value={params.content} style={{}} />
            <CancelButton label="取消" />
            <ConfirmButton label={params.yesText ?? '确定'} onClick={() => params.yes()} />
        </view>
    );
});
`;

const CONFIRM_FIXTURE_BUTTONS = {
    "CancelButton.tsx": `import { defineComponent } from '@uniflex/compiler';
export interface CancelButtonProps {
    readonly label: string;
    readonly tone: string;
    readonly onClick?: () => void;
}
export const CancelButton = defineComponent<CancelButtonProps>((p) => (
    <view name="CancelButton" style={{ position: 'relative' }}><text name="CancelButton/Label" value={p.label} style={{}} /></view>
));
`,
    "ConfirmButton.tsx": `import { defineComponent } from '@uniflex/compiler';
export interface ConfirmButtonProps {
    readonly label: string;
    readonly onClick?: () => void;
}
export const ConfirmButton = defineComponent<ConfirmButtonProps>((p) => (
    <view name="ConfirmButton" style={{ position: 'relative' }}><text name="ConfirmButton/Label" value={p.label} style={{}} /></view>
));
`,
};

async function stageConfirmFixture(sourceRoot) {
    const base = join(sourceRoot, "apps/client/src/ui-uniflex");
    await mkdir(join(base, "modules/popup/Confirm"), { recursive: true });
    await mkdir(join(base, "components/button"), { recursive: true });
    await writeFile(join(base, "modules/popup/Confirm/Confirm.tsx"), CONFIRM_FIXTURE_PAGE);
    for (const [file, text] of Object.entries(CONFIRM_FIXTURE_BUTTONS)) {
        await writeFile(join(base, "components/button", file), text);
    }
}

async function runConfirmTextRound(converter, env, root, tempRoot, edited, sourceRoot) {
    const designDir = join(tempRoot, "design");
    const packageDir = join(tempRoot, "package");
    await execFileAsync(converter.command, [
        ...converter.args, "psd-import", "--file", edited, "--out", designDir,
        "--font-dir", resolve(root, "apps/art/uniflex/fonts"),
    ], { cwd: root, env });
    await execFileAsync(converter.command, [
        ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
        "--name", "ConfirmRestored", "--source-root", sourceRoot, "--out", packageDir,
    ], { cwd: root, env });
    return {
        authoring: await readFile(join(packageDir, "ConfirmRestored.authoring.tsx"), "utf8"),
        report: await readFile(join(packageDir, "IMPORT.md"), "utf8"),
    };
}

test("deleting PSD component instances and named nodes removes TSX tags with gates", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const psdPath = artPsdPath(root, { componentName: "Confirm" });
    await access(psdPath);
    const converterRequire = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    const { createCanvas } = converterRequire("@napi-rs/canvas");
    const { initializeCanvas, readPsd, writePsdBuffer } = converterRequire("ag-psd");
    initializeCanvas(createCanvas);
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-remove-"));
    try {
        const psd = readPsd(await readFile(psdPath), { useImageData: true });
        assert.equal(removeLayer(psd, (l) => String(l.name || "").startsWith("CancelButton")), true);
        assert.equal(removeLayer(psd, (l) => String(l.name || "").startsWith("ConfirmButton")), true);
        assert.equal(removeLayer(psd, (l) => String(l.name || "").startsWith("Confirm/Message")), true);
        const edited = join(tempRoot, "screen.psd");
        await writeFile(edited, writePsdBuffer(psd));
        const sourceRoot = join(tempRoot, "src");
        await stageConfirmFixture(sourceRoot);
        const { authoring, report } = await runConfirmTextRound(
            converter, env, root, tempRoot, edited, sourceRoot);
        assert.doesNotMatch(authoring, /<CancelButton/);
        assert.match(authoring, /ConfirmRestored\/Message/);
        assert.match(authoring, /<ConfirmButton label=\{params\.yesText \?\? '确定'\}/);
        assert.doesNotMatch(authoring, /import \{ CancelButton \}/);
        assert.match(authoring, /import \{ ConfirmButton \}/);
        assert.match(report, /removed: .*CancelButton\.remove/);
        assert.match(report, /blocked: .*ConfirmRestored\/Message\.remove \[non-constant prop value\]/);
        assert.match(report, /blocked: .*ConfirmButton\.remove \[event-binding\]/);
        const fixture = await readFile(
            join(sourceRoot, "apps/client/src/ui-uniflex/modules/popup/Confirm/Confirm.tsx"), "utf8");
        assert.equal(fixture, CONFIRM_FIXTURE_PAGE);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("swapping a smart object to another catalog component renames the tag", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const psdPath = artPsdPath(root, { componentName: "Confirm" });
    await access(psdPath);
    const converterRequire = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    const { createCanvas } = converterRequire("@napi-rs/canvas");
    const { initializeCanvas, readPsd, writePsdBuffer } = converterRequire("ag-psd");
    initializeCanvas(createCanvas);
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-swap-"));
    try {
        const psd = readPsd(await readFile(psdPath), { useImageData: true });
        const button = findLayer(psd, (l) => String(l.name || "").startsWith("ConfirmButton"));
        assert.ok(button?.placedLayer, "ConfirmButton should be a linked smart object");
        button.placedLayer.id = linkedFileGuid("uniflex-component:CancelButton");
        const edited = join(tempRoot, "screen.psd");
        await writeFile(edited, writePsdBuffer(psd));
        const sourceRoot = join(tempRoot, "src");
        await stageConfirmFixture(sourceRoot);
        const { authoring, report } = await runConfirmTextRound(
            converter, env, root, tempRoot, edited, sourceRoot);
        assert.match(authoring,
            /<CancelButton label=\{params\.yesText \?\? '确定'\} onClick=\{\(\) => params\.yes\(\)\} \/>/);
        assert.doesNotMatch(authoring, /<ConfirmButton/);
        assert.doesNotMatch(authoring, /import \{ ConfirmButton \}/);
        assert.match(authoring, /import \{ CancelButton \}/);
        assert.match(report, /swapped: .*ConfirmButton\.swap/);
        assert.match(report, /missing-required: .*CancelButton\.tone/);
        const fixture = await readFile(
            join(sourceRoot, "apps/client/src/ui-uniflex/modules/popup/Confirm/Confirm.tsx"), "utf8");
        assert.equal(fixture, CONFIRM_FIXTURE_PAGE);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("restored copies retarget themes and keep sibling component imports", async () => {
    const { rewriteRestoredExternalImports } = await import(
        "../node_modules/web-ui-to-psd/lib/uniflex-page-source.mjs");
    const source = [
        "import { CloseButton } from '../button/CloseButton';",
        "import { theme as activeTheme } from '../../themes/active';",
        "import type { ImageRef } from '../../../kits/uniflex/api/core/index';",
        "",
    ].join("\n");
    const out = rewriteRestoredExternalImports(
        source, "apps/client/src/ui-uniflex/components/popup/PopupFrame.tsx");
    assert.match(out, /from '\.\.\/button\/CloseButton'/);
    assert.match(out, /from '\.\.\/\.\.\/\.\.\/themes\/active'/);
    assert.match(out, /from '\.\.\/\.\.\/\.\.\/\.\.\/kits\/uniflex\/api\/core\/index'/);
});

test("linking a smart object to a foreign psd reports conflict and keeps the TSX", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const psdPath = artPsdPath(root, { componentName: "Confirm" });
    await access(psdPath);
    const converterRequire = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    const { createCanvas } = converterRequire("@napi-rs/canvas");
    const { initializeCanvas, readPsd, writePsdBuffer } = converterRequire("ag-psd");
    initializeCanvas(createCanvas);
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-swap-conflict-"));
    try {
        const psd = readPsd(await readFile(psdPath), { useImageData: true });
        const button = findLayer(psd, (l) => String(l.name || "").startsWith("ConfirmButton"));
        assert.ok(button?.placedLayer, "ConfirmButton should be a linked smart object");
        button.placedLayer.id = linkedFileGuid("uniflex-component:NoSuchComponent");
        const edited = join(tempRoot, "screen.psd");
        await writeFile(edited, writePsdBuffer(psd));
        const sourceRoot = join(tempRoot, "src");
        await stageConfirmFixture(sourceRoot);
        const { authoring, report } = await runConfirmTextRound(
            converter, env, root, tempRoot, edited, sourceRoot);
        assert.match(authoring, /<ConfirmButton label=\{params\.yesText \?\? '确定'\}/);
        assert.match(authoring, /import \{ ConfirmButton \}/);
        assert.match(report, /conflict: .*ConfirmButton.*\.swap \[foreign-smart-object\]/);
        assert.doesNotMatch(report, /swapped:/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("added PSD layers insert marked pure-visual nodes with resources", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const psdPath = artPsdPath(root, { componentName: "Confirm" });
    await access(psdPath);
    const converterRequire = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    const { createCanvas } = converterRequire("@napi-rs/canvas");
    const { initializeCanvas, readPsd, writePsdBuffer } = converterRequire("ag-psd");
    const ts = createRequire(resolve(root, "package.json"))("typescript");
    initializeCanvas(createCanvas);
    function cloneTextLayer(source, name, text) {
        const copy = JSON.parse(JSON.stringify({
            ...source, children: undefined, canvas: undefined, imageData: undefined,
        }));
        delete copy.id;
        copy.name = name;
        copy.text.text = text;
        return copy;
    }
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-add-"));
    try {
        const psd = readPsd(await readFile(psdPath), { useImageData: true });
        const title = findLayer(psd, (l) => l.text && String(l.name || "").startsWith("PopupFrame/Title"));
        const content = findLayer(psd, (l) => l.children && String(l.name || "").startsWith("Confirm/Content"));
        assert.ok(title && content, "Confirm.psd should keep Title/Content layers");
        content.children.push(cloneTextLayer(title, "Added/Inner", "本地预览"));
        const canvas = createCanvas(50, 50);
        const g = canvas.getContext("2d");
        g.fillStyle = "#224466";
        g.fillRect(0, 0, 50, 50);
        psd.children.push({
            name: "Added/Badge", left: 40, top: 40, right: 90, bottom: 90,
            canvas, imageData: g.getImageData(0, 0, 50, 50),
        });
        const edited = join(tempRoot, "screen.psd");
        await writeFile(edited, writePsdBuffer(psd));
        const designDir = join(tempRoot, "design");
        const packageDir = join(tempRoot, "package");
        await execFileAsync(converter.command, [
            ...converter.args, "psd-import", "--file", edited, "--out", designDir,
            "--font-dir", resolve(root, "apps/art/uniflex/fonts"),
        ], { cwd: root, env });
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "ConfirmRestored", "--source-root", root, "--out", packageDir,
        ], { cwd: root, env });
        const authoring = await readFile(join(packageDir, "ConfirmRestored.authoring.tsx"), "utf8");
        const markers = authoring.match(/data-psd-add="true"/g) || [];
        assert.equal(markers.length, 2, "both added subtrees carry the review marker");
        assert.match(authoring,
            /<text data-psd-add="true" name="Added\/Inner" value=\{"本地预览"\} style=\{\{ position: 'absolute', [^}]*fontSize: 40, [^}]*color: "#ffffff"/);
        assert.match(authoring,
            /<image data-psd-add="true" name="Added\/Badge" style=\{\{ position: 'absolute', left: 40, top: 40, width: 50, height: 50 \}\} source=\{imageRef\("ConfirmRestored-asset-[a-f0-9]+"\)\} \/>/);
        const manifest = JSON.parse(await readFile(join(packageDir, "manifest.json"), "utf8"));
        const addedAsset = manifest.assets.find((asset) => asset.id.startsWith("ConfirmRestored-asset-"));
        assert.ok(addedAsset, "added image pixels land in the package manifest");
        await access(join(packageDir, addedAsset.file));
        const report = await readFile(join(packageDir, "IMPORT.md"), "utf8");
        assert.match(report, /added: .*Confirm\/Content\.text \[pure-visual-needs-review\]/);
        assert.match(report, /added: .*Confirm\.image \[pure-visual-needs-review\]/);
        assert.match(report, /root-fallback: .*Confirm\.add/);
        const original = await readFile(
            resolve(root, "apps/client/src/ui-uniflex/modules/popup/Confirm/Confirm.tsx"), "utf8");
        assert.doesNotMatch(original, /data-psd-add/);
        const transpiled = ts.transpileModule(authoring, {
            compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext },
            reportDiagnostics: true,
        });
        assert.deepEqual((transpiled.diagnostics || []).map((d) => d.code), [],
            "marked TSX stays compilable");
        assert.match(transpiled.outputText, /data-psd-add="true"/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("re-adding an identical layer where one was deleted reports possible-move", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-possible-move-"));
    try {
        const pageDir = join(tempRoot, "apps/client/src/ui-uniflex/pages/Cards");
        const designDir = join(tempRoot, "design");
        const packageDir = join(tempRoot, "package");
        await mkdir(pageDir, { recursive: true });
        await mkdir(join(designDir, "assets"), { recursive: true });
        await writeFile(join(designDir, "assets/pixel.png"), PIXEL_PNG);
        const pixelSha = createHash("sha256").update(PIXEL_PNG).digest("hex");
        const fixture = `import { defineView } from '@uniflex/compiler';
export const Cards = defineView(() => (
    <view name="Cards" style={{ width: 750, height: 1624 }}>
        <image name="Cards/Badge" style={{ position: 'absolute', left: 100, top: 100, width: 50, height: 50 }} source={imageRef('ui/cards/badge')} />
    </view>
));
`;
        await writeFile(join(pageDir, "Cards.tsx"), fixture);
        // The stamped Badge layer is gone from the design; an identical identity-less
        // clone sits at the same box. That is a move, not delete + add.
        await writeFile(join(designDir, "design.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-design", canvas: { width: 750, height: 1624 },
            roots: ["page"], fonts: {},
            assets: { pixel: { path: "assets/pixel.png", sha256: pixelSha, mime: "image/png", width: 1, height: 1 } },
            nodes: {
                page: {
                    id: "page", name: "Cards", kind: "group",
                    frame: { x: 0, y: 0, width: 750, height: 1624 },
                    opacity: 1, visible: true, children: ["clone"],
                    identity: { key: "Cards.root", role: "page", definitionKey: "Cards" },
                },
                clone: {
                    id: "clone", name: "Added/MovedBadge", kind: "image",
                    frame: { x: 100, y: 100, width: 50, height: 50 },
                    opacity: 1, visible: true, asset: "pixel",
                },
            },
        }));
        await writeFile(join(designDir, "component-declarations.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-component-declarations",
            definitions: [
                { key: "Cards", source: "apps/client/src/ui-uniflex/pages/Cards/Cards.tsx" },
            ],
            instances: [
                { key: "Cards.root", definitionKey: "Cards", role: "page", rootRecordId: 1 },
            ],
        }));
        await writeFile(join(designDir, "uniflex-export-baseline.json"), JSON.stringify({
            kind: "uniflex-design-snapshot", schemaVersion: 1,
            canvas: { width: 750, height: 1624 },
            nodes: [
                { id: 1, kind: "view", name: "Cards", identity: { key: "Cards.root", role: "page" } },
                {
                    id: 2, kind: "image", name: "Cards/Badge",
                    identity: { key: "Cards.root/Cards/Badge", role: "node" },
                },
            ],
            ids: {
                "5": {
                    key: "Cards.root/Cards/Badge", role: "node", runtimeRecordId: 2,
                    captureFrame: { x: 100, y: 100, width: 50, height: 50 },
                },
            },
        }));
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "CardsRestored", "--source-root", tempRoot, "--out", packageDir,
        ], { cwd: root, env });
        const authoring = await readFile(join(packageDir, "CardsRestored.authoring.tsx"), "utf8");
        assert.doesNotMatch(authoring, /data-psd-add/);
        assert.match(authoring, /name="CardsRestored\/Badge"/,
            "the existing tag must not be removed either");
        const report = await readFile(join(packageDir, "IMPORT.md"), "utf8");
        assert.match(report, /conflict: .*Added\/MovedBadge\.add \[possible-move\]/);
        assert.doesNotMatch(report, /removed:/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("layers added inside a component instance are skipped", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-add-in-instance-"));
    try {
        const pageDir = join(tempRoot, "apps/client/src/ui-uniflex/pages/Rows");
        const designDir = join(tempRoot, "design");
        const packageDir = join(tempRoot, "package");
        await mkdir(pageDir, { recursive: true });
        await mkdir(join(designDir, "fonts"), { recursive: true });
        const font = await readFile(
            resolve(root, "apps/art/uniflex/fonts/1846353947485b97-0-400.ttf"));
        await writeFile(join(designDir, "fonts/regular.ttf"), font);
        const fontSha = createHash("sha256").update(font).digest("hex");
        await writeFile(join(pageDir, "Row.tsx"), `import { defineComponent } from '@uniflex/compiler';
export const Row = defineComponent((p) => (
    <view name="Row" style={{ position: 'relative' }}>
        <text name="Row/Title" value={p.title} style={{}} />
    </view>
));
`);
        await writeFile(join(pageDir, "Rows.tsx"), `import { defineView } from '@uniflex/compiler';
import { Row } from './Row';
export const Rows = defineView(() => (
    <view name="RowsPage" style={{ width: 750, height: 1624 }}>
        <Row title="旧标题" />
    </view>
));
`);
        const frame = { x: 0, y: 0, width: 750, height: 1624 };
        await writeFile(join(designDir, "design.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-design", canvas: { width: 750, height: 1624 },
            roots: ["page"], assets: {},
            fonts: { "font-regular": { path: "fonts/regular.ttf", sha256: fontSha, weight: 400 } },
            nodes: {
                page: {
                    id: "page", name: "RowsPage", kind: "group", frame,
                    opacity: 1, visible: true, children: ["row"],
                    identity: { key: "Rows.root", role: "page", definitionKey: "Rows" },
                },
                row: {
                    id: "row", name: "Row", kind: "group",
                    frame: { x: 0, y: 0, width: 750, height: 100 },
                    opacity: 1, visible: true, children: ["added"],
                    identity: { key: "Row:Rows/Row:0", role: "component", definitionKey: "Row" },
                },
                added: {
                    id: "added", name: "Added/Inside", kind: "text",
                    frame: { x: 10, y: 10, width: 100, height: 30 },
                    opacity: 1, visible: true,
                    text: {
                        value: "新增文本", fontId: "font-regular", size: 20, lineHeight: 24,
                        align: "left", wrap: false, color: "#ffffff",
                        outlineWidth: 0, outlineColor: "#000000",
                    },
                },
            },
        }));
        await writeFile(join(designDir, "component-declarations.json"), JSON.stringify({
            schemaVersion: 1, kind: "uniflex-component-declarations",
            definitions: [
                { key: "Rows", source: "apps/client/src/ui-uniflex/pages/Rows/Rows.tsx" },
                { key: "Row", source: "apps/client/src/ui-uniflex/pages/Rows/Row.tsx" },
            ],
            instances: [
                { key: "Rows.root", definitionKey: "Rows", role: "page", rootRecordId: 1 },
                { key: "Row:Rows/Row:0", definitionKey: "Row", role: "component", rootRecordId: 2 },
            ],
        }));
        await writeFile(join(designDir, "uniflex-export-baseline.json"), JSON.stringify({
            kind: "uniflex-design-snapshot", schemaVersion: 1,
            canvas: { width: 750, height: 1624 }, nodes: [], ids: {},
        }));
        await execFileAsync(converter.command, [
            ...converter.args, "uniflex-package", "--design", join(designDir, "design.json"),
            "--name", "RowsRestored", "--source-root", tempRoot, "--out", packageDir,
        ], { cwd: root, env });
        const authoring = await readFile(join(packageDir, "RowsRestored.authoring.tsx"), "utf8");
        assert.doesNotMatch(authoring, /data-psd-add/);
        assert.doesNotMatch(authoring, /Inside|inside/,
            "added instance-internal texts must not leak into instance props");
        const report = await readFile(join(packageDir, "IMPORT.md"), "utf8");
        assert.match(report, /skipped: .*Added\/Inside\.add \[inside-instance\]/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("rotated subtrees bake to one bitmap layer; rotated text still throws", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const converterRequire = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    const { chromium } = converterRequire("playwright");
    const { collectUniFlex } = await import(
        resolve(root, "node_modules/web-ui-to-psd/lib/capture.mjs"));
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
        await page.setContent(`<div id="root" data-kind="view" data-name="Page"
            style="position:relative;width:200px;height:200px;background-color:#ffffff">
            <div data-kind="view" data-name="Page/Card"
                style="position:absolute;left:20px;top:20px;width:64px;height:66px;background-color:#ff0000"></div>
            <div data-kind="view" data-name="rot:-29"
                style="position:absolute;left:20px;top:100px;width:64px;height:66px;rotate:-29deg">
                <div data-kind="view" data-name="rot:-29/Inner"
                    style="position:absolute;left:8px;top:8px;width:48px;height:50px;background-color:#00ff00"></div>
            </div>
        </div>`);
        const model = await page.evaluate(collectUniFlex, {
            selector: "#root", fonts: [], inputFallbackFont: undefined, groupNames: {},
        });
        const baked = model.children.find((item) => item.name === "rot:-29");
        assert.ok(baked, "rotated container becomes one capture item");
        assert.equal(baked.kind, "raster");
        assert.equal(baked.children, undefined, "baked subtree flattens to a single layer");
        assert.ok(baked.bake?.marker && baked.bake.clip, "bake carries the screenshot payload");
        assert.ok(baked.rasterBounds.width > 64 && baked.rasterBounds.height > 66,
            "rasterBounds carry the rotated axis-aligned bounding box");
        assert.ok(baked.width === 64 && baked.height === 66,
            "the snapshot-facing box stays the unrotated layout box");
        assert.ok(baked.rasterBounds.x <= baked.x && baked.rasterBounds.y <= baked.y,
            "AABB covers the unrotated box");
        assert.ok(model.warnings.some((w) => /rot:-29.*rotate -29deg/.test(w)),
            "validation warning names the layer and the angle");
        const marked = await page.evaluate(
            () => document.querySelector("[data-wp-bake]")?.dataset.name);
        assert.equal(marked, "rot:-29", "the rotated element keeps its bake marker");

        await page.setContent(`<div id="root" data-kind="view" data-name="Page"
            style="position:relative;width:200px;height:200px;background-color:#ffffff">
            <div data-kind="text" data-name="Page/Label"
                style="position:absolute;left:10px;top:10px;width:80px;height:20px;rotate:10deg">
                <span>hello</span><canvas></canvas>
            </div>
        </div>`);
        await assert.rejects(
            page.evaluate(collectUniFlex, {
                selector: "#root", fonts: [], inputFallbackFont: undefined, groupNames: {},
            }),
            /Unsupported CSS effect/,
            "text with rotate still fails explicitly",
        );
    } finally {
        await browser.close();
    }
});
