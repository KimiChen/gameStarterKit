import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { discoverPsdComponents, parsePsdComponentsFromSource } from "./lib/uniflex-component-catalog.mjs";
import { loadScreenCatalog } from "./lib/uniflex-screens.mjs";

const root = resolve(import.meta.dirname, "..");

test("parsePsdComponentsFromSource reads the first view name and skips nameless wrappers", () => {
    const source = `
export const Named = defineComponent((p) => (
    <view name="NamedRoot" style={{ width: 10 }}>
        <text name="NamedRoot/Label" value="x" />
    </view>
));
export const Wrapper = defineComponent((p) => (
    <ActionButton label="go" />
));
`;
    assert.deepEqual(parsePsdComponentsFromSource(source, "apps/client/src/ui-uniflex/components/x.tsx"), [
        { key: "Named", rootName: "NamedRoot", source: "apps/client/src/ui-uniflex/components/x.tsx" },
    ]);
});

test("discoverPsdComponents skips Restored dumps and fails closed on duplicate root names", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "uniflex-psd-catalog-"));
    const ui = join(tempRoot, "apps/client/src/ui-uniflex");
    try {
        await mkdir(join(ui, "pages/Demo"), { recursive: true });
        await mkdir(join(ui, "pages/DemoRestored/components"), { recursive: true });
        await mkdir(join(ui, "restored/pages/Demo/components"), { recursive: true });
        await mkdir(join(ui, "generated"), { recursive: true });
        await writeFile(join(ui, "pages/Demo/DemoPanel.tsx"), `
export const DemoPanel = defineComponent(() => (
    <view name="Demo" />
));
`);
        await writeFile(join(ui, "pages/DemoRestored/components/Dump.tsx"), `
export const Dump = defineComponent(() => (
    <view name="DumpRoot" />
));
`);
        await writeFile(join(ui, "restored/pages/Demo/components/Shared.tsx"), `
export const Shared = defineComponent(() => (
    <view name="SharedRoot" />
));
`);
        await writeFile(join(ui, "generated/Skip.tsx"), `
export const Skip = defineComponent(() => (
    <view name="SkipRoot" />
));
`);
        const catalog = await discoverPsdComponents(tempRoot);
        assert.deepEqual(catalog.components.map((entry) => entry.key), ["DemoPanel"]);
        await writeFile(join(ui, "pages/Demo/Other.tsx"), `
export const Other = defineComponent(() => (
    <view name="Demo" />
));
`);
        await assert.rejects(() => discoverPsdComponents(tempRoot), /Duplicate PSD component rootName Demo/);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("PSD ownership catalog is discovered from defineComponent, not the FGUI screens.json subset", async () => {
    const preview = await loadScreenCatalog(root);
    const psd = await discoverPsdComponents(root);
    const previewKeys = new Set(preview.components.map((entry) => entry.key));
    const psdKeys = new Set(psd.components.map((entry) => entry.key));
    assert.ok(psdKeys.has("AllianceTechPanel"));
    assert.ok(psdKeys.has("AllianceTechNode"));
    assert.ok(psdKeys.has("AllianceTechLink"));
    assert.ok(psdKeys.has("IconCaptionButton"));
    assert.ok(psdKeys.has("ItemSlot"));
    assert.equal(previewKeys.has("AllianceTechPanel"), false);
    assert.equal(previewKeys.has("IconCaptionButton"), false);
    assert.ok(previewKeys.has("PopupFrame"));
    assert.ok(previewKeys.has("ItemSlot"));
    assert.ok(psdKeys.has("PopupFrame"));
    assert.equal(psdKeys.has("CyanButton"), false);
    assert.ok(psd.components.every((entry) => !entry.source.includes("Restored")));
    assert.ok(psd.components.every((entry) => !entry.source.includes("/restored/")));
    assert.ok(psd.components.every((entry) => !entry.source.includes("/generated/")));
});
