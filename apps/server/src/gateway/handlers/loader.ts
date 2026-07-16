/**
 * 端点自动装载：扫描 handlers/<域>/<接口>.ts，收集 default 导出并注册到 dispatcher。
 *
 * 约定（违反在启动时直接 throw，fail-fast）：
 *  - 域目录下每个 .ts 是一个端点文件，default 导出 defineRpc(...) 产物
 *  - 路由名必须等于 `<域目录名>.<文件名去 .ts>`（防挪错目录/改名后契约漂移）
 *  - 端点全集必须与 shared 的 ALL_LOBBY_RPC_TYPES 集合相等（声明未实现/实现未声明都拒绝启动）
 *  - `*.test.ts` 跳过；⛔ 域目录里不要放 index.ts/工具文件——一切 .ts 都按端点文件对待
 *
 * ⚠ 依赖 tsx 直跑形态（运行时 fs 扫描 + 动态 import，见根 tsconfig 注释）。
 *   若未来改用打包器部署，本文件需换成打包器的静态 glob 方案。
 */
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ALL_LOBBY_RPC_TYPES } from "@game/shared";
import { registerRoute } from "../dispatcher";
import type { AnyLobbyRpcDef } from "../rpc";

const HANDLERS_DIR = dirname(fileURLToPath(import.meta.url));

/** 收集全部端点定义并做契约校验（无注册副作用，契约测试直接复用）。 */
export async function collectEndpoints(): Promise<AnyLobbyRpcDef[]> {
  const defs: AnyLobbyRpcDef[] = [];
  const entries = await readdir(HANDLERS_DIR, { withFileTypes: true });
  // 排序保证注册顺序确定（与文件系统枚举顺序解耦）
  const domains = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const domain of domains) {
    const files = (await readdir(join(HANDLERS_DIR, domain)))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))
      .sort();
    for (const file of files) {
      const mod = await import(pathToFileURL(join(HANDLERS_DIR, domain, file)).href) as { default?: AnyLobbyRpcDef };
      const def = mod.default;
      if (!def || typeof def.type !== "string" || !def.schema || typeof def.handler !== "function") {
        throw new Error(`[rpc-loader] handlers/${domain}/${file} 缺少 defineRpc 的 default 导出`);
      }
      const expected = `${domain}.${file.slice(0, -".ts".length)}`;
      if (def.type !== expected) {
        throw new Error(`[rpc-loader] 路由名与路径不一致: ${def.type} ≠ ${expected}（handlers/${domain}/${file}）`);
      }
      defs.push(def);
    }
  }
  // 与 shared 声明集合相等（路径↔路由名一致已保证 defs 内无重名）
  const got = new Set<string>(defs.map((d) => d.type));
  const want = new Set<string>(ALL_LOBBY_RPC_TYPES);
  const missing = [...want].filter((t) => !got.has(t));
  const undeclared = [...got].filter((t) => !want.has(t));
  if (missing.length > 0 || undeclared.length > 0) {
    throw new Error(
      `[rpc-loader] 契约不齐：shared 已声明但无端点文件=[${missing.join(",")}]` +
      ` 有端点文件但 shared 未声明=[${undeclared.join(",")}]`);
  }
  return defs;
}

// 每进程注册一次（原 LobbyRoom.ensureRoutes 的守卫挪到这里）。
// 记 Promise 而非布尔：并发 onCreate（joinOrCreate 满员开新房）时，后来者必须
// await 同一次注册完成——布尔守卫会让它在路由就绪前就开始接客（短暂 UNKNOWN_TYPE）
let registering: Promise<void> | null = null;

/** 扫描并注册全部端点（服务启动时 + LobbyRoom.onCreate 调用；重复/并发调用共享同一次注册）。 */
export function registerAllRoutes(): Promise<void> {
  registering ??= (async () => {
    // 先完整收集再同步注册：失败只可能发生在任何 registerRoute 之前（收集期），
    // 注册循环本身无 await 且路由名经路径唯一化——失败后重试不会触发重复注册 throw
    const defs = await collectEndpoints();
    for (const def of defs) {
      // registerRoute 的泛型对联合类型无法逐条收窄；类型对齐已由 defineRpc 构造点保证
      registerRoute(def.type, def as Parameters<typeof registerRoute>[1]);
    }
  })().catch((e) => {
    registering = null; // 瞬态失败（EMFILE 等）不永久卡死大厅：下次 onCreate 重试
    throw e;
  });
  return registering;
}
