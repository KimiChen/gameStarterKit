import { childId, fairyId, packageIds, projectId } from "./ids.mjs";
import { parseCssColor, toFguiXmlColor } from "./bytes.mjs";
import { toScale9Grid } from "./nine-slice.mjs";
import { imageBasename, imageStem } from "./resources.mjs";
import { solidPng } from "./solid-png.mjs";
import {
    ACTION_OUTLINE, ACTION_OUTLINE_BY_RESOURCE, BUTTON_COMPONENTS, COMMON_COMPONENTS,
    COMMON_PACKAGE, DEFAULT_STYLES, KNOWN_LOSSES, ObjectPropID, ObjectType,
    PREVIEW_FONT_FAMILY, SLOT_HOSTS, WRAPPER_BUTTONS, uniflexStrokeSize,
} from "./constants.mjs";

export function buildProjectIR(snapshot, options = {}) {
    return buildCatalogIR([{ snapshot, screen: options.screen, hostPlan: options.hostPlan }], options);
}

export function buildCatalogIR(pages, options = {}) {
    if (!Array.isArray(pages) || pages.length === 0) throw new Error("Missing snapshot.");
    const catalog = options.catalog ?? { components: [] };
    const keys = sharedKeysFrom(catalog);
    const buttons = new Set(BUTTON_COMPONENTS);
    const images = options.images ?? new Map();
    const losses = [...KNOWN_LOSSES];
    const missing = [];

    const commonPkg = {
        ...packageIds(COMMON_PACKAGE),
        name: COMMON_PACKAGE,
        images: [],
        components: [],
        dependencies: [],
    };
    const imageItems = new Map();
    const internImage = (resourceId) => {
        if (!resourceId) return null;
        if (imageItems.has(resourceId)) return imageItems.get(resourceId);
        const asset = images.get(resourceId);
        if (!asset) {
            missing.push(resourceId);
            return null;
        }
        const name = imageStem(asset);
        const fileName = imageBasename(asset);
        const grid = asset.nineSlice
            ? toScale9Grid(asset.nineSlice, asset.width, asset.height)
            : null;
        const item = {
            id: fairyId(`img:${COMMON_PACKAGE}:${resourceId}`),
            name,
            fileName,
            path: "/images/",
            width: asset.width,
            height: asset.height,
            scale9grid: grid,
            sourcePath: asset.sourcePath,
            resourceId,
            exported: true,
        };
        imageItems.set(resourceId, item);
        commonPkg.images.push(item);
        return item;
    };

    const templates = new Map();
    const signatures = new Map();
    const extraSignatures = new Map();
    const nestedVariants = new Map();
    const textSkins = new Map();
    const prepared = [];

    for (const page of pages) {
        const snapshot = page.snapshot;
        assertSnapshot(snapshot);
        const screen = page.screen ?? inferScreen(snapshot, catalog);
        if (!screen?.componentName) throw new Error("Missing screen metadata (componentName).");
        const canvas = snapshot.canvas ?? screen.canvas;
        if (!canvas?.width || !canvas?.height) throw new Error("Snapshot is missing canvas size.");
        const rawNodes = snapshot.nodes;
        if (!Array.isArray(rawNodes) || rawNodes.length === 0) throw new Error("Snapshot has no nodes.");
        const nodes = toComponentSpace(rawNodes);

        const declarations = declarationsFor(snapshot, screen, catalog.components ?? [], nodes);
        const byId = new Map(nodes.map((node) => [node.id, node]));
        const childrenOf = indexChildren(nodes);
        const instanceByRoot = new Map(
            (declarations.instances ?? []).map((instance) => [instance.rootRecordId, instance]),
        );
        const planIndex = indexPlan(page.hostPlan);
        const found = firstInstances(declarations.instances ?? [], byId);
        for (const key of keys) {
            if (templates.has(key)) continue;
            const root = found.get(key);
            if (!root) continue;
            templates.set(key, { root, byId, childrenOf, instanceByRoot, ...planIndex });
            signatures.set(key, componentSignature(root, childrenOf));
            extraSignatures.set(key, extraVisibleImages(root, childrenOf));
            nestedVariants.set(key, nestedVariantSignature(root, childrenOf, instanceByRoot));
            textSkins.set(key, textSkinSignature(root, childrenOf));
        }
        prepared.push({ snapshot, screen, canvas, nodes, byId, childrenOf, instanceByRoot, ...planIndex });
    }

    const internFill = internFillImage(commonPkg);
    const shared = new Set([...templates.keys()].filter((key) => !SLOT_HOSTS.includes(key)));
    const sharedCtx = {
        internImage,
        internFill,
        losses,
        shared,
        signatures,
        extraSignatures,
        nestedVariants,
        textSkins,
        buttons,
        wrappers: new Set(WRAPPER_BUTTONS),
        templateOf: (key) => commonPkg.components.find((item) => item.name === key),
    };

    for (const key of topoComponentKeys([...templates.keys()], templates, shared)) {
        const template = templates.get(key);
        if (!template) continue;
        if (template.root.interaction === "press") buttons.add(key);
        const skipSlot = SLOT_HOSTS.includes(key);
        const displayList = flatten({
            ...sharedCtx,
            ...template,
            origin: template.root.rect,
            skipSlot,
            pkg: commonPkg,
        });
        const isButton = buttons.has(key);
        commonPkg.components.push({
            id: fairyId(`comp:${COMMON_PACKAGE}:${key}`),
            name: key,
            exported: true,
            size: roundSize(template.root.rect),
            extension: isButton ? "Button" : null,
            objectType: isButton ? ObjectType.Button : ObjectType.Component,
            children: displayList,
            remark: skipSlot
                ? `${key} is a shell template; slot content lives on the page.`
                : undefined,
        });
    }

    const pagePkgs = [];
    const screens = [];
    for (const item of prepared) {
        const pagePackageName = `UniFlex_${item.screen.componentName}`;
        const pagePkg = {
            ...packageIds(pagePackageName),
            name: pagePackageName,
            images: [],
            components: [],
            dependencies: [{ id: commonPkg.id, name: commonPkg.name }],
        };
        const pageRoot = item.nodes.find((node) => node.parent == null) ?? item.nodes[0];
        const pageDisplay = flatten({
            ...sharedCtx,
            pkg: pagePkg,
            root: pageRoot,
            origin: { x: 0, y: 0 },
            byId: item.byId,
            childrenOf: item.childrenOf,
            instanceByRoot: item.instanceByRoot,
            planByName: item.planByName,
            planById: item.planById,
            planByComponent: item.planByComponent,
            skipSlot: false,
            inlineSlotHosts: true,
        });
        pagePkg.components.push({
            id: fairyId(`comp:${pagePackageName}:${item.screen.componentName}`),
            name: item.screen.componentName,
            exported: true,
            size: { width: item.canvas.width, height: item.canvas.height },
            extension: null,
            objectType: ObjectType.Component,
            children: pageDisplay,
            relations: [{ target: "", sidePair: "width-width,height-height" }],
        });
        pagePkgs.push(pagePkg);
        screens.push({
            id: item.screen.id ?? item.snapshot.screenId ?? item.screen.componentName.toLowerCase(),
            componentName: item.screen.componentName,
            source: item.screen.source,
            rootName: item.screen.rootName,
            packageName: pagePkg.name,
            canvas: item.canvas,
        });
    }

    if (missing.length) {
        losses.push(`未找到资源：${[...new Set(missing)].join(", ")}`);
    }

    const projectName = screens.length === 1 ? screens[0].componentName : "catalog";
    return {
        kind: "uniflex-fgui-ir",
        candidate: true,
        project: {
            id: projectId(`uniflex-fgui:${projectName}`),
            name: "UniFlexExport",
            type: "CocosCreator",
        },
        canvas: unionCanvas(screens),
        screen: screens[0],
        screens,
        packages: [commonPkg, ...pagePkgs],
        mapping: buildMapping(commonPkg, pagePkgs, screens),
        report: {
            kind: "uniflex-fgui-export",
            candidate: true,
            screen: screens.length === 1 ? screens[0].id : screens.map((entry) => entry.id),
            screens: screens.map((entry) => entry.id),
            slot: "PopupFrame 是外壳模板；各页是特化树，不是 PopupFrame 实例 + 运行时插槽。",
            components: [commonPkg, ...pagePkgs].flatMap((pkg) => pkg.components.map((item) => ({
                package: pkg.name,
                name: item.name,
                id: item.id,
                exported: item.exported,
                extension: item.extension ?? null,
            }))),
            resources: commonPkg.images.map((item) => ({
                id: item.id, name: item.name, resourceId: item.resourceId,
                scale9grid: item.scale9grid?.attr ?? null,
            })),
            missingResources: [...new Set(missing)],
            losses,
        },
    };
}

