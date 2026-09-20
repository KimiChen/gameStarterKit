import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
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
        resolve(root, "apps/client/src/ui-uniflex/modules/backpack/Backpack/Backpack.tsx"), "utf8");
    const originalCard = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/backpack/Backpack/components/BackpackItemCard.tsx"), "utf8");
    const restoredPage = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/backpack/BackpackRestored/BackpackRestored.tsx"), "utf8");
    const restoredCard = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/restored/modules/backpack/Backpack/components/BackpackItemCard.tsx"),
        "utf8");
    const restoredSlot = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/restored/gamecomponents/item/ItemSlot.tsx"), "utf8");
    assert.match(originalPage, /from '\.\/components\/BackpackItemCard'/);
    assert.doesNotMatch(originalPage, /restored/);
    assert.match(originalCard, /from '\.\.\/\.\.\/\.\.\/\.\.\/gamecomponents\/item\/ItemSlot'/);
    assert.doesNotMatch(originalCard, /Restored/);
    assert.match(restoredPage,
        /from '\.\.\/\.\.\/\.\.\/restored\/modules\/backpack\/Backpack\/components\/BackpackItemCard'/);
    assert.match(restoredPage, /from '\.\.\/\.\.\/\.\.\/restored\/components\/tab\/PanelTab'/);
    assert.match(restoredCard, /from '\.\.\/\.\.\/\.\.\/\.\.\/gamecomponents\/item\/ItemSlot'/);
    assert.match(restoredCard, /from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/kits\/uniflex\/api\/core\/index'/);
    assert.match(restoredSlot, /from '\.\.\/\.\.\/\.\.\/\.\.\/kits\/uniflex\/api\/core\/index'/);
    assert.match(originalCard, /<ItemSlot left=\{0\}/);
    assert.match(restoredCard, /<ItemSlot left=\{0\}/);
});

test("shop and backpack component PSDs share the same ItemSlot file", async () => {
    const slotId = componentGuid("ItemSlot");
    const card = await readArtPsd(artComponentPsdPath(root, "BackpackItemCard"));
    const panel = await readArtPsd(artComponentPsdPath(root, "ShopGetItemPanel"));
    const shopPage = await readArtPsd(resolve(root, "apps/art/uniflex/ShopGetItem/screen.psd"));
    assert.equal(linkedPaths(card).get(slotId)?.relativePath, "../ItemSlot/component.psd");
    assert.equal(linkedPaths(panel).get(slotId)?.relativePath, "../ItemSlot/component.psd");
    assert.equal(linkedPaths(card).get(slotId)?.childDocumentID, "");
    assert.equal(collectPlaced(shopPage).some((item) => item.id === slotId), false);
    assert.equal(
        linkedPaths(shopPage).get(componentGuid("ShopGetItemPanel"))?.relativePath,
        "../components/ShopGetItemPanel/component.psd",
    );
    const shopRestored = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/shop/ShopGetItemRestored/ShopGetItemRestored.tsx"),
        "utf8");
    const shopPanel = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/restored/modules/shop/ShopGetItem/ShopGetItemPanel.tsx"),
        "utf8");
    const heroRestored = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/hero/HeroScreenRestored/HeroScreenRestored.tsx"),
        "utf8");
    const heroRequired = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/restored/modules/hero/HeroScreen/HeroRequiredHero.tsx"),
        "utf8");
    const originalShop = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/shop/ShopGetItem/ShopGetItem.tsx"), "utf8");
    assert.match(shopRestored, /from '\.\.\/\.\.\/\.\.\/restored\/modules\/shop\/ShopGetItem\/ShopGetItemPanel'/);
    assert.match(shopPanel, /from '\.\.\/\.\.\/\.\.\/components\/item\/ItemSlot'/);
    assert.match(heroRestored, /from '\.\.\/\.\.\/\.\.\/restored\/modules\/hero\/HeroScreen\/HeroBondsPanel'/);
    assert.match(heroRequired, /from '\.\.\/\.\.\/\.\.\/components\/item\/ItemSlot'/);
    assert.match(originalShop, /from '\.\/ShopGetItemPanel'/);
    assert.doesNotMatch(originalShop, /restored/);
});

