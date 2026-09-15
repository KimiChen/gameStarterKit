import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { runCli } from "./uniflex-ui-cli.mjs";
import {
    findScreen, injectUniflexExportArgs, loadScreenCatalog, resolvePreviewUrl, screenFromUrl,
} from "./lib/uniflex-screens.mjs";

const root = resolve(import.meta.dirname, "..");
const fakeCli = resolve(root, "scripts/uniflex-ui-cli.mjs");
const catalog = await loadScreenCatalog(root);

const capture = () => {
    const calls = [];
    return { calls, execute: (...args) => calls.push(args) };
};

test("screen catalog resolves aliases without falling through to a default page", () => {
    assert.equal(findScreen(catalog, "prompt")?.componentName, "Prompt");
    assert.equal(findScreen(catalog, "small-popup")?.id, "small-popup");
    assert.equal(findScreen(catalog, "missing"), null);
    assert.equal(findScreen(catalog, null)?.id, "preview-home");
    assert.equal(screenFromUrl(catalog, "http://127.0.0.1:8000/")?.id, undefined);
    assert.equal(screenFromUrl(catalog, "http://127.0.0.1:8000/?ui=backpack")?.id, "backpack");
});

test("export-psd injects UniFlex adapter defaults and an unscaled preview URL", async () => {
    const { calls, execute } = capture();
    await runCli(["export-psd", "--url", "http://127.0.0.1:8000", "--out", ".cache/psd/export-001"],
        { root, env: { WEB_UI_TO_PSD_CLI: fakeCli }, execute });
    assert.equal(calls.length, 1);
    const [command, args] = calls[0];
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [fakeCli, "export",
        "--url", "http://127.0.0.1:8000/?psd=1",
        "--adapter", "uniflex",
        "--selector", "#ui",
        "--ready-selector", "html[data-uniflex-ready='true']",
        "--out", resolve(root, ".cache/psd/export-001")]);
});

test("export-psd --screen injects that screen's canvas and does not require a running preview URL", async () => {
    const { calls, execute } = capture();
    let started = 0;
    await runCli(["export-psd", "--screen", "prompt", "--out", "x"], {
        root, env: { WEB_UI_TO_PSD_CLI: fakeCli }, execute,
        startPreview: async () => {
            started += 1;
            return { url: "http://127.0.0.1:9/", dispose: async () => { started -= 1; } };
        },
    });
    assert.equal(started, 0);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1], [fakeCli, "export",
        "--url", "http://127.0.0.1:9/?screen=prompt&psd=1",
        "--adapter", "uniflex",
        "--selector", "#ui",
        "--ready-selector", "html[data-uniflex-ready='true']",
        "--width", "750",
        "--height", "1624",
        "--out", resolve(root, "x")]);
});

test("export-psd --adapter dom does not force the UniFlex capture adapter", async () => {
    const { calls, execute } = capture();
    await runCli(["export-psd", "--adapter", "dom", "--url", "http://127.0.0.1:8000", "--out", "x"],
        { root, env: { WEB_UI_TO_PSD_CLI: fakeCli }, execute });
    assert.deepEqual(calls[0][1], [fakeCli, "export",
        "--adapter", "dom",
        "--url", "http://127.0.0.1:8000/?psd=1",
        "--out", resolve(root, "x")]);
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
    await assert.rejects(runCli(["not-a-command"], { root, env: {}, execute: () => {} }),
        /Unknown command: not-a-command/);
});

test("roundtrip from a preview screen exports, packages and checks without writing the project", async () => {
    const { calls, execute } = capture();
    await runCli(["roundtrip", "--screen", "prompt", "--out", ".cache/psd/cli-test-roundtrip"], {
        root, env: { WEB_UI_TO_PSD_CLI: fakeCli }, execute,
        startPreview: async () => ({ url: "http://127.0.0.1:9/", dispose: async () => {} }),
        readText: async (file) => {
            if (String(file).endsWith("validation.json")) return JSON.stringify({ psd: "web-ui.psd" });
            if (String(file).endsWith("design.json"))
                return JSON.stringify({ schemaVersion: 1, kind: "uniflex-design" });
            throw new Error(`unexpected read: ${file}`);
        },
    });
    const output = resolve(root, ".cache/psd/cli-test-roundtrip");
    const exported = calls.map(([, args]) => args.slice(1));
    assert.equal(exported[0][0], "export");
    assert.ok(exported[0].includes("--adapter"));
    assert.deepEqual(exported[1].slice(0, 3), ["psd-import", "--file", resolve(output, "export/web-ui.psd")]);
    assert.deepEqual(exported[2].slice(0, 5), ["uniflex-package", "--design",
        resolve(output, "design/design.json"), "--name", "Prompt"]);
    assert.equal(calls[3][1][0], resolve(root, "scripts/verify-uniflex-ui.mjs"));
    assert.equal(calls.length, 4);
});

test("roundtrip --file requires --name and does not export a webpage", async () => {
    const { calls, execute } = capture();
    await assert.rejects(
        runCli(["roundtrip", "--file", "a.psd", "--out", "x"],
            { root, env: { WEB_UI_TO_PSD_CLI: fakeCli }, execute }),
        /Missing --name/);
    assert.equal(calls.length, 0);
});

test("injectUniflexExportArgs keeps caller viewport flags", () => {
    const prompt = findScreen(catalog, "prompt");
    assert.deepEqual(
        injectUniflexExportArgs(["--width", "100"], {
            url: resolvePreviewUrl("http://127.0.0.1:9/", prompt),
            screen: prompt,
        }),
        ["--width", "100",
            "--url", "http://127.0.0.1:9/?screen=prompt&psd=1",
            "--adapter", "uniflex",
            "--selector", "#ui",
            "--ready-selector", "html[data-uniflex-ready='true']",
            "--height", "1624"],
    );
});
