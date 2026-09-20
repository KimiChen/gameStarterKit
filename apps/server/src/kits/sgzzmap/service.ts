/** SQL 权威 sgzzmap 的唯一写入口；RPC 与未来视图房/worker 均调用 api/ 门面。 */
import {
    sgzzCellOf, sgzzDecodeCell, sgzzInBounds, sgzzIsPassable, sgzzNeighbourTable, type ISgzzRect,
} from "@game/shared/kits/sgzzmap/api/hexmap/index";
import {
    applySgzzTileAbandon, applySgzzTileAction, sgzzEmptyTile, sgzzOccupyRefusal,
    type ISgzzTile, type ISgzzViewer,
} from "@game/shared/kits/sgzzmap/api/territory/index";
import {
    SgzzAllianceRole, sgzzAllianceRefusal, type ISgzzAlliance, type ISgzzMembership,
} from "@game/shared/kits/sgzzmap/api/alliance/index";
import {
    validateSgzzAbandonRes, validateSgzzAllianceRes, validateSgzzOccupyRes, validateSgzzTileRes,
    validateSgzzViewRes, type ISgzzAllianceReq, type ISgzzAllianceRes,
    type ISgzzAbandonRes, type ISgzzOccupyRes, type ISgzzOwnerRef, type ISgzzTileRef,
    type ISgzzTileRes, type ISgzzViewerWire, type ISgzzViewRes,
} from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import { RpcFault, kitOpId, retryKitTransaction, withKitTx, type KitTx } from "../../core/infra/kitApi";
import { linksOf } from "./content/links";
import { terrainOf, SGZZMAP_DEFAULT_MAP_ID } from "./content/terrain";
import { createSqlSgzzRepository, type SgzzHolding, type SgzzReceiptKind, type SgzzRepository } from "./repository";

export const SGZZMAP_KIT_ID = "sgzzmap";

/** hash / version 必须来自 dispatcher 的 ctx.operation。 */
export interface SgzzOperation {
    readonly opId: string;
    readonly hash: string;
    readonly contractVersion: number;
}
export type SgzzTxRunner = <T>(sId: number, fn: (tx: KitTx) => Promise<T>) => Promise<T>;
export interface SgzzApiDeps {
    readonly run: SgzzTxRunner;
    readonly repository: (tx: KitTx, sId: number) => SgzzRepository;
    readonly now: () => number;
    readonly mapId: string;
}
interface WorldTx { readonly tx: KitTx; readonly repo: SgzzRepository; readonly now: number }

const DEFAULT_DEPS: SgzzApiDeps = {
    run: (sId, fn) => withKitTx(SGZZMAP_KIT_ID, sId, fn),
    repository: createSqlSgzzRepository,
    now: Date.now,
    mapId: SGZZMAP_DEFAULT_MAP_ID,
};

export function sgzzOperation(
    uid: string, sId: number, operation: "occupy" | "abandon" | "alliance", clientReqId: string,
    binding: { readonly hash: string; readonly contractVersion: number } | undefined,
): SgzzOperation {
    if (!binding) throw new Error("SGZZMAP 幂等写缺少框架 operation binding");
    return { opId: kitOpId(SGZZMAP_KIT_ID, uid, sId, operation, clientReqId), ...binding };
}
function assertIdentity(uid: string, op?: SgzzOperation): void {
    if (!uid || uid.length > 32) throw new RangeError("SGZZMAP uid 非法");
    if (op && (!op.opId || op.opId.length > 64 || !/^[a-f0-9]{64}$/u.test(op.hash)
        || !Number.isSafeInteger(op.contractVersion) || op.contractVersion < 1)) {
        throw new RangeError("SGZZMAP operation 非法");
    }
}

/** 出生区：v1 取地图中心的一块方形，且只在「零地块」时用得上。 */
export const SGZZ_SPAWN_CENTER_ROW = 750;
export const SGZZ_SPAWN_CENTER_COL = 750;
export const SGZZ_SPAWN_RADIUS = 120;
export function sgzzInSpawnRegion(row: number, col: number): boolean {
    return Math.abs(row - SGZZ_SPAWN_CENTER_ROW) <= SGZZ_SPAWN_RADIUS
        && Math.abs(col - SGZZ_SPAWN_CENTER_COL) <= SGZZ_SPAWN_RADIUS;
}