function sharedKeysFrom(catalog) {
    const keys = (catalog.components ?? []).map((entry) => entry.key).filter(Boolean);
    return keys.length ? keys : [...COMMON_COMPONENTS];
}

function internFillImage(commonPkg) {
    const items = new Map();
    return (css) => {
        if (!css) return null;
        const hex = toFguiXmlColor(css, { alpha: true }).replace("#", "").toLowerCase();
        if (items.has(hex)) return items.get(hex);
        const { r, g, b, a } = parseCssColor(css);
        const fileName = `fill_${hex}.png`;
        const item = {
            id: fairyId(`img:${COMMON_PACKAGE}:fill:${hex}`),
            name: `fill_${hex}`,
            fileName,
            path: "/images/",
            width: 4,
            height: 4,
            bytes: solidPng(r, g, b, a, 4),
            resourceId: `fill:${hex}`,
            exported: true,
        };
        items.set(hex, item);
        commonPkg.images.push(item);
        return item;
    };
}

function nestedComponentKeys(root, childrenOf, instanceByRoot, shared) {
    const keys = new Set();
    const walk = (node) => {
        for (const child of childrenOf.get(node.id) ?? []) {
            const instance = instanceByRoot.get(child.id);
            if (instance && shared.has(instance.definitionKey)) {
                keys.add(instance.definitionKey);
                continue;
            }
            walk(child);
        }
    };
    walk(root);
    return [...keys];
}

function topoComponentKeys(keys, templates, shared) {
    const remaining = new Set(keys);
    const ordered = [];
    while (remaining.size) {
        let progressed = false;
        for (const key of [...remaining]) {
            const template = templates.get(key);
            const deps = template
                ? nestedComponentKeys(
                    template.root, template.childrenOf, template.instanceByRoot, shared,
                ).filter((dep) => dep !== key && remaining.has(dep))
                : [];
            if (deps.length) continue;
            ordered.push(key);
            remaining.delete(key);
            progressed = true;
        }
        if (!progressed) {
            ordered.push(...remaining);
            break;
        }
    }
    return ordered;
}

