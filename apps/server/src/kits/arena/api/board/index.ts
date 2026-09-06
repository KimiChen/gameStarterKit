/**
 * arena kit · `board` api 面（服务端，docs/KIT.md §4）：棋盘的读 / 占领 / 商店 boost 三个用例。
 * 插件只能 import 本门面（`../../kits/arena/api/board`），⛔ 不 import kit 内部模块（boardRepo / host）。
 * 本面任何导出变化都要 bump `apps/kits/arena/kit.json` 的 `api.board.version`。
 *
 * 框架触点只有 kit-api（`withKitTx` / `tx.query` 限 k_arena_* / `tx.debit` 唯一的扣款路径 / `tx.enqueueEffect`
 * 唯一的奖杯写路径 / 提交后 `applyKitEffect` 的 best-effort 收尾 / `kitOpId`）；SQL 只碰 k_arena_board 与
 * k_arena_attempt。规则见 shared board 面抬头与 apps/kits/arena/README.md。
 * `run` / `applyEffect` 可注入（单测用假 KitTx / 记录器），生产缺省 = `withKitTx("arena", sId, fn)` / `applyKitEffect`。
 */
import { EFFECT_SCHEMA_VERSION } from "@game/shared";
import { kitEffectKind } from "@game/shared/kits/catalogTypes";
import {
  ARENA_BOOST_POWER, ARENA_MAX_POWER, type IArenaTile, isArenaTileIndex,
} from "@game/shared/kits/arena/api/board/index";
import {
  CUR_GOLD, type IEffect, type KitEffectApplyResult, type KitTx, applyKitEffect, kitOpId, withKitTx,
} from "../../../../core/infra/kitApi";
import {
  type ArenaAttemptOutcome, insertAttempt, selectAttemptForUpdate, selectBoard, selectTileForUpdate, upsertTile,
} from "../../boardRepo";

export const ARENA_KIT_ID = "arena";
/** 本 kit 登记的 effect kind（apps/kits/arena/kit.json `effects.trophy`）。 */
export const ARENA_TROPHY_EFFECT_KIND = kitEffectKind(ARENA_KIT_ID, "trophy");

/** kit 事务运行器（生产 = withKitTx；单测注入假 KitTx）。 */
export type ArenaTxRunner = <T>(sId: number, fn: (tx: KitTx) => Promise<T>) => Promise<T>;
export const defaultArenaTxRunner: ArenaTxRunner = (sId, fn) => withKitTx(ARENA_KIT_ID, sId, fn);

/** 提交后的 effect 收尾（生产 = kit-api applyKitEffect；单测注入记录器）。 */
export type ArenaEffectApplier = (uid: string, sId: number, opId: string, effect: IEffect) => Promise<KitEffectApplyResult>;
export const defaultArenaEffectApplier: ArenaEffectApplier = (uid, sId, opId, effect) => applyKitEffect(ARENA_KIT_ID, uid, sId, opId, effect);

/** 本 kit 命名空间化的 op_id（`kit:arena:<op>`）：插件建在 board 面上时用它派生，⛔ 不自造 opId。 */
export function arenaOpId(uid: string, sId: number, op: "capture" | "boost", clientReqId: string): string {
  return kitOpId(ARENA_KIT_ID, uid, sId, op, clientReqId);
}

/** boost 一个不属于调用者的格（插件翻译成自己的域错误码）。 */
export class ArenaTileNotOwnedError extends Error {
  readonly tile: number;
  readonly ownerUid: string;
  constructor(tile: number, ownerUid: string) {
    super(`arena 格 ${tile} 不属于调用者（主人 "${ownerUid}"）`);
    this.name = "ArenaTileNotOwnedError";
    this.tile = tile;
    this.ownerUid = ownerUid;
  }
}

/**
 * 一次 arena.capture 的结果（= k_arena_attempt 回执的形态）：
 *  - captured：改主（占无主格 / 夺取守备归零的敌格），power = 1，+1 奖杯 effect 已入队（首次时提交后即 apply）；
 *  - reinforced：自己的格再占一次，power + 1（封顶），不发奖杯；
 *  - taken：敌格仍有守备，本次让它 −1（已提交），不改主——端点翻成 ARENA_TILE_TAKEN；
 *  - `replayed`：同 opId 重放（回执回读），棋盘未再动、effect 未再入队；kind / power / ownerUid 是首次的值。
 */
export interface ArenaCaptureOutcome {
  readonly kind: ArenaAttemptOutcome;
  readonly tile: number;
  /** 操作后该格守备值 */
  readonly power: number;
  /** 操作后该格主人（captured / reinforced = 调用者；taken = 原主人） */
  readonly ownerUid: string;
  readonly replayed: boolean;
}

export interface ArenaBoostResult {
  readonly tile: number;
  readonly power: number;
  /** 扣款后余额；同 opId 重放（账本 DUP）时为 null——本次未扣款，插件把它原样透传（响应 balance 可空） */
  readonly balance: number | null;
}

function assertTile(tile: number): void {
  if (!isArenaTileIndex(tile)) throw new RangeError(`arena tile ${String(tile)} 非法`);
}

