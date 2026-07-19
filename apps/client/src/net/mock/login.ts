/**
 * mock 登录调用面 ↔ 服务端 mock/api/login.ts（任意 code 都成功）。
 * 成功后自动保存 token（core/http 统一带 Authorization 头）。
 */
import { ApiPath, ErrorCode, type IApiResponse, type ILoginReq, type ILoginRes } from "../../shared/index";
import { request, setToken } from "../../core/http";

export async function login(code: string): Promise<IApiResponse<ILoginRes>> {
    const body: ILoginReq = { code };
    const res = await request<IApiResponse<ILoginRes>>("POST", ApiPath.Login, body);
    if (res.code === ErrorCode.Ok && res.data) {
        setToken(res.data.token);
    }
    return res;
}
