/** GET player/profile —— 需要 Authorization: Bearer <token>。 */
import { ApiPath, ErrorCode, type IPlayerProfile } from "@game/shared";
import { defineMock, fail, ok } from "../defineMock";
import { mockProfileByToken } from "../data";

export default defineMock({
    method: "get",
    path: ApiPath.Profile,
    handler: (req, res) => {
        const auth = req.header("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        const profile: IPlayerProfile | undefined = mockProfileByToken(token);
        if (!profile) {
            res.json(fail(ErrorCode.TokenExpired));
            return;
        }
        res.json(ok(profile));
    },
});
