/**
 * 账号 HTTP 接口（真实端点，契约 import 自 shared——铁律 6）。
 * dev-login：本地/CI 登录（服务端 AUTH_DEV_ENABLED 控制，生产 404）；
 * wx-login：微信正式登录（wx.login 拿 code 后调用；小游戏侧接入后补）。
 */
import { ApiPath, type ILoginRes } from "../../shared/index";
import { portalRequest } from "../../core/http";

// 登录走**门户**（WebPlatform，DUAL_MODE §2.7）：split 时命中账号服务，dev/内嵌回退游戏服（同址）。

/** 本地/CI 登录：devKey → 固定账号（同 key 恒同号，换号 = 换 key）。 */
export function devLogin(devKey: string, deviceId?: string): Promise<ILoginRes> {
    return portalRequest<ILoginRes>("POST", ApiPath.DevLogin, { devKey, deviceId });
}

/** 微信正式登录（code 来自 wx.login；本地开发用 devLogin）。 */
export function wxLogin(code: string, deviceId?: string): Promise<ILoginRes> {
    return portalRequest<ILoginRes>("POST", ApiPath.WxLogin, { code, deviceId });
}
