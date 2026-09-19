/**
 * WorldProfile（MMO MF4-B6，docs/MMO.md §4.4 / §5.4 MF4）：world 形态玩法（manifest `kind:"world"`）的 profile 只有一个 id `"world"`——
 *  - AccessPolicy `world-ticket`：准入凭据 = `world.enter`（MF8）签发的一次性 ticket；MF4 用占位端口（下方 `placeholderWorldTicketPort`）；
 *  - ⛔ 没有 StartPolicy：世界房没有「开局」，Recovering → Active 由权威租约驱动（⛔ 不往 `StartPolicy` 加 always-on 变体）；
 *  - 与 GameRoom 的 RoomProfile 表分工：`kind:"world"` 的 mode 不进 `PROFILE_POLICIES` / `assertRoomProfilesConfigured`（那边跳过），
 *    match 形态 mode ⛔ 不得声明 `"world"` profile；evidence（GameMode capability）/ invite-code（GameRoom AccessPolicy）在结构上
 *    不可能与之组合（WorldMode 无 evidence 能力、WorldRoom 不读 RoomProfile）。
 * ⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
import { GAMEPLAY_CATALOG } from "@game/shared";

export const WORLD_PROFILE_ID = "world";

export type WorldAccessPolicy = { readonly kind: "world-ticket" };

export const WORLD_TICKET_ACCESS_POLICY: WorldAccessPolicy = Object.freeze({ kind: "world-ticket" });

export interface WorldProfile {
    readonly id: typeof WORLD_PROFILE_ID;
    readonly mode: string;
    readonly accessPolicy: WorldAccessPolicy;
}

export type WorldProfileCatalogEntry = {
    readonly profiles: readonly string[];
    readonly kind?: "match" | "world";
};

type WorldProfileCatalog = Readonly<Record<string, WorldProfileCatalogEntry>>;

function catalogEntry(catalog: WorldProfileCatalog, mode: string): WorldProfileCatalogEntry | null {
    return (catalog as Readonly<Partial<Record<string, WorldProfileCatalogEntry>>>)[mode] ?? null;
}

/**
 * 解析 world 形态的 `(mode, profileId)`：mode 必须是 `kind:"world"`、profileId 必须是 `"world"`、manifest.profiles 必须恰为 `["world"]`
 * （fail-fast；WorldRoom.onCreate 把它映射为 BadRequest）。
 */
export function resolveWorldProfile(mode: string, profileId: string, catalog: WorldProfileCatalog = GAMEPLAY_CATALOG as unknown as WorldProfileCatalog): WorldProfile {
    const entry = catalogEntry(catalog, mode);
    if (!entry) throw new Error(`[WorldProfile] 未知 mode：${mode}（不在 GAMEPLAY_CATALOG）`);
    if (entry.kind !== "world") {
        throw new Error(`[WorldProfile] mode ${mode} 不是 world 形态（manifest kind:"${entry.kind ?? "match"}"）：match 形态走 GameRoom 的 RoomProfile`);
    }
    if (profileId !== WORLD_PROFILE_ID) throw new Error(`[WorldProfile] world 形态只有 profile "${WORLD_PROFILE_ID}"，收到 "${profileId}"`);
    if (entry.profiles.length !== 1 || entry.profiles[0] !== WORLD_PROFILE_ID) {
        throw new Error(`[WorldProfile] mode ${mode} 的 manifest.profiles 必须恰为 ["${WORLD_PROFILE_ID}"]（实际 ${JSON.stringify(entry.profiles)}）`);
    }
    return { id: WORLD_PROFILE_ID, mode, accessPolicy: WORLD_TICKET_ACCESS_POLICY };
}

/**
 * 启动期全量断言（world 进程组合根 / 合体入口 + 测试直调）：每个 `kind:"world"` 的 catalog 条目都能解析；
 * match 形态的条目 ⛔ 不得声明 `"world"`（否则 GameRoom 侧的 RoomProfile 会静默跳过它）。
 */
export function assertWorldProfilesConfigured(catalog: WorldProfileCatalog = GAMEPLAY_CATALOG as unknown as WorldProfileCatalog): void {
    for (const [mode, entry] of Object.entries(catalog)) {
        if (entry.kind === "world") {
            resolveWorldProfile(mode, WORLD_PROFILE_ID, catalog);
            continue;
        }
        if (entry.profiles.includes(WORLD_PROFILE_ID)) {
            throw new Error(`[WorldProfile] match 形态 mode ${mode} 不得声明 profile "${WORLD_PROFILE_ID}"（只属 kind:"world"）`);
        }
    }
}

// ── 准入凭据端口（AccessPolicy world-ticket 的运行时半边）──────────────────────────────────────────────

/** 准入固定时序第 ⑥ 步看到的凭据声明：ticket 只以 sha256 出现（⛔ 明文不进壳 / mode / 日志）。 */
export interface WorldTicketClaim {
    readonly sId: number;
    readonly userId: string;
    readonly personaId: string;
    readonly mapId: string;
    readonly line: number;
    readonly ticketSha256: string;
}

export type WorldTicketVerdict = "ok" | "invalid";

export interface WorldTicketPort {
    verify(claim: WorldTicketClaim): Promise<WorldTicketVerdict>;
}

const SHA256_HEX = /^[0-9a-f]{64}$/u;

/**
 * MF4-B6 **占位端口**：MF8 的 WorldTicket（`kRoomTicket` 形态、一次性、绑定 persona + mapId）落地前——
 * 非生产环境接受任何 sha256 形状合法的 ticket（onAuth 已保证形状；persona 归属仍由第 ⑤ 步的存储真源把关）；
 * 生产环境 fail-closed 全部拒绝（⛔ 占位端口不得进生产：世界房在 MF8 前也没有签发入口）。
 */
export const placeholderWorldTicketPort: WorldTicketPort = {
    async verify(claim: WorldTicketClaim): Promise<WorldTicketVerdict> {
        if (process.env.NODE_ENV === "production") return "invalid";
        return SHA256_HEX.test(claim.ticketSha256) ? "ok" : "invalid";
    },
};
