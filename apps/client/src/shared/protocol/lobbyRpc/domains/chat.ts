/**
 * chat 域 ws-RPC 契约（docs/MMO.md §6.5；MF6a-B4）：realm / party 两类频道，**无 history**。
 *
 * - `chat.send { channel, text }`（natural-write，⛔ 不走幂等 v2）→ `{ msgId, at }`；exact keys，
 *   text 1..CHAT_TEXT_MAX、trim 非空、无控制字符；请求 ⛔ 无 `from` 键（服务端盖章，多带即 INVALID_PAYLOAD）。
 * - push `chat.message { channel, msgId, from:{uid,name}, text, at }`：发送者也经总线收到自己的回显。
 * - 频道：`realm:<sId>`（必须 = auth.sId，否则 CHAT_CHANNEL_FORBIDDEN）/ `party:<pid>`（发送者须在名册）；
 *   附近聊天 ⛔ 不在本联合里（WorldRoom perSession，§6.5.1）。
 * - 限流在 handler（TOKEN_BUCKET）：user 桶 + realm 桶；桶基础设施失败 → CHAT_UNAVAILABLE（fail-closed）。
 * 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import { defineLobbyPush, defineLobbyRpcDomain, defineRpcNaturalWrite } from "../defineDomain";
import { pushRecord, rpcRecord } from "../primitives";

/** chat 域路由名 */
export const ChatRpc = {
    /** 发一条频道消息（realm / party） */
    Send: "chat.send",
} as const;

/** 单条文本上限（trim 后 1..CHAT_TEXT_MAX） */
export const CHAT_TEXT_MAX = 200;

export interface IChatSendReq {
    /** `realm:<sId>` 或 `party:<pid>` */
    channel: string;
    text: string;
}
export interface IChatSendRes {
    msgId: string;
    /** 服务端时间戳（ms） */
    at: number;
}

export interface IChatMessagePush {
    channel: string;
    msgId: string;
    /** 服务端盖章的发送者 */
    from: { uid: string; name: string };
    text: string;
    at: number;
}

/** 路由名 → { req, res } */
export interface ChatRpcMap {
    [ChatRpc.Send]: { req: IChatSendReq; res: IChatSendRes };
}

const CHANNEL_RE = /^(?:realm:(?:0|[1-9]\d{0,4})|party:[1-9]\d{0,14})$/u;
// C0 控制字符 + DEL（\x00-\x1f、\x7f）
const CONTROL_RE = /[\x00-\x1f\x7f]/u;

export function validateChatChannel(value: unknown, path: string): string {
    const channel = boundedString(value, path, 7, 32);
    if (!CHANNEL_RE.test(channel)) throw new WireValidationError("CHAT_CHANNEL", path);
    return channel;
}

/** 原文 ≤ CHAT_TEXT_MAX、trim 后非空、无控制字符；返回 trim 后文本。 */
export function validateChatText(value: unknown, path: string): string {
    const raw = boundedString(value, path, 1, CHAT_TEXT_MAX);
    if (CONTROL_RE.test(raw)) throw new WireValidationError("CHAT_TEXT_CONTROL", path);
    const text = raw.trim();
    if (text.length === 0) throw new WireValidationError("CHAT_TEXT_EMPTY", path);
    return text;
}

export const validateChatSendReq: RuntimeValidator<IChatSendReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["channel", "text"], [], "payload");
    return { channel: validateChatChannel(value.channel, "payload.channel"), text: validateChatText(value.text, "payload.text") };
};
export const validateChatSendRes: RuntimeValidator<IChatSendRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["msgId", "at"], [], "response");
    return { msgId: boundedString(value.msgId, "response.msgId", 1, 64), at: finiteInteger(value.at, "response.at", 0) };
};

export const validateChatMessagePush: RuntimeValidator<IChatMessagePush> = (input) => {
    const value = pushRecord(input, "push.data");
    assertExactKeys(value, ["channel", "msgId", "from", "text", "at"], [], "push.data");
    const from = pushRecord(value.from, "push.data.from");
    assertExactKeys(from, ["uid", "name"], [], "push.data.from");
    return {
        channel: validateChatChannel(value.channel, "push.data.channel"),
        msgId: boundedString(value.msgId, "push.data.msgId", 1, 64),
        from: { uid: boundedString(from.uid, "push.data.from.uid", 1, 128), name: boundedString(from.name, "push.data.from.name", 0, 128) },
        text: boundedString(value.text, "push.data.text", 1, CHAT_TEXT_MAX),
        at: finiteInteger(value.at, "push.data.at", 0),
    };
};

export default defineLobbyRpcDomain({
    domain: "chat",
    contractVersion: 1,
    errorCodes: ["CHAT_CHANNEL_FORBIDDEN", "CHAT_UNAVAILABLE"],
    pushes: [
        defineLobbyPush("ChatMessage", "chat.message", validateChatMessagePush),
    ],
    routes: [
        defineRpcNaturalWrite(ChatRpc.Send, { request: validateChatSendReq, response: validateChatSendRes }),
    ],
});
