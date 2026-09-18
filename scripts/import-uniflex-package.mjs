import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import {
    authoringDirFromCatalog, loadPreviewScreens, moduleForPageName,
} from "./lib/uniflex-page-modules.mjs";

const root = resolve(import.meta.dirname, "..");
const update = process.argv.includes("--update");
const outIndex = process.argv.indexOf("--out");
const outputArg = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
const nameIndex = process.argv.indexOf("--name");
const nameArg = nameIndex >= 0 ? process.argv[nameIndex + 1] : undefined;
const packageArg = process.argv.slice(2).find((arg, index, args) =>
    !arg.startsWith("--") && !(index > 0 && ["--out", "--name"].includes(args[index - 1])));
const packageDir = resolve(packageArg || "");
if (!packageDir) throw new Error("Usage: npm run import:uniflex-ui -- /path/to/project-package");
const project = JSON.parse(await readFile(resolve(packageDir, "design.json"), "utf8"));
const resourcesManifest = JSON.parse(await readFile(resolve(packageDir, "manifest.json"), "utf8"));
if (project.schemaVersion !== 1 || project.kind !== "uniflex-design")
    throw new Error("Invalid UniFlex import package.");
if (resourcesManifest.version !== 1 || !Array.isArray(resourcesManifest.assets))
    throw new Error("Invalid UniFlex resource manifest.");
const name = String(nameArg || project.name || "ImportedUI").replace(/[^a-zA-Z0-9_-]+/g, "_");
const projectRoot = outputArg ? resolve(root, outputArg) : root;
const screens = await loadPreviewScreens(projectRoot);
const authoringRel = authoringDirFromCatalog(screens, name);
const pageTarget = authoringRel
    ? resolve(projectRoot, authoringRel)
    : resolve(projectRoot, "apps/client/src/ui-uniflex/modules", name);
const resourceTarget = resolve(projectRoot, "apps/client/resources/ui", name);
const exists = await access(resourceTarget).then(() => true).catch((error) => {
    if (error.code === "ENOENT") return false;
    throw error;
});
if (exists && !update)
    throw new Error(`Import target already exists: ${resourceTarget}; pass --update to refresh it.`);
await rm(resourceTarget, { recursive: true, force: true });
await mkdir(resourceTarget, { recursive: true });
await writeFile(resolve(resourceTarget, "manifest.json"), JSON.stringify(resourcesManifest, null, 2) + "\n");

// A package may optionally carry authoring source. Keep it beside the runtime
// resources, but never mix design metadata or binary assets into the page tree.
const sourceEntries = [];
const resourceNames = new Set(["assets", "design.json", "manifest.json", "psd-extra.json"]);
let copiedRestored = false;
for (const entry of await readdir(packageDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === "restored") {
        const restoredSource = resolve(packageDir, entry.name);
        const restoredTarget = resolve(projectRoot, "apps/client/src/ui-uniflex/restored");
        await mkdir(restoredTarget, { recursive: true });
        for (const child of await readdir(restoredSource, { withFileTypes: true })) {
            if (child.name === "pages" && child.isDirectory() && screens) {
                const pagesSource = resolve(restoredSource, child.name);
                for (const page of await readdir(pagesSource, { withFileTypes: true })) {
                    const module = moduleForPageName(page.name);
                    const dest = module
                        ? join(restoredTarget, "modules", module, page.name)
                        : join(restoredTarget, "modules", page.name);
                    await mkdir(dirname(dest), { recursive: true });
                    await cp(resolve(pagesSource, page.name), dest, { recursive: true, force: true });
                }
                continue;
            }
            await cp(resolve(restoredSource, child.name), resolve(restoredTarget, child.name),
                { recursive: true, force: true });
        }
        copiedRestored = true;
        continue;
    }
    const isSource = entry.isDirectory()
        ? entry.name === "components"
        : [".ts", ".tsx"].includes(extname(entry.name)) || entry.name === "README.md";
    if (isSource) {
        if (entry.isDirectory() && (await readdir(resolve(packageDir, entry.name))).length === 0) {
            continue;
        }
        sourceEntries.push(entry);
        continue;
    }
    if (resourceNames.has(entry.name)) {
        await cp(resolve(packageDir, entry.name), resolve(resourceTarget, entry.name),
            { recursive: true, force: true });
    }
}
const sourceNames = [];
if (sourceEntries.length) {
    await rm(pageTarget, { recursive: true, force: true });
    await mkdir(pageTarget, { recursive: true });
    for (const entry of sourceEntries) {
        const targetName = entry.name.replace(/\.authoring\.tsx$/u, ".tsx");
        sourceNames.push(targetName);
        await cp(resolve(packageDir, entry.name), resolve(pageTarget, targetName),
            { recursive: true, force: true });
    }
}
console.log(`Imported UniFlex UI ${name}: resources=${resourceTarget}`
    + (sourceNames.length ? `, authoring=${pageTarget}` : "")
    + (copiedRestored ? `, restored=${resolve(projectRoot, "apps/client/src/ui-uniflex/restored")}` : ""));

// The converter emits self-references to `<Name>.authoring`; the importer renames
// that entry to `<Name>.tsx`, so rewrite the references to match.
if (sourceNames.length) {
    const stack = [pageTarget];
    while (stack.length) {
        const current = stack.pop();
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const full = resolve(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
            } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
                const text = await readFile(full, "utf8");
                const rewritten = text.replaceAll(`${name}.authoring`, name);
                if (rewritten !== text) await writeFile(full, rewritten);
            }
        }
    }
}
