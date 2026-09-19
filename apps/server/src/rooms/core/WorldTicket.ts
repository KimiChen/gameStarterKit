/**
 * WorldTicket（MMO MF8-B2，docs/MMO.md §5.4 MF8）：世界房一次性准入凭据。复用 kRoomTicket 形态——Redis STRING JSON 记录、PX=exp、
 * 键 = ticket 的 sha256（原文只给客户端，⛔ 不落库、不进日志、不进 mode），绑定 (uid, personaId, worldAddress, controlEpoch)；
 * 首次进世界（`world.enter`）与交接（transfer commit / `world.resolveTransfer`）签发同一形态。
 *  - claim：Lua CAS issued → pending(session)，同一原子段校验全部绑定（sId / uid / personaId / worldAddress / controlEpoch）；
 *    同会话重放 ok（准入重验后重试）、他会话 pending / seated 一律拒；
 *  - release：pending(session) → issued（准入后续步骤失败，原 exp 内可重试；best-effort，失败由 TTL 收敛）；
 *  - seat：pending(session) → seated（落座，之后重放一律被拒）。
 * `MemoryWorldTicketPort` 是壳测试的同语义内存实现（与 Redis 端口跑同一剧本对拍，见 test/int/world-ticket.test.ts）；生产 `redisWorldTicketPort`。
 * ⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
import { createHash, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import { WORLD_TICKET_TTL_MS } from "../../core/infra/config";
import { kWorldTicket } from "../../core/infra/keys";
import { coordClient } from "../../core/infra/redisRoute";
import { defineScript, evalshaWithReload } from "../../core/infra/redisScripts";
import { TICKET_TRANSITION } from "../../core/rooms/invite/redisScripts";

export const newWorldTicket = (): string => randomBytes(32).toString("base64url");
/** 服务端只按 sha256 寻址 / 存储 ticket（原文不落 Redis key、不进日志）。 */
export const worldTicketHash = (ticket: string): string => createHash("sha256").update(ticket, "utf8").digest("hex");
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const newJti = (): string => randomBytes(16).toString("hex");

export interface WorldTicketBinding {
    readonly sId: number;
    readonly uid: string;
    readonly personaId: string;
    /** `worldAddressOf(sId, mapId, line)`：凭据只对这一条分线有效。 */
    readonly worldAddress: string;
    /** 签发时 persona 的 control_epoch：准入第 ⑤ 步读到的存储值必须相等（别处已取控制权 ⇒ mismatch）。 */
    readonly controlEpoch: number;
    /** 交接签发时带 transferId（目标房据此 activate）；首次进世界 null。 */
    readonly transferId: string | null;
}

export interface IssueWorldTicketArgs extends WorldTicketBinding {
    readonly nowMs: number;
    readonly ttlMs?: number;
}

export interface IssuedWorldTicket {
    readonly ticket: string;
    readonly ticketSha256: string;
    readonly expiresAt: number;
}

export type WorldTicketRefusal = "missing" | "invalid" | "mismatch" | "pending" | "seated";
const REFUSALS: ReadonlySet<string> = new Set(["missing", "invalid", "mismatch", "pending", "seated"]);

export type WorldTicketClaimOutcome =
    | { readonly kind: "ok"; readonly transferId: string | null }
    | { readonly kind: "refused"; readonly reason: WorldTicketRefusal };

export interface WorldTicketClaimRequest {
    readonly sId: number;
    readonly session: string;
    readonly uid: string;
    readonly personaId: string;
    readonly worldAddress: string;
    readonly controlEpoch: number;
    readonly ticketSha256: string;
}

/** 世界房准入用的凭据端口（MF8-B3 的固定时序第 ⑥ 步 claim、失败 release、落座 seat）。 */
export interface WorldTicketClaimPort {
    claim(request: WorldTicketClaimRequest): Promise<WorldTicketClaimOutcome>;
    release(sId: number, ticketSha256: string, session: string): Promise<void>;
    seat(sId: number, ticketSha256: string, session: string): Promise<void>;
}

