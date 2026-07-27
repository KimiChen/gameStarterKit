/**
 * 独立仓边界机检：游戏服生产源码不得再拥有 WebPlatform 进程内实现或运行期双模开关。
 *
 * 允许的唯一账号平面依赖是发布契约包 `@gono/webplatform-contract` 与 Internal HTTP client。
 * 这里没有白名单；命中任一旧入口都必须删除，而不是换一个目录继续内嵌。
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const MODULE_SPEC =
  /(?:^\s*(?:import|export)\b[^;]*?from\s*|^\s*import\s+|[\s(]import\(\s*|[\s(]require\(\s*)["']([^"']+)["']/gm;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { return walk(path); }
    return SOURCE_EXT.test(entry.name) ? [path] : [];
  });
}

test("生产源码绝对禁止旧 WebPlatform 包、源码目录、ACCOUNT_MODE 与 useServerPool", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(SRC.length + 1).split(sep).join("/");
    const source = readFileSync(file, "utf8");

    for (const [label, pattern] of [
      ["@game/webplatform", /@game\/webplatform\b/],
      ["apps/WebPlatform", /apps[\\/]WebPlatform(?:[\\/]|$)/],
      ["ACCOUNT_MODE", /\bACCOUNT_MODE\b/],
      ["useServerPool", /\buseServerPool\b/],
    ] as const) {
      if (pattern.test(source)) { offenders.push(`${rel}  ← ${label}`); }
    }

    // 相对 import 可以写成 ../../../WebPlatform，文本里没有 apps/WebPlatform；解析后也必须拦住。
    for (const match of source.matchAll(MODULE_SPEC)) {
      const spec = match[1];
      if (!spec.startsWith(".")) { continue; }
      const target = resolve(dirname(file), spec);
      if (target.includes(`${sep}apps${sep}WebPlatform${sep}`)
        || target.endsWith(`${sep}apps${sep}WebPlatform`)) {
        offenders.push(`${rel}  ← ${spec}（解析到 apps/WebPlatform）`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `游戏服生产源码仍包含旧 WebPlatform 进程内耦合：\n  ${offenders.join("\n  ")}`,
  );
});
