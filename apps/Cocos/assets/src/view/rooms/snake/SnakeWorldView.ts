/**
 * SnakeWorldView：snake 玩法的 Cocos 表现层（docs/snakeoff/04 §4/§10、07）。
 *
 *  - 渲染：世界层（相机跟随自己蛇头、钳在场地内）+ HUD 层（倒计时/排名，非交互）
 *    + 控制层（左下摇杆/右下加速，多点触控按 pointer id 分离）+ 结算层（Settle 才显示）；
 *  - 蛇 = 头部 sprite（classic atlas 中帧，席位色系 tint）+ 身体 Graphics 圆节沿插值路径；
 *    食物 = 食物 atlas 切片；残骸 = Graphics 小圆点；素材来自 resources/snakeoff/
 *    （08 台账登记的源游戏素材，用户授权）；
 *  - 输入：摇杆死区内不产新方向、释放保持最后方向（04 §4.2）；加速按住 true、
 *    释放/取消 false；失焦/重连/结算/unmount 全部清 pointer ownership；
 *  - ⛔ 本文件是引擎绑定层（view/），不含规则判断——帧内容来自 logic 的插值帧 +
 *    HUD 模型，触摸只翻译成 `SnakeInput` 经 host 回流。
 */
import {
    Color,
    EventTouch,
    Graphics,
    Input,
    Label,
    Node,
    Rect,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    Vec3,
    input,
    resources,
    view,
} from "cc";
import type { SnakeInput, SnakePresentation } from "../../../logic/rooms/snake/SnakeGameplay";
import type { SnakeHudModel, SnakeSettleModel } from "../../../logic/rooms/snake/SnakeHud";
import type { SnakeRenderFrame, SnakeRenderSnake } from "../../../logic/rooms/snake/SnakeSnapshotBuffer";
import { SNAKE_RULESET } from "../../../shared/gameplays/snake/ruleset";
import { SnakeMeshRenderer } from "./SnakeMeshRenderer";

/** 席位色系（07 §3.2 四色扩到 8：色相分散 + AI 灰）。 */
const SEAT_COLORS = [
    new Color(67, 217, 177), // 青绿
    new Color(255, 179, 71), // 橙黄
    new Color(124, 140, 255), // 蓝紫
    new Color(255, 111, 174), // 粉红
    new Color(120, 220, 120), // 草绿
    new Color(255, 220, 90), // 明黄
    new Color(90, 200, 255), // 天蓝
    new Color(220, 160, 255), // 紫
];
const COLOR_AI = new Color(150, 150, 165);
const COLOR_SELF_RING = new Color(255, 255, 255, 220);
const COLOR_BG = new Color(24, 34, 59);
const COLOR_GRID = new Color(38, 53, 84, 90);
const COLOR_WALL = new Color(90, 110, 150);
const COLOR_WRECK = new Color(255, 220, 130);
const COLOR_FOOD_DOT = new Color(240, 200, 90);
const COLOR_FOOD_STAR = new Color(120, 210, 255);
const COLOR_FOOD_STAR_GLOW = new Color(220, 245, 255);
const COLOR_TEXT = new Color(244, 247, 255);
const COLOR_TEXT_DIM = new Color(158, 171, 196);

/** classic 蛇 atlas（216×72）三帧横排：身体 | 头 | 身体圆。 */
const CLASSIC_SKINS = ["snakeoff/snake_skin_classic_1", "snakeoff/snake_skin_classic_2", "snakeoff/snake_skin_classic_3"];
const HEAD_RECT = new Rect(72, 0, 72, 72);

const JOYSTICK_RADIUS = 110; // 摇杆底半径（设计像素）
const JOYSTICK_DEAD_ZONE = 12;
const BODY_POINT_RADIUS = SNAKE_RULESET.bodyWidth / 2;
const WRECK_RADIUS = 14;

