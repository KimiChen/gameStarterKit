/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/chat.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { pushRecord, rpcRecord } from "../primitives";
import { defineLobbyPush, defineLobbyRpcDomain, defineRpcNaturalWrite } from "../defineDomain";
import { validateChatChannel, validateChatPushText, validateChatText } from "../checks/chat";

/** chat 域路由名 */
export const ChatRpc = {
    Send: "chat.send",
} as const;

export interface IChatSendReq {
    channel: string
    text: string
}

export interface IChatSendRes {
    msgId: string
    at: number
}

export interface IChatMessagePush {
    channel: string
    msgId: string
    from: { uid: string; name: string }
    text: string
    at: number
}

function parseIChatSendReq(input: unknown, path: string): IChatSendReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["channel", "text"], [], path)
    const out: IChatSendReq = {
        channel: validateChatChannel(value.channel, `${path}.channel`),
        text: validateChatText(value.text, `${path}.text`),
    }
    return out
}

function parseIChatSendRes(input: unknown, path: string): IChatSendRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["msgId", "at"], [], path)
    const out: IChatSendRes = {
        msgId: boundedString(value.msgId, `${path}.msgId`, 1, 64),
        at: finiteInteger(value.at, `${path}.at`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIChatMessagePush(input: unknown, path: string): IChatMessagePush {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["channel", "msgId", "from", "text", "at"], [], path)
    const out: IChatMessagePush = {
        channel: validateChatChannel(value.channel, `${path}.channel`),
        msgId: boundedString(value.msgId, `${path}.msgId`, 1, 64),
        from: ((v) => { const value = rpcRecord(v, `${path}.from`); assertExactKeys(value, ["uid", "name"], [], `${path}.from`); const out: { uid: string; name: string } = {  uid: boundedString(value.uid, `${path}.from.uid`, 1, 128),  name: boundedString(value.name, `${path}.from.name`, 0, 128), }; return out; })(value.from),
        text: validateChatPushText(value.text, `${path}.text`),
        at: finiteInteger(value.at, `${path}.at`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

export const validateChatSendReq: RuntimeValidator<IChatSendReq> = (input) => parseIChatSendReq(input, "payload")

export const validateChatSendRes: RuntimeValidator<IChatSendRes> = (input) => parseIChatSendRes(input, "response")

export const validateChatMessagePush: RuntimeValidator<IChatMessagePush> = (input) => parseIChatMessagePush(pushRecord(input, "push.data"), "push.data")

export default defineLobbyRpcDomain({
    domain: "chat",
    contractVersion: 5,
    errorCodes: ["CHAT_CHANNEL_FORBIDDEN","CHAT_UNAVAILABLE"],
    pushes: [
        defineLobbyPush("ChatMessage", "chat.message", validateChatMessagePush),
    ],
    routes: [
        defineRpcNaturalWrite(ChatRpc.Send, { request: validateChatSendReq, response: validateChatSendRes }),
    ],
});
