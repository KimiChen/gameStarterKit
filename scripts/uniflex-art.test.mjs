import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    artComponentPsdPath, classifyArtPage, findArtPage, isArtScreen, loadArtCatalog,
} from "./lib/uniflex-art.mjs";
import { loadScreenCatalog } from "./lib/uniflex-screens.mjs";

const root = resolve(import.meta.dirname, "..");

function componentGuid(key) {
    const hex = createHash("sha256").update(`uniflex-component:${key}`).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function loadAgPsd() {
    const require = createRequire(resolve(root, "node_modules/web-ui-to-psd/package.json"));
    return require("ag-psd");
}

function collectPlaced(layer, acc = []) {
    if (layer.placedLayer) acc.push({ name: layer.name, id: layer.placedLayer.id });
    for (const child of layer.children || []) collectPlaced(child, acc);
    return acc;
}

function linkedPaths(psd) {
    return new Map((psd.linkedFiles || []).map((file) => [
        file.id,
        {
            relativePath: file.linkedFile?.relativePath || "",
            fullPath: file.linkedFile?.fullPath || "",
            childDocumentID: file.childDocumentID,
        },
    ]));
}

async function readArtPsd(file) {
    const { readPsd } = loadAgPsd();
    return readPsd(await readFile(file), {
        skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true,
    });
}

test("art catalog lists original feature pages only", async () => {
    const catalog = await loadArtCatalog(root);
    const preview = await loadScreenCatalog(root);
    assert.equal(catalog.applyTarget, "restored");
    const expected = preview.screens.filter(isArtScreen).map((screen) => screen.id);
    assert.deepEqual(catalog.pages.map((page) => page.screen), expected);
    assert.ok(expected.includes("alliance"));
    assert.ok(expected.includes("hero-star-upgrade"));
    assert.equal(findArtPage(catalog, "MailBattleReport").screen, "mail");
    assert.equal(findArtPage(catalog, "Alliance").componentName, "Alliance");
    assert.equal(findArtPage(catalog, "preview-home"), null);
    assert.equal(findArtPage(catalog, "backpack-restored"), null);
    assert.equal(
        artComponentPsdPath(root, "BackpackItemCard"),
        resolve(root, "apps/art/uniflex/components/BackpackItemCard/component.psd"),
    );
});

test("classifyArtPage splits export, import, ok, and conflict", () => {
    assert.equal(classifyArtPage({ psdSha: null, uniflexSha: "u1", art: null }), "export");
    assert.equal(classifyArtPage({
        psdSha: "p1", uniflexSha: "u1",
        art: { export: { psdSha256: "p1", uniflexSha256: "u1" } },
    }), "ok");
    assert.equal(classifyArtPage({
        psdSha: "p2", uniflexSha: "u1",
        art: { export: { psdSha256: "p1", uniflexSha256: "u1" }, import: { psdSha256: "p1" } },
    }), "import");
    assert.equal(classifyArtPage({
        psdSha: "p2", uniflexSha: "u1",
        art: { export: { psdSha256: "p1", uniflexSha256: "u1" }, import: { psdSha256: "p2" } },
    }), "ok");
    assert.equal(classifyArtPage({
        psdSha: "p1", uniflexSha: "u2",
        art: { export: { psdSha256: "p1", uniflexSha256: "u1" } },
    }), "export");
    assert.equal(classifyArtPage({
        psdSha: "p2", uniflexSha: "u2",
        art: { export: { psdSha256: "p1", uniflexSha256: "u1" }, import: { psdSha256: "p2" } },
    }), "conflict");
});

test("backpack page PSD links shared UniFlex components instead of inlining them", async () => {
    const page = await readArtPsd(resolve(root, "apps/art/uniflex/Backpack/screen.psd"));
    const placed = collectPlaced(page);
    const linked = linkedPaths(page);
    const cardId = componentGuid("BackpackItemCard");
    const slotId = componentGuid("ItemSlot");
    const cards = placed.filter((item) => item.id === cardId);
    assert.equal(cards.length, 8);
    assert.equal(linked.get(cardId)?.relativePath, "../components/BackpackItemCard/component.psd");
    assert.equal(linked.get(cardId)?.fullPath, "");
    assert.equal(linked.get(cardId)?.childDocumentID, "");
    assert.equal(linked.has(slotId), false);
    assert.equal(placed.some((item) => item.id === slotId), false);
    assert.equal(linked.get(componentGuid("PanelTab"))?.relativePath,
        "../components/PanelTab/component.psd");
    assert.equal(linked.get(componentGuid("BackpackQuantityControl"))?.relativePath,
        "../components/BackpackQuantityControl/component.psd");
    assert.equal(linked.has(componentGuid("QuantityControl")), false);
});

test("nested restorables are independent PSDs linked from their parent component", async () => {
    const card = await readArtPsd(artComponentPsdPath(root, "BackpackItemCard"));
    const qty = await readArtPsd(artComponentPsdPath(root, "BackpackQuantityControl"));
    const slotId = componentGuid("ItemSlot");
    const quantityId = componentGuid("QuantityControl");
    const cardPlaced = collectPlaced(card);
    const qtyPlaced = collectPlaced(qty);
    assert.equal(cardPlaced.length, 1);
    assert.equal(cardPlaced[0].id, slotId);
    assert.equal(linkedPaths(card).get(slotId)?.relativePath, "../ItemSlot/component.psd");
    assert.equal(linkedPaths(card).get(slotId)?.childDocumentID, "");
    assert.equal(qtyPlaced.length, 1);
    assert.equal(qtyPlaced[0].id, quantityId);
    assert.equal(linkedPaths(qty).get(quantityId)?.relativePath, "../QuantityControl/component.psd");
});

test("restored backpack shares copies while originals keep original imports", async () => {
    const originalPage = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/pages/Backpack/Backpack.tsx"), "utf8");
    const originalCard = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/pages/Backpack/components/BackpackItemCard.tsx"), "utf8");
    const restoredPage = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/pages/BackpackRestored/BackpackRestored.tsx"), "utf8");
    const restoredCard = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/restored/pages/Backpack/components/BackpackItemCard.tsx"),
        "utf8");
    const restoredSlot = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/restored/components/item/ItemSlot.tsx"), "utf8");
    assert.match(originalPage, /from '\.\/components\/BackpackItemCard'/);
    assert.doesNotMatch(originalPage, /restored/);
    assert.match(originalCard, /from '\.\.\/\.\.\/\.\.\/components\/item\/ItemSlot'/);
    assert.doesNotMatch(originalCard, /Restored/);
    assert.match(restoredPage,
        /from '\.\.\/\.\.\/restored\/pages\/Backpack\/components\/BackpackItemCard'/);
    assert.match(restoredPage, /from '\.\.\/\.\.\/restored\/components\/tab\/PanelTab'/);
    assert.match(restoredCard, /from '\.\.\/\.\.\/\.\.\/components\/item\/ItemSlot'/);
    assert.match(restoredCard, /from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/kits\/uniflex\/api\/core\/index'/);
    assert.match(restoredSlot, /from '\.\.\/\.\.\/\.\.\/\.\.\/kits\/uniflex\/api\/core\/index'/);
    assert.match(originalCard, /<ItemSlot left=\{0\}/);
    assert.match(restoredCard, /<ItemSlot left=\{0\}/);
});