type LoadedAssets = {
    heads: SpriteFrame[]; // classic skins 的头部帧
    bodyTextures: Texture2D[]; // classic skins 整图（GL 四边形带的身体贴图）
    joystickBase: SpriteFrame | null;
    joystickKnob: SpriteFrame | null;
    boost: SpriteFrame | null;
    resultBg: SpriteFrame | null;
    button: SpriteFrame | null;
};

export class SnakeWorldView implements SnakePresentation {
    private static readonly TMP_VEC3 = new Vec3();

    private mounted = false;
    private root: Node | null = null;
    private uiLayer = 0;
    private worldLayer: Node | null = null;
    private bgGraphics: Graphics | null = null; // 静态：底色/网格/边界（mount 画一次）
    private fxGraphics: Graphics | null = null; // 动态：食物/残骸/描边（逐帧重建）
    private meshRenderer: SnakeMeshRenderer | null = null; // GL 四边形带（身体主渲染）
    private hudLayer: Node | null = null;
    private countdownLabel: Label | null = null;
    private rankLabels: Label[] = [];
    private statusLabel: Label | null = null;
    private controlLayer: Node | null = null;
    private joystickBase: Node | null = null;
    private joystickKnob: Node | null = null;
    private boostNode: Node | null = null;
    private settleLabels: Label[] = [];
    private maskNode: Node | null = null;
    private assets: LoadedAssets | null = null;
    private headSprites = new Map<string, Sprite>();
    private joystickPointerId: number | null = null;
    private boostPointerId: number | null = null;
    private boosting = false;
    private settled = false;
    private selfId: string | null = null;

    constructor(
        private readonly host: Node,
        private readonly dispatchInput: (input: SnakeInput) => void,
        private readonly requestExit: () => void,
    ) {}

    mount(): void {
        if (this.mounted) return;
        this.mounted = true; // 先占位：引擎调用中途失败时 unmount 能完整回滚
        const root = new Node("SnakeWorld");
        root.layer = this.host.layer;
        this.root = root;
        this.host.addChild(root);
        // ⚠ Cocos 的 layer ⛔ 不继承：new Node() 默认 DEFAULT layer，而场景相机
        // visibility 只含 UI_2D——所有自建节点都必须显式设为主机 layer，
        // 否则相机完全看不见（黑屏真根因；BallMoveView 逐个显式赋值同款）。
        this.uiLayer = this.host.layer;

        this.worldLayer = new Node("SnakeWorld.World");
        this.worldLayer.layer = this.uiLayer;
        root.addChild(this.worldLayer);
        // ⚠ Graphics/Sprite/Label 都走 UI 渲染管线，节点必须先有 UITransform——
        // 缺失时组件不报错但什么都不画（黑屏根因；BallMoveView 同样先加它）。
        this.worldLayer.addComponent(UITransform);
        // 性能分层（对齐原游戏 GLNode 的 draw call 经济：背景一次性、实体合批）：
        // 静态背景（底色/网格/边界）只画一次，不随帧重建；
        // 动态实体（食物/残骸/蛇身）在独立 Graphics 上逐帧 clear 重画。
        const bgNode = new Node("SnakeWorld.Background");
        bgNode.layer = this.uiLayer;
        this.worldLayer.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this.bgGraphics = bgNode.addComponent(Graphics);
        this.paintBackground();
        const fxNode = new Node("SnakeWorld.Fx");
        fxNode.layer = this.uiLayer;
        this.worldLayer.addChild(fxNode);
        fxNode.addComponent(UITransform);
        this.fxGraphics = fxNode.addComponent(Graphics);

        this.hudLayer = new Node("SnakeWorld.Hud");
        this.hudLayer.layer = this.uiLayer;
        root.addChild(this.hudLayer);
        this.buildHud();

        this.controlLayer = new Node("SnakeWorld.Controls");
        this.controlLayer.layer = this.uiLayer;
        root.addChild(this.controlLayer);
        this.buildControls();

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

        void this.loadAssets();
    }

    render(frame: SnakeRenderFrame, hud: SnakeHudModel): void {
        if (!this.mounted || this.settled) return;
        this.selfId = hud.entries.find((entry) => entry.isSelf)?.id ?? this.selfId;
        this.renderWorld(frame);
        this.renderHud(hud);
    }

