import { childId, fairyId, packageIds, projectId } from "./ids.mjs";
import { toScale9Grid } from "./nine-slice.mjs";
import { imageBasename, imageStem } from "./resources.mjs";
import {
    ACTION_OUTLINE, BUTTON_COMPONENTS, COMMON_COMPONENTS, COMMON_PACKAGE, DEFAULT_STYLES,
    KNOWN_LOSSES, ObjectType, PREVIEW_FONT_FAMILY, SLOT_HOSTS, uniflexStrokeSize,
} from "./constants.mjs";

export function buildProjectIR(snapshot, options = {}) {
    return buildCatalogIR([{ snapshot, screen: options.screen, hostPlan: options.hostPlan }], options);
}

export function buildCatalogIR(pages, options = {}) {
    if (!Array.isArray(pages) || pages.length === 0) throw new Error("Missing snapshot.");
    const catalog = options.catalog ?? { components: [] };
    const keys = sharedKeysFrom(catalog);
    const shared = new Set(keys.filter((key) => !SLOT_HOSTS.includes(key)));
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

        const declarations = snapshot.componentDeclarations
            ?? declareOwnership(nodes, screen, catalog.components ?? []);
        const byId = new Map(nodes.map((node) => [node.id, node]));
        const childrenOf = indexChildren(nodes);
        const instanceByRoot = new Map(
            (declarations.instances ?? []).map((instance) => [instance.rootRecordId, instance]),
        );
        const planByName = indexPlan(page.hostPlan);
        const found = firstInstances(declarations.instances ?? [], byId);
        for (const key of keys) {
            if (templates.has(key)) continue;
            const root = found.get(key);
            if (!root) continue;
            templates.set(key, { root, byId, childrenOf, instanceByRoot, planByName });
            signatures.set(key, componentSignature(root, childrenOf));
        }
        prepared.push({ snapshot, screen, canvas, nodes, byId, childrenOf, instanceByRoot, planByName });
    }

    const sharedCtx = { internImage, losses, shared, signatures, buttons };

    for (const key of keys) {
        const template = templates.get(key);
        if (!template) continue;
        const skipSlot = SLOT_HOSTS.includes(key);
        const displayList = flatten({
            ...sharedCtx,
            ...template,
            origin: template.root.rect,
            skipSlot,
            pkg: commonPkg,
        });
        commonPkg.components.push({
            id: fairyId(`comp:${COMMON_PACKAGE}:${key}`),
            name: key,
            exported: true,
            size: roundSize(template.root.rect),
            extension: buttons.has(key) ? "Button" : null,
            objectType: buttons.has(key) ? ObjectType.Button : ObjectType.Component,
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

function isReusableInstance(instance, node, ctx) {
    if (ctx.buttons.has(instance.definitionKey)) return true;
    return ctx.signatures.get(instance.definitionKey) === componentSignature(node, ctx.childrenOf);
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
        if (node) found.set(instance.definitionKey, node);
    }
    return found;
}

function indexPlan(plan) {
    const byName = new Map();
    if (!plan) return byName;
    const visit = (node) => {
        if (!node || typeof node !== "object") return;
        const name = node.props?.name;
        if (typeof name === "string" && name) byName.set(name, node);
        for (const child of node.children ?? []) visit(child);
        if (node.root) visit(node.root);
    };
    visit(plan.root);
    for (const entry of Object.values(plan.components ?? {})) visit(entry.root ?? entry);
    return byName;
}

function flatten(ctx) {
    const displayList = [];
    const walk = (node, groupIndex) => {
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
                walk(child, index);
                continue;
            }
            if (isContainer(child)) {
                const nested = ctx.childrenOf.get(child.id) ?? [];
                const fill = styleOf(child, ctx.planByName).backgroundColor;
                if (!nested.length && fill) {
                    displayList.push(graphChild(ctx, child, groupIndex, fill));
                    continue;
                }
                const index = displayList.length;
                displayList.push(groupChild(ctx, child, groupIndex));
                walk(child, index);
                continue;
            }
            const primitive = primitiveChild(ctx, child, groupIndex);
            if (primitive) displayList.push(primitive);
        }
    };
    if (ctx.inlineSlotHosts && SLOT_HOSTS.includes(ctx.root.name)) {
        const index = displayList.length;
        displayList.push(groupChild(ctx, ctx.root, -1));
        walk(ctx.root, index);
    } else {
        walk(ctx.root, -1);
    }
    assignChildIds(ctx.root.name || "root", displayList);
    return displayList;
}

function isContainer(node) {
    return node.kind === "view";
}

function componentChild(ctx, node, definitionKey, groupIndex) {
    const xy = rel(node.rect, ctx.origin);
    const def = { kind: "component", name: node.name || definitionKey, srcName: definitionKey, ...xy, group: groupIndex, visible: node.visible !== false };
    if (definitionKey === "ActionButton") {
        def.button = {
            title: titleOf(node, ctx),
            icon: iconUrlOf(node, ctx),
            outlineColor: outlineOf(node, ctx),
        };
    }
    if (node.interaction === "press") def.touchable = true;
    return def;
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

function graphChild(ctx, node, groupIndex, fill) {
    const xy = rel(node.rect, ctx.origin);
    return {
        kind: "graph",
        name: node.name || "",
        ...xy,
        fill,
        type: "rect",
        lineSize: 0,
        group: groupIndex,
        visible: node.visible !== false,
        touchable: node.interaction === "press",
        relations: node.name === "PopupFrame/Mask"
            ? [{ target: "", sidePair: "width-width,height-height" }]
            : [],
    };
}

function primitiveChild(ctx, node, groupIndex) {
    const xy = rel(node.rect, ctx.origin);
    const style = styleOf(node, ctx.planByName);
    const visible = node.visible !== false;
    if (node.kind === "image") {
        const image = ctx.internImage(node.resourceId);
        if (!image) return null;
        const reserved = reservedName(node, ctx);
        if (reserved === "icon") {
            return {
                kind: "loader",
                name: "icon",
                uniflexName: node.name,
                ...xy,
                url: uiUrl(ctx.pkg, image),
                fill: style.sizeMode === "sliced" ? "scaleFree" : "none",
                group: groupIndex,
                visible,
                touchable: false,
                relations: [{ target: "", sidePair: "width-width,height-height" }],
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
    if (ctx.root.name === "CloseButton" && node.kind === "image") return "icon";
    return null;
}

function titleOf(node, ctx) {
    const kids = collectNamed(node, ctx.childrenOf);
    const label = kids.find((item) => item.name === "ActionButton/Label");
    return label?.value || node.value || "";
}

function outlineOf(node, ctx) {
    const parent = ctx.byId.get(node.parent);
    if (parent?.name && ACTION_OUTLINE[parent.name]) return ACTION_OUTLINE[parent.name];
    const kids = collectNamed(node, ctx.childrenOf);
    const label = kids.find((item) => item.name === "ActionButton/Label");
    return styleOf(label ?? node, ctx.planByName).outlineColor
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

function styleOf(node, planByName) {
    const plan = planByName.get(node.name)?.props ?? {};
    const fallback = DEFAULT_STYLES[node.name] ?? {};
    return { ...fallback, ...plan };
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
            package: pagePkg.name, component: screen.componentName, id: pagePkg.components.at(-1)?.id,
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
