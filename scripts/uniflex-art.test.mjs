import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import ts from "typescript";
import {
    artComponentPsdPath, artPsdPath, classifyArtPage, componentPublishAction, findArtPage,
    isArtScreen, loadArtCatalog,
} from "./lib/uniflex-art.mjs";
import {
    classifyOverride, indexComponentBase, propDocumentKey, rebaseComponentKey,
} from "../node_modules/web-ui-to-psd/lib/uniflex-linked-psd.mjs";
import { decodeUniFlexMetadata } from "../node_modules/web-ui-to-psd/lib/uniflex-metadata.mjs";
import {
    auditPsdLinks, bindExternalLinks, componentDocumentId, definitionKeyFromIdentity,
    psdSections, stampComponentDocument,
} from "./lib/uniflex-link-identity.mjs";
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
        resolve(root, "apps/art/uniflex/components/BackpackItemCard/BackpackItemCard.psd"),
    );
});

test("component PSD publish replaces a source change once and keeps designer edits", () => {
    assert.equal(componentPublishAction({
        destSha: "psd", exportedPsd: "psd", recordedUniflex: "old", uniflexSha: "new",
    }), "replace");
    assert.equal(componentPublishAction({
        destSha: "psd", exportedPsd: "psd", recordedUniflex: "same", uniflexSha: "same",
    }), "keep-shared");
    assert.equal(componentPublishAction({
        destSha: "edited", exportedPsd: "psd", recordedUniflex: "old", uniflexSha: "new",
    }), "keep-designer");
    assert.equal(componentPublishAction({
        destSha: null, exportedPsd: "psd", recordedUniflex: "old", uniflexSha: "new",
    }), "replace");
    assert.equal(componentPublishAction({
        destSha: "psd", exportedPsd: "psd", recordedUniflex: "same", uniflexSha: "same", pageScoped: true,
    }), "replace");
    assert.equal(componentPublishAction({
        destSha: "edited", exportedPsd: "psd", recordedUniflex: "same", uniflexSha: "same", pageScoped: true,
    }), "keep-designer");
});

