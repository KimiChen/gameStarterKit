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
import { artComponentPsdPath } from "./lib/uniflex-art.mjs";

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

test("authoring import replaces leftover dump components instead of merging", {
    skip: available ? false : "pinned web-ui-to-psd package is not installed",
}, async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-replace-authoring-"));
    const designDir = join(tempRoot, "design");
    const packageDir = join(tempRoot, "package");
    const importRoot = join(tempRoot, "import");
    const pageDir = join(importRoot, "apps/client/src/ui-uniflex/pages/Backpack");
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
                { key: "MailBattleReport", source: "apps/client/src/ui-uniflex/pages/MailBattleReport/MailBattleReport.tsx" },
                { key: "MailBattleRow", source: "apps/client/src/ui-uniflex/pages/MailBattleReport/MailBattleRow.tsx" },
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
        const pageDir = join(tempRoot, "apps/client/src/ui-uniflex/pages/AllianceTech");
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
                { key: "AllianceTech", source: "apps/client/src/ui-uniflex/pages/AllianceTech/AllianceTech.tsx" },
                { key: "AllianceTechPanel", source: "apps/client/src/ui-uniflex/pages/AllianceTech/AllianceTechPanel.tsx" },
                { key: "AllianceTechNode", source: "apps/client/src/ui-uniflex/pages/AllianceTech/AllianceTechNode.tsx" },
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
        const panel = await readFile(join(packageDir, "restored/pages/AllianceTech/AllianceTechPanel.tsx"), "utf8");
        assert.match(pageSource, /from '\.\.\/\.\.\/restored\/pages\/AllianceTech\/AllianceTechPanel'/);
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
        assert.equal(await access(join(importRoot, "apps/client/src/ui-uniflex/pages/BackpackItemCard"))
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
            join(packageDir, "restored/pages/Backpack/components/BackpackItemCard.tsx"), "utf8");
        assert.match(overlayed, /<ItemSlot left=\{8\} top=\{0\}/);
        assert.match(overlayed, /from '\.\.\/\.\.\/\.\.\/components\/item\/ItemSlot'/);
        const original = await readFile(
            resolve(root, "apps/client/src/ui-uniflex/pages/Backpack/components/BackpackItemCard.tsx"),
            "utf8");
        assert.match(original, /<ItemSlot left=\{0\} top=\{0\}/);
        await execFileAsync(process.execPath, [
            resolve(root, "scripts/import-uniflex-package.mjs"),
            "--update", "--name", "BackpackItemCard", "--out", importRoot, packageDir,
        ], { cwd: root });
        assert.equal(await readFile(join(importRoot,
            "apps/client/src/ui-uniflex/restored/pages/Backpack/components/BackpackItemCard.tsx"),
        "utf8"), overlayed);
        assert.equal(await access(join(importRoot,
            "apps/client/src/ui-uniflex/pages/BackpackItemCard")).then(() => true).catch(() => false),
            false);
        assert.match(await readFile(
            resolve(root, "apps/client/src/ui-uniflex/pages/Backpack/components/BackpackItemCard.tsx"),
            "utf8"), /<ItemSlot left=\{0\} top=\{0\}/);
        assert.match(await readFile(
            resolve(root, "apps/client/src/ui-uniflex/pages/Backpack/Backpack.tsx"), "utf8"),
            /from '\.\/components\/BackpackItemCard'/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});
