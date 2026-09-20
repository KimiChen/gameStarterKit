/**
 * WorldTransferPort（MMO MF8-B3，docs/MMO.md §5.4 MF8）：WorldRoom 交接编排消费的持久面——状态机（rooms/core/transfer.ts）+ 凭据签发
 * （rooms/core/WorldTicket.ts）。生产 = SQL + Redis；壳单测注入内存假件（同语义：一 persona 只一在途、already、Committed 后不可取消）。
 * ⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
import { issueWorldTicket, type IssueWorldTicketArgs, type IssuedWorldTicket } from "./WorldTicket";
import {
    activateTransfer, activeTransferOf, cancelIfStale, cancelTransfer, commitTransfer, finalizeTransfer, prepareTransfer, readTransfer, requestTransfer,
    type RequestTransferInput, type TransferStep, type WorldTransferRow,
} from "./transfer";

export interface WorldTransferPort {
    request(sId: number, input: RequestTransferInput): Promise<TransferStep>;
    prepare(sId: number, transferId: string, input: { readonly toInstance: string; readonly reserveExpiresAt: number }): Promise<TransferStep>;
    commit(sId: number, transferId: string, input: { readonly controlEpoch: number; readonly ticketSha256: string }): Promise<TransferStep>;
    activate(sId: number, transferId: string, input: { readonly controlEpoch: number }): Promise<TransferStep>;
    finalize(sId: number, transferId: string): Promise<TransferStep>;
    cancel(sId: number, transferId: string): Promise<TransferStep>;
    read(sId: number, transferId: string): Promise<WorldTransferRow | null>;
    /** MF11 R2-01：陈旧的 Committed 前行（源房崩溃遗留）⇒ cancelled；true = 已取消。 */
    cancelIfStale(sId: number, row: WorldTransferRow, nowMs: number, staleAfterMs: number): Promise<boolean>;
    /** 该 persona 的在途行（无 ⇒ null）。 */
    activeOf(sId: number, personaId: string): Promise<WorldTransferRow | null>;
    issueTicket(args: IssueWorldTicketArgs): Promise<IssuedWorldTicket>;
}

/** 生产端口：MySQL 状态机 + Redis 凭据。 */
export const sqlWorldTransferPort: WorldTransferPort = {
    request: (sId, input) => requestTransfer(sId, input),
    prepare: (sId, transferId, input) => prepareTransfer(sId, transferId, input),
    commit: (sId, transferId, input) => commitTransfer(sId, transferId, input),
    activate: (sId, transferId, input) => activateTransfer(sId, transferId, input),
    finalize: (sId, transferId) => finalizeTransfer(sId, transferId),
    cancel: (sId, transferId) => cancelTransfer(sId, transferId),
    read: (sId, transferId) => readTransfer(sId, transferId),
    cancelIfStale: (sId, row, nowMs, staleAfterMs) => cancelIfStale(sId, row, nowMs, staleAfterMs),
    activeOf: (sId, personaId) => activeTransferOf(sId, personaId),
    issueTicket: (args) => issueWorldTicket(args),
};
