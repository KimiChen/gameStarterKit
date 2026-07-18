/** GET health —— 健康检查。 */
import { ApiPath, type IHealthRes } from "@game/shared";
import { defineMock, ok } from "../defineMock";

export default defineMock({
    method: "get",
    path: ApiPath.Health,
    handler: (_req, res) => {
        const data: IHealthRes = { status: "ok", serverTime: Date.now(), version: "0.1.0-mock" };
        res.json(ok(data));
    },
});
