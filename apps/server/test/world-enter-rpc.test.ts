/**
 * MMO MF8-B4 / MF10-B1 world.enter / world.resolveTransfer 领域逻辑（假依赖）：未指定 line 走分配、指定 line 走 resolve、上限 / 全满 ⇒ WORLD_LINE_UNAVAILABLE；归属真源、在途交接分支（Committed ⇒ 解析 + 凭据轮换；activated ⇒ 懒 finalize；
 * requested / prepared ⇒ 拒）、常规签发绑定 (uid, persona, worldAddress, 当前 controlEpoch)、resolveTransfer 不泄露归属、基础设施失败 fail-closed、
 * 表登记失败 ⇒ 新凭据作废。生成物：registry 含 world 域两条 query 路由 + 三个错误码 + push world.transfer。
 * 变异验证：enter 删 owner.userId 比较 →「非本账号」转红；resolveCommitted 删 rotate 失败分支 →「登记失败作废」转红；
 * enter 的 activated 分支不 finalize →「懒收敛」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { LOBBY_RPC_DOMAINS, LOBBY_RPC_ROUTE_MODES, LobbyPush, PUSH_RUNTIME_VALIDATORS, validateLobbyRpcRequest } from "@game/shared";
import { RpcFault, WorldLineLimitError, WorldLinesExhaustedError } from "../src/core/errors";
import { handleWorldEnter, handleWorldResolveTransfer, type WorldEnterDeps } from "../src/core/world/enterRpc";
import type { WorldTransferRow } from "../src/rooms/core/transfer";

const P_A = "p_alice_0000000001";
const SHA = (c: string): string => c.repeat(64);

function fakeDeps(over: Partial<WorldEnterDeps> & { rows?: WorldTransferRow[]; epoch?: number } = {}) {
    const issued: Array<Parameters<WorldEnterDeps["issueTicket"]>[0]> = [];
    const revoked: string[] = [];
    const rotated: Array<[string, string]> = [];
    const finalized: string[] = [];
    let counter = 0;
    const rows = new Map((over.rows ?? []).map((row) => [row.transferId, row]));
    const deps: WorldEnterDeps = {
        readPersonaOwner: async (_sId, personaId) => (personaId === P_A ? { userId: "u-alice", status: 0, controlEpoch: over.epoch ?? 3, worldAddress: null } : null),
        resolveInstance: async (_sId, mapId, line) => ({ instanceId: `wi_${mapId}_${line}`, mapId, line }),
        activeTransferOf: async (_sId, personaId) => [...rows.values()].find((row) => row.personaId === personaId && row.active) ?? null,
        readTransfer: async (_sId, transferId) => rows.get(transferId) ?? null,
        rotateTransferTicket: async (_sId, transferId, sha) => { rotated.push([transferId, sha]); const row = rows.get(transferId); if (row && row.state === "committed") { rows.set(transferId, { ...row, ticketSha256: sha }); return true; } return false; },
        finalizeTransfer: async (_sId, transferId) => { finalized.push(transferId); const row = rows.get(transferId); if (row) rows.set(transferId, { ...row, state: "finalized", active: false }); },
        cancelStaleTransfer: async (_sId, row, nowMs) => {
            const stale = row.state === "prepared" ? row.reserveExpiresAt !== null && row.reserveExpiresAt < nowMs : row.state === "requested" && row.createdAt + 30_000 < nowMs;
            if (stale) rows.set(row.transferId, { ...row, state: "cancelled", active: false });
            return stale;
        },
        issueTicket: async (args) => { issued.push(args); counter += 1; return { ticket: `ticket-${counter}-${"x".repeat(40)}`, ticketSha256: SHA(String(counter % 10)), expiresAt: args.nowMs + 30_000 }; },
        revokeTicket: async (_sId, sha) => { revoked.push(sha); return true; },
        allocateInstance: async (_sId, mapId) => ({ instanceId: `wi_${mapId}_alloc`, mapId, line: 7 }),
        endpoint: async () => "wss://world.example.com",
        now: () => 1_000,
        ...over,
    };
    return { deps, issued, revoked, rotated, finalized, rows };
}
const row = (over: Partial<WorldTransferRow> = {}): WorldTransferRow => ({
    transferId: "wt_1", personaId: P_A, fromInstance: "wi_m1_0", toMap: "m2", toLine: 0, toInstance: "wi_m2_0", state: "committed", controlEpoch: 3,
    ticketSha256: SHA("a"), reserveExpiresAt: null, payload: null, active: true, createdAt: 0, ...over,
});
const faultCode = (code: string) => (error: unknown): boolean => error instanceof RpcFault && error.rpcCode === code;

test("生成物：world 域两条 query 路由、三个错误码、push world.transfer；请求 validator exact", () => {
    assert.ok(LOBBY_RPC_DOMAINS.includes("world"));
    assert.equal(LOBBY_RPC_ROUTE_MODES["world.enter"], "query");
    assert.equal(LOBBY_RPC_ROUTE_MODES["world.resolveTransfer"], "query");
    assert.equal(LobbyPush.WorldTransfer, "world.transfer");
    assert.deepEqual(PUSH_RUNTIME_VALIDATORS["world.transfer"]({ transferId: "wt_1", personaId: P_A }), { transferId: "wt_1", personaId: P_A });
    assert.deepEqual(validateLobbyRpcRequest("world.enter", { personaId: P_A, mapId: "m1", line: 2 }), { personaId: P_A, mapId: "m1", line: 2 });
    assert.throws(() => validateLobbyRpcRequest("world.enter", { personaId: P_A, mapId: "m 1" }));
    assert.throws(() => validateLobbyRpcRequest("world.enter", { personaId: P_A, mapId: "m1", ticket: "x" }));
    assert.throws(() => validateLobbyRpcRequest("world.resolveTransfer", { transferId: "" }));
});

test("enter：归属真源（不存在 / 非本账号 / 非 active ⇒ WORLD_PERSONA_INVALID）；常规签发绑定 (uid, persona, worldAddress, controlEpoch)", async () => {
    const f = fakeDeps();
    await assert.rejects(handleWorldEnter("u-alice", 0, { personaId: "p_missing_00000000", mapId: "m1" }, f.deps), faultCode("WORLD_PERSONA_INVALID"));
    await assert.rejects(handleWorldEnter("u-mallory", 0, { personaId: P_A, mapId: "m1" }, f.deps), faultCode("WORLD_PERSONA_INVALID"), "非本账号");
    const inactive = fakeDeps({ readPersonaOwner: async () => ({ userId: "u-alice", status: 1, controlEpoch: 3, worldAddress: null }) });
    await assert.rejects(handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m1" }, inactive.deps), faultCode("WORLD_PERSONA_INVALID"), "inactive");
    assert.equal(f.issued.length, 0, "拒绝在签发之前");
    const res = await handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m1", line: 2 }, f.deps);
    assert.deepEqual([res.worldAddress, res.mapId, res.line, res.endpoint, res.transferId, res.expiresAt], ["s0/m1/2", "m1", 2, "wss://world.example.com", null, 31_000]);
    assert.deepEqual(f.issued, [{ sId: 0, uid: "u-alice", personaId: P_A, worldAddress: "s0/m1/2", controlEpoch: 3, transferId: null, nowMs: 1_000 }]);
    assert.ok(res.ticket.startsWith("ticket-1-"));
    const allocated = await handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m1" }, f.deps);
    assert.deepEqual([allocated.line, allocated.worldAddress], [7, "s0/m1/7"], "未指定 line ⇒ MF10-B1 分配（满员开新线）");
    // MF10-B1：指定 line 越界 / 全满到上限 ⇒ WORLD_LINE_UNAVAILABLE（⛔ 混进 SERVICE_UNAVAILABLE）
    const limited = fakeDeps({
        resolveInstance: async (_sId, mapId, line) => { throw new WorldLineLimitError(mapId, line, 8); },
        allocateInstance: async (_sId, mapId) => { throw new WorldLinesExhaustedError(mapId, 8); },
    });
    await assert.rejects(handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m1", line: 9 }, limited.deps), faultCode("WORLD_LINE_UNAVAILABLE"), "指定 line 越界");
    await assert.rejects(handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m1" }, limited.deps), faultCode("WORLD_LINE_UNAVAILABLE"), "全满且到上限");
    assert.equal(limited.issued.length, 0, "分线拒绝在签发之前");
});

test("enter：Committed 交接 ⇒ 解析交接（目标 = 交接目标、凭据轮换、旧凭据作废）；activated ⇒ 懒 finalize 后照常；requested ⇒ 拒；登记失败 ⇒ 新凭据作废", async () => {
    const committed = fakeDeps({ rows: [row()], epoch: 5 });
    const res = await handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m9" }, committed.deps);
    assert.deepEqual([res.worldAddress, res.mapId, res.transferId], ["s0/m2/0", "m2", "wt_1"], "⛔ 绕开交接去 m9");
    assert.deepEqual(committed.issued[0], { sId: 0, uid: "u-alice", personaId: P_A, worldAddress: "s0/m2/0", controlEpoch: 5, transferId: "wt_1", nowMs: 1_000 }, "绑定当前 controlEpoch + transferId");
    assert.deepEqual(committed.rotated, [["wt_1", SHA("1")]], "表登记新 sha");
    assert.deepEqual(committed.revoked, [SHA("a")], "旧凭据作废");
    const activated = fakeDeps({ rows: [row({ state: "activated" })] });
    const res2 = await handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m1" }, activated.deps);
    assert.deepEqual([activated.finalized, res2.mapId, res2.transferId], [["wt_1"], "m1", null], "懒收敛后照常进入");
    const requested = fakeDeps({ rows: [row({ state: "requested", createdAt: 1_000 })] });
    await assert.rejects(handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m1" }, requested.deps), faultCode("WORLD_TRANSFER_INVALID"), "真在途（未陈旧）⇒ 拒");
    // MF11 R2-01：源房崩溃遗留的陈旧 Committed 前行 ⇒ 懒清后照常进入
    const staleRequested = fakeDeps({ rows: [row({ state: "requested", createdAt: -100_000 })] });
    const healed = await handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m1" }, staleRequested.deps);
    assert.deepEqual([healed.transferId, staleRequested.rows.get("wt_1")?.state], [null, "cancelled"], "陈旧 requested ⇒ cancelled 后普通进入");
    const stalePrepared = fakeDeps({ rows: [row({ state: "prepared", reserveExpiresAt: 500 })] });
    assert.equal((await handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m1" }, stalePrepared.deps)).transferId, null, "预留到期 prepared ⇒ 懒清");
    const raced = fakeDeps({ rows: [row()], rotateTransferTicket: async () => false });
    await assert.rejects(handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m2" }, raced.deps), faultCode("WORLD_TRANSFER_INVALID"));
    assert.deepEqual(raced.revoked, [SHA("1")], "登记失败 ⇒ 刚签的凭据作废");
});

test("resolveTransfer：不存在 / 非本账号一律 WORLD_TRANSFER_INVALID；Committed ⇒ 轮换；activated / finalized ⇒ 目标分线普通凭据（重连）；cancelled ⇒ 拒；基础设施失败 ⇒ WORLD_SERVICE_UNAVAILABLE", async () => {
    const f = fakeDeps({ rows: [row(), row({ transferId: "wt_done", state: "finalized", active: false }), row({ transferId: "wt_act", state: "activated" }), row({ transferId: "wt_cancel", state: "cancelled", active: false })] });
    await assert.rejects(handleWorldResolveTransfer("u-alice", 0, { transferId: "wt_missing" }, f.deps), faultCode("WORLD_TRANSFER_INVALID"));
    await assert.rejects(handleWorldResolveTransfer("u-mallory", 0, { transferId: "wt_1" }, f.deps), faultCode("WORLD_TRANSFER_INVALID"), "非本账号同码，⛔ 泄露");
    const res = await handleWorldResolveTransfer("u-alice", 0, { transferId: "wt_1" }, f.deps);
    assert.deepEqual([res.transferId, res.worldAddress, f.rotated.length], ["wt_1", "s0/m2/0", 1]);
    const done = await handleWorldResolveTransfer("u-alice", 0, { transferId: "wt_done" }, f.deps);
    assert.deepEqual([done.transferId, done.mapId], [null, "m2"], "已到达 ⇒ 目标分线普通凭据");
    const act = await handleWorldResolveTransfer("u-alice", 0, { transferId: "wt_act" }, f.deps);
    assert.deepEqual([act.transferId, f.finalized], [null, ["wt_act"]], "activated ⇒ 懒 finalize");
    await assert.rejects(handleWorldResolveTransfer("u-alice", 0, { transferId: "wt_cancel" }, f.deps), faultCode("WORLD_TRANSFER_INVALID"));
    const broken = fakeDeps({ readTransfer: async () => { throw new Error("mysql down"); } });
    await assert.rejects(handleWorldResolveTransfer("u-alice", 0, { transferId: "wt_1" }, broken.deps), faultCode("WORLD_SERVICE_UNAVAILABLE"));
    const brokenEnter = fakeDeps({ issueTicket: async () => { throw new Error("redis down"); } });
    await assert.rejects(handleWorldEnter("u-alice", 0, { personaId: P_A, mapId: "m1" }, brokenEnter.deps), faultCode("WORLD_SERVICE_UNAVAILABLE"));
});
