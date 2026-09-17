import { parseCssColor, toFguiXmlColor } from "./bytes.mjs";
import { BUTTON_CONTROLLER_PAGES } from "./constants.mjs";

function cssToRgbInt(css) {
    const { r, g, b } = parseCssColor(css);
    return String((r << 16) + (g << 8) + b);
}

export function escapeXml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function attr(name, value) {
    if (value == null || value === false) return "";
    if (value === true) return ` ${name}="true"`;
    return ` ${name}="${escapeXml(value)}"`;
}

export function projectXml(project) {
    return `<?xml version="1.0" encoding="utf-8"?>\n`
        + `<projectDescription id="${escapeXml(project.id)}" type="${escapeXml(project.type)}" version="3"/>\n`;
}

export function packageXml(pkg) {
    const lines = [
        `<?xml version="1.0" encoding="utf-8"?>`,
        `<packageDescription id="${escapeXml(pkg.id)}">`,
        `  <resources>`,
    ];
    for (const image of pkg.images) {
        let extra = "";
        if (image.scale9grid) extra += ` scale="9grid" scale9grid="${image.scale9grid.attr}"`;
        lines.push(
            `    <image id="${escapeXml(image.id)}" name="${escapeXml(image.fileName)}" path="${escapeXml(image.path)}" exported="true"${extra}/>`,
        );
    }
    for (const component of pkg.components) {
        const exported = component.exported ? ` exported="true"` : "";
        lines.push(
            `    <component id="${escapeXml(component.id)}" name="${escapeXml(component.name)}.xml" path="/"${exported}/>`,
        );
    }
    lines.push(`  </resources>`);
    if (pkg.dependencies?.length) {
        lines.push(`  <publish name=""/>`);
    } else {
        lines.push(`  <publish name=""/>`);
    }
    lines.push(`</packageDescription>`);
    return `${lines.join("\n")}\n`;
}

export function componentXml(component, pkg, packages) {
    linkGroups(component);
    const size = `${component.size.width},${component.size.height}`;
    const ext = component.extension ? ` extention="${escapeXml(component.extension)}"` : "";
    const remark = component.remark ? ` remark="${escapeXml(component.remark)}"` : "";
    const lines = [
        `<?xml version="1.0" encoding="utf-8"?>`,
        `<component size="${size}"${ext}${remark}>`,
    ];
    if (component.extension === "Button") {
        const pages = BUTTON_CONTROLLER_PAGES.flat().join(",");
        lines.push(`  <controller name="button" pages="${pages}" selected="0"/>`);
    }
    lines.push(`  <displayList>`);
    for (const child of component.children) {
        child._ownerPackageId = pkg.id;
        lines.push(displayItemXml(child, packages, "    "));
    }
    lines.push(`  </displayList>`);
    if (component.extension === "Button") {
        lines.push(`  <Button downEffect="scale" downEffectValue="0.8"/>`);
    }
    lines.push(`</component>`);
    return `${lines.join("\n")}\n`;
}