function declarationsFor(snapshot, screen, components, nodes) {
    let inferred = { definitions: [], instances: [] };
    try {
        inferred = declareOwnership(nodes, screen, components);
    } catch {
        inferred = { definitions: [], instances: [] };
    }
    const stamped = snapshot.componentDeclarations;
    if (!stamped) return inferred;
    const used = new Set((stamped.instances ?? []).map((instance) => instance.rootRecordId));
    const instances = [...(stamped.instances ?? [])];
    const definitions = [...(stamped.definitions ?? [])];
    const defKeys = new Set(definitions.map((entry) => entry.key));
    for (const instance of inferred.instances ?? []) {
        if (used.has(instance.rootRecordId)) continue;
        instances.push(instance);
        used.add(instance.rootRecordId);
    }
    for (const definition of inferred.definitions ?? []) {
        if (defKeys.has(definition.key)) continue;
        definitions.push(definition);
        defKeys.add(definition.key);
    }
    return { schemaVersion: 1, kind: "uniflex-component-declarations", definitions, instances };
}

function unionCanvas(screens) {
    return {
        width: Math.max(...screens.map((entry) => entry.canvas.width)),
        height: Math.max(...screens.map((entry) => entry.canvas.height)),
    };
}

function componentSignature(root, childrenOf) {
    const images = [];
    const walk = (node) => {
        if (node.visible === false) return;
        if (node.kind === "image" && node.resourceId) images.push(node.resourceId);
        for (const child of childrenOf.get(node.id) ?? []) walk(child);
    };
    walk(root);
    return `${Math.round(root.rect?.width ?? 0)}x${Math.round(root.rect?.height ?? 0)}:${images.join("|")}`;
}

function isSlotContent(name) {
    return SLOT_HOSTS.some((host) => name === `${host}/Content`);
}

function extraVisibleImages(root, childrenOf) {
    const images = [];
    const walk = (node) => {
        if (node.visible === false) return;
        if (node.kind === "image" && node.resourceId && node.name !== "ActionButton/Background") {
            images.push(node.resourceId);
        }
        for (const child of childrenOf.get(node.id) ?? []) walk(child);
    };
    walk(root);
    return images.join("|");
}

function nestedVariantSignature(root, childrenOf, instanceByRoot) {
    const parts = [];
    const walk = (node) => {
        for (const child of childrenOf.get(node.id) ?? []) {
            const nested = instanceByRoot.get(child.id);
            if (nested?.definitionKey === "ItemSlot") {
                parts.push(`ItemSlot:${componentSignature(child, childrenOf)}:${textValues(child, childrenOf)}`);
                continue;
            }
            walk(child);
        }
    };
    walk(root);
    return parts.join("||");
}

function textValues(root, childrenOf) {
    const texts = [];
    const walk = (node) => {
        if (node.visible === false) return;
        if (node.kind === "text") texts.push(node.value ?? "");
        for (const child of childrenOf.get(node.id) ?? []) walk(child);
    };
    walk(root);
    return texts.join("|");
}

function isReusableInstance(instance, node, ctx) {
    if (instance.definitionKey === "ItemSlot") return true;
    if ((ctx.nestedVariants?.get(instance.definitionKey) ?? "")
        !== nestedVariantSignature(node, ctx.childrenOf, ctx.instanceByRoot)) return false;
    if ((ctx.textSkins?.get(instance.definitionKey) ?? "")
        !== textSkinSignature(node, ctx.childrenOf)) return false;
    if (ctx.buttons.has(instance.definitionKey)) {
        if (ctx.extraSignatures.get(instance.definitionKey)
            !== extraVisibleImages(node, ctx.childrenOf)) return false;
        const templateSize = String(ctx.signatures.get(instance.definitionKey) ?? "").split(":")[0];
        const size = `${Math.round(node.rect?.width ?? 0)}x${Math.round(node.rect?.height ?? 0)}`;
        return templateSize === size;
    }
    return ctx.signatures.get(instance.definitionKey) === componentSignature(node, ctx.childrenOf);
}

function textSkinSignature(root, childrenOf) {
    const parts = [];
    const walk = (node) => {
        if (node.visible === false) return;
        if (node.kind === "text") {
            parts.push([
                node.color ?? "",
                node.fontSize ?? "",
                node.outlineColor ?? "",
                node.outlineWidth ?? "",
                node.bold ?? "",
            ].join(":"));
        }
        for (const child of childrenOf.get(node.id) ?? []) walk(child);
    };
    walk(root);
    return parts.join("|");
}

function assertSnapshot(snapshot) {
    if (!snapshot || snapshot.kind !== "uniflex-design-snapshot") {
        throw new Error("Expected kind=uniflex-design-snapshot.");
    }
    if (snapshot.schemaVersion !== 1) {
        throw new Error(`Unsupported snapshot schemaVersion: ${snapshot.schemaVersion}`);
    }
}

function inferScreen(snapshot, catalog) {
    if (snapshot.screen) return snapshot.screen;
    const id = snapshot.screenId;
    if (id && catalog?.screens) {
        return catalog.screens.find((entry) => entry.id === id || entry.componentName === id);
    }
    return catalog?.screens?.find((entry) => entry.default) ?? null;
}

/** FairyGUI displayList xy is component space. UniFlex inspect frames are parent-local. */
function toComponentSpace(nodes) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    if (!snapshotUsesLocalRects(nodes, byId)) return nodes;
    return nodes.map((node) => ({ ...node, rect: absoluteRect(node, byId) }));
}

function snapshotUsesLocalRects(nodes, byId) {
    for (const node of nodes) {
        if (node.parent == null || node.visible === false) continue;
        const parent = byId.get(node.parent);
        const rect = node.rect;
        const prect = parent?.rect;
        if (!rect || !prect) continue;
        const localInside = rect.x >= -0.5 && rect.y >= -0.5
            && rect.x + rect.width <= prect.width + 0.5
            && rect.y + rect.height <= prect.height + 0.5;
        const aboveOrLeft = rect.x + 0.5 < prect.x || rect.y + 0.5 < prect.y;
        if (localInside && aboveOrLeft && (prect.x > 0.5 || prect.y > 0.5)) return true;
    }
    return false;
}

