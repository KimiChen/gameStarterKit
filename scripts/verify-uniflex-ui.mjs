import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const cocosImage = value("--cocos-image");
const approvalPath = value("--approval");
const approveWeb = args.includes("--approve-web");
const compareMetric = (arguments_) => {
    const result = spawnSync("magick", arguments_, { encoding: "utf8" });
    if (result.error) throw result.error;
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const metric = output.match(/^\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\s*(?:\(|$)/im)?.[1];
    if (metric === undefined)
        throw new Error(`ImageMagick compare returned no metric: ${output.trim()}`);
    return metric;
};
const actionFor = (name) => {
    if (!/(按钮|使用|返回|关闭|确定|取消|页签|分页|标签|tab|加|减|下一|上一|选择|装备|领取|确认|提交|use|button|back|close)/i.test(name))
        return null;
    if (/(返回|上一|back)/i.test(name)) return "back";
    if (/(关闭|取消|close)/i.test(name)) return "close";
    if (/(页签|标签|tab|分页)/i.test(name)) return "tab";
    if (/(使用|领取|确认|提交|装备|use)/i.test(name)) return "primary";
    return "select";
};

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
        const project = JSON.parse(await readFile(resolve(dir, "design.json"), "utf8"));
        const resourcesManifest = JSON.parse(await readFile(resolve(dir, "manifest.json"), "utf8"));
        add("design.kind", project.kind === "uniflex-design", `expected uniflex-design, got ${project.kind}`);
        add("design.schemaVersion", project.schemaVersion === 1, `unsupported schema ${project.schemaVersion}`);
        add("manifest.version", resourcesManifest.version === 1, `unsupported resource manifest version ${resourcesManifest.version}`);
        add("manifest.assets", Array.isArray(resourcesManifest.assets), "manifest.assets must be an array");
        const canvas = project.canvas;
        add("design.canvas", Number.isInteger(canvas?.width) && Number.isInteger(canvas?.height)
            && canvas.width > 0 && canvas.height > 0, "canvas width/height must be positive integers");

        const nodes = Object.values(project.nodes || {})
            .map((node) => ({ id: node.id, name: node.name, action: actionFor(node.name ?? "") }))
            .filter((node) => node.action)
            .map((node) => ({ ...node, stableKey: node.id, binding: false }));
        const names = new Set();
        for (const node of nodes) {
            const stableName = node.name ?? node.stableKey;
            add(`interactive.${node.id}`, typeof stableName === "string" && stableName.length > 0,
                "interactive candidate needs a stable name", "warning");
            if (stableName) {
                add(`interactive.unique.${stableName}`, !names.has(stableName),
                    "duplicate stable control name is expected for reused component instances",
                    "warning");
                names.add(stableName);
            }
            add(`interactive.action.${node.id}`, ["primary", "back", "tab", "close", "select"].includes(node.action),
                `unsupported action ${node.action}`);
            add(`interactive.binding.${node.id}`, Boolean(node.binding || project.bindings?.[stableName]),
                "candidate has no business onAction binding; it will be listed as unbound", "warning");
        }

        const resources = Array.isArray(resourcesManifest.assets) ? resourcesManifest.assets : [];
        let nineSliceCount = 0;
        for (const resource of resources) {
            add(`resource.${resource.id}`, await exists(resource.file),
                `missing resource ${resource.file}`);
            if (resource.nineSlice !== undefined) {
                nineSliceCount += 1;
                const valid = Array.isArray(resource.nineSlice) && resource.nineSlice.length === 4
                    && resource.nineSlice.every((value) => Number.isFinite(value) && value >= 0)
                    && (!Number.isInteger(resource.width) || !Number.isInteger(resource.height)
                        || (resource.nineSlice[0] + resource.nineSlice[2] <= resource.width
                            && resource.nineSlice[1] + resource.nineSlice[3] <= resource.height));
                add(`nineSlice.${resource.id}`, valid,
                    "nineSlice must be four non-negative insets within the image bounds");
            }
            if (resource.kind === "font")
                add(`font.metrics.${resource.id}`, Boolean(resource.metrics?.advances),
                    "font resource has no advances metrics; empty font catalog cannot render editable text", "warning");
        }
        add("nineSlice.declarations", nineSliceCount > 0,
            "no resource declares nineSlice; review stretchable frame and button assets", "warning");
        const sourceDesign = project;
        let sourceSupplement = null;
        const textNodes = Object.values(sourceDesign.nodes || {}).filter((node) => node.kind === "text");
        for (const node of textNodes) {
            const font = sourceDesign.fonts?.[node.text?.fontId];
            add(`text.fontRef.${node.id}`, Boolean(node.text?.fontId && font?.path && font?.sha256),
                "text layer has no explicit fontRef/path/hash");
        }
        if (await exists("psd-extra.json")) {
            sourceSupplement = JSON.parse(await readFile(resolve(dir, "psd-extra.json"), "utf8"));
            add("sourceSupplement.kind", sourceSupplement.kind === "psd-supplement",
                `expected psd-supplement, got ${sourceSupplement.kind}`);
            add("sourceSupplement.schemaVersion", sourceSupplement.schemaVersion === 1,
                `unsupported supplement schema ${sourceSupplement.schemaVersion}`);
            add("sourceSupplement.sourceSha256", /^[a-f0-9]{64}$/i.test(sourceSupplement.sourceSha256 ?? ""),
                "supplement must retain the 64-character source PSD SHA-256");
            add("sourceSupplement.layers", sourceSupplement.layers
                && typeof sourceSupplement.layers === "object"
                && !Array.isArray(sourceSupplement.layers),
            "supplement layers must be an object keyed by stable layer id");
        }
        const componentAudit = [];
        const decompositionCandidates = [];
        if (sourceSupplement?.layers && sourceDesign?.nodes) {
            const supplementLayers = sourceSupplement.layers;
            const nodeById = sourceDesign.nodes;
            const rasterizedGroupIds = new Set(Object.values(supplementLayers)
                .map((layer) => layer.renderedBy)
                .filter((id) => typeof id === "string"));
            const rasterizedGroups = [...rasterizedGroupIds]
                .map((id) => nodeById[id])
                .filter(Boolean);
            for (const group of rasterizedGroups) {
                const groupLayers = Object.entries(supplementLayers)
                    .filter(([, layer]) => layer.renderedBy === group.id);
                for (const [id, layer] of groupLayers) {
                    const node = nodeById[id] ?? {
                        id,
                        name: layer.properties?.name ?? id,
                        kind: layer.properties?.text ? "text" : "image",
                    };
                    const properties = layer?.properties ?? {};
                    const reasons = ["parent group is currently rasterized"];
                    if (properties.clipping) reasons.push("clipping layer");
                    if (properties.blendMode && properties.blendMode !== "normal")
                        reasons.push(`blend mode ${properties.blendMode}`);
                    if (properties.effects && Object.keys(properties.effects).length > 1)
                        reasons.push("layer effects");
                    if (layer?.renderedBy) reasons.push(`renderedBy ${layer.renderedBy}`);
                    const text = properties.text;
                    const candidateKind = text ? "text" : properties.vectorFill || properties.vectorMask ? "shape" : "image";
                    const editable = candidateKind === "text"
                        && node.kind === "text"
                        && Boolean(node.text?.fontId)
                        && reasons.length === 0;
                    if (candidateKind === "text" && !node.text?.fontId)
                        reasons.push("no UniFlex fontRef/advances mapping");
                    const bounds = ["left", "top", "right", "bottom"].every((key) =>
                        Number.isFinite(properties[key]));
                    decompositionCandidates.push({
                        id: node.id,
                        name: node.name ?? node.id,
                        parent: group.id,
                        parentName: group.name ?? group.id,
                        kind: candidateKind,
                        frame: node.frame ?? (bounds ? {
                            x: properties.left,
                            y: properties.top,
                            width: properties.right - properties.left,
                            height: properties.bottom - properties.top,
                        } : null),
                        status: editable ? "candidate" : "blocked",
                        editable,
                        recommendation: candidateKind === "text"
                            ? "restore-text-after-font-and-effect-review"
                            : "keep-raster-until-visual-regression",
                        reasons,
                        sourceLayerPresent: Boolean(layer),
                    });
                }
            }
        }
        const report = {
            schemaVersion: 1,
            kind: "uniflex-ui-verification",
            package: dir,
            thresholds: { color: 0.1, regionDiffPercent: 5 },
            sourceToWebIsRequired: true,
            cocosRequiresApprovedWebProposal: true,
            componentization: {
                total: componentAudit.length,
                semantic: componentAudit.filter((component) => !component.rasterized).length,
                rasterized: componentAudit.filter((component) => component.rasterized).length,
                components: componentAudit,
            },
            decomposition: {
                sourceSupplement: sourceSupplement ? "psd-extra.json" : null,
                candidates: decompositionCandidates,
                candidateCount: decompositionCandidates.filter((item) => item.status === "candidate").length,
                blockedCount: decompositionCandidates.filter((item) => item.status === "blocked").length,
            },
            checks, errors, warnings,
        };
        const sha256 = (file) => createHash("sha256").update(requireFile(file)).digest("hex");
        const requireFile = (file) => execFileSync("cat", [resolve(root, file)]);
        if (sourceImage || webImage) {
            add("golden.images", Boolean(sourceImage && webImage), "provide both --source-image and --web-image");
            if (sourceImage && webImage) {
                try {
                    const dimensions = (file) => execFileSync("magick", ["identify", "-format", "%w %h", resolve(root, file)], { encoding: "utf8" }).trim();
                    const sourceSize = dimensions(sourceImage);
                    const webSize = dimensions(webImage);
                    add("golden.canvas", sourceSize === webSize && sourceSize === `${canvas.width} ${canvas.height}`,
                        `source=${sourceSize}, web=${webSize}, contract=${canvas.width} ${canvas.height}`);
                    const metric = compareMetric(["compare", "-metric", "AE", "-fuzz", "10%",
                        resolve(root, sourceImage), resolve(root, webImage), "null:"]);
                    add("golden.pixelDiff", metric === "0", `10% color threshold differing pixels=${metric}`);
                    if (sourceSize === webSize && typeof sourceDesign === "object") {
                        const regions = [
                            ...nodes.map((node) => ({ id: node.name ?? node.stableKey ?? node.id, nodeId: node.id })),
                        ];
                        const seenRegions = new Set();
                        for (const region of regions) {
                            if (seenRegions.has(region.nodeId)) continue;
                            seenRegions.add(region.nodeId);
                            const frame = sourceDesign.nodes?.[region.nodeId]?.frame;
                            if (!frame || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)
                                || frame.width <= 0 || frame.height <= 0) continue;
                            const x = Math.round(frame.x);
                            const y = Math.round(frame.y);
                            const right = Math.min(canvas.width, x + Math.round(frame.width));
                            const bottom = Math.min(canvas.height, y + Math.round(frame.height));
                            const left = Math.max(0, x);
                            const top = Math.max(0, y);
                            if (left !== x || top !== y || right !== x + Math.round(frame.width)
                                || bottom !== y + Math.round(frame.height)) {
                                add(`golden.regionBounds.${region.id}`, false,
                                    `design region exceeds canvas and was clipped: frame=${x},${y},${Math.round(frame.width)},${Math.round(frame.height)}, canvas=${canvas.width}x${canvas.height}`,
                                    "warning");
                            }
                            if (right <= left || bottom <= top) continue;
                            const width = right - left;
                            const height = bottom - top;
                            const geometry = `${width}x${height}+${left}+${top}`;
                            const regionMetric = compareMetric([
                                "compare", "-metric", "AE", "-fuzz", "10%",
                                `${resolve(root, sourceImage)}[${geometry}]`,
                                `${resolve(root, webImage)}[${geometry}]`, "null:",
                            ]);
                            const differingPixels = Number.parseInt(regionMetric, 10);
                            const area = width * height;
                            const percent = Number.isFinite(differingPixels) && area > 0
                                ? differingPixels / area * 100 : 100;
                            add(`golden.region.${region.id}`, percent <= 5,
                                `region=${geometry}, differing=${differingPixels}, diff=${percent.toFixed(2)}%, limit=5%`);
                        }
                    }
                    if (approveWeb && sourceImage && webImage && metric.trim() === "0"
                        && sourceSize === webSize && errors.length === 0) {
                        if (!approvalPath) add("golden.approvalPath", false, "--approve-web requires --approval");
                        else {
                            const approval = {
                                schemaVersion: 1, kind: "uniflex-web-golden-approval",
                                package: dir, canvas, sourceImage, webImage,
                                sourceSha256: sha256(sourceImage), webSha256: sha256(webImage),
                                colorThreshold: 0.1, regionDiffPercent: 5,
                            };
                            const output = resolve(root, approvalPath);
                            await mkdir(dirname(output), { recursive: true });
                            await writeFile(output, JSON.stringify(approval, null, 2) + "\n");
                            console.log(`Approved Web proposal: ${output}`);
                        }
                    }
                } catch (error) {
                    add("golden.images", false, `unable to compare images: ${error.message}`);
                }
            }
        }
        if (cocosImage) {
            add("cocos.image", await access(resolve(root, cocosImage)).then(() => true).catch(() => false),
                `Cocos evidence image does not exist: ${cocosImage}`);
            add("cocos.approval", Boolean(approvalPath && await access(resolve(root, approvalPath)).then(() => true).catch(() => false)),
                "Cocos evidence requires an approved Web proposal");
            if (approvalPath && await access(resolve(root, approvalPath)).then(() => true).catch(() => false)) {
                const approval = JSON.parse(await readFile(resolve(root, approvalPath), "utf8"));
                add("cocos.approval.package", approval.package === dir, "approval belongs to a different package");
                add("cocos.approval.webHash", approval.webSha256 === sha256(approval.webImage),
                    "approved Web proposal hash changed");
                if (await access(resolve(root, cocosImage)).then(() => true).catch(() => false)) {
                    try {
                        const dimensions = (file) => execFileSync("magick", [
                            "identify", "-format", "%w %h", resolve(root, file),
                        ], { encoding: "utf8" }).trim();
                        const cocosSize = dimensions(cocosImage);
                        add("cocos.canvas", cocosSize === `${canvas.width} ${canvas.height}`,
                            `cocos=${cocosSize}, contract=${canvas.width} ${canvas.height}`);
                        const proposalSize = dimensions(approval.webImage);
                        add("cocos.webCanvas", cocosSize === proposalSize,
                            `cocos=${cocosSize}, approvedWeb=${proposalSize}`);
                        if (cocosSize === proposalSize) {
                            const metric = compareMetric([
                                "compare", "-metric", "AE", "-fuzz", "10%",
                                resolve(root, approval.webImage), resolve(root, cocosImage), "null:",
                            ]);
                            add("cocos.pixelDiff", metric === "0",
                                `10% color threshold differing pixels=${metric}`);
                        }
                    } catch (error) {
                        add("cocos.image", false, `unable to compare Cocos evidence: ${error.message}`);
                    }
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
