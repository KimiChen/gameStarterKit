import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";

export function createOutputWriter(root, check) {
    return async (path, content) => {
        if (check) {
            const actual = await readFile(path).catch((error) => {
                if (error.code === "ENOENT") return undefined;
                throw error;
            });
            if (!actual?.equals(Buffer.from(content)))
                throw new Error(`Stale UniFlex output: ${relative(root, path)}; run npm run build:uniflex-ui.`);
        } else {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, content);
        }
    };
}
