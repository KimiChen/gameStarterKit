/**
 * snake 玩法的服务端 mode 装配层（docs/snakeoff/03/04/05；drop-in 自由加入房型，
 * 拍板 2026-09-02：90 秒限时计分 + 死亡 2s 复活 + AI 填充）。
 *
 * 职责边界：
 *  - 世界模拟在 world.ts（纯 TS、零引擎）、AI 决策在 ai.ts、纯规则在 rules.ts——
 *    本文件只做 GameMode 钩子装配与 Schema 摘要投影；
 *  - 房间语义全部复用框架 drop-in（首人即开局/Playing 准入/不锁房/满员撮合排除），
 *    roster {min:1, max:8, autoStart:1} 由注册期断言钉死（⛔ 与 invite-code、
 *    evidence 互斥——动态 roster 的证据属未来独立设计）；
 *  - AI 填充：总蛇数目标 = ruleset.aiFillTarget；真人加入 → 最低分 AI 死亡掉落让位，
 *    真人最终离开 → 补刷 AI（world.ts 的 cullAiForJoin/addAiSnake）。
 */
import {
    gameplayC2STokens,
    SnakeInput,
    SnakeSnapshot,
    type ISnakeInputReq,
} from "@game/shared";
import { SNAKE_RULESET } from "@game/shared/gameplays/snake/ruleset";
import type {
    GameMode,
    GameModeCommandContext,
    GameModeContext,
    GameModePlayerLeavingContext,
    GameplayCommandsFor,
} from "../../GameMode";
import { SnakePlayerState, SnakeRoomState } from "../../schema/GameRoomState";
import { driveAi } from "./ai";
import { SnakeWorld } from "./world";

const MODE_ID = "snake";

type SnakeContext = GameModeContext<SnakeRoomState>;

/** snake mode 类型：GameMode + 测试探针（ballMove harness 先例）。 */
export type SnakeGameMode = GameMode<SnakeRoomState, SnakePlayerState> & {
    /** 测试观察面：当前世界实例（无对局时 null）。⛔ 生产路径不读。 */
    __probeWorld(): SnakeWorld | null;
};