export function createSgzzApi(overrides: Partial<SgzzApiDeps> = {}) {
    const deps = { ...DEFAULT_DEPS, ...overrides };

    /** revision 行锁持有至 COMMIT；序号、业务、回执同事务。 */
    async function world<T>(sId: number, fn: (ctx: WorldTx) => Promise<T>): Promise<T> {
        return retryKitTransaction(() => deps.run(sId, async (tx) => {
            const repo = deps.repository(tx, sId);
            await repo.lockRevision();
            const now = deps.now();
            if (!Number.isSafeInteger(now) || now < 0) throw new RangeError("SGZZMAP server clock 非法");
            return fn({ tx, repo, now });
        }));
    }

    /**
     * 观察者上下文。membership 是同盟归属的**权威**，holding.alliance_id 只是缓存。
     * ⚠ friendAids 恒空：v1 没有外交系统，⛔ 不要在这里凭空造友盟。
     */
    async function readViewer(ctx: WorldTx, holding: SgzzHolding):
        Promise<{ viewer: ISgzzViewer; membership: ISgzzMembership | null; alliance: ISgzzAlliance | null }> {
        const membership = await ctx.repo.readMembershipForUpdate(holding.uid);
        const alliance = membership ? await ctx.repo.readAllianceForUpdate(membership.allianceId) : null;
        return {
            viewer: {
                uid: holding.uid,
                aid: membership?.allianceId ?? "",
                leaderUid: alliance?.leaderUid ?? "",
                friendAids: [],
            },
            membership, alliance,
        };
    }
    function viewerWire(v: ISgzzViewer): ISgzzViewerWire {
        return { uid: v.uid, aid: v.aid, leaderUid: v.leaderUid, friendAids: [...v.friendAids] };
    }

    /**
     * 目标格的连地候选：六邻 ∪ 长程邻接（关隘/渡口），裁边界、去重、按 cell 升序。
     * ⚠ 升序就是锁序 —— 与目标格一起排序后再 FOR UPDATE，⛔ 否则并发占领必死锁。
     */
    function neighbourCells(cell: number): number[] {
        const { row, col } = sgzzDecodeCell(cell);
        const out = new Set<number>();
        for (const [dr, dc] of sgzzNeighbourTable(row)) {
            const r = row + dr, c = col + dc;
            if (sgzzInBounds(r, c)) out.add(sgzzCellOf(r, c));
        }
        for (const linked of linksOf(deps.mapId).get(cell) ?? []) out.add(linked);
        out.delete(cell);
        return [...out].sort((a, b) => a - b);
    }

    async function mutate<T>(uid: string, sId: number, kind: SgzzReceiptKind, op: SgzzOperation,
                             validate: (raw: unknown) => T,
                             run: (ctx: WorldTx, holding: SgzzHolding) => Promise<T>): Promise<T> {
        assertIdentity(uid, op);
        return world(sId, async (ctx) => {
            const replay = await ctx.repo.readReceipt(kind, op.opId);
            if (replay) {
                // 回执重放优先于重算：同一操作身份不能绑定不同请求。
                if (replay.uid !== uid || replay.hash !== op.hash) {
                    throw new RpcFault("OPERATION_CONFLICT", "同一操作身份不能绑定不同请求");
                }
                if (replay.contractVersion !== op.contractVersion) {
                    throw new RpcFault("OPERATION_RESULT_EXPIRED", "旧版操作结果不能按当前契约重放");
                }
                return validate(replay.response);
            }
            const holding = await ctx.repo.readHoldingForUpdate(uid);
            const response = await run(ctx, holding);
            await ctx.repo.insertReceipt({ ...op, uid, kind, response });
            return response;
        });
    }

    /** 近景视窗：稀疏地块 + 折叠过的 owners/alliances 字典。 */
    async function view(uid: string, sId: number, rect: ISgzzRect): Promise<ISgzzViewRes> {
        assertIdentity(uid);
        return world(sId, async (ctx) => {
            const holding = await ctx.repo.readHoldingForUpdate(uid);
            const { viewer } = await readViewer(ctx, holding);
            const tiles = await ctx.repo.readTilesInRect(rect);

            const alliances: string[] = [];
            const allianceIndex = new Map<string, number>();
            const indexAlliance = (aid: string): number => {
                if (aid === "") return -1;
                const hit = allianceIndex.get(aid);
                if (hit !== undefined) return hit;
                const idx = alliances.length;
                alliances.push(aid);
                allianceIndex.set(aid, idx);
                return idx;
            };
            const owners: ISgzzOwnerRef[] = [];
            const ownerIndex = new Map<string, number>();
            const indexOwner = (t: ISgzzTile): number => {
                if (t.ownerUid === "") return -1;
                const key = JSON.stringify([t.ownerUid, t.ownerAid]);
                const hit = ownerIndex.get(key);
                if (hit !== undefined) return hit;
                const idx = owners.length;
                owners.push({ uid: t.ownerUid, alliance: indexAlliance(t.ownerAid) });
                ownerIndex.set(key, idx);
                return idx;
            };
            const refs: ISgzzTileRef[] = tiles.map((t) => ({
                cell: t.cell, owner: indexOwner(t), durability: t.durability,
                addition: t.addition, capturing: indexAlliance(t.capturingAid),
            }));
            return validateSgzzViewRes({
                rect, revision: ctx.repo.revision, viewer: viewerWire(viewer),
                alliances, owners, tiles: refs,
            });
        });
    }

    async function tile(uid: string, sId: number, cell: number): Promise<ISgzzTileRes> {
        assertIdentity(uid);
        return world(sId, async (ctx) => {
            const holding = await ctx.repo.readHoldingForUpdate(uid);
            const { viewer } = await readViewer(ctx, holding);
            return validateSgzzTileRes({ tile: await ctx.repo.readTile(cell), viewer: viewerWire(viewer) });
        });
    }

    async function occupy(uid: string, sId: number, cell: number, op: SgzzOperation): Promise<ISgzzOccupyRes> {
        return mutate(uid, sId, "occupy", op, validateSgzzOccupyRes, async (ctx, holding) => {
            const { viewer } = await readViewer(ctx, holding);
            const { row, col } = sgzzDecodeCell(cell);
            const terrain = terrainOf(deps.mapId);
            const neighbours = neighbourCells(cell);
            // 目标与邻居一次排好序再加锁 —— 升序 = 全局锁序
            const toLock = [...new Set([cell, ...neighbours])].sort((a, b) => a - b);
            const locked = await ctx.repo.readTilesForUpdate(toLock);
            const target = locked.get(cell) ?? sgzzEmptyTile(cell);

            const refusal = sgzzOccupyRefusal({
                passable: sgzzIsPassable(terrain, row, col),
                heldTiles: holding.tiles,
                inSpawnRegion: sgzzInSpawnRegion(row, col),
                target,
                neighbours: neighbours.map((n) => locked.get(n) ?? sgzzEmptyTile(n)),
            }, viewer);
            if (refusal === "SGZZMAP_IMPASSABLE") throw new RpcFault(refusal, "这一格不可通行");
            if (refusal === "SGZZMAP_TILE_LIMIT") throw new RpcFault(refusal, "已达持地上限");
            if (refusal === "SGZZMAP_NOT_ADJACENT") throw new RpcFault(refusal, "必须与自己或同盟的领地相连");

            let result = applySgzzTileAction(target, viewer);
            if (target.ownerUid === "") {
                if (!await ctx.repo.insertTile(result.tile)) {
                    // 稀疏空格的竞争契约：撞唯一键后在当前事务重读真实状态，⛔ 不按旧的默认格结算
                    result = applySgzzTileAction(await ctx.repo.readTile(cell), viewer);
                    await ctx.repo.updateTile(result.tile);
                }
            } else {
                await ctx.repo.updateTile(result.tile);
            }
            const held = result.outcome === "captured" ? holding.tiles + 1 : holding.tiles;
            if (held !== holding.tiles) await ctx.repo.upsertHolding({ ...holding, tiles: held });
            await ctx.repo.appendLog("tile", result.outcome, result.tile, false);
            return validateSgzzOccupyRes({ tile: result.tile, outcome: result.outcome, heldTiles: held });
        });
    }

    async function abandon(uid: string, sId: number, cell: number, op: SgzzOperation): Promise<ISgzzAbandonRes> {
        return mutate(uid, sId, "abandon", op, validateSgzzAbandonRes, async (ctx, holding) => {
            const { viewer } = await readViewer(ctx, holding);
            const locked = await ctx.repo.readTilesForUpdate([cell]);
            const target = locked.get(cell) ?? sgzzEmptyTile(cell);
            if (target.ownerUid !== uid) throw new RpcFault("SGZZMAP_NOT_OWNED", "只能放弃自己的领地");
            applySgzzTileAbandon(target, viewer);
            await ctx.repo.deleteTile(cell);
            const held = Math.max(0, holding.tiles - 1);
            await ctx.repo.upsertHolding({ ...holding, tiles: held });
            await ctx.repo.appendLog("tile", "abandon", { cell }, true);
            return validateSgzzAbandonRes({ cell, heldTiles: held });
        });
    }

    /**
     * 建盟 / 加入 / 退出。三个动作锁的是同一组表（member → alliance → tile → holding），
     * 走同一条路由、同一种回执。
     * ⚠ alliance_id 取「建盟那一刻的 revision」：revision 行已被锁住、每区唯一且单调，
     * ⛔ 不用随机数（kit 代码没有 node:crypto）也⛔不用 AUTO_INCREMENT（复合 PK 放不下）。
     */
    async function alliance(uid: string, sId: number, req: ISgzzAllianceReq,
                            op: SgzzOperation): Promise<ISgzzAllianceRes> {
        return mutate(uid, sId, "alliance", op, validateSgzzAllianceRes, async (ctx, holding) => {
            const { membership, alliance: current } = await readViewer(ctx, holding);
            const target = req.act === "join"
                ? await ctx.repo.readAllianceForUpdate(req.allianceId ?? "")
                : current;

            const refusal = sgzzAllianceRefusal({
                act: req.act,
                currentAid: membership?.allianceId ?? "",
                currentRole: membership?.role ?? SgzzAllianceRole.MEMBER,
                target,
            });
            if (refusal === "SGZZMAP_ALLIANCE_EXISTS") throw new RpcFault(refusal, "已经在同盟里了");
            if (refusal === "SGZZMAP_ALLIANCE_NOT_FOUND") throw new RpcFault(refusal, "没有这个同盟");
            if (refusal === "SGZZMAP_ALLIANCE_FULL") throw new RpcFault(refusal, "同盟人数已满");
            if (refusal === "SGZZMAP_ALLIANCE_NOT_MEMBER") throw new RpcFault(refusal, "不在任何同盟里");
            if (refusal === "SGZZMAP_ALLIANCE_LEADER_BUSY") {
                throw new RpcFault(refusal, "盟主要等盟里只剩自己才能退");
            }

            if (req.act === "create") {
                const seq = await ctx.repo.appendLog("alliance", "create", { uid, tag: req.tag }, false);
                const created: ISgzzAlliance = {
                    allianceId: `a${seq}`, name: req.name ?? "", tag: req.tag ?? "",
                    leaderUid: uid, members: 1,
                };
                // tag 唯一键：撞了就是标签被占，⛔ 不先查再插（TOCTOU）
                if (!await ctx.repo.insertAlliance(created)) {
                    throw new RpcFault("SGZZMAP_ALLIANCE_TAG_TAKEN", "这个盟标已被占用");
                }
                const m: ISgzzMembership = { uid, allianceId: created.allianceId, role: SgzzAllianceRole.LEADER };
                await ctx.repo.insertMembership(m);
                await ctx.repo.retagTiles(uid, created.allianceId);
                await ctx.repo.upsertHolding({ ...holding, allianceId: created.allianceId });
                return validateSgzzAllianceRes({ membership: m, alliance: created });
            }

            if (req.act === "join") {
                if (!target) throw new RpcFault("SGZZMAP_ALLIANCE_NOT_FOUND", "没有这个同盟");
                const joined: ISgzzAlliance = { ...target, members: target.members + 1 };
                const m: ISgzzMembership = { uid, allianceId: target.allianceId, role: SgzzAllianceRole.MEMBER };
                await ctx.repo.insertMembership(m);
                await ctx.repo.updateAllianceMembers(target.allianceId, joined.members);
                await ctx.repo.retagTiles(uid, target.allianceId);
                await ctx.repo.upsertHolding({ ...holding, allianceId: target.allianceId });
                await ctx.repo.appendLog("alliance", "join", { uid, allianceId: target.allianceId }, false);
                return validateSgzzAllianceRes({ membership: m, alliance: joined });
            }

            // leave：盟主只有在只剩自己时才走到这里 ⇒ 该同盟随之解散
            const aid = membership!.allianceId;
            await ctx.repo.deleteMembership(uid);
            await ctx.repo.retagTiles(uid, "");
            await ctx.repo.upsertHolding({ ...holding, allianceId: "" });
            if (current && current.members <= 1) {
                await ctx.repo.deleteAlliance(aid);
                await ctx.repo.appendLog("alliance", "disband", { allianceId: aid }, true);
            } else if (current) {
                await ctx.repo.updateAllianceMembers(aid, current.members - 1);
                await ctx.repo.appendLog("alliance", "leave", { uid, allianceId: aid }, false);
            }
            return validateSgzzAllianceRes({ membership: null, alliance: null });
        });
    }

    return { view, tile, occupy, abandon, alliance, neighbourCells };
}

export const defaultSgzzApi = createSgzzApi();
