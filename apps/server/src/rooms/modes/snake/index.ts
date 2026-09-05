/** Snake Endless V2 mode：房级无尽世界 + 真人个人 run 生命周期。 */
import {
    SnakeBaselineBegin,
    SnakeBaselineChunk,
    SnakeBaselineEnd,
    SnakeBaselineRequest,
    SnakeDelta,
    SnakeDeathCause,
    SnakeEndRun,
    SnakeInput,
    SnakeReliveDecision,
    SnakeReliveDecisionResult,
    SnakeReliveOffered,
    SnakeReliveResolved,
    SnakeRewardStatus,
    SnakeRunEndReason,
    SnakeRunFinalizing,
    SnakeRunResult,
    SnakeRunState,
    SnakeReliveReceiptState,
    gameplayC2STokens,
    snakeWireChecksum,
    type ISnakeBaselineRequestReq,
    type ISnakeEndlessRoomMeta,
    type ISnakeEndRunReq,
    type ISnakeInputReq,
    type ISnakePathDelta,
    type ISnakeReliveDecisionReq,
    type ISnakeReliveDecisionResult,
    type ISnakeReliveResolved,
    type ISnakeRunDelta,
    type ISnakeSnapshotSnake,
    type ISnakeWorldDelta,
    type ISnakeWorldSnapshot,
    type SnakeBaselineChunkKind,
    type SnakeTerminalEndReasonType,
} from "@game/shared";
import {
    SNAKE_ENDLESS_CONFIG,
    SNAKE_MAGNET_ELIGIBLE_RUN_STATES,
    SNAKE_RELIVE_COIN_COSTS,
    SNAKE_RULESET,
} from "@game/shared/gameplays/snake/ruleset";
import {
    gameModeRegistry,
    type GameMode,
    type GameModeCommandContext,
    type GameModeConnectionChangedContext,
    type GameModeContext,
    type GameModePlayerLeavingContext,
    type GameModeRegistry,
    type GameplayCommandsFor,
} from "../../GameMode";
import { SnakePlayerState, SnakeRoomState } from "../../schema/GameRoomState";
import { driveAi } from "./ai";
import {
    DEFAULT_SNAKE_RUN_SKIN_RESOLVER,
    ONLINE_COIN_RELIVE_PLAYER_RELEASED,
    resolveS2ReliveEconomy,
    type ReliveEconomyPort,
    type SnakeRunSkinResolver,
} from "./lifecycle";
import { SNAKE_AI_SKIN_POOL, resolveServerBattleSkin } from "./skinBusinessCatalog";
import { SnakeWorld, type SnakeBody, type SnakeSpawnPoint } from "./world";

const MODE_ID = "snake";
type SnakeContext = GameModeContext<SnakeRoomState>;

interface DeathSnapshot {
    readonly deathSeq: number;
    readonly length: number;
    readonly score: number;
    readonly killCount: number;
    readonly magnetCollected: number;
    readonly starCollected: number;
}

function snakeMetadataChanged(before: ISnakeSnapshotSnake, after: ISnakeSnapshotSnake): boolean {
    const { points: _beforePoints, ...beforeMetadata } = before;
    const { points: _afterPoints, ...afterMetadata } = after;
    return changed(beforeMetadata, afterMetadata);
}

function pathDeltaBetween(before: ISnakeSnapshotSnake, after: ISnakeSnapshotSnake): ISnakePathDelta | null {
    if (changed(before.points, after.points) === false) return { id: after.id, append: [], trimTail: 0 };
    const maxAppend = Math.min(64, after.points.length);
    for (let appendCount = 0; appendCount <= maxAppend; appendCount += 1) {
        const overlap = after.points.length - appendCount;
        if (overlap < 0 || overlap > before.points.length) continue;
        let equal = true;
        for (let index = 0; index < overlap; index += 1) {
            const left = before.points[index];
            const right = after.points[appendCount + index];
            if (left.x !== right.x || left.y !== right.y) { equal = false; break; }
        }
        if (equal) {
            return {
                id: after.id,
                append: after.points.slice(0, appendCount),
                trimTail: before.points.length - overlap,
            };
        }
    }
    return null;
}

interface StreamCursor {
    seq: number;
    snapshot: ISnakeWorldSnapshot;
}

interface DecisionRecord {
    readonly decision: "accept" | "decline";
    response?:
        | { readonly kind: "decisionResult"; readonly payload: ISnakeReliveDecisionResult }
        | { readonly kind: "resolved"; readonly payload: ISnakeReliveResolved };
}

interface SnakeAdmissionIdentity {
    readonly uid: string;
}

export interface SnakeGameModeOptions {
    readonly reliveEconomy?: ReliveEconomyPort;
    readonly runSkinResolver?: SnakeRunSkinResolver;
    readonly runtimeEnvironment?: string;
}

export type SnakeGameMode = GameMode<SnakeRoomState, SnakePlayerState> & {
    __probeWorld(): SnakeWorld | null;
    __probeEconomy(): ReliveEconomyPort;
    __probeDiagnostics(): Readonly<{
        deathSnapshots: number;
        spawnAttempts: number;
        pendingSpawns: number;
        decisionRecords: number;
        streamCursors: number;
        baselineNeeded: number;
        queuedEvents: number;
        snakes: number;
        pendingAiRespawns: number;
        tools: number;
    }>;
};

