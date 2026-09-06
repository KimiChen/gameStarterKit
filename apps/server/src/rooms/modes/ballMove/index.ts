import type { Client } from "colyseus";
import {
    CORE_S2C_TOKENS,
    BALL_MOVE_MIN_PLAYERS,
    CastSkill,
    ErrorCode,
    ErrorMessage,
    GamePhase,
    MAP_HEIGHT,
    MAP_WIDTH,
    MAX_PLAYERS,
    Move,
    PLAYER_INIT_HP,
    SkillResult,
    gameplayC2STokens,
    getSkillDef,
    type ICastSkillReq,
    type IErrorRes,
    type IMoveReq,
    type ISkillResultRes,
} from "@game/shared";
import { GameRoomState, PlayerState } from "../../schema/GameRoomState";
import {
    BALL_MOVE_GAME_MODE_ID,
    gameModeRegistry,
    type GameMode,
    type GameModeContext,
    type GameModePlayerLeavingContext,
    type GameModeRegistry,
    type GameplayCommandsFor,
} from "../../GameMode";
import {
    advanceBallMovePlayers,
    applyBallMoveCast,
    applyBallMoveDirection,
    resetBallMovePlayers,
} from "./rules";
import {
    BallMoveMatchTracker,
    MAX_ACCEPTED_INPUTS,
    assertBallMoveRosterCompatible,
    type BallMoveEvidenceSource,
} from "./evidence";
import {
    MAX_INPUTS_PER_SOURCE,
    snapshotInjectedInput,
    type AcceptedGameInput,
    type GameRoomInput,
    type GameRoomInputSource,
} from "./harness";

export { BALL_MOVE_GAME_MODE_ID };
export { MAX_ACCEPTED_INPUTS };
export type { AcceptedGameInput, GameRoomInput, GameRoomInputSource };

type BallMoveContext = GameModeContext<GameRoomState>;

export interface BallMoveGameModeOptions {
    /** 可选的回放输入源，在每个 fixed step 开始前读取。 */
    readonly inputSource?: GameRoomInputSource;
    /** Test/replay override for the accepted-input evidence cap. */
    readonly maxAcceptedInputs?: number;
}

/**
 * ballMove mode 实例句柄：GameMode 契约 + 测试/回放 harness API。
 * harness API 属于本 mode 的注入/回放边界，⛔ 不是通用玩法契约——其它玩法不需要
 * 实现 ballMove 的输入形状（GameRoom 上已无这些方法）。
 */
export interface BallMoveGameMode extends GameMode<GameRoomState, PlayerState> {
    /** 注入一条已经过调用方验证的输入；非法输入直接拒绝，不进入 replay 序列。 */
    injectInput(input: GameRoomInput): boolean;
    setInputSource(source: GameRoomInputSource | undefined): void;
    /** 只读副本，避免测试/回放调用方改写房内输入历史。 */
    getAcceptedInputs(): readonly AcceptedGameInput[];
    /** 回放适配器的只读别名。 */
    readonly acceptedInputs: readonly AcceptedGameInput[];
    /** 证据录入的测试观察点（原 GameRoom 私有方法；内部调用一律经由本句柄，可被替换观察）。 */
    recordLeaveEvent(sessionId: string, acceptedTick: number): void;
    recordDeath(sessionId: string): void;
}

/**
 * 与拆出前的 GameRoom 默认规则逐值一致：满员 MAX_PLAYERS、两人开局、两人自动开局；
 * Move/CastSkill 是正式模拟输入，⛔ 绝不在 Waiting/Settle 改状态。
 *
 * 每个 mode 实例 = 每房一份内部状态（registry.create 每次调用 factory 新建实例；
 * 注入路径由调用方保证一房一实例）。`onMatchInitialize` 仍会像原实现一样清空全部
 * 对局内状态，同房连续两局之间不依赖实例新旧。
 */
