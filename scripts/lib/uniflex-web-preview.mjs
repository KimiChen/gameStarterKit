import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { context } from "esbuild";

export async function startUniflexWebPreview({
    root, host = "127.0.0.1", port = 8000, watch = false,
} = {}) {
    const output = resolve(root, "apps/client/.cache/uniflex");
    await access(resolve(output, "uniflex/catalog.json")).catch(() => {
        throw new Error("Missing UniFlex resources; run npm run build:uniflex-ui first.");
    });
    await mkdir(output, { recursive: true });
    const indexSource = resolve(root, "apps/web-ui-preview/index.html");
    const indexOut = resolve(output, "index.html");
    let previewVersion = Date.now().toString(36);
    const writeIndex = async () => {
        const html = await readFile(indexSource, "utf8");
        await writeFile(indexOut, html.replace('src="/preview.js"', `src="/preview.js?v=${previewVersion}"`));
    };
    const build = await context({
        absWorkingDir: root,
        entryPoints: ["apps/web-ui-preview/main.ts"],
        outfile: resolve(output, "preview.js"),
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        sourcemap: true,
        logLevel: watch ? "info" : "silent",
        plugins: [{
            name: "uniflex-generated-relative-imports",
            setup(api) {
                api.onResolve({ filter: /^(\.\.\/)+kits\/|^(\.\.\/)+themes\// }, (args) => {
                    const marker = args.path.includes("/kits/") ? "/kits/" : "/themes/";
                    const suffix = args.path.slice(args.path.indexOf(marker) + marker.length);
                    const base = marker === "/themes/"
                        ? resolve(root, "apps/client/src/ui-uniflex/themes", suffix)
                        : resolve(root, "apps/client/src/kits", suffix);
                    return { path: base.endsWith(".ts") ? base : `${base}.ts` };
                });
            },
        }, {
            name: "uniflex-preview-index",
            setup(api) {
                api.onEnd(async (result) => {
                    if (result.errors.length > 0) return;
                    previewVersion = Date.now().toString(36);
                    await writeIndex();
                });
            },
        }],
    });
    try {
        if (watch) await build.watch();
        else await build.rebuild();
        const serve = { host, servedir: output };
        if (port !== undefined) serve.port = port;
        const result = await build.serve(serve);
        const address = result.hosts[0] ?? host;
        return {
            host: address,
            port: result.port,
            url: `http://${address}:${result.port}/`,
            lanUrls: lanPreviewUrls(host, result.port),
            dispose: () => build.dispose(),
        };
    } catch (error) {
        await build.dispose();
        throw error;
    }
}

function lanPreviewUrls(host, port) {
    if (host !== "0.0.0.0" && host !== "::") return [];
    const urls = [];
    for (const list of Object.values(networkInterfaces())) {
        for (const info of list ?? []) {
            if (info.internal || (info.family !== "IPv4" && info.family !== 4)) continue;
            urls.push(`http://${info.address}:${port}/`);
        }
    }
    return [...new Set(urls)];
}