function changed<T>(left: T | undefined, right: T): boolean {
    return left === undefined || JSON.stringify(left) !== JSON.stringify(right);
}

function indexed<T extends { readonly id: string | number }>(items: readonly T[]): Map<T["id"], T> {
    return new Map(items.map((item) => [item.id, item]));
}

export function createSnakeGameMode(options: SnakeGameModeOptions = {}): SnakeGameMode {
    const economy = resolveS2ReliveEconomy(options.reliveEconomy, options.runtimeEnvironment);
    const skinResolver = options.runSkinResolver ?? DEFAULT_SNAKE_RUN_SKIN_RESOLVER;
    let roomEpochId = "";
    let world: SnakeWorld | null = null;
    let runCounter = 0;
    let joinCounter = 0;
    const deathSnapshots = new Map<string, DeathSnapshot>();
    const spawnAttempts = new Map<string, number>();
    const pendingSpawns = new Map<string, SnakeSpawnPoint>();
    const decisionRecords = new Map<string, DecisionRecord>();
    const admissionIdentities = new Map<string, SnakeAdmissionIdentity>();
    const streamCursors = new Map<string, StreamCursor>();
    const baselineNeeded = new Set<string>();
    const queuedDeaths: Array<{ snake: SnakeBody; cause: "wall" | "collision" | "forced" }> = [];
    const queuedEats: Array<{ snake: SnakeBody; kind: "dot" | "star" | "wreck" }> = [];
    const queuedMagnets: SnakeBody[] = [];

    const playerView = (context: SnakeContext, sessionId: string): SnakePlayerState | undefined =>
        context.state.players.get(sessionId);

    const identityOf = (context: SnakeContext, sessionId: string): SnakeAdmissionIdentity => {
        const uid = admissionIdentities.get(sessionId)?.uid ?? context.userIdOf(sessionId);
        if (!uid) throw new Error("[snake] authenticated uid missing for relive economy");
        return { uid };
    };

    const decisionKey = (runId: string, deathSeq: number, clientReqId: string): string =>
        `${runId}\u0000${deathSeq}\u0000${clientReqId}`;

    const sendDecisionRecord = (
        context: SnakeContext,
        sessionId: string,
        record: DecisionRecord,
    ): void => {
        if (!record.response) return;
        const client = context.findClientBySession(sessionId);
        if (record.response.kind === "decisionResult") {
            context.sendS2C(client, SnakeReliveDecisionResult, record.response.payload);
        } else {
            context.sendS2C(client, SnakeReliveResolved, record.response.payload);
        }
    };

    const cacheDecisionResponse = (
        runId: string,
        deathSeq: number,
        clientReqId: string | undefined,
        response: DecisionRecord["response"],
    ): void => {
        if (!clientReqId || !response) return;
        const record = decisionRecords.get(decisionKey(runId, deathSeq, clientReqId));
        if (record) record.response = response;
    };

    const transition = (player: SnakePlayerState, state: string): void => {
        if (player.runState === state) return;
        player.runState = state as SnakePlayerState["runState"];
        player.stateVersion += 1;
    };

    const runDelta = (player: SnakePlayerState, tick: number): ISnakeRunDelta => ({
        id: player.id,
        runId: player.runId,
        state: player.runState,
        stateVersion: player.stateVersion,
        deathSeq: player.deathSeq,
        deathCause: player.deathCause,
        magnetCollected: player.magnetCollected,
        starCollected: player.starCollected,
        magnetUntilTick: player.runState === SnakeRunState.Active && player.alive
            && player.magnetUntilTick > tick ? player.magnetUntilTick : null,
    });

    const runDeltas = (context: SnakeContext): readonly ISnakeRunDelta[] =>
        [...context.state.players.values()]
            .sort((left, right) => left.joinOrdinal - right.joinOrdinal || left.id.localeCompare(right.id))
            .map((player) => runDelta(player, world?.tick ?? context.state.tick));

    const meta = (context: SnakeContext): ISnakeEndlessRoomMeta => ({
        roomEpochId,
        playingStartedTick: world ? context.state.playingStartedTick : null,
        battlefieldConfigId: SNAKE_ENDLESS_CONFIG.battlefieldConfigId,
        lifecycleConfigId: SNAKE_ENDLESS_CONFIG.lifecycleConfigId,
        reliveFlowConfigId: SNAKE_ENDLESS_CONFIG.reliveFlowConfigId,
        relivePolicyId: SNAKE_ENDLESS_CONFIG.relivePolicyId,
        onlineAdaptationId: SNAKE_ENDLESS_CONFIG.onlineAdaptationId,
        layerVersions: SNAKE_ENDLESS_CONFIG.layerVersions,
        layerHashes: SNAKE_ENDLESS_CONFIG.layerHashes,
        configHash: SNAKE_ENDLESS_CONFIG.configHash,
        totalTime: 0,
        matchDurationTicks: 0,
        hasDeadline: false,
        endTick: null,
    });

    const snapshotFor = (context: SnakeContext, sessionId: string, seq: number): ISnakeWorldSnapshot => {
        if (!world) throw new Error("[snake] snapshot requested without world");
        const snapshot = world.buildSnapshot(roomEpochId, seq, runDeltas(context));
        return {
            ...snapshot,
            displayRank: world.displayRanking(sessionId),
        };
    };

    const chunksOf = (snapshot: ISnakeWorldSnapshot): ReadonlyArray<{
        readonly kind: SnakeBaselineChunkKind;
        readonly items: readonly unknown[];
    }> => {
        const result: Array<{ kind: SnakeBaselineChunkKind; items: readonly unknown[] }> = [];
        const add = (kind: SnakeBaselineChunkKind, items: readonly unknown[]): void => {
            for (let offset = 0; offset < items.length; offset += SNAKE_RULESET.snapshotChunkItems) {
                result.push({ kind, items: items.slice(offset, offset + SNAKE_RULESET.snapshotChunkItems) });
            }
        };
        add("snakes", snapshot.snakes);
        add("foods", snapshot.foods);
        add("wrecks", snapshot.wrecks);
        add("tools", snapshot.tools);
        add("runs", snapshot.runs);
        add("displayRank", snapshot.displayRank);
        return result;
    };

    const sendBaseline = (context: SnakeContext, sessionId: string): void => {
        if (!world) return;
        const client = context.findClientBySession(sessionId);
        const old = streamCursors.get(sessionId);
        const seq = (old?.seq ?? 0) + 1;
        const snapshot = snapshotFor(context, sessionId, seq);
        const chunks = chunksOf(snapshot);
        const baselineId = `${roomEpochId}:baseline:${sessionId}:${seq}`;
        context.sendS2C(client, SnakeBaselineBegin, {
            baselineId,
            roomEpochId,
            envelopeTick: snapshot.envelopeTick,
            seq,
            chunkCount: chunks.length,
            snakeCount: snapshot.snakes.length,
            foodCount: snapshot.foods.length,
            wreckCount: snapshot.wrecks.length,
            toolCount: snapshot.tools.length,
            runCount: snapshot.runs.length,
            pointCount: snapshot.snakes.reduce((sum, snake) => sum + snake.points.length, 0),
            meta: meta(context),
        });
        chunks.forEach((chunk, index) => context.sendS2C(client, SnakeBaselineChunk, {
            baselineId,
            roomEpochId,
            envelopeTick: snapshot.envelopeTick,
            seq,
            index,
            kind: chunk.kind,
            items: chunk.items,
        }));
        context.sendS2C(client, SnakeBaselineEnd, {
            baselineId,
            roomEpochId,
            envelopeTick: snapshot.envelopeTick,
            seq,
            checksum: snakeWireChecksum(snapshot),
        });
        streamCursors.set(sessionId, { seq, snapshot });
        baselineNeeded.delete(sessionId);
        context.state.baselineSeq += 1;
        context.state.snapshotSeq = Math.max(context.state.snapshotSeq, seq);
    };

    const deltaBetween = (previous: ISnakeWorldSnapshot, current: ISnakeWorldSnapshot): ISnakeWorldDelta => {
        const diff = <T extends { readonly id: string | number }>(before: readonly T[], after: readonly T[]) => {
            const beforeMap = indexed(before);
            const afterMap = indexed(after);
            return {
                upserts: after.filter((item) => changed(beforeMap.get(item.id), item)),
                removals: before.filter((item) => !afterMap.has(item.id)).map((item) => item.id),
            };
        };
        const beforeSnakes = indexed(previous.snakes);
        const afterSnakes = indexed(current.snakes);
        const snakeUpserts: ISnakeSnapshotSnake[] = [];
        const snakePathDeltas: ISnakePathDelta[] = [];
        for (const snake of current.snakes) {
            const before = beforeSnakes.get(snake.id);
            if (!before || snakeMetadataChanged(before, snake)) {
                snakeUpserts.push(snake);
                continue;
            }
            const pathDelta = pathDeltaBetween(before, snake);
            if (!pathDelta) snakeUpserts.push(snake);
            else if (pathDelta.append.length > 0 || pathDelta.trimTail > 0) snakePathDeltas.push(pathDelta);
        }
        const foods = diff(previous.foods, current.foods);
        const wrecks = diff(previous.wrecks, current.wrecks);
        const tools = diff(previous.tools, current.tools);
        const beforeRuns = new Map(previous.runs.map((run) => [run.id, run]));
        const currentRunIds = new Set(current.runs.map((run) => run.id));
        return {
            roomEpochId,
            tick: current.tick,
            envelopeTick: current.envelopeTick,
            seq: current.seq,
            baseSeq: previous.seq,
            snakeUpserts,
            snakePathDeltas,
            snakeRemovals: previous.snakes.filter((snake) => !afterSnakes.has(snake.id)).map((snake) => snake.id),
            foodUpserts: foods.upserts,
            foodRemovals: foods.removals as readonly number[],
            wreckUpserts: wrecks.upserts,
            wreckRemovals: wrecks.removals as readonly number[],
            toolUpserts: tools.upserts,
            toolRemovals: tools.removals as readonly number[],
            runRemovals: previous.runs.filter((run) => !currentRunIds.has(run.id)).map((run) => run.id),
            runUpdates: current.runs.filter((run) => changed(beforeRuns.get(run.id), run)),
            displayRank: current.displayRank,
            checksum: snakeWireChecksum(current),
        };
    };

    const sendWorldUpdate = (context: SnakeContext, sessionId: string): void => {
        if (!world) return;
        const cursor = streamCursors.get(sessionId);
        if (!cursor || baselineNeeded.has(sessionId)) {
            sendBaseline(context, sessionId);
            return;
        }
        const current = snapshotFor(context, sessionId, cursor.seq + 1);
        context.sendS2C(context.findClientBySession(sessionId), SnakeDelta, deltaBetween(cursor.snapshot, current));
        streamCursors.set(sessionId, { seq: current.seq, snapshot: current });
        context.state.snapshotSeq = Math.max(context.state.snapshotSeq, current.seq);
    };

    const project = (context: SnakeContext): void => {
        if (!world) return;
        for (const player of context.state.players.values()) {
            const snake = world.get(player.id);
            if (!snake) continue;
            player.alive = snake.alive;
            player.score = snake.score;
            player.length = Math.round(snake.length);
            player.deathCount = snake.deathCount;
            player.killCount = snake.killCount;
            player.headX = snake.points[0]?.x ?? 0;
            player.headY = snake.points[0]?.y ?? 0;
            player.direction = snake.direction;
            player.boost = snake.boostActive;
            player.ackSeq = snake.lastAcceptedSeq;
            player.magnetUntilTick = snake.alive && snake.magnetUntilTick > world.tick
                ? snake.magnetUntilTick : 0;
            player.protectUntilTick = snake.alive && snake.protectUntilTick > world.tick
                ? snake.protectUntilTick : 0;
        }
    };

    const sendFinal = (context: SnakeContext, player: SnakePlayerState, reason: SnakeTerminalEndReasonType): void => {
        if (player.runState === SnakeRunState.Finalized || player.runState === SnakeRunState.Finalizing) return;
        player.terminalIntent = reason;
        transition(player, SnakeRunState.Finalizing);
        const client = context.findClientBySession(player.id);
        context.sendS2C(client, SnakeRunFinalizing, {
            runId: player.runId,
            stateVersion: player.stateVersion,
            endReason: reason,
            reliveReceiptState: player.reliveReceiptState,
        });
        transition(player, SnakeRunState.Finalized);
        context.sendS2C(client, SnakeRunResult, {
            resultVersion: 1,
            runId: player.runId,
            endReason: reason,
            confirmedThroughTick: world?.tick ?? context.state.tick,
            rewardStatus: SnakeRewardStatus.NotEnabled,
        });
        spawnAttempts.delete(player.id);
        pendingSpawns.delete(player.id);
        deathSnapshots.delete(player.id);
    };

    const resolveWithoutRevive = (
        context: SnakeContext,
        player: SnakePlayerState,
        result: "declined" | "timeout" | "spawnFailed" | "systemFailed",
        reason: SnakeTerminalEndReasonType,
        clientReqId?: string,
    ): void => {
        const payload: ISnakeReliveResolved = {
            runId: player.runId,
            deathSeq: player.deathSeq,
            ...(clientReqId ? { clientReqId } : {}),
            result,
            resolvedTick: world?.tick ?? context.state.tick,
        };
        cacheDecisionResponse(player.runId, player.deathSeq, clientReqId, { kind: "resolved", payload });
        context.sendS2C(context.findClientBySession(player.id), SnakeReliveResolved, payload);
        sendFinal(context, player, reason);
    };

    const handleDeath = (context: SnakeContext, snake: SnakeBody, cause: "wall" | "collision" | "forced"): void => {
        if (snake.isAi) return;
        const player = playerView(context, snake.id);
        if (!player || player.runState !== SnakeRunState.Active) return;
        player.deathSeq += 1;
        player.deathCause = cause;
        player.magnetUntilTick = 0;
        deathSnapshots.set(player.id, {
            deathSeq: player.deathSeq,
            length: snake.length,
            score: snake.score,
            killCount: snake.killCount,
            magnetCollected: player.magnetCollected,
            starCollected: player.starCollected,
        });
        if (cause === "forced" || player.terminalIntent !== SnakeRunEndReason.None) {
            sendFinal(context, player, player.terminalIntent === SnakeRunEndReason.None
                ? SnakeRunEndReason.ForcedDeath : player.terminalIntent as SnakeTerminalEndReasonType);
            return;
        }
        transition(player, SnakeRunState.DeadPresentation);
        player.resolveAtTick = (world?.tick ?? context.state.tick) + SNAKE_RULESET.humanDeathPresentationTicks;
    };

    const offerRelive = (context: SnakeContext, player: SnakePlayerState): void => {
        const tick = world?.tick ?? context.state.tick;
        if (economy.kind === "disabled") {
            sendFinal(context, player, SnakeRunEndReason.DeathNoOffer);
            return;
        }
        const reliveIndex = player.relivesUsed + 1;
        const coinCost = SNAKE_RELIVE_COIN_COSTS[reliveIndex - 1];
        if (coinCost === undefined) {
            sendFinal(context, player, SnakeRunEndReason.DeathNoOffer);
            return;
        }
        transition(player, SnakeRunState.ReliveOffering);
        player.reliveIndex = reliveIndex;
        player.coinCost = coinCost;
        player.offeredTick = tick;
        player.decisionDeadlineTick = tick + SNAKE_RULESET.reliveDecisionTicks;
        transition(player, SnakeRunState.PendingRelive);
        context.sendS2C(context.findClientBySession(player.id), SnakeReliveOffered, {
            runId: player.runId,
            deathSeq: player.deathSeq,
            offeredTick: player.offeredTick,
            decisionDeadlineTick: player.decisionDeadlineTick,
            reliveIndex,
            relivesRemaining: SNAKE_RULESET.maxSuccessfulRelives - player.relivesUsed,
            coinCost,
            relivePolicyVersion: player.relivePolicyVersion,
        });
    };

    const commitRelive = (context: SnakeContext, player: SnakePlayerState, spawn: SnakeSpawnPoint): void => {
        const snapshot = deathSnapshots.get(player.id);
        if (!snapshot || snapshot.deathSeq !== player.deathSeq) {
            resolveWithoutRevive(context, player, "systemFailed", SnakeRunEndReason.ReliveSystemFailed,
                player.decisionClientReqId || undefined);
            return;
        }
        transition(player, SnakeRunState.ReliveCommitting);
        player.reliveReceiptState = SnakeReliveReceiptState.Processing;
        const result = economy.commit({
            ...identityOf(context, player.id),
            roomEpochId,
            runId: player.runId,
            deathSeq: player.deathSeq,
            clientReqId: player.decisionClientReqId,
            coinCost: player.coinCost,
        });
        if (result.kind === "insufficientCoins" || result.kind === "retryableFailure") {
            player.reliveReceiptState = SnakeReliveReceiptState.None;
            transition(player, SnakeRunState.PendingRelive);
            if (result.kind === "insufficientCoins") player.coinBalance = result.balanceAfter;
            const payload: ISnakeReliveDecisionResult = {
                runId: player.runId,
                deathSeq: player.deathSeq,
                clientReqId: player.decisionClientReqId,
                outcome: result.kind,
                retryable: result.kind === "retryableFailure",
                ...(result.kind === "insufficientCoins" ? { balanceAfter: result.balanceAfter } : {}),
            };
            cacheDecisionResponse(player.runId, player.deathSeq, player.decisionClientReqId,
                { kind: "decisionResult", payload });
            context.sendS2C(context.findClientBySession(player.id), SnakeReliveDecisionResult, payload);
            return;
        }
        if (result.kind === "systemFailure") {
            player.reliveReceiptState = SnakeReliveReceiptState.None;
            resolveWithoutRevive(context, player, "systemFailed", SnakeRunEndReason.ReliveSystemFailed,
                player.decisionClientReqId);
            return;
        }
        player.receiptId = result.receiptId;
        player.coinBalance = result.balanceAfter;
        player.reliveReceiptState = SnakeReliveReceiptState.Applied;
        transition(player, SnakeRunState.ReliveReady);
        pendingSpawns.set(player.id, spawn);
    };

    const activateReady = (context: SnakeContext): void => {
        if (!world) return;
        for (const player of context.state.players.values()) {
            if (player.runState !== SnakeRunState.ReliveReady) continue;
            const snapshot = deathSnapshots.get(player.id);
            const spawn = pendingSpawns.get(player.id);
            if (!snapshot || !spawn || snapshot.deathSeq !== player.deathSeq) {
                resolveWithoutRevive(context, player, "systemFailed", SnakeRunEndReason.ReliveSystemFailed,
                    player.decisionClientReqId || undefined);
                continue;
            }
            const protectStartTick = world.tick + 1;
            const snake = world.reviveHumanAt(player.id, spawn, snapshot, protectStartTick);
            if (!snake) {
                resolveWithoutRevive(context, player, "systemFailed", SnakeRunEndReason.ReliveSystemFailed,
                    player.decisionClientReqId || undefined);
                continue;
            }
            player.relivesUsed += 1;
            player.reliveReceiptState = SnakeReliveReceiptState.Activated;
            player.magnetCollected = snapshot.magnetCollected;
            player.starCollected = snapshot.starCollected;
            player.magnetUntilTick = 0;
            player.deathCause = SnakeDeathCause.None;
            player.resolveAtTick = 0;
            transition(player, SnakeRunState.Active);
            const payload: ISnakeReliveResolved = {
                runId: player.runId,
                deathSeq: player.deathSeq,
                clientReqId: player.decisionClientReqId,
                result: "revived",
                resolvedTick: protectStartTick,
                protectUntilTick: protectStartTick + SNAKE_RULESET.reliveProtectionTicks,
                receiptId: player.receiptId,
            };
            cacheDecisionResponse(player.runId, player.deathSeq, player.decisionClientReqId,
                { kind: "resolved", payload });
            context.sendS2C(context.findClientBySession(player.id), SnakeReliveResolved, payload);
            pendingSpawns.delete(player.id);
            spawnAttempts.delete(player.id);
            deathSnapshots.delete(player.id);
        }
    };

    const advanceRunStates = (context: SnakeContext): void => {
        if (!world) return;
        for (const player of context.state.players.values()) {
            if (player.runState === SnakeRunState.Preparing && world.tick > world.movementStartTick) {
                player.runStartedTick = world.tick;
                transition(player, SnakeRunState.Active);
            } else if (player.runState === SnakeRunState.DeadPresentation && world.tick >= player.resolveAtTick) {
                offerRelive(context, player);
            } else if (player.runState === SnakeRunState.PendingRelive
                && world.tick >= player.decisionDeadlineTick) {
                resolveWithoutRevive(context, player, "timeout", SnakeRunEndReason.ReliveTimeout);
            } else if (player.runState === SnakeRunState.ReliveSpawning) {
                const attempts = (spawnAttempts.get(player.id) ?? 0) + 1;
                spawnAttempts.set(player.id, attempts);
                const spawn = world.tryPickHumanReliveSpawn();
                if (spawn) commitRelive(context, player, spawn);
                else if (attempts >= SNAKE_RULESET.reliveSpawnSearchTicks) {
                    resolveWithoutRevive(context, player, "spawnFailed", SnakeRunEndReason.ReliveSpawnFailed,
                        player.decisionClientReqId || undefined);
                }
            }
        }
    };

    const processWorldEvents = (context: SnakeContext): void => {
        for (const event of queuedDeaths.splice(0)) handleDeath(context, event.snake, event.cause);
        for (const event of queuedEats.splice(0)) {
            if (event.snake.isAi) continue;
            const player = playerView(context, event.snake.id);
            if (player && event.kind === "star") player.starCollected += 1;
        }
        for (const snake of queuedMagnets.splice(0)) {
            if (snake.isAi) continue;
            const player = playerView(context, snake.id);
            if (player) player.magnetCollected += 1;
        }
    };

    const resetRunForMatch = (player: SnakePlayerState): void => {
        player.connected = true;
        player.alive = true;
        player.score = 0;
        player.length = SNAKE_RULESET.spawnLength;
        player.deathCount = 0;
        player.killCount = 0;
        player.magnetUntilTick = 0;
        player.protectUntilTick = 0;
        player.runState = SnakeRunState.Preparing;
        player.stateVersion = Math.max(1, player.stateVersion);
        player.runStartedTick = 0;
        player.activeTicks = 0;
        player.deathSeq = 0;
        player.deathCause = SnakeDeathCause.None;
        player.relivesUsed = 0;
        player.magnetCollected = 0;
        player.starCollected = 0;
        player.relivePolicyVersion = 1;
        player.terminalIntent = SnakeRunEndReason.None;
        player.resolveAtTick = 0;
        player.reliveIndex = 0;
        player.coinCost = 0;
        const identity = admissionIdentities.get(player.id);
        player.coinBalance = identity ? economy.balance(identity) : 0;
        player.offeredTick = 0;
        player.decisionDeadlineTick = 0;
        player.decisionClientReqId = "";
        player.receiptId = "";
        player.reliveReceiptState = SnakeReliveReceiptState.None;
    };

    const mode: SnakeGameMode = {
        id: MODE_ID,
        roster: { min: 1, max: 8, autoStart: 1 },
        roomLifecycle: {
            stableRoomEpoch: true,
            onRoomInitialize: (context): void => {
                roomEpochId = context.roomEpochId;
                context.state.roomEpochId = roomEpochId;
                context.state.matchId = roomEpochId;
                context.state.onlineCoinReliveEnabled = ONLINE_COIN_RELIVE_PLAYER_RELEASED;
            },
        },

        onAdmission: (context): boolean => {
            const auth = (context.client as unknown as {
                auth?: { readonly userId?: unknown; readonly sId?: unknown };
            }).auth;
            if (typeof auth?.userId !== "string" || auth.userId.length === 0 || auth.sId !== context.sId) return false;
            admissionIdentities.set(context.client.sessionId, { uid: auth.userId });
            return true;
        },

        createPlayer: ({ sessionId, name }) => {
            if (!roomEpochId) throw new Error("[snake] room epoch must exist before admission");
            // uid 由服务端从准入身份反查，⛔ 不读 join 自报皮肤（拍板 A）。未认证 fixture 为 null。
            const requestedSkin = skinResolver.resolve({
                roomEpochId,
                sessionId,
                uid: admissionIdentities.get(sessionId)?.uid ?? null,
            });
            const skin = resolveServerBattleSkin(requestedSkin);
            if (skin.usedFallback && requestedSkin !== skin.resolvedSkinId) {
                throw new Error(`[snake] RunSkinResolver returned unpublished skinId ${String(requestedSkin)}`);
            }
            const player = new SnakePlayerState();
            player.id = sessionId;
            player.name = name;
            player.connected = true;
            player.skinId = skin.resolvedSkinId;
            player.runId = `${roomEpochId}:run:${++runCounter}`;
            player.joinOrdinal = ++joinCounter;
            resetRunForMatch(player);
            if (world) {
                const snake = world.addPlayerSnake(sessionId, name, player.skinId);
                while (world.countAi() > world.aiTargetCount(world.countHumans())) {
                    if (!world.cullAiForJoin()) break;
                }
                if (world.tick > world.movementStartTick) {
                    player.runStartedTick = world.tick;
                    transition(player, SnakeRunState.Active);
                }
                player.protectUntilTick = snake.protectUntilTick;
            }
            baselineNeeded.add(sessionId);
            return player;
        },

        commands: {
            [SnakeInput.type]: (context: GameModeCommandContext<SnakeRoomState>, payload: ISnakeInputReq): void => {
                const player = playerView(context, context.client.sessionId);
                if (!world || !player || !player.connected || player.runState !== SnakeRunState.Active) return;
                if (world.applyInput(player.id, payload.dirX, payload.dirY, payload.boost, payload.seq)) {
                    player.ackSeq = payload.seq;
                }
            },
            [SnakeReliveDecision.type]: (context: GameModeCommandContext<SnakeRoomState>, payload: ISnakeReliveDecisionReq): void => {
                const player = playerView(context, context.client.sessionId);
                const tick = world?.tick ?? context.state.tick;
                const key = decisionKey(payload.runId, payload.deathSeq, payload.clientReqId);
                const previous = decisionRecords.get(key);
                if (previous) {
                    if (previous.decision === payload.decision) sendDecisionRecord(context, context.client.sessionId, previous);
                    else context.sendS2C(context.client, SnakeReliveResolved, {
                        runId: payload.runId,
                        deathSeq: payload.deathSeq,
                        clientReqId: payload.clientReqId,
                        result: "ineligible",
                        resolvedTick: tick,
                    });
                    return;
                }
                if (!player || !world || player.runId !== payload.runId || player.deathSeq !== payload.deathSeq
                    || player.runState !== SnakeRunState.PendingRelive) {
                    context.sendS2C(context.client, SnakeReliveResolved, {
                        runId: payload.runId,
                        deathSeq: payload.deathSeq,
                        clientReqId: payload.clientReqId,
                        result: "ineligible",
                        resolvedTick: tick,
                    });
                    return;
                }
                decisionRecords.set(key, { decision: payload.decision });
                player.decisionClientReqId = payload.clientReqId;
                if (tick >= player.decisionDeadlineTick) {
                    resolveWithoutRevive(context, player, "timeout", SnakeRunEndReason.ReliveTimeout, payload.clientReqId);
                    return;
                }
                if (payload.decision === "decline") {
                    resolveWithoutRevive(context, player, "declined", SnakeRunEndReason.ReliveDeclined, payload.clientReqId);
                    return;
                }
                spawnAttempts.set(player.id, 0);
                transition(player, SnakeRunState.ReliveSpawning);
            },
            [SnakeEndRun.type]: (context: GameModeCommandContext<SnakeRoomState>, payload: ISnakeEndRunReq): void => {
                const player = playerView(context, context.client.sessionId);
                if (!player || player.runId !== payload.runId || player.runState === SnakeRunState.Finalized) return;
                player.decisionClientReqId = payload.clientReqId;
                player.terminalIntent = SnakeRunEndReason.ExplicitExit;
                if (world?.get(player.id)?.alive) world.forceKill(player.id);
                else sendFinal(context, player, SnakeRunEndReason.ExplicitExit);
            },
            [SnakeBaselineRequest.type]: (context: GameModeCommandContext<SnakeRoomState>, payload: ISnakeBaselineRequestReq): void => {
                if (payload.roomEpochId !== roomEpochId) return;
                baselineNeeded.add(context.client.sessionId);
                sendBaseline(context, context.client.sessionId);
            },
        } satisfies GameplayCommandsFor<SnakeRoomState, typeof gameplayC2STokens.snake>,

        onMatchInitialize: (context): void => {
            if (context.fixedStepMs !== SNAKE_RULESET.fixedStepMs) {
                throw new Error(`[snake] fixedStep ${context.fixedStepMs} != ${SNAKE_RULESET.fixedStepMs}`);
            }
            if (!roomEpochId || context.state.matchId !== roomEpochId) {
                throw new Error("[snake] stable room epoch was not initialized before match start");
            }
            world = new SnakeWorld({
                matchSeed: context.matchSeed,
                playingStartedTick: 0,
                aiSkinPool: SNAKE_AI_SKIN_POOL,
                events: {
                    onDeath: (snake, _killer, cause) => queuedDeaths.push({ snake, cause }),
                    onEat: (snake, kind) => queuedEats.push({ snake, kind }),
                    onMagnetPickup: (snake) => queuedMagnets.push(snake),
                },
            });
            for (const player of context.state.players.values()) {
                resetRunForMatch(player);
                world.addPlayerSnake(player.id, player.name, player.skinId);
                baselineNeeded.add(player.id);
            }
            world.addInitialAiLineup();
            while (world.countAi() > world.aiTargetCount(world.countHumans())) {
                if (!world.cullAiForJoin()) break;
            }
            context.state.roomEpochId = roomEpochId;
            context.state.matchId = roomEpochId;
            context.state.playingStartedTick = 0;
            context.state.countdownEndTick = world.movementStartTick;
            context.state.totalTime = 0;
            context.state.matchDurationTicks = 0;
            context.state.hasDeadline = false;
            context.state.endTick = 0;
            context.state.snapshotSeq = 0;
            context.state.baselineSeq = 0;
            context.state.draining = false;
            context.state.onlineCoinReliveEnabled = false;
            streamCursors.clear();
            project(context);
        },

        onMatchStart: (context): void => {
            for (const sessionId of context.state.players.keys()) sendBaseline(context, sessionId);
        },

        onMatchRollback: (context): void => {
            world = null;
            context.state.countdownEndTick = 0;
            context.state.snapshotSeq = 0;
            context.state.baselineSeq = 0;
            streamCursors.clear();
            baselineNeeded.clear();
            deathSnapshots.clear();
            spawnAttempts.clear();
            pendingSpawns.clear();
            decisionRecords.clear();
        },

        onStep: (context): void => {
            if (!world) return;
            for (const player of context.state.players.values()) {
                const snake = world.get(player.id);
                if (player.connected && player.runState === SnakeRunState.Active && snake?.alive) player.activeTicks += 1;
            }
            activateReady(context);
            const gateRuns = [...context.state.players.values()].map((player) => ({
                state: player.runState,
                length: world?.get(player.id)?.length ?? player.length,
            })).filter((run) => SNAKE_MAGNET_ELIGIBLE_RUN_STATES.includes(
                run.state as typeof SNAKE_MAGNET_ELIGIBLE_RUN_STATES[number],
            ));
            for (const snake of world.snakes) if (snake.isAi && snake.alive) driveAi(world, snake, world.rngAi);
            world.step(gateRuns);
            processWorldEvents(context);
            advanceRunStates(context);
            project(context);
            if (world.tick % SNAKE_RULESET.snapshotEveryTicks === 0) {
                for (const sessionId of context.state.players.keys()) sendWorldUpdate(context, sessionId);
            }
        },

        onConnectionChanged: (context: GameModeConnectionChangedContext<SnakeRoomState, SnakePlayerState>): void => {
            context.player.connected = context.connected;
            if (!context.connected) world?.disconnectHuman(context.player.id);
            baselineNeeded.add(context.player.id);
        },

        onPlayerLeaving: (context: GameModePlayerLeavingContext<SnakeRoomState, SnakePlayerState>): void => {
            if (context.player.runState !== SnakeRunState.Finalized) {
                sendFinal(context, context.player, context.consented
                    ? SnakeRunEndReason.ExplicitExit : SnakeRunEndReason.DisconnectTimeout);
            }
            world?.removePlayerSnake(context.player.id);
            if (world) while (world.countAi() < world.aiTargetCount(world.countHumans())) world.addAiSnake(401);
            streamCursors.delete(context.player.id);
            baselineNeeded.delete(context.player.id);
            deathSnapshots.delete(context.player.id);
            spawnAttempts.delete(context.player.id);
            pendingSpawns.delete(context.player.id);
            for (const key of decisionRecords.keys()) {
                if (key.startsWith(`${context.player.runId}\u0000`)) decisionRecords.delete(key);
            }
        },

        onLeave: (context): void => {
            admissionIdentities.delete(context.client.sessionId);
        },

        shouldSettle: (): boolean => false,

        onDispose: (context): void => {
            context.state.draining = true;
            for (const player of context.state.players.values()) {
                if (player.runState !== SnakeRunState.Finalized) sendFinal(context, player, SnakeRunEndReason.ServerDrain);
            }
            world = null;
            streamCursors.clear();
            baselineNeeded.clear();
            deathSnapshots.clear();
            spawnAttempts.clear();
            pendingSpawns.clear();
            decisionRecords.clear();
            admissionIdentities.clear();
            queuedDeaths.length = 0;
            queuedEats.length = 0;
            queuedMagnets.length = 0;
        },

        __probeWorld: () => world,
        __probeEconomy: () => economy,
        __probeDiagnostics: () => ({
            deathSnapshots: deathSnapshots.size,
            spawnAttempts: spawnAttempts.size,
            pendingSpawns: pendingSpawns.size,
            decisionRecords: decisionRecords.size,
            streamCursors: streamCursors.size,
            baselineNeeded: baselineNeeded.size,
            queuedEvents: queuedDeaths.length + queuedEats.length + queuedMagnets.length,
            snakes: world?.snakes.length ?? 0,
            pendingAiRespawns: world?.pendingAiRespawnCount ?? 0,
            tools: world?.toolList().length ?? 0,
        }),
    };
    return mode;
}

export function registerSnakeGameMode(registry: GameModeRegistry = gameModeRegistry): () => void {
    return registry.register<SnakeRoomState, SnakePlayerState>(MODE_ID, createSnakeGameMode);
}
