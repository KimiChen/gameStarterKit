/**
 * codegen:features CLI（writer；只读闸是 apps/server/test/feature-codegen.test.ts 的
 * freshness 断言，随 `npm --workspace @game/server run test` 进 verify:all）。
 *
 * 用法：
 *   npm --workspace @game/server run codegen:features               # 写盘
 *   npm --workspace @game/server run codegen:features -- --check    # 只读校验
 *   npm --workspace @game/server run codegen:features -- --allow-delete <域>  # 显式删除保护
 *
 * 单源：apps/shared/src/protocol/lobbyRpc/{domains/*.ts,coreErrors.ts}（AST 语法读取，⛔ 不执行）
 * 产物：apps/shared/src/protocol/lobbyRpc/registry.generated.ts
 * ⚠ registry 在 protocol/ 内：--write 后须 `node scripts/protocol-fingerprint.mjs` 重钉指纹。
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertFeatureArtifactsFresh, parseCli, writeFeatureArtifacts } from "./lib";

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  try {
    const args = parseCli(process.argv.slice(2));
    if (args.check) {
      assertFeatureArtifactsFresh(args);
      console.log("[feature-codegen] generated feature artifacts are fresh");
    } else {
      const result = writeFeatureArtifacts(args);
      const summary: string[] = [];
      if (result.changed.length > 0) summary.push(`updated ${result.changed.join(", ")}`);
      if (result.deleted.length > 0) summary.push(`deleted domain(s) ${result.deleted.join(", ")}`);
      console.log(`[feature-codegen] ${summary.length === 0 ? "no changes" : summary.join("; ")}`);
      if (result.changed.length > 0) {
        console.log("[feature-codegen] ⚠ protocol/ 字节已变化：运行 node scripts/protocol-fingerprint.mjs 重钉指纹");
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
