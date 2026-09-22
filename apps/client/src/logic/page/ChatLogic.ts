/**
 * 频道聊天页面逻辑（MMO MF6a-B4；最小样板，无头单测：test/chatLogic.test.ts）。
 *
 * ⚠ 同 GuildLogic / PartyLogic 刻意"有头无尾"：只有 Logic + 单测，无 View、不进 viewRegistry。
 * 契约语义（shared/protocol/lobbyRpc/domains/chat.ts 是双端真源）：
 *  - 无 history：本地只保留每频道最近 N 条（bufferSize），断线期间的消息不补；
 *  - 发送者也经推送收到自己的回显，⛔ 不本地先插一条（以服务端盖章的 msgId / at 为准）；按 msgId 去重；
 *  - 出站前按 CHAT_TEXT_MAX / trim 非空做本地预检（服务端仍是权威）。
 */
import { LobbyPush } from "../../shared/index";
import { CHAT_TEXT_MAX } from "../../shared/protocol/lobbyRpc/checks/chat";
import type { IChatMessagePush, IChatSendRes } from "../../shared/protocol/lobbyRpc/domains/chat";

export interface IChatLogicDeps {
    /** 生产 = (channel, text) => WebSocketClient.inst.rpc(ChatRpc.Send, { channel, text }) */
    send(channel: string, text: string): Promise<IChatSendRes>;
    /** 生产 = (cb) => WebSocketClient.inst.onPush(LobbyPush.ChatMessage, cb)，返回解绑 */
    onPush(type: typeof LobbyPush.ChatMessage, cb: (data: IChatMessagePush) => void): () => void;
}

export class ChatLogic {
    private readonly buffers = new Map<string, IChatMessagePush[]>();
    private readonly seen = new Set<string>();
    private unbind: (() => void) | null = null;

    /** 新消息回调（已去重、按到达序） */
    onMessage: (message: IChatMessagePush) => void = () => {};

    constructor(private readonly deps: IChatLogicDeps, private readonly bufferSize = 100) {}

    start(): void {
        this.stop();
        this.unbind = this.deps.onPush(LobbyPush.ChatMessage, (message) => this.accept(message));
    }

    stop(): void {
        this.unbind?.();
        this.unbind = null;
    }

    messagesOf(channel: string): readonly IChatMessagePush[] {
        return this.buffers.get(channel) ?? [];
    }

    /** 本地预检后发送；回显经推送到达，⛔ 不在此插入本地缓冲。 */
    async send(channel: string, rawText: string): Promise<IChatSendRes> {
        const text = rawText.trim();
        if (text.length === 0 || rawText.length > CHAT_TEXT_MAX) {
            throw new Error(`聊天文本须为 trim 后非空且 ≤ ${CHAT_TEXT_MAX} 字`);
        }
        return this.deps.send(channel, text);
    }

    private accept(message: IChatMessagePush): void {
        if (this.seen.has(message.msgId)) return; // 至少一次投递下的重复
        this.seen.add(message.msgId);
        let buffer = this.buffers.get(message.channel);
        if (!buffer) { buffer = []; this.buffers.set(message.channel, buffer); }
        buffer.push(message);
        while (buffer.length > this.bufferSize) {
            const dropped = buffer.shift();
            if (dropped) this.seen.delete(dropped.msgId);
        }
        this.onMessage(message);
    }
}