function absoluteRect(node, byId) {
    let x = node.rect?.x ?? 0;
    let y = node.rect?.y ?? 0;
    let current = node;
    const seen = new Set();
    while (current.parent != null) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        current = byId.get(current.parent);
        if (!current) break;
        x += current.rect?.x ?? 0;
        y += current.rect?.y ?? 0;
    }
    return { x, y, width: node.rect?.width ?? 0, height: node.rect?.height ?? 0 };
}

function indexChildren(nodes) {
    const map = new Map();
    for (const node of nodes) {
        if (node.parent == null) continue;
        const list = map.get(node.parent) ?? [];
        list.push(node);
        map.set(node.parent, list);
    }
    return map;
}

function firstInstances(instances, byId) {
    const found = new Map();
    for (const instance of instances) {
        if (found.has(instance.definitionKey)) continue;
        const node = byId.get(instance.rootRecordId);
        if (!node || !isVisibleLaidOut(node, byId)) continue;
        found.set(instance.definitionKey, node);
    }
    return found;
}

function isVisibleLaidOut(node, byId) {
    let current = node;
    const seen = new Set();
    while (current) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        if (current.visible === false) return false;
        current = current.parent != null ? byId.get(current.parent) : null;
    }
    return (node.rect?.width ?? 0) >= 1 && (node.rect?.height ?? 0) >= 1;
}

function indexPlan(plan) {
    const empty = () => ({ planByName: new Map(), planById: new Map() });
    if (!plan) return { ...empty(), planByComponent: new Map() };
    const indexTree = (root) => {
        const planByName = new Map();
        const planById = new Map();
        const visit = (node) => {
            if (!node || typeof node !== "object") return;
            if (node.planId != null && !planById.has(node.planId)) planById.set(node.planId, node);
            const name = node.props?.name;
            if (typeof name === "string" && name && !planByName.has(name)) planByName.set(name, node);
            for (const child of node.children ?? []) visit(child);
            if (node.root) visit(node.root);
            if (node.repeat?.template) visit(node.repeat.template);
            if (node.virtual?.template) visit(node.virtual.template);
            if (node.props?.virtual?.template) visit(node.props.virtual.template);
        };
        visit(root);
        return { planByName, planById };
    };
    const page = indexTree(plan.root);
    const planByComponent = new Map();
    for (const [entryKey, entry] of Object.entries(plan.components ?? {})) {
        const root = entry.root ?? entry;
        const indexed = indexTree(root);
        const aliases = [];
        const name = root?.props?.name;
        if (typeof name === "string" && name) aliases.push(name);
        if (typeof entryKey === "string" && entryKey) {
            aliases.push(entryKey);
            const suffix = entryKey.includes("_") ? entryKey.slice(entryKey.lastIndexOf("_") + 1) : "";
            if (suffix) aliases.push(suffix);
        }
        for (const alias of aliases) {
            if (!planByComponent.has(alias)) planByComponent.set(alias, indexed);
        }
    }
    return { ...page, planByComponent };
}

function flatten(ctx) {
    const displayList = [];
    const pushFill = (node, groupIndex) => {
        const fill = fillChild(ctx, node, groupIndex, styleOf(node, ctx).backgroundColor);
        if (fill) displayList.push(fill);
    };
    if (ctx.inlineSlotHosts && SLOT_HOSTS.includes(ctx.root.name)) {
        const index = displayList.length;
        displayList.push(groupChild(ctx, ctx.root, -1));
        pushFill(ctx.root, index);
        flattenWalk(ctx, ctx.root, index, displayList);
    } else {
        pushFill(ctx.root, -1);
        flattenWalk(ctx, ctx.root, -1, displayList);
    }
    if (ctx.root.name === "ItemSlot") ensureItemSlotParts(displayList);
    assignChildIds(ctx.root.name || "root", displayList);
    if (!ctx.inlineSlotHosts) nameUnnamedTexts(displayList);
    return displayList;
}

/** Keep frame/icon/title on the ItemSlot template even if the first snapshot omits them. */
function ensureItemSlotParts(displayList) {
    if (!displayList.some((child) => child.kind === "loader" && child.name === "icon")) {
        displayList.push({
            kind: "loader",
            name: "icon",
            uniflexName: "ItemSlot/Icon",
            x: 13, y: 24, width: 129, height: 107,
            xy: [13, 24], size: [129, 107],
            url: "",
            fill: "none",
            group: -1,
            visible: true,
            touchable: false,
            relations: [],
        });
    }
    if (!displayList.some((child) => child.kind === "text" && child.name === "title")) {
        displayList.push({
            kind: "text",
            name: "title",
            uniflexName: "ItemSlot/Count",
            text: "",
            x: 87, y: 107, width: 57, height: 42,
            xy: [87, 107], size: [57, 42],
            fontSize: 32,
            font: PREVIEW_FONT_FAMILY,
            color: "#ffffff",
            align: "right",
            vAlign: "center",
            autoSize: "shrink",
            bold: true,
            strokeColor: "#000000",
            strokeSize: uniflexStrokeSize(2),
            singleLine: true,
            group: -1,
            visible: false,
            touchable: false,
            relations: [{ target: "", sidePair: "width-width,height-height" }],
        });
    }
}

