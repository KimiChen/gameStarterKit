/**
 * 游戏入口组件 —— 挂到场景的 Canvas 节点上即可运行完整演示：
 *
 *   微信兼容补丁 → 登录页（FGUI）→ 主界面 Home（FGUI）→ 点「进入游戏」→
 *   加入 Colyseus 房间（WebSocket）→ 状态同步进 ECS → 插值 → Graphics 渲染 → 触摸移动
 *
 * 大厅壳（登录/选服/公告/Home）走 FGUI（view/pages.ts 组合根，动态 import 铁律 10）；
 * ballMove 玩法在「进入游戏」后才建渲染层/ECS/连房。
 *
 * 使用前：启动服务端 `npm run dev:server`（默认 http://localhost:2568）。
 */
import { _decorator, Component, Node, Graphics, UITransform, Color, input, Input, EventTouch, Vec3, view, ResolutionPolicy } from "cc";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "./designSpec";
import { installWeChatCompat } from "./core/wechat-compat";
import { getToken, initHttp } from "./core/http";
import { getCurrentServer } from "./net/serverSession";
import { RoomClient } from "./net/RoomClient";
import { GameECS } from "./logic/rooms/ballMove/GameECS";
import { PlayerModel } from "./logic/rooms/ballMove/GameComps";
import { S2C, MAP_WIDTH, MAP_HEIGHT, normalize, distance, type IPlayerState } from "./shared/index";

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
    @property({ tooltip: "服务端 http(s) 地址（微信真机需 https + 域名白名单）；与 server/.env.development 的 PORT 保持一致" })
    serverUrl = "http://localhost:2568";

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

    async start() {
        initHttp(this.serverUrl);
        // 大厅壳走 FGUI：动态 import 组合根（铁律 10——fairygui 不进静态依赖图）。
        // 登录页的「进入游戏」经 Home 走到 enterBattle 回调，才拉起 ballMove。
        try {
            const pages = await import("./view/pages");
            await pages.openLogin(() => { void this.enterBattle(); });
        } catch (err) {
            console.error("[Main] 大厅初始化失败（FairyGUI 扩展/资源包是否就绪？）：", err);
        }
    }

    /** Home 点「进入游戏」：关大厅 FGUI → 建 ballMove 渲染层/ECS/连房。 */
    private async enterBattle(): Promise<void> {
        if (this.inBattle) return;
        this.inBattle = true;
        try {
            const pages = await import("./view/pages");
            pages.closeLobby();
        } catch { /* 关不掉不阻塞进战斗 */ }
        this.initRenderLayer();
        this.initInput();
        try {
            await this.connectRoom();
            this.started = true;
        } catch (err) {
            console.error("[Main] 连接房间失败（请确认已运行 npm run dev:server）：", err);
        }
    }

    /** 连 ballMove 玩法房（token 已在大厅登录时设置；无 token 走游客）。
     *  区服=实例：连**选中区服的 wsUrl**（大厅选服设的 serverSession），无则回退 serverUrl。
     *  Colyseus Client 收 http(s) 端点自行派生 ws(s)，故把 ws:// 换回 http:// 再传。 */
    private async connectRoom() {
        const cur = getCurrentServer();
        const endpoint = cur?.wsUrl ? cur.wsUrl.replace(/^ws/, "http") : this.serverUrl;
        RoomClient.inst.init(endpoint);
        const room = await RoomClient.inst.joinGame({ token: getToken() });
        if (this.destroyed) {
            // 连接在途期间组件已销毁（场景重载）：房间立即退掉——否则它永驻并把
            // state 回调喂给 GameECS 单例，新 Main 再 join 后双房间喂同一 ECS（幽灵 isSelf）
            void RoomClient.inst.leave();
            return;
        }

        // 3. 服务端消息
        RoomClient.inst.onMessage(S2C.Welcome, (msg) => console.log(`[Main] ${msg.motd}（tickRate=${msg.tickRate}）`));
        RoomClient.inst.onMessage(S2C.Pong, (msg) => {
            this.rttMs = Date.now() - msg.clientTime;
            console.log(`[Main] RTT ${this.rttMs}ms`);
        });
        RoomClient.inst.onMessage(S2C.Chat, (msg) => console.log(`[聊天] ${msg.fromName}: ${msg.text}`));
        RoomClient.inst.onMessage(S2C.SkillResult, (msg) => console.log(`[战斗] ${msg.casterId} 技能${msg.skillId} 伤害${msg.damage}`));
        RoomClient.inst.onMessage(S2C.Error, (msg) => console.warn(`[服务端错误] ${msg.code}: ${msg.message}`));

        // 4. 状态同步 → ECS
        const $ = RoomClient.inst.state$();
        $(room.state).players.onAdd((player: IPlayerState, sessionId: string) => {
            this.gameECS.addPlayer(player, sessionId === room.sessionId);
            // 该玩家任意字段变化时，把最新值同步进 ECS
            $(player).onChange(() => this.gameECS.syncPlayer(player));
        });
        $(room.state).players.onRemove((_player: IPlayerState, sessionId: string) => {
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
        this.destroyed = true; // 见 connectServer：joinGame 在途返回后据此立即退房
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouch, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        void RoomClient.inst.leave();
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
        if (!this.touchTarget || !RoomClient.inst.connected) return;
        const me = this.gameECS.getSelfPlayer();
        if (me === null) return;

        if (distance(PlayerModel.x[me], PlayerModel.y[me], this.touchTarget.x, this.touchTarget.y) <= Main.ARRIVE_RADIUS) {
            this.sendDir(0, 0);
            return;
        }
        const dir = normalize(this.touchTarget.x - PlayerModel.x[me], this.touchTarget.y - PlayerModel.y[me]);
        this.sendDir(dir.x, dir.y);
    }

    /** 方向有实质变化才发包，避免逐帧刷屏；掉线窗口不发（SDK 会排队补发过期方向包） */
    private sendDir(x: number, y: number) {
        if (!RoomClient.inst.connected || RoomClient.inst.dropping) return;
        if (Math.abs(x - this.lastDirX) < 0.02 && Math.abs(y - this.lastDirY) < 0.02) return;
        this.lastDirX = x;
        this.lastDirY = y;
        RoomClient.inst.move(x, y);
    }
}
