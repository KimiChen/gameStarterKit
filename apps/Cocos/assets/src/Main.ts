/**
 * 游戏入口组件 —— 挂到场景的 Canvas 节点上即可运行完整演示：
 *
 *   微信兼容补丁 → 登录页（FGUI）→ 主界面 Home（FGUI）→ 点「进入游戏」→
 *   加入 Colyseus 房间（WebSocket）→ 状态同步进 ECS → 插值 → Graphics 渲染 → 触摸移动
 *
 * 大厅壳（登录/选服/公告/Home）走 FGUI（view/pages.ts 组合根，动态 import 铁律 10）；
 * ballMove 玩法在「进入游戏」后才建渲染层/ECS/连房。
 *
 * 使用前：启动服务端 `npm run dev`（默认 http://localhost:2568）。
 */
import { _decorator, Component, Node, Graphics, UITransform, Color, input, Input, EventTouch, Vec3, view, ResolutionPolicy } from "cc";
import { DEV_SERVER_URL } from "./core/devEnv";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "./designSpec";
import { installWeChatCompat } from "./core/wechat-compat";
import { getToken, initHttp, initPortal } from "./core/http";
import { getCurrentServer } from "./net/serverSession";
import { onAuthInvalid, onBattleLost, onConnLost, returnToLogin } from "./net/session";
import { RoomClient, type GameRoomOwnership } from "./net/RoomClient";
import { WebSocketClient } from "./net/WebSocketClient";
import { GameECS } from "./logic/rooms/ballMove/GameECS";
import { PlayerModel } from "./logic/rooms/ballMove/GameComps";
import {
    S2C,
    MAP_WIDTH,
    MAP_HEIGHT,
    normalize,
    distance,
    joinErrText,
    type IGameRoomState,
    type IPlayerState,
} from "./shared/index";

// ⚠ 必须在任何 Colyseus 调用之前安装（模块加载期执行，早于所有组件生命周期）
installWeChatCompat();

// 每帧复用的色值（微信 JSCore 对每帧分配敏感；引擎 fillColor setter 是拷贝语义，复用安全）
const COLOR_BORDER = new Color(120, 120, 120, 255);
const COLOR_DEAD = new Color(100, 100, 100, 255);
const COLOR_SELF = new Color(60, 200, 120, 255);
const COLOR_OTHER = new Color(240, 150, 60, 255);
const COLOR_HP_BG = new Color(40, 40, 40, 255);
const COLOR_HP = new Color(220, 60, 60, 255);

const { ccclass, property } = _decorator;

@ccclass("Main")
export class Main extends Component {
    @property({ tooltip: "服务端 http(s) 地址。留空 = 自动跟随根 .env.development 的 PORT（sync:client 生成 core/devEnv.ts，默认 http://localhost:2568）；填写即覆盖（远程/真机调试，微信真机需 https + 域名白名单）" })
    serverUrl = "";

    @property({ tooltip: "WebPlatform Public http(s) 地址（登录 + 选服），必填。不会回退游戏服地址；本地开发示例 http://127.0.0.1:2570。" })
    portalUrl = "";

    /** 生效的服务端地址：Inspector 填写值优先，留空自动跟随 devEnv（根 .env.development 的 PORT） */
    private get effectiveServerUrl(): string {
        return this.serverUrl || DEV_SERVER_URL;
    }

    // world 与玩家表挂模块级单例（场景重载重复建会让旧房间回调喂旧 world，幽灵 isSelf）
    private gameECS = GameECS.inst;
    private graphics: Graphics | null = null;
    private layerTf: UITransform | null = null;
    private started = false;
    private pingTimer = 0;
    /** 最近一次心跳往返时延（ms） */
    private rttMs = -1;

