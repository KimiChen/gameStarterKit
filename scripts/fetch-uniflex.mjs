#!/usr/bin/env node
/**
 * Unpack the locked UniFlex runtime tarballs into apps/client/src/lib/uniflex.
 *
 * The npm packages in vendor/uniflex remain the versioned build input. Cocos and
 * the Web preview load the unpacked files through relative imports so the game
 * scripts do not depend on node_modules resolution.
 *
 * Ordinary development uses the committed lib files. Maintainers rerun
 * `npm run fetch:uniflex` after replacing the 0.1.1 tarballs, then
 * `npm run sync:client` and `node scripts/vendor-lock.mjs`.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = resolve(ROOT, "apps/client/src/lib/uniflex");
const VERSION = "0.1.1";
const PACKAGES = Object.freeze({
    core: `vendor/uniflex/uniflex-core-${VERSION}.tgz`,
    cocos: `vendor/uniflex/uniflex-cocos-${VERSION}.tgz`,
    web: `vendor/uniflex/uniflex-web-${VERSION}.tgz`,
});
const PACKAGE_META = Object.freeze({
    core: { name: "@uniflex/core", sha256: "09cdaec303346481b4cc1a715428fbdcef1e9e75c720ed197492f8ef27895ffc" },
    cocos: { name: "@uniflex/cocos", sha256: "de469150bc6b9946e819bc94ed75a0d62c83d90deb5695d6e645d725fdc9aabd" },
    web: { name: "@uniflex/web", sha256: "3c555c6455246b7d89b41778feab83eadd139e47a7222718ec54234fd70f28dd" },
    compiler: { name: "@uniflex/compiler", sha256: "4b747bf000e3d0d1bbbc97d12279f8786de1a2a6d097303c8f5c010b74a3b59a" },
    tooling: { name: "@uniflex/tooling", sha256: "601583b8f239be54f853527e594742a665c19892adea8839dcfddfee8dd7b7b0" },
});
const INPUT_PACKAGES = Object.freeze({
    ...PACKAGES,
    compiler: `vendor/uniflex/uniflex-compiler-${VERSION}.tgz`,
    tooling: `vendor/uniflex/uniflex-tooling-${VERSION}.tgz`,
});

const README = `# UniFlex 运行时（入库副本）

- 来源：根目录 \`vendor/uniflex/\` 的 \`@uniflex/core|cocos|web@${VERSION}\` npm 制品。
- \`core/\` 使用制品内的 Cocos 兼容包（Vue 已打进 chunks），不要再走 \`node_modules/@uniflex/*\`。
- \`cocos/\` 与 \`web/\` 里对 \`@uniflex/core/*\` 的导入已改成相对路径。
- \`package.json\` 的 \`type: module\` 让 Cocos 把这些 \`.js\` 当 ESM，而不是 CJS。
- \`mod/\` 下的 \`.ts\` 入口把无扩展名的项目导入接到带 \`.js\` 的 ESM 文件；不要手改。
- 作者态 AOT 仍使用 \`@uniflex/compiler\` / \`@uniflex/tooling\`，不要把编译器放进本目录。

本目录由 \`npm run fetch:uniflex\` 生成。不要手改 JS/d.ts；升级时替换 vendor tarball 后重跑脚本，
再 \`npm run sync:client\` 并重钉 \`scripts/vendor.sha256\`。
`;

const tmp = mkdtempSync(resolve(tmpdir(), "uniflex-lib-"));
try {
    for (const [name, relativeTarball] of Object.entries(INPUT_PACKAGES)) {
        const tarball = resolve(ROOT, relativeTarball);
        if (!existsSync(tarball)) throw new Error(`缺少 UniFlex 制品：${relativeTarball}`);
        const actualHash = createHash("sha256").update(readFileSync(tarball)).digest("hex");
        const expected = PACKAGE_META[name];
        if (actualHash !== expected.sha256)
            throw new Error(`${relativeTarball} sha256 不符：期望 ${expected.sha256}，实得 ${actualHash}`);
        const manifestStage = resolve(tmp, `${name}-manifest`);
        mkdirSync(manifestStage, { recursive: true });
        execFileSync("tar", ["-xzf", tarball, "-C", manifestStage], { stdio: "pipe" });
        const manifest = JSON.parse(readFileSync(resolve(manifestStage, "package", "package.json"), "utf8"));
        if (manifest.name !== expected.name || manifest.version !== VERSION)
            throw new Error(`${relativeTarball} 包身份不符：期望 ${expected.name}@${VERSION}，实得 ${manifest.name}@${manifest.version}`);
    }
    const extracted = {};
    for (const [name, relativeTarball] of Object.entries(PACKAGES)) {
        const tarball = resolve(ROOT, relativeTarball);
        const stage = resolve(tmp, name);
        mkdirSync(stage, { recursive: true });
        execFileSync("tar", ["-xzf", tarball, "-C", stage], { stdio: "pipe" });
        extracted[name] = resolve(stage, "package");
    }

    rmSync(DEST, { recursive: true, force: true });
    mkdirSync(DEST, { recursive: true });
    writeFileSync(resolve(DEST, "README.md"), README);

    unpackCore(extracted.core, resolve(DEST, "core"));
    unpackHost(extracted.cocos, resolve(DEST, "cocos"));
    unpackHost(extracted.web, resolve(DEST, "web"));
    rewritePackageSpecifiers(DEST);
    writeCocosEntrypoints(DEST);
} finally {
    rmSync(tmp, { recursive: true, force: true });
}

execFileSync(process.execPath, [resolve(ROOT, "scripts/vendor-lock.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
});
console.log(`UniFlex runtime unpacked to ${relative(ROOT, DEST)} @${VERSION}`);

function unpackCore(source, dest) {
    mkdirSync(dest, { recursive: true });
    const cocosDir = resolve(source, "dist/cocos");
    for (const entry of readdirSync(cocosDir, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.endsWith(".d.ts")) continue;
        cpSync(resolve(cocosDir, entry.name), resolve(dest, entry.name));
    }
    const dts = resolve(dest, "dts");
    copyDeclarations(resolve(source, "dist"), dts);
    const manifest = JSON.parse(readFileSync(resolve(source, "package.json"), "utf8"));
    for (const [subpath, entry] of Object.entries(manifest.exports ?? {})) {
        const name = subpath === "." ? "index" : subpath.slice(2);
        const types = typeof entry === "object" ? entry.types : undefined;
        if (!types || typeof types !== "string") continue;
        const typesDest = resolve(dts, types.replace(/^\.\/dist\//, ""));
        let rel = relative(dest, typesDest).replaceAll("\\", "/");
        if (!rel.startsWith(".")) rel = `./${rel}`;
        rel = rel.replace(/\.d\.ts$/, ".js");
        writeFileSync(resolve(dest, `${name}.d.ts`), `export * from '${rel}';\n`);
    }
}

function unpackHost(source, dest) {
    mkdirSync(dest, { recursive: true });
    cpSync(resolve(source, "dist"), dest, { recursive: true });
}

function copyDeclarations(from, dest) {
    const walk = (current) => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = resolve(current, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!entry.name.endsWith(".d.ts")) continue;
            const target = resolve(dest, relative(from, full));
            mkdirSync(dirname(target), { recursive: true });
            cpSync(full, target);
        }
    };
    walk(from);
}

function rewritePackageSpecifiers(root) {
    const walk = (current) => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = resolve(current, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!/\.(js|d\.ts)$/.test(entry.name)) continue;
            const source = readFileSync(full, "utf8");
            const next = source.replace(/(['"])(@uniflex\/(?:core|cocos|web)(?:\/[^'"]*)?)\1/g,
                (all, quote, spec) => `${quote}${toRelative(full, spec, root)}${quote}`);
            if (next !== source) writeFileSync(full, next);
            if (/(['"])@uniflex\/(?:core|cocos|web)(?:\/[^'"]*)?\1/.test(readFileSync(full, "utf8"))) {
                throw new Error(`${relative(ROOT, full)} 仍含 @uniflex 包导入`);
            }
        }
    };
    walk(root);
}

function toRelative(fromFile, spec, root) {
    const target = resolveTarget(spec, root);
    let rel = relative(dirname(fromFile), target).replaceAll("\\", "/");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return rel;
}

function exportedNames(source) {
    const names = new Set();
    for (const block of source.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const spec of block[1].split(",")) {
            const part = spec.trim();
            if (!part || part.startsWith("type ")) continue;
            const exported = (part.split(/\s+as\s+/)[1] ?? part.split(/\s+as\s+/)[0]).trim();
            if (exported && exported !== "default") names.add(exported);
        }
    }
    for (const pattern of [
        /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
        /export\s+class\s+([A-Za-z_$][\w$]*)/g,
        /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    ]) {
        for (const match of source.matchAll(pattern)) names.add(match[1]);
    }
    return [...names].sort();
}

function writeCocosEntrypoints(root) {
    writeFileSync(resolve(root, "package.json"), `${JSON.stringify({
        private: true,
        type: "module",
        description: "Cocos module-type marker for vendored UniFlex ESM. Not an npm package.",
    }, null, 4)}\n`);
    for (const host of ["core", "cocos", "web"]) {
        const sourceDir = resolve(root, host);
        const destDir = resolve(root, "mod", host);
        mkdirSync(destDir, { recursive: true });
        for (const name of readdirSync(sourceDir)) {
            if (!name.endsWith(".js") || name.startsWith("chunk-")) continue;
            const spec = relative(destDir, resolve(sourceDir, name)).replaceAll("\\", "/");
            const names = exportedNames(readFileSync(resolve(sourceDir, name), "utf8"));
            if (names.length === 0) {
                throw new Error(`${host}/${name} 没有可再导出的运行时符号`);
            }
            const from = spec.startsWith(".") ? spec : `./${spec}`;
            writeFileSync(
                resolve(destDir, `${name.slice(0, -".js".length)}.ts`),
                `export { ${names.join(", ")} } from '${from}';\nexport type * from '${from}';\n`,
            );
        }
    }
}

function resolveTarget(spec, root) {
    if (spec === "@uniflex/core") return resolve(root, "core/index.js");
    if (spec.startsWith("@uniflex/core/")) {
        return resolve(root, "core", `${spec.slice("@uniflex/core/".length)}.js`);
    }
    if (spec === "@uniflex/cocos") return resolve(root, "cocos/index.js");
    if (spec === "@uniflex/web") return resolve(root, "web/index.js");
    throw new Error(`未处理的 UniFlex 导入：${spec}`);
}