    showSettle(model: SnakeSettleModel): void {
        if (!this.mounted || this.settled) return;
        this.settled = true;
        this.releasePointers();
        const layer = new Node("SnakeWorld.Settle");
        layer.layer = this.uiLayer;
        this.root?.addChild(layer);
        const size = view.getVisibleSize();
        // 底
        if (this.assets?.resultBg) {
            const bg = this.newSprite(layer, this.assets.resultBg, 0, 0, null);
            bg?.node.setScale(1.2, 1.2, 1);
        }
        const title = this.newLabel(layer, "本局结果", 0, size.height / 4 + 160, 44, COLOR_TEXT);
        title.fontSize = 44;
        const winner = model.winnerName ? `🏆 ${model.winnerName}` : "";
        this.newLabel(layer, winner, 0, size.height / 4 + 104, 30, new Color(255, 184, 77));
        model.entries.slice(0, 8).forEach((entry, index) => {
            const color = entry.isSelf ? new Color(89, 217, 142) : entry.isAi ? COLOR_TEXT_DIM : COLOR_TEXT;
            const line = `${entry.rank}  ${entry.name}${entry.isAi ? "（AI）" : ""}   ${entry.score} 分`;
            const label = this.newLabel(layer, line, 0, size.height / 4 + 48 - index * 44, 30, color);
            this.settleLabels.push(label);
        });
        // 返回主页按钮（sprite + 文字 + 触摸）
        const buttonY = -size.height / 4 - 60;
        const button = this.assets?.button ? this.newSprite(layer, this.assets.button, 0, buttonY, null) : null;
        const buttonNode = button?.node ?? this.newLabel(layer, "", 0, buttonY, 30, COLOR_TEXT).node;
        this.newLabel(buttonNode, "返回主页", 0, -4, 32, COLOR_TEXT);
        buttonNode.on(Node.EventType.TOUCH_END, () => {
            if (this.mounted) this.requestExit();
        }, this);
    }

    setReconnecting(reconnecting: boolean): void {
        if (!this.mounted) return;
        if (reconnecting) {
            this.releasePointers();
            if (!this.maskNode && this.root) {
                const mask = new Node("SnakeWorld.ReconnectMask");
                mask.layer = this.uiLayer;
                this.maskNode = mask;
                this.root.addChild(mask);
                this.newLabel(mask, "正在重连…", 0, 0, 36, COLOR_TEXT);
            }
            return;
        }
        this.maskNode?.destroy();
        this.maskNode = null;
    }

    unmount(): void {
        if (!this.mounted && !this.root) return;
        this.mounted = false;
        this.releasePointers();
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        this.headSprites.clear();
        this.settleLabels = [];
        this.rankLabels = [];
        this.assets = null;
        const root = this.root;
        this.root = null;
        this.meshRenderer?.dispose();
        this.meshRenderer = null;
        this.worldLayer = null;
        this.bgGraphics = null;
        this.fxGraphics = null;
        this.hudLayer = null;
        this.controlLayer = null;
        this.maskNode = null;
        this.joystickBase = null;
        this.joystickKnob = null;
        this.boostNode = null;
        root?.destroy();
    }

    // ── 资源装载（异步；装载完成前渲染回退 Graphics 圆点）──────────────────

