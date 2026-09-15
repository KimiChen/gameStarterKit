import { access, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

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
const pageTarget = resolve(projectRoot, "apps/client/src/ui-uniflex/pages", name);
const resourceTarget = resolve(projectRoot, "apps/client/resources/ui", name);
const exists = await access(resourceTarget).then(() => true).catch((error) => {
    if (error.code === "ENOENT") return false;
    throw error;
});
if (exists && !update)
    throw new Error(`Import target already exists: ${resourceTarget}; pass --update to refresh it.`);
await mkdir(dirname(resourceTarget), { recursive: true });
await mkdir(resourceTarget, { recursive: true });
await writeFile(resolve(resourceTarget, "manifest.json"), JSON.stringify(resourcesManifest, null, 2) + "\n");

// A package may optionally carry authoring source. Keep it beside the runtime
// resources, but never mix design metadata or binary assets into the page tree.
const sourceNames = [];
const resourceNames = new Set(["assets", "design.json", "manifest.json", "psd-extra.json"]);
for (const entry of await readdir(packageDir, { withFileTypes: true })) {
    const isSource = entry.isDirectory()
        ? entry.name === "components"
        : [".ts", ".tsx"].includes(extname(entry.name)) || entry.name === "README.md";
    if (isSource) {
        const targetName = entry.name.replace(/\.authoring\.tsx$/u, ".tsx");
        sourceNames.push(targetName);
        await mkdir(pageTarget, { recursive: true });
        await cp(resolve(packageDir, entry.name), resolve(pageTarget, targetName),
            { recursive: true, force: true });
        continue;
    }
    if (resourceNames.has(entry.name)) {
        await cp(resolve(packageDir, entry.name), resolve(resourceTarget, entry.name),
            { recursive: true, force: true });
    }
}
console.log(`Imported UniFlex UI ${name}: resources=${resourceTarget}`
    + (sourceNames.length ? `, authoring=${pageTarget}` : ""));

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
