/**
 * GET /healthz —— 进程级健康检查（真实端点，替代已删除的 /mock/health）。
 * 只证明「进程活着、事件循环在转」；依赖健康（Redis/MySQL）另走 smoke:framework/
 * 未来的 readiness（M10）。冒烟与负载均衡探活用。
 */
import { createEndpoint } from "@colyseus/core";
import { PROTOCOL_VERSION, type IHealthRes } from "@game/shared";

export default createEndpoint("/healthz", { method: "GET" }, async (): Promise<IHealthRes> => {
  return { status: "ok", serverTime: Date.now(), version: String(PROTOCOL_VERSION) };
});
