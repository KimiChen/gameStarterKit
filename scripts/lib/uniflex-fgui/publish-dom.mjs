import { ByteWriter, StringTable, writeSegments } from "./bytes.mjs";
import {
    AlignType, AutoSizeType, BUTTON_CONTROLLER_PAGES, ButtonMode, DownEffect,
    FGUI_MAGIC, FGUI_VERSION, GraphType, LoaderFillType, ObjectPropID, ObjectType, OverflowType,
    PackageItemType, RelationType, SCROLL_PANE_FLAGS, ScrollBarDisplayType, ScrollType, VertAlignType,
} from "./constants.mjs";
import { parseCssColor } from "./bytes.mjs";

function cssToRgbInt(css) {
    const { r, g, b } = parseCssColor(css);
    return String((r << 16) + (g << 8) + b);
}

const ALIGN = { left: AlignType.Left, center: AlignType.Center, right: AlignType.Right };
const VALIGN = {
    top: VertAlignType.Top, middle: VertAlignType.Middle, center: VertAlignType.Middle,
    bottom: VertAlignType.Bottom,
};
const SIDE = {
    "width-width": RelationType.Width,
    "height-height": RelationType.Height,
    "center-center": RelationType.Center_Center,
    "middle-middle": RelationType.Middle_Middle,
    "size-size": RelationType.Size,
};

export function publishPackage(pkg, packages) {
    const strings = new StringTable();
    const deps = new ByteWriter(strings);
    deps.i16(pkg.dependencies?.length ?? 0);
    for (const dep of pkg.dependencies ?? []) {
        deps.s(dep.id);
        deps.s(dep.name);
    }
    deps.i16(0); // version>=2 branches

    const items = new ByteWriter(strings);
    const list = [
        ...pkg.images.map((image) => ({ kind: "image", image })),
        ...pkg.components.map((component) => ({ kind: "component", component })),
    ];
    items.i16(list.length);
    for (const entry of list) writeItem(items, strings, entry, pkg, packages);

    const sprites = new ByteWriter(strings);
    sprites.i16(0);

    const stringTable = new ByteWriter(strings);
    stringTable.i32(strings.list.length);
    for (const value of strings.list) stringTable.str(value);

    const index = writeSegments([
        deps.toBuffer(),
        items.toBuffer(),
        sprites.toBuffer(),
        null,
        stringTable.toBuffer(),
    ], strings);

    const head = new ByteWriter();
    head.u32(FGUI_MAGIC);
    head.i32(FGUI_VERSION);
    head.bool(false);
    head.str(pkg.id);
    head.str(pkg.name);
    head.push(new Uint8Array(20));
    const header = head.toBuffer();
    const out = new Uint8Array(header.byteLength + index.byteLength);
    out.set(header, 0);
    out.set(index, header.byteLength);
    return out;
}

function writeItem(out, strings, entry, pkg, packages) {
    const body = new ByteWriter(strings);
    if (entry.kind === "image") {
        const image = entry.image;
        body.u8(PackageItemType.Image);
        body.s(image.id);
        body.s(image.name);
        body.s(image.path);
        body.s(image.fileName);
        body.bool(true);
        body.i32(image.width ?? 0);
        body.i32(image.height ?? 0);
        if (image.scale9grid) {
            body.u8(1);
            body.i32(image.scale9grid.x);
            body.i32(image.scale9grid.y);
            body.i32(image.scale9grid.width);
            body.i32(image.scale9grid.height);
            body.i32(0);
        } else {
            body.u8(0);
        }
        body.bool(true); // smoothing
    } else {
        const component = entry.component;
        body.u8(PackageItemType.Component);
        body.s(component.id);
        body.s(component.name);
        body.s("/");
        body.s(null);
        body.bool(Boolean(component.exported));
        body.i32(component.size.width);
        body.i32(component.size.height);
        body.u8(component.objectType === ObjectType.Component ? 0 : component.objectType);
        body.buffer(writeComponentRaw(component, strings, pkg, packages));
    }
    body.s(null);
    body.u8(0);
    body.u8(0);
    const bytes = body.toBuffer();
    out.i32(bytes.byteLength);
    out.push(bytes);
}

