import { Room, Client, CloseCode, ServerError, type AuthContext } from "colyseus";
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
    PROTOCOL_VERSION,
    type IRoomJoinOptions,
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
import { verifyBearer } from "../core/auth/session";
import { emitMatchEvidence, MATCH_MODE_CASUAL, newMatchId } from "../core/match/matchConsumer";

// demo 昵称池（原 mock/data，mock 层删除后归本房间私有；真实项目从档案取昵称）
const NICK_PREFIX = ["快乐", "无敌", "神秘", "暴走", "咸鱼", "低调", "闪电", "锦鲤"];
const NICK_SUFFIX = ["小汉字", "词王", "笔画侠", "拼音怪", "部首君", "成语精"];
const randomNickname = (rng: SeededRandom): string => `${rng.pick(NICK_PREFIX)}${rng.pick(NICK_SUFFIX)}`;

/** 框架不透明 token 形制：`{uid}.{hex}`（auth/session.ts issueSession，TOKEN_BYTES=24 → 48 位 hex）。
 *  形制不符 = 伪造/旧 mock 残余 → 直接拒连（去 mock 后无游客模式）。 */
const FRAMEWORK_TOKEN_RE = /\.[0-9a-f]{48}$/;

/** 非主动断线的重连宽限（秒）。微信小游戏切后台必断 socket，实机常态不是异常——
 *  没有宽限就等于「切个后台 = 弃赛」。回流自 Arthur 三房间标配。 */
const RECONNECT_GRACE_S = 10;

/**
 * 主玩法房间（玩法逻辑仍为演示/假数据，用于跑通链路）：
 *  - 玩家进出：随机出生点 + demo 昵称（真实项目从档案取）
 *  - 移动：客户端发方向输入，服务端按逻辑帧积分位置
 *  - 技能：使用 shared 战斗公式结算伤害并广播
 *  - 结算（服务端框架 M8a）：存活 ≤1 → Settle + 证据链 XADD stream:match
 *    （消费落库见 core/match/matchConsumer）
 */
export class GameRoom extends Room {
    maxClients = MAX_PLAYERS;
    state = new GameRoomState();
    /** 状态快照下发间隔（ms），默认 50ms/20fps */
    patchRate = 50;

    /** 本局种子（进证据链供 verifier 重放，09·K5）；正式项目应同步给客户端做确定性表现 */
    private matchSeed = Date.now() >>> 0;
    /** 确定性随机源，以对局种子初始化 */
    private rng = new SeededRandom(this.matchSeed);

    /** sessionId → 框架账号 uid（M8a 证据链 userId 来源；onAuth 严格化后必有值） */
    private sessionUserId = new Map<string, string>();
    /** 死亡顺序（sessionId，先死在前）；结算名次 = 存活者优先、其余按死亡逆序 */
    private deathOrder: string[] = [];
    /** 中途退房者的昵称快照（state.players 里已删，结算证据还需要名字） */
    private departedNames = new Map<string, string>();
    /** 开局时刻（clock 毫秒），证据 elapsedMs 用 */
    private matchStartMs = 0;

