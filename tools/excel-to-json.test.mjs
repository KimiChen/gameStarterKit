import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "tools", "excel-to-json.mjs");
const SOURCE = path.join(ROOT, "tools", "excel-config", "items.xlsx");

function fixture() {
    const root = mkdtempSync(path.join(tmpdir(), "excel-to-json-"));
    const input = path.join(root, "input");
    mkdirSync(input);
    copyFileSync(SOURCE, path.join(input, "items.xlsx"));
    return {
        root,
        input,
        server: path.join(root, "server", "items.config.json"),
        client: path.join(root, "client", "items.json"),
    };
}

function invoke(paths, ...args) {
    return spawnSync(process.execPath, [
        SCRIPT,
        `--input=${paths.input}`,
        `--output=${paths.server}`,
        `--client-output=${paths.client}`,
        ...args,
    ], {
        cwd: ROOT,
        encoding: "utf8",
    });
}

function assertSuccess(result) {
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function generate(paths, ...args) {
    const result = invoke(paths, ...args);
    assertSuccess(result);
    return result;
}

test("check accepts canonical outputs without rewriting them", () => {
    const paths = fixture();
    try {
        generate(paths);
        const beforeServer = readFileSync(paths.server);
        const beforeClient = readFileSync(paths.client);

        const result = invoke(paths, "--check");
        assertSuccess(result);
        assert.deepEqual(readFileSync(paths.server), beforeServer);
        assert.deepEqual(readFileSync(paths.client), beforeClient);

        const server = JSON.parse(beforeServer.toString("utf8"));
        const client = JSON.parse(beforeClient.toString("utf8"));
        assert.equal(server.items.length, 3);
        assert.equal(server.items[0].price, 100);
        assert.equal(Object.hasOwn(client.items[0], "price"), false);
    } finally {
        rmSync(paths.root, { recursive: true, force: true });
    }
});

test("check reports both missing outputs", () => {
    const paths = fixture();
    try {
        const result = invoke(paths, "--check");
        assert.notEqual(result.status, 0, result.stdout);
        assert.match(result.stderr, /生成物缺失/);
        assert.match(result.stderr, /items\.config\.json/);
        assert.match(result.stderr, /items\.json/);
    } finally {
        rmSync(paths.root, { recursive: true, force: true });
    }
});

test("check reports a missing output even when its peer is current", () => {
    const paths = fixture();
    try {
        generate(paths);
        unlinkSync(paths.client);
        const result = invoke(paths, "--check");
        assert.notEqual(result.status, 0, result.stdout);
        assert.match(result.stderr, /生成物缺失/);
        assert.match(result.stderr, /items\.json/);
        assert.doesNotMatch(result.stderr, /items\.config\.json/);
    } finally {
        rmSync(paths.root, { recursive: true, force: true });
    }
});

test("check reports stale server and client outputs independently", () => {
    const paths = fixture();
    try {
        generate(paths);
        writeFileSync(paths.server, "{}\n");
        writeFileSync(paths.client, "[]\n");
        const result = invoke(paths, "--check");
        assert.notEqual(result.status, 0, result.stdout);
        assert.match(result.stderr, /生成物陈旧/);
        assert.match(result.stderr, /items\.config\.json/);
        assert.match(result.stderr, /items\.json/);
    } finally {
        rmSync(paths.root, { recursive: true, force: true });
    }
});

test("no-client-output limits both write and check to the server output", () => {
    const paths = fixture();
    try {
        generate(paths, "--no-client-output");
        const result = invoke(paths, "--check", "--no-client-output");
        assertSuccess(result);
        assert.throws(() => readFileSync(paths.client), { code: "ENOENT" });
    } finally {
        rmSync(paths.root, { recursive: true, force: true });
    }
});
