/**
 * 兑换用例：查码 → 原子记账 → 组响应。域错误码走 RpcFault（白名单来自 redeem 域 descriptor
 * 的 errorCodes，经 registry.generated 汇入 isRpcErrCode），⛔ 不自造错误通道。
 */
import type { IRedeemClaimRes } from "@game/shared/protocol/lobbyRpc/domains/redeem";
import { RpcFault } from "../errors";
import { lookupRedeemCode } from "./codes";
import type { RedeemStore } from "./store";

export async function claimRedeemCode(store: RedeemStore, uid: string, code: string): Promise<IRedeemClaimRes> {
  const reward = lookupRedeemCode(code);
  if (!reward) throw new RpcFault("REDEEM_CODE_INVALID", `兑换码不存在：${code}`);
  const outcome = await store.claim(uid, code, reward.amount);
  if (outcome.kind === "used") throw new RpcFault("REDEEM_CODE_USED", `兑换码已使用：${code}`);
  return { code, reward, balance: outcome.balance };
}