    /**
     * 账号绑定（M8a）：框架 token（wx/dev-login 签发）反查 uid 存入 client.auth（09·G1
     * ⛔ 不信客户端单独传的 userId）。token 缺失/伪造/过期一律拒连（去 mock 后无游客模式）。
     */
    static async onAuth(token: string, options: IRoomJoinOptions | undefined, _context: AuthContext) {
        // 协议版本硬闸（缺省按 1 兼容首版客户端）：服务端升协议后旧包 join 即拒——
        // 给出可识别错误码，而不是让旧客户端在 Schema 对不上的畸形状态里挂死
        if ((options?.v ?? 1) !== PROTOCOL_VERSION) {
            throw new ServerError(ErrorCode.ProtocolMismatch, ErrorMessage[ErrorCode.ProtocolMismatch]);
        }
        // token 严格化（去 mock 后）：⛔ 不再有「伪造/过期静默降游客」——dev-login 让真
        // token 零成本，游客模式失去存在理由；验不过一律拒连（可识别错误码给客户端回登录）
        const raw = options?.token ?? token ?? "";
        if (!FRAMEWORK_TOKEN_RE.test(raw)) {
            throw new ServerError(ErrorCode.TokenExpired, ErrorMessage[ErrorCode.TokenExpired]);
        }
        try {
            return { userId: await verifyBearer(raw, false) };
        } catch {
            throw new ServerError(ErrorCode.TokenExpired, ErrorMessage[ErrorCode.TokenExpired]);
        }
    }

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
        // 对局已开/已结算的房间不收新客（M8a：参与者集合在开局时固定，中途进人会污染名次与
        // 证据的 09·K5 输入完整性）。撮合层已由开局时的 lock() 挡住，此闸兜底 joinById 直连。
        if (this.state.phase !== GamePhase.Waiting) {
            throw new ServerError(4002, "对局已开始，无法加入");
        }
        const auth = client.auth as { userId?: string | null } | undefined;
        // 同一框架账号禁止占双座（对齐 Arthur VersusRoom）：证据里同一 userId 出现两个名次会污染战绩
        if (auth?.userId && [...this.sessionUserId.values()].includes(auth.userId)) {
            throw new ServerError(4003, "该账号已在本房间");
        }

        const player = new PlayerState();
        player.id = client.sessionId;
        player.name = randomNickname(this.rng);
        player.x = this.rng.nextInt(100, MAP_WIDTH - 100);
        player.y = this.rng.nextInt(100, MAP_HEIGHT - 100);
        this.state.players.set(client.sessionId, player);
        if (auth?.userId) this.sessionUserId.set(client.sessionId, auth.userId);

        if (this.state.phase === GamePhase.Waiting && this.state.players.size >= 2) {
            this.state.phase = GamePhase.Playing;
            // M8a：matchId 开局生成一次写进 state（09·K4），结算/证据链/去重全部复用同一 id——
            // ⛔ 结算处重新生成会让重跑产生新 id，战绩重复计数。
            this.state.matchId = newMatchId();
            this.matchStartMs = this.clock.currentTime;
            // 开局前（等人期自娱自乐）的死亡记录不属于本局，清掉再开赛
            this.deathOrder = [];
            this.departedNames.clear();
            // 撤出撮合池：对局中/结算后 joinOrCreate 都会开新房而不是挤进本房
            //（显式 lock 不会因人数变化被自动解锁；房间随全员退出 autoDispose）
            this.lock();
        }