function displayItemXml(child, packages, indent) {
    const groupId = child.group >= 0 ? child._groupId : null;
    const common = attr("id", child.id)
        + attr("name", child.name)
        + attr("xy", `${child.x},${child.y}`)
        + attr("size", `${child.width},${child.height}`)
        + (child.visible === false ? attr("visible", "false") : "")
        + (child.touchable === false ? attr("touchable", "false") : "")
        + (groupId ? attr("group", groupId) : "");
    const inner = [];
    if (child.relations?.length) {
        for (const relation of child.relations) {
            inner.push(`${indent}  <relation target="${escapeXml(relation.target ?? "")}" sidePair="${escapeXml(relation.sidePair)}"/>`);
        }
    }
    if (child.kind === "component" && child.button) {
        let button = `${indent}  <Button`;
        if (child.button.title) button += attr("title", child.button.title);
        if (child.button.icon) button += attr("icon", child.button.icon);
        button += `/>`;
        inner.push(button);
        if (child.button.outlineColor) {
            inner.push(`${indent}  <property target="title" propertyId="3" value="${escapeXml(cssToRgbInt(child.button.outlineColor))}"/>`);
        }
    }
    if (child.kind === "component" && child.properties?.length) {
        for (const prop of child.properties) {
            inner.push(
                `${indent}  <property target="${escapeXml(prop.target)}" propertyId="${prop.id}" value="${escapeXml(prop.value)}"/>`,
            );
        }
    }
    const body = (tag, extra = "", selfClosing = !inner.length) => {
        if (selfClosing) return `${indent}<${tag}${common}${extra}/>`;
        return `${indent}<${tag}${common}${extra}>\n${inner.join("\n")}\n${indent}</${tag}>`;
    };
    if (child.kind === "image") {
        const pkg = child.pkg ? attr("pkg", child.pkg) : "";
        return body("image", attr("src", child.src) + pkg + attr("fileName", child.fileName));
    }
    if (child.kind === "loader") {
        return body("loader", attr("url", child.url) + attr("fill", child.fill === "scaleFree" ? "scaleFree" : undefined));
    }
    if (child.kind === "text") {
        return body("text",
            attr("font", child.font)
            + attr("fontSize", child.fontSize)
            + attr("color", toFguiXmlColor(child.color ?? "#ffffff"))
            + attr("align", child.align === "center" ? "center" : child.align === "right" ? "right" : undefined)
            + attr("vAlign", child.vAlign === "middle" || child.vAlign === "center" ? "middle" : child.vAlign === "bottom" ? "bottom" : undefined)
            + attr("autoSize", child.autoSize === "shrink" ? "shrink" : "none")
            + (child.bold ? attr("bold", true) : "")
            + (child.strokeColor && child.strokeSize ? attr("strokeColor", toFguiXmlColor(child.strokeColor)) + attr("strokeSize", child.strokeSize) : "")
            + (child.singleLine === false ? "" : "")
            + attr("text", child.text ?? ""));
    }
    if (child.kind === "graph") {
        return body("graph",
            attr("type", "rect")
            + attr("lineSize", child.lineSize ?? 0)
            + attr("fillColor", toFguiXmlColor(child.fill ?? "#000000ff", { alpha: true })));
    }
    if (child.kind === "group") {
        return body("group", attr("advanced", child.advanced ? true : undefined));
    }
    if (child.kind === "component") {
        const target = findComponent(packages, child.srcName);
        const extra = attr("src", target?.id)
            + (target && target.packageId !== child._ownerPackageId ? attr("pkg", target.packageId) : "")
            + attr("fileName", `${child.srcName}.xml`);
        return body("component", extra);
    }
    return `${indent}<!-- unsupported ${escapeXml(child.kind)} ${escapeXml(child.name)} -->`;
}

function findComponent(packages, name) {
    for (const pkg of packages) {
        const component = pkg.components.find((item) => item.name === name);
        if (component) return { ...component, packageId: pkg.id, packageName: pkg.name };
    }
    return null;
}

/** Fill group="" ids (FairyGUI displayList is flat; groups are siblings). */
export function linkGroups(component) {
    for (const child of component.children) {
        if (child.group >= 0) {
            const owner = component.children[child.group];
            if (owner) child._groupId = owner.id;
        }
    }
    return component;
}

export function adaptationJson(canvas) {
    return `${JSON.stringify({
        scaleMode: "ScaleWithScreenSize",
        screenMathMode: "MatchWidth",
        designResolutionX: canvas.width,
        designResolutionY: canvas.height,
        devices: [],
        fileName: "Adaptation",
    }, null, 2)}\n`;
}

export function commonJson() {
    return `${JSON.stringify({
        buttonClickSound: "",
        colorScheme: ["自定义颜色 #FF0000"],
        font: "宋体",
        fontScheme: ["Default font"],
        fontSize: 12,
        fontSizeScheme: ["自定义字体大小 30"],
        scrollBars: { defaultDisplay: "visible", horizontal: "", vertical: "" },
        textColor: "#000000",
        tipsRes: "",
    }, null, 2)}\n`;
}

export function publishJson() {
    return `${JSON.stringify({
        atlasSetting: {
            allowRotation: true,
            paging: true,
            sizeOption: "pot",
            trimImage: true,
        },
        binaryFormat: true,
        codeGeneration: {
            classNamePrefix: "",
            codePath: "",
            codeType: "",
            getMemberByName: false,
            ignoreNoname: true,
            memberNamePrefix: "m_",
            packageName: "",
        },
        compressDesc: false,
        fileExtension: "bin",
        packageCount: 2,
        path: "",
    }, null, 2)}\n`;
}
