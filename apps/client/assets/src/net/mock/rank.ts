/**
 * mock 排行榜调用面 ↔ 服务端 mock/api/rank.ts。
 */
import { ApiPath, type IApiResponse, type IRankRes } from "../../shared/index";
import { request } from "../../core/http";

export function rank(): Promise<IApiResponse<IRankRes>> {
    return request<IApiResponse<IRankRes>>("GET", ApiPath.Rank);
}
