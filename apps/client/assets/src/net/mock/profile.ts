/**
 * mock 玩家档案调用面 ↔ 服务端 mock/api/profile.ts（需先 login）。
 */
import { ApiPath, type IApiResponse, type IPlayerProfile } from "../../shared/index";
import { request } from "../../core/http";

export function profile(): Promise<IApiResponse<IPlayerProfile>> {
    return request<IApiResponse<IPlayerProfile>>("GET", ApiPath.Profile);
}
