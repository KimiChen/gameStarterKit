/**
 * chat.send 领域逻辑（docs/MMO.md §6.5；MF6a-B4）。固定序：解析频道 → 授权（realm 必须 = 本区；party 发送者须在名册）
 * → 策略 canSend → 限流（user 桶 cap CHAT_SEND_CAPACITY / refill CHAT_SEND_REFILL_PER_S；realm 另加 realm 桶）
 * → 策略 transform → 盖章（from 由服务端取档 nickname，⛔ 不信客户端）。
 * 桶基础设施失败 → CHAT_UNAVAILABLE（fail-closed，⛔ 不放行）。推送不在本文件（端点用 pushToRealm / pushToUsers）。
 */
import { randomUUID } from "node:crypto";
import { CHAT_TEXT_MAX, type IChatMessagePush, type IChatSendReq } from "@game/shared/protocol/lobbyRpc/domains/chat";
import {
  CHAT_REALM_CAPACITY, CHAT_REALM_REFILL_PER_S, CHAT_SEND_CAPACITY, CHAT_SEND_REFILL_PER_S,
} from "../infra/config";
import { kRl } from "../infra/keys";
import { clientForKey } from "../infra/redisRoute";
import { evalshaWithReload, TOKEN_BUCKET } from "../infra/redisScripts";
import { InvalidPayloadError, RateLimitedError, RpcFault } from "../errors";
import { loadFields } from "../userRecord";
import { isPartyMember } from "../party/party";
import { getChatPolicy, type ChatPolicy } from "./policy";

export type ChatChannelRef = { readonly kind: "realm"; readonly sId: number } | { readonly kind: "party"; readonly partyId: number };

export function parseChatChannel(channel: string): ChatChannelRef {
  const realm = /^realm:(0|[1-9]\d{0,4})$/u.exec(channel);
  if (realm) return { kind: "realm", sId: Number(realm[1]) };
  const party = /^party:([1-9]\d{0,14})$/u.exec(channel);
  if (party) return { kind: "party", partyId: Number(party[1]) };
  throw new InvalidPayloadError(`频道非法: ${channel}`);
}

export interface ChatSendDeps {
  now(): number;
  newMsgId(): string;
  /** 令牌桶：≥0 允许（剩余令牌），-1 拒绝；基础设施失败 throw。 */
  bucket(scope: string, capacity: number, refillPerSec: number): Promise<number>;
  isPartyMember(partyId: number, uid: string): Promise<boolean>;
  displayName(uid: string): Promise<string>;
  policy(): ChatPolicy;
}

export const productionChatDeps: ChatSendDeps = {
  now: () => Date.now(),
  newMsgId: () => randomUUID(),
  bucket: async (scope, capacity, refillPerSec) => {
    const key = kRl(scope);
    const r = await evalshaWithReload(clientForKey(key), TOKEN_BUCKET, [key], [capacity, refillPerSec, 1]);
    return typeof r === "number" ? r : Number(r);
  },
  isPartyMember,
  displayName: async (uid) => {
    const f = await loadFields(uid, ["nickname"]);
    return typeof f.nickname === "string" && f.nickname.length > 0 ? f.nickname : uid;
  },
  policy: getChatPolicy,
};

export interface ChatSendResult {
  readonly message: IChatMessagePush;
  readonly audience: ChatChannelRef;
}

export async function sendChat(uid: string, sId: number, req: IChatSendReq, deps: ChatSendDeps = productionChatDeps): Promise<ChatSendResult> {
  const audience = parseChatChannel(req.channel);
  // 授权（可见性 = 权限）：realm 只许本区；party 只许名册成员（ZSCORE）。
  if (audience.kind === "realm") {
    if (audience.sId !== sId) throw new RpcFault("CHAT_CHANNEL_FORBIDDEN", "只能向本区频道发言");
  } else if (!(await deps.isPartyMember(audience.partyId, uid))) {
    throw new RpcFault("CHAT_CHANNEL_FORBIDDEN", "不是该队伍成员");
  }
  const policy = deps.policy();
  const ctx = { uid, sId, channel: req.channel };
  if (policy.canSend && !(await policy.canSend(ctx, req.text))) {
    throw new RpcFault("CHAT_CHANNEL_FORBIDDEN", "当前不允许发言");
  }
  // 限流（handler 内，与 room.resolve 同做法）：桶基础设施失败 fail-closed。
  let allowed: boolean;
  try {
    allowed = (await deps.bucket(`chat:send:${uid}`, CHAT_SEND_CAPACITY, CHAT_SEND_REFILL_PER_S)) >= 0;
    if (allowed && audience.kind === "realm") {
      allowed = (await deps.bucket(`chat:realm:s${sId}`, CHAT_REALM_CAPACITY, CHAT_REALM_REFILL_PER_S)) >= 0;
    }
  } catch (e) {
    console.error("[chat] 限流桶基础设施失败（fail-closed）", e);
    throw new RpcFault("CHAT_UNAVAILABLE", "聊天暂不可用");
  }
  if (!allowed) throw new RateLimitedError();
  let text = req.text;
  if (policy.transform) {
    const transformed = (await policy.transform(text, ctx)).trim();
    if (transformed.length === 0 || transformed.length > CHAT_TEXT_MAX) {
      throw new RpcFault("CHAT_CHANNEL_FORBIDDEN", "消息被策略拒绝");
    }
    text = transformed;
  }
  const message: IChatMessagePush = {
    channel: req.channel,
    msgId: deps.newMsgId(),
    from: { uid, name: await deps.displayName(uid) },
    text,
    at: deps.now(),
  };
  return { message, audience };
}