test("nested component keys drop the page that hosted the canonical instance", () => {
    const instanceKey = "TabBar:Backpack/TabBar";
    assert.equal(
        rebaseComponentKey(
            "Tab:Backpack/TabBar/TabBar/Scroll/TabBar/Track/_/TabBar/Item:0/Tab/_",
            instanceKey,
            "TabBar",
        ),
        "Tab/TabBar/Scroll/TabBar/Track/_/TabBar/Item:0/Tab/_",
    );
    assert.equal(
        rebaseComponentKey(
            "Tab:MailBattleReport/TabBar/TabBar/Scroll/TabBar/Track/_/TabBar/Item:0/Tab/_",
            "TabBar:MailBattleReport/TabBar",
            "TabBar",
        ),
        "Tab/TabBar/Scroll/TabBar/Track/_/TabBar/Item:0/Tab/_",
    );
    assert.equal(
        rebaseComponentKey("ScreenHeader:Alliance/ScreenHeader/_", "ScreenHeader:Alliance/ScreenHeader", "ScreenHeader"),
        "ScreenHeader/_",
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
    const page = await readArtPsd(resolve(root, "apps/art/uniflex/Backpack/Backpack.psd"));
    const placed = collectPlaced(page);
    const linked = linkedPaths(page);
    const cardId = componentGuid("BackpackItemCard");
    const slotId = componentGuid("ItemSlot");
    const cards = placed.filter((item) => item.id === cardId);
    assert.equal(cards.length, 8);
    assert.equal(linked.get(cardId)?.relativePath, "../components/BackpackItemCard/BackpackItemCard.psd");
    assert.equal(linked.get(cardId)?.fullPath, "");
    assert.equal(linked.get(cardId)?.childDocumentID, componentDocumentId("BackpackItemCard"));
    assert.equal(linked.get(slotId)?.relativePath, "../components/ItemSlot/ItemSlot.psd");
    assert.equal(placed.filter((item) => item.id === slotId).length, 8);
    assert.equal(linked.get(componentGuid("TabBar"))?.relativePath,
        "../components/TabBar/TabBar.psd");
    assert.equal(linked.get(componentGuid("Tab"))?.relativePath, "../components/Tab/Tab.psd");
    assert.equal(placed.filter((item) => item.id === componentGuid("Tab")).length, 5);
    assert.equal(linked.get(componentGuid("BackpackQuantityControl"))?.relativePath,
        "../components/BackpackQuantityControl/BackpackQuantityControl.psd");
    assert.equal(linked.get(componentGuid("QuantityControl"))?.relativePath,
        "../components/QuantityControl/QuantityControl.psd");
});

test("nested restorables are linked from the page, not buried in the parent", async () => {
    const card = await readArtPsd(artComponentPsdPath(root, "BackpackItemCard"));
    const qty = await readArtPsd(artComponentPsdPath(root, "BackpackQuantityControl"));
    const page = await readArtPsd(resolve(root, "apps/art/uniflex/Backpack/Backpack.psd"));
    const slotId = componentGuid("ItemSlot");
    const quantityId = componentGuid("QuantityControl");
    assert.equal(collectPlaced(card).some((item) => item.id === slotId), false);
    assert.equal(collectPlaced(qty).some((item) => item.id === quantityId), false);
    assert.equal(linkedPaths(page).get(slotId)?.relativePath, "../components/ItemSlot/ItemSlot.psd");
    assert.equal(linkedPaths(page).get(slotId)?.childDocumentID, componentDocumentId("ItemSlot"));
    assert.equal(linkedPaths(page).get(quantityId)?.relativePath,
        "../components/QuantityControl/QuantityControl.psd");
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
    assert.match(originalCard, /from '\.\.\/\.\.\/\.\.\/\.\.\/gamecomponents\/item\/ItemSlot'/);
    for (const source of [originalPage, originalCard]) {
        const ast = ts.createSourceFile("original.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        for (const statement of ast.statements) {
            if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
                assert.doesNotMatch(statement.moduleSpecifier.text, /restored/i, "原始组件不得倒导 Restored 源码");
            }
        }
    }
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
    const shopPage = await readArtPsd(resolve(root, "apps/art/uniflex/ShopGetItem/ShopGetItem.psd"));
    assert.equal(collectPlaced(card).some((item) => item.id === slotId), false);
    assert.equal(collectPlaced(panel).some((item) => item.id === slotId), false);
    assert.equal(linkedPaths(shopPage).get(slotId)?.relativePath, "../components/ItemSlot/ItemSlot.psd");
    assert.equal(linkedPaths(shopPage).get(slotId)?.childDocumentID, componentDocumentId("ItemSlot"));
    assert.equal(
        linkedPaths(shopPage).get(componentGuid("ShopGetItemPanel"))?.relativePath,
        "../components/ShopGetItemPanel/ShopGetItemPanel.psd",
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
    assert.match(shopPanel, /from '\.\.\/\.\.\/\.\.\/gamecomponents\/item\/ItemSlot'/);
    assert.match(heroRestored, /from '\.\.\/\.\.\/\.\.\/restored\/modules\/hero\/HeroScreen\/HeroBondsPanel'/);
    assert.match(heroRequired, /from '\.\.\/\.\.\/\.\.\/gamecomponents\/item\/ItemSlot'/);
    assert.match(originalShop, /from '\.\/ShopGetItemPanel'/);
    assert.doesNotMatch(originalShop, /restored/);
});

test("confirm and shop share the same ConfirmButton file", async () => {
    const confirmId = componentGuid("ConfirmButton");
    const cancelId = componentGuid("CancelButton");
    const actionId = componentGuid("ActionButton");
    const confirm = await readArtPsd(resolve(root, "apps/art/uniflex/Confirm/Confirm.psd"));
    const shopPanel = await readArtPsd(artComponentPsdPath(root, "ShopGetItemPanel"));
    const confirmBtn = await readArtPsd(artComponentPsdPath(root, "ConfirmButton"));
    const cancelBtn = await readArtPsd(artComponentPsdPath(root, "CancelButton"));
    assert.equal(linkedPaths(confirm).get(confirmId)?.relativePath,
        "../components/ConfirmButton/ConfirmButton.psd");
    assert.equal(linkedPaths(confirm).get(confirmId)?.childDocumentID, componentDocumentId("ConfirmButton"));
    assert.equal(linkedPaths(confirm).get(cancelId)?.relativePath,
        "../components/CancelButton/CancelButton.psd");
    assert.equal(collectPlaced(shopPanel).some((item) => item.id === confirmId), false);
    assert.equal(collectPlaced(confirmBtn).some((item) => item.id === actionId), false);
    assert.equal(collectPlaced(cancelBtn).some((item) => item.id === actionId), false);
    const confirmRestored = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/popup/ConfirmRestored/ConfirmRestored.tsx"), "utf8");
    const shopPanelSrc = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/restored/modules/shop/ShopGetItem/ShopGetItemPanel.tsx"), "utf8");
    const originalConfirm = await readFile(
        resolve(root, "apps/client/src/ui-uniflex/modules/popup/Confirm/Confirm.tsx"), "utf8");
    assert.match(confirmRestored, /from '\.\.\/\.\.\/\.\.\/restored\/components\/button\/ConfirmButton'/);
    assert.match(shopPanelSrc, /from '\.\.\/\.\.\/\.\.\/components\/button\/ConfirmButton'/);
    assert.match(originalConfirm, /from '\.\.\/\.\.\/\.\.\/components\/button\/ConfirmButton'/);
    assert.doesNotMatch(originalConfirm, /restored/);
});

test("star upgrade and alliance announce share ConfirmButton with shop", async () => {
    const confirmId = componentGuid("ConfirmButton");
    const closeId = componentGuid("CloseButton");
    const starPage = await readArtPsd(resolve(root, "apps/art/uniflex/HeroStarUpgrade/HeroStarUpgrade.psd"));
    const announcePage = await readArtPsd(resolve(root, "apps/art/uniflex/AllianceAnnounce/AllianceAnnounce.psd"));
    const starPanel = await readArtPsd(artComponentPsdPath(root, "HeroStarUpgradePanel"));
    const announcePanel = await readArtPsd(artComponentPsdPath(root, "AllianceAnnouncePanel"));
    assert.equal(linkedPaths(starPage).get(componentGuid("HeroStarUpgradePanel"))?.relativePath,
        "../components/HeroStarUpgradePanel/HeroStarUpgradePanel.psd");
    assert.equal(linkedPaths(starPage).get(confirmId)?.relativePath,
        "../components/ConfirmButton/ConfirmButton.psd");
    assert.equal(linkedPaths(starPage).get(closeId)?.relativePath,
        "../components/CloseButton/CloseButton.psd");
    assert.equal(linkedPaths(announcePage).get(componentGuid("AllianceAnnouncePanel"))?.relativePath,
        "../components/AllianceAnnouncePanel/AllianceAnnouncePanel.psd");
    assert.equal(linkedPaths(announcePage).get(confirmId)?.relativePath,
        "../components/ConfirmButton/ConfirmButton.psd");
    assert.equal(linkedPaths(announcePage).get(closeId)?.relativePath,
        "../components/CloseButton/CloseButton.psd");
    assert.equal(collectPlaced(starPanel).some((item) => item.id === confirmId), false);
    assert.equal(collectPlaced(starPanel).some((item) => item.id === closeId), false);
    assert.equal(collectPlaced(announcePanel).some((item) => item.id === confirmId), false);
    assert.equal(collectPlaced(announcePanel).some((item) => item.id === closeId), false);
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
    const settings = await readArtPsd(resolve(root, "apps/art/uniflex/Settings/Settings.psd"));
    const alliance = await readArtPsd(resolve(root, "apps/art/uniflex/Alliance/Alliance.psd"));
    const home = await readArtPsd(artComponentPsdPath(root, "AllianceHomePanel"));
    assert.equal(linkedPaths(settings).get(buttonId)?.relativePath,
        "../components/WideMenuButton/WideMenuButton.psd");
    assert.equal(linkedPaths(settings).get(buttonId)?.childDocumentID, componentDocumentId("WideMenuButton"));
    assert.equal(collectPlaced(settings).filter((item) => item.id === buttonId).length, 10);
    assert.equal(linkedPaths(alliance).get(homeId)?.relativePath,
        "../components/AllianceHomePanel/AllianceHomePanel.psd");
    assert.equal(linkedPaths(alliance).get(buttonId)?.relativePath,
        "../components/WideMenuButton/WideMenuButton.psd");
    assert.equal(collectPlaced(alliance).filter((item) => item.id === buttonId).length, 7);
    assert.equal(collectPlaced(home).some((item) => item.id === buttonId), false);
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
    assert.match(settingsRestored, /from '\.\.\/\.\.\/\.\.\/(restored\/)?components\/button\/WideMenuButton'/);
    assert.match(allianceRestored, /from '\.\.\/Alliance\/AllianceHomePanel'/);
    assert.match(homeSrc, /from '\.\.\/\.\.\/\.\.\/components\/button\/WideMenuButton'/);
    assert.match(originalSettings, /from '\.\.\/\.\.\/\.\.\/(restored\/)?components\/button\/WideMenuButton'/);
    assert.match(originalAlliance, /from '\.\/AllianceHomePanel'/);
    // Settings is mid-migration to restored/ components; its no-restored
    // invariant returns once that lands.
    assert.doesNotMatch(originalAlliance, /restored/);
});

test("shared ResourceCounter and Tab PSD identities are the component", async () => {
    const { readPsd } = loadAgPsd();
    for (const key of ["ResourceCounter", "Tab"]) {
        const psd = readPsd(await readFile(artComponentPsdPath(root, key)), {
            skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true,
        });
        const names = [];
        const walk = (layer) => {
            if (layer.name) names.push(layer.name);
            for (const child of layer.children || []) walk(child);
        };
        for (const child of psd.children || []) walk(child);
        assert.ok(names.some((name) => name.includes(`[ui:${key}#component]`)), key);
        assert.equal(names.some((name) => name.includes("Backpack/") || name.includes("Alliance/")), false, key);
    }
});

test("backpack tabs live in TabBar and keep their own labels", async () => {
    const page = await readArtPsd(resolve(root, "apps/art/uniflex/Backpack/Backpack.psd"));
    const bar = await readArtPsd(artComponentPsdPath(root, "TabBar"));
    const snapshot = decodeUniFlexMetadata(bar.imageResources?.xmpMetadata);
    const values = new Set((snapshot?.nodes || []).filter((node) => node.kind === "text").map((node) => node.value));
    for (const label of ["装备", "资源", "加速", "增益", "其他"])
        assert.ok(values.has(label), label);
    assert.equal((snapshot?.nodes || []).some((node) => node.identity?.key?.includes("Backpack/")), false);
    assert.equal(collectPlaced(bar).some((item) => item.id === componentGuid("Tab")), false);
    assert.equal(linkedPaths(page).get(componentGuid("Tab"))?.relativePath, "../components/Tab/Tab.psd");
    assert.equal(collectPlaced(page).filter((item) => item.id === componentGuid("Tab")).length, 5);
    assert.equal(collectPlaced(page).filter((item) => item.id === componentGuid("ResourceCounter")).length, 4);
});

test("shared ScreenHeader PSD identity is the component, not a page instance", async () => {
    const { readPsd } = loadAgPsd();
    const psd = readPsd(await readFile(artComponentPsdPath(root, "ScreenHeader")), {
        skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true,
    });
    const names = [];
    const walk = (layer) => {
        if (layer.name) names.push(layer.name);
        for (const child of layer.children || []) walk(child);
    };
    for (const child of psd.children || []) walk(child);
    assert.ok(names.some((name) => name.includes("[ui:ScreenHeader#component]")));
    assert.equal(names.some((name) => name.includes("Alliance/")), false);
});

test("ScreenHeader instance overrides are the properties that differ from the component", async () => {
    const { readPsd } = loadAgPsd();
    const { pathToFileURL } = await import("node:url");
    const meta = await import(pathToFileURL(resolve(root, "node_modules/web-ui-to-psd/lib/uniflex-metadata.mjs")).href);
    const snapshotOf = (file) => {
        const psd = readPsd(readFileSync(file), {
            skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true,
        });
        return meta.decodeUniFlexMetadata(psd.imageResources?.xmpMetadata);
    };
    const base = indexComponentBase(snapshotOf(artComponentPsdPath(root, "ScreenHeader")));
    assert.equal(base.texts.get("ScreenHeader/_"), "联盟");
    assert.equal(base.images.get("ScreenHeader/_"), "ui/mail/header");
    const catalog = await loadArtCatalog(root);
    const expectOverride = (screen, title) => {
        const page = findArtPage(catalog, screen);
        const snapshot = snapshotOf(artPsdPath(root, page));
        const instance = snapshot.componentDeclarations.instances
            .find((item) => item.definitionKey === "ScreenHeader" && item.key.startsWith("ScreenHeader:"));
        assert.ok(instance, `${screen} ScreenHeader instance`);
        const nodes = snapshot.nodes.filter((node) => node.identity?.key?.startsWith(`${instance.key}/`)
            || node.identity?.key === instance.key);
        const text = nodes.find((node) => node.kind === "text");
        const image = nodes.find((node) => node.kind === "image");
        assert.equal(classifyOverride(text, base, instance.key, "ScreenHeader")?.kind, "text");
        assert.equal(classifyOverride(text, base, instance.key, "ScreenHeader").value, title);
        return classifyOverride(image, base, instance.key, "ScreenHeader");
    };
    assert.equal(expectOverride("backpack", "背包")?.kind, "image");
    assert.equal(expectOverride("mail", "邮件"), null);
    const alliance = findArtPage(catalog, "alliance");
    const allianceSnap = snapshotOf(artPsdPath(root, alliance));
    const allianceHeader = allianceSnap.componentDeclarations.instances
        .find((item) => item.key === "ScreenHeader:Alliance/ScreenHeader");
    const allianceText = allianceSnap.nodes.find((node) => node.kind === "text"
        && node.identity?.key === `${allianceHeader.key}/_`);
    assert.equal(classifyOverride(allianceText, base, allianceHeader.key, "ScreenHeader"), null);
});

test("overridable ScreenHeader properties are their own documents", async () => {
    assert.equal(propDocumentKey("ScreenHeader", "text", "ScreenHeader/_"), "ScreenHeaderText");
    assert.equal(propDocumentKey("ScreenHeader", "image", "ScreenHeader/_"), "ScreenHeaderImage");
    const { readPsd } = loadAgPsd();
    const structure = readPsd(await readFile(artComponentPsdPath(root, "ScreenHeader")), {
        skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true,
    });
    const names = [];
    const walk = (layer) => {
        if (layer.name) names.push(layer.name);
        if (layer.text) names.push(`text:${layer.text.text}`);
        for (const child of layer.children || []) walk(child);
    };
    for (const child of structure.children || []) walk(child);
    assert.ok(names.some((name) => name.includes("[ui:ScreenHeader#component]")));
    assert.equal(names.some((name) => name.startsWith("text:")), false);
    assert.equal(names.some((name) => name.includes("#override")), false);
    const text = readPsd(await readFile(resolve(root,
        "apps/art/uniflex/components/ScreenHeader/ScreenHeaderText.psd")), {
        skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true,
    });
    const textLayer = [];
    const walkText = (layer) => {
        if (layer.text) textLayer.push(layer.text.text);
        for (const child of layer.children || []) walkText(child);
    };
    for (const child of text.children || []) walkText(child);
    assert.deepEqual(textLayer, ["联盟"]);
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

function imageBytes(buffer) {
    return buffer.subarray(psdSections(buffer).layerEnd);
}

function layerPrefix(buffer) {
    const start = psdSections(buffer).layerStart;
    const marker = buffer.indexOf(Buffer.from("8BIMlnkE"), start);
    assert.ok(marker > start);
    return buffer.subarray(start, marker);
}

test("component document ids stay attached without rewriting pixels", () => {
    const original = readFileSync(resolve(root,
        "scripts/fixtures/uniflex-inline/BackpackItemCard.psd"));
    const stamped = stampComponentDocument(original, "BackpackItemCard");
    const bound = bindExternalLinks(stamped, [{
        documentId: componentDocumentId("ItemSlot"),
        fileSize: 12345,
    }]);
    assert.ok(imageBytes(original).equals(imageBytes(stamped)));
    assert.ok(imageBytes(original).equals(imageBytes(bound)));
    assert.ok(layerPrefix(original).equals(layerPrefix(bound)));
    const { readPsd } = loadAgPsd();
    const psd = readPsd(bound, {
        skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true,
    });
    assert.equal(psd.linkedFiles[0].childDocumentID, componentDocumentId("ItemSlot"));
    assert.equal(psd.linkedFiles[0].linkedFile.fileSize, 12345);
    assert.equal(psd.imageResources.xmpMetadata.includes(componentDocumentId("BackpackItemCard")), true);
    assert.ok(decodeUniFlexMetadata(psd.imageResources.xmpMetadata));
});

test("a smart object whose identity and link disagree is rejected", () => {
    assert.equal(definitionKeyFromIdentity("Tab:Backpack/TabBar/TabBar/Track/_/TabBar/Item:0/Tab"), "Tab");
    assert.equal(definitionKeyFromIdentity("Tab/_"), "Tab");
    assert.notEqual(componentDocumentId("Tab"), componentDocumentId("ResourceCounter"));
    const resource = componentGuid("ResourceCounter");
    const problems = auditPsdLinks({
        linkedFiles: [{
            id: resource,
            childDocumentID: componentDocumentId("ResourceCounter"),
            linkedFile: {
                relativePath: "../components/ResourceCounter/ResourceCounter.psd",
                fileSize: 10,
            },
        }],
        children: [{
            name: "ResourceCounter [ui:Tab:Backpack/TabBar/TabBar/Track/_/TabBar/Item:0/Tab#component]",
            placedLayer: { id: resource },
        }],
    }, "Backpack.psd", () => 10);
    assert.match(problems.join("\n"), /is Tab but links ResourceCounter/);
    const bare = auditPsdLinks({
        linkedFiles: [{
            id: componentGuid("Tab"),
            childDocumentID: "",
            linkedFile: { relativePath: "../components/Tab/Tab.psd", fileSize: 4 },
        }],
        children: [],
    }, "Backpack.psd", () => 4);
    assert.match(bare.join("\n"), /no stable document id/);
});