    private async loadAssets(): Promise<void> {
        const loadTexture = (path: string): Promise<Texture2D | null> =>
            new Promise((resolve) => {
                resources.load(path, Texture2D, (error, asset) => resolve(error ? null : asset));
            });
        const frame = (texture: Texture2D | null, rect?: Rect): SpriteFrame | null => {
            if (!texture) return null;
            const spriteFrame = new SpriteFrame();
            spriteFrame.texture = texture;
            // ⚠ new SpriteFrame() 的默认 rect 是 (0,0,0,0)：不设 = 什么都不画。
            // 未传 rect 时用纹理全尺寸（摇杆/加速/结算底图等整图素材）。
            spriteFrame.rect = rect ?? new Rect(0, 0, texture.width, texture.height);
            return spriteFrame;
        };
        const [s1, s2, s3, joystickBase, joystickKnob, boost, resultBg, button] = await Promise.all([
            loadTexture(CLASSIC_SKINS[0]),
            loadTexture(CLASSIC_SKINS[1]),
            loadTexture(CLASSIC_SKINS[2]),
            loadTexture("snakeoff/snake_control_joystick_base"),
            loadTexture("snakeoff/snake_control_joystick_knob"),
            loadTexture("snakeoff/snake_control_boost"),
            loadTexture("snakeoff/snake_result_bg"),
            loadTexture("snakeoff/snake_btn_blue"),
        ]);
        if (!this.mounted) return; // 装载期间 unmount：丢弃结果
        this.assets = {
            heads: [s1, s2, s3].map((texture) => frame(texture, HEAD_RECT)).filter((f): f is SpriteFrame => f !== null),
            bodyTextures: [s1, s2, s3].filter((texture): texture is Texture2D => texture !== null),
            joystickBase: frame(joystickBase),
            joystickKnob: frame(joystickKnob),
            boost: frame(boost),
            resultBg: frame(resultBg),
            button: frame(button),
        };
        this.applyControlSprites();
    }

    // ── 世界渲染 ───────────────────────────────────────────────────────────

    private paintBackground(): void {
        const graphics = this.bgGraphics;
        if (!graphics) return;
        const halfW = SNAKE_RULESET.worldWidth / 2;
        const halfH = SNAKE_RULESET.worldHeight / 2;
        graphics.fillColor = COLOR_BG;
        graphics.rect(-halfW, -halfH, halfW * 2, halfH * 2);
        graphics.fill();
        // 网格（07 §5.1：低对比，不干扰碰撞判断）
        graphics.lineWidth = 1;
        graphics.strokeColor = COLOR_GRID;
        for (let x = -halfW; x <= halfW; x += 100) {
            graphics.moveTo(x, -halfH);
            graphics.lineTo(x, halfH);
        }
        for (let y = -halfH; y <= halfH; y += 100) {
            graphics.moveTo(-halfW, y);
            graphics.lineTo(halfW, y);
        }
        graphics.stroke();
        // 边界亮一档
        graphics.lineWidth = 4;
        graphics.strokeColor = COLOR_WALL;
        graphics.rect(-halfW, -halfH, halfW * 2, halfH * 2);
        graphics.stroke();
    }

    private renderWorld(frame: SnakeRenderFrame): void {
        const graphics = this.fxGraphics;
        if (!graphics || !this.worldLayer) return;

        // 相机：跟随自己蛇头（竖版地图接近一屏，钳在场地内）
        const self = frame.snakes.find((snake) => snake.id === this.selfId) ?? frame.snakes[0];
        if (self && self.points.length > 0) {
            const head = self.points[0];
            const halfW = SNAKE_RULESET.worldWidth / 2;
            const halfH = SNAKE_RULESET.worldHeight / 2;
            const size = view.getVisibleSize();
            const clampX = Math.max(-(halfW - size.width / 2 + 40), Math.min(halfW - size.width / 2 + 40, -head.x));
            const clampY = Math.max(-(halfH - size.height / 2 + 40), Math.min(halfH - size.height / 2 + 40, -head.y));
            this.worldLayer.setPosition(
                Number.isFinite(clampX) ? clampX : 0,
                Number.isFinite(clampY) ? clampY : 0,
                0,
            );
        }

        // GL 四边形带渲染器：素材（classic 整图纹理）就绪后懒建，只建一次。
        if (!this.meshRenderer && this.worldLayer && (this.assets?.bodyTextures.length ?? 0) > 0) {
            this.meshRenderer = new SnakeMeshRenderer(this.worldLayer, this.uiLayer, this.assets!.bodyTextures);
        }

        // 动态层逐帧 clear 重画（增量追踪在点数/集合规模下是无谓复杂度）：
        // 食物 ⛔ 不用 sprite（128 个 = 128 draw call，实测 100+ 卡到十几帧）——
        // 两个 fill 批收编全部 Dot/Star；残骸 1 批；蛇身每蛇 1 批（同色）。
        graphics.clear();

        graphics.fillColor = COLOR_FOOD_DOT;
        for (const food of frame.foods) {
            if (food.kind === 0) graphics.circle(food.x, food.y, 9);
        }
        graphics.fill();
        graphics.fillColor = COLOR_FOOD_STAR;
        graphics.lineWidth = 2;
        graphics.strokeColor = COLOR_FOOD_STAR_GLOW;
        for (const food of frame.foods) {
            if (food.kind === 1) graphics.circle(food.x, food.y, 16);
        }
        graphics.fill();
        graphics.stroke();

        graphics.fillColor = COLOR_WRECK;
        for (const wreck of frame.wrecks) {
            graphics.circle(wreck.x, wreck.y, WRECK_RADIUS);
        }
        graphics.fill();

        for (const snake of frame.snakes) {
            this.renderSnake(graphics, snake);
        }
    }