/** 创建 snake GameMode（每房一个实例；世界状态挂在闭包上，⛔ 不进模块级变量）。 */
export function createSnakeGameMode(): SnakeGameMode {
    let world: SnakeWorld | null = null;
    let snapshotSeq = 0;
    let joinCounter = 0;

    const playerView = (context: SnakeContext, sessionId: string): SnakePlayerState | undefined =>
        context.state.players.get(sessionId);

    /** 把世界状态投影进 Schema 摘要（HUD/排名轻量面；完整蛇身走快照）。 */
    const project = (context: SnakeContext): void => {
        if (!world) return;
        for (const snake of world.snakes) {
            if (snake.isAi) continue;
            const player = playerView(context, snake.id);
            if (!player) continue;
            player.alive = snake.alive;
            player.score = snake.score;
            player.length = Math.round(snake.length);
            player.deathCount = snake.deathCount;
            player.killCount = snake.killCount;
            player.headX = snake.points[0].x;
            player.headY = snake.points[0].y;
            player.direction = snake.direction;
            player.boost = snake.boostActive;
            player.ackSeq = snake.lastAcceptedSeq;
            player.respawnTick = snake.respawnAtTick > 0 ? snake.respawnAtTick : 0;
        }
    };

    /** 真人入座进世界（createPlayer 与 onMatchInitialize 两条路径共用）。 */
    const seatIntoWorld = (sessionId: string, name: string, joinOrdinal: number): void => {
        if (!world) return;
        if (world.get(sessionId)) return;
        world.addPlayerSnake(sessionId, name, joinOrdinal);
        // AI 让位：真人加入导致超编时，最低分 AI 死亡掉落（⛔ 不凭空消失）。
        while (world.countAi() > world.aiTargetCount(world.countHumans())) {
            if (!world.cullAiForJoin()) break;
        }
    };

    const mode = {
        id: MODE_ID,
        // drop-in 定义性前提（注册期断言钉死）：首人即开局。
        roster: { min: 1, max: 8, autoStart: 1 },

        createPlayer: ({ sessionId, name }: { sessionId: string; name: string }) => {
            const player = new SnakePlayerState();
            player.id = sessionId;
            player.name = name;
            player.connected = true;
            joinCounter += 1;
            player.joinOrdinal = joinCounter;
            // Playing 中（含 starting 窗口）入座：立即出生进世界；Waiting 期的首人
            // 由 onMatchInitialize 统一入座（世界尚未创建）。
            seatIntoWorld(sessionId, name, joinCounter);
            return player;
        },

        commands: {
            [SnakeInput.type]: (context: GameModeCommandContext<SnakeRoomState>, payload: ISnakeInputReq): void => {
                if (!world) return;
                const accepted = world.applyInput(
                    context.client.sessionId, payload.dirX, payload.dirY, payload.boost, payload.seq,
                );
                if (!accepted) {
                    // seq 倒退/重复或对局外输入：静默消费（与 ballMove 死亡/未入座语义一致）。
                    return;
                }
                const player = playerView(context, context.client.sessionId);
                if (player) player.ackSeq = payload.seq;
            },
        } satisfies GameplayCommandsFor<SnakeRoomState, typeof gameplayC2STokens.snake>,

        onMatchInitialize: (context: SnakeContext): void => {
            // 物理常量与房间步长是同一契约的两端——不一致即配置缺陷，fail-fast 拒绝建房。
            if (context.fixedStepMs !== SNAKE_RULESET.fixedStepMs) {
                throw new Error(
                    `[snake] ruleset.fixedStepMs=${SNAKE_RULESET.fixedStepMs} 与房间步长 ${context.fixedStepMs} 不一致`,
                );
            }
            world = new SnakeWorld({ matchSeed: context.matchSeed });
            snapshotSeq = 0;
            joinCounter = 0;
            // 首人（及 starting 窗口内的创始成员）统一入座
            for (const [sessionId, player] of context.state.players) {
                joinCounter += 1;
                player.joinOrdinal = joinCounter;
                seatIntoWorld(sessionId, player.name, joinCounter);
            }
            // AI 填充到目标总数
            while (world.countAi() < world.aiTargetCount(world.countHumans())) {
                world.addAiSnake();
            }
            context.state.endTick = world.endTick;
            context.state.countdownEndTick = world.movementStartTick;
            context.state.snapshotSeq = 0;
            context.state.winnerId = "";
            project(context);
        },

        onMatchRollback: (context: SnakeContext): void => {
            world = null;
            snapshotSeq = 0;
            context.state.endTick = 0;
            context.state.countdownEndTick = 0;
            context.state.snapshotSeq = 0;
            context.state.winnerId = "";
        },

        onStep: (context: SnakeContext & { readonly dtMs: number }): void => {
            if (!world) return;
            // 断线宽限内的蛇：保持最后方向、停止加速（SNAKE-OPEN-06 拍板语义）
            for (const snake of world.snakes) {
                if (snake.isAi || !snake.alive) continue;
                const player = playerView(context, snake.id);
                if (player && !player.connected) snake.boostIntent = false;
            }
            // AI 决策（先于世界推进；与真人走同一意图通道）
            for (const snake of world.snakes) {
                if (snake.isAi && snake.alive) driveAi(world, snake, world.rngAi);
            }
            const done = world.step();
            project(context);

            // 10Hz 有界完整快照（04 §6.2 首版明确优先完整快照）
            if (world.tick % SNAKE_RULESET.snapshotEveryTicks === 0) {
                snapshotSeq += 1;
                context.state.snapshotSeq = snapshotSeq;
                context.broadcastS2C(SnakeSnapshot, world.buildSnapshot(context.state.matchId, snapshotSeq));
            }

            if (done) {
                // 冻结排名（03 §9.1 稳定优先级），再收局
                const ranking = world.ranking();
                context.state.winnerId = ranking.length > 0 ? ranking[0].id : "";
                project(context);
                context.settle();
            }
        },

        onPlayerLeaving: (context: GameModePlayerLeavingContext<SnakeRoomState, SnakePlayerState>): void => {
            if (!world || !context.duringMatch) return;
            // 最终离开：蛇死亡掉落并移出世界（⛔ 不再复活），随后补刷 AI 维持总蛇数。
            world.removePlayerSnake(context.client.sessionId);
            while (world.countAi() < world.aiTargetCount(world.countHumans())) {
                world.addAiSnake();
            }
        },

        // 结算完全由 onStep 的限时判定驱动（context.settle()）；⛔ 不按人数——
        // drop-in 房间人少不结算，房间清空由 Colyseus autoDispose 承担。
        shouldSettle: (): boolean => false,

        onDispose: (): void => {
            world = null;
            snapshotSeq = 0;
        },

        // ── 测试探针（ballMove harness 先例；⛔ 不进 GameMode 接口，生产路径不读）──
        __probeWorld: (): SnakeWorld | null => world,
    };
    return mode;
}
