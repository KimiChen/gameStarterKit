/**
 * MF3 共享层导入闸（docs/MMO.md §5.4 MF3「测试」行；docs/MMO-PLAN.md MF3-B1）：
 * `apps/server/src/rooms/core/**` 是房间共享层（policy / auth / dispatcher / 预算 / 重连 / 出站口），
 * 它只能依赖 shared 契约、`core/`（infra / auth / errors）与生成的 schema——
 * ⛔ 不得 import `rooms/modes/`（具体玩法）与 `websocket/`（Lobby RPC 层），否则共享层反向依赖消费方，
 * MF4 的 WorldRoom / MF5a 的 SQL 视图房都无法复用。
 *
 * 变异验证：给 rooms/core 任一文件加一行 `import "../modes/ballMove/index"` 或 `import "../../websocket/push"`
 * → 本用例点名该文件转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CORE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/rooms/core");
const BANNED = [/(^|\/)rooms\/modes(\/|$)/u, /(^|\/)websocket(\/|$)/u];

function listTs(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listTs(full));
        else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
    }
    return out.sort();
}

export function importSpecifiers(source: string): string[] {
    const specifiers: string[] = [];
    const re = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gu;
    for (const match of source.matchAll(re)) specifiers.push(match[1] ?? match[2] ?? match[3] ?? "");
    return specifiers.filter((value) => value.length > 0);
}

export function violationsIn(file: string, source: string): string[] {
    const violations: string[] = [];
    for (const spec of importSpecifiers(source)) {
        if (!spec.startsWith(".")) continue;
        const resolved = path.resolve(path.dirname(file), spec).split(path.sep).join("/");
        if (BANNED.some((rule) => rule.test(resolved))) violations.push(`${path.relative(CORE_DIR, file)} → ${spec}`);
    }
    return violations;
}

test("rooms/core/** ⛔ 不 import rooms/modes/ 与 websocket/", () => {
    const files = listTs(CORE_DIR);
    assert.ok(files.length >= 3, "rooms/core 至少含 AccessPolicy / RoomProfile / StartPolicy");
    const violations = files.flatMap((file) => violationsIn(file, fs.readFileSync(file, "utf8")));
    assert.deepEqual(violations, [], `rooms/core 反向依赖消费方：\n${violations.join("\n")}`);
});

test("导入闸自检：模拟越界 import 必被点名", () => {
    const fake = path.join(CORE_DIR, "Fake.ts");
    assert.deepEqual(
        violationsIn(fake, 'import { x } from "../modes/ballMove/index";\nimport "../../websocket/push";\nimport { y } from "../../core/infra/config";\n'),
        ["Fake.ts → ../modes/ballMove/index", "Fake.ts → ../../websocket/push"],
    );
});
