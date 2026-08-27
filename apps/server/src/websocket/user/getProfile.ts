/**
 * 只读他档：readonly 冻结对象，不含私有字段（09·G2 无锁无脏表）。
 */
import { UserRpc } from "@game/shared";
import { readUserReadonly } from "../../player/userStore";
import { defineRpc, sharedRpcSchema } from "../rpc";

export default defineRpc(UserRpc.GetProfile, {
  schema: sharedRpcSchema(UserRpc.GetProfile),
  handler: async (_ctx, p) => ({ profile: await readUserReadonly(p.uid) }),
});
