import { Room, Client, CloseCode } from "colyseus";
import {
    C2S,
    S2C,
    GamePhase,
    ErrorCode,
    ErrorMessage,
    TICK_MS,
    MAX_PLAYERS,
    MAP_WIDTH,
    MAP_HEIGHT,
    PLAYER_MOVE_SPEED,
    clamp,
    normalize,
    getSkillDef,
    calcDamage,
    SeededRandom,
    type IPingReq,
    type IMoveReq,
    type ICastSkillReq,
    type IChatReq,
    type IWelcomeRes,
    type IPongRes,
    type ISkillResultRes,
    type IChatRes,
    type IErrorRes,
} from "@game/shared";
import { GameRoomState, PlayerState } from "./schema/GameRoomState";
import { randomNickname } from "../mock/data";

/**
 * 主玩法房间（当前全部为假数据/模拟逻辑，用于跑通链路）：
 *  - 玩家进出：随机出生点 + mock 昵称
 *  - 移动：客户端发方向输入，服务端按逻辑帧积分位置
 *  - 技能：使用 shared 战斗公式结算伤害并广播
 */
export class GameRoom extends Room {
    maxClients = MAX_PLAYERS;
    state = new GameRoomState();
    /** 状态快照下发间隔（ms），默认 50ms/20fps */
    patchRate = 50;

    /** 确定性随机源；正式项目应以对局种子初始化并同步给客户端 */
    private rng = new SeededRandom(Date.now() >>> 0);

    /** Colyseus 0.17 消息处理表，消息名来自双端共享的 C2S 常量 */
    messages = {
        [C2S.Ping]: (client: Client, msg: IPingReq) => {
            const res: IPongRes = { clientTime: msg?.clientTime ?? 0, serverTime: Date.now() };
            client.send(S2C.Pong, res);
        },

        [C2S.Move]: (client: Client, msg: IMoveReq) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || !player.alive) return;
            const dir = normalize(msg?.dirX ?? 0, msg?.dirY ?? 0);
            player.dirX = dir.x;
            player.dirY = dir.y;
        },

        [C2S.CastSkill]: (client: Client, msg: ICastSkillReq) => {
            this.handleCastSkill(client, msg);
        },

        [C2S.Chat]: (client: Client, msg: IChatReq) => {
            const player = this.state.players.get(client.sessionId);
            const text = (msg?.text ?? "").trim().slice(0, 100);
            if (!player || !text) return;
            const res: IChatRes = {
                fromId: client.sessionId,
                fromName: player.name,
                text,
                time: Date.now(),
            };
            this.broadcast(S2C.Chat, res);
        },
    };

    onCreate(_options: unknown) {
        this.setSimulationInterval((dt) => this.update(dt), TICK_MS);
        console.log(`[GameRoom ${this.roomId}] 创建`);
    }

    onJoin(client: Client, _options: unknown) {
        const player = new PlayerState();
        player.id = client.sessionId;
        player.name = randomNickname(this.rng);
        player.x = this.rng.nextInt(100, MAP_WIDTH - 100);
        player.y = this.rng.nextInt(100, MAP_HEIGHT - 100);
        this.state.players.set(client.sessionId, player);

        if (this.state.phase === GamePhase.Waiting && this.state.players.size >= 2) {
            this.state.phase = GamePhase.Playing;
        }

        const welcome: IWelcomeRes = {
            sessionId: client.sessionId,
            tickRate: Math.round(1000 / TICK_MS),
            motd: "欢迎来到 game（mock 服务端）",
        };
        client.send(S2C.Welcome, welcome);
        console.log(`[GameRoom ${this.roomId}] ${player.name}(${client.sessionId}) 加入，当前 ${this.state.players.size} 人`);
    }

    onLeave(client: Client, code: number) {
        const consented = code === CloseCode.CONSENTED;
        this.state.players.delete(client.sessionId);
        console.log(`[GameRoom ${this.roomId}] ${client.sessionId} 离开（${consented ? "主动" : `code=${code}`}），剩余 ${this.state.players.size} 人`);
    }

    onDispose() {
        console.log(`[GameRoom ${this.roomId}] 销毁`);
    }

    /** 逻辑帧：位置积分 */
    private update(dt: number) {
        this.state.tick++;
        const seconds = dt / 1000;
        this.state.players.forEach((player) => {
            if (!player.alive) return;
            if (player.dirX === 0 && player.dirY === 0) return;
            player.x = clamp(player.x + player.dirX * PLAYER_MOVE_SPEED * seconds, 0, MAP_WIDTH);
            player.y = clamp(player.y + player.dirY * PLAYER_MOVE_SPEED * seconds, 0, MAP_HEIGHT);
        });
    }

    private handleCastSkill(client: Client, msg: ICastSkillReq) {
        const caster = this.state.players.get(client.sessionId);
        if (!caster || !caster.alive) return;

        const skill = getSkillDef(msg?.skillId ?? -1);
        if (!skill) {
            const err: IErrorRes = { code: ErrorCode.SkillUnavailable, message: ErrorMessage[ErrorCode.SkillUnavailable] };
            client.send(S2C.Error, err);
            return;
        }

        // 冷却检查（服务端内部字段，不同步）
        const now = Date.now();
        const lastAt = caster.lastCastAt[skill.id] ?? 0;
        if (now - lastAt < skill.cooldownMs) return;
        caster.lastCastAt[skill.id] = now;

        // 用双端共享公式结算伤害
        const damage = calcDamage(skill, caster.level, this.rng.next());

        const target = msg.targetId ? this.state.players.get(msg.targetId) : undefined;
        if (target && target.alive) {
            target.hp = clamp(target.hp - damage, 0, target.maxHp);
            if (target.hp <= 0) target.alive = false;
        }

        const res: ISkillResultRes = {
            casterId: client.sessionId,
            skillId: skill.id,
            targetId: msg.targetId,
            damage,
        };
        this.broadcast(S2C.SkillResult, res);
    }
}