function writeComponentRaw(component, strings, pkg, packages) {
    const seg0 = new ByteWriter(strings);
    seg0.i32(component.size.width);
    seg0.i32(component.size.height);
    seg0.bool(false);
    seg0.bool(false);
    seg0.bool(false);
    seg0.u8(component.scroll ? OverflowType.Scroll : OverflowType.Visible);
    seg0.bool(false);

    const seg1 = new ByteWriter(strings);
    if (component.extension === "Button") {
        seg1.i16(1);
        const controller = writeButtonController(strings);
        seg1.i16(controller.byteLength);
        seg1.push(controller);
    } else {
        seg1.i16(0);
    }

    const children = component.children ?? [];
    const childBuffers = children.map((child) => writeChild(child, strings, pkg, packages, children));
    const seg2 = new ByteWriter(strings);
    seg2.i16(children.length);
    for (const bytes of childBuffers) {
        if (bytes.byteLength > 0x7fff) throw new Error(`Child buffer too large: ${bytes.byteLength}`);
        seg2.i16(bytes.byteLength);
        seg2.push(bytes);
    }

    const seg3 = new ByteWriter(strings);
    writeRelations(seg3, component.relations ?? []);

    const seg4 = new ByteWriter(strings);
    seg4.u16(0);
    seg4.bool(true);
    seg4.i16(-1);
    seg4.s(null);
    seg4.i32(0);
    seg4.i32(-1);

    const seg5 = new ByteWriter(strings);
    seg5.i16(0);

    const segs = [seg0, seg1, seg2, seg3, seg4, seg5, null, null];
    if (component.scroll) segs[7] = writeScrollPane(component, strings);
    if (component.extension === "Button") {
        const button = new ByteWriter(strings);
        button.u8(ButtonMode.Common);
        button.s(null);
        button.f32(1);
        button.u8(DownEffect.Scale);
        button.f32(0.8);
        segs[6] = button;
    }
    return writeSegments(segs, strings);
}

function writeScrollPane(component, strings) {
    const out = new ByteWriter(strings);
    out.u8(component.scroll === "both" ? ScrollType.Both
        : component.scroll === "horizontal" ? ScrollType.Horizontal : ScrollType.Vertical);
    out.u8(ScrollBarDisplayType.Hidden);
    out.i32(SCROLL_PANE_FLAGS);
    out.bool(false); // no scrollBarMargin
    out.s(null); // vtScrollBarRes
    out.s(null); // hzScrollBarRes
    out.s(null); // headerRes
    out.s(null); // footerRes
    return out;
}

function writeButtonController(strings) {
    const seg0 = new ByteWriter(strings);
    seg0.s("button");
    seg0.bool(false);
    const seg1 = new ByteWriter(strings);
    seg1.i16(BUTTON_CONTROLLER_PAGES.length);
    for (const [id, name] of BUTTON_CONTROLLER_PAGES) {
        seg1.s(id);
        seg1.s(name);
    }
    seg1.u8(0);
    const seg2 = new ByteWriter(strings);
    seg2.i16(0);
    return writeSegments([seg0, seg1, seg2], strings);
}