function flattenWalk(ctx, node, groupIndex, displayList) {
    for (const child of ctx.childrenOf.get(node.id) ?? []) {
        if (child.visible === false) continue;
        if (ctx.skipSlot && isSlotContent(node.name)) continue;
        const instance = ctx.instanceByRoot.get(child.id);
        const shared = instance && ctx.shared.has(instance.definitionKey);
        const slotHost = instance && SLOT_HOSTS.includes(instance.definitionKey);
        if (shared && isReusableInstance(instance, child, ctx)) {
            displayList.push(componentChild(ctx, child, instance.definitionKey, groupIndex));
            continue;
        }
        if (slotHost && ctx.inlineSlotHosts) {
            const index = displayList.length;
            displayList.push(groupChild(ctx, child, groupIndex));
            const fill = fillChild(ctx, child, index, styleOf(child, ctx).backgroundColor);
            if (fill) displayList.push(fill);
            flattenWalk(ctx, child, index, displayList);
            continue;
        }
        if (child.kind === "virtual-list" || child.kind === "scroll-view") {
            displayList.push(scrollListChild(ctx, child, groupIndex));
            continue;
        }
        if (isContainer(child)) {
            const nested = ctx.childrenOf.get(child.id) ?? [];
            const color = styleOf(child, ctx).backgroundColor;
            if (!nested.length && color) {
                const fill = fillChild(ctx, child, groupIndex, color);
                if (fill) displayList.push(fill);
                continue;
            }
            const index = displayList.length;
            displayList.push(groupChild(ctx, child, groupIndex));
            const fill = fillChild(ctx, child, index, color);
            if (fill) displayList.push(fill);
            if (child.interaction === "range") {
                const hit = fillChild(ctx, child, index, "#00000000");
                if (hit) displayList.push({ ...hit, name: "", touchable: true });
            }
            flattenWalk(ctx, child, index, displayList);
            continue;
        }
        const primitive = primitiveChild(ctx, child, groupIndex);
        if (primitive) displayList.push(primitive);
    }
}

function isContainer(node) {
    return node.kind === "view" || node.kind === "virtual-list" || node.kind === "scroll-view"
        || node.kind === "component";
}

/** Direction from row overflow: beyond width only → horizontal, both → both, else vertical. */
function scrollDirection(node, rows) {
    const viewW = node.rect?.width ?? 0;
    const viewH = node.rect?.height ?? 0;
    let right = 0;
    let bottom = 0;
    for (const row of rows) {
        right = Math.max(right, (row.x ?? 0) + (row.width ?? 0));
        bottom = Math.max(bottom, (row.y ?? 0) + (row.height ?? 0));
    }
    const overX = right > viewW + 1;
    const overY = bottom > viewH + 1;
    if (overX && overY) return "both";
    if (overX) return "horizontal";
    return "vertical";
}

/** A virtual-list/scroll-view becomes a real scroll component; rows live inside it. */
function scrollListChild(ctx, node, groupIndex) {
    const xy = rel(node.rect, ctx.origin);
    ctx.scrollSeq = (ctx.scrollSeq ?? 0) + 1;
    const base = String(node.name || "List").replace(/[^A-Za-z0-9_]/g, "_") || "List";
    const compName = `${ctx.pkg.name}_${base}_${ctx.scrollSeq}`;
    const rows = flatten({ ...ctx, root: node, origin: node.rect });
    ctx.pkg.components.push({
        id: fairyId(`comp:${ctx.pkg.name}:${compName}`),
        name: compName,
        exported: false,
        size: roundSize(node.rect),
        extension: null,
        objectType: ObjectType.Component,
        scroll: scrollDirection(node, rows),
        children: rows,
    });
    return {
        kind: "component",
        name: node.name || base,
        srcName: compName,
        ...xy,
        width: Math.round(node.rect?.width ?? 0),
        height: Math.round(node.rect?.height ?? 0),
        group: groupIndex,
        visible: node.visible !== false,
        touchable: true,
    };
}

function nameUnnamedTexts(displayList) {
    const texts = displayList.filter((child) => child.kind === "text" && !child.name);
    if (texts.length === 1) texts[0].name = "title";
    else texts.forEach((child, index) => { child.name = `t${index}`; });
}

function componentChild(ctx, node, definitionKey, groupIndex) {
    const xy = rel(node.rect, ctx.origin);
    const def = {
        kind: "component",
        name: node.name || definitionKey,
        srcName: definitionKey,
        ...xy,
        group: groupIndex,
        visible: node.visible !== false,
    };
    if (ctx.buttons.has(definitionKey)) {
        def.button = {
            title: titleOf(node, ctx),
            icon: iconUrlOf(node, ctx),
            outlineColor: outlineOf(node, ctx),
        };
    } else {
        const properties = [
            ...textProperties(ctx, node, definitionKey),
            ...imageProperties(ctx, node, definitionKey),
        ];
        const wrapper = wrapperButtonProperty(ctx, node, definitionKey);
        if (wrapper) properties.push(wrapper);
        if (properties.length) def.properties = properties;
    }
    if (node.interaction === "press") def.touchable = true;
    return def;
}

function imageProperties(ctx, node, definitionKey) {
    const loaders = (ctx.templateOf?.(definitionKey)?.children ?? [])
        .filter((child) => child.kind === "loader" && child.name);
    if (!loaders.length) return [];
    const instanceImages = collectFlattenedImages(node, ctx);
    const properties = [];
    for (let i = 0; i < loaders.length; i += 1) {
        const loader = loaders[i];
        const instance = instanceImages.find((item) => item.name && (
            item.name === loader.uniflexName || item.name === loader.name
        ));
        if (!instance?.resourceId) {
            if (loader.url) {
                properties.push({ target: loader.name, id: ObjectPropID.Icon, value: "" });
            }
            continue;
        }
        const image = ctx.internImage(instance.resourceId);
        if (!image) continue;
        const url = uiUrl(ctx.pkg, image);
        if (url === loader.url) continue;
        properties.push({
            target: loader.name,
            id: ObjectPropID.Icon,
            value: url,
        });
    }
    return properties;
}

