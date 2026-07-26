/**
 * 账号 HTTP 接口（真实端点，契约 import 自 shared——铁律 6）。
 * dev-login：本地/CI 登录（服务端 AUTH_DEV_ENABLED 控制，生产 404）；
 * wx-login：微信正式登录（wx.login 拿 code 后调用；小游戏侧接入后补）。
 */
import { ApiPath, type ILoginRes } from "../../shared/index";
import { portalRequest } from "../../core/http";

// 登录走**门户**（WebPlatform，DUAL_MODE §2.7）：split 时命中账号服务，dev/内嵌回退游戏服（同址）。

// ⚠ **两个登录都必须带 `sId`**（M12e）：单端语义作用域 = `(账号, 区)`，签发的 token **只对该区有效**。
// 不带 = 落 s0（大混服）⇒ 随后 join 别的区会被 onAuth 拒（token 不是那个区的）。
// ⚠ 调用侧天然拿得到：选服（`chooseServer`）发生在登录之前。

/** 本地/CI 登录：devKey → 固定账号（同 key 恒同号，换号 = 换 key）。 */
export function devLogin(devKey: string, sId: number, deviceId?: string): Promise<ILoginRes> {
    return portalRequest<ILoginRes>("POST", ApiPath.DevLogin, { devKey, sId, deviceId });
}

/** 微信正式登录（code 来自 wx.login；本地开发用 devLogin）。 */
export function wxLogin(code: string, sId: number, deviceId?: string): Promise<ILoginRes> {
    return portalRequest<ILoginRes>("POST", ApiPath.WxLogin, { code, sId, deviceId });
}
