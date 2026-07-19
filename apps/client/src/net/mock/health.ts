/**
 * mock 健康检查调用面 ↔ 服务端 mock/api/health.ts。
 */
import { ApiPath, type IApiResponse, type IHealthRes } from "../../shared/index";
import { request } from "../../core/http";

export function health(): Promise<IApiResponse<IHealthRes>> {
    return request<IApiResponse<IHealthRes>>("GET", ApiPath.Health);
}