    private renderSnake(graphics: Graphics, snake: SnakeRenderSnake): void {
        if (!snake.alive || snake.points.length === 0) {
            this.meshRenderer?.removeSnake(snake.id);
            this.headSprites.get(snake.id)?.node.destroy();
            this.headSprites.delete(snake.id);
            return;
        }
        const isSelf = snake.id === this.selfId;
        const color = snake.ai ? COLOR_AI : SEAT_COLORS[this.seatColorIndex(snake.id)];
        // 身体主渲染：GL 四边形带（每蛇一条网格一次提交）；失败回退 Graphics 圆节。
        if (this.meshRenderer?.renderSnake(snake.id, snake.points, color) !== true) {
            graphics.fillColor = color;
            for (let i = 1; i < snake.points.length; i++) {
                const point = snake.points[i];
                graphics.circle(point.x, point.y, BODY_POINT_RADIUS);
            }
            graphics.fill();
        }
        // 自己的细白外轮廓（07 §3.2：不只靠颜色区分）
        if (isSelf) {
            graphics.lineWidth = 3;
            graphics.strokeColor = COLOR_SELF_RING;
            for (let i = 1; i < snake.points.length; i++) {
                const point = snake.points[i];
                graphics.circle(point.x, point.y, BODY_POINT_RADIUS + 2);
            }
            graphics.stroke();
        }
        // 头部 sprite（tint 席位色）
        const head = snake.points[0];
        let sprite = this.headSprites.get(snake.id);
        const headFrame = this.assets?.heads[snake.skin % Math.max(1, this.assets.heads.length)] ?? null;
        if (headFrame && this.worldLayer) {
            if (!sprite) {
                const created = this.newSprite(this.worldLayer, headFrame, head.x, head.y, color);
                if (created) {
                    sprite = created;
                    this.headSprites.set(snake.id, created);
                }
            }
            if (sprite) {
                sprite.node.setPosition(head.x, head.y, 0);
                sprite.node.angle = -snakeDirectionOf(snake);
            }
        } else {
            graphics.fillColor = color;
            graphics.circle(head.x, head.y, BODY_POINT_RADIUS + 4);
            graphics.fill();
        }
    }

    /** 席位色序：由 id 稳定派生（与 joinOrdinal 无关——快照里没有它）。 */
    private seatColorIndex(id: string): number {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
        return hash % SEAT_COLORS.length;
    }


    // ── HUD ─────────────────────────────────────────────────────────────

    private buildHud(): void {
        if (!this.hudLayer) return;
        const size = view.getVisibleSize();
        this.countdownLabel = this.newLabel(this.hudLayer, "", 0, size.height / 2 - 60, 40, COLOR_TEXT);
        this.statusLabel = this.newLabel(this.hudLayer, "", 0, -size.height / 2 + 220, 26, new Color(255, 102, 120));
        for (let i = 0; i < 8; i++) {
            const label = this.newLabel(this.hudLayer, "", size.width / 2 - 130, size.height / 2 - 150 - i * 34, 24, COLOR_TEXT_DIM);
            label.horizontalAlign = 2; // 右对齐
            this.rankLabels.push(label);
        }
    }