    /** 手指按住时的目标点（地图坐标），松手为 null */
    private touchTarget: { x: number; y: number } | null = null;
    /** 上一次发给服务端的方向（避免每帧重复发包） */
    private lastDirX = 0;
    private lastDirY = 0;
    /** 距目标小于该距离即停下，防止小球越过手指来回抖动 */
    private static readonly ARRIVE_RADIUS = 24;
    /** 组件已销毁（异步 start 在途时场景重载的标志位，见 connectServer 的竞态处理） */
    private destroyed = false;
    /** onTouch 复用的临时向量（touchmove 高频，避免每次 new Vec3） */
    private static readonly TMP_VEC3 = new Vec3();

    onLoad() {
        // 竖屏 750×1624：FIXED_WIDTH 宽恒铺满、高随机型浮动（≈1334~1730），全机型无黑边（Arthur P1 拍板）。
        // 高度差由场景 Widget / FGUI relation 吸收。真源 designSpec.ts，与 project.json 烘焙值三处一致——
        // 烘焙值只管启动窗口期，这里显式设置消除「烘焙缺 policy 时回退 FIXED_HEIGHT」的不一致（Arthur P0）。
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);

        // ⚠ 接 FairyGUI 视图时：fairygui 不得进任何常规脚本的静态依赖图（铁律 10），
        //   入口一律「桥 + 动态 import」——业务层只调一个注入回调，`import("./view/XxxView")`
        //   只关进回调体内，扩展没挂时其余功能不受影响。
    }

    /** 已进入 ballMove 玩法（渲染层/ECS/连房已就绪，update 才驱动它们）。 */
    private inBattle = false;
    /** 进战斗世代号：每次 enterBattle +1。⚠ 与 `inBattle` **不是一回事**——后者是重入锁（拦并发进入），
     *  本字段用于让**迟到的上一轮**认出自己已过期，⛔ 别让它去回滚新一轮的状态。见 enterBattle 注释。 */
    private battleGen = 0;
    /**
     * 当前 enterBattle 世代对战斗房的精确 ownership。
     * ⛔ 不要退“RoomClient 当前房”：旧世代只能释放自己持有的租约，否则会误关后来者复用/新建的房间。
     */
    private battleRoom: GameRoomOwnership | null = null;
    /** session 事件订阅的解绑器，onDestroy 统一调用。⛔ 别丢：见 start() 里那三个订阅的注释。 */
    private readonly unsubs: Array<() => void> = [];

    async start() {
        initHttp(this.effectiveServerUrl);
        initPortal(this.portalUrl); // 必填；空值/非法地址立即失败，⛔ 不回退游戏服

        // ⚠ **必须在 openLogin(→wireSessionEvents) 之前订阅**：处理器按订阅序执行，
        // 本类先把战斗态拆干净，pages 再做导航——⛔ 否则登录页会叠在仍在跑的战斗上。
        //  - 鉴权失效（封号/顶号/强制下线）：⛔ 原先只退大厅、战斗房照跑（被封玩家继续打 + UI 错乱）
        //  - 战斗连接死亡：⛔ 原先无人上报，Main 拿着死房间恒 inBattle=true，玩家卡冻结画面
        //  - **大厅连接死亡**：大厅 WS 与战斗房各自独立，战斗全程大厅 WS 活着、会**单独死**。
        //    ⛔ 原先本类没订这条（只有 pages 订了、且它只关面板不碰战斗态）⇒ `inBattle` 恒真、
        //    继续渲染战斗、还接触摸事件，而登录页已经画在它上面；重进又被幂等早退吞掉 = 玩家卡死。
        // ⚠ **必须存下解绑器并在 onDestroy 里调**：这三个订阅注册进 net/session 的模块级 Set，
        //   而 Set 持有的闭包引用着 `this` ⇒ 场景重载/换 Main 实例后，旧 Main 连同它的渲染层、
        //   ECS、房间引用**永远不会被回收**，而且下次事件到达时**每个历史 Main 都会跑一遍**
        //   teardownBattle（旧实例的 teardown 打在早已失效的对象上）。⛔ 别再写成裸调用丢返回值。
        this.unsubs.push(
            onAuthInvalid(() => { this.teardownBattle(); }),
            onBattleLost(() => { this.teardownBattle(); }),
            onConnLost(() => { this.teardownBattle(); }),
        );

        // 大厅壳走 FGUI：动态 import 组合根（铁律 10——fairygui 不进静态依赖图）。
        // 登录页的「进入游戏」经 Home 走到 enterBattle 回调，才拉起 ballMove。
        try {
            const pages = await import("./view/pages");
            await pages.openLogin(() => { void this.enterBattle(); });
        } catch (err) {
            console.error("[Main] 大厅初始化失败（FairyGUI 扩展/资源包是否就绪？）：", err);
        }
    }

    /** Home 点「进入游戏」：关大厅 FGUI → 建 ballMove 渲染层/ECS/连房。
     *  连接失败必须**完整回滚**（拆渲染层/输入/ECS + 重开大厅）——只打日志的话
     *  玩家停在不可恢复的空界面（inBattle 已置位，重点「进入游戏」也进不来）。 */
    private async enterBattle(): Promise<void> {
        if (this.inBattle) return;
        this.inBattle = true;
        // ⚠ **本次进战斗的世代号**：`inBattle` 只是重入锁，⛔ **拦不住"迟到的上一轮"**。
        //   真实交错（评审给的）：本轮 await connectRoom() 在途 → 连接死亡/被踢触发 teardownBattle()
        //   （inBattle=false）→ 玩家再点「进入游戏」→ 新一轮 enterBattle 成功连上 → 这时**上一轮**
        //   的 connectRoom 才 reject → 它的 catch 调 abortBattle() ⇒ 把**新一轮的活连接**拆掉。
        //   世代号让迟到者认出"我已经不是当前这轮了"，⛔ 只记日志、不碰任何状态。
        const gen = ++this.battleGen;
        try {
            const pages = await import("./view/pages");
            pages.closeLobby();
        } catch { /* 关不掉不阻塞进战斗 */ }
        if (gen !== this.battleGen) { return; }   // 动态 import 期间已被顶掉：⛔ 别再装渲染层
        this.initRenderLayer();
        this.initInput();
        let ownership: GameRoomOwnership | null = null;
        try {
            ownership = this.connectRoom();
            this.battleRoom = ownership;
            const room = await ownership.ready;
            if (gen !== this.battleGen || this.destroyed || this.battleRoom !== ownership) {
                // 连上了但本 ownership 已过期：只释放本地捕获的精确租约。若后来者与它合流到
                // 同一个在途 join，RoomClient 会保留物理房；若后来者已新建槽，也完全不受影响。
                console.warn("[Main] 迟到的连接成功（世代已过期），仅退掉自己这条");
                this.releaseBattleRoom(ownership);
                return;
            }
            this.bindRoom(room, gen, ownership);
            this.started = true;
        } catch (err) {
            if (gen !== this.battleGen || this.destroyed || this.battleRoom !== ownership) {
                // ⛔ 关键：迟到的失败**绝不能**调 abortBattle——新一轮可能已经连上了
                console.warn("[Main] 迟到的连接失败（世代已过期），⛔ 不回滚当前战斗态", err);
                this.releaseBattleRoom(ownership);
                return;
            }
            // 拒连的业务码走 message（服务端 joinRefused）→ shared 单源解码，日志里给人看得懂的原因
            console.error(`[Main] 进入战斗失败：${joinErrText((err as Error)?.message, "连接房间失败（请确认已运行 npm run dev）")}`, err);
            this.abortBattle();
        }
    }

    /**
     * **只回滚战斗态**（拆渲染层/输入/ECS + 复位标志 + 退房），⛔ 不做任何导航。
     * 供三处复用：进战斗失败（abortBattle 再叠导航）、强制下线、战斗连接死亡——
     * 后两者的导航/提示归 view 层（pages 订阅同一事件），本类只负责「战斗态干净」。
     * 幂等：不在战斗中直接返回。
     */
    private teardownBattle(): void {
        if (!this.inBattle && !this.battleRoom) { return; }
        // 先作废世代、再释放精确 ownership：在途 enterBattle 醒来后只能清理自己的局部租约，
        // 无权 bind/回滚后来新建的一轮。
        this.battleGen++;
        this.inBattle = false;
        this.started = false;
        this.releaseBattleRoom(this.battleRoom);
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouch, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        this.graphics?.node.destroy();
        this.graphics = null;
        this.layerTf = null;
        this.touchTarget = null;
        RoomClient.inst.clearDesiredMove();
        // ⚠ 方向/心跳也必须复位：本函数现在也跑在「打过一局才断线」的路径上（battleLost/authInvalid），
        // lastDir 会停在断线瞬间的非零值上；⛔ 不复位则下一局同方向的第一次输入被 sendDir 的去重早退吞掉。
        this.lastDirX = 0;
        this.lastDirY = 0;
        this.pingTimer = 0;
        this.rttMs = -1;
        this.gameECS.clear();
    }

    /** 释放调用方给出的精确战斗房 ownership；仅当它仍是当前值时才清空字段。 */
    private releaseBattleRoom(ownership: GameRoomOwnership | null): void {
        if (!ownership) return;
        if (this.battleRoom === ownership) { this.battleRoom = null; }
        void ownership.leave().catch(() => { /* 已死的房退不掉属预期 */ });
    }

    /** 进战斗失败回滚：回滚战斗态 → **退大厅连接** → 重开登录页（可重试）。
     *  ⚠ 必须 leave 大厅 WS：本路径通向登录页，而重登会换发新 token ⇒ 旧连接不退的话，
     *  重进要么撞上"已用其他 token 在线"抛错（第二次点才进），要么被新登录当**顶号**踢掉，
     *  玩家先看到一条误导的「账号已在其他设备登录」。⛔ 这条路径不在上一批修复的三条之列，是漏的。
     *  ⚠ 登记：回登录页的四条路径（authInvalid/battleLost/connLost/本路径）目前各写各的组合，
     *  收敛成单一出口见 plan.md「P0-01 收口客户端会话、连接、导航与输入竞态」。 */
    private abortBattle(): void {
        this.inBattle = true;      // teardown 幂等靠此标志；失败路径可能尚未真正入战
        this.teardownBattle();
        // 进战斗失败也走 session 的唯一回登录队列；它负责清 Bearer、退大厅、提示与导航，
        // 与 authInvalid/connLost/battleLost 共用同一幂等出口。
        void returnToLogin({ kind: "BATTLE_JOIN_FAILED" }).catch((e) => {
            console.error("[Main] 回大厅失败：", e);
        });
    }

    /** 连 ballMove 玩法房（token 已在大厅登录时设置）。
     * 区服=实例：使用目录明确给出的 gameHttpUrl；无选服状态直接失败，不猜默认游戏服。 */
    private connectRoom(): GameRoomOwnership {
        const cur = getCurrentServer();
        if (!cur) {
            throw new Error("[Main] 尚未选择区服，不能进入战斗");
        }
        RoomClient.inst.init(cur.gameHttpUrl);
        // WebPlatform 对外契约使用 serverId；游戏服房间契约仍保留 sId。
        // 未选服已在上方明确拒绝，因此这里始终携带选中的 serverId。
        return RoomClient.inst.joinGame({ token: getToken(), sId: cur.serverId });
    }

    /**
     * 旧 room 的 leave Promise 落定前，SDK 仍可能派发它已经登记的 message/schema 回调。
     * 每次回调都必须重新核对「世代 + ownership + 当前物理 room」；⛔ 不能依赖稍后的 removeAllListeners。
     */
    private isCurrentBattleBinding(
        gen: number,
        ownership: GameRoomOwnership,
        room: Colyseus.Room<IGameRoomState>,
    ): boolean {
        return !this.destroyed
            && this.inBattle
            && this.battleGen === gen
            && this.battleRoom === ownership
            && RoomClient.inst.room === room;
    }

    /** 为当前世代已确认拥有的精确 room 绑定消息与状态。过期世代的回调会被逐次身份守卫丢弃。 */
    private bindRoom(
        room: Colyseus.Room<IGameRoomState>,
        gen: number,
        ownership: GameRoomOwnership,
    ): void {
        const isCurrent = () => this.isCurrentBattleBinding(gen, ownership, room);

        // 3. 服务端消息
        RoomClient.inst.onMessage(room, S2C.Welcome, (msg) => {
            if (!isCurrent()) { return; }
            console.log(`[Main] ${msg.motd}（tickRate=${msg.tickRate}）`);
        });
        RoomClient.inst.onMessage(room, S2C.Pong, (msg) => {
            if (!isCurrent()) { return; }
            this.rttMs = Date.now() - msg.clientTime;
            console.log(`[Main] RTT ${this.rttMs}ms`);
        });
        RoomClient.inst.onMessage(room, S2C.Chat, (msg) => {
            if (!isCurrent()) { return; }
            console.log(`[聊天] ${msg.fromName}: ${msg.text}`);
        });
        RoomClient.inst.onMessage(room, S2C.SkillResult, (msg) => {
            if (!isCurrent()) { return; }
            console.log(`[战斗] ${msg.casterId} 技能${msg.skillId} 伤害${msg.damage}`);
        });
        RoomClient.inst.onMessage(room, S2C.Error, (msg) => {
            if (!isCurrent()) { return; }
            console.warn(`[服务端错误] ${msg.code}: ${msg.message}`);
        });

        // 4. 状态同步 → ECS
        const $ = RoomClient.inst.state$(room);
        $(room.state).players.onAdd((player: IPlayerState, sessionId: string) => {
            if (!isCurrent()) { return; }
            this.gameECS.addPlayer(player, sessionId === room.sessionId);
            // 该玩家任意字段变化时，把最新值同步进 ECS
            $(player).onChange(() => {
                if (!isCurrent()) { return; }
                this.gameECS.syncPlayer(player);
            });
        });
        $(room.state).players.onRemove((_player: IPlayerState, sessionId: string) => {
            if (!isCurrent()) { return; }
            this.gameECS.removePlayer(sessionId);
        });

        console.log(`[Main] 已加入房间 ${room.roomId}，我是 ${room.sessionId}`);
    }

    update(dt: number) {
        if (!this.inBattle) return; // 大厅期（FGUI）不驱动 ballMove 渲染/ECS
        this.gameECS.update(dt);
        this.steerToTarget();
        this.draw();

        // 每 5 秒一次心跳（掉线重连窗口暂停：SDK 会排队 send、重连后补发过期 ping 让 RTT 虚高）
        if (this.started && !RoomClient.inst.dropping) {
            this.pingTimer += dt;
            if (this.pingTimer >= 5) {
                this.pingTimer = 0;
                RoomClient.inst.ping();
            }
        }
    }

    onDestroy() {
        this.destroyed = true; // joinGame 在途返回后，enterBattle 据此只释放自己的精确 ownership
        this.battleGen++;      // 作废在途的 enterBattle：它醒来时世代已变，⛔ 不会再碰任何状态
        // ⛔ 必须先解绑再拆状态：否则本实例仍挂在模块级 Set 上，下次事件到达会打在已销毁的对象上
        for (const off of this.unsubs) { off(); }
        this.unsubs.length = 0;
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouch, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        this.releaseBattleRoom(this.battleRoom);
        if (this.inBattle) { this.gameECS.clear(); }
    }

    // ---------------- 渲染（Graphics 零资源） ----------------

    private initRenderLayer() {
        const layer = new Node("PlayersLayer");
        // new Node() 默认在 DEFAULT layer，不继承父节点；不设置会被 Canvas 的 UI_2D 相机剔除（画面全空）
        layer.layer = this.node.layer;
        this.layerTf = layer.addComponent(UITransform);
        this.node.addChild(layer);
        this.graphics = layer.addComponent(Graphics);
    }

    private draw() {
        const gfx = this.graphics;
        if (!gfx) return;
        gfx.clear();

        // 地图边框（逻辑坐标居中映射到节点坐标系）
        const ox = -MAP_WIDTH / 2;
        const oy = -MAP_HEIGHT / 2;
        gfx.lineWidth = 2;
        gfx.strokeColor = COLOR_BORDER;
        gfx.rect(ox, oy, MAP_WIDTH, MAP_HEIGHT);
        gfx.stroke();

        this.gameECS.forEachPlayer((eid) => {
            const px = ox + PlayerModel.x[eid];
            const py = oy + PlayerModel.y[eid];

            // 本机绿色，其他人橙色，死亡灰色
            gfx.fillColor = !PlayerModel.alive[eid] ? COLOR_DEAD : PlayerModel.isSelf[eid] ? COLOR_SELF : COLOR_OTHER;
            gfx.circle(px, py, 20);
            gfx.fill();

            // 血条
            const ratio = PlayerModel.maxHp[eid] > 0 ? PlayerModel.hp[eid] / PlayerModel.maxHp[eid] : 0;
            gfx.fillColor = COLOR_HP_BG;
            gfx.rect(px - 25, py + 28, 50, 6);
            gfx.fill();
            gfx.fillColor = COLOR_HP;
            gfx.rect(px - 25, py + 28, 50 * ratio, 6);
            gfx.fill();
        });
    }

    // ---------------- 输入：按住屏幕，小球朝手指位置移动 ----------------
    // 方向必须"从小球指向手指"（小球出生点是随机的，不在屏幕中心；
    // 若以屏幕中心为原点计算，点在中心与小球之间时方向会与直觉相反）。
    // 触摸只记录目标点，方向在 update 里逐帧朝目标修正，靠近后自动停下。

    private initInput() {
        input.on(Input.EventType.TOUCH_START, this.onTouch, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouch, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    private onTouch(event: EventTouch) {
        if (!this.layerTf) return;
        // UI 坐标 → PlayersLayer 节点局部坐标 → 地图坐标（地图以节点原点为中心绘制）
        const ui = event.getUILocation();
        const local = this.layerTf.convertToNodeSpaceAR(Main.TMP_VEC3.set(ui.x, ui.y, 0));
        this.touchTarget = { x: local.x + MAP_WIDTH / 2, y: local.y + MAP_HEIGHT / 2 };
    }

    private onTouchEnd() {
        this.touchTarget = null;
        this.sendDir(0, 0);
    }

    /** 每帧调用：朝按住的目标点修正移动方向 */
    private steerToTarget() {
        // dropping/未连接期间也计算并保存 desired；RoomClient 会在重连后按最新 seq
        // reconcile，特别是松手后的 stop 不能因为断线而丢掉。
        if (!this.touchTarget) return;
        const me = this.gameECS.getSelfPlayer();
        if (me === null) return;

        if (distance(PlayerModel.x[me], PlayerModel.y[me], this.touchTarget.x, this.touchTarget.y) <= Main.ARRIVE_RADIUS) {
            this.sendDir(0, 0);
            return;
        }
        const dir = normalize(this.touchTarget.x - PlayerModel.x[me], this.touchTarget.y - PlayerModel.y[me]);
        this.sendDir(dir.x, dir.y);
    }

    /** 方向有实质变化才更新 desired；RoomClient 决定当前是否可写及何时重放。 */
    private sendDir(x: number, y: number) {
        if (Math.abs(x - this.lastDirX) < 0.02 && Math.abs(y - this.lastDirY) < 0.02) return;
        this.lastDirX = x;
        this.lastDirY = y;
        RoomClient.inst.move(x, y);
    }
}
