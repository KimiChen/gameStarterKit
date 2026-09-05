/**
 * redeem.claim——兑换码插件的唯一写端点。幂等（clientReqId 重放）由 dispatcher 的 idem 层
 * 统一处理；同码二次兑换（不同 clientReqId）由 store 的 Lua 原子拒绝。
 */
import { RedeemRpc } from "@game/shared/protocol/lobbyRpc/domains/redeem";
import { claimRedeemCode } from "../../core/redeem/claim";
import { createRedisRedeemStore } from "../../core/redeem/store";
import { defineRpc } from "../rpc";

const store = createRedisRedeemStore();

export default defineRpc(RedeemRpc.Claim, {
  handler: (ctx, p) => claimRedeemCode(store, ctx.uid, p.code),
});
