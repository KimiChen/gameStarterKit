/**
 * codegen:gameplays CLI（writer；只读闸是 apps/server/test/gameplay-codegen.test.ts 的
 * freshness 断言，随 `npm --workspace @game/server run test` 进 verify:all）。
 *
 * 用法：
 *   npm --workspace @game/server run codegen:gameplays               # 写盘
 *   npm --workspace @game/server run codegen:gameplays -- --check    # 只读校验
 *   npm --workspace @game/server run codegen:gameplays -- --allow-delete <id>  # 显式删除保护
 *
 * 单源：apps/shared/schema/gameplays/<id>/{manifest.json,state.json}
 * 产物：shared per-mode state + catalog/index、server per-mode Schema + GameRoomState 聚合、
 *       client catalog（跨 workspace 直写的职责偏差见 lib.ts 抬头与 docs/Non-intrusive.md §5.4）。
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertGameplayArtifactsFresh, parseCli, writeGameplayArtifacts } from "./lib";

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  try {
    const args = parseCli(process.argv.slice(2));
    if (args.check) {
      assertGameplayArtifactsFresh(args);
      console.log("[gameplay-codegen] generated gameplay artifacts are fresh");
    } else {
      const result = writeGameplayArtifacts(args);
      const summary: string[] = [];
      if (result.changed.length > 0) summary.push(`updated ${result.changed.join(", ")}`);
      if (result.deleted.length > 0) summary.push(`deleted ${result.deleted.join(", ")}`);
      console.log(`[gameplay-codegen] ${summary.length === 0 ? "no changes" : summary.join("; ")}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