/**
 * 原子 claim：issued → pending(session)，同一原子段校验全部绑定。
 * KEYS=[kWorldTicket]  ARGV=[session, sId, uid, personaId, worldAddress, controlEpoch]
 * 返回 ['ok', transferId|''] | ['pending', session] | ['seated'] | ['missing'|'invalid'|'mismatch']
 */
export const WORLD_TICKET_CLAIM = defineScript("worldTicketClaim", `
local cur = redis.call('GET', KEYS[1])
if cur == false then return { 'missing' } end
local ok, rec = pcall(cjson.decode, cur)
if not ok or type(rec) ~= 'table' or rec.v ~= 1 or rec.purpose ~= 'world' then return { 'invalid' } end
if tostring(rec.sId) ~= ARGV[2] or tostring(rec.uid) ~= ARGV[3] or tostring(rec.personaId) ~= ARGV[4]
  or tostring(rec.worldAddress) ~= ARGV[5] or tostring(rec.controlEpoch) ~= ARGV[6] then
  return { 'mismatch' }
end
if rec.state == 'seated' then return { 'seated' } end
if rec.state == 'pending' then
  if tostring(rec.session) == ARGV[1] then return { 'ok', tostring(rec.transferId) } end
  return { 'pending', tostring(rec.session) }
end
if rec.state ~= 'issued' then return { 'invalid' } end
rec.state = 'pending'
rec.session = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(rec), 'KEEPTTL')
return { 'ok', tostring(rec.transferId) }
`);

function assertSha256(value: string): void {
    if (!SHA256_HEX.test(value)) throw new RangeError("[WorldTicket] ticketSha256 必须是 64 位小写 hex");
}

/** 签发：记录按 sha256 寻址、PX=ttl；SET NX（撞记录 = 不可能事件，直接 throw）。 */
export async function issueWorldTicket(args: IssueWorldTicketArgs, client: Redis = coordClient()): Promise<IssuedWorldTicket> {
    const ttlMs = args.ttlMs ?? WORLD_TICKET_TTL_MS;
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new RangeError("[WorldTicket] ttlMs 必须是 ≥1 的整数");
    const ticket = newWorldTicket();
    const ticketSha256 = worldTicketHash(ticket);
    const expiresAt = args.nowMs + ttlMs;
    const record = JSON.stringify({
        v: 1, purpose: "world", state: "issued",
        uid: args.uid, sId: args.sId, personaId: args.personaId, worldAddress: args.worldAddress, controlEpoch: args.controlEpoch,
        transferId: args.transferId ?? "", jti: newJti(), exp: expiresAt,
    });
    const reply = await client.set(kWorldTicket(args.sId, ticketSha256), record, "PX", ttlMs, "NX");
    if (reply !== "OK") throw new Error("worldTicket 撞 sha256 记录（不可能事件）");
    return { ticket, ticketSha256, expiresAt };
}

/** 作废（交接凭据轮换 / 取消）：DEL；不存在 ⇒ false。 */
export async function revokeWorldTicket(sId: number, ticketSha256: string, client: Redis = coordClient()): Promise<boolean> {
    assertSha256(ticketSha256);
    return (await client.del(kWorldTicket(sId, ticketSha256))) === 1;
}