function collectFlattenedImages(root, ctx) {
    const out = [];
    const walk = (node) => {
        for (const child of ctx.childrenOf.get(node.id) ?? []) {
            if (child.visible === false) continue;
            if (ctx.skipSlot && isSlotContent(node.name)) continue;
            const instance = ctx.instanceByRoot.get(child.id);
            const shared = instance && ctx.shared.has(instance.definitionKey);
            if (shared && isReusableInstance(instance, child, ctx)) continue;
            if (child.kind === "image") {
                out.push(child);
                continue;
            }
            if (isContainer(child)) walk(child);
        }
    };
    walk(root);
    return out;
}

function textProperties(ctx, node, definitionKey) {
    const templateTexts = (ctx.templateOf?.(definitionKey)?.children ?? [])
        .filter((child) => child.kind === "text");
    if (!templateTexts.length) return [];
    const instanceTexts = collectFlattenedTexts(node, ctx);
    const properties = [];
    for (let i = 0; i < templateTexts.length; i += 1) {
        const templateText = templateTexts[i];
        const instance = instanceTexts.find((item) => item.name && (
            item.name === templateText.name || item.name === templateText.uniflexName
        )) ?? instanceTexts[i];
        if (!instance || !templateText.name) continue;
        const value = instance.value ?? "";
        if (value === (templateText.text ?? "")) continue;
        properties.push({
            target: templateText.name,
            id: ObjectPropID.Text,
            value,
        });
    }
    return properties;
}

function wrapperButtonProperty(ctx, node, definitionKey) {
    if (!ctx.wrappers?.has(definitionKey)) return null;
    const nested = ctx.templateOf?.(definitionKey)?.children
        ?.find((child) => child.name === "ActionButton" && child.kind === "component");
    if (!nested) return null;
    const title = titleOf(node, ctx);
    if (!title || (nested.button?.title ?? "") === title) return null;
    return { target: "ActionButton", id: ObjectPropID.Text, value: title };
}

/** Texts flatten would emit on this node — skip nested shared instances (their texts belong there). */
function collectFlattenedTexts(root, ctx) {
    const out = [];
    const walk = (node) => {
        for (const child of ctx.childrenOf.get(node.id) ?? []) {
            if (child.visible === false) continue;
            if (ctx.skipSlot && isSlotContent(node.name)) continue;
            const instance = ctx.instanceByRoot.get(child.id);
            const shared = instance && ctx.shared.has(instance.definitionKey);
            if (shared && isReusableInstance(instance, child, ctx)) continue;
            if (child.kind === "text") {
                out.push(child);
                continue;
            }
            if (isContainer(child)) walk(child);
        }
    };
    walk(root);
    return out;
}

function groupChild(ctx, node, groupIndex) {
    const xy = rel(node.rect, ctx.origin);
    return {
        kind: "group",
        name: node.name || "",
        ...xy,
        advanced: true,
        group: groupIndex,
        visible: node.visible !== false,
    };
}

function fillChild(ctx, node, groupIndex, fill) {
    if (!fill) return null;
    const image = ctx.internFill?.(fill);
    if (!image) return null;
    const xy = rel(node.rect, ctx.origin);
    return {
        kind: "image",
        name: node.name || "",
        src: image.id,
        pkg: ctx.pkg.name === COMMON_PACKAGE ? undefined : ctx.pkg.dependencies?.[0]?.id,
        fileName: `images/${image.fileName}`,
        ...xy,
        group: groupIndex,
        visible: node.visible !== false,
        touchable: node.interaction === "press" || node.interaction === "range",
        relations: node.name === "PopupFrame/Mask"
            ? [{ target: "", sidePair: "width-width,height-height" }]
            : [],
    };
}

function primitiveChild(ctx, node, groupIndex) {
    const xy = rel(node.rect, ctx.origin);
    const style = styleOf(node, ctx);
    const visible = node.visible !== false;
    if (node.kind === "image") {
        const image = ctx.internImage(node.resourceId);
        if (!image) return null;
        const reserved = reservedName(node, ctx);
        if (reserved === "icon" || reserved === "frame") {
            const fillParent = reserved === "frame"
                || ctx.root.name === "ActionButton"
                || ctx.root.name === "CloseButton";
            return {
                kind: "loader",
                name: reserved,
                uniflexName: node.name,
                ...xy,
                url: uiUrl(ctx.pkg, image),
                fill: reserved === "frame" || style.sizeMode === "sliced" ? "scaleFree" : "none",
                group: groupIndex,
                visible,
                touchable: false,
                relations: fillParent
                    ? [{ target: "", sidePair: "width-width,height-height" }]
                    : [],
            };
        }
        return {
            kind: "image",
            name: node.name || image.name,
            src: image.id,
            pkg: ctx.pkg.name === COMMON_PACKAGE ? undefined : ctx.pkg.dependencies?.[0]?.id,
            fileName: `images/${image.fileName}`,
            ...xy,
            group: groupIndex,
            visible,
            touchable: false,
        };
    }
    if (node.kind === "text") {
        const reserved = reservedName(node, ctx);
        return {
            kind: "text",
            name: reserved === "title" ? "title" : (node.name || ""),
            uniflexName: node.name,
            text: node.value ?? "",
            ...xy,
            fontSize: style.fontSize ?? 24,
            font: PREVIEW_FONT_FAMILY,
            color: style.color ?? "#ffffff",
            align: style.horizontalAlign ?? "left",
            vAlign: style.verticalAlign ?? "top",
            autoSize: style.overflow === "shrink" ? "shrink" : "none",
            bold: Boolean(style.bold),
            strokeColor: style.outlineColor,
            strokeSize: uniflexStrokeSize(style.outlineWidth),
            singleLine: style.wrap === true ? false : true,
            group: groupIndex,
            visible,
            touchable: false,
            relations: reserved === "title"
                ? [{ target: "", sidePair: "width-width,height-height" }]
                : [],
        };
    }
    if (node.kind === "view" && style.backgroundColor) {
        return groupChild(ctx, node, groupIndex);
    }
    return null;
}