test("prompt, confirm, and shop share the same ConfirmButton file", async () => {
    const confirmId = componentGuid("ConfirmButton");
    const cancelId = componentGuid("CancelButton");
    const actionId = componentGuid("ActionButton");
    const closeId = componentGuid("CloseButton");
    const prompt = await readArtPsd(resolve(root, "apps/art/uniflex/Prompt/screen.psd"));
    const confirm = await readArtPsd(resolve(root, "apps/art/uniflex/Confirm/screen.psd"));
    const shopPanel = await readArtPsd(artComponentPsdPath(root, "ShopGetItemPanel"));
    const confirmBtn = await readArtPsd(artComponentPsdPath(root, "ConfirmButton"));
    const cancelBtn = await readArtPsd(artComponentPsdPath(root, "CancelButton"));
    assert.equal(linkedPaths(prompt).get(confirmId)?.relativePath,
        "../components/ConfirmButton/component.psd");
    assert.equal(linkedPaths(prompt).get(cancelId)?.relativePath,
        "../components/CancelButton/component.psd");
    assert.equal(linkedPaths(prompt).get(closeId)?.relativePath,
        "../components/CloseButton/component.psd");
    assert.equal(linkedPaths(prompt).get(confirmId)?.childDocumentID, "");
    assert.equal(collectPlaced(prompt).some((item) => item.id === actionId), false);
    assert.equal(linkedPaths(confirm).get(confirmId)?.relativePath,
        "../components/ConfirmButton/component.psd");
    assert.equal(linkedPaths(confirm).get(cancelId)?.relativePath,
        "../components/CancelButton/component.psd");
    assert.equal(linkedPaths(shopPanel).get(confirmId)?.relativePath, "../ConfirmButton/component.psd");
    assert.equal(linkedPaths(confirmBtn).get(actionId)?.relativePath, "../ActionButton/component.psd");
    assert.equal(linkedPaths(cancelBtn).get(actionId)?.relativePath, "../ActionButton/component.psd");
    const promptRestored = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/popup/PromptRestored/PromptRestored.tsx"), "utf8");
    const confirmRestored = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/popup/ConfirmRestored/ConfirmRestored.tsx"), "utf8");
    const shopPanelSrc = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/restored/modules/shop/ShopGetItem/ShopGetItemPanel.tsx"), "utf8");
    const originalPrompt = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/popup/Prompt/Prompt.tsx"), "utf8");
    const originalConfirm = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/popup/Confirm/Confirm.tsx"), "utf8");
    assert.match(promptRestored, /from '\.\.\/\.\.\/\.\.\/restored\/components\/button\/ConfirmButton'/);
    assert.match(promptRestored, /from '\.\.\/\.\.\/\.\.\/restored\/components\/popup\/PopupFrame'/);
    assert.match(confirmRestored, /from '\.\.\/\.\.\/\.\.\/restored\/components\/button\/ConfirmButton'/);
    assert.match(shopPanelSrc, /from '\.\.\/\.\.\/\.\.\/components\/button\/ConfirmButton'/);
    assert.match(originalPrompt, /from '\.\.\/\.\.\/\.\.\/components\/button\/ConfirmButton'/);
    assert.match(originalConfirm, /from '\.\.\/\.\.\/\.\.\/components\/button\/ConfirmButton'/);
    assert.doesNotMatch(originalPrompt, /restored/);
    assert.doesNotMatch(originalConfirm, /restored/);
});

