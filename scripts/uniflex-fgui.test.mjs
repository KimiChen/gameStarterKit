import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { test } from "node:test";
import { fairyId, childId } from "./lib/uniflex-fgui/ids.mjs";
import { toScale9Grid } from "./lib/uniflex-fgui/nine-slice.mjs";
import { parseCssColor, toFguiXmlColor } from "./lib/uniflex-fgui/bytes.mjs";
import { buildProjectIR } from "./lib/uniflex-fgui/ir.mjs";
import { exportFgui } from "./lib/uniflex-fgui/emit.mjs";
import { servePreview, resolvePreviewFile } from "./lib/uniflex-fgui/preview.mjs";
import {
    CATALOG_TITLES, catalogIdFor, loadMergedScreens, resolvePreviewGroups,
} from "./lib/uniflex-fgui/catalog.mjs";
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
        assert.doesNotMatch(promptXml, /<graph/);
        assert.doesNotMatch(promptXml, /ui\/button\/confirm/);
        assert.match(actionXml, /extention="Button"/);
        assert.match(actionXml, /name="title"/);
        assert.match(actionXml, /name="icon"/);
        assert.match(actionXml, /sidePair="width-width,height-height"/);
        assert.match(actionXml, /font="UniFlex"/);
        assert.match(actionXml, /strokeSize="4"/);
        assert.doesNotMatch(actionXml, /ActionButton\/IconRow/);
        const cancelXml = readFileSync(join(out, "assets/UniFlex_Common/CancelButton.xml"), "utf8");
        assert.match(cancelXml, /title="取消"/);
        assert.match(cancelXml, /propertyId="3"/);
        const backgroundXml = readFileSync(join(out, "assets/UniFlex_Common/PopupBackground.xml"), "utf8");
        assert.doesNotMatch(backgroundXml, /small\.png/);
        const previewHtml = readFileSync(join(out, "preview/index.html"), "utf8");
        assert.match(previewHtml, /id="ui"/);
        assert.match(previewHtml, /#101318/);
        assert.match(previewHtml, /regular\.ttf/);
        assert.match(previewHtml, /get\("psd"\)/);
        assert.match(previewHtml, /FairyGUI 预览/);
        assert.match(previewHtml, /id="catalog"/);
        assert.match(previewHtml, /提示弹窗/);
        assert.match(previewHtml, />目录</);
        assert.match(previewHtml, /bindLabeled/);
        assert.match(previewHtml, /bindPageInteractions/);
        assert.match(previewHtml, /currentId, go/);
        assert.ok(existsSync(join(out, "preview/regular.ttf")));
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

test("parent-local inspect rects become FairyGUI component-space xy", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-local-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const snapshot = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "prompt",
            canvas: { width: 750, height: 1624 },
            nodes: [
                node(1, null, "PopupFrame", "view", rect(0, 0, 750, 1624)),
                node(2, 1, "PopupFrame/Mask", "view", rect(0, 0, 750, 1624), { interaction: "press" }),
                node(3, 1, "PopupFrame/Panel", "view", rect(21, 625, 708, 375)),
                node(4, 3, "PopupBackground", "view", rect(0, 0, 708, 375)),
                node(5, 4, "", "image", rect(0, 0, 708, 375), { resourceId: "ui/popup/prompt" }),
                node(6, 3, "PopupFrame/Title", "text", rect(90, 18, 528, 58), { value: "创建角色" }),
                node(7, 3, "PopupFrame/Content", "view", rect(40, 108, 628, 229)),
                node(8, 7, "Prompt/Content", "view", rect(0, 0, 628, 229)),
                node(9, 8, "Prompt/Message", "text", rect(0, 0, 628, 104), { value: "在该服务器创建1名新角色?" }),
            ],
        };
        const { ir } = await exportFgui({
            snapshot, out, root,
            screen: catalog.screens.find((entry) => entry.id === "prompt"),
            catalog, images,
        });
        const promptXml = readFileSync(join(out, "assets/UniFlex_Prompt/Prompt.xml"), "utf8");
        assert.match(promptXml, /name="PopupFrame\/Panel" xy="21,625"/);
        assert.match(promptXml, /name="PopupBackground" xy="21,625"/);
        assert.match(promptXml, /name="PopupFrame\/Title" xy="111,643"/);
        assert.match(promptXml, /name="Prompt\/Message" xy="61,733"/);
        assert.equal(ir.screen.componentName, "Prompt");
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

function smallPopupSnapshot() {
    const nodes = [
        node(1, null, "PopupFrame", "view", rect(0, 0, 750, 1624)),
        node(2, 1, "PopupFrame/Mask", "view", rect(0, 0, 750, 1624), { interaction: "press" }),
        node(3, 1, "PopupFrame/Panel", "view", rect(21, 557, 708, 510)),
        node(4, 3, "PopupBackground", "view", rect(21, 557, 708, 510)),
        node(5, 4, "", "image", rect(21, 557, 708, 510), { resourceId: "ui/popup/prompt", visible: false }),
        node(6, 4, "", "image", rect(21, 557, 708, 510), { resourceId: "ui/popup/small" }),
        node(7, 3, "PopupFrame/Title", "text", rect(111, 575, 528, 58), { value: "标题" }),
        node(8, 3, "PopupFrame/Content", "view", rect(61, 665, 628, 364)),
        node(9, 8, "SmallPopup/Content", "view", rect(61, 665, 628, 364)),
        node(10, 3, "CloseButton", "view", rect(642, 563, 72, 72), { interaction: "press" }),
        node(11, 10, "", "image", rect(653, 574, 50, 50), { resourceId: "ui/popup/close" }),
    ];
    return {
        schemaVersion: 1,
        kind: "uniflex-design-snapshot",
        screenId: "small-popup",
        canvas: { width: 750, height: 1624 },
        nodes,
    };
}

function confirmSnapshot() {
    const nodes = [
        node(1, null, "Confirm", "view", rect(0, 0, 750, 1624)),
        node(2, 1, "Confirm/Backdrop", "view", rect(0, 0, 750, 1624)),
        node(3, 1, "Confirm/Panel", "view", rect(21, 625, 708, 375)),
        node(4, 3, "Confirm/Background", "image", rect(21, 625, 708, 375), { resourceId: "ui/popup/prompt" }),
        node(5, 3, "Confirm/Title", "text", rect(111, 643, 528, 58), { value: "提示" }),
        node(6, 3, "Confirm/Message", "text", rect(61, 757, 628, 48), { value: "确认操作?" }),
        node(7, 3, "", "view", rect(418, 858, 255, 102)),
        node(8, 7, "CancelButton", "view", rect(418, 858, 255, 102)),
        node(9, 8, "ActionButton", "view", rect(418, 858, 255, 102), { interaction: "press" }),
        node(10, 9, "ActionButton/Background", "image", rect(418, 858, 255, 102), { resourceId: "ui/button/cancel" }),
        node(11, 9, "ActionButton/Label", "text", rect(426, 862, 239, 86), { value: "取消" }),
        node(12, 3, "", "view", rect(76, 858, 255, 102)),
        node(13, 12, "ConfirmButton", "view", rect(76, 858, 255, 102)),
        node(14, 13, "ActionButton", "view", rect(76, 858, 255, 102), { interaction: "press" }),
        node(15, 14, "ActionButton/Background", "image", rect(76, 858, 255, 102), { resourceId: "ui/button/confirm" }),
        node(16, 14, "ActionButton/Label", "text", rect(84, 862, 239, 86), { value: "确定" }),
    ];
    return {
        schemaVersion: 1,
        kind: "uniflex-design-snapshot",
        screenId: "confirm",
        canvas: { width: 750, height: 1624 },
        nodes,
    };
}

test("SmallPopup and Confirm compile as their own page packages", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-pages-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const smallScreen = catalog.screens.find((entry) => entry.id === "small-popup");
        const confirmScreen = catalog.screens.find((entry) => entry.id === "confirm");
        await exportFgui({
            snapshot: smallPopupSnapshot(), out: join(out, "small"), root, screen: smallScreen, catalog, images,
        });
        await exportFgui({
            snapshot: confirmSnapshot(), out: join(out, "confirm"), root, screen: confirmScreen, catalog, images,
        });
        const smallXml = readFileSync(join(out, "small/assets/UniFlex_SmallPopup/SmallPopup.xml"), "utf8");
        const confirmXml = readFileSync(join(out, "confirm/assets/UniFlex_Confirm/Confirm.xml"), "utf8");
        assert.match(smallXml, /name="SmallPopup\/Content"/);
        assert.match(smallXml, /name="CloseButton"/);
        assert.doesNotMatch(smallXml, /Prompt\/Message/);
        assert.match(confirmXml, /name="Confirm\/Title"/);
        assert.match(confirmXml, /name="ConfirmButton"/);
        assert.match(confirmXml, /name="CancelButton"/);
        assert.match(confirmXml, /fileName="images\/prompt.png"/);
        assert.match(confirmXml, / pkg="/);
        assert.doesNotMatch(confirmXml, /name="PopupFrame"/);
        parseFguiComponent(smallXml);
        parseFguiComponent(confirmXml);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("multi-page export shares Common and inlines PopupBackground kind variants", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-catalog-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const { ir } = await exportFgui({
            snapshots: [
                {
                    snapshot: promptSnapshot(),
                    screen: catalog.screens.find((entry) => entry.id === "prompt"),
                },
                {
                    snapshot: smallPopupSnapshot(),
                    screen: catalog.screens.find((entry) => entry.id === "small-popup"),
                },
                {
                    snapshot: confirmSnapshot(),
                    screen: catalog.screens.find((entry) => entry.id === "confirm"),
                },
            ],
            out, root, catalog, images,
        });
        assert.deepEqual(ir.screens.map((entry) => entry.id), ["prompt", "small-popup", "confirm"]);
        assert.ok(existsSync(join(out, "assets/UniFlex_Prompt/Prompt.xml")));
        assert.ok(existsSync(join(out, "assets/UniFlex_SmallPopup/SmallPopup.xml")));
        assert.ok(existsSync(join(out, "assets/UniFlex_Confirm/Confirm.xml")));
        const promptXml = readFileSync(join(out, "assets/UniFlex_Prompt/Prompt.xml"), "utf8");
        const smallXml = readFileSync(join(out, "assets/UniFlex_SmallPopup/SmallPopup.xml"), "utf8");
        const preview = readFileSync(join(out, "preview/index.html"), "utf8");
        assert.match(promptXml, /name="PopupBackground"/);
        assert.match(smallXml, /small\.png/);
        assert.match(smallXml, / pkg="/);
        assert.match(preview, /id="picker"/);
        assert.match(preview, /query\.set\("screen"/);
        assert.match(preview, /"id":"small-popup"/);
        assert.match(preview, /"id":"confirm"/);
        assert.match(preview, /id="catalog"/);
        assert.match(preview, /catalogId/);
        assert.equal(CATALOG_TITLES["提示弹窗"], "prompt");
        assert.equal(catalogIdFor([{ id: "prompt" }]), "catalog");
        assert.equal(catalogIdFor([{ id: "preview-home" }]), "preview-home");
        assert.equal(JSON.parse(readFileSync(join(out, "mapping.json"), "utf8")).Confirm.package, "UniFlex_Confirm");
        assert.equal(JSON.parse(readFileSync(join(out, "report.json"), "utf8")).screens.length, 3);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("export-fgui --snapshot twice builds one catalog project", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-cli-multi-"));
    const { writeFileSync } = await import("node:fs");
    const promptFile = join(out, "prompt.json");
    const confirmFile = join(out, "confirm.json");
    writeFileSync(promptFile, JSON.stringify(promptSnapshot()));
    writeFileSync(confirmFile, JSON.stringify(confirmSnapshot()));
    try {
        await runCli([
            "export-fgui",
            "--snapshot", promptFile,
            "--snapshot", confirmFile,
            "--out", join(out, "fgui"),
        ], {
            root,
            env: {},
            execute: () => { throw new Error("should not run"); },
            startPreview: async () => { throw new Error("preview should not start"); },
            readText: (file) => readFileSync(file, "utf8"),
        });
        assert.ok(existsSync(join(out, "fgui/assets/UniFlex_Prompt/Prompt.xml")));
        assert.ok(existsSync(join(out, "fgui/assets/UniFlex_Confirm/Confirm.xml")));
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("export-fgui --all rejects --screen", async () => {
    await assert.rejects(
        () => runCli(["export-fgui", "--all", "--screen", "prompt", "--out", "x"], {
            root,
            env: {},
            execute: () => { throw new Error("should not run"); },
            startPreview: async () => { throw new Error("preview should not start"); },
            readText: async () => "",
        }),
        /either --all or --screen/,
    );
});

test("panel pages emit fills, virtual-list rows, and shared text overrides", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-panels-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const snapshot = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "mail",
            canvas: { width: 750, height: 1334 },
            nodes: [
                node(1, null, "MailBattleReport", "view", rect(0, 0, 750, 1334), { planId: 1 }),
                node(2, 1, "", "view", rect(0, 0, 750, 170), { planId: 2 }),
                node(3, 1, "PanelTab", "view", rect(14, 118, 170, 52), { planId: 5 }),
                node(4, 3, "", "image", rect(14, 118, 170, 52), { resourceId: "ui/mail/tab-inactive" }),
                node(5, 3, "", "text", rect(14, 118, 170, 52), { value: "系统", planId: 10 }),
                node(6, 1, "PanelTab", "view", rect(192, 118, 170, 52)),
                node(7, 6, "", "image", rect(192, 118, 170, 52), { resourceId: "ui/mail/tab-inactive" }),
                node(8, 6, "", "text", rect(192, 118, 170, 52), { value: "战报" }),
                node(9, 1, "", "virtual-list", rect(10, 236, 730, 905)),
                node(10, 9, "MailBattleRow", "view", rect(10, 236, 730, 163)),
                node(11, 10, "", "image", rect(10, 236, 730, 163), { resourceId: "ui/mail/row" }),
                node(12, 10, "", "text", rect(155, 262, 480, 36), { value: "野怪讨伐胜利", planId: 46 }),
                node(13, 9, "MailBattleRow", "view", rect(10, 424, 730, 163)),
                node(14, 13, "", "image", rect(10, 424, 730, 163), { resourceId: "ui/mail/row" }),
                node(15, 13, "", "text", rect(155, 450, 480, 36), { value: "资源点侦察报告" }),
                node(16, 1, "NotificationBadge", "view", rect(159, 99, 34, 34)),
                node(17, 16, "NotificationBadge/Background", "image", rect(159, 99, 34, 34), { resourceId: "ui/mail/number-badge" }),
                node(18, 16, "NotificationBadge/Count", "text", rect(161, 99, 30, 34), { value: "2" }),
                node(19, 1, "NotificationBadge", "view", rect(346, 99, 34, 34)),
                node(20, 19, "NotificationBadge/Background", "image", rect(346, 99, 34, 34), { resourceId: "ui/mail/number-badge" }),
                node(21, 19, "NotificationBadge/Count", "text", rect(348, 99, 30, 34), { value: "4" }),
            ],
        };
        const hostPlan = {
            name: "MailBattleReport",
            components: {
                uniflexComponent3_ActionButton: {
                    root: { planId: 1, kind: "view", props: { name: "ActionButton" } },
                },
            },
            root: {
                planId: 1,
                kind: "view",
                props: { name: "MailBattleReport", backgroundColor: "#F3EFE9" },
                children: [
                    { planId: 2, kind: "view", props: { backgroundColor: "#553E78" } },
                    {
                        planId: 5, kind: "view", props: { name: "PanelTab" },
                        children: [{
                            planId: 10, kind: "text",
                            props: { bold: true, color: "#3F3254", fontSize: 28, horizontalAlign: "center" },
                        }],
                    },
                    {
                        kind: "virtual-list",
                        props: {
                            virtual: {
                                template: {
                                    planId: 42, kind: "view", props: { name: "MailBattleRow" },
                                    children: [{
                                        planId: 46, kind: "text",
                                        props: { bold: true, color: "#3F3254", fontSize: 26 },
                                    }],
                                },
                            },
                        },
                    },
                ],
            },
        };
        await exportFgui({
            snapshot,
            out,
            root,
            screen: catalog.screens.find((entry) => entry.id === "mail"),
            catalog,
            images,
            hostPlan,
        });
        const pageXml = readFileSync(join(out, "assets/UniFlex_MailBattleReport/MailBattleReport.xml"), "utf8");
        const tabXml = readFileSync(join(out, "assets/UniFlex_Common/PanelTab.xml"), "utf8");
        const rowXml = readFileSync(join(out, "assets/UniFlex_Common/MailBattleRow.xml"), "utf8");
        const badgeXml = readFileSync(join(out, "assets/UniFlex_Common/NotificationBadge.xml"), "utf8");
        assert.doesNotMatch(pageXml, /<graph/);
        assert.match(pageXml, /fill_fff3efe9\.png/);
        assert.match(pageXml, /fill_ff553e78\.png/);
        assert.match(pageXml, /fileName="MailBattleRow.xml"/);
        assert.match(pageXml, /propertyId="0" value="战报"/);
        assert.match(pageXml, /propertyId="0" value="资源点侦察报告"/);
        assert.match(pageXml, /propertyId="0" value="4"/);
        assert.match(tabXml, /color="#3f3254"/);
        assert.match(tabXml, /text="系统"/);
        assert.match(rowXml, /color="#3f3254"/);
        assert.match(rowXml, /text="野怪讨伐胜利"/);
        assert.match(badgeXml, /text="2"/);
        assert.equal((pageXml.match(/fileName="MailBattleRow.xml"/g) ?? []).length, 2);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("SettingsMenuButton instances override labels and keep plan color", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-settings-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const snapshot = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "settings",
            canvas: { width: 750, height: 1334 },
            nodes: [
                node(1, null, "PopupFrame", "view", rect(0, 0, 750, 1334)),
                node(2, 1, "PopupFrame/Mask", "view", rect(0, 0, 750, 1334)),
                node(3, 1, "PopupFrame/Panel", "view", rect(21, 171, 708, 992)),
                node(4, 3, "PopupBackground", "view", rect(21, 171, 708, 992)),
                node(5, 4, "", "image", rect(21, 171, 708, 992), { resourceId: "ui/settings/panel" }),
                node(6, 3, "PopupFrame/Title", "text", rect(141, 182, 468, 64), { value: "设置" }),
                node(7, 3, "PopupFrame/Content", "view", rect(21, 171, 708, 992)),
                node(8, 7, "Settings/Content", "view", rect(21, 171, 708, 992)),
                node(9, 8, "SettingsMenuButton", "view", rect(42, 284, 326, 114)),
                node(10, 9, "SettingsMenuButton/Background", "image", rect(42, 284, 326, 114), { resourceId: "ui/settings/button" }),
                node(11, 9, "SettingsMenuButton/Icon", "image", rect(75, 315, 54, 54), { resourceId: "ui/settings/gear" }),
                node(12, 9, "SettingsMenuButton/Label", "text", rect(170, 314, 184, 54), { value: "通用设置" }),
                node(13, 8, "SettingsMenuButton", "view", rect(383, 284, 326, 114)),
                node(14, 13, "SettingsMenuButton/Background", "image", rect(383, 284, 326, 114), { resourceId: "ui/settings/button" }),
                node(15, 13, "SettingsMenuButton/Icon", "image", rect(416, 315, 54, 54), { resourceId: "ui/settings/gear" }),
                node(16, 13, "SettingsMenuButton/Label", "text", rect(511, 314, 184, 54), { value: "声音设置" }),
            ],
        };
        await exportFgui({
            snapshot,
            out,
            root,
            screen: catalog.screens.find((entry) => entry.id === "settings"),
            catalog,
            images,
        });
        const pageXml = readFileSync(join(out, "assets/UniFlex_Settings/Settings.xml"), "utf8");
        const buttonXml = readFileSync(join(out, "assets/UniFlex_Common/SettingsMenuButton.xml"), "utf8");
        assert.match(buttonXml, /text="通用设置"/);
        assert.match(buttonXml, /color="#3f3254"/);
        assert.match(pageXml, /propertyId="0" value="声音设置"/);
        assert.match(pageXml, /fileName="SettingsMenuButton.xml"/);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("nested shared cards do not remap parent list instance text", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-heroes-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const snapshot = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "hero",
            canvas: { width: 750, height: 1334 },
            nodes: [
                node(1, null, "HeroScreen", "view", rect(0, 0, 750, 1334)),
                node(2, 1, "HeroListPanel", "view", rect(0, 0, 750, 1334)),
                node(3, 2, "", "image", rect(15, 157, 720, 948), { resourceId: "ui/hero/list-panel" }),
                node(4, 2, "HeroCard", "view", rect(25, 169, 170, 248)),
                node(5, 4, "", "image", rect(25, 169, 170, 248), { resourceId: "ui/hero/frame-red" }),
                node(6, 4, "", "text", rect(35, 337, 110, 32), { value: "Lv.20" }),
                node(7, 2, "HeroCard", "view", rect(200, 169, 170, 248)),
                node(8, 7, "", "image", rect(200, 169, 170, 248), { resourceId: "ui/hero/frame-yellow" }),
                node(9, 7, "", "text", rect(210, 337, 110, 32), { value: "Lv.18" }),
            ],
        };
        await exportFgui({
            snapshot,
            out,
            root,
            screen: catalog.screens.find((entry) => entry.id === "hero"),
            catalog,
            images,
        });
        const pageXml = readFileSync(join(out, "assets/UniFlex_HeroScreen/HeroScreen.xml"), "utf8");
        const listXml = readFileSync(join(out, "assets/UniFlex_Common/HeroListPanel.xml"), "utf8");
        const cardXml = readFileSync(join(out, "assets/UniFlex_Common/HeroCard.xml"), "utf8");
        assert.match(cardXml, /text="Lv.20"/);
        assert.match(listXml, /fileName="HeroCard.xml"/);
        assert.match(listXml, /text="Lv.18"/);
        assert.equal(pageXml.includes('propertyId="0" value="Lv.20"'), false);
        assert.equal(pageXml.includes('propertyId="0" value="Lv.18"'), false);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("hidden empty buttons do not become the shared CloseButton template", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-hidden-btn-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const hidden = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "hero-detail",
            canvas: { width: 750, height: 1624 },
            nodes: [
                node(1, null, "HeroDetail", "view", rect(0, 0, 750, 1624)),
                node(2, 1, "HeroStarUpgrade", "view", rect(0, 0, 0, 0), { visible: false }),
                node(3, 2, "CloseButton", "view", rect(0, 0, 0, 0), { visible: false, interaction: "press" }),
                node(4, 3, "", "image", rect(0, 0, 0, 0), { resourceId: "ui/popup/close", visible: false }),
                node(5, 2, "ActionButton", "view", rect(0, 0, 0, 0), { visible: false, interaction: "press" }),
                node(6, 5, "ActionButton/Background", "image", rect(0, 0, 0, 0), {
                    resourceId: "ui/button/confirm", visible: false,
                }),
                node(7, 5, "ActionButton/Label", "text", rect(0, 0, 0, 0), { value: "升星", visible: false }),
            ],
        };
        const visible = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "hero-star-upgrade",
            canvas: { width: 750, height: 1624 },
            nodes: [
                node(1, null, "HeroStarUpgradePage", "view", rect(0, 0, 750, 1624)),
                node(2, 1, "CloseButton", "view", rect(642, 383, 72, 72), { interaction: "press" }),
                node(3, 2, "", "image", rect(653, 394, 50, 50), { resourceId: "ui/popup/close" }),
                node(4, 1, "ActionButton", "view", rect(247, 1105, 255, 102), { interaction: "press" }),
                node(5, 4, "ActionButton/Background", "image", rect(247, 1105, 255, 102), {
                    resourceId: "ui/button/confirm",
                }),
                node(6, 4, "ActionButton/Label", "text", rect(255, 1109, 239, 86), { value: "升星" }),
            ],
        };
        await exportFgui({
            snapshots: [
                { snapshot: hidden, screen: catalog.screens.find((entry) => entry.id === "hero-detail") },
                { snapshot: visible, screen: catalog.screens.find((entry) => entry.id === "hero-star-upgrade") },
            ],
            out, root, catalog, images,
        });
        const closeXml = readFileSync(join(out, "assets/UniFlex_Common/CloseButton.xml"), "utf8");
        const actionXml = readFileSync(join(out, "assets/UniFlex_Common/ActionButton.xml"), "utf8");
        const pageXml = readFileSync(join(out, "assets/UniFlex_HeroStarUpgrade/HeroStarUpgrade.xml"), "utf8");
        assert.match(closeXml, /size="72,72"/);
        assert.match(closeXml, /name="icon"/);
        assert.match(actionXml, /size="255,102"/);
        assert.match(actionXml, /text="升星"/);
        assert.match(pageXml, /fileName="CloseButton.xml"/);
        assert.match(pageXml, /fileName="ActionButton.xml"/);
        assert.match(pageXml, /title="升星"/);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("ConfirmButton instances override nested ActionButton title", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-confirm-title-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const create = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "alliance-create",
            canvas: { width: 750, height: 1624 },
            nodes: [
                node(1, null, "AllianceCreatePage", "view", rect(0, 0, 750, 1624)),
                node(2, 1, "ConfirmButton", "view", rect(248, 1168, 255, 102)),
                node(3, 2, "ActionButton", "view", rect(248, 1168, 255, 102), { interaction: "press" }),
                node(4, 3, "ActionButton/Background", "image", rect(248, 1168, 255, 102), {
                    resourceId: "ui/button/confirm",
                }),
                node(5, 3, "ActionButton/Label", "text", rect(256, 1172, 239, 86), { value: "创建" }),
            ],
        };
        await exportFgui({
            snapshots: [
                {
                    snapshot: promptSnapshot(),
                    screen: catalog.screens.find((entry) => entry.id === "prompt"),
                },
                {
                    snapshot: create,
                    screen: catalog.screens.find((entry) => entry.id === "alliance-create"),
                },
            ],
            out, root, catalog, images,
        });
        const createXml = readFileSync(join(out, "assets/UniFlex_AllianceCreate/AllianceCreate.xml"), "utf8");
        assert.match(createXml, /fileName="ConfirmButton.xml"/);
        assert.match(createXml, /target="ActionButton" propertyId="0" value="创建"/);
        const promptXml = readFileSync(join(out, "assets/UniFlex_Prompt/Prompt.xml"), "utf8");
        assert.doesNotMatch(promptXml, /value="创建"/);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("ActionButton with a cost icon is inlined instead of sharing the label-only skin", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-action-icon-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const snapshot = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "alliance-march-boost",
            canvas: { width: 750, height: 1624 },
            nodes: [
                node(1, null, "AllianceMarchBoostPage", "view", rect(0, 0, 750, 1624)),
                node(2, 1, "ActionButton", "view", rect(76, 1100, 255, 102), { interaction: "press" }),
                node(3, 2, "ActionButton/Background", "image", rect(76, 1100, 255, 102), {
                    resourceId: "ui/button/confirm",
                }),
                node(4, 2, "ActionButton/Label", "text", rect(84, 1104, 239, 86), { value: "确定" }),
                node(5, 2, "ActionButton/IconRow", "view", rect(84, 1104, 239, 86), { visible: false }),
                node(6, 1, "ActionButton", "view", rect(418, 1100, 255, 102), { interaction: "press" }),
                node(7, 6, "ActionButton/Background", "image", rect(418, 1100, 255, 102), {
                    resourceId: "ui/button/confirm",
                }),
                node(8, 6, "ActionButton/Label", "text", rect(426, 1104, 239, 86), {
                    value: "10", visible: false,
                }),
                node(9, 6, "ActionButton/IconRow", "view", rect(426, 1104, 239, 86)),
                node(10, 9, "ActionButton/Icon", "image", rect(450, 1128, 48, 48), {
                    resourceId: "ui/alliance/create-diamond",
                }),
                node(11, 9, "ActionButton/IconLabel", "text", rect(514, 1104, 80, 86), { value: "10" }),
            ],
        };
        await exportFgui({
            snapshot, out, root,
            screen: catalog.screens.find((entry) => entry.id === "alliance-march-boost"),
            catalog, images,
        });
        const pageXml = readFileSync(join(out, "assets/UniFlex_AllianceMarchBoost/AllianceMarchBoost.xml"), "utf8");
        const actionXml = readFileSync(join(out, "assets/UniFlex_Common/ActionButton.xml"), "utf8");
        assert.match(actionXml, /text="确定"/);
        assert.doesNotMatch(actionXml, /ActionButton\/IconRow/);
        assert.match(pageXml, /fileName="ActionButton.xml"/);
        assert.match(pageXml, /alliance_create_diamond\.png/);
        assert.match(pageXml, /text="10"/);
        assert.equal((pageXml.match(/fileName="ActionButton\.xml"/g) ?? []).length, 1);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("smaller ActionButton instances are inlined instead of stretching the 255x102 template", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-action-size-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const snapshot = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "alliance-gift",
            canvas: { width: 750, height: 1624 },
            nodes: [
                node(1, null, "AllianceGiftPage", "view", rect(0, 0, 750, 1624)),
                node(2, 1, "ActionButton", "view", rect(76, 1100, 255, 102), { interaction: "press" }),
                node(3, 2, "ActionButton/Background", "image", rect(76, 1100, 255, 102), {
                    resourceId: "ui/button/confirm",
                }),
                node(4, 2, "ActionButton/Label", "text", rect(84, 1104, 239, 86), { value: "确定" }),
                node(5, 1, "ActionButton", "view", rect(280, 1386, 191, 77), { interaction: "press" }),
                node(6, 5, "ActionButton/Background", "image", rect(280, 1386, 191, 77), {
                    resourceId: "ui/button/confirm",
                }),
                node(7, 5, "ActionButton/Label", "text", rect(288, 1390, 175, 61), { value: "一键领取" }),
            ],
        };
        await exportFgui({
            snapshot, out, root,
            screen: catalog.screens.find((entry) => entry.id === "alliance-gift"),
            catalog, images,
        });
        const pageXml = readFileSync(join(out, "assets/UniFlex_AllianceGift/AllianceGift.xml"), "utf8");
        assert.match(pageXml, /fileName="ActionButton.xml"/);
        assert.match(pageXml, /text="一键领取"/);
        assert.doesNotMatch(pageXml, /title="一键领取"/);
        assert.equal((pageXml.match(/fileName="ActionButton\.xml"/g) ?? []).length, 1);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("nested component planIds do not reuse the page title style", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-plan-scope-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const snapshot = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "alliance",
            canvas: { width: 750, height: 1624 },
            componentDeclarations: {
                schemaVersion: 1,
                kind: "uniflex-component-declarations",
                definitions: [{ key: "AllianceHomePanel" }],
                instances: [
                    { key: "Alliance.root", definitionKey: "Alliance", role: "page", rootRecordId: 1 },
                    {
                        key: "AllianceHomePanel:Alliance/AllianceHome",
                        definitionKey: "AllianceHomePanel",
                        role: "component",
                        rootRecordId: 3,
                    },
                ],
            },
            nodes: [
                node(1, null, "Alliance", "view", rect(0, 0, 750, 1624), { planId: 1 }),
                node(2, 1, "", "text", rect(20, 160, 200, 58), { value: "联盟", planId: 10 }),
                node(3, 1, "AllianceHome", "view", rect(0, 0, 750, 1369), { planId: 40 }),
                node(4, 3, "AllianceInfoHeader", "view", rect(0, 0, 750, 541)),
                node(5, 4, "", "text", rect(296, 398, 160, 32), { value: "盟主", planId: 10 }),
                node(6, 3, "AllianceMenuButton", "view", rect(32, 776, 326, 114)),
                node(7, 6, "", "text", rect(150, 804, 190, 58), { value: "战争", planId: 31 }),
            ],
        };
        const hostPlan = {
            name: "Alliance",
            components: {
                uniflexComponent0_AllianceHomePanel: {
                    root: {
                        planId: 1, kind: "view", props: { name: "AllianceHome" },
                        children: [
                            {
                                planId: 10, kind: "text",
                                props: { value: "盟主", color: "#3F3254", fontSize: 24, bold: true },
                            },
                            {
                                planId: 31, kind: "text",
                                props: {
                                    value: "战争", color: "#3F3254", fontSize: 28, bold: true,
                                    horizontalAlign: "center", overflow: "shrink",
                                },
                            },
                        ],
                    },
                },
            },
            root: {
                planId: 1, kind: "view", props: { name: "Alliance" },
                children: [{
                    planId: 10, kind: "text",
                    props: {
                        value: "联盟", color: "#ffffff", fontSize: 40, bold: true,
                        outlineColor: "#593d84", outlineWidth: 2,
                    },
                }],
            },
        };
        await exportFgui({
            snapshot, out, root,
            screen: catalog.screens.find((entry) => entry.id === "alliance"),
            catalog, images, hostPlan,
        });
        const pageXml = readFileSync(join(out, "assets/UniFlex_Alliance/Alliance.xml"), "utf8");
        const headerXml = readFileSync(join(out, "assets/UniFlex_Common/AllianceInfoHeader.xml"), "utf8");
        const menuXml = readFileSync(join(out, "assets/UniFlex_Common/AllianceMenuButton.xml"), "utf8");
        assert.match(pageXml, /fontSize="40"[^>]*text="联盟"/);
        assert.match(pageXml, /fileName="AllianceHomePanel.xml"/);
        assert.doesNotMatch(pageXml, /text="盟主"/);
        assert.match(headerXml, /fontSize="24"[^>]*color="#3f3254"[^>]*text="盟主"/);
        assert.doesNotMatch(headerXml, /fontSize="40"/);
        assert.match(menuXml, /fontSize="28"[^>]*color="#3f3254"[^>]*text="战争"/);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("QuantityControl inspect skin overrides the white default and IconLabel keeps confirm stroke", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-qty-skin-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const snapshot = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "shop-getitem",
            canvas: { width: 750, height: 1624 },
            nodes: [
                node(1, null, "ShopGetItemPage", "view", rect(0, 0, 750, 1624)),
                node(2, 1, "QuantityControl", "view", rect(39, 841, 669, 85)),
                node(3, 2, "", "text", rect(604, 1132, 121, 54), { value: "0" }),
                node(4, 1, "QuantityControl", "view", rect(39, 841, 669, 85)),
                node(5, 4, "", "text", rect(533, 852, 94, 64), {
                    value: "8",
                    fontSize: 32,
                    color: "#3F3254",
                    outlineWidth: 0,
                    outlineColor: "#000000",
                    bold: true,
                }),
                node(6, 1, "ActionButton", "view", rect(77, 860, 255, 102), { interaction: "press" }),
                node(7, 6, "ActionButton/Background", "image", rect(77, 860, 255, 102), {
                    resourceId: "ui/button/confirm",
                }),
                node(8, 6, "ActionButton/Label", "text", rect(85, 864, 239, 86), { value: "确定" }),
                node(9, 6, "ActionButton/IconRow", "view", rect(85, 864, 239, 86), { visible: false }),
                node(10, 1, "ActionButton", "view", rect(247, 979, 255, 102), { interaction: "press" }),
                node(11, 10, "ActionButton/Background", "image", rect(247, 979, 255, 102), {
                    resourceId: "ui/button/confirm",
                }),
                node(12, 10, "ActionButton/Label", "text", rect(255, 983, 239, 86), {
                    value: "1000", visible: false,
                }),
                node(13, 10, "ActionButton/IconRow", "view", rect(255, 983, 239, 86)),
                node(14, 13, "ActionButton/Icon", "image", rect(283, 999, 64, 54), {
                    resourceId: "ui/shop/getitem-pay-gem",
                }),
                node(15, 13, "ActionButton/IconLabel", "text", rect(363, 983, 104, 86), { value: "1000" }),
            ],
        };
        await exportFgui({
            snapshot, out, root,
            screen: catalog.screens.find((entry) => entry.id === "shop-getitem"),
            catalog, images,
        });
        const pageXml = readFileSync(join(out, "assets/UniFlex_ShopGetItem/ShopGetItem.xml"), "utf8");
        const qtyXml = readFileSync(join(out, "assets/UniFlex_Common/QuantityControl.xml"), "utf8");
        assert.match(pageXml, /fileName="QuantityControl.xml"/);
        assert.match(qtyXml, /fontSize="33"[^>]*color="#ffffff"[^>]*strokeColor="#000000"[^>]*strokeSize="4"[^>]*text="0"/);
        assert.match(pageXml, /fontSize="32"[^>]*color="#3f3254"[^>]*text="8"/);
        assert.doesNotMatch(pageXml, /strokeSize="[^"]+"[^>]*text="8"/);
        assert.doesNotMatch(pageXml, /text="8"[^>]*strokeSize=/);
        assert.match(pageXml, /name="ActionButton\/IconLabel"[^>]*strokeColor="#643e14"[^>]*strokeSize="4"[^>]*text="1000"/);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("merged catalog screens keep the first group and prefix package urls", () => {
    const a = mkdtempSync(join(tmpdir(), "fgui-group-a-"));
    const b = mkdtempSync(join(tmpdir(), "fgui-group-b-"));
    try {
        writeFakeExport(a, "popups", {
            Prompt: { package: "UniFlex_Prompt", component: "Prompt" },
        }, ["prompt"]);
        writeFakeExport(b, "home-shop", {
            Prompt: { package: "UniFlex_Prompt", component: "Prompt" },
            PreviewHome: { package: "UniFlex_PreviewHome", component: "PreviewHome" },
            ShopGetItem: { package: "UniFlex_ShopGetItem", component: "ShopGetItem" },
        }, ["prompt", "preview-home", "shop-getitem"]);
        const catalog = { screens: [
            { id: "prompt", componentName: "Prompt", canvas: { width: 750, height: 1624 } },
            { id: "preview-home", componentName: "PreviewHome", canvas: { width: 750, height: 1424 } },
            { id: "shop-getitem", componentName: "ShopGetItem", canvas: { width: 750, height: 1624 } },
        ] };
        const groups = resolvePreviewGroups({ root: "/", out: a, merge: [b] });
        const screens = loadMergedScreens(groups, catalog);
        assert.deepEqual(screens.map((entry) => entry.id), ["prompt", "preview-home", "shop-getitem"]);
        assert.equal(screens[0].group, basename(a));
        assert.equal(screens.find((entry) => entry.id === "shop-getitem").packageName, "UniFlex_ShopGetItem");
        const file = resolvePreviewFile(`${basename(b)}/UniFlex_ShopGetItem/package.xml`, {
            multi: true,
            assets: join(a, "preview"),
            byName: new Map(groups.map((group) => [group.name, group])),
        });
        assert.equal(file, join(b, "preview/UniFlex_ShopGetItem/package.xml"));
        assert.equal(resolvePreviewFile("../secret", {
            multi: false, assets: join(a, "preview"), byName: new Map(),
        }), null);
    } finally {
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
    }
});

test("preview server catalog page lists merged screens", async () => {
    const a = mkdtempSync(join(tmpdir(), "fgui-serve-a-"));
    const b = mkdtempSync(join(tmpdir(), "fgui-serve-b-"));
    try {
        writeFakeExport(a, "popups", {
            Prompt: { package: "UniFlex_Prompt", component: "Prompt" },
        }, ["prompt"]);
        writeFakeExport(b, "home-shop", {
            PreviewHome: { package: "UniFlex_PreviewHome", component: "PreviewHome" },
        }, ["preview-home"]);
        writeFileSync(join(a, "preview/fairygui.js"), "window.fgui={};");
        const server = await servePreview({ root, out: a, merge: [b], port: 0 });
        try {
            const html = await (await fetch(server.url)).text();
            assert.match(html, /FairyGUI 预览/);
            assert.match(html, /"id":"prompt"/);
            assert.match(html, /"id":"preview-home"/);
            assert.match(html, /bindCatalogClicks/);
            assert.match(html, /bindLabeled/);
            assert.match(html, /bindPageInteractions/);
            assert.match(html, /currentId, go/);
            const pkg = await fetch(`${server.url}${basename(a)}/UniFlex_Prompt/package.xml`);
            assert.equal(pkg.status, 200);
            assert.match(await pkg.text(), /UniFlex_Prompt/);
        } finally {
            await server.close();
        }
    } finally {
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
    }
});

test("UniFlex components export as FairyGUI components; fills are images not graphs", async () => {
    const out = mkdtempSync(join(tmpdir(), "uniflex-fgui-press-"));
    try {
        const catalog = await loadScreenCatalog(root);
        const images = await loadImageCatalog(root);
        const snapshot = {
            schemaVersion: 1,
            kind: "uniflex-design-snapshot",
            screenId: "backpack",
            canvas: { width: 750, height: 1334 },
            nodes: [
                node(1, null, "Backpack", "view", rect(0, 0, 750, 1334)),
                node(2, 1, "PopupFrame/Mask", "view", rect(0, 0, 750, 1334), { interaction: "press" }),
                node(3, 1, "Backpack/Back", "view", rect(13, 1252, 64, 56), { interaction: "press" }),
                node(4, 3, "", "image", rect(13, 1252, 64, 56), { resourceId: "ui/mail/back" }),
                node(5, 1, "QuantityControl", "view", rect(25, 1118, 700, 85)),
                node(6, 5, "QuantityControl/Decrease", "view", rect(25, 1118, 76, 85), { interaction: "press" }),
                node(7, 6, "", "image", rect(25, 1118, 76, 85), { resourceId: "ui/backpack/button-minus" }),
                node(8, 5, "QuantityControl/Increase", "view", rect(511, 1118, 76, 85), { interaction: "press" }),
                node(9, 8, "", "image", rect(511, 1118, 76, 85), { resourceId: "ui/backpack/button-plus" }),
                node(10, 5, "", "text", rect(604, 1132, 121, 54), { value: "0" }),
                node(11, 1, "PanelTab", "view", rect(14, 118, 134, 52), { interaction: "press" }),
                node(12, 11, "", "image", rect(14, 118, 134, 52), { resourceId: "ui/mail/tab-inactive" }),
                node(13, 11, "", "text", rect(14, 118, 134, 52), { value: "装备" }),
            ],
        };
        await exportFgui({
            snapshot, out, root,
            screen: catalog.screens.find((entry) => entry.id === "backpack"),
            catalog, images,
        });
        const pageXml = readFileSync(join(out, "assets/UniFlex_Backpack/Backpack.xml"), "utf8");
        const tabXml = readFileSync(join(out, "assets/UniFlex_Common/PanelTab.xml"), "utf8");
        const qtyXml = readFileSync(join(out, "assets/UniFlex_Common/QuantityControl.xml"), "utf8");
        assert.match(tabXml, /extention="Button"/);
        assert.match(pageXml, /fileName="QuantityControl.xml"/);
        assert.match(pageXml, /fileName="PanelTab.xml"/);
        assert.match(pageXml, /name="Backpack\/Back"/);
        assert.doesNotMatch(pageXml, /fileName="Backpack_Back.xml"/);
        assert.doesNotMatch(pageXml, /fileName="QuantityControl_Decrease.xml"/);
        assert.match(qtyXml, /name="QuantityControl\/Decrease"/);
        assert.match(pageXml, /name="PopupFrame\/Mask"/);
        assert.match(pageXml, /fill_99000000\.png/);
        assert.doesNotMatch(pageXml, /<graph/);
        assert.doesNotMatch(qtyXml, /<graph/);
        const preview = readFileSync(join(out, "preview/index.html"), "utf8");
        assert.match(preview, /bindPageInteractions/);
        assert.match(preview, /QuantityControl\/Decrease/);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

function writeFakeExport(dir, _name, mapping, screens) {
    mkdirSync(join(dir, "preview"), { recursive: true });
    writeFileSync(join(dir, "preview", "index.html"), "<html></html>");
    writeFileSync(join(dir, "report.json"), JSON.stringify({
        kind: "uniflex-fgui-export",
        screens,
    }));
    writeFileSync(join(dir, "mapping.json"), JSON.stringify(mapping));
    for (const entry of Object.values(mapping)) {
        const pkg = join(dir, "preview", entry.package);
        mkdirSync(pkg, { recursive: true });
        writeFileSync(join(pkg, "package.xml"), `<packageDescription name="${entry.package}"/>`);
    }
}

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
