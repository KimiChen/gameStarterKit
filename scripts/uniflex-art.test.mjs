import test from "node:test";
import assert from "node:assert/strict";
import { classifyArtPage, findArtPage, loadArtCatalog } from "./lib/uniflex-art.mjs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("art catalog lists original feature pages only", async () => {
    const catalog = await loadArtCatalog(root);
    assert.equal(catalog.applyTarget, "restored");
    const screens = catalog.pages.map((page) => page.screen);
    assert.deepEqual(screens, [
        "prompt", "small-popup", "confirm", "backpack", "mail",
        "settings", "character", "hero", "hero-detail",
    ]);
    assert.equal(findArtPage(catalog, "MailBattleReport").screen, "mail");
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
