/**
 * 真实 HTTP 端点装配（Colyseus 0.17 createRouter，better-call）。
 *
 * 新增端点：建 `<域>/<接口>.ts`（default 导出 createGameEndpoint 产物）后运行 `codegen:http`；
 * 测试会以文件发现结果校验静态 manifest freshness，运行时不扫描文件系统。
 * ⚠ typed router 优先于 express：路径撞车时 express 侧（`/monitor`、playground）永远打不到，
 * 新增端点前先确认路径不与它们冲突。（mock 层已随「去 mock」移除，仓库当前没有 `src/mock`。）
 *
 * ⚠ 登录与选服属于独立 WebPlatform Public API，不在游戏服挂兼容代理。
 */
import { createRouter } from "@colyseus/core";
import { GameHttpContractMap } from "@game/shared";
import { gameRouteDefinitions } from "./manifest.generated";

export { gameRouteDefinitions } from "./manifest.generated";

type RouteShape = {
  readonly path?: unknown;
  readonly options?: { readonly method?: unknown };
};

/** Fail-fast bidirectional method/path check between server routes and shared contracts. */
export function assertGameHttpRoutes(
  definitions: Record<string, RouteShape> = gameRouteDefinitions,
): void {
  const expected = Object.entries(GameHttpContractMap);
  const actual = Object.entries(definitions);
  const expectedKeys = new Set(expected.map(([key]) => key));
  const actualKeys = new Set(actual.map(([key]) => key));
  const missing = [...expectedKeys].filter((key) => !actualKeys.has(key));
  const extra = [...actualKeys].filter((key) => !expectedKeys.has(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `[http-contract] route key 不一致：缺少=[${missing.join(",")}] 多余=[${extra.join(",")}]`,
    );
  }

  const seen = new Set<string>();
  for (const [key, contract] of expected) {
    const endpoint = definitions[key];
    if (!endpoint || (typeof endpoint !== "object" && typeof endpoint !== "function")) {
      throw new Error(`[http-contract] ${key} 缺少 endpoint 定义`);
    }
    const method = endpoint.options?.method;
    const methods = Array.isArray(method) ? method : [method];
    const routeKey = `${String(method)} ${String(endpoint.path)}`;
    if (methods.length !== 1 || methods[0] !== contract.method || endpoint.path !== contract.path) {
      throw new Error(
        `[http-contract] ${key} method/path 不一致：server=${routeKey} contract=${contract.method} ${contract.path}`,
      );
    }
    const identity = `${contract.method} ${contract.path}`;
    if (seen.has(identity)) {
      throw new Error(`[http-contract] method/path 重复：${identity}`);
    }
    seen.add(identity);
  }
}

assertGameHttpRoutes();

// Pass a copy: better-call adds `/api/reference` to the supplied object.
export const routes = createRouter({ ...gameRouteDefinitions });