function writeChild(child, strings, pkg, packages, siblings) {
    const objectType = objectTypeOf(child, packages);
    const src = child.kind === "component"
        ? findComponent(packages, child.srcName)?.id ?? null
        : child.kind === "image" ? child.src : null;
    const srcPkg = child.kind === "component"
        ? packageIdOf(packages, child.srcName, pkg.id)
        : child.pkg ?? null;

    const seg0 = new ByteWriter(strings);
    seg0.u8(objectType);
    seg0.s(src);
    seg0.s(srcPkg);
    seg0.s(child.id);
    seg0.s(child.name ?? "");
    seg0.i32(child.x ?? 0);
    seg0.i32(child.y ?? 0);
    seg0.bool(true);
    seg0.i32(child.width ?? 0);
    seg0.i32(child.height ?? 0);
    seg0.bool(false);
    seg0.bool(false);
    seg0.bool(false);
    seg0.bool(false);
    seg0.f32(1);
    seg0.f32(0);
    seg0.bool(child.visible !== false);
    seg0.bool(child.touchable !== false);
    seg0.bool(false);
    seg0.u8(0);
    seg0.u8(0);
    seg0.s(null);

    const seg1 = new ByteWriter(strings);
    seg1.s(null);
    seg1.i16(child.group >= 0 ? child.group : -1);

    const seg2 = new ByteWriter(strings);
    seg2.i16(0);

    const seg3 = new ByteWriter(strings);
    writeRelations(seg3, child.relations ?? []);

    const segs = [seg0, seg1, seg2, seg3, null, null, null];

    if (child.kind === "image") {
        const extra = new ByteWriter(strings);
        extra.bool(false);
        extra.u8(0);
        extra.u8(0);
        segs[5] = extra;
    } else if (child.kind === "loader") {
        const extra = new ByteWriter(strings);
        extra.s(child.url ?? null);
        extra.u8(AlignType.Left);
        extra.u8(VertAlignType.Top);
        extra.u8(child.fill === "scaleFree" ? LoaderFillType.ScaleFree : LoaderFillType.None);
        extra.bool(false);
        extra.bool(false);
        extra.bool(false);
        extra.bool(true);
        extra.i32(0);
        extra.bool(false);
        extra.u8(0);
        segs[5] = extra;
    } else if (child.kind === "text") {
        const extra = new ByteWriter(strings);
        extra.s(child.font ?? null);
        extra.i16(child.fontSize ?? 24);
        extra.color(child.color ?? "#ffffff", { alpha: false });
        extra.u8(ALIGN[child.align] ?? AlignType.Left);
        extra.u8(VALIGN[child.vAlign] ?? VertAlignType.Top);
        extra.i16(0);
        extra.i16(0);
        extra.bool(false);
        extra.u8(child.autoSize === "shrink" ? AutoSizeType.Shrink : AutoSizeType.None);
        extra.bool(false);
        extra.bool(false);
        extra.bool(Boolean(child.bold));
        extra.bool(child.singleLine !== false);
        if (child.strokeColor && child.strokeSize) {
            extra.bool(true);
            extra.color(child.strokeColor, { alpha: false });
            extra.f32(child.strokeSize);
        } else extra.bool(false);
        extra.bool(false);
        extra.bool(false);
        segs[5] = extra;
        const text = new ByteWriter(strings);
        text.s(child.text ?? "");
        segs[6] = text;
    } else if (child.kind === "graph") {
        const extra = new ByteWriter(strings);
        extra.u8(GraphType.Rect);
        extra.i32(child.lineSize ?? 0);
        extra.color("#00000000");
        extra.color(child.fill ?? "#000000ff");
        extra.bool(false);
        segs[5] = extra;
    } else if (child.kind === "group") {
        const extra = new ByteWriter(strings);
        extra.u8(0);
        extra.i32(0);
        extra.i32(0);
        extra.bool(false);
        extra.bool(false);
        extra.i16(-1);
        segs[5] = extra;
    } else if (child.kind === "component") {
        const after = new ByteWriter(strings);
        after.i16(-1);
        after.i16(0);
        const props = [...(child.properties ?? [])];
        if (child.button?.outlineColor) {
            props.push({
                target: "title",
                id: ObjectPropID.OutlineColor,
                value: cssToRgbInt(child.button.outlineColor),
            });
        }
        after.i16(props.length);
        for (const prop of props) {
            after.s(prop.target);
            after.i16(prop.id);
            after.s(prop.value);
        }
        segs[4] = after;
        const target = findComponent(packages, child.srcName);
        if (target?.extension === "Button" || child.button) {
            const button = new ByteWriter(strings);
            button.u8(ObjectType.Button);
            button.s(child.button?.title ?? null);
            button.s(null);
            button.s(child.button?.icon ?? null);
            button.s(null);
            button.bool(false);
            button.i32(0);
            button.i16(-1);
            button.s(null);
            button.s(null);
            button.bool(false);
            button.bool(false);
            segs[6] = button;
        }
    }
    void siblings;
    return writeSegments(segs, strings);
}

function writeRelations(out, relations) {
    out.u8(relations.length);
    for (const relation of relations) {
        out.i16(-1);
        const parts = String(relation.sidePair ?? "").split(",").map((part) => part.trim()).filter(Boolean);
        const types = [];
        for (const part of parts) {
            const type = SIDE[part];
            if (type === RelationType.Size) {
                types.push(RelationType.Width, RelationType.Height);
            } else if (type != null) types.push(type);
        }
        out.u8(types.length);
        for (const type of types) {
            out.u8(type);
            out.bool(false);
        }
    }
}

function objectTypeOf(child, packages) {
    if (child.kind === "image") return ObjectType.Image;
    if (child.kind === "loader") return ObjectType.Loader;
    if (child.kind === "text") return ObjectType.Text;
    if (child.kind === "graph") return ObjectType.Graph;
    if (child.kind === "group") return ObjectType.Group;
    if (child.kind === "component") {
        const target = findComponent(packages, child.srcName);
        return target?.objectType ?? ObjectType.Component;
    }
    return ObjectType.Component;
}

function findComponent(packages, name) {
    for (const pkg of packages) {
        const component = pkg.components.find((item) => item.name === name);
        if (component) return component;
    }
    return null;
}

function packageIdOf(packages, name, ownerId) {
    for (const pkg of packages) {
        if (pkg.components.some((item) => item.name === name)) {
            return pkg.id === ownerId ? null : pkg.id;
        }
    }
    return null;
}
