/**
 * GET /healthz —— 进程级健康检查（真实端点，替代已删除的 /mock/health）。
 * 只证明「进程活着、事件循环在转」；依赖健康（Redis/MySQL）另走 smoke:framework/
 * 未来的 readiness（M10）。冒烟与负载均衡探活用。
 * version 按 §4.8 同时报告两类协议身份（`g<GAME_ROOM> l<LOBBY>`）。
 */
import { GAME_ROOM_PROTOCOL_VERSION, LOBBY_PROTOCOL_VERSION, type IHealthRes } from "@game/shared";
import { createGameEndpoint } from "../contract";

export default createGameEndpoint("Health", { method: "GET" }, async (): Promise<IHealthRes> => {
  return {
    status: "ok",
    serverTime: Date.now(),
    version: `g${GAME_ROOM_PROTOCOL_VERSION} l${LOBBY_PROTOCOL_VERSION}`,
  };
});
