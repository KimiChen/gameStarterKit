/**
 * chat 域的非生成 wire 助手（BF2）。
 *
 * schema（`apps/shared/schema/protocols/C2S/chat.json`）用 `check` 引用本文件的具名函数；
 * 频道/文本的**形状**由本文件独占（正则 + trim + 控制字符三类判据不是声明式约束能表达的），
 * 路由·字段名·错误码仍由 schema 声明。
 *
 * `CHAT_TEXT_MAX` 同时是**业务上限**（`apps/server/src/core/chat/send.ts` 的敏感词替换后复检、
 * 客户端 `ChatLogic` 的出站预检）：它必须与 wire 闸同源，因此随本文件搬家 —— 域文件已是生成物。
 */
import { boundedString, WireValidationError } from "../../http";

/** 单条文本上限（trim 后 1..CHAT_TEXT_MAX） */
export const CHAT_TEXT_MAX = 200;

const CHANNEL_RE = /^(?:realm:(?:0|[1-9]\d{0,4})|party:[1-9]\d{0,14})$/u;
// C0 控制字符 + DEL（\x00-\x1f、\x7f）
const CONTROL_RE = /[\x00-\x1f\x7f]/u;

/** 频道闸：只接受 `realm:<sId>` / `party:<pid>`（sId ≤5 位、pid ≤15 位且无前导零）。 */
export function validateChatChannel(value: unknown, path: string): string {
    const channel = boundedString(value, path, 7, 32);
    if (!CHANNEL_RE.test(channel)) throw new WireValidationError("CHAT_CHANNEL", path);
    return channel;
}

/** 发信文本闸：原文 ≤ CHAT_TEXT_MAX、trim 后非空、无控制字符；返回 trim 后文本。 */
export function validateChatText(value: unknown, path: string): string {
    const raw = boundedString(value, path, 1, CHAT_TEXT_MAX);
    if (CONTROL_RE.test(raw)) throw new WireValidationError("CHAT_TEXT_CONTROL", path);
    const text = raw.trim();
    if (text.length === 0) throw new WireValidationError("CHAT_TEXT_EMPTY", path);
    return text;
}

/**
 * 推送文本闸：只做长度（服务端已盖章的文本 ⛔ 不再 trim —— 那会改写权威内容）。
 * 与 `validateChatText` 分开正是为了不让推送路径悄悄多一道语义。
 */
export function validateChatPushText(value: unknown, path: string): string {
    return boundedString(value, path, 1, CHAT_TEXT_MAX);
}