export function createBallMoveGameMode(options: BallMoveGameModeOptions = {}): BallMoveGameMode {
    const tracker = new BallMoveMatchTracker(options.maxAcceptedInputs);
    const injectedInputs: GameRoomInput[] = [];
    let inputSource: GameRoomInputSource | undefined = options.inputSource;
    let disposed = false;
    /**
     * 房间在每次 hook 调用时传入最新 context；这里捕获它供无参边界
     * （evidence capability 与 harness 注入 API）使用。context 的 random/settle 等
     * 成员是对房间当前状态的闭包转发，捕获旧引用不会读到过期的 RNG 流。
     */
    let ctx: BallMoveContext | null = null;

    const capture = (context: BallMoveContext): BallMoveContext => {
        ctx = context;
        return context;
    };

    const evidenceSource = (context: BallMoveContext): BallMoveEvidenceSource => ({
        state: context.state,
        sId: context.sId,
        matchSeed: context.matchSeed,
        fixedStepMs: context.fixedStepMs,
        userIdOf: (sessionId) => context.userIdOf(sessionId),
    });

    /** 结算条件：对局中存活 ≤1（原 GameRoom.maybeSettle 的默认分支）。 */
    const aliveCount = (context: BallMoveContext): number => {
        let alive = 0;
        context.state.players.forEach((player) => { if (player.alive) alive++; });
        return alive;
    };

    const maybeSettle = (context: BallMoveContext): void => {
        if (context.state.phase !== GamePhase.Playing) return;
        if (aliveCount(context) <= 1) context.settle();
    };

    const acceptMoveInput = (
        context: BallMoveContext,
        sessionId: string,
        dirX: number,
        dirY: number,
        sourceTick?: number,
    ): boolean => {
        if (disposed || context.state.phase !== GamePhase.Playing || !tracker.hasInputCapacity()) return false;
        const player = context.state.players.get(sessionId);
        const motion = tracker.motionAnchors.get(sessionId);
        if (!player?.alive || !motion) return false;
        const acceptedTick = context.state.tick;
        applyBallMoveDirection(
            player,
            motion,
            dirX,
            dirY,
            acceptedTick,
            context.fixedStepMs,
        );
        // Evidence preserves the accepted wire input. Replay applies the same
        // normalization exactly once; storing the live normalized vector here
        // would normalize diagonal input twice and change its final bits.
        const evidenceDirX = Object.is(dirX, -0) ? 0 : dirX;
        const evidenceDirY = Object.is(dirY, -0) ? 0 : dirY;
        tracker.recordAcceptedInput(
            {
                type: "move",
                sessionId,
                dirX: evidenceDirX,
                dirY: evidenceDirY,
                ...(sourceTick === undefined ? {} : { tick: sourceTick }),
            },
            {
                type: "move",
                sessionId,
                dirX: evidenceDirX,
                dirY: evidenceDirY,
                acceptedTick,
            },
        );
        return true;
    };

    const handleCastSkill = (
        context: BallMoveContext,
        client: Client | undefined,
        msg: ICastSkillReq,
        sessionIdOverride?: string,
        sourceTick?: number,
    ): boolean => {
        // 只有 Playing 能改变模拟；入口 handler 已做 phase 闸，注入/replay 也必须兜底。
        if (disposed || context.state.phase !== GamePhase.Playing) return false;
        const sessionId = client?.sessionId ?? sessionIdOverride;
        if (!sessionId) return false;
        const caster = context.state.players.get(sessionId);
        if (!caster || !caster.alive) return false;

        const skill = getSkillDef(msg?.skillId ?? -1);
        if (!skill) {
            const err: IErrorRes = { code: ErrorCode.SkillUnavailable, message: ErrorMessage[ErrorCode.SkillUnavailable] };
            context.sendS2C(client, CORE_S2C_TOKENS.Error, err);
            return false;
        }
        if (!tracker.hasInputCapacity()) {
            if (client) context.sendError(client, ErrorCode.BadRequest);
            return false;
        }

        const acceptedTick = context.state.tick;
        const result = applyBallMoveCast(
            context.state.players,
            context.random,
            acceptedTick,
            context.fixedStepMs,
            sessionId,
            skill.id,
            msg.targetId,
        );
        if (!result) return false;
        tracker.recordAcceptedInput(
            {
                type: "castSkill",
                sessionId,
                skillId: skill.id,
                ...(msg.targetId === undefined ? {} : { targetId: msg.targetId }),
                ...(sourceTick === undefined ? {} : { tick: sourceTick }),
            },
            {
                type: "castSkill",
                sessionId,
                skillId: skill.id,
                targetId: msg.targetId ?? null,
                acceptedTick,
            },
        );
        if (result.diedSessionId !== undefined) mode.recordDeath(result.diedSessionId);

        const res: ISkillResultRes = {
            casterId: sessionId,
            skillId: skill.id,
            targetId: msg.targetId,
            damage: result.damage,
        };
        context.broadcastS2C(SkillResult, res);
        maybeSettle(context);
        return true;
    };

    /** ⚠ 只经 `applyInjectedInputs` 进入（onBeforeStep）。 */
    const applyInjectedInput = (context: BallMoveContext, input: GameRoomInput): void => {
        if (disposed) return;
        const player = context.state.players.get(input.sessionId);
        if (!player || !player.alive || context.state.phase !== GamePhase.Playing) return;
        if (input.type === "move") {
            if (!tracker.hasInputCapacity()) return;
            acceptMoveInput(context, input.sessionId, input.dirX, input.dirY, input.tick);
            return;
        }
        const client = context.findClientBySession(input.sessionId);
        handleCastSkill(context, client, input, input.sessionId, input.tick);
    };

    const readInputSource = (tick: number): GameRoomInput[] => {
        if (disposed) return [];
        try {
            const candidate = inputSource?.(tick);
            if (!Array.isArray(candidate)) return [];
            // Read and validate the complete iterator before applying anything;
            // a broken iterator therefore cannot leave a half-applied frame.
            const length = candidate.length;
            if (!Number.isSafeInteger(length) || length < 0 || length > MAX_INPUTS_PER_SOURCE) return [];
            const iteratorFactory = (candidate as unknown as { [Symbol.iterator]?: unknown })[Symbol.iterator];
            if (typeof iteratorFactory !== "function") return [];
            const iterator = (iteratorFactory as () => Iterator<unknown>).call(candidate);
            const values: unknown[] = [];
            for (;;) {
                const step = iterator.next();
                if (!step || typeof step !== "object") return [];
                if (step.done) break;
                values.push(step.value);
                if (values.length > MAX_INPUTS_PER_SOURCE) return [];
            }

            const valid: GameRoomInput[] = [];
            for (const value of values) {
                const snapshot = snapshotInjectedInput(value);
                if (!snapshot || (snapshot.tick !== undefined && snapshot.tick !== tick)) continue;
                valid.push(snapshot);
            }
            return valid;
        } catch {
            // Replay/input adapters are outside the room boundary. A faulty
            // callback, iterator, or property must not abort the room loop.
            return [];
        }
    };

    const applyInjectedInputs = (context: BallMoveContext, tick: number): void => {
        if (disposed) return;
        // 丢弃已经错过的定时输入，避免坏回放数据无限滞留。
        for (let i = injectedInputs.length - 1; i >= 0; i--) {
            try {
                const queuedTick = injectedInputs[i].tick;
                if (queuedTick !== undefined && queuedTick < tick) injectedInputs.splice(i, 1);
            } catch {
                // The queue is normally made only of snapshots.  If a test or
                // adapter has tampered with it, discard the hostile entry.
                injectedInputs.splice(i, 1);
            }
        }
        const queued: GameRoomInput[] = [];
        for (let i = 0; i < injectedInputs.length; i++) {
            try {
                const input = injectedInputs[i];
                if (input.tick === undefined || input.tick === tick) queued.push(input);
            } catch {
                injectedInputs.splice(i, 1);
                i--;
            }
        }
        if (queued.length > 0) {
            for (const input of queued) {
                try { applyInjectedInput(context, input); } catch { /* drop this input */ }
            }
            for (const input of queued) {
                const index = injectedInputs.indexOf(input);
                if (index >= 0) injectedInputs.splice(index, 1);
            }
        }
        const sourced = readInputSource(tick);
        for (const input of sourced) {
            // `readInputSource` has already copied the value, so no hostile
            // getter can run during application.  Keep an item-level catch as
            // a final guard around injected gameplay/adapters.
            try { applyInjectedInput(context, input); } catch { /* drop this input */ }
        }
    };

    const mode = {
        id: BALL_MOVE_GAME_MODE_ID,
        roster: { min: BALL_MOVE_MIN_PLAYERS, max: MAX_PLAYERS, autoStart: BALL_MOVE_MIN_PLAYERS },
        createPlayer: ({ sessionId, name, randomInt }: {
            sessionId: string;
            name: string;
            randomInt(min: number, max: number): number;
        }) => {
            const player = new PlayerState();
            player.id = sessionId;
            player.name = name;
            player.x = randomInt(100, MAP_WIDTH - 100);
            player.y = randomInt(100, MAP_HEIGHT - 100);
            return player;
        },

        evidence: {
            assertRosterCompatible: (key: string, roster: { readonly min: number; readonly autoStart: number }) =>
                assertBallMoveRosterCompatible(key, roster),
            captureInitialState: () => {
                const context = ctx;
                if (!context) {
                    // onMatchInitialize 尚未运行（被测试替换掉）时无法冻结初始快照——
                    // fail-fast 走既有开局 rollback，⛔ 不产出半截证据。
                    throw new Error("[ballMove] evidence capture requires onMatchInitialize to have run");
                }
                tracker.captureInitialState(evidenceSource(context));
            },
            build: () => {
                const context = ctx;
                if (!context) return null;
                return tracker.build(evidenceSource(context));
            },
        },

        // 键由本玩法 wire token 派生（satisfies 钉住键集与 payload 类型）；payload 已由
        // catch-all dispatcher 过 exact validate。与拆出前的 handler 语义逐字一致：
        // 死亡/未入座静默消费，容量闸回 BadRequest。
        commands: {
            [Move.type]: (context, payload: IMoveReq): void => {
                capture(context);
                const player = context.state.players.get(context.client.sessionId);
                if (!player || !player.alive) return;
                if (!tracker.hasInputCapacity()) {
                    context.sendError(context.client, ErrorCode.BadRequest);
                    return;
                }
                acceptMoveInput(context, context.client.sessionId, payload.dirX, payload.dirY);
            },
            [CastSkill.type]: (context, payload: ICastSkillReq): void => {
                capture(context);
                const player = context.state.players.get(context.client.sessionId);
                if (!player || !player.alive) return;
                handleCastSkill(context, context.client, payload);
            },
        } satisfies GameplayCommandsFor<GameRoomState, typeof gameplayC2STokens.ballMove>,

        onBeforeStep: (context: BallMoveContext & { readonly dtMs: number }): void => {
            capture(context);
            applyInjectedInputs(context, context.state.tick);
        },

        onStep: (context: BallMoveContext & { readonly dtMs: number }): void => {
            capture(context);
            advanceBallMovePlayers(
                context.state.players,
                tracker.motionAnchors,
                context.state.tick,
                context.fixedStepMs,
            );
        },

        onMatchInitialize: (context: BallMoveContext): void => {
            capture(context);
            injectedInputs.length = 0;
            tracker.resetForMatch();
            // 出生点在正式 RNG 流中重新生成，因而等待期的展示 RNG/历史不会改变本局初始状态。
            // ⚠ context.random 转发到房间**当前**的 match 流（房间刚重建过），抽签序与 replay 一致。
            resetBallMovePlayers(context.state.players, tracker.motionAnchors, context.random);
        },

        onMatchRollback: (context: BallMoveContext): void => {
            capture(context);
            injectedInputs.length = 0;
            tracker.resetForMatch();
            tracker.motionAnchors.clear();
            context.state.players.forEach((player) => {
                // ⚠ 不重置 x/y：出生点在下一次开局时重新生成（与拆出前语义一致）。
                player.hp = PLAYER_INIT_HP;
                player.maxHp = PLAYER_INIT_HP;
                player.alive = true;
                player.dirX = 0;
                player.dirY = 0;
                player.lastCastTick = {};
                player.level = 1;
            });
        },

        onPlayerLeaving: (context: GameModePlayerLeavingContext<GameRoomState, PlayerState>): void => {
            capture(context);
            if (context.duringMatch) {
                mode.recordLeaveEvent(context.client.sessionId, context.acceptedTick);
                // 活着退房视为阵亡（名次/证据完整性要求每个参与者都有归宿）；已死者已在 deathOrder。
                // ⛔ 必须用 context 捕获的 player 引用，不得重新 players.get：调用方（或包装钩子）
                // 可能已把条目删掉，重取会漏记阵亡 → participants 与 initialRoster 不等长 →
                // build 返回 null → 整局证据被静默丢弃。被删掉的 Schema 对象仍是活的 JS 对象。
                if (context.player.alive) mode.recordDeath(context.client.sessionId);
            }
            tracker.motionAnchors.delete(context.client.sessionId);
        },

        shouldSettle: (context: BallMoveContext): boolean => {
            capture(context);
            return aliveCount(context) <= 1;
        },

        onDispose: (): void => {
            disposed = true;
            injectedInputs.length = 0;
            inputSource = undefined;
            tracker.resetForMatch();
            tracker.motionAnchors.clear();
        },

        // ── harness API（测试/回放边界）─────────────────────────────────────
        injectInput: (input: GameRoomInput): boolean => {
            if (disposed) return false;
            const context = ctx;
            if (!context || context.state.phase !== GamePhase.Playing) return false;
            const snapshot = snapshotInjectedInput(input);
            if (!snapshot) return false;
            injectedInputs.push(snapshot);
            return true;
        },
        setInputSource: (source: GameRoomInputSource | undefined): void => {
            inputSource = disposed ? undefined : source;
        },
        getAcceptedInputs: (): readonly AcceptedGameInput[] => tracker.snapshotAcceptedInputs(),
        get acceptedInputs(): readonly AcceptedGameInput[] {
            return tracker.snapshotAcceptedInputs();
        },
        recordLeaveEvent: (sessionId: string, acceptedTick: number): void => {
            tracker.recordLeaveEvent(sessionId, acceptedTick);
        },
        recordDeath: (sessionId: string): void => {
            tracker.recordDeath(sessionId);
        },
    };

    return mode;
}

/** Module-owned registration; generic GameRoom and transport code stay unchanged. */
export function registerBallMoveGameMode(
    registry: GameModeRegistry = gameModeRegistry,
): () => void {
    return registry.register<GameRoomState, PlayerState>(BALL_MOVE_GAME_MODE_ID, createBallMoveGameMode);
}
