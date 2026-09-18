import { access, cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { context } from "esbuild";

export async function startUniflexWebPreview({
    root, host = "127.0.0.1", port, watch = false,
} = {}) {
    const output = resolve(root, "apps/client/.cache/uniflex");
    await access(resolve(output, "uniflex/catalog.json")).catch(() => {
        throw new Error("Missing UniFlex resources; run npm run build:uniflex-ui first.");
    });
    await mkdir(output, { recursive: true });
    await cp(resolve(root, "apps/web-ui-preview/index.html"), resolve(output, "index.html"));
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
            dispose: () => build.dispose(),
        };
    } catch (error) {
        await build.dispose();
        throw error;
    }
}
