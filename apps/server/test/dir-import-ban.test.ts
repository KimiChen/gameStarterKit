/**
 * 目录导入禁令机检：三端源码的相对导入必须指向文件（可带显式 /index），禁指向目录。
 *
 * 目录导入（`from "./protocol"`，靠 resolver 补 /index）在主进程 tsx 下能跑，
 * 但 worker 线程在 Node 22 的 ESM 解析下直接报 "Directory import ... is not supported"
 * ——compute 池在 worker 里加载 shared 公式时全线炸（CI Node 22 实翻车，本地 26 无症状）；
 * Cocos SystemJS 对同类简写同样挑剔（lib/bitecs Relation.ts 的 ./index 改写即因此）。
 * 写法规范：`from "./protocol/index"`（仍不带扩展名，铁律 3 成立）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCAN_ROOTS = ["apps/shared/src", "apps/server/src", "apps/client/src"];
// 静态 import/export ... from "./x" 与动态 import("./x")，只看相对路径
const REL_IMPORT = /(?:from\s*|import\s*\(\s*)["'](\.[^"']*)["']/g;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name))
      : e.name.endsWith(".ts") ? [join(dir, e.name)] : []);
}

test("三端相对导入禁指向目录（worker/Node22 ESM 与 Cocos SystemJS 不认）", () => {
  const offenders: string[] = [];
  let scanned = 0;
  for (const scanRoot of SCAN_ROOTS) {
    for (const file of walk(join(ROOT, scanRoot))) {
      scanned++;
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(REL_IMPORT)) {
        const target = resolve(dirname(file), m[1]);
        if (!existsSync(`${target}.ts`) && existsSync(target) && statSync(target).isDirectory()) {
          offenders.push(`${file}: "${m[1]}" → 改为 "${m[1]}/index"`);
        }
      }
    }
  }
  assert.ok(scanned >= 100, `扫描面异常小（${scanned} 个文件），检查 SCAN_ROOTS 是否指错`);
  assert.deepEqual(offenders, [], `发现目录导入（worker 线程/Node 22 会炸）：\n${offenders.join("\n")}`);
});
