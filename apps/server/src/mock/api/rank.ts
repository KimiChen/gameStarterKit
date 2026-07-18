/** GET rank —— mock 排行榜。 */
import { ApiPath, type IRankRes } from "@game/shared";
import { defineMock, ok } from "../defineMock";
import { mockRank } from "../data";

export default defineMock({
    method: "get",
    path: ApiPath.Rank,
    handler: (_req, res) => {
        const data: IRankRes = { list: mockRank(), myRank: -1 };
        res.json(ok(data));
    },
});
