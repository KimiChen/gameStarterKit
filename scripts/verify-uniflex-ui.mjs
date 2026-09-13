import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
};
const packageDir = value("--package");
const reportPath = value("--report");
const strict = args.includes("--strict");
const sourceImage = value("--source-image");
const webImage = value("--web-image");

if (!packageDir) {
    console.error("Usage: npm run ui:verify -- --package <project-package> [--strict] [--report <file>]");
    process.exitCode = 2;
} else {
    const errors = [];
    const warnings = [];
    const checks = [];
    const dir = resolve(root, packageDir);
    const exists = async (relative) => access(resolve(dir, relative)).then(() => true).catch(() => false);
    const add = (name, ok, detail, severity = "error") => {
        checks.push({ name, ok, detail, severity });
        if (!ok) (severity === "error" ? errors : warnings).push(`${name}: ${detail}`);
    };
    try {
        const manifest = JSON.parse(await readFile(resolve(dir, "components.json"), "utf8"));
        add("manifest.kind", manifest.kind === "uniflex-import-package", `expected uniflex-import-package, got ${manifest.kind}`);
        add("manifest.schemaVersion", [1, 2].includes(manifest.schemaVersion), `unsupported schema ${manifest.schemaVersion}`);
        add("manifest.sourceDesign", typeof manifest.sourceDesign === "string" && await exists(manifest.sourceDesign),
            `sourceDesign must be a file in the package: ${manifest.sourceDesign}`);
        const canvas = manifest.canvas;
        add("manifest.canvas", Number.isInteger(canvas?.width) && Number.isInteger(canvas?.height)
            && canvas.width > 0 && canvas.height > 0, "canvas width/height must be positive integers");

        if (canvas?.width && canvas?.height && typeof manifest.sourceDesign === "string"
            && manifest.sourceDesign.endsWith(".json") && await exists(manifest.sourceDesign)) {
            const source = JSON.parse(await readFile(resolve(dir, manifest.sourceDesign), "utf8"));
            add("sourceDesign.canvas", source.canvas?.width === canvas.width && source.canvas?.height === canvas.height,
                `source=${source.canvas?.width}x${source.canvas?.height}, package=${canvas.width}x${canvas.height}`);
        }

        const nodes = Array.isArray(manifest.interactiveNodes) ? manifest.interactiveNodes : [];
        const names = new Set();
        for (const node of nodes) {
            const stableName = node.name ?? node.stableKey;
            add(`interactive.${node.id}`, typeof stableName === "string" && stableName.length > 0,
                "interactive candidate needs a stable name", "warning");
            if (stableName) {
                add(`interactive.unique.${stableName}`, !names.has(stableName),
                    "duplicate stable control name");
                names.add(stableName);
            }
            add(`interactive.action.${node.id}`, ["primary", "back", "tab", "close", "select"].includes(node.action),
                `unsupported action ${node.action}`);
            add(`interactive.binding.${node.id}`, Boolean(node.binding || manifest.bindings?.[stableName]),
                "candidate has no business onAction binding; it will be listed as unbound", "warning");
        }

        const spec = manifest.decompositionSpec || manifest.decomposition;
        add("nineSlice.spec", Boolean(spec?.nineSlice || manifest.nineSlice),
            "no explicit nine-slice declarations; bottom/frame/button layers must be reviewed", "warning");
        const candidates = (manifest.components || []).filter((item) =>
            /button|btn|frame|panel|底框|按钮|面板/i.test(`${item.name} ${item.node}`));
        for (const candidate of candidates)
            add(`nineSlice.${candidate.id}`, Boolean(candidate.nineSlice || spec?.nineSlice?.[candidate.id]),
                "frame/button component has no explicit nine-slice bounds", "warning");

        const resources = Array.isArray(manifest.resources) ? manifest.resources : [];
        for (const resource of resources) {
            add(`resource.${resource.id}`, await exists(resource.path),
                `missing resource ${resource.path}`);
            if (resource.kind === "font")
                add(`font.metrics.${resource.id}`, Boolean(resource.metrics?.advances),
                    "font resource has no advances metrics; empty font catalog cannot render editable text", "warning");
        }
        const sourcePath = manifest.sourceDesign && resolve(dir, manifest.sourceDesign);
        if (sourcePath && manifest.sourceDesign?.endsWith(".json") && await exists(manifest.sourceDesign)) {
            const source = JSON.parse(await readFile(sourcePath, "utf8"));
            const textNodes = Object.values(source.nodes || {}).filter((node) => node.kind === "text");
            for (const node of textNodes) {
                const font = source.fonts?.[node.text?.fontId];
                add(`text.fontRef.${node.id}`, Boolean(node.text?.fontId && font?.path && font?.sha256),
                    "text layer has no explicit fontRef/path/hash");
            }
        }
        const report = {
            schemaVersion: 1,
            kind: "uniflex-ui-verification",
            package: dir,
            thresholds: { color: 0.1, regionDiffPercent: 5 },
            sourceToWebIsRequired: true,
            cocosRequiresApprovedWebProposal: true,
            checks, errors, warnings,
        };
        if (sourceImage || webImage) {
            add("golden.images", Boolean(sourceImage && webImage), "provide both --source-image and --web-image");
            if (sourceImage && webImage) {
                try {
                    const dimensions = (file) => execFileSync("magick", ["identify", "-format", "%w %h", resolve(root, file)], { encoding: "utf8" }).trim();
                    const sourceSize = dimensions(sourceImage);
                    const webSize = dimensions(webImage);
                    add("golden.canvas", sourceSize === webSize && sourceSize === `${canvas.width} ${canvas.height}`,
                        `source=${sourceSize}, web=${webSize}, contract=${canvas.width} ${canvas.height}`);
                    const metric = execFileSync("magick", ["compare", "-metric", "AE", "-fuzz", "10%", resolve(root, sourceImage), resolve(root, webImage), "null:"],
                        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
                    add("golden.pixelDiff", metric.trim() === "0", `10% color threshold differing pixels=${metric.trim()}`);
                } catch (error) {
                    add("golden.images", false, `unable to compare images: ${error.message}`);
                }
            }
        }
        report.status = errors.length || (strict && warnings.length) ? "blocked" : "diagnostic";
        if (reportPath) {
            const output = resolve(root, reportPath);
            await mkdir(dirname(output), { recursive: true });
            await writeFile(output, JSON.stringify(report, null, 2) + "\n");
        }
        for (const line of [...errors.map((item) => `ERROR ${item}`), ...warnings.map((item) => `WARN ${item}`)])
            console.error(line);
        console.log(`UniFlex UI verification: ${report.status}; ${checks.length} checks, ${errors.length} errors, ${warnings.length} warnings`);
        if (errors.length || (strict && warnings.length)) process.exitCode = 1;
    } catch (error) {
        console.error(`ERROR verify-uniflex-ui: ${error.message}`);
        process.exitCode = 1;
    }
}
