/**
 * devEnv 生成器 PORT 解析语义机检（scripts/devenv-gen.mjs）：
 * 必须与服务端（config.ts 根 env 加载器 + env() + 严格校验）逐条一致——
 * 第一条声明生效 / 空值 = 未设置→默认 / 非空非法即抛。
 * 任何一条走偏都是双端端口静默脑裂的前兆（历史上翻过两次车：parseInt 截断、末条覆盖）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// 生成器是脚本域 .mjs（不进 Cocos，不受「相对导入不带扩展名」铁律约束）
import { devEnvPort, DEFAULT_PORT } from "../../../scripts/devenv-gen.mjs";

function withEnvFile(content: string | null, fn: (file: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "devenv-"));
  try {
    const file = join(dir, ".env.development");
    if (content !== null) { writeFileSync(file, content); }
    fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("PORT 解析语义与服务端一致：默认/首条生效/空值=未设置", () => {
  withEnvFile(null, (f) => assert.equal(devEnvPort(f), DEFAULT_PORT, "无文件 → 默认"));
  withEnvFile("PROJECT_ID=gono\n", (f) => assert.equal(devEnvPort(f), DEFAULT_PORT, "无 PORT 行 → 默认"));
  withEnvFile("PORT=2600\n", (f) => assert.equal(devEnvPort(f), 2600));
  withEnvFile("# PORT=2600\n", (f) => assert.equal(devEnvPort(f), DEFAULT_PORT, "注释行不生效"));
  withEnvFile("PORT=\n", (f) => assert.equal(devEnvPort(f), DEFAULT_PORT, "空值 = 未设置 → 默认（env() 语义）"));
  withEnvFile("PORT=2600\nPORT=2700\n", (f) =>
    assert.equal(devEnvPort(f), 2600, "重复声明取第一条（服务端 loader 是 fill-missing）"));
  withEnvFile("PORT=\nPORT=2600\n", (f) =>
    assert.equal(devEnvPort(f), DEFAULT_PORT, "空值声明同样占位——后续声明被忽略，与服务端一致"));
});

test("PORT 非空非法：抛错（与服务端拒绝启动对齐，禁静默回退）", () => {
  for (const bad of ["2599junk", "abc", "0", "-1", "65536", "25.99"]) {
    withEnvFile(`PORT=${bad}\n`, (f) =>
      assert.throws(() => devEnvPort(f), /PORT 非法/, `「${bad}」应抛错`));
  }
  // 非法值在第二条、首条合法：首条生效，不该碰到非法值
  withEnvFile("PORT=2600\nPORT=junk\n", (f) => assert.equal(devEnvPort(f), 2600));
});
