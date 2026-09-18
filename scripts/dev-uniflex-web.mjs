import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startUniflexWebPreview } from "./lib/uniflex-web-preview.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const preview = await startUniflexWebPreview({ root, watch: true });
console.log(`UniFlex Web preview: ${preview.url}`);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
        await preview.dispose();
        process.exit(0);
    });
}
