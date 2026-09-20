/**
 * 聊天策略单一注入点（docs/MMO.md §6.5；MF6a-B4；与 core/auth/kickBus 的 setKickHandler 同形）：
 * 禁言 / 过滤 / 词库 / 封禁表留给插件——插件在进程入口 `setChatPolicy({ canSend, transform })` 注入，
 * 框架只在 sendChat 的固定位置调用它们（授权之后、限流之前 canSend；限流之后 transform）。
 */
export interface ChatPolicyContext {
  readonly uid: string;
  readonly sId: number;
  readonly channel: string;
}

export interface ChatPolicy {
  /** false ⇒ CHAT_CHANNEL_FORBIDDEN（禁言 / 频道黑名单等）。缺省放行。 */
  canSend?(ctx: ChatPolicyContext, text: string): boolean | Promise<boolean>;
  /** 出站文本变换（敏感词替换等）；返回值仍受 CHAT_TEXT_MAX / 非空约束，越界按拒绝处理。缺省原样。 */
  transform?(text: string, ctx: ChatPolicyContext): string | Promise<string>;
}

let policy: ChatPolicy = {};

export function setChatPolicy(next: ChatPolicy | null): void {
  policy = next ?? {};
}

export function getChatPolicy(): ChatPolicy {
  return policy;
}
