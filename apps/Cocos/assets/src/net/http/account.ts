/**
 * WebPlatform Public 登录接口（v1 契约 import 自 shared——铁律 6）。
 * dev session 只在非生产 WebPlatform 启用；wechat session 使用 wx.login 的 code。
 */
import { WebPlatformHttpContractMap, type WebPlatformLoginResponse } from "../../shared/index";
import { portalRequest } from "../../core/http";

// ⚠ 两种登录都必须带 `serverId`：单端语义作用域 = `(账号, 区)`，token 只对该区有效。
// WebPlatform 外部契约使用 serverId；进入游戏服时再显式转换成现有 join option `sId`。

/** 本地/CI 登录：devKey → 固定账号（同 key 恒同号，换号 = 换 key）。 */
export function devLogin(devKey: string, serverId: number, deviceId?: string): Promise<WebPlatformLoginResponse> {
    return portalRequest<WebPlatformLoginResponse>(
        WebPlatformHttpContractMap.DevLogin.method,
        WebPlatformHttpContractMap.DevLogin.path,
        { devKey, serverId, deviceId },
    );
}

/** 微信正式登录（code 来自 wx.login；本地开发用 devLogin）。 */
export function wxLogin(code: string, serverId: number, deviceId?: string): Promise<WebPlatformLoginResponse> {
    return portalRequest<WebPlatformLoginResponse>(
        WebPlatformHttpContractMap.WxLogin.method,
        WebPlatformHttpContractMap.WxLogin.path,
        { code, serverId, deviceId },
    );
}
