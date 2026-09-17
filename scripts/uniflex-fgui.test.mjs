import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fairyId, childId } from "./lib/uniflex-fgui/ids.mjs";
import { toScale9Grid } from "./lib/uniflex-fgui/nine-slice.mjs";
import { parseCssColor, toFguiXmlColor } from "./lib/uniflex-fgui/bytes.mjs";
import { buildProjectIR } from "./lib/uniflex-fgui/ir.mjs";
import { exportFgui } from "./lib/uniflex-fgui/emit.mjs";
import { FAIRYGUI_DOM, verifyFairyguiDomTarball } from "./lib/uniflex-fgui/vendor.mjs";
import { loadImageCatalog } from "./lib/uniflex-fgui/resources.mjs";
import { loadScreenCatalog } from "./lib/uniflex-screens.mjs";
import { parsePackageBin } from "./fgui-roundtrip.mjs";
import { parseFguiComponent } from "../tools/fgui-codegen/parseFgui.ts";
import { runCli } from "./uniflex-ui-cli.mjs";

const root = resolve(import.meta.dirname, "..");
const art = resolve(root, "apps/art/fairygui");

function node(id, parent, name, kind, rect, extra = {}) {
    return { id, parent, name, kind, value: extra.value ?? "", visible: extra.visible !== false, rect, ...extra };
}

function rect(x, y, width, height) {
    return { x, y, width, height };
}

function promptSnapshot() {
    const nodes = [
        node(1, null, "PopupFrame", "view", rect(0, 0, 750, 1624)),
        node(2, 1, "PopupFrame/Mask", "view", rect(0, 0, 750, 1624), { interaction: "press" }),
        node(3, 1, "PopupFrame/Panel", "view", rect(21, 625, 708, 375)),
        node(4, 3, "PopupBackground", "view", rect(21, 625, 708, 375)),
        node(5, 4, "", "image", rect(21, 625, 708, 375), { resourceId: "ui/popup/prompt" }),
        node(6, 4, "", "image", rect(21, 625, 708, 375), { resourceId: "ui/popup/small", visible: false }),
        node(7, 3, "PopupFrame/Title", "text", rect(111, 643, 528, 58), { value: "创建角色" }),
        node(8, 3, "PopupFrame/Content", "view", rect(61, 733, 628, 229)),
        node(9, 8, "Prompt/Content", "view", rect(61, 733, 628, 229)),
        node(10, 9, "Prompt/Message", "text", rect(61, 733, 628, 104), { value: "在该服务器创建1名新角色?" }),
        node(11, 9, "Prompt/Actions", "view", rect(61, 860, 628, 102)),
        node(12, 11, "ConfirmButton", "view", rect(77, 860, 255, 102)),
        node(13, 12, "ActionButton", "view", rect(77, 860, 255, 102), { interaction: "press" }),
        node(14, 13, "ActionButton/Background", "image", rect(77, 860, 255, 102), { resourceId: "ui/button/confirm" }),
        node(15, 13, "ActionButton/Label", "text", rect(85, 864, 239, 86), { value: "确定" }),
        node(16, 13, "ActionButton/IconRow", "view", rect(85, 864, 239, 86), { visible: false }),
        node(17, 16, "ActionButton/Icon", "image", rect(85, 864, 48, 48), { resourceId: "ui/button/confirm" }),
        node(18, 16, "ActionButton/IconLabel", "text", rect(149, 864, 80, 86), { value: "确定" }),
        node(19, 11, "", "view", rect(419, 860, 255, 102)),
        node(20, 19, "CancelButton", "view", rect(419, 860, 255, 102)),
        node(21, 20, "ActionButton", "view", rect(419, 860, 255, 102), { interaction: "press" }),
        node(22, 21, "ActionButton/Background", "image", rect(419, 860, 255, 102), { resourceId: "ui/button/cancel" }),
        node(23, 21, "ActionButton/Label", "text", rect(427, 864, 239, 86), { value: "取消" }),
        node(24, 21, "ActionButton/IconRow", "view", rect(427, 864, 239, 86), { visible: false }),
        node(25, 24, "ActionButton/Icon", "image", rect(427, 864, 48, 48), { resourceId: "ui/button/cancel" }),
        node(26, 24, "ActionButton/IconLabel", "text", rect(491, 864, 80, 86), { value: "取消" }),
        node(27, 3, "CloseButton", "view", rect(642, 631, 72, 72), { interaction: "press" }),
        node(28, 27, "", "image", rect(653, 642, 50, 50), { resourceId: "ui/popup/close" }),
    ];
    return {
        schemaVersion: 1,
        kind: "uniflex-design-snapshot",
        screenId: "prompt",
        canvas: { width: 750, height: 1624 },
        nodes,
    };
}

