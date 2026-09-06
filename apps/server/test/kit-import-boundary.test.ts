/**
 * kit 服务端代码的导入边界（docs/KIT.md §4 / §6「导入边界：只 import 框架门面、kit-api 与自身」的 K0 形态；
 * K1 换成按解析后路径的机检，与 plugin-api 同批）：`apps/server/src/kits/<id>/**` 的每个 import / export-from 说明符
 *  - 相对路径只能落在本 kit 目录内，或恰好是框架门面 `core/infra/kitApi`（⛔ core/infra 其他模块、core/economy、
 *    core/uow、rooms/、websocket/ …——它们不是 kit-api，走了就等于绕过表闸 / 账本 / 效果通道）；
 *  - 裸说明符只允许 `@game/shared` 及其子路径（零依赖 shared）；⛔ ioredis / mysql2 / colyseus / node:* 等运行时依赖
 *    （kit 触达 Redis / MySQL 只经 kit-api；type-only import 也算——形态一旦放行就会长出值导入）。
 * 框架自己的 kits/catalog*.ts 不在扫描集内（它们是框架文件）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SERVER_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const KITS_DIR = path.join(SERVER_SRC, "kits");
const KIT_API = path.join(SERVER_SRC, "core/infra/kitApi");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** import / export … from "x"、import "x"、动态 import("x") 的说明符。 */
export function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gu)) out.push(m[1]);
  for (const m of source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/gu)) out.push(m[1]);
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu)) out.push(m[1]);
  return out;
}

/** 纯函数判定，导出给单测自测。返回 null = 放行，否则是拒绝理由。 */
export function judgeKitImport(file: string, specifier: string): string | null {
  const kitId = path.relative(KITS_DIR, file).split(path.sep)[0];
  const kitRoot = path.join(KITS_DIR, kitId);
  if (specifier.startsWith(".")) {
    const target = path.resolve(path.dirname(file), specifier);
    if (target === KIT_API) return null;
    if (target === kitRoot || target.startsWith(kitRoot + path.sep)) return null;
    return `相对导入越出 kit 目录且不是 kit-api 门面：${specifier}`;
  }
  if (specifier === "@game/shared" || specifier.startsWith("@game/shared/")) return null;
  return `裸说明符只允许 @game/shared*：${specifier}`;
}

test("kit 导入边界：apps/server/src/kits/<id>/** 只 import 本 kit 目录、core/infra/kitApi 与 @game/shared*", () => {
  const kitDirs = fs.existsSync(KITS_DIR)
    ? fs.readdirSync(KITS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  assert.ok(kitDirs.includes("arena"), "样本 kit 在树上（否则本测试空转）");
  const violations: string[] = [];
  let scanned = 0;
  for (const kitId of kitDirs) {
    for (const file of walk(path.join(KITS_DIR, kitId))) {
      scanned += 1;
      const source = fs.readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        const verdict = judgeKitImport(file, specifier);
        if (verdict !== null) violations.push(`${path.relative(SERVER_SRC, file)}: ${verdict}`);
      }
    }
  }
  assert.ok(scanned >= 4, `扫描到的 kit 源文件过少（${scanned}）`);
  assert.deepEqual(violations, []);
});

test("kit 导入边界自测：门面 / 自身放行，core/infra 其他模块、core/economy、ioredis、mysql2、type-only 越界都拒", () => {
  const host = path.join(KITS_DIR, "arena/host.ts");
  const surface = path.join(KITS_DIR, "arena/api/board/index.ts");
  assert.equal(judgeKitImport(host, "../../core/infra/kitApi"), null);
  assert.equal(judgeKitImport(surface, "../../../../core/infra/kitApi"), null);
  assert.equal(judgeKitImport(surface, "../../boardRepo"), null);
  assert.equal(judgeKitImport(host, "./boardRepo"), null);
  assert.equal(judgeKitImport(host, "@game/shared"), null);
  assert.equal(judgeKitImport(host, "@game/shared/kits/arena/api/board/index"), null);
  for (const bad of ["../../core/infra/keys", "../../core/infra/redisRoute", "../../core/economy/currency", "../../core/uow", "../../rooms/core/x", "../slg/api/board/index", "../catalog.generated"]) {
    assert.match(judgeKitImport(host, bad) ?? "", /越出 kit 目录/u, bad);
  }
  for (const bad of ["ioredis", "mysql2/promise", "colyseus", "node:fs", "@colyseus/core", "@game/server/x"]) {
    assert.match(judgeKitImport(host, bad) ?? "", /裸说明符/u, bad);
  }
  assert.deepEqual(importSpecifiers('import type { Redis } from "ioredis";\nimport { a } from "./x";\nexport { b } from "../y";\nimport "side";\nconst m = import("../z");'),
    ["ioredis", "./x", "../y", "side", "../z"]);
});
