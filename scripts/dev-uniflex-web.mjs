import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { flagValue } from "./lib/uniflex-screens.mjs";
import { startUniflexWebPreview } from "./lib/uniflex-web-preview.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = flagValue(process.argv, "host") || "127.0.0.1";
const portArg = flagValue(process.argv, "port");
const preview = await startUniflexWebPreview({
    root,
    host,
    port: portArg ? Number(portArg) : 8000,
    watch: true,
});
console.log(`UniFlex Web preview: ${preview.url}`);
for (const lan of preview.lanUrls ?? []) console.log(`LAN: ${lan}`);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
        await preview.dispose();
        process.exit(0);
    });
}
