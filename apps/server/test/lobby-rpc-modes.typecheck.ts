/**
 * 编译期负例（Non-intrusive §5.6 第 5/6 条，阶段 3）：只进 tsc（tsconfig include 覆盖
 * test/），⛔ 不是 node:test 文件（文件名刻意不带 .test 以避开 test/*.test.ts glob）。
 *
 *  - LobbyRpcIdemType 是 registry 生成的**显式 mode 联合**：`shop.queryOp` 的 req 含
 *    原操作 opId、`mail.markRead` 是写路由，但两者都不在幂等域——结构推断给不出这个结果；
 *  - defineRpc 编译期没有 schema/idem 参数，endpoint 无法覆盖 registry metadata。
 */
import { ShopRpc, UserRpc, type LobbyRpcIdemType, type LobbyRpcNaturalWriteType } from "@game/shared";
import { defineRpc, sharedRpcSchema } from "../src/websocket/rpc";

// 正例：idempotent-write 路由在幂等域内。
const idemOk: LobbyRpcIdemType = "user.updateProfile";

// 负例：query 路由即使携带原操作 ID（IShopQueryOpReq.opId）也不进幂等域。
// @ts-expect-error shop.queryOp 是 query，⛔ 不得被推为 LobbyRpcIdemType
const idemBadQuery: LobbyRpcIdemType = ShopRpc.QueryOp;

// 负例：natural-write 路由不进幂等域（现状等价：markRead 从未开 idem）。
// @ts-expect-error mail.markRead 是 natural-write，不在幂等域
const idemBadNatural: LobbyRpcIdemType = "mail.markRead";

// natural-write 联合本身是显式生成的字面量。
const naturalOk: LobbyRpcNaturalWriteType = "mail.markRead";

// 负例：endpoint 无法自填 schema——defineRpc 编译期没有该参数（§5.6 第 6 条）。
const defBadSchema = defineRpc(UserRpc.GetUserId, {
  // @ts-expect-error defineRpc 不接受 endpoint 本地 schema
  schema: sharedRpcSchema(UserRpc.GetUserId),
  handler: async (ctx) => ({ uid: ctx.uid }),
});

// 负例：endpoint 无法自填 idem。
const defBadIdem = defineRpc(UserRpc.UpdateProfile, {
  // @ts-expect-error defineRpc 不接受 endpoint 本地 idem 开关
  idem: true,
  handler: async () => ({ ok: true }),
});

// 负例：endpoint 无法自填 mode。
const defBadMode = defineRpc(UserRpc.GetInfo, {
  // @ts-expect-error defineRpc 不接受 endpoint 本地 mode
  mode: "query",
  handler: async () => {
    throw new Error("typecheck-only");
  },
});

// 值使用（噪音抑制：noUnusedLocals 下每个声明都必须被读取）。
export const _typecheckPins = [idemOk, idemBadQuery, idemBadNatural, naturalOk, defBadSchema, defBadIdem, defBadMode] as const;