    private setLabelText(label: Label | null, text: string): void {
        if (!label || label.string === text) return; // ⛔ 每帧同值重写 = 反复标脏触发 TTF 重排
        label.string = text;
    }

    private renderHud(hud: SnakeHudModel): void {
        if (this.countdownLabel) {
            this.setLabelText(this.countdownLabel, hud.inStartCountdown
                ? `准备 ${hud.countdownSeconds}`
                : `${Math.floor(hud.countdownSeconds / 60)}:${String(hud.countdownSeconds % 60).padStart(2, "0")}`);
        }
        hud.entries.slice(0, 8).forEach((entry, index) => {
            const label = this.rankLabels[index];
            if (!label) return;
            this.setLabelText(label, `${entry.rank}. ${entry.name} ${entry.score}`);
            label.color = entry.isSelf ? new Color(89, 217, 142) : entry.isAi ? COLOR_TEXT_DIM : COLOR_TEXT;
        });
        for (let i = hud.entries.length; i < this.rankLabels.length; i++) {
            this.setLabelText(this.rankLabels[i], "");
        }
        if (this.statusLabel) {
            this.setLabelText(this.statusLabel, !hud.selfAlive && hud.selfRespawnSeconds > 0
                ? `复活倒计时 ${hud.selfRespawnSeconds}s`
                : "");
        }
    }

    // ── 控制层（摇杆 + 加速）──────────────────────────────────────────────

    private buildControls(): void {
        if (!this.controlLayer) return;
        const size = view.getVisibleSize();
        this.joystickBase = new Node("SnakeWorld.JoystickBase");
        this.joystickBase.layer = this.uiLayer;
        this.controlLayer.addChild(this.joystickBase);
        this.joystickBase.addComponent(UITransform);
        this.joystickBase.setPosition(-size.width / 2 + 170, -size.height / 2 + 220, 0);
        this.joystickKnob = new Node("SnakeWorld.JoystickKnob");
        this.joystickKnob.layer = this.uiLayer;
        this.joystickBase.addChild(this.joystickKnob);
        this.joystickKnob.addComponent(UITransform);
        this.boostNode = new Node("SnakeWorld.Boost");
        this.boostNode.layer = this.uiLayer;
        this.controlLayer.addChild(this.boostNode);
        this.boostNode.addComponent(UITransform);
        this.boostNode.setPosition(size.width / 2 - 170, -size.height / 2 + 220, 0);
        this.applyControlSprites();
    }

    private applyControlSprites(): void {
        if (!this.assets) return;
        const place = (node: Node | null, frame: SpriteFrame | null, scale: number): void => {
            if (!node || !frame || node.getComponent(Sprite)) return;
            const sprite = node.addComponent(Sprite);
            sprite.spriteFrame = frame;
            node.setScale(scale, scale, 1);
        };
        place(this.joystickBase, this.assets.joystickBase, (JOYSTICK_RADIUS * 2) / 328);
        place(this.joystickKnob, this.assets.joystickKnob, 0.8);
        place(this.boostNode, this.assets.boost, 0.75);
    }

    private onTouchStart(event: EventTouch): void {
        if (!this.mounted || this.settled) return;
        const ui = event.getUILocation();
        const size = view.getVisibleSize();
        const pointerId = event.getID();
        // 加速区（右下，半径 200 的大命中区：对齐原游戏 speedUpNode 的按住语义）
        if (this.boostNode && this.boostPointerId === null && this.withinNode(event, this.boostNode, 200)) {
            this.boostPointerId = pointerId;
            this.setBoost(true);
            return;
        }
        // 摇杆区（左半屏：与原游戏的方向触摸区同构——拇指热区，不是可见摇杆才有效）
        if (this.joystickPointerId === null && ui.x < size.width / 2) {
            this.joystickPointerId = pointerId;
            this.steerTo(event);
        }
    }

