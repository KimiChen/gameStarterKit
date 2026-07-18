/** POST login —— mock：任意 code 都登录成功。 */
import { ApiPath, ErrorCode, type ILoginReq, type ILoginRes } from "@game/shared";
import { defineMock, fail, ok } from "../defineMock";
import { mockLogin } from "../data";

export default defineMock({
    method: "post",
    path: ApiPath.Login,
    handler: (req, res) => {
        const body = (req.body ?? {}) as Partial<ILoginReq>;
        if (typeof body.code !== "string" || body.code.length === 0) {
            res.json(fail(ErrorCode.BadRequest));
            return;
        }
        const data: ILoginRes = mockLogin(body.code);
        res.json(ok(data));
    },
});
