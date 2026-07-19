/**
 * logic/ 无头纯度守门：全目录禁止 import cc / fairygui-cc。
 *
 * logic/（page 页面行为 + rooms/<玩法> 局内模拟）的架构承诺是「纯 TS、无头可测」——
 * 渲染归 view/ 与场景组件。此约定靠本测试机检，不靠口头纪律（同哲学：服务端 loader 启动校验）。
 * 随 npm run test:fgui 一起跑（root package.json 的 glob 自动纳入本文件）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LOGIC_DIR = fileURLToPath(new URL("../src/logic", import.meta.url));
// 静态 import/export ... from "cc"|"fairygui-cc"|"db://fairygui-cc/..."（全仓 fairygui 的唯一真实引用
// 形态就是 db://，漏了它守门形同虚设）；动态 import("db://fairygui-cc/...")；
// 以及任何指向 view/ 目录的相对引用——view/ 静态依赖 fairygui，经它间接引入与直引同等违规
//（铁律 9「含间接」）：无头单测 import 该 Logic 时 tsx 解析 db:// 直接 ERR_MODULE_NOT_FOUND。
const BANNED = /from\s+["'](?:cc|fairygui-cc|db:\/\/fairygui-cc[^"']*|[^"']*\/view\/[^"']*)["']|import\s*\(\s*["']db:\/\/fairygui-cc/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name))
      : e.name.endsWith(".ts") ? [join(dir, e.name)] : []);
}

test("logic/ 全目录禁 import cc / fairygui-cc（无头纯度守门）", () => {
  const files = walk(LOGIC_DIR);
  assert.ok(files.length >= 3, "logic/ 下应至少有 ballMove 的三个文件");
  for (const f of files) {
    assert.ok(!BANNED.test(readFileSync(f, "utf8")),
      `${f} 依赖了 cc/fairygui——logic 层必须无头可测（渲染归 view/，公式归 shared/logic）`);
  }
});

test("守门正则覆盖真实违规形态（db:// 静态引用 + 经 view/ 间接引入），正常 shared 引用不误伤", () => {
  assert.ok(BANNED.test(`import { GRoot } from "db://fairygui-cc/fairygui.mjs";`), "全仓 fairygui 的唯一真实引用形态");
  assert.ok(BANNED.test(`import { ViewMgr } from "../../view/ViewMgr";`), "经 view/ 间接引入同等违规");
  assert.ok(BANNED.test(`import { _decorator } from "cc";`));
  assert.ok(BANNED.test(`export { x } from "cc";`));
  assert.ok(BANNED.test(`const m = await import("db://fairygui-cc/fairygui.mjs");`));
  assert.ok(!BANNED.test(`import { GuildRpc } from "../../shared/index";`));
  assert.ok(!BANNED.test(`import { GameECS } from "../ballMove/GameECS";`));
});