/** 生产端口：coord 客户端上的 Lua CAS。 */
export function redisWorldTicketPort(clientOf: () => Redis = coordClient): WorldTicketClaimPort {
    return {
        async claim(request) {
            assertSha256(request.ticketSha256);
            const reply = await evalshaWithReload(clientOf(), WORLD_TICKET_CLAIM, [kWorldTicket(request.sId, request.ticketSha256)], [
                request.session, String(request.sId), request.uid, request.personaId, request.worldAddress, String(request.controlEpoch),
            ]);
            if (!Array.isArray(reply) || typeof reply[0] !== "string") throw new Error("worldTicketClaim 回包形状非法");
            if (reply[0] === "ok") {
                const transferId = typeof reply[1] === "string" && reply[1].length > 0 ? reply[1] : null;
                return { kind: "ok", transferId };
            }
            return { kind: "refused", reason: REFUSALS.has(reply[0]) ? (reply[0] as WorldTicketRefusal) : "invalid" };
        },
        async release(sId, ticketSha256, session) {
            assertSha256(ticketSha256);
            try {
                await evalshaWithReload(clientOf(), TICKET_TRANSITION, [kWorldTicket(sId, ticketSha256)], ["pending", session, "issued"]);
            } catch {
                // best-effort：失败由记录 TTL 收敛（pending 无法被他人 claim，损失有界）。
            }
        },
        async seat(sId, ticketSha256, session) {
            assertSha256(ticketSha256);
            const reply = await evalshaWithReload(clientOf(), TICKET_TRANSITION, [kWorldTicket(sId, ticketSha256)], ["pending", session, "seated"]);
            if (reply !== "ok") throw new Error(`worldTicket seat 失败：${String(reply)}`);
        },
    };
}

interface MemoryWorldTicketRecord {
    readonly binding: WorldTicketBinding;
    state: "issued" | "pending" | "seated";
    session: string | null;
    readonly exp: number;
}

/** 内存端口（壳单测 / 夹具）：与 Lua 同语义（绑定校验 → seated / pending / issued 三态），过期按注入时钟。 */
export class MemoryWorldTicketPort implements WorldTicketClaimPort {
    readonly records = new Map<string, MemoryWorldTicketRecord>();
    readonly log: string[] = [];

    constructor(private readonly now: () => number = () => Date.now()) {}

    issue(args: IssueWorldTicketArgs): IssuedWorldTicket {
        const ttlMs = args.ttlMs ?? WORLD_TICKET_TTL_MS;
        const ticket = newWorldTicket();
        const ticketSha256 = worldTicketHash(ticket);
        const { nowMs: _now, ttlMs: _ttl, ...binding } = args;
        this.records.set(`${args.sId}:${ticketSha256}`, { binding, state: "issued", session: null, exp: args.nowMs + ttlMs });
        return { ticket, ticketSha256, expiresAt: args.nowMs + ttlMs };
    }

    private live(sId: number, ticketSha256: string): MemoryWorldTicketRecord | null {
        const key = `${sId}:${ticketSha256}`;
        const record = this.records.get(key);
        if (!record) return null;
        if (record.exp <= this.now()) {
            this.records.delete(key);
            return null;
        }
        return record;
    }

    async claim(request: WorldTicketClaimRequest): Promise<WorldTicketClaimOutcome> {
        assertSha256(request.ticketSha256);
        const record = this.live(request.sId, request.ticketSha256);
        if (!record) return { kind: "refused", reason: "missing" };
        const b = record.binding;
        if (b.sId !== request.sId || b.uid !== request.uid || b.personaId !== request.personaId
            || b.worldAddress !== request.worldAddress || b.controlEpoch !== request.controlEpoch) {
            return { kind: "refused", reason: "mismatch" };
        }
        if (record.state === "seated") return { kind: "refused", reason: "seated" };
        if (record.state === "pending") {
            if (record.session === request.session) return { kind: "ok", transferId: b.transferId };
            return { kind: "refused", reason: "pending" };
        }
        record.state = "pending";
        record.session = request.session;
        this.log.push(`claim:${request.ticketSha256.slice(0, 8)}:${request.session}`);
        return { kind: "ok", transferId: b.transferId };
    }

    async release(sId: number, ticketSha256: string, session: string): Promise<void> {
        const record = this.live(sId, ticketSha256);
        if (record && record.state === "pending" && record.session === session) {
            record.state = "issued";
            record.session = null;
            this.log.push(`release:${ticketSha256.slice(0, 8)}:${session}`);
        }
    }

    async seat(sId: number, ticketSha256: string, session: string): Promise<void> {
        const record = this.live(sId, ticketSha256);
        if (!record || record.state !== "pending" || record.session !== session) throw new Error("worldTicket seat 失败（内存端口）");
        record.state = "seated";
        this.log.push(`seat:${ticketSha256.slice(0, 8)}:${session}`);
    }
}
