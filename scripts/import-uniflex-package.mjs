import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const update = process.argv.includes("--update");
const outIndex = process.argv.indexOf("--out");
const outputArg = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
const packageArg = process.argv.slice(2).find((arg, index, args) =>
    !arg.startsWith("--") && !(index > 0 && args[index - 1] === "--out"));
const packageDir = resolve(packageArg || "");
if (!packageDir) throw new Error("Usage: npm run import:uniflex-ui -- /path/to/project-package");
const manifest = JSON.parse(await readFile(resolve(packageDir, "components.json"), "utf8"));
if (![1, 2].includes(manifest.schemaVersion) || manifest.kind !== "uniflex-import-package")
    throw new Error("Invalid UniFlex import package.");
const name = String(manifest.name).replace(/[^a-zA-Z0-9_-]+/g, "_");
const target = outputArg
    ? resolve(root, outputArg)
    : resolve(root, "apps/client/src/ui-uniflex/imported", name);
const exists = await access(target).then(() => true).catch((error) => {
    if (error.code === "ENOENT") return false;
    throw error;
});
if (exists && !update)
    throw new Error(`Import target already exists: ${target}; pass --update to refresh it.`);
await mkdir(dirname(target), { recursive: true });
await cp(packageDir, target, { recursive: true });
await writeFile(resolve(target, "import.json"), JSON.stringify({
    schemaVersion: 1, kind: "uniflex-project-import", name,
    source: manifest.sourceDesign, canvas: manifest.canvas,
    interactiveNodes: manifest.interactiveNodes,
}, null, 2) + "\n");
console.log(`Imported UniFlex UI ${name} into ${target}`);
