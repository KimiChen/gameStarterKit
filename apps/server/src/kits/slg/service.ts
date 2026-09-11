/** SQL 权威 SLG 的唯一写入口；RPC 与未来视图房/worker 均调用 api/ 门面。 */
import { EFFECT_SCHEMA_VERSION } from "@game/shared";
import { kitEffectKind } from "@game/shared/kits/catalogTypes";
import {
  SLG_MARCH_COST, SLG_MAX_ACTIVE_MARCHES, SLG_SETTLEMENT_BATCH_SIZE,
  marchDurationMs, type ISlgMarch,
} from "@game/shared/kits/slg/api/march/index";
import {
  applySlgTileAction, validateSlgChunkRect, validateSlgMapId, validateSlgTileId,
  type ISlgChunkRect,
} from "@game/shared/kits/slg/api/worldmap/index";
import {
  validateSlgMarchDispatchRes, validateSlgMarchRecallRes, validateSlgTileCaptureRes,
  type ISlgMapTilesRes, type ISlgMarchDispatchRes, type ISlgMarchRecallRes, type ISlgTileCaptureRes,
} from "@game/shared/protocol/lobbyRpc/domains/slg";
import {
  CUR_GOLD, RpcFault, applyKitEffect, kitOpId, retryKitTransaction, withKitTx, withKitUserFence,
  type IEffect, type KitEffectApplyResult, type KitTx,
} from "../../core/infra/kitApi";
import { readSlgTrophies } from "./host";
import { createSqlSlgRepository, type SlgReceiptKind, type SlgRepository } from "./repository";

export const SLG_KIT_ID = "slg";
export const SLG_TROPHY_EFFECT_KIND = kitEffectKind(SLG_KIT_ID, "trophy");
/** hash / version 必须来自 dispatcher 的 ctx.operation，插件同样须传框架已规范化的操作身份。 */
export interface SlgOperation {
  readonly opId: string;
  readonly hash: string;
  readonly contractVersion: number;
}
export type SlgTxRunner = <T>(sId: number, fn: (tx: KitTx) => Promise<T>) => Promise<T>;
export interface SlgApiDeps {
  readonly run: SlgTxRunner;
  readonly repository: (tx: KitTx, sId: number) => SlgRepository;
  readonly now: () => number;
  readonly applyEffect: (uid: string, sId: number, opId: string, effect: IEffect) => Promise<KitEffectApplyResult>;
  readonly readTrophies: (uid: string, sId: number) => Promise<number>;
  readonly withUserFence: <T>(uid: string, sId: number, fn: (user: { readonly fence: number }) => Promise<T>) => Promise<T>;
}
interface PendingEffect { readonly uid: string; readonly opId: string; readonly effect: IEffect }
interface WorldTx { readonly tx: KitTx; readonly repo: SlgRepository; readonly now: number; readonly effects: PendingEffect[] }
const DEFAULT_DEPS: SlgApiDeps = {
  run: (sId, fn) => withKitTx(SLG_KIT_ID, sId, fn),
  repository: createSqlSlgRepository,
  now: Date.now,
  applyEffect: (uid, sId, opId, effect) => applyKitEffect(SLG_KIT_ID, uid, sId, opId, effect),
  readTrophies: readSlgTrophies,
  withUserFence: withKitUserFence,
};
const NEED_SETTLEMENT = Symbol("SLG needs committed settlement before request");
const SERVER_RECEIPT_HASH = "0".repeat(64);

