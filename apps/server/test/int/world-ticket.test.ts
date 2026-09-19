/**
 * MMO MF8-B2 WorldTicket 真 Redis 回归（docs/MMO.md §5.4 MF8「一次性、短时、绑定 (uid, personaId, worldAddress, controlEpoch)，claim 为 Lua CAS」）：
 * 同一剧本对 Redis 端口与内存端口各跑一遍（两端口语义对拍）：绑定任一分量不符 ⇒ mismatch；claim ok 后同会话重放 ok、他会话 pending；
 * release 后他会话可 claim；seat 后一律 seated（二次使用被拒）；未知 / 过期 ⇒ missing；首次进世界（transferId null）。
 * 变异验证：WORLD_TICKET_CLAIM 删 controlEpoch 比较 → 「绑定 controlEpoch」转红；seat 后不改 state → 「二次使用被拒」转红。
 */
import "./env-setup"; // 必须第一个 import
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { kWorldTicket } from "../../src/core/infra/keys";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import {
    MemoryWorldTicketPort, issueWorldTicket, redisWorldTicketPort, revokeWorldTicket, type IssueWorldTicketArgs, type IssuedWorldTicket,
    type WorldTicketClaimPort,
} from "../../src/rooms/core/WorldTicket";
import { assertRedisUp, sleep } from "./helpers";

const S_ID = 0;
const shas: string[] = [];

after(async () => {
    for (const sha of shas) await coordClient().del(kWorldTicket(S_ID, sha));
    await closeRedis();
});

async function scenario(label: string, port: WorldTicketClaimPort, issue: (args: IssueWorldTicketArgs) => Promise<IssuedWorldTicket>): Promise<void> {
    const binding = { sId: S_ID, uid: "u-ticket", personaId: "p_ticket_0000000001", worldAddress: "s0/m1/0", controlEpoch: 3, transferId: "wt_x" };
    const issued = await issue({ ...binding, nowMs: Date.now() });
    assert.match(issued.ticketSha256, /^[0-9a-f]{64}$/u);
    assert.ok(issued.ticket.length >= 40 && !issued.ticket.includes(issued.ticketSha256), `${label}：原文 ≠ sha`);
    const claim = (session: string, over: Partial<Parameters<WorldTicketClaimPort["claim"]>[0]> = {}) => port.claim({
        sId: S_ID, session, uid: binding.uid, personaId: binding.personaId, worldAddress: binding.worldAddress, controlEpoch: binding.controlEpoch,
        ticketSha256: issued.ticketSha256, ...over,
    });
    assert.deepEqual(await claim("sa", { controlEpoch: 4 }), { kind: "refused", reason: "mismatch" }, `${label}：绑定 controlEpoch`);
    assert.deepEqual(await claim("sa", { uid: "u-other" }), { kind: "refused", reason: "mismatch" }, `${label}：绑定 uid`);
    assert.deepEqual(await claim("sa", { personaId: "p_other_00000000001" }), { kind: "refused", reason: "mismatch" }, `${label}：绑定 persona`);
    assert.deepEqual(await claim("sa", { worldAddress: "s0/m2/0" }), { kind: "refused", reason: "mismatch" }, `${label}：绑定 worldAddress`);
    assert.deepEqual(await claim("sa"), { kind: "ok", transferId: "wt_x" }, `${label}：claim ok 带 transferId`);
    assert.deepEqual(await claim("sa"), { kind: "ok", transferId: "wt_x" }, `${label}：同会话重放 ok`);
    assert.deepEqual(await claim("sb"), { kind: "refused", reason: "pending" }, `${label}：他会话 pending`);
    await port.release(S_ID, issued.ticketSha256, "sb");
    assert.deepEqual(await claim("sb"), { kind: "refused", reason: "pending" }, `${label}：非持有者 release 无效`);
    await port.release(S_ID, issued.ticketSha256, "sa");
    assert.deepEqual(await claim("sb"), { kind: "ok", transferId: "wt_x" }, `${label}：release 后他会话可 claim`);
    await assert.rejects(port.seat(S_ID, issued.ticketSha256, "sa"), /seat 失败/u, `${label}：非持有者不能 seat`);
    await port.seat(S_ID, issued.ticketSha256, "sb");
    assert.deepEqual(await claim("sb"), { kind: "refused", reason: "seated" }, `${label}：二次使用被拒（同会话）`);
    assert.deepEqual(await claim("sa"), { kind: "refused", reason: "seated" }, `${label}：二次使用被拒（他会话）`);
    await port.release(S_ID, issued.ticketSha256, "sb");
    assert.deepEqual(await claim("sb"), { kind: "refused", reason: "seated" }, `${label}：seated ⛔ 回退`);
    assert.deepEqual(await claim("sc", { ticketSha256: "0".repeat(64) }), { kind: "refused", reason: "missing" }, `${label}：未知凭据`);
    const first = await issue({ ...binding, transferId: null, nowMs: Date.now() });
    assert.deepEqual(await claim("sd", { ticketSha256: first.ticketSha256 }), { kind: "ok", transferId: null }, `${label}：首次进世界无 transferId`);
    const short = await issue({ ...binding, nowMs: Date.now(), ttlMs: 200 });
    await sleep(350);
    assert.deepEqual(await claim("se", { ticketSha256: short.ticketSha256 }), { kind: "refused", reason: "missing" }, `${label}：过期即失效`);
}

test("Redis 端口：Lua CAS 绑定 / 三态 / 一次性 / TTL；revoke 作废", async () => {
    await assertRedisUp();
    const issue = async (args: IssueWorldTicketArgs): Promise<IssuedWorldTicket> => {
        const issued = await issueWorldTicket(args);
        shas.push(issued.ticketSha256);
        return issued;
    };
    await scenario("redis", redisWorldTicketPort(), issue);
    const revoked = await issue({ sId: S_ID, uid: "u-ticket", personaId: "p_ticket_0000000001", worldAddress: "s0/m1/0", controlEpoch: 1, transferId: null, nowMs: Date.now() });
    assert.equal(await revokeWorldTicket(S_ID, revoked.ticketSha256), true);
    assert.equal(await revokeWorldTicket(S_ID, revoked.ticketSha256), false);
    assert.deepEqual(await redisWorldTicketPort().claim({
        sId: S_ID, session: "sf", uid: "u-ticket", personaId: "p_ticket_0000000001", worldAddress: "s0/m1/0", controlEpoch: 1, ticketSha256: revoked.ticketSha256,
    }), { kind: "refused", reason: "missing" }, "作废后 missing");
});

test("内存端口：与 Redis 端口同一剧本", async () => {
    const memory = new MemoryWorldTicketPort();
    await scenario("memory", memory, async (args) => memory.issue(args));
    assert.ok(memory.log.some((line) => line.startsWith("seat:")));
});
