import { access, cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { context } from "esbuild";

const root = resolve(import.meta.dirname, "..");
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
    logLevel: "info",
});
await build.watch();
const { port } = await build.serve({ host: "127.0.0.1", servedir: output });
console.log(`UniFlex Web preview: http://127.0.0.1:${port}/`);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
        await build.dispose();
        process.exit(0);
    });
}
