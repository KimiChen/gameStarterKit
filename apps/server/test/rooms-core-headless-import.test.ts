/**
 * MMO MF4-B5 无头导入闸（docs/MMO.md §4.6-5「模拟与传输分离」）：`rooms/core/WorldRuntime.ts` 与 `rooms/WorldMode.ts`
 * ⛔ 不得 import `colyseus` / `@colyseus/*`（含 schema / ws-transport / core）——世界模拟必须能在无 Colyseus 进程内跑完剧本（world-runtime.test）。
 * 变异验证：给 WorldRuntime.ts 加一行 `import "colyseus"` 或 `import { Schema } from "@colyseus/schema"` → 本用例点名转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importSpecifiers } from "./rooms-core-import-ban.test";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const HEADLESS = ["rooms/core/WorldRuntime.ts", "rooms/WorldMode.ts"];
const BANNED = [/^colyseus$/u, /^colyseus\//u, /^@colyseus\//u];

export function headlessViolations(file: string, source: string): string[] {
    return importSpecifiers(source).filter((spec) => BANNED.some((rule) => rule.test(spec))).map((spec) => `${file} → ${spec}`);
}

test("WorldRuntime / WorldMode ⛔ 不 import colyseus 与 @colyseus/*", () => {
    const violations = HEADLESS.flatMap((file) => headlessViolations(file, fs.readFileSync(path.join(SRC, file), "utf8")));
    assert.deepEqual(violations, [], `无头模拟宿主反向依赖传输层：\n${violations.join("\n")}`);
});

test("导入闸自检：模拟越界 import 必被点名", () => {
    assert.deepEqual(
        headlessViolations("Fake.ts", 'import "colyseus";\nimport { Schema } from "@colyseus/schema";\nimport type { Client } from "colyseus";\nimport { x } from "../../core/infra/config";\n'),
        ["Fake.ts → colyseus", "Fake.ts → @colyseus/schema", "Fake.ts → colyseus"],
    );
});
