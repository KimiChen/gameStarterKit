/**
 * WebPlatform 区服目录 → 现有 FairyGUI 登录资源的展示映射。
 *
 * Public API 使用可读字符串枚举；美术包仍沿用 login_status_{1|2|9} 资源名。
 * 映射集中在这里，避免 Login 与 AreaList 两个 View 各自解释一套状态。
 */
import type { WebPlatformAreaServer } from "../shared/index";

const STATUS_ICON_SUFFIX: Record<WebPlatformAreaServer["status"], 1 | 2 | 9> = {
  smooth: 1,
  busy: 2,
  maintenance: 9,
};

export function areaStatusIconUrl(status: WebPlatformAreaServer["status"]): string {
  return `ui://Dynamic_Login/login_status_${STATUS_ICON_SUFFIX[status]}`;
}
