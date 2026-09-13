import { access, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
};
const packageDir = value("--package");
const output = value("--out");

if (!packageDir || !output) {
    console.error("Usage: npm run ui:render-source -- --package <project-package> --out <source.png>");
    process.exit(2);
}

const dir = resolve(root, packageDir);
const manifest = JSON.parse(await readFile(resolve(dir, "components.json"), "utf8"));
const designPath = resolve(dir, manifest.sourceDesign);
const design = JSON.parse(await readFile(designPath, "utf8"));
const canvas = design.canvas;
if (!Number.isInteger(canvas?.width) || !Number.isInteger(canvas?.height)) {
    throw new Error("sourceDesign.canvas must contain positive integer width and height");
}

const assets = new Map();
for (const [id, asset] of Object.entries(design.assets ?? {})) {
    if (!asset.path || !asset.path.endsWith(".png")) continue;
    const path = resolve(dir, asset.path);
    await access(path);
    assets.set(id, path);
}
for (const resource of manifest.resources ?? []) {
    if (resource.kind !== "image" || assets.has(resource.id)) continue;
    const path = resolve(dir, resource.path);
    await access(path);
    assets.set(resource.id, path);
}

const composites = [];
const visit = (id, inheritedOpacity = 1, offsetX = 0, offsetY = 0) => {
    const node = design.nodes?.[id];
    if (!node || node.visible === false) return;
    const opacity = inheritedOpacity * (Number.isFinite(node.opacity) ? node.opacity : 1);
    if (node.kind === "group") {
        const groupX = Number.isFinite(node.frame?.x) ? Math.round(node.frame.x) : 0;
        const groupY = Number.isFinite(node.frame?.y) ? Math.round(node.frame.y) : 0;
        for (const child of node.children ?? []) visit(child, opacity, offsetX + groupX, offsetY + groupY);
        return;
    }
    if (node.kind !== "image" || !node.asset) return;
    const frame = node.frame;
    const assetPath = assets.get(node.asset);
    if (!assetPath || !frame) return;
    const x = offsetX + Math.round(frame.x);
    const y = offsetY + Math.round(frame.y);
    const width = Math.round(frame.width);
    const height = Math.round(frame.height);
    if (width <= 0 || height <= 0 || opacity <= 0) return;
    composites.push({ assetPath, x, y, width, height, opacity });
};
for (const id of design.roots ?? Object.keys(design.nodes ?? {})) visit(id);

const command = ["-size", `${canvas.width}x${canvas.height}`, "xc:none", "-colorspace", "sRGB"];
for (const layer of composites) {
    command.push("(",
        layer.assetPath);
    if (layer.width || layer.height) command.push("-resize", `${layer.width}x${layer.height}!`);
    if (layer.opacity < 1) {
        command.push("-channel", "A", "-evaluate", "multiply", String(layer.opacity), "+channel");
    }
    command.push(")", "-geometry", `+${layer.x}+${layer.y}`, "-composite");
}
command.push("-colorspace", "sRGB", resolve(root, output));
await execFileAsync("magick", command);
console.log(`Rendered independent UniFlex source: ${resolve(root, output)}`);
