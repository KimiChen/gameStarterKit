/**
 * 只含兴趣集的 baseline（MMO MF5a-B2；自 snake `modes/snake/index.ts` 的 baselineId / Begin-Chunk-End / checksum / cursor 泛化）：
 * 进房、重连、兴趣集突变、出站队列超限重同步时，把该会话此刻的**视野内完整投影**分块发下去。
 *
 * - `baselineId = <epochId>:baseline:<session>:<seq>`（与 snake 同形；seq 取自 ObserverSync 的单 seq 流，即 cursor）；
 * - Begin（chunkCount / itemCount）→ Chunk（index 升序、每块 ≤ chunkItems）→ End（checksum = wireChecksum(items)）；
 *   客户端按 Begin 计数拼块、按 End 校验，缺块 / 乱序 / 错内容一律 fail 并重新请求；
 * - token 与 payload 构造器由 mode 注入（wire 属 mode），三个 token 必须 perSession；投递落到 sink（OutboundQueue，不可丢类）。
 * ⛔ 本类不碰 Colyseus，不决定「谁在视野内」——items 由 mode 按兴趣集给出。
 */
import { OBSERVER_SYNC_LIMITS, wireChecksum, type GameplayS2CToken } from "@game/shared";
import { assertPerSessionToken, type ObserverSyncSink } from "./ObserverSync";

export interface BaselineTokens<TBegin, TChunk, TEnd> {
    readonly begin: GameplayS2CToken<TBegin>;
    readonly chunk: GameplayS2CToken<TChunk>;
    readonly end: GameplayS2CToken<TEnd>;
}

export interface BaselineMeta {
    readonly baselineId: string;
    readonly epochId: string;
    readonly seq: number;
    readonly tick: number;
}

export interface BaselineBuilders<TItem, TBegin, TChunk, TEnd> {
    begin(meta: BaselineMeta & { readonly chunkCount: number; readonly itemCount: number }): TBegin;
    chunk(meta: BaselineMeta & { readonly index: number; readonly items: readonly TItem[] }): TChunk;
    end(meta: BaselineMeta & { readonly checksum: string }): TEnd;
}

export interface BaselineReceipt {
    readonly baselineId: string;
    readonly seq: number;
    readonly chunkCount: number;
    readonly itemCount: number;
    readonly checksum: string;
}

export class Baseline<TItem, TBegin = unknown, TChunk = unknown, TEnd = unknown> {
    private readonly chunkItems: number;

    constructor(
        private readonly tokens: BaselineTokens<TBegin, TChunk, TEnd>,
        private readonly builders: BaselineBuilders<TItem, TBegin, TChunk, TEnd>,
        private readonly sink: ObserverSyncSink,
        options: { readonly chunkItems?: number } = {},
    ) {
        assertPerSessionToken(tokens.begin as GameplayS2CToken<unknown>, "baseline begin");
        assertPerSessionToken(tokens.chunk as GameplayS2CToken<unknown>, "baseline chunk");
        assertPerSessionToken(tokens.end as GameplayS2CToken<unknown>, "baseline end");
        const chunkItems = options.chunkItems ?? OBSERVER_SYNC_LIMITS.baselineChunkItems;
        if (!Number.isSafeInteger(chunkItems) || chunkItems < 1 || chunkItems > OBSERVER_SYNC_LIMITS.baselineChunkItems) {
            throw new RangeError(`[Baseline] chunkItems 必须是 1..${OBSERVER_SYNC_LIMITS.baselineChunkItems} 的整数（§11.2 只许收紧）`);
        }
        this.chunkItems = chunkItems;
    }

    /**
     * 发一次 baseline（Begin → Chunk* → End，全部经 sink）。`seq` 由调用方从 ObserverSync 单流领取，
     * 客户端以它作为后续差分的 cursor。items 为空也合法（chunkCount 0：Begin + End）。
     */
    send(session: string, items: readonly TItem[], envelope: { readonly epochId: string; readonly seq: number; readonly tick: number }): BaselineReceipt {
        if (!Number.isSafeInteger(envelope.seq) || envelope.seq < 1) throw new RangeError("[Baseline] seq 必须 ≥ 1（来自 ObserverSync.nextSeq）");
        if (typeof envelope.epochId !== "string" || envelope.epochId.length === 0) throw new TypeError("[Baseline] epochId 必须非空");
        const chunks: (readonly TItem[])[] = [];
        for (let offset = 0; offset < items.length; offset += this.chunkItems) {
            chunks.push(items.slice(offset, offset + this.chunkItems));
        }
        const baselineId = `${envelope.epochId}:baseline:${session}:${envelope.seq}`;
        const meta: BaselineMeta = { baselineId, epochId: envelope.epochId, seq: envelope.seq, tick: envelope.tick };
        const checksum = wireChecksum(items);
        this.sink.emit(session, this.tokens.begin as GameplayS2CToken<unknown>,
            this.builders.begin({ ...meta, chunkCount: chunks.length, itemCount: items.length }));
        chunks.forEach((chunk, index) => this.sink.emit(session, this.tokens.chunk as GameplayS2CToken<unknown>,
            this.builders.chunk({ ...meta, index, items: chunk })));
        this.sink.emit(session, this.tokens.end as GameplayS2CToken<unknown>, this.builders.end({ ...meta, checksum }));
        return { baselineId, seq: envelope.seq, chunkCount: chunks.length, itemCount: items.length, checksum };
    }
}