export function slgOperation(
  uid: string, sId: number, operation: "capture" | "dispatch" | "recall", clientReqId: string,
  binding: { readonly hash: string; readonly contractVersion: number } | undefined,
): SlgOperation {
  if (!binding) throw new Error("SLG 幂等写缺少框架 operation binding");
  return { opId: kitOpId(SLG_KIT_ID, uid, sId, operation, clientReqId), ...binding };
}
function assertIdentity(uid: string, op?: SlgOperation): void {
  if (!uid || uid.length > 32) throw new RangeError("SLG uid 非法");
  if (op && (!op.opId || op.opId.length > 64 || !/^[a-f0-9]{64}$/u.test(op.hash)
    || !Number.isSafeInteger(op.contractVersion) || op.contractVersion < 1)) throw new RangeError("SLG operation 非法");
}
function trophyEffect(): IEffect {
  return { schemaVersion: EFFECT_SCHEMA_VERSION, grants: [{ kind: SLG_TROPHY_EFFECT_KIND as `kit:${string}`, delta: 1 }] };
}

export function createSlgApi(overrides: Partial<SlgApiDeps> = {}) {
  const deps = { ...DEFAULT_DEPS, ...overrides };

  /** revision 行锁持有至 COMMIT；序号、业务、回执、intent 同事务。提交后再做可失败的 Redis apply。 */
  async function world<T>(sId: number, fn: (ctx: WorldTx) => Promise<T>): Promise<T> {
    const committed = await retryKitTransaction(() => deps.run(sId, async (tx) => {
      const repo = deps.repository(tx, sId);
      await repo.lockRevision();
      const now = deps.now();
      if (!Number.isSafeInteger(now) || now < 0) throw new RangeError("SLG server clock 非法");
      const effects: PendingEffect[] = [];
      const result = await fn({ tx, repo, now, effects });
      // 领域行与全部回执先锁/写，最后才进入经济/effect，保持全批次的锁序。
      for (const effect of effects) {
        if (await tx.enqueueEffect(effect.uid, effect.opId, effect.effect) !== "INSERTED") {
          throw new Error("SLG 无回执却已有奖励 intent，拒绝重复改主");
        }
      }
      return { result, effects };
    }));
    for (const effect of committed.effects) {
      // SQL 已提交，失败只留给 durable outbox relayer；不能把成功的写翻成失败重跑。
      try { await deps.applyEffect(effect.uid, sId, effect.opId, effect.effect); } catch { /* committed intent */ }
    }
    return committed.result;
  }

  async function changeTile(ctx: WorldTx, uid: string, tileId: number, opId: string): Promise<ISlgTileCaptureRes> {
    let before = await ctx.repo.readTile(tileId);
    let result = applySlgTileAction(before, uid);
    if (before.ownerUid === "") {
      const inserted = await ctx.repo.insertTile(result.tile);
      if (!inserted) {
        // 稀疏空格的竞争契约：撞唯一键后在当前事务重读真实状态，不能按旧的默认格发奖。
        before = await ctx.repo.readTile(tileId);
        result = applySlgTileAction(before, uid);
        await ctx.repo.updateTile(result.tile);
      }
    } else {
      await ctx.repo.updateTile(result.tile);
    }
    if (before.ownerUid !== result.tile.ownerUid || before.guardPower !== result.tile.guardPower) {
      await ctx.repo.appendTile(result.tile, result.outcome);
    }
    if (result.outcome === "captured") {
      const effect = trophyEffect();
      ctx.effects.push({ uid, opId, effect });
    }
    return result;
  }

  /** 一次最多处理32条，按全区总序扫描，因此同目标的较早事件绝不被分页/反向扫描跳过。 */
  async function settleDueMarches(sId: number): Promise<{ settled: number; pending: boolean; revision: number }> {
    return world(sId, async (ctx) => {
      const due = await ctx.repo.readDue(ctx.now, SLG_SETTLEMENT_BATCH_SIZE + 1);
      const batch = due.slice(0, SLG_SETTLEMENT_BATCH_SIZE);
      // 先以稳定地块顺序拿锁，然后行军；revision 层已串行，本排序仍为未来细化并发留下纪律。
      for (const tileId of [...new Set(batch.map((march) => march.toTile))].sort((a, b) => a - b)) {
        const tile = await ctx.repo.readTile(tileId);
        // 新目标的锁也必须先于march。临时中性行只在事务中存在；该批至少一次到达把它占领，
        // 后续任意故障会连同占位整体回滚，提交后的稀疏表仍无默认行。
        if (tile.ownerUid === "") await ctx.repo.insertTile(tile);
      }
      for (const marchId of batch.map((march) => march.marchId).sort()) await ctx.repo.readMarch(marchId);
      for (const observed of batch) {
        const march = await ctx.repo.readMarch(observed.marchId);
        if (!march || march.status !== "marching") throw new Error("SLG revision 锁内行军状态意外变化");
        const opId = kitOpId(SLG_KIT_ID, march.uid, sId, "march-arrive", march.marchId);
        if (await ctx.repo.readReceipt("settle", opId)) throw new Error("SLG 已有到达回执但行军未结束");
        const result = await changeTile(ctx, march.uid, march.toTile, opId);
        const arrived: ISlgMarch = { ...march, status: "arrived" };
        await ctx.repo.updateMarch(arrived);
        await ctx.repo.appendMarch(arrived, "arrived");
        await ctx.repo.insertReceipt({ opId, uid: march.uid, hash: SERVER_RECEIPT_HASH, contractVersion: 1,
          kind: "settle", response: { march: arrived, ...result } });
      }
      return { settled: batch.length, pending: due.length > batch.length, revision: ctx.repo.revision };
    });
  }

  /**
   * 到期积压另开有界事务提交，避免“返回 BUSY 同时回滚进度”造成永久无法清空。
   * 请求本身持锁后重新取服务器时钟；最多一次补算，不把 RPC 变成长事务。
   */
  async function fresh<T>(sId: number, fn: (ctx: WorldTx) => Promise<T>, replay?: (ctx: WorldTx) => Promise<T | undefined>): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await world<T | typeof NEED_SETTLEMENT>(sId, async (ctx) => {
        const saved = await replay?.(ctx);
        if (saved !== undefined) return saved;
        if ((await ctx.repo.readDue(ctx.now, 1)).length) return NEED_SETTLEMENT;
        return fn(ctx);
      });
      if (result !== NEED_SETTLEMENT) return result;
      if (attempt === 1) break;
      const progress = await settleDueMarches(sId);
      if (progress.pending) break;
    }
    throw new RpcFault("SLG_SETTLEMENT_PENDING", "正在补算到达事件，请稍后重试");
  }
  async function mutate<T>(uid: string, sId: number, kind: SlgReceiptKind, op: SlgOperation,
    validate: (value: unknown) => T, fn: (ctx: WorldTx) => Promise<T>,
    finalize?: (ctx: WorldTx, response: T) => Promise<T>): Promise<T> {
    assertIdentity(uid, op);
    return fresh(sId, async (ctx) => {
      let response = validate(await fn(ctx));
      await ctx.repo.insertReceipt({ ...op, uid, kind, response });
      if (finalize) {
        response = validate(await finalize(ctx, response));
        // receipt锁在经济写之前已取得，此处只更新已锁行，失败仍整体回滚。
        await ctx.repo.updateReceipt(kind, op.opId, response);
      }
      return response;
    }, async (ctx) => {
      const receipt = await ctx.repo.readReceipt(kind, op.opId);
      if (!receipt) return undefined;
      if (receipt.uid !== uid || receipt.kind !== kind || receipt.hash !== op.hash) throw new RpcFault("OPERATION_CONFLICT", "同一操作身份不能绑定不同请求");
      if (receipt.contractVersion !== op.contractVersion) throw new RpcFault("OPERATION_RESULT_EXPIRED", "旧版操作结果不能按当前契约重放");
      return validate(receipt.response);
    });
  }

  return {
    settleDueMarches,
    async readTiles(uid: string, sId: number, mapIdInput: string, rectInput: ISlgChunkRect): Promise<ISlgMapTilesRes> {
      assertIdentity(uid);
      const mapId = validateSlgMapId(mapIdInput);
      const rect = validateSlgChunkRect(rectInput);
      const snapshot = await fresh(sId, async (ctx) => ({ tiles: await ctx.repo.readTiles(mapId, rect), revision: ctx.repo.revision }));
      return { ...snapshot, myTrophies: await deps.readTrophies(uid, sId) };
    },
    async captureTile(uid: string, sId: number, tileId: number, op: SlgOperation): Promise<ISlgTileCaptureRes> {
      validateSlgTileId(tileId);
      return mutate(uid, sId, "capture", op, validateSlgTileCaptureRes, (ctx) => changeTile(ctx, uid, tileId, op.opId));
    },
    async dispatchMarch(uid: string, sId: number, fromTile: number, toTile: number, op: SlgOperation): Promise<ISlgMarchDispatchRes> {
      assertIdentity(uid, op);
      const duration = marchDurationMs(fromTile, toTile);
      return deps.withUserFence(uid, sId, ({ fence }) => mutate(uid, sId, "dispatch", op, validateSlgMarchDispatchRes, async (ctx) => {
        const from = await ctx.repo.readTile(fromTile);
        if (from.ownerUid !== uid) throw new RpcFault("SLG_TILE_NOT_OWNED", "只能从自己的地块派遣");
        if (await ctx.repo.countActive(uid) >= SLG_MAX_ACTIVE_MARCHES) throw new RpcFault("SLG_MARCH_LIMIT", "最多同时派遣三支行军");
        const march: ISlgMarch = { marchId: op.opId, uid, fromTile, toTile, departAt: ctx.now, arriveAt: ctx.now + duration, status: "marching" };
        // 起点与时间冻结，出发后起点失守不撤销命令；扣款/命令/回执同事务。
        await ctx.repo.insertMarch(march);
        await ctx.repo.appendMarch(march, "dispatch");
        return { march, balance: 0 };
      }, async (ctx, response) => {
        const balance = await ctx.tx.debit(uid, CUR_GOLD, SLG_MARCH_COST, fence, op.opId, "slg.march.dispatch");
        if (balance === "DUP") throw new Error("SLG 无派遣回执却已有扣款账本");
        return { ...response, balance };
      }));
    },
    async recallMarch(uid: string, sId: number, marchId: string, op: SlgOperation): Promise<ISlgMarchRecallRes> {
      if (!marchId || marchId.length > 64) throw new RangeError("SLG marchId 非法");
      return mutate(uid, sId, "recall", op, validateSlgMarchRecallRes, async (ctx) => {
        const march = await ctx.repo.readMarch(marchId);
        if (!march || march.uid !== uid) throw new RpcFault("SLG_MARCH_NOT_FOUND", "没有这支行军");
        if (march.status !== "marching" || march.arriveAt <= ctx.now) throw new RpcFault("SLG_MARCH_FINISHED", "行军已经结束，不能撤回");
        const recalled: ISlgMarch = { ...march, status: "recalled" };
        await ctx.repo.updateMarch(recalled);
        await ctx.repo.appendMarch(recalled, "recalled");
        return { march: recalled };
      });
    },
    /** 2b 消费方的游标入口；阶段1/2a不裁剪日志。以同一revision锁读取一致页。 */
    async readChanges(sId: number, after: number, limit = 128) {
      if (!Number.isSafeInteger(after) || after < 0) throw new RangeError("SLG cursor 非法");
      return world(sId, async (ctx) => {
        if (after > ctx.repo.revision) throw new RangeError("SLG cursor 超前，需要baseline");
        const changes = await ctx.repo.readChanges(after, limit);
        return { changes, revision: ctx.repo.revision, nextCursor: changes.length ? changes[changes.length - 1].revision : after };
      });
    },
  };
}

export type SlgApi = ReturnType<typeof createSlgApi>;
export const defaultSlgApi = createSlgApi();
