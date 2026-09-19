/**
 * world.enter / world.resolveTransfer 领域逻辑（MMO MF8-B4，docs/MMO.md §5.4 MF8 / D27）。固定序：
 *  enter：persona 归属（存储真源：本账号 + active）→ 在途交接检查（Committed ⇒ 解析交接、activated ⇒ 懒 finalize 后照常进入、
 *         requested / prepared ⇒ WORLD_TRANSFER_INVALID）→ 分线定位（指定 line 走 resolve；未指定走 MF10-B1 分配：满员开新线到 WORLD_MAX_LINES_PER_MAP，
 *         上限 / 全满 ⇒ WORLD_LINE_UNAVAILABLE）→ 签发凭据（绑定 uid / persona / worldAddress / 当前 controlEpoch）；endpoint 取 WorldRegistry 登记的节点地址；
 *  resolveTransfer：读交接 → 归属（⛔ 不区分「不存在 / 非本账号」，一律 WORLD_TRANSFER_INVALID）→ Committed ⇒ 凭据轮换（新签 + 表登记 + 旧凭据作废）；
 *         activated / finalized ⇒ 已到达：按目标分线签普通进入凭据（重连）；其余 ⇒ WORLD_TRANSFER_INVALID。
 * 基础设施失败 ⇒ WORLD_SERVICE_UNAVAILABLE（fail-closed，⛔ 不降级为确定性结论）。凭据原文只出现在响应里，⛔ 不进日志。
 */
import { type IWorldEnterReq, type IWorldEnterRes, type IWorldResolveTransferReq } from "@game/shared/protocol/lobbyRpc/domains/world";
import { RpcFault, WorldLineLimitError, WorldLinesExhaustedError } from "../errors";
import { WORLD_LINE_CAPACITY, WORLD_PUBLIC_WS_URL } from "../infra/config";
import { readPersonaOwner, type PersonaOwner } from "../../rooms/core/control";
import { worldAddressOf, worldDirectory } from "../../rooms/core/WorldDirectory";
import { redisWorldRegistry } from "../../rooms/core/WorldRegistry";
import { issueWorldTicket, revokeWorldTicket, type IssueWorldTicketArgs, type IssuedWorldTicket } from "../../rooms/core/WorldTicket";
import { activeTransferOf, finalizeTransfer, readTransfer, rotateTransferTicket, type WorldTransferRow } from "../../rooms/core/transfer";

export interface WorldEnterDeps {
    readPersonaOwner(sId: number, personaId: string): Promise<PersonaOwner | null>;
    /** 指定分线（line ≥ 上限 ⇒ WorldLineLimitError ⇒ WORLD_LINE_UNAVAILABLE）。 */
    resolveInstance(sId: number, mapId: string, line: number): Promise<{ readonly instanceId: string; readonly mapId: string; readonly line: number }>;
    /** 未指定分线：MF10-B1 分配（满员开新线；全满且到上限 ⇒ WorldLinesExhaustedError ⇒ WORLD_LINE_UNAVAILABLE）。 */
    allocateInstance(sId: number, mapId: string): Promise<{ readonly instanceId: string; readonly mapId: string; readonly line: number }>;
    activeTransferOf(sId: number, personaId: string): Promise<WorldTransferRow | null>;
    readTransfer(sId: number, transferId: string): Promise<WorldTransferRow | null>;
    rotateTransferTicket(sId: number, transferId: string, ticketSha256: string): Promise<boolean>;
    finalizeTransfer(sId: number, transferId: string): Promise<unknown>;
    issueTicket(args: IssueWorldTicketArgs): Promise<IssuedWorldTicket>;
    revokeTicket(sId: number, ticketSha256: string): Promise<boolean>;
    /** 承载分线的 world 进程公开地址（MF10：权威房经 WorldRegistry 登记，无登记回落 WORLD_PUBLIC_WS_URL）；空串 = 同当前区 gameWsUrl。 */
    endpoint(sId: number, instanceId: string): Promise<string>;
    now(): number;
}

export const productionWorldEnterDeps: WorldEnterDeps = {
    readPersonaOwner: (sId, personaId) => readPersonaOwner(sId, personaId),
    resolveInstance: (sId, mapId, line) => worldDirectory.resolve(sId, mapId, line),
    allocateInstance: (sId, mapId) => worldDirectory.allocate(sId, mapId, { capacity: WORLD_LINE_CAPACITY }),
    activeTransferOf: (sId, personaId) => activeTransferOf(sId, personaId),
    readTransfer: (sId, transferId) => readTransfer(sId, transferId),
    rotateTransferTicket: (sId, transferId, ticketSha256) => rotateTransferTicket(sId, transferId, ticketSha256),
    finalizeTransfer: (sId, transferId) => finalizeTransfer(sId, transferId),
    issueTicket: (args) => issueWorldTicket(args),
    revokeTicket: (sId, ticketSha256) => revokeWorldTicket(sId, ticketSha256),
    endpoint: async (sId, instanceId) => (await redisWorldRegistry.read(sId, instanceId).catch(() => null))?.publicAddress || WORLD_PUBLIC_WS_URL,
    now: () => Date.now(),
};

async function guard<T>(label: string, run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (error) {
        if (error instanceof RpcFault) throw error;
        console.error(`[world.enter] ${label} 基础设施失败（fail-closed）`, error);
        throw new RpcFault("WORLD_SERVICE_UNAVAILABLE", "世界服务暂不可用，请稍后重试");
    }
}