function reservedName(node, ctx) {
    if (ctx.root.name === "ActionButton") {
        if (node.name === "ActionButton/Background") return "icon";
        if (node.name === "ActionButton/Label") return "title";
    }
    if (ctx.root.name === "ItemSlot") {
        if (node.name === "ItemSlot/Frame") return "frame";
        if (node.name === "ItemSlot/Icon") return "icon";
        if (node.name === "ItemSlot/Count") return "title";
    }
    if (ctx.root.name === "CloseButton" && node.kind === "image") return "icon";
    return null;
}

function titleOf(node, ctx) {
    const kids = collectNamed(node, ctx.childrenOf);
    const visible = kids.find((item) => item.kind === "text" && item.visible !== false
        && (item.name === "ActionButton/IconLabel" || item.name === "ActionButton/Label"));
    const label = kids.find((item) => item.name === "ActionButton/Label");
    const any = kids.find((item) => item.kind === "text" && item.visible !== false);
    return visible?.value || label?.value || any?.value || node.value || "";
}

function outlineOf(node, ctx) {
    const parent = ctx.byId.get(node.parent);
    if (parent?.name && ACTION_OUTLINE[parent.name]) return ACTION_OUTLINE[parent.name];
    const kids = collectNamed(node, ctx.childrenOf);
    const background = kids.find((item) => item.name === "ActionButton/Background" || item.kind === "image");
    if (background?.resourceId && ACTION_OUTLINE_BY_RESOURCE[background.resourceId]) {
        return ACTION_OUTLINE_BY_RESOURCE[background.resourceId];
    }
    const label = kids.find((item) => item.name === "ActionButton/Label");
    return styleOf(label ?? node, ctx).outlineColor
        ?? DEFAULT_STYLES["ActionButton/Label"]?.outlineColor
        ?? null;
}

function iconUrlOf(node, ctx) {
    const kids = collectNamed(node, ctx.childrenOf);
    const background = kids.find((item) => item.name === "ActionButton/Background" || item.kind === "image");
    const image = background?.resourceId ? ctx.internImage(background.resourceId) : null;
    return image ? uiUrl(ctx.pkg, image) : null;
}

function collectNamed(root, childrenOf) {
    const out = [];
    const walk = (node) => {
        for (const child of childrenOf.get(node.id) ?? []) {
            out.push(child);
            walk(child);
        }
    };
    walk(root);
    return out;
}

function uiUrl(pkg, image) {
    const owner = pkg.name === COMMON_PACKAGE ? pkg : { id: pkg.dependencies?.[0]?.id };
    const id = owner.id ?? pkg.id;
    return `ui://${id}${image.id}`;
}

function styleOf(node, ctx) {
    const planNode = lookupPlan(node, ctx);
    const props = planNode?.props ?? {};
    const merged = {
        ...(DEFAULT_STYLES[node.name] ?? {}),
        ...(parentTextStyle(node, ctx) ?? {}),
        ...(inspectTextStyle(node) ?? {}),
        ...props.style,
        ...props,
    };
    if (!merged.outlineColor && (node.name === "ActionButton/IconLabel" || node.name === "ActionButton/Label")) {
        const outline = actionOutlineColor(node, ctx);
        if (outline) merged.outlineColor = outline;
    }
    return merged;
}

/** Live inspect / capture may stamp runtime text props that AOT plans leave as slots. */
function inspectTextStyle(node) {
    if (!node || node.kind !== "text") return null;
    const source = node.style && typeof node.style === "object" ? { ...node, ...node.style } : node;
    const out = {};
    if (source.fontSize != null && source.fontSize !== "") out.fontSize = Number(source.fontSize);
    if (typeof source.color === "string" && source.color) out.color = source.color;
    if (typeof source.outlineColor === "string" && source.outlineColor) out.outlineColor = source.outlineColor;
    if (source.outlineWidth != null && source.outlineWidth !== "") out.outlineWidth = Number(source.outlineWidth);
    if (source.bold != null) out.bold = Boolean(source.bold);
    if (typeof source.horizontalAlign === "string" && source.horizontalAlign) {
        out.horizontalAlign = source.horizontalAlign;
    }
    if (typeof source.verticalAlign === "string" && source.verticalAlign) {
        out.verticalAlign = source.verticalAlign;
    }
    if (typeof source.overflow === "string" && source.overflow) out.overflow = source.overflow;
    return Object.keys(out).length ? out : null;
}

function actionOutlineColor(node, ctx) {
    const action = ancestorNamed(node, ctx, "ActionButton");
    if (!action) return null;
    const parent = ctx.byId.get(action.parent);
    if (parent?.name && ACTION_OUTLINE[parent.name]) return ACTION_OUTLINE[parent.name];
    const kids = collectNamed(action, ctx.childrenOf);
    const background = kids.find((item) => item.name === "ActionButton/Background" || item.kind === "image");
    if (background?.resourceId && ACTION_OUTLINE_BY_RESOURCE[background.resourceId]) {
        return ACTION_OUTLINE_BY_RESOURCE[background.resourceId];
    }
    return null;
}

function ancestorNamed(node, ctx, name) {
    let current = node;
    const seen = new Set();
    while (current) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        if (current.name === name) return current;
        current = current.parent != null ? ctx.byId?.get(current.parent) : null;
    }
    return null;
}