test("fairyId is stable alphanumeric and does not start with a digit", () => {
    const id = fairyId("pkg:UniFlex_Common");
    assert.match(id, /^[a-z][0-9a-z]{7}$/);
    assert.equal(id, fairyId("pkg:UniFlex_Common"));
    assert.match(childId("Prompt", 0), /^n0_[a-z0-9]{4}$/);
});

test("nine-slice converts UniFlex insets to a FairyGUI center rect", () => {
    assert.deepEqual(toScale9Grid([26, 32, 52, 39], 82, 75), {
        x: 26, y: 32, width: 4, height: 4, attr: "26,32,4,4",
    });
    assert.equal(toScale9Grid(null, 10, 10), null);
    assert.throws(() => toScale9Grid([50, 50, 50, 50], 82, 75), /center is empty/);
});

test("CSS 8-digit colors map to FairyGUI XML AARRGGBB", () => {
    assert.deepEqual(parseCssColor("#00000099"), { r: 0, g: 0, b: 0, a: 0x99 });
    assert.equal(toFguiXmlColor("#00000099", { alpha: true }), "#99000000");
});

test("fairygui-dom tarball is pinned", () => {
    const file = verifyFairyguiDomTarball(root);
    assert.ok(file.endsWith(FAIRYGUI_DOM.tarball.replace("vendor/", "")));
});

