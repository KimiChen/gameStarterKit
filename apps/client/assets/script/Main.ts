/**
 * 游戏入口组件 —— 挂到场景的 Canvas 节点上即可运行完整演示：
 *
 *   微信兼容补丁 → mock 登录（HTTP）→ 加入 Colyseus 房间（WebSocket）
 *   → 服务端状态同步进 ECS → 插值系统平滑移动 → Graphics 零资源渲染
 *   → 触摸屏幕发送移动输入
 *
 * 使用前：启动服务端 `npm run dev:server`（默认 http://localhost:2568）。
 */
import { _decorator, Component, Node, Graphics, UITransform, Color, input, Input, EventTouch, Vec3 } from "cc";
import { installWeChatCompat } from "./net/wechat-compat";
import { HttpApi } from "./net/HttpApi";
import { NetManager } from "./net/NetManager";
import { GameECS } from "./game/GameECS";
import { S2C, MAP_WIDTH, MAP_HEIGHT, ErrorCode, normalize, distance, type IPlayerState } from "./shared/index";

// ⚠ 必须在任何 Colyseus 调用之前安装（模块加载期执行，早于所有组件生命周期）
installWeChatCompat();

const { ccclass, property } = _decorator;

@ccclass("Main")
export class Main extends Component {
    @property({ tooltip: "服务端 http(s) 地址（微信真机需 https + 域名白名单）；与 server/.env.development 的 PORT 保持一致" })
    serverUrl = "http://localhost:2568";

    // ECS 组/系统注册是全局状态，必须用单例（重复 new 会泄漏 group 与回调）
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

    async start() {
        this.initRenderLayer();
        this.initInput();
        this.gameECS.init();

        try {
            await this.connectServer();
            this.started = true;
        } catch (err) {
            console.error("[Main] 连接服务端失败（请确认已运行 npm run dev:server）：", err);
        }
    }

    private async connectServer() {
        // 1. HTTP 模拟接口：登录 + 拉档案（假数据）
        HttpApi.init(this.serverUrl);
        const login = await HttpApi.login("wx-mock-code");
        if (login.code !== ErrorCode.Ok || !login.data) throw new Error(`登录失败 code=${login.code}`);
        console.log("[Main] mock 登录成功：", login.data.openId);

        const profile = await HttpApi.profile();
        if (profile.code === ErrorCode.Ok && profile.data) {
            console.log("[Main] 玩家档案：", JSON.stringify(profile.data));
        }

        // 2. Colyseus：加入房间
        NetManager.inst.init(this.serverUrl);
        const room = await NetManager.inst.joinGame({ token: HttpApi.token });

        // 3. 服务端消息
        NetManager.inst.onMessage(S2C.Welcome, (msg) => console.log(`[Main] ${msg.motd}（tickRate=${msg.tickRate}）`));
        NetManager.inst.onMessage(S2C.Pong, (msg) => {
            this.rttMs = Date.now() - msg.clientTime;
            console.log(`[Main] RTT ${this.rttMs}ms`);
        });
        NetManager.inst.onMessage(S2C.Chat, (msg) => console.log(`[聊天] ${msg.fromName}: ${msg.text}`));
        NetManager.inst.onMessage(S2C.SkillResult, (msg) => console.log(`[战斗] ${msg.casterId} 技能${msg.skillId} 伤害${msg.damage}`));
        NetManager.inst.onMessage(S2C.Error, (msg) => console.warn(`[服务端错误] ${msg.code}: ${msg.message}`));

        // 4. 状态同步 → ECS
        const $ = NetManager.inst.state$();
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
        this.gameECS.update(dt);
        this.steerToTarget();
        this.draw();

        // 每 5 秒一次心跳
        if (this.started) {
            this.pingTimer += dt;
            if (this.pingTimer >= 5) {
                this.pingTimer = 0;
                NetManager.inst.ping();
            }
        }
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouch, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        void NetManager.inst.leave();
        this.gameECS.clear();
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
        gfx.strokeColor = new Color(120, 120, 120, 255);
        gfx.rect(ox, oy, MAP_WIDTH, MAP_HEIGHT);
        gfx.stroke();

        this.gameECS.forEachPlayer((m) => {
            const px = ox + m.x;
            const py = oy + m.y;

            // 本机绿色，其他人橙色，死亡灰色
            gfx.fillColor = !m.alive
                ? new Color(100, 100, 100, 255)
                : m.isSelf
                    ? new Color(60, 200, 120, 255)
                    : new Color(240, 150, 60, 255);
            gfx.circle(px, py, 20);
            gfx.fill();

            // 血条
            const ratio = m.maxHp > 0 ? m.hp / m.maxHp : 0;
            gfx.fillColor = new Color(40, 40, 40, 255);
            gfx.rect(px - 25, py + 28, 50, 6);
            gfx.fill();
            gfx.fillColor = new Color(220, 60, 60, 255);
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
        const local = this.layerTf.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
        this.touchTarget = { x: local.x + MAP_WIDTH / 2, y: local.y + MAP_HEIGHT / 2 };
    }

    private onTouchEnd() {
        this.touchTarget = null;
        this.sendDir(0, 0);
    }

    /** 每帧调用：朝按住的目标点修正移动方向 */
    private steerToTarget() {
        if (!this.touchTarget || !NetManager.inst.connected) return;
        const me = this.gameECS.getSelfPlayer();
        if (!me) return;

        if (distance(me.x, me.y, this.touchTarget.x, this.touchTarget.y) <= Main.ARRIVE_RADIUS) {
            this.sendDir(0, 0);
            return;
        }
        const dir = normalize(this.touchTarget.x - me.x, this.touchTarget.y - me.y);
        this.sendDir(dir.x, dir.y);
    }

    /** 方向有实质变化才发包，避免逐帧刷屏 */
    private sendDir(x: number, y: number) {
        if (!NetManager.inst.connected) return;
        if (Math.abs(x - this.lastDirX) < 0.02 && Math.abs(y - this.lastDirY) < 0.02) return;
        this.lastDirX = x;
        this.lastDirY = y;
        NetManager.inst.move(x, y);
    }
}
