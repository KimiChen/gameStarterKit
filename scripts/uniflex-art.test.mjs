import test from "node:test";
import assert from "node:assert/strict";
import { classifyArtPage, findArtPage, isArtScreen, loadArtCatalog } from "./lib/uniflex-art.mjs";
import { loadScreenCatalog } from "./lib/uniflex-screens.mjs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

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