    private onTouchMove(event: EventTouch): void {
        if (!this.mounted || this.settled) return;
        if (event.getID() === this.joystickPointerId) this.steerTo(event);
    }

    private onTouchEnd(event: EventTouch): void {
        const pointerId = event.getID();
        if (pointerId === this.boostPointerId) {
            this.boostPointerId = null;
            this.setBoost(false);
        }
        if (pointerId === this.joystickPointerId) {
            // 释放摇杆保持最后方向（04 §4.2），只回正摇杆帽
            this.joystickPointerId = null;
            this.joystickKnob?.setPosition(0, 0, 0);
        }
    }

    private steerTo(event: EventTouch): void {
        if (!this.joystickBase) return;
        const ui = event.getUILocation();
        const transform = this.controlLayer?.getComponent(UITransform)
            ?? this.controlLayer?.addComponent(UITransform);
        if (!transform) return;
        const local = transform.convertToNodeSpaceAR(SnakeWorldView.TMP_VEC3.set(ui.x, ui.y, 0));
        const base = this.joystickBase.position;
        const dx = local.x - base.x;
        const dy = local.y - base.y;
        const distance = Math.hypot(dx, dy);
        if (distance < JOYSTICK_DEAD_ZONE) return; // 死区内不产新方向
        const capped = Math.min(distance, JOYSTICK_RADIUS);
        const nx = dx / distance;
        const ny = dy / distance;
        this.joystickKnob?.setPosition(nx * capped, ny * capped, 0);
        this.dispatchInput({ type: "steer", dirX: nx, dirY: ny, boost: this.boosting });
    }

    private setBoost(boost: boolean): void {
        if (this.boosting === boost) return;
        this.boosting = boost;
        if (boost) {
            this.dispatchInput({ type: "steer", dirX: 0, dirY: 0, boost: true });
        } else {
            this.dispatchInput({ type: "release-boost" });
        }
    }

    private withinNode(event: EventTouch, node: Node, radius: number): boolean {
        const ui = event.getUILocation();
        const transform = this.controlLayer?.getComponent(UITransform)
            ?? this.controlLayer?.addComponent(UITransform);
        if (!transform) return false;
        const local = transform.convertToNodeSpaceAR(SnakeWorldView.TMP_VEC3.set(ui.x, ui.y, 0));
        const position = node.position;
        return Math.hypot(local.x - position.x, local.y - position.y) <= radius;
    }

    private releasePointers(): void {
        const hadBoost = this.boosting;
        this.joystickPointerId = null;
        this.boostPointerId = null;
        this.boosting = false;
        this.joystickKnob?.setPosition(0, 0, 0);
        if (hadBoost) this.dispatchInput({ type: "release-boost" });
    }

    // ── 小工具 ───────────────────────────────────────────────────────────

    private newLabel(parent: Node, text: string, x: number, y: number, fontSize: number, color: Color): Label {
        const node = new Node(`label-${text.slice(0, 8)}`);
        node.layer = this.uiLayer;
        parent.addChild(node);
        node.addComponent(UITransform); // UI 渲染前提（见 mount 的 ⚠）
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.color = color;
        return label;
    }

    private newSprite(parent: Node, frame: SpriteFrame, x: number, y: number, tint: Color | null): Sprite | null {
        const node = new Node("sprite");
        node.layer = this.uiLayer;
        parent.addChild(node);
        node.addComponent(UITransform); // UI 渲染前提（见 mount 的 ⚠）
        node.setPosition(x, y, 0);
        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = frame;
        if (tint) sprite.color = tint;
        return sprite;
    }
}

/** 蛇头朝向角（Cocos angle 是逆时针度数、y 轴向上；我们的世界方向角同系，取负渲染）。 */
function snakeDirectionOf(snake: SnakeRenderSnake): number {
    if (snake.points.length < 2) return 0;
    const head = snake.points[0];
    const neck = snake.points[1];
    return (Math.atan2(head.y - neck.y, head.x - neck.x) * 180) / Math.PI;
}
