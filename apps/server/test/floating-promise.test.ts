/**
 * 机检：禁「悬空 Promise」（floating promise）—— 语句位置上求出一个 Promise 却没人管它的结果。
 *
 * 为什么本仓需要它：Node ≥22 默认 `--unhandled-rejections=throw`，一个没人接的 rejection
 * **直接杀掉网关进程**（单进程扛全服）。而 tsc 没有对应开关（⛔ 别去找 `noFloatingPromises`，
 * 那个 compiler flag 不存在），typescript-eslint 有 `no-floating-promises` 但要为它引入
 * 87 个包 + 4 份 flat config + 104 个生成物/锁定文件的 ignore 清单（评估结论：不划算）。
 * 本文件用**仓内已装的 TypeScript 编译器 API** 复刻同一判据，零新依赖。
 *
 * 判据（对齐 typescript-eslint 上游语义）：`ExpressionStatement` 的类型是 Promise-like，
 * 且没有被 `await` / `void` / `.catch(fn)` / `.then(_, fn)` / `.finally()` 之一收口。
 *
 * ⚠ **这是钉档式机检**（同 `protocol.fingerprint`、`vendor.sha256` 的路子）：已知且已判定
 * 可接受的悬空点写进 `ALLOWLIST`，**新增第 N+1 处即红**。⛔ 别为了让测试变绿而往清单里加行——
 * 加之前先回答「它 reject 时进程该不该死」。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dirname, "../../..");
const SERVER_TSCONFIG = join(ROOT, "apps/server/tsconfig.json");

/**
 * 已知悬空点白名单（`相对仓库根的路径:行` → 为什么可接受）。
 *
 * ⚠ 只收「promise 存进字段/变量，由**别处** await」这一类：判据是**单文件语句级**的，
 * 看不见跨函数的 await，属规则本身的已知盲区，⛔ 不是真缺陷。
 */
const ALLOWLIST = new Map<string, string>([
  ["apps/server/src/core/match/matchConsumer.ts", "loopDone 存字段，stop() 里 await"],
  ["apps/server/src/core/archive/thaw.ts", "singleFlight 的 p 存 Map，同 uid 后续请求 await 它"],
  ["apps/server/src/websocket/loader.ts", "registering 存模块级变量，并发调用方 await 它"],
  ["apps/server/src/index.ts", "顶层 listen：失败即启动失败，⛔ 进程就该死（这正是想要的行为）"],
]);

/** `test()`/`describe()`/`it()` 返回 Promise 但由 node:test runner 自己管（上游同款 allowlist）。 */
const SAFE_CALLEES = new Set(["test", "describe", "it", "before", "after", "beforeEach", "afterEach"]);

/**
 * 是否**真 Promise**。⚠ 判据刻意**不是**「有可调用的 then」（那叫 thenable）——对齐上游
 * `no-floating-promises` 的默认 `checkThenables: false`。
 * ⛔ 放宽成 thenable 会把 `reply.code(400)` 全部误报：Fastify 的 `FastifyReply` 是 thenable
 * （为了支持 `return reply`），而 `.code()` 返回 this 做链式调用是**标准用法**，不 await 完全正确。
 * 本仓 WebPlatform 有 4 处这种写法，曾让本机检首跑全红——判据宽一点就会逼人去 allowlist 里加
 * 无害条目，最后清单失去意义。
 */
function isPromiseLike(checker: ts.TypeChecker, node: ts.Expression): boolean {
  const type = checker.getTypeAtLocation(node);
  for (const t of type.isUnion() ? type.types : [type]) {
    if (t.getSymbol()?.getName() !== "Promise") { continue; }
    const then = t.getProperty("then");
    if (then === undefined) { continue; }
    if (checker.getTypeOfSymbolAtLocation(then, node).getCallSignatures().length > 0) { return true; }
  }
  return false;
}

/** 已被收口：`void x` / `await x` / `x.catch(fn)` / `x.then(a,b)` / `x.finally(f)`。 */
function isHandled(expr: ts.Expression): boolean {
  if (ts.isVoidExpression(expr) || ts.isAwaitExpression(expr)) { return true; }
  if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
    const name = expr.expression.name.text;
    if (name === "catch" || name === "finally") { return true; }
    if (name === "then" && expr.arguments.length >= 2) { return true; }
  }
  // 赋值语句本身不算悬空（`this.p = doWork()`）——由 ALLOWLIST 侧的「别处 await」承担。
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) { return true; }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken) { return true; }
  return false;
}

function scan(): string[] {
  const cfg = ts.readConfigFile(SERVER_TSCONFIG, (p) => readFileSync(p, "utf8"));
  assert.equal(cfg.error, undefined, "读 apps/server/tsconfig.json 失败");
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, join(ROOT, "apps/server"));
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const hits: string[] = [];

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes("node_modules")) { continue; }
    const rel = relative(ROOT, sf.fileName);
    if (!rel.startsWith("apps/")) { continue; }
    ts.forEachChild(sf, function walk(node): void {
      if (ts.isExpressionStatement(node)) {
        const expr = node.expression;
        const safeCallee = ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)
          && SAFE_CALLEES.has(expr.expression.text);
        if (!safeCallee && !isHandled(expr) && isPromiseLike(checker, expr)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          hits.push(`${rel}:${line + 1}`);
        }
      }
      ts.forEachChild(node, walk);
    });
  }
  return hits;
}

test("⛔ 禁悬空 Promise：未被 await/void/catch 收口的 Promise 语句（Node22 下 reject 即杀进程）", () => {
  const hits = scan();
  const unexpected = hits.filter((h) => !ALLOWLIST.has(h.slice(0, h.lastIndexOf(":"))));
  assert.deepEqual(unexpected, [],
    `发现未登记的悬空 Promise。要么收口（加 void/.catch/await），要么把它连同"为什么可接受"写进 ALLOWLIST：\n`
    + unexpected.map((h) => `  - ${h}`).join("\n"));
});

test("机检自身有效：判据能认出裸调用、且 ⛔ 不误伤已收口的四种写法", () => {
  // 给正则/判据写反例是本仓机检的纪律（同 serverImportBan/logic-purity）。
  const src = `
    declare function work(): Promise<void>;
    async function f() {
      work();                       // 1 应命中
      void work();                  // ⛔ 不该命中
      await work();                 // ⛔ 不该命中
      work().catch(() => {});       // ⛔ 不该命中
      work().then(() => {}, () => {}); // ⛔ 不该命中
      work().finally(() => {});     // ⛔ 不该命中
    }`;
  const host = ts.createCompilerHost({ strict: true });
  const orig = host.getSourceFile.bind(host);
  const FAKE = "/__probe.ts";
  host.getSourceFile = (name, lang, ...rest) =>
    name === FAKE ? ts.createSourceFile(name, src, lang, true) : orig(name, lang, ...rest);
  host.fileExists = (n) => n === FAKE || ts.sys.fileExists(n);
  const program = ts.createProgram([FAKE], { strict: true, noEmit: true, target: ts.ScriptTarget.ESNext }, host);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(FAKE);
  assert.ok(sf, "探针源文件未建起来");
  const lines: number[] = [];
  ts.forEachChild(sf, function walk(node): void {
    if (ts.isExpressionStatement(node) && !isHandled(node.expression) && isPromiseLike(checker, node.expression)) {
      lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
    }
    ts.forEachChild(node, walk);
  });
  assert.deepEqual(lines, [4], `只应命中第 4 行那句裸调用，实际命中行：${JSON.stringify(lines)}`);
});