function lookupPlan(node, ctx) {
    const scoped = componentPlan(node, ctx);
    if (node.name) {
        const named = scoped?.planByName.get(node.name) ?? ctx.planByName?.get(node.name);
        if (planKindOk(named, node)) return named;
    }
    if (node.planId != null) {
        if (scoped) {
            const byId = scoped.planById.get(node.planId);
            return planKindOk(byId, node) ? byId : null;
        }
        const byId = ctx.planById?.get(node.planId);
        if (planKindOk(byId, node)) return byId;
    }
    return null;
}

function componentPlan(node, ctx) {
    let current = node;
    const seen = new Set();
    while (current) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        const instance = ctx.instanceByRoot?.get(current.id);
        const keys = [instance?.definitionKey, current.name].filter(Boolean);
        for (const key of keys) {
            const scoped = ctx.planByComponent?.get(key);
            if (scoped) return scoped;
        }
        current = current.parent != null ? ctx.byId?.get(current.parent) : null;
    }
    return null;
}

function planKindOk(planNode, node) {
    if (!planNode) return false;
    return !planNode.kind || !node.kind || planNode.kind === node.kind;
}

function parentTextStyle(node, ctx) {
    if (node.kind !== "text") return null;
    const parent = ctx.byId?.get(node.parent);
    const name = parent?.name;
    if (name === "Tab" || name === "PanelTab") {
        const active = (parent.rect?.height ?? 0) >= 60;
        return {
            fontSize: active ? 32 : 28,
            color: "#3F3254",
            bold: true,
            horizontalAlign: "center",
            verticalAlign: "center",
            overflow: "shrink",
        };
    }
    if (name === "QuantityControl" || name === "BackpackQuantityControl") {
        return {
            fontSize: 33,
            color: "#FFFFFF",
            bold: true,
            outlineColor: "#000000",
            outlineWidth: 2,
            horizontalAlign: "center",
            verticalAlign: "center",
        };
    }
    return null;
}

function rel(rect, origin) {
    return {
        xy: [Math.round((rect?.x ?? 0) - (origin?.x ?? 0)), Math.round((rect?.y ?? 0) - (origin?.y ?? 0))],
        size: [Math.round(rect?.width ?? 0), Math.round(rect?.height ?? 0)],
        x: Math.round((rect?.x ?? 0) - (origin?.x ?? 0)),
        y: Math.round((rect?.y ?? 0) - (origin?.y ?? 0)),
        width: Math.round(rect?.width ?? 0),
        height: Math.round(rect?.height ?? 0),
    };
}

function roundSize(rect) {
    return { width: Math.round(rect?.width ?? 0), height: Math.round(rect?.height ?? 0) };
}

function assignChildIds(seed, displayList) {
    displayList.forEach((child, index) => {
        child.id = childId(`${seed}:${child.name || child.kind}`, index);
    });
}

function buildMapping(commonPkg, pagePkgs, screens) {
    const mapping = {};
    for (const [index, pagePkg] of pagePkgs.entries()) {
        const screen = screens[index];
        mapping[screen.componentName] = {
            package: pagePkg.name,
            component: screen.componentName,
            id: pagePkg.components.find((entry) => entry.name === screen.componentName)?.id
                ?? pagePkg.components.at(-1)?.id,
        };
    }
    for (const component of commonPkg.components) {
        mapping[component.name] = { package: commonPkg.name, component: component.name, id: component.id };
        for (const child of component.children) {
            if (child.uniflexName && child.name !== child.uniflexName) {
                mapping[child.uniflexName] = {
                    package: commonPkg.name,
                    component: component.name,
                    reservedName: child.name,
                    childId: child.id,
                };
            }
        }
    }
    return mapping;
}

export function declareOwnership(nodes, page, components) {
    const views = nodes.filter((node) => node.kind === "view");
    const pageRoots = views.filter((node) => node.name === page.rootName);
    if (pageRoots.length !== 1) {
        throw new Error(`Ambiguous or missing page root ${page.rootName} (${pageRoots.length} matches)`);
    }
    const definitions = [{ key: page.key ?? page.componentName, source: page.source }];
    const instances = [{
        key: `${page.componentName}.root`,
        definitionKey: page.componentName,
        role: "page",
        rootRecordId: pageRoots[0].id,
    }];
    const defined = new Set([page.componentName]);
    for (const component of components) {
        const matches = views.filter((node) => node.name === component.rootName);
        if (!matches.length) continue;
        if (!defined.has(component.key)) {
            definitions.push({ key: component.key, source: component.source });
            defined.add(component.key);
        }
        for (const match of matches) {
            instances.push({
                key: `${component.key}:${authorPath(nodes, match)}`,
                definitionKey: component.key,
                role: "component",
                rootRecordId: match.id,
            });
        }
    }
    return { schemaVersion: 1, kind: "uniflex-component-declarations", definitions, instances };
}

function authorPath(nodes, node) {
    const byId = new Map(nodes.map((entry) => [entry.id, entry]));
    const parts = [];
    let current = node;
    const seen = new Set();
    while (current) {
        if (seen.has(current.id)) throw new Error("Cycle in snapshot parent chain");
        seen.add(current.id);
        const siblings = nodes.filter((entry) =>
            entry.parent === current.parent && entry.name === current.name && entry.kind === current.kind);
        const index = siblings.findIndex((entry) => entry.id === current.id);
        const label = current.name || "_";
        parts.unshift(siblings.length > 1 ? `${label}:${index}` : label);
        if (current.parent == null) break;
        current = byId.get(current.parent);
        if (!current) break;
    }
    return parts.join("/");
}
