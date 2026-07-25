/**
 * 机检：`@game/webplatform/lib` 只允许在 `platform/`（接缝实现）与 `core/infra/mysql.ts`（池注入）里 import。
 *
 * **为什么**（DUAL_MODE §2.7 / docs/WEBPLATFORM.md）：split 模式下 lib 被注入了**游戏服的池**
 * （`core/infra/mysql.ts:useServerPool`），而 accounts/char_registry 在**独立账号库**——所以在
 * `platform/` 之外直调 lib，就是把账号平面的读写打在**组游戏库**上。故障形态是**静默错误**
 * （`affectedRows=0`、查询空集），不是报错：封号"成功"但没封、`ul` 永远空。
 *
 * ⇒ 游戏服要访问账号平面**一律走 `account.*` 接缝**（in-process → lib、split → HTTP）。
 * 测试目录豁免：测试恒 in-process 且与游戏服共库，直调 lib 是造数据的正当手段。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/** 允许直调 lib 的落点（相对 src/ 的 posix 路径）。新增前先读本文件头部的「为什么」。 */
const ALLOWED = new Set([
  "core/infra/mysql.ts", // 池注入 useServerPool——接缝本身的前提
]);
// ⚠ 白名单是**目录级**豁免：platform/ 下新增文件自动获得直调权。放这里的文件必须是「接缝实现」本身，
// ⛔ 不得把业务逻辑塞进来蹭豁免（评审提示的旁路：platform/ 里导出的 lib 包装函数被全 src 引用 = 事实上的绕过）。
const ALLOWED_DIRS = ["platform/"];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []);
}

test("`@game/webplatform/lib` 只许在 platform/ 与 infra/mysql.ts 直调（split 下直调 = 打错库，静默失败）", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(SRC.length + 1).split("\\").join("/");
    if (ALLOWED.has(rel) || ALLOWED_DIRS.some((d) => rel.startsWith(d))) { continue; }
    const src = readFileSync(file, "utf8");
    // 抓真实模块说明符（⛔ 不误伤注释里提到包名——注释里大量引用它做解释）：
    // import/export … from "X" / import("X") / require("X") / 副作用 import "X"
    const SPEC = /(?:^\s*(?:import|export)\b[^;]*?from\s*|^\s*import\s+|[\s(]import\(\s*|[\s(]require\(\s*)["']([^"']+)["']/gm;
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1];
      // ① 裸包名（含 /lib 及任何子路径）
      const bare = spec === "@game/webplatform" || spec.startsWith("@game/webplatform/");
      // ② 相对路径**解析后落在 apps/WebPlatform/**（绕过裸包名的口子，且能过 tsc）
      const relPath = spec.startsWith(".") && resolve(dirname(file), spec).includes(`${sep}apps${sep}WebPlatform${sep}`);
      if (bare || relPath) { offenders.push(`${rel}  ← ${spec}`); break; }
    }
  }
  assert.deepEqual(offenders, [],
    `以下文件直调 @game/webplatform/lib——split 下会打在组游戏库上（静默错误）。改走 platform/accountClient 的 account.*：\n  ${offenders.join("\n  ")}`);
});
