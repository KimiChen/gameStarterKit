/**
 * 区服目录的客户端展示/选择规则。
 *
 * WebPlatform 的目录状态只改善 UX；真正的进服准入仍由游戏服 onAuth 决定。
 */
import type { WebPlatformAreaServer } from "../shared/index";

export function isServerEnterable(
  server: Pick<WebPlatformAreaServer, "status" | "openTime">,
): boolean {
  return server.status !== "maintenance" && server.openTime > 0;
}