test("star upgrade and alliance announce share ConfirmButton with shop", async () => {
    const confirmId = componentGuid("ConfirmButton");
    const closeId = componentGuid("CloseButton");
    const starPage = await readArtPsd(resolve(root, "apps/art/uniflex/HeroStarUpgrade/screen.psd"));
    const announcePage = await readArtPsd(resolve(root, "apps/art/uniflex/AllianceAnnounce/screen.psd"));
    const starPanel = await readArtPsd(artComponentPsdPath(root, "HeroStarUpgradePanel"));
    const announcePanel = await readArtPsd(artComponentPsdPath(root, "AllianceAnnouncePanel"));
    assert.equal(linkedPaths(starPage).get(componentGuid("HeroStarUpgradePanel"))?.relativePath,
        "../components/HeroStarUpgradePanel/component.psd");
    assert.equal(collectPlaced(starPage).some((item) => item.id === confirmId), false);
    assert.equal(linkedPaths(announcePage).get(componentGuid("AllianceAnnouncePanel"))?.relativePath,
        "../components/AllianceAnnouncePanel/component.psd");
    assert.equal(linkedPaths(starPanel).get(confirmId)?.relativePath, "../ConfirmButton/component.psd");
    assert.equal(linkedPaths(starPanel).get(closeId)?.relativePath, "../CloseButton/component.psd");
    assert.equal(linkedPaths(announcePanel).get(confirmId)?.relativePath, "../ConfirmButton/component.psd");
    assert.equal(linkedPaths(announcePanel).get(closeId)?.relativePath, "../CloseButton/component.psd");
    const starRestored = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/hero/HeroStarUpgradeRestored/HeroStarUpgradeRestored.tsx"),
        "utf8");
    const starPanelSrc = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/restored/modules/hero/HeroStarUpgrade/HeroStarUpgradePanel.tsx"),
        "utf8");
    const announceRestored = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/alliance/AllianceAnnounceRestored/AllianceAnnounceRestored.tsx"),
        "utf8");
    const announcePanelSrc = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/restored/modules/alliance/AllianceAnnounce/AllianceAnnouncePanel.tsx"),
        "utf8");
    const originalStar = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/hero/HeroStarUpgrade/HeroStarUpgrade.tsx"), "utf8");
    assert.match(starRestored, /from '\.\.\/\.\.\/\.\.\/restored\/modules\/hero\/HeroStarUpgrade\/HeroStarUpgradePanel'/);
    assert.match(starPanelSrc, /from '\.\.\/\.\.\/\.\.\/components\/button\/ConfirmButton'/);
    assert.match(announceRestored, /from '\.\.\/\.\.\/\.\.\/restored\/modules\/alliance\/AllianceAnnounce\/AllianceAnnouncePanel'/);
    assert.match(announcePanelSrc, /from '\.\.\/\.\.\/\.\.\/components\/button\/ConfirmButton'/);
    assert.match(originalStar, /from '\.\/HeroStarUpgradePanel'/);
    assert.doesNotMatch(originalStar, /restored/);
});

test("settings and alliance share the same WideMenuButton file", async () => {
    const buttonId = componentGuid("WideMenuButton");
    const homeId = componentGuid("AllianceHomePanel");
    const settings = await readArtPsd(resolve(root, "apps/art/uniflex/Settings/screen.psd"));
    const alliance = await readArtPsd(resolve(root, "apps/art/uniflex/Alliance/screen.psd"));
    const home = await readArtPsd(artComponentPsdPath(root, "AllianceHomePanel"));
    assert.equal(linkedPaths(settings).get(buttonId)?.relativePath,
        "../components/WideMenuButton/component.psd");
    assert.equal(linkedPaths(settings).get(buttonId)?.childDocumentID, "");
    assert.equal(collectPlaced(settings).filter((item) => item.id === buttonId).length, 10);
    assert.equal(linkedPaths(alliance).get(homeId)?.relativePath,
        "../components/AllianceHomePanel/component.psd");
    assert.equal(collectPlaced(alliance).some((item) => item.id === buttonId), false);
    assert.equal(linkedPaths(home).get(buttonId)?.relativePath, "../WideMenuButton/component.psd");
    assert.equal(collectPlaced(home).filter((item) => item.id === buttonId).length, 7);
    const settingsRestored = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/settings/SettingsRestored/SettingsRestored.tsx"), "utf8");
    const allianceRestored = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/alliance/AllianceRestored/AllianceRestored.tsx"), "utf8");
    const homeSrc = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/alliance/Alliance/AllianceHomePanel.tsx"), "utf8");
    const originalSettings = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/settings/Settings/Settings.tsx"), "utf8");
    const originalAlliance = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/alliance/Alliance/Alliance.tsx"), "utf8");
    assert.match(settingsRestored, /from '\.\.\/\.\.\/\.\.\/components\/button\/WideMenuButton'/);
    assert.match(allianceRestored, /from '\.\.\/Alliance\/AllianceHomePanel'/);
    assert.match(homeSrc, /from '\.\.\/\.\.\/\.\.\/components\/button\/WideMenuButton'/);
    assert.match(originalSettings, /from '\.\.\/\.\.\/\.\.\/components\/button\/WideMenuButton'/);
    assert.match(originalAlliance, /from '\.\/AllianceHomePanel'/);
    assert.doesNotMatch(originalSettings, /restored/);
    assert.doesNotMatch(originalAlliance, /restored/);
});

test("page-side linked-components.json manifests stay out of the committed art tree", async () => {
    const artRoot = resolve(root, "apps/art/uniflex");
    const offenders = [];
    for (const entry of await readdir(artRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === "components") continue;
        if ((await readdir(join(artRoot, entry.name))).includes("linked-components.json"))
            offenders.push(entry.name);
    }
    assert.deepEqual(offenders, []);
});