const personaInvalid = (): RpcFault => new RpcFault("WORLD_PERSONA_INVALID", "角色不可用");
const transferInvalid = (): RpcFault => new RpcFault("WORLD_TRANSFER_INVALID", "交接不可用");

async function ownedActivePersona(uid: string, sId: number, personaId: string, deps: WorldEnterDeps): Promise<PersonaOwner | null> {
    const owner = await guard("persona", () => deps.readPersonaOwner(sId, personaId));
    if (!owner || owner.userId !== uid || owner.status !== 0) return null;
    return owner;
}

/** 分线定位：指定 line 走 resolve、未指定走 MF10-B1 分配；上限 / 全满 ⇒ WORLD_LINE_UNAVAILABLE（⛔ 混进 SERVICE_UNAVAILABLE）。 */
async function locateInstance(sId: number, mapId: string, line: number | undefined, deps: WorldEnterDeps): Promise<{ readonly instanceId: string; readonly mapId: string; readonly line: number }> {
    try {
        return line === undefined ? await deps.allocateInstance(sId, mapId) : await deps.resolveInstance(sId, mapId, line);
    } catch (error) {
        if (error instanceof WorldLinesExhaustedError || error instanceof WorldLineLimitError) throw new RpcFault("WORLD_LINE_UNAVAILABLE", "分线已满或不存在");
        if (error instanceof RpcFault) throw error;
        console.error("[world.enter] directory 基础设施失败（fail-closed）", error);
        throw new RpcFault("WORLD_SERVICE_UNAVAILABLE", "世界服务暂不可用，请稍后重试");
    }
}

/** 常规进入凭据：绑定目标分线地址 + 当前 controlEpoch。 */
async function issueEntry(uid: string, sId: number, personaId: string, owner: PersonaOwner, mapId: string, line: number | undefined, deps: WorldEnterDeps): Promise<IWorldEnterRes> {
    const instance = await locateInstance(sId, mapId, line, deps);
    const worldAddress = worldAddressOf(sId, instance.mapId, instance.line);
    const issued = await guard("ticket", () => deps.issueTicket({
        sId, uid, personaId, worldAddress, controlEpoch: owner.controlEpoch, transferId: null, nowMs: deps.now(),
    }));
    const endpoint = await guard("registry", () => deps.endpoint(sId, instance.instanceId));
    return { worldAddress, mapId: instance.mapId, line: instance.line, endpoint, ticket: issued.ticket, expiresAt: issued.expiresAt, transferId: null };
}

/** Committed 交接：凭据轮换（新签 → 表登记 → 旧作废）；表登记失败（状态已变）⇒ 新凭据作废 + WORLD_TRANSFER_INVALID。 */
async function resolveCommitted(uid: string, sId: number, row: WorldTransferRow, owner: PersonaOwner, deps: WorldEnterDeps): Promise<IWorldEnterRes> {
    const worldAddress = worldAddressOf(sId, row.toMap, row.toLine);
    const issued = await guard("ticket", () => deps.issueTicket({
        sId, uid, personaId: row.personaId, worldAddress, controlEpoch: owner.controlEpoch, transferId: row.transferId, nowMs: deps.now(),
    }));
    const rotated = await guard("transfer", () => deps.rotateTransferTicket(sId, row.transferId, issued.ticketSha256));
    if (!rotated) {
        await deps.revokeTicket(sId, issued.ticketSha256).catch(() => false);
        throw transferInvalid();
    }
    if (row.ticketSha256 !== "" && row.ticketSha256 !== issued.ticketSha256) await deps.revokeTicket(sId, row.ticketSha256).catch(() => false);
    const endpoint = await guard("registry", () => deps.endpoint(sId, row.toInstance));
    return { worldAddress, mapId: row.toMap, line: row.toLine, endpoint, ticket: issued.ticket, expiresAt: issued.expiresAt, transferId: row.transferId };
}

export async function handleWorldEnter(uid: string, sId: number, req: IWorldEnterReq, deps: WorldEnterDeps = productionWorldEnterDeps): Promise<IWorldEnterRes> {
    const owner = await ownedActivePersona(uid, sId, req.personaId, deps);
    if (!owner) throw personaInvalid();
    const active = await guard("transfer", () => deps.activeTransferOf(sId, req.personaId));
    if (active) {
        if (active.state === "committed") return resolveCommitted(uid, sId, active, owner, deps);
        if (active.state === "activated") {
            // 目标房已接住却未收尾（目标房崩溃 / finalize 丢失）：懒收敛后照常进入
            await guard("transfer", () => deps.finalizeTransfer(sId, active.transferId));
        } else {
            throw new RpcFault("WORLD_TRANSFER_INVALID", "交接进行中，请稍后重试");
        }
    }
    return issueEntry(uid, sId, req.personaId, owner, req.mapId, req.line, deps);
}

export async function handleWorldResolveTransfer(uid: string, sId: number, req: IWorldResolveTransferReq, deps: WorldEnterDeps = productionWorldEnterDeps): Promise<IWorldEnterRes> {
    const row = await guard("transfer", () => deps.readTransfer(sId, req.transferId));
    if (!row) throw transferInvalid();
    const owner = await ownedActivePersona(uid, sId, row.personaId, deps);
    if (!owner) throw transferInvalid();
    if (row.state === "committed") return resolveCommitted(uid, sId, row, owner, deps);
    if (row.state === "activated" || row.state === "finalized") {
        if (row.state === "activated") await guard("transfer", () => deps.finalizeTransfer(sId, row.transferId));
        return issueEntry(uid, sId, row.personaId, owner, row.toMap, row.toLine, deps);
    }
    throw transferInvalid();
}
