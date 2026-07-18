/**
 * 选服列表 HTTP 调用面 ↔ 服务端 http/area/list.ts（真实端点，直接返回数据体）。
 * token 可选：带上则回填最近登录区服 ul。
 */
import type { IAreaListRes } from "../../shared/index";
import { request } from "../../core/http";

export function fetchAreaList(token?: string): Promise<IAreaListRes> {
    return request<IAreaListRes>("POST", "/area/list", token ? { token } : {});
}