        const welcome: IWelcomeRes = {
            sessionId: client.sessionId,
            tickRate: Math.round(1000 / TICK_MS),
            motd: "欢迎来到 game（dev 服务端）",
        };
        // onJoin 里同步 send 是安全的：@colyseus/ws-transport 在客户端 JOIN ack 之前
        //（state !== JOINED）把所有 send 缓冲进 _enqueuedMessages，ack 后先发全量 state
        // 再 flush——Welcome 不可能先于客户端 joinOrCreate 的 resolve 到达，⛔ 不需要
        // 延迟一拍（曾误诊为竞态；int 日志里的 's2c.welcome' 告警实为 settlement 测试
        // 未注册 Welcome 处理器所致，延迟也消不掉）。
        client.send(S2C.Welcome, welcome);
        console.log(`[GameRoom ${this.roomId}] ${player.name}(${client.sessionId}) 加入，当前 ${this.state.players.size} 人`);
    }

    async onLeave(client: Client, code: number) {
        const consented = code === CloseCode.CONSENTED;
        if (!consented) {
            try {
                // 非主动断线（微信切后台必断 socket / 网络抖动）：保留座位等重连，
                // 宽限期内玩家仍在 state 里照常被模拟、不阻塞他人；客户端用 SDK 的
                // reconnect(reconnectionToken) 归位。M8a 簿记必须推迟到重连失败——
                // 在这里先记会把重连成功者也算成阵亡，污染名次与证据。
                await this.allowReconnection(client, RECONNECT_GRACE_S);
                console.log(`[GameRoom ${this.roomId}] ${client.sessionId} 断线后重连成功`);
                return; // 数据原样保留，无任何簿记
            } catch {
                // 宽限到期未归 → 按真离开走下方清理
            }
        }
        const player = this.state.players.get(client.sessionId);
        if (player && this.state.phase === GamePhase.Playing) {
            // 结算证据还需要退房者的名字——无论死活都先快照（state.players 马上要删）
            this.departedNames.set(client.sessionId, player.name);
            // 活着退房视为阵亡（M8a：名次/证据完整性要求每个参与者都有归宿）；已死者已在 deathOrder
            if (player.alive) this.deathOrder.push(client.sessionId);
        }
        this.state.players.delete(client.sessionId);
        console.log(`[GameRoom ${this.roomId}] ${client.sessionId} 离开（${consented ? "主动" : `code=${code}，宽限已过`}），剩余 ${this.state.players.size} 人`);
        this.maybeSettle();
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
        // 相位闸：结算后技能不再结算（否则 deathOrder 在终态无界增长且永不触发二次结算）。
        // Waiting 期放行——单人房自娱自乐是演示路径（smoke 依赖），开局时会清死亡记录。
        if (this.state.phase === GamePhase.Settle) return;
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
            if (target.hp <= 0) {
                target.alive = false;
                this.deathOrder.push(target.id);
            }
        }

        const res: ISkillResultRes = {
            casterId: client.sessionId,
            skillId: skill.id,
            targetId: msg.targetId,
            damage,
        };
        this.broadcast(S2C.SkillResult, res);
        this.maybeSettle();
    }

    // ---------------- 结算 + 证据链（服务端框架 M8a） ----------------

    /** 结算条件：对局中存活 ≤1。 */
    private maybeSettle() {
        if (this.state.phase !== GamePhase.Playing) return;
        let alive = 0;
        this.state.players.forEach((p) => { if (p.alive) alive++; });
        if (alive <= 1) this.settle();
    }

    /**
     * 收局：phase → Settle + 证据链生产（02·P7）。一局一条 XADD `stream:match`，
     * 含全部名次 + verifier 重放所需输入（seed 等，09·K5）。emitMatchEvidence 内部吞错——
     * XADD 失败只告警，⛔ 不阻塞收局。落库消费见 gameplay/matchConsumer（consumer group `settle`）。
     * 纯游客局（无任何绑定账号）无落库效应、审计无对象 → 不产证据
     * （也让纯 mock 联调的房间路径不隐性依赖 Redis）。
     */
    private settle() {
        this.state.phase = GamePhase.Settle;
        const elapsedMs = this.matchStartMs > 0 ? Math.max(0, this.clock.currentTime - this.matchStartMs) : 0;

        // 名次：存活者在前，其余按死亡逆序（后死名次高）
        const order: { sessionId: string; name: string; survived: boolean }[] = [];
        this.state.players.forEach((p, sid) => {
            if (p.alive) order.push({ sessionId: sid, name: p.name, survived: true });
        });
        for (let i = this.deathOrder.length - 1; i >= 0; i--) {
            const sid = this.deathOrder[i];
            const name = this.state.players.get(sid)?.name ?? this.departedNames.get(sid) ?? "";
            order.push({ sessionId: sid, name, survived: false });
        }
        console.log(`[GameRoom ${this.roomId}] 收局 matchId=${this.state.matchId}：${order.map((o, i) => `#${i + 1} ${o.name}`).join("，")}`);

        if (!order.some((o) => this.sessionUserId.has(o.sessionId))) return;
        void emitMatchEvidence({
            matchId: this.state.matchId,
            mode: MATCH_MODE_CASUAL, // 排位房型接入后按房型切 MATCH_MODE_RANKED
            seed: this.matchSeed,
            mapIndex: 0, // 单地图演示
            loadout: null,
            injectWaves: [], // 本作暂无服务端注入事件；有则仿 Arthur VersusRoom 记 injectLog
            participants: order.map((o, i) => ({
                sessionId: o.sessionId,
                userId: this.sessionUserId.get(o.sessionId) ?? null, // 游客 null
                name: o.name,
                place: i + 1,
                round: 0, // 本作无波次概念
                elapsedMs,
                survived: o.survived,
            })),
        });
    }
}
