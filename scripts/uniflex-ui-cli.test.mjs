import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { runCli } from "./uniflex-ui-cli.mjs";

const root = resolve(import.meta.dirname, "..");
const fakeCli = resolve(root, "scripts/uniflex-ui-cli.mjs");

const capture = () => {
    const calls = [];
    return { calls, execute: (...args) => calls.push(args) };
};

test("export-psd forwards arguments verbatim to the resolved converter", async () => {
    const { calls, execute } = capture();
    await runCli(["export-psd", "--url", "http://127.0.0.1:8000", "--out", ".cache/psd/export-001"],
        { root, env: { WEB_UI_TO_PSD_CLI: fakeCli }, execute });
    assert.equal(calls.length, 1);
    const [command, args] = calls[0];
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [fakeCli, "export",
        "--url", "http://127.0.0.1:8000", "--out", ".cache/psd/export-001"]);
});

test("missing converter fails with an actionable error", async () => {
    const { calls, execute } = capture();
    await assert.rejects(
        runCli(["export-psd", "--url", "http://127.0.0.1:8000", "--out", "x"],
            { root, env: {}, execute }),
        /web-ui-to-psd CLI is unavailable.*WEB_UI_TO_PSD_CLI/s,
    );
    assert.equal(calls.length, 0);
});

test("import-psd requires --file, --name and --out before touching the converter", async () => {
    const { calls, execute } = capture();
    const env = { WEB_UI_TO_PSD_CLI: fakeCli };
    await assert.rejects(runCli(["import-psd"], { root, env, execute }), /Missing --file/);
    await assert.rejects(
        runCli(["import-psd", "--file", "a.psd"], { root, env, execute }), /Missing --name/);
    await assert.rejects(
        runCli(["import-psd", "--file", "a.psd", "--name", "Backpack"], { root, env, execute }),
        /Missing --out/);
    assert.equal(calls.length, 0);
});

test("import-psd enforces a PascalCase ASCII --name", async () => {
    const { execute } = capture();
    await assert.rejects(
        runCli(["import-psd", "--file", "a.psd", "--name", "backpack", "--out", "x"],
            { root, env: { WEB_UI_TO_PSD_CLI: fakeCli }, execute }),
        /PascalCase/);
});

test("unknown commands are rejected", async () => {
    await assert.rejects(runCli(["roundtrip"], { root, env: {}, execute: () => {} }),
        /Unknown command: roundtrip/);
});
