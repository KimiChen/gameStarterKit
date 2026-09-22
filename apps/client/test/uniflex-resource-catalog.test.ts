import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { pageResourceCatalog } from "../src/ui-uniflex/resourceCatalog";
import { jsonHash, parseResourceCatalog, prepareUIResources, type ResourceCatalog } from "../src/kits/uniflex/api/provider/index";

test("a page cannot acquire another page's private font as its bold fallback", async () => {
    const catalog = parseResourceCatalog(JSON.parse(readFileSync(
        new URL("../../Cocos/assets/resources/uniflex/catalog.json", import.meta.url), "utf8")));
    const privateFont = catalog.resources.find((entry) => entry.kind === "font" && entry.id !== "fonts/regular");
    assert.ok(privateFont, "the imported font that exposed the real Confirm failure is present");
    const scoped = pageResourceCatalog(catalog, ["fonts/regular"]);
    const requested: ResourceCatalog[] = [];
    const assets = { prepare: async (value: ResourceCatalog) => { requested.push(value); } } as Parameters<typeof prepareUIResources>[0];
    await prepareUIResources(assets, scoped, ["fonts/regular"]);
    const selected = requested[0]!;
    assert.deepEqual(selected.resources.map((entry) => entry.id), ["fonts/regular"]);
    assert.equal(scoped.hash, jsonHash(scoped.resources));
    assert.ok(catalog.resources.includes(privateFont), "selection must not mutate the shared catalog");
    await prepareUIResources(assets, pageResourceCatalog(catalog, [privateFont.id]), [privateFont.id]);
    const ownPage = requested[1]!;
    assert.ok(ownPage.resources.some((entry) => entry.id === privateFont.id), "explicit private font references stay required");
});
