/**
 * 选服列表 HTTP 调用面（真实端点，直接返回数据体）。走**门户**（WebPlatform /area/list，DUAL_MODE §2.7）：
 * split 时命中账号服务的目录，dev/内嵌回退游戏服（同址）。token 可选：带上则 best-effort 回填最近登录区服 ul。
 */
import type { IAreaListRes } from "../../shared/index";
import { portalRequest } from "../../core/http";

export function fetchAreaList(token?: string): Promise<IAreaListRes> {
    return portalRequest<IAreaListRes>("POST", "/area/list", token ? { token } : {});
}
