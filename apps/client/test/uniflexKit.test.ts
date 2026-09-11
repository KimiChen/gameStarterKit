import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const kit = resolve(root, "apps/client/src/kits/uniflex");
const lib = resolve(root, "apps/client/src/lib/uniflex");
function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(dir, entry.name);
        return entry.isDirectory() ? files(path) : entry.name.endsWith(".ts") ? [path] : [];
    });
}
function runtimeFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(dir, entry.name);
        return entry.isDirectory() ? runtimeFiles(path) : entry.name.endsWith(".js") ? [path] : [];
    });
}
function imports(file: string): string[] {
    return ts.preProcessFile(readFileSync(file, "utf8")).importedFiles.map((entry) => entry.fileName);
}
function resolveImport(file: string, name: string): string {
    return resolve(dirname(file), name);
}
function inDir(dir: string, file: string): boolean {
    const rel = relative(dir, file);
    return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
}
function closure(file: string, visited = new Set<string>()): string[] {
    if (visited.has(file)) return [];
    visited.add(file);
    return imports(file).flatMap((name) => {
        if (!name.startsWith(".")) return [name];
        const target = resolveImport(file, name);
        if (inDir(lib, target)) {
            const rel = relative(lib, target).replaceAll("\\", "/");
            assert.ok(rel.startsWith("mod/"), `${file} must import lib through mod/: ${name}`);
            return [`lib/uniflex/${rel}`];
        }
        const tsFile = target.endsWith(".ts") ? target : `${target}.ts`;
        return existsSync(tsFile) ? closure(tsFile, visited) : [name];
    });
}

test("UniFlex kit API surfaces are declared and core code has no business dependencies", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "apps/kits/uniflex/kit.json"), "utf8"));
    assert.equal(manifest.id, "uniflex");
    assert.equal(manifest.version, undefined, "host-owned kit must not claim a distributable version");
    assert.deepEqual(Object.keys(manifest.api).sort(), ["cocos", "core", "navigation", "provider", "web"]);
    for (const surface of Object.keys(manifest.api)) {
        assert.ok(readFileSync(resolve(kit, `api/${surface}/index.ts`), "utf8").length);
    }
    for (const file of files(kit)) {
        for (const name of imports(file)) {
            if (name.startsWith(".")) {
                const target = resolveImport(file, name);
                assert.ok(inDir(kit, target) || inDir(lib, target),
                    `${file} must not depend on host/business code: ${name}`);
                if (inDir(lib, target)) {
                    assert.ok(relative(lib, target).replaceAll("\\", "/").startsWith("mod/"),
                        `${file} must import lib through mod/: ${name}`);
                }
            } else {
                assert.equal(name, "cc", `${file}: unexpected dependency ${name}`);
            }
        }
    }
});

test("UniFlex host entry points do not import the opposite rendering host", () => {
    for (const surface of ["core", "navigation", "provider", "web"]) {
        const deps = closure(resolve(kit, `api/${surface}/index.ts`));
        assert.ok(!deps.includes("cc"), `${surface} must remain usable outside Cocos`);
        assert.ok(!deps.some((dep) => dep.includes("lib/uniflex/cocos")), `${surface} imported cocos runtime`);
    }
    const cocos = closure(resolve(kit, "api/cocos/index.ts"));
    assert.ok(!cocos.some((dep) => dep.includes("lib/uniflex/web")));
});

test("UniFlex lib is ESM and exposes TypeScript entry wrappers for Cocos", () => {
    const manifest = JSON.parse(readFileSync(resolve(lib, "package.json"), "utf8"));
    assert.equal(manifest.type, "module");
    const wrappers = files(resolve(lib, "mod"));
    assert.ok(wrappers.length > 0, "mod/ TypeScript wrappers must exist");
    for (const file of wrappers) {
        const specs = [...new Set(imports(file))];
        assert.equal(specs.length, 1, file);
        assert.ok(specs[0].endsWith(".js"), `${file} must re-export a .js module`);
        assert.ok(existsSync(resolveImport(file, specs[0])), `${file} missing ${specs[0]}`);
        const source = readFileSync(file, "utf8");
        assert.match(source, /export \{ [^}]+ \} from /);
        assert.match(source, /export type \* from /);
    }
});

test("UniFlex is a kit catalog unit, not a PluginHost plugin", () => {
    const plugins = readFileSync(resolve(root, "apps/client/src/generated/plugins.generated.ts"), "utf8");
    const pluginIds = [...plugins.matchAll(/^ {4}"([^"\n]+)",$/gmu)].map((match) => match[1]);
    assert.equal(pluginIds.includes("uniflex"), false, "UniFlex must not appear in PLUGIN_IDS");
    assert.doesNotMatch(plugins, /id: "uniflex"/u);
    const catalog = readFileSync(resolve(root, "apps/shared/src/kits/catalog.generated.ts"), "utf8");
    assert.match(catalog, /^ {8}id: "uniflex",$/mu);
});

test("UniFlex vendored runtime stays within the ES2017 API floor", () => {
    const forbidden = [
        [/\.(?:at)\s*\(/u, "Array.prototype.at"],
        [/\.replaceAll\s*\(/u, "String.prototype.replaceAll"],
        [/Object\.fromEntries\s*\(/u, "Object.fromEntries"],
        [/\.(?:flat|flatMap)\s*\(/u, "Array flattening"],
        [/\.finally\s*\(/u, "Promise.prototype.finally"],
        [/\bnew AggregateError\s*\(/u, "AggregateError"],
    ] as const;
    for (const file of runtimeFiles(lib)) {
        const source = readFileSync(file, "utf8");
        for (const [pattern, name] of forbidden)
            assert.doesNotMatch(source, pattern, `${file} uses ${name}`);
    }
});
