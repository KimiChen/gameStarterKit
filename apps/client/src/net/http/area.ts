/**
 * WebPlatform Public 选服目录。GET /v1/areas 的用户 token 是可选 Bearer：
 * core/http 已持有登录 token 时自动带上，用于 best-effort 回填 myServerIds。
 */
import { WebPlatformPath, type WebPlatformAreaListResponse } from "../../shared/index";
import { portalRequest } from "../../core/http";

export function fetchAreaList(): Promise<WebPlatformAreaListResponse> {
    return portalRequest<WebPlatformAreaListResponse>("GET", WebPlatformPath.ListAreas);
}
