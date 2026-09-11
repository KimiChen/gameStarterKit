import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { createOutputWriter } from "./lib/uniflex-output.mjs";

async function snapshot(file) {
    const { size, mtimeMs, ctimeMs } = await stat(file);
    return { size, mtimeMs, ctimeMs };
}

test("UniFlex output check is read-only and agrees with generation", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "uniflex-output-"));
    try {
        const write = createOutputWriter(root, false);
        const check = createOutputWriter(root, true);
        const file = resolve(root, "generated/data.json");
        await assert.rejects(check(file, ""), /Stale UniFlex output/);
        assert.deepEqual(await readdir(root), []);
        for (const expected of ['{"version":1}\n', Buffer.from([0, 1, 128, 255])]) {
            await write(file, expected);
            const before = await snapshot(file);
            const bytes = await readFile(file);
            await check(file, expected);
            assert.deepEqual(await snapshot(file), before);
            await assert.rejects(check(file, "changed"), /generated\/data.json/);
            assert.deepEqual(await readFile(file), bytes);
            assert.deepEqual(await snapshot(file), before);
            await write(file, "changed");
            await check(file, "changed");
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("UniFlex output check does not turn filesystem errors into stale output", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "uniflex-output-"));
    try {
        await assert.rejects(createOutputWriter(root, true)(root, ""),
            (error) => error.code === "EISDIR");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