function trophyEffect(): IEffect {
  return { schemaVersion: EFFECT_SCHEMA_VERSION, grants: [{ kind: ARENA_TROPHY_EFFECT_KIND as `kit:${string}`, delta: 1 }] };
}

export function createArenaBoardApi(run: ArenaTxRunner = defaultArenaTxRunner, applyEffect: ArenaEffectApplier = defaultArenaEffectApplier) {
  return {
    /** 整张棋盘（恰好 ARENA_TILE_COUNT 项，tile 升序）。 */
    readBoard(sId: number): Promise<IArenaTile[]> {
      return run(sId, (tx) => selectBoard(tx, sId));
    },

    /**
     * 占领一格（arena.capture）。opId 幂等由本 kit 自己的回执表兜底（⛔ 不靠 dispatcher 60s 的 idem 结果缓存）：
     * 事务内先加锁读 k_arena_attempt——有回执即重放，原样回读、零写入（三种结果都如此，含 taken 的削守备）；
     * 首次才改棋盘 + 写回执（改主还同事务入队奖杯 effect），提交后再 best-effort apply 该 effect。
     * 「outbox 已有同 opId intent 却无回执」不可能由本 kit 的写路径产生 ⇒ 视为账本不一致，抛出回滚（fail-closed）。
     */
    async captureTile(uid: string, sId: number, tile: number, opId: string): Promise<ArenaCaptureOutcome> {
      assertTile(tile);
      const outcome = await run(sId, async (tx): Promise<ArenaCaptureOutcome> => {
        const receipt = await selectAttemptForUpdate(tx, sId, opId);
        if (receipt !== null) {
          return { kind: receipt.outcome, tile: receipt.tile, power: receipt.power, ownerUid: receipt.ownerUid, replayed: true };
        }
        const current = await selectTileForUpdate(tx, sId, tile);
        let result: Omit<ArenaCaptureOutcome, "replayed">;
        if (current.ownerUid === uid) {
          const power = Math.min(ARENA_MAX_POWER, current.power + 1);
          await upsertTile(tx, sId, { tile, ownerUid: uid, power });
          result = { kind: "reinforced", tile, power, ownerUid: uid };
        } else if (current.ownerUid !== "" && current.power > 0) {
          const power = current.power - 1;
          await upsertTile(tx, sId, { tile, ownerUid: current.ownerUid, power });
          result = { kind: "taken", tile, power, ownerUid: current.ownerUid };
        } else {
          const enqueued = await tx.enqueueEffect(uid, opId, trophyEffect());
          if (enqueued === "DUP") {
            throw new Error(`arena capture：outbox 已有 opId ${opId} 的 intent 但 k_arena_attempt 无回执——账本不一致，拒绝改棋盘`);
          }
          await upsertTile(tx, sId, { tile, ownerUid: uid, power: 1 });
          result = { kind: "captured", tile, power: 1, ownerUid: uid };
        }
        await insertAttempt(tx, sId, { opId, uid, tile, outcome: result.kind, power: result.power, ownerUid: result.ownerUid });
        return { ...result, replayed: false };
      });
      if (outcome.kind === "captured" && !outcome.replayed) {
        await applyEffect(uid, sId, opId, trophyEffect()); // 阶段 2/3：best-effort，失败 / cold 留给 relayer
      }
      return outcome;
    },

    /**
     * 花 `cost` 金币给自己的格加 ARENA_BOOST_POWER 守备（arenaShop.buyBoost 消费的面）。
     * 顺序：加锁读格 → 不是自己的即抛 ArenaTileNotOwnedError（零写入）→ `tx.debit`（账本幂等：DUP = 同 opId 已扣过，
     * 不再加守备）→ upsert。扣款失败（余额不足 / fence 过期）由 kit-api 抛框架错误，事务整体回滚。
     */
    async boostTile(uid: string, sId: number, fence: number, tile: number, cost: number, opId: string): Promise<ArenaBoostResult> {
      assertTile(tile);
      if (!Number.isSafeInteger(cost) || cost <= 0) throw new RangeError(`arena boost cost ${String(cost)} 非法`);
      return run(sId, async (tx) => {
        const current = await selectTileForUpdate(tx, sId, tile);
        if (current.ownerUid !== uid) throw new ArenaTileNotOwnedError(tile, current.ownerUid);
        const debit = await tx.debit(uid, CUR_GOLD, cost, fence, opId, "arena.boost");
        if (debit === "DUP") return { tile, power: current.power, balance: null };
        const power = Math.min(ARENA_MAX_POWER, current.power + ARENA_BOOST_POWER);
        await upsertTile(tx, sId, { tile, ownerUid: uid, power });
        return { tile, power, balance: debit };
      });
    },
  };
}

const defaultApi = createArenaBoardApi();
export const readBoard: ReturnType<typeof createArenaBoardApi>["readBoard"] = (sId) => defaultApi.readBoard(sId);
export const captureTile: ReturnType<typeof createArenaBoardApi>["captureTile"] = (uid, sId, tile, opId) => defaultApi.captureTile(uid, sId, tile, opId);
export const boostTile: ReturnType<typeof createArenaBoardApi>["boostTile"] = (uid, sId, fence, tile, cost, opId) => defaultApi.boostTile(uid, sId, fence, tile, cost, opId);