test("Prompt fixture compiles a candidate FairyGUI project without touching art/fairygui", async () => {
    const beforeArt = snapshotDir(art);
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const snapshot = promptSnapshot();
        const screen = catalog.screens.find((entry) => entry.id === "prompt");
        const { ir } = await exportFgui({ snapshot, out, root, screen, catalog, images });

        const commonXml = readFileSync(join(out, "assets/UniFlex_Common/package.xml"), "utf8");
        const promptXml = readFileSync(join(out, "assets/UniFlex_Prompt/Prompt.xml"), "utf8");
        const actionXml = readFileSync(join(out, "assets/UniFlex_Common/ActionButton.xml"), "utf8");
        const frameXml = readFileSync(join(out, "assets/UniFlex_Common/PopupFrame.xml"), "utf8");
        const names = ir.packages[0].components.map((item) => item.name).sort();
        assert.deepEqual(names, [
            "ActionButton", "CancelButton", "CloseButton", "ConfirmButton", "PopupBackground", "PopupFrame",
        ]);
        assert.match(promptXml, /name="ConfirmButton"/);
        assert.match(promptXml, /name="CancelButton"/);
        assert.match(promptXml, /name="CloseButton"/);
        assert.match(promptXml, /name="PopupBackground"/);
        assert.match(promptXml, /name="Prompt\/Message"/);
        assert.doesNotMatch(promptXml, /ui\/button\/confirm/);
        assert.match(actionXml, /extention="Button"/);
        assert.match(actionXml, /name="title"/);
        assert.match(actionXml, /name="icon"/);
        assert.doesNotMatch(actionXml, /ActionButton\/IconRow/);
        const cancelXml = readFileSync(join(out, "assets/UniFlex_Common/CancelButton.xml"), "utf8");
        assert.match(cancelXml, /title="取消"/);
        const backgroundXml = readFileSync(join(out, "assets/UniFlex_Common/PopupBackground.xml"), "utf8");
        assert.doesNotMatch(backgroundXml, /small\.png/);
        assert.match(frameXml, /name="PopupFrame\/Content"/);
        assert.doesNotMatch(frameXml, /Prompt\/Message/);
        assert.match(commonXml, /scale="9grid" scale9grid="26,32,4,4"/);

        for (const file of [
            "assets/UniFlex_Common/ActionButton.xml",
            "assets/UniFlex_Common/ConfirmButton.xml",
            "assets/UniFlex_Common/CancelButton.xml",
            "assets/UniFlex_Common/CloseButton.xml",
            "assets/UniFlex_Common/PopupBackground.xml",
            "assets/UniFlex_Common/PopupFrame.xml",
            "assets/UniFlex_Prompt/Prompt.xml",
        ]) {
            const parsed = parseFguiComponent(readFileSync(join(out, file), "utf8"));
            assert.ok(parsed.elements.length >= 1, `${file} has no displayList elements`);
        }

        const ids = new Set();
        for (const pkg of ir.packages) {
            for (const item of [...pkg.images, ...pkg.components]) {
                assert.equal(ids.has(item.id), false, `duplicate id ${item.id}`);
                ids.add(item.id);
            }
        }

        const previewCommon = parsePackageBin(readFileSync(join(out, "preview/UniFlex_Common/package.xml")));
        const previewPrompt = parsePackageBin(readFileSync(join(out, "preview/UniFlex_Prompt/package.xml")));
        assert.equal(previewCommon.name, "UniFlex_Common");
        assert.equal(previewPrompt.name, "UniFlex_Prompt");
        assert.ok(previewCommon.items.some((item) => item.name === "ActionButton" && item.exported));
        assert.ok(previewPrompt.items.some((item) => item.name === "Prompt" && item.exported));
        assert.ok(previewCommon.items.some((item) => item.typeName === "Image"));
        assert.equal(previewPrompt.dependencies[0].id, previewCommon.id);
        assert.ok(existsSync(join(out, "preview/index.html")));
        assert.ok(existsSync(join(out, "preview/fairygui.js")));
        assert.ok(existsSync(join(out, "UniFlexExport.fairy")));
        assert.equal(JSON.parse(readFileSync(join(out, "settings/Publish.json"), "utf8")).path, "");
        assert.equal(JSON.parse(readFileSync(join(out, "report.json"), "utf8")).candidate, true);
        assert.equal(JSON.parse(readFileSync(join(out, "mapping.json"), "utf8")).ActionButton.package, "UniFlex_Common");
        assert.deepEqual(snapshotDir(art), beforeArt);
        assert.equal(out.includes("apps/art/fairygui"), false);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("export-fgui --snapshot does not start Chrome or the PSD converter", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-cli-"));
    const snapshotFile = join(out, "snapshot.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(snapshotFile, JSON.stringify(promptSnapshot()));
    const calls = [];
    try {
        await runCli([
            "export-fgui", "--snapshot", snapshotFile, "--screen", "prompt", "--out", join(out, "fgui"),
        ], {
            root,
            env: {},
            execute: (...args) => { calls.push(args); },
            startPreview: async () => { throw new Error("preview should not start"); },
            readText: (file) => readFileSync(file, "utf8"),
        });
        assert.equal(calls.length, 0);
        assert.ok(existsSync(join(out, "fgui/assets/UniFlex_Prompt/Prompt.xml")));
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("IR rejects a non-snapshot payload", () => {
    assert.throws(() => buildProjectIR({ kind: "nope" }), /uniflex-design-snapshot/);
});

function snapshotDir(dir) {
    if (!existsSync(dir)) return [];
    const walk = (current) => {
        const entries = readdirSync(current, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            const full = join(current, entry.name);
            if (entry.isDirectory()) files.push(...walk(full));
            else files.push(full);
        }
        return files.sort();
    };
    return walk(dir);
}
