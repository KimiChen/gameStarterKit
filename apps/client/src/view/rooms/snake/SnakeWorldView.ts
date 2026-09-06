/** Snake Endless V2 Cocos 表现：稳定皮肤、中央操作区、个人复活/结果。 */
import {
    AudioClip,
    AudioSource,
    Color,
    EventTouch,
    Game,
    Graphics,
    Input,
    JsonAsset,
    Label,
    Node,
    Rect,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    game,
    input,
    resources,
    sys,
    view,
} from "cc";
import type { SnakeInput, SnakePresentation } from "../../../logic/rooms/snake/SnakeGameplay";
import {
    SnakePointerRouter,
    SNAKE_HANDEDNESS_STORAGE_KEY,
    snakeControlLayout,
    type HandednessPreferencePort,
    type SnakeHandedness,
} from "../../../logic/rooms/snake/SnakeControls";
import type { SnakeHudModel, SnakePersonalResultModel, SnakeReliveViewModel } from "../../../logic/rooms/snake/SnakeHud";
import type { SnakeRenderFrame, SnakeRenderSnake } from "../../../logic/rooms/snake/SnakeSnapshotBuffer";
import {
    CLIENT_SNAKE_PRESENTATION_CATALOG,
    SNAKE_ENTITY_PRESENTATION_CATALOG,
    resolveClientSnakeSkinPresentation,
    resolveMagnetRuntimePresentation,
    validateFrameDefinition,
    type ClientSkinPresentation,
    type FrameDefinition,
} from "../../../logic/rooms/snake/SnakePresentationCatalog";
import { snakeCameraScale, SNAKE_RULESET } from "../../../shared/gameplays/snake/ruleset";
import type { ISnakeReliveDecisionResult, ISnakeReliveOffered, ISnakeReliveResolved, ISnakeRunFinalizing } from "../../../shared/index";
import { SnakeMeshRenderer, snakeTimedFrame } from "./SnakeMeshRenderer";
import { SnakeFoodMeshRenderer } from "./SnakeFoodMeshRenderer";
import {
    SnakeMagnetAuraRenderer,
    snakeMagnetAuraDependencies,
} from "./SnakeMagnetAuraRenderer";

const WHITE = new Color(255, 255, 255);
const TEXT = new Color(244, 247, 255);
const DIM = new Color(158, 171, 196);
/** 结算页「我的衣柜」用的次要动作色（与同排的「返回主页」区分开）。 */
const LINK = new Color(120, 200, 255);
const SELF = new Color(255, 255, 255, 220);
/** 覆盖层的全屏压暗底与面板底色；⚠ 都要不透明到能压住活动的战场，见 newBackdrop。 */
/** `plugins/snake/snake_result_bg` 的原生高度；⚠ 贴图缺失时结算页仍按这个尺寸排布，⛔ 别退回视口比例。 */
const RESULT_PANEL_HEIGHT = 694;
const SCRIM = new Color(6, 10, 20, 196);
const PANEL = new Color(24, 32, 52, 242);
const DOT = new Color(240, 200, 90);
const STAR = new Color(120, 210, 255);
const WRECK = new Color(255, 220, 130);

interface LoadedAssets {
    readonly skinTextures: ReadonlyMap<number, Texture2D>;
    readonly foodTexture: Texture2D | null;
    readonly joystickBase: SpriteFrame | null;
    readonly joystickKnob: SpriteFrame | null;
    readonly boost: SpriteFrame | null;
    readonly magnet: SpriteFrame | null;
    readonly magnetActiveMode: "aura" | "status-icon-fallback";
    readonly magnetAuraRecipe: unknown | null;
    readonly magnetAuraFrames: ReadonlyMap<string, SpriteFrame>;
    readonly resultBg: SpriteFrame | null;
    readonly button: SpriteFrame | null;
    readonly collectMagnetClip: AudioClip | null;
    readonly collectMagnetVolume: number;
    readonly boostEffect: SpriteFrame | null;
    readonly protectionEffect: SpriteFrame | null;
}

/**
 * 战场底色主题。⚠ 这是一次**实施选型**，不是从数据推导出来的：目录里 light/dark 两套都有，
 * 本仓没有任何运行时主题/换肤接缝（`apps/{client,shared,server}/src` 内 `theme` 只作为生成目录
 * 数据出现），所以必须在代码里二选一。首发固定 dark。
 *
 * ⚠ 与来源 fresh-install 默认（light）不同。S0 只对**复刻产物**冻结 light，⛔ 未约束 V2 运行时渲染，
 * 所以这不是与冻结基线冲突。要改成可配置需要先有主题接缝，归后续阶段。
 */
const BACKGROUND_THEME = "dark" as const;

export class SnakeWorldView implements SnakePresentation {
    readonly handednessPreference: HandednessPreferencePort = {
        read: (key) => sys.localStorage.getItem(key),
        write: (key, value) => sys.localStorage.setItem(key, value),
    };

    private mounted = false;
    private root: Node | null = null;
    private worldLayer: Node | null = null;
    private fxGraphics: Graphics | null = null;
    private meshRenderer: SnakeMeshRenderer | null = null;
    private foodRenderer: SnakeFoodMeshRenderer | null = null;
    private hudLayer: Node | null = null;
    private controlLayer: Node | null = null;
    private joystickBase: Node | null = null;
    private joystickKnob: Node | null = null;
    private readonly slotNodes = new Map<string, Node>();
    private countdownLabel: Label | null = null;
    private statusLabel: Label | null = null;
    private readonly rankLabels: Label[] = [];
    private readonly headSprites = new Map<string, Sprite>();
    private readonly tailSprites = new Map<string, Sprite>();
    private readonly nameLabels = new Map<string, Label>();
    private readonly boostSprites = new Map<string, Sprite>();
    private readonly protectionSprites = new Map<string, Sprite>();
    private readonly toolSprites = new Map<number, Sprite>();
    private readonly warnedSkinIds = new Set<number>();
    private readonly skinFrameCache = new Map<string, SpriteFrame>();
    private visibleSnakeIds = new Set<string>();
    private assets: LoadedAssets | null = null;
    private router: SnakePointerRouter | null = null;
    private handedness: SnakeHandedness = "right";
    private safeBottom = 0;
    private boosting = false;
    private selfId: string | null = null;
    private reliveLayer: Node | null = null;
    private reliveLabel: Label | null = null;
    private resultLayer: Node | null = null;
    private confirmLayer: Node | null = null;
    private reconnectLayer: Node | null = null;
    private resourceFailureLayer: Node | null = null;
    private magnetStatusSprite: Sprite | null = null;
    private magnetFallbackSprite: Sprite | null = null;
    private magnetAuraRenderer: SnakeMagnetAuraRenderer | null = null;
    private magnetAuraFailed = false;
    private battleBlocked = false;
    private uiLayer = 0;
    private audioSource: AudioSource | null = null;
    private observedMagnetRunId: string | null = null;
    private observedMagnetCount = 0;

    constructor(
        private readonly host: Node,
        private readonly dispatchInput: (input: SnakeInput) => void,
        private readonly requestExit: () => void,
        private readonly sfxEnabled: () => boolean = () => true,
        /** 结算页「我的衣柜」：打开衣柜 route（装配件经 plugin holder 接线）。缺省 no-op 供无头装配。 */
        private readonly openWardrobe: () => void = () => {},
    ) {}

    mount(): void {
        if (this.mounted) return;
        this.mounted = true;
        this.uiLayer = this.host.layer;
        const root = this.node("SnakeWorld", this.host);
        this.root = root;
        this.worldLayer = this.node("SnakeWorld.World", root, true);
        const background = this.node("SnakeWorld.Background", this.worldLayer, true).addComponent(Graphics);
        this.paintBackground(background);
        this.fxGraphics = this.node("SnakeWorld.Fx", this.worldLayer, true).addComponent(Graphics);
        this.hudLayer = this.node("SnakeWorld.Hud", root, true);
        this.controlLayer = this.node("SnakeWorld.Controls", root, true);
        this.safeBottom = this.readSafeBottom();
        this.buildHud();
        this.buildControls();
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        game.on(Game.EVENT_HIDE, this.cancelInput, this);
        // ⚠ 必须接管：loadAssets 内任何抛出都会让 this.assets 永不赋值、整局退化成默认视觉。
        // 曾经是裸 `void`，真引擎里的 pivot TypeError 就只表现为一条无来源的 PromiseRejectionEvent。
        void this.loadAssets().catch((error: unknown) => {
            console.error("[snake] 资源装载失败，本局将以默认视觉降级运行", error);
        });
    }

    render(frame: SnakeRenderFrame, hud: SnakeHudModel, relive: SnakeReliveViewModel | null): void {
        if (!this.mounted || this.resultLayer || this.battleBlocked) return;
        this.selfId = hud.entries.find((entry) => entry.isSelf)?.id
            ?? frame.runs.find((run) => !run.id.startsWith("ai-"))?.id
            ?? this.selfId;
        this.observeCollectMagnet(frame);
        this.renderWorld(frame, hud);
        this.renderHud(hud);
        this.renderRelive(relive);
        if (!hud.selfAlive) this.cancelInput();
    }

    showReliveNotice(message: ISnakeReliveOffered | ISnakeReliveDecisionResult | ISnakeReliveResolved): void {
        if (!this.mounted) return;
        this.cancelInput();
        if ("outcome" in message && this.statusLabel) {
            this.statusLabel.string = message.outcome === "insufficientCoins"
                ? `金币不足${message.balanceAfter === undefined ? "" : `，当前余额 ${message.balanceAfter}`}`
                : "提交失败，可重试";
        } else if ("result" in message && this.statusLabel) {
            this.statusLabel.string = message.result === "revived" ? "复活成功" : `复活：${message.result}`;
        }
    }

    showRunFinalizing(_message: ISnakeRunFinalizing): void {
        this.cancelInput();
        if (this.statusLabel) this.statusLabel.string = "正在结束本次游玩…";
    }

    showRunResult(model: SnakePersonalResultModel): void {
        if (!this.mounted || this.resultLayer || !this.root) return;
        this.cancelInput();
        this.reliveLayer?.destroy();
        this.reliveLayer = null;
        const layer = this.node("SnakeWorld.RunResult", this.root, true);
        this.resultLayer = layer;
        // ⚠ 结算期必须收起战斗 HUD 与操作区（S5-05 F5b）。⛔ 不能指望结算底板遮住它们：
        // 排行榜在 x=240、摇杆在 y=-592、加速键在 (245,-402)，全都落在 674×694 的底板之外，
        // 而且它们的 TOUCH_END 监听仍然活着——「结束本次」因此还能在结算页上再弹一次确认框（F8）。
        if (this.hudLayer) this.hudLayer.active = false;
        if (this.controlLayer) this.controlLayer.active = false;
        this.newBackdrop(layer);
        if (this.assets?.resultBg) this.newSprite(layer, this.assets.resultBg, 0, 0);
        // ⚠ 全部相对**底板半高**排布，⛔ 不要再按视口高度取比例（S5-05 F5a）：
        // 底板是固定 674×694 的贴图且不缩放（上下界 ±347），而 FIXED_WIDTH 下视口高度随机型变化。
        // 原来的 0.24 / 0.22 在 1624 高时把标题推到 +389.8、把「返回主页」推到 −357.3，双双出界；
        // 只有在 ~1400 以下的矮视口才碰巧落在板内，所以 Node 桩与 typecheck 永远看不见。
        // ⚠ lines 最多 7 行（SnakeHud.ts：2 基础 + 复活 + 金币 + 经验 + 碎片 + 解锁），
        // 下面的步长按 7 行仍留在板内选取，⛔ 别再调大。
        const panelHalf = (this.assets?.resultBg?.rect.height ?? RESULT_PANEL_HEIGHT) / 2;
        this.newLabel(layer, "本次游玩结束", 0, panelHalf * 0.73, 42, TEXT);
        this.newLabel(layer, `原因：${model.endReason}`, 0, panelHalf * 0.55, 26, DIM);
        // 逐行画 Logic 已翻译好的展示行；⛔ View 不自己算奖励（铁律 9）。
        model.lines.forEach((line, index) => {
            this.newLabel(layer, line, 0, panelHalf * (0.32 - index * 0.155), 24,
                index === 0 ? TEXT : DIM);
        });
        // ⚠ 按 README §9.6 的 C-a 默认：只放「返回主页」，⛔ 不做「再来一局」——
        // 玩法内没有起新局的能力面，那要动受保护的 app 层。
        // 衣柜并入 snake 后它的唯一入口在这一行（设置面板不再有「衣柜」菜单项）：两颗按钮同排，
        // ⚠ 底板半宽 337，±120 的中心配 34 号字（4 字 ≈ 136 宽）左右各留 ~50 余量，⛔ 别再拉大间距。
        const exit = this.newLabel(layer, "返回主页", -120, -panelHalf * 0.78, 34, TEXT).node;
        exit.on(Node.EventType.TOUCH_END, () => this.requestExit(), this);
        const wardrobe = this.newLabel(layer, "我的衣柜", 120, -panelHalf * 0.78, 34, LINK).node;
        wardrobe.on(Node.EventType.TOUCH_END, () => this.openWardrobe(), this);
    }

    showEndRunConfirmation(visible: boolean): void {
        this.cancelInput();
        if (!visible) {
            this.confirmLayer?.destroy();
            this.confirmLayer = null;
            return;
        }
        // ⛔ run 已经结束、结算页在显示时不得再开确认框：两层都挂在 root 下、后加的画在上面，
        // 会与结算页文字互相压字（S5-05 F8）。这里是兜底闸——HUD 里那颗按钮也已单独加了判据。
        if (this.confirmLayer || this.resultLayer || !this.root) return;
        const layer = this.node("SnakeWorld.EndRunConfirm", this.root, true);
        this.confirmLayer = layer;
        this.newBackdrop(layer, { halfWidth: 250, halfHeight: 110, centerY: 25 });
        this.newLabel(layer, "确定结束本次游玩吗？", 0, 80, 32, TEXT);
        const cancel = this.newLabel(layer, "继续战斗", -110, -30, 28, TEXT).node;
        const confirm = this.newLabel(layer, "结束本次", 110, -30, 28, new Color(255, 120, 135)).node;
        cancel.on(Node.EventType.TOUCH_END, () => this.dispatchInput({ type: "cancel-end-run" }), this);
        confirm.on(Node.EventType.TOUCH_END, () => this.dispatchInput({ type: "confirm-end-run" }), this);
    }

    setHandedness(value: SnakeHandedness): void {
        this.handedness = value;
        this.router?.setLayout(value, this.safeBottom);
        this.applyControlLayout();
        this.applyControlSprites();
    }

    cancelInput(): void {
        this.router?.cancelAll();
        if (this.boosting) this.setBoost(false);
    }

    setReconnecting(reconnecting: boolean): void {
        if (!this.mounted) return;
        this.cancelInput();
        if (!reconnecting) {
            this.reconnectLayer?.destroy();
            this.reconnectLayer = null;
        } else if (!this.reconnectLayer && this.root) {
            this.reconnectLayer = this.node("SnakeWorld.Reconnect", this.root, true);
            this.newLabel(this.reconnectLayer, "正在重连…", 0, 0, 36, TEXT);
        }
    }

    unmount(): void {
        if (!this.mounted && !this.root) return;
        this.mounted = false;
        this.cancelInput();
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        game.off(Game.EVENT_HIDE, this.cancelInput, this);
        this.meshRenderer?.dispose();
        this.meshRenderer = null;
        this.foodRenderer?.dispose();
        this.foodRenderer = null;
        this.magnetAuraRenderer?.dispose();
        this.magnetAuraRenderer = null;
        this.headSprites.clear();
        this.tailSprites.clear();
        this.nameLabels.clear();
        this.boostSprites.clear();
        this.protectionSprites.clear();
        this.toolSprites.clear();
        this.rankLabels.length = 0;
        this.slotNodes.clear();
        this.root?.destroy();
        this.root = null;
        this.worldLayer = null;
        this.fxGraphics = null;
        this.hudLayer = null;
        this.controlLayer = null;
        this.router = null;
        this.assets = null;
        this.skinFrameCache.clear();
        this.visibleSnakeIds.clear();
        this.audioSource = null;
        this.observedMagnetRunId = null;
        this.observedMagnetCount = 0;
        this.resourceFailureLayer = null;
        this.magnetStatusSprite = null;
        this.magnetFallbackSprite = null;
        this.magnetAuraFailed = false;
        this.battleBlocked = false;
    }

    private async loadAssets(): Promise<void> {
        const load = (path: string): Promise<Texture2D | null> => new Promise((resolve) => {
            resources.load(`${path}/texture`, Texture2D, (error, asset) => {
                if (error) {
                    console.warn(`[snake] texture missing ${path}`, error);
                    resolve(null);
                } else resolve(asset);
            });
        });
        const loadJson = (path: string): Promise<JsonAsset | null> => new Promise((resolve) => {
            resources.load(path, JsonAsset, (error, asset) => {
                if (error) {
                    console.warn(`[snake] recipe missing ${path}`, error);
                    resolve(null);
                } else resolve(asset);
            });
        });
        const loadAudio = (path: string): Promise<AudioClip | null> => new Promise((resolve) => {
            resources.load(path, AudioClip, (error, asset) => {
                if (error) {
                    console.warn(`[snake] optional audio missing ${path}`, error);
                    resolve(null);
                } else resolve(asset);
            });
        });
        const collectMagnetAudio = SNAKE_ENTITY_PRESENTATION_CATALOG.audio.find((entry) => entry.event === "collect-magnet");
        const boostEffect = SNAKE_ENTITY_PRESENTATION_CATALOG.effects.find((entry) => entry.event === "boost");
        const protectionEffect = SNAKE_ENTITY_PRESENTATION_CATALOG.effects.find((entry) => entry.event === "protection");
        const skinPairs = await Promise.all(CLIENT_SNAKE_PRESENTATION_CATALOG.map(async (entry) =>
            [entry, await load(entry.textureAsset)] as const));
        const [foodTexture, joystickBase, joystickKnob, boost, magnet, magnetAura, resultBg, button,
            collectMagnetClip, boostEffectTexture, protectionEffectTexture] = await Promise.all([
            load(SNAKE_ENTITY_PRESENTATION_CATALOG.food.textureAsset),
            load("plugins/snake/snake_control_joystick_base"),
            load("plugins/snake/snake_control_joystick_knob"),
            load("plugins/snake/snake_control_boost"),
            load("plugins/snake/snake_magnet_tools"),
            loadJson(SNAKE_ENTITY_PRESENTATION_CATALOG.tools.magnet.activeEffect.recipeAsset),
            load("plugins/snake/snake_result_bg"),
            load("plugins/snake/snake_btn_blue"),
            collectMagnetAudio?.policy === "resource" && collectMagnetAudio.asset
                ? loadAudio(collectMagnetAudio.asset)
                : Promise.resolve(null),
            boostEffect?.policy === "resource" && boostEffect.textureAsset
                ? load(boostEffect.textureAsset)
                : Promise.resolve(null),
            protectionEffect?.policy === "resource" && protectionEffect.textureAsset
                ? load(protectionEffect.textureAsset)
                : Promise.resolve(null),
        ]);
        const auraRecipe = magnetAura?.json ?? null;
        const auraDependencies = snakeMagnetAuraDependencies(auraRecipe);
        const auraTexturePairs = auraDependencies
            ? await Promise.all(auraDependencies.map(async (dependency) =>
                [dependency, await load(dependency.textureAsset)] as const))
            : [];
        if (!this.mounted) return;
        const skinTextures = new Map<number, Texture2D>();
        for (const [entry, texture] of skinPairs) {
            if (!texture) continue;
            skinTextures.set(entry.skinId, texture);
        }
        const magnetAuraFrames = new Map<string, SpriteFrame>();
        for (const [dependency, texture] of auraTexturePairs) {
            if (texture) magnetAuraFrames.set(dependency.logicalName,
                this.definedFrame(`aura:${dependency.logicalName}`, texture, dependency.frame));
        }
        const auraReady = auraDependencies !== null && magnetAuraFrames.size === auraDependencies.length;
        const magnetPresentation = resolveMagnetRuntimePresentation((kind) =>
            kind === "world-texture" ? (magnet ? "available" : "missing") : (auraReady ? "available" : "missing"));
        if (!magnetPresentation.battleReady || !magnetPresentation.world) {
            this.blockForRequiredResource(magnetPresentation.diagnostic);
            return;
        }
        this.assets = {
            skinTextures,
            foodTexture,
            joystickBase: joystickBase ? this.frame(joystickBase) : null,
            joystickKnob: joystickKnob ? this.frame(joystickKnob) : null,
            boost: boost ? this.frame(boost) : null,
            magnet: magnet ? this.frame(magnet, magnetPresentation.world.frame.rect) : null,
            magnetActiveMode: magnetPresentation.activeVisual?.mode ?? "status-icon-fallback",
            magnetAuraRecipe: auraReady ? auraRecipe : null,
            magnetAuraFrames,
            resultBg: resultBg ? this.frame(resultBg) : null,
            button: button ? this.frame(button) : null,
            collectMagnetClip,
            collectMagnetVolume: collectMagnetAudio?.volume ?? 1,
            boostEffect: boostEffectTexture && boostEffect?.frame
                ? this.definedFrame("effect:boost", boostEffectTexture, boostEffect.frame)
                : null,
            protectionEffect: protectionEffectTexture && protectionEffect?.frame
                ? this.definedFrame("effect:protection", protectionEffectTexture, protectionEffect.frame)
                : null,
        };
        if (collectMagnetClip && this.root) this.audioSource = this.root.addComponent(AudioSource);
        this.applyControlSprites();
    }

    private renderWorld(frame: SnakeRenderFrame, hud: SnakeHudModel): void {
        const graphics = this.fxGraphics;
        const worldLayer = this.worldLayer;
        if (!graphics || !worldLayer) return;
        const self = frame.snakes.find((snake) => snake.id === this.selfId) ?? frame.snakes[0];
        if (self?.points[0]) {
            const scale = snakeCameraScale(self.length);
            worldLayer.setScale(scale, scale, 1);
            worldLayer.setPosition(-self.points[0].x * scale, -self.points[0].y * scale, 0);
        }
        if (!this.meshRenderer && this.assets?.skinTextures.size) {
            this.meshRenderer = new SnakeMeshRenderer(worldLayer, this.uiLayer, this.assets.skinTextures);
        }
        if (!this.foodRenderer && this.assets?.foodTexture) {
            this.foodRenderer = new SnakeFoodMeshRenderer(worldLayer, this.uiLayer, this.assets.foodTexture);
        }
        const nextVisibleSnakeIds = new Set(frame.snakes
            .filter((snake) => snake.alive && snake.points.length > 0)
            .map((snake) => snake.id));
        for (const id of this.visibleSnakeIds) {
            if (nextVisibleSnakeIds.has(id)) continue;
            this.meshRenderer?.removeSnake(id);
            this.headSprites.get(id)?.node.destroy();
            this.headSprites.delete(id);
            this.tailSprites.get(id)?.node.destroy();
            this.tailSprites.delete(id);
            this.nameLabels.get(id)?.node.destroy();
            this.nameLabels.delete(id);
            this.boostSprites.get(id)?.node.destroy();
            this.boostSprites.delete(id);
            this.protectionSprites.get(id)?.node.destroy();
            this.protectionSprites.delete(id);
        }
        this.visibleSnakeIds = nextVisibleSnakeIds;
        graphics.clear();
        if (this.foodRenderer?.render(frame.foods) !== true) {
            graphics.fillColor = DOT;
            for (const food of frame.foods) if (food.kind === 0) graphics.circle(food.x, food.y, SNAKE_RULESET.dotRadius);
            graphics.fill();
            graphics.fillColor = STAR;
            for (const food of frame.foods) if (food.kind === 1) graphics.circle(food.x, food.y, SNAKE_RULESET.starRadius);
            graphics.fill();
        }
        graphics.fillColor = WRECK;
        for (const wreck of frame.wrecks) graphics.circle(wreck.x, wreck.y, SNAKE_RULESET.wreckRadius);
        graphics.fill();
        this.renderTools(frame);
        for (const snake of frame.snakes) this.renderSnake(graphics, snake, frame.tick);
        if (hud.magnetRemainingTicks > 0 && self?.points[0]) {
            let auraShown = false;
            if (this.assets?.magnetActiveMode === "aura" && this.assets.magnetAuraRecipe && !this.magnetAuraFailed) {
                try {
                    this.magnetAuraRenderer ??= new SnakeMagnetAuraRenderer(
                        worldLayer,
                        this.uiLayer,
                        this.assets.magnetAuraRecipe,
                        this.assets.magnetAuraFrames,
                    );
                    this.magnetAuraRenderer.render(self.points[0].x, self.points[0].y, self.bodyScale, frame.tick);
                    auraShown = true;
                } catch (error) {
                    console.warn("[snake] magnet-active recipe failed; using status-icon fallback", error);
                    this.magnetAuraRenderer?.dispose();
                    this.magnetAuraRenderer = null;
                    this.magnetAuraFailed = true;
                }
            }
            if (auraShown) {
                this.magnetFallbackSprite?.node.destroy();
                this.magnetFallbackSprite = null;
            } else if (this.assets?.magnet && worldLayer) {
                this.magnetFallbackSprite ??= this.newSprite(worldLayer, this.assets.magnet, 0, 0);
                this.magnetFallbackSprite.node.setPosition(
                    self.points[0].x,
                    self.points[0].y + 58 * self.bodyScale,
                    0,
                );
                this.magnetFallbackSprite.node.setScale(0.42, 0.42, 1);
            }
        } else {
            this.magnetAuraRenderer?.hide();
            this.magnetFallbackSprite?.node.destroy();
            this.magnetFallbackSprite = null;
        }
    }

    /**
     * 沿身体点画一条**圆头圆角的粗折线**，等价于「在每个身体点画一个半径 radius 的圆」的并集
     * （点距 pointSpacing=8 ≪ 2*radius，圆本来就彼此重叠）。
     *
     * ⛔ **不要再退回「按点画圆」**：单个 r=20 / lineWidth=3 的描边圆实测 122 个顶点，241 个就是
     * 29402 顶点 —— 真机崩溃 `RangeError: Invalid typed array length: 235216`（29402×8 floats，
     * `Graphics._uploadData` 用 `vertexStart * componentPerVertex` 建 Float32Array 视图）正是它。
     * 根因在引擎侧：cc.Graphics 3.8.8 的 RenderData 到某个量级后会停止扩容（崩溃那一帧实测
     * vData 容量卡在 1152 顶点，而 vertexStart 已到 29402）。换算成玩法：身体点 242 个就必崩，
     * 而 `snapshotMaxPointsPerSnake` 是 5186。
     *
     * ⚠ `lineJoin` 必须是 BEVEL，这是量出来的（3.8.8 预览真引擎，`snapshotMaxPointsPerSnake` 上限）：
     * | join | 每点顶点 | 5186 点 | 结果 |
     * | ROUND | ~24 | 124460 | ✖ 同样崩（圆角在每个折点铺一把扇形） |
     * | BEVEL | ~4 | 20780 | ✔ |
     * | MITER | ~2 | 10412 | ✔ 但急转弯会甩尖刺（miterLimit 10 ⇒ 最长 10 倍半宽） |
     * 选 BEVEL：不甩刺，且离失效区还有 3 倍余量。⛔ 别为了省顶点换回 MITER，也别为了圆润换 ROUND。
     */
    private strokeBodyCapsule(graphics: Graphics, snake: SnakeRenderSnake, radius: number): void {
        const points = snake.points;
        if (points.length === 0) return;
        graphics.lineWidth = radius * 2;
        graphics.lineJoin = Graphics.LineJoin.BEVEL;
        graphics.lineCap = Graphics.LineCap.ROUND;
        graphics.moveTo(points[0].x, points[0].y);
        // 单点蛇（刚出生/极短）没有线段，圆头 lineCap 需要一段零长度的线才会画出圆点。
        if (points.length === 1) graphics.lineTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length; index += 1) {
            graphics.lineTo(points[index].x, points[index].y);
        }
        graphics.stroke();
    }

    private renderTools(frame: SnakeRenderFrame): void {
        const active = new Set(frame.tools.map((tool) => tool.id));
        for (const [id, sprite] of this.toolSprites) {
            if (!active.has(id)) {
                sprite.node.destroy();
                this.toolSprites.delete(id);
            }
        }
        if (!this.assets?.magnet || !this.worldLayer) return;
        for (const tool of frame.tools) {
            let sprite = this.toolSprites.get(tool.id);
            if (!sprite) {
                sprite = this.newSprite(this.worldLayer, this.assets.magnet, tool.x, tool.y);
                this.toolSprites.set(tool.id, sprite);
            }
            sprite.node.setPosition(tool.x, tool.y, 0);
            const frameWidth = Math.max(1, this.assets.magnet.rect.width);
            const displaySize = SNAKE_ENTITY_PRESENTATION_CATALOG.tools.magnet.world.displaySize;
            sprite.node.setScale(displaySize / frameWidth, displaySize / frameWidth, 1);
        }
    }

    private renderSnake(graphics: Graphics, snake: SnakeRenderSnake, tick: number): void {
        if (!snake.alive || snake.points.length === 0) {
            this.meshRenderer?.removeSnake(snake.id);
            this.headSprites.get(snake.id)?.node.destroy();
            this.headSprites.delete(snake.id);
            this.tailSprites.get(snake.id)?.node.destroy();
            this.tailSprites.delete(snake.id);
            this.nameLabels.get(snake.id)?.node.destroy();
            this.nameLabels.delete(snake.id);
            this.boostSprites.get(snake.id)?.node.destroy();
            this.boostSprites.delete(snake.id);
            this.protectionSprites.get(snake.id)?.node.destroy();
            this.protectionSprites.delete(snake.id);
            return;
        }
        const resolution = resolveClientSnakeSkinPresentation(snake.skinId, (entry) => this.skinAvailability(entry));
        const presentation = resolution.presentation;
        // ⚠ 贴图还没加载完时（loadAssets 结束才置 this.assets）**每个**皮肤都探成 missing，
        // 于是开局刷一串 `default-unavailable` 假警报——它们把真问题淹了。资源就绪后再判：
        // 那时若仍回退，才是真的缺资源/坏帧，照常点名。
        if (this.assets && resolution.usedFallback && !this.warnedSkinIds.has(snake.skinId)) {
            this.warnedSkinIds.add(snake.skinId);
            console.warn(`[snake] skinId ${snake.skinId} fallback: ${resolution.diagnostic}`);
        }
        const bodyScale = snake.bodyScale * (presentation?.visualScale ?? 1);
        if (this.meshRenderer?.renderSnake(
            snake.id,
            presentation?.skinId ?? 1,
            snake.points,
            snake.bodyScale,
            tick,
            snake.boost,
        ) !== true) {
            graphics.strokeColor = WHITE;
            this.strokeBodyCapsule(graphics, snake, 18 * bodyScale);
        }
        if (snake.id === this.selfId) {
            // 自机细白轮廓（README §5.5 `identity.self.outline = "fine-white"`）：半径比身体大 2，
            // 画在 mesh 身体**之下**，露出来的就是那圈 2*bodyScale 的边。
            graphics.strokeColor = SELF;
            this.strokeBodyCapsule(graphics, snake, 20 * bodyScale);
        }
        const head = snake.points[0];
        const motion = presentation ? (snake.boost ? presentation.boost : presentation.normal) : null;
        const texture = presentation ? this.assets?.skinTextures.get(presentation.skinId) : undefined;
        const headFrame = presentation && motion && texture
            ? this.skinFrame(presentation.skinId, texture, snakeTimedFrame(motion.head, tick))
            : undefined;
        if (headFrame && this.worldLayer) {
            let sprite = this.headSprites.get(snake.id);
            if (!sprite) {
                sprite = this.newSprite(this.worldLayer, headFrame, head.x, head.y, `snake-head-${snake.id}`);
                this.headSprites.set(snake.id, sprite);
            }
            sprite.spriteFrame = headFrame;
            sprite.node.setPosition(head.x, head.y, 0);
            sprite.node.setScale(bodyScale, bodyScale, 1);
            sprite.node.angle = -snakeDirectionOf(snake);
        } else {
            graphics.fillColor = WHITE;
            graphics.circle(head.x, head.y, 22 * bodyScale);
            graphics.fill();
        }
        this.renderSnakeEffects(snake, head.x, head.y, bodyScale, tick);
        const tailTrack = motion?.tail;
        const tail = snake.points[snake.points.length - 1];
        if (tailTrack && texture && tail && this.worldLayer) {
            const tailFrame = this.skinFrame(presentation?.skinId ?? 1, texture, snakeTimedFrame(tailTrack, tick));
            let sprite = this.tailSprites.get(snake.id);
            if (!sprite) {
                sprite = this.newSprite(this.worldLayer, tailFrame, tail.x, tail.y, `snake-tail-${snake.id}`);
                this.tailSprites.set(snake.id, sprite);
            }
            sprite.spriteFrame = tailFrame;
            sprite.node.setPosition(tail.x, tail.y, 0);
            sprite.node.setScale(bodyScale, bodyScale, 1);
            sprite.node.angle = -snakeTailDirectionOf(snake);
        } else {
            this.tailSprites.get(snake.id)?.node.destroy();
            this.tailSprites.delete(snake.id);
        }
        if (snake.id !== this.selfId && this.worldLayer) {
            let label = this.nameLabels.get(snake.id);
            if (!label) {
                label = this.newLabel(this.worldLayer, snake.name, head.x, head.y + 48, 20, TEXT);
                this.nameLabels.set(snake.id, label);
            }
            label.string = snake.name;
            label.node.setPosition(head.x, head.y + 48 * bodyScale, 0);
        }
    }

    private renderSnakeEffects(snake: SnakeRenderSnake, x: number, y: number, bodyScale: number, tick: number): void {
        if (!this.worldLayer || !this.assets) return;
        if (snake.boost && this.assets.boostEffect) {
            let sprite = this.boostSprites.get(snake.id);
            if (!sprite) {
                sprite = this.newSprite(this.worldLayer, this.assets.boostEffect, x, y, `snake-boost-${snake.id}`);
                this.boostSprites.set(snake.id, sprite);
            }
            sprite.node.setPosition(x, y, 0);
            sprite.node.setScale(bodyScale, bodyScale, 1);
            sprite.node.angle = -snakeDirectionOf(snake) - 90;
        } else {
            this.boostSprites.get(snake.id)?.node.destroy();
            this.boostSprites.delete(snake.id);
        }
        const protectedNow = snake.protectUntilTick !== null && tick < snake.protectUntilTick;
        if (protectedNow && this.assets.protectionEffect) {
            let sprite = this.protectionSprites.get(snake.id);
            if (!sprite) {
                sprite = this.newSprite(this.worldLayer, this.assets.protectionEffect, x, y, `snake-protection-${snake.id}`);
                this.protectionSprites.set(snake.id, sprite);
            }
            const diameter = SNAKE_RULESET.bodyWidth * 3 * bodyScale;
            const sourceWidth = Math.max(1, this.assets.protectionEffect.rect.width);
            sprite.node.setPosition(x, y, 0);
            sprite.node.setScale(diameter / sourceWidth, diameter / sourceWidth, 1);
        } else {
            this.protectionSprites.get(snake.id)?.node.destroy();
            this.protectionSprites.delete(snake.id);
        }
    }

    private paintBackground(graphics: Graphics): void {
        const halfW = SNAKE_RULESET.worldWidth / 2;
        const halfH = SNAKE_RULESET.worldHeight / 2;
        const palette = SNAKE_ENTITY_PRESENTATION_CATALOG.grid.palette[BACKGROUND_THEME];
        graphics.fillColor = colorOf(palette.outside);
        graphics.rect(-halfW * 3, -halfH * 3, halfW * 6, halfH * 6);
        graphics.fill();
        graphics.fillColor = colorOf(palette.map);
        graphics.rect(-halfW, -halfH, halfW * 2, halfH * 2);
        graphics.fill();
        graphics.lineWidth = palette.gridLineWidth;
        graphics.strokeColor = colorOf(palette.grid);
        for (let x = -halfW; x <= halfW; x += SNAKE_ENTITY_PRESENTATION_CATALOG.grid.spacing) {
            graphics.moveTo(x, -halfH); graphics.lineTo(x, halfH);
        }
        for (let y = -halfH; y <= halfH; y += SNAKE_ENTITY_PRESENTATION_CATALOG.grid.spacing) {
            graphics.moveTo(-halfW, y); graphics.lineTo(halfW, y);
        }
        graphics.stroke();
        if (palette.border) {
            graphics.lineWidth = palette.borderWidth;
            graphics.strokeColor = colorOf(palette.border);
            graphics.rect(-halfW, -halfH, halfW * 2, halfH * 2);
            graphics.stroke();
        }
    }

    private buildHud(): void {
        if (!this.hudLayer) return;
        const size = view.getVisibleSize();
        const safeTop = this.readSafeTop();
        this.countdownLabel = this.newLabel(this.hudLayer, "", 0, size.height / 2 - safeTop - 100, 40, TEXT);
        this.statusLabel = this.newLabel(this.hudLayer, "", 0, size.height / 2 - safeTop - 145, 24, DIM);
        for (let index = 0; index < 10; index += 1) {
            const label = this.newLabel(this.hudLayer, "", size.width / 2 - 135,
                size.height / 2 - safeTop - 80 - index * 30, 21, DIM);
            label.horizontalAlign = 2;
            this.rankLabels.push(label);
        }
        const setting = this.newLabel(this.hudLayer, "左右手", -size.width / 2 + 65, size.height / 2 - safeTop - 55, 22, TEXT).node;
        setting.on(Node.EventType.TOUCH_END, () => {
            this.cancelInput();
            this.dispatchInput({ type: "set-handedness", value: this.handedness === "right" ? "left" : "right" });
        }, this);
        const exit = this.newLabel(this.hudLayer, "结束本次", -size.width / 2 + 78, size.height / 2 - safeTop - 95, 22, TEXT).node;
        exit.on(Node.EventType.TOUCH_END, () => {
            // ⛔ 结算页已在显示时不再请求结束：否则确认框会叠在结算页上互相压字（S5-05 F8）。
            // ⚠ showRunResult 已经把整个 hudLayer 关掉了，这条是防将来有人改动可见性时回归。
            if (this.resultLayer) return;
            this.cancelInput();
            this.dispatchInput({ type: "request-end-run" });
        }, this);
    }

    private renderHud(hud: SnakeHudModel): void {
        if (this.countdownLabel) this.countdownLabel.string = hud.inStartCountdown ? `准备 ${hud.countdownSeconds}` : "";
        hud.entries.slice(0, 10).forEach((entry, index) => {
            const label = this.rankLabels[index];
            if (!label) return;
            label.string = `${entry.rank}. ${entry.name} ${entry.score}`;
            label.color = entry.isSelf ? WHITE : DIM;
        });
        for (let index = hud.entries.length; index < this.rankLabels.length; index += 1) this.rankLabels[index].string = "";
        if (this.statusLabel) {
            const parts: string[] = [];
            if (hud.magnetRemainingTicks > 0) parts.push(`磁铁 ${Math.ceil(hud.magnetRemainingTicks / 20)}s`);
            if (hud.protectionRemainingTicks > 0) parts.push(`保护 ${Math.ceil(hud.protectionRemainingTicks / 20)}s`);
            this.statusLabel.string = parts.join(" · ");
        }
        if (hud.magnetRemainingTicks > 0 && this.assets?.magnet && this.hudLayer) {
            this.magnetStatusSprite ??= this.newSprite(this.hudLayer, this.assets.magnet, 0, 0);
            const size = view.getVisibleSize();
            this.magnetStatusSprite.node.setPosition(0, size.height / 2 - this.readSafeTop() - 185, 0);
            this.magnetStatusSprite.node.setScale(0.34, 0.34, 1);
            this.magnetStatusSprite.node.active = true;
        } else if (this.magnetStatusSprite) {
            this.magnetStatusSprite.node.active = false;
        }
    }

    private blockForRequiredResource(diagnostic: string): void {
        if (!this.mounted || !this.root || this.resourceFailureLayer) return;
        this.battleBlocked = true;
        this.cancelInput();
        if (this.worldLayer) this.worldLayer.active = false;
        if (this.controlLayer) this.controlLayer.active = false;
        const layer = this.node("SnakeWorld.RequiredResourceFailure", this.root, true);
        this.resourceFailureLayer = layer;
        this.newLabel(layer, "战斗资源不完整", 0, 45, 34, TEXT);
        this.newLabel(layer, `磁铁资源校验失败：${diagnostic}`, 0, 0, 20, DIM);
        const exit = this.newLabel(layer, "返回主页", 0, -70, 28, TEXT).node;
        exit.on(Node.EventType.TOUCH_END, () => this.requestExit(), this);
    }

    private renderRelive(model: SnakeReliveViewModel | null): void {
        if (!model) {
            this.reliveLayer?.destroy();
            this.reliveLayer = null;
            this.reliveLabel = null;
            return;
        }
        this.cancelInput();
        if (!this.reliveLayer && this.root) {
            const layer = this.node("SnakeWorld.Relive", this.root, true);
            this.reliveLayer = layer;
            this.newBackdrop(layer, { halfWidth: 290, halfHeight: 130, centerY: 20 });
            this.reliveLabel = this.newLabel(layer, "", 0, 70, 28, TEXT);
            const decline = this.newLabel(layer, "放弃", -110, -55, 28, DIM).node;
            const accept = this.newLabel(layer, "金币复活", 110, -55, 28, TEXT).node;
            decline.on(Node.EventType.TOUCH_END, () => this.dispatchInput({ type: "relive", decision: "decline" }), this);
            accept.on(Node.EventType.TOUCH_END, () => this.dispatchInput({ type: "relive", decision: "accept" }), this);
        }
        if (this.reliveLabel) {
            const deathCause = model.deathCause === "wall" ? "撞到边界"
                : model.deathCause === "collision" ? "碰撞"
                    : model.deathCause === "forced" ? "本次已结束" : "未知原因";
            this.reliveLabel.string = model.processing
                ? "金币复活处理中…"
                : `${deathCause} · 分数 ${model.score} · 长度 ${model.length}\n第 ${model.reliveIndex} 次，金币 ${model.coinCost} · 余额 ${model.coinBalance}\n${model.decisionSeconds}s`;
        }
    }

    private buildControls(): void {
        if (!this.controlLayer) return;
        this.joystickBase = this.node("SnakeWorld.JoystickBase", this.controlLayer, true);
        this.joystickKnob = this.node("SnakeWorld.JoystickKnob", this.joystickBase, true);
        for (const id of ["s1", "s2", "s3", "s4"] as const) {
            this.slotNodes.set(id, this.node(`SnakeWorld.${id.toUpperCase()}`, this.controlLayer, true));
        }
        this.router = new SnakePointerRouter(this.handedness, this.safeBottom, {
            steer: (x, y, knobX, knobY) => {
                this.joystickKnob?.setPosition(knobX, knobY, 0);
                this.dispatchInput({ type: "steer", dirX: x, dirY: y, boost: this.boosting });
            },
            centerJoystick: () => this.joystickKnob?.setPosition(0, 0, 0),
            setBoost: (active) => this.setBoost(active),
            activate: () => {},
        });
        this.applyControlLayout();
    }

    private applyControlLayout(): void {
        const size = view.getVisibleSize();
        for (const control of snakeControlLayout(this.handedness, this.safeBottom)) {
            const node = control.id === "joystick" ? this.joystickBase : this.slotNodes.get(control.id);
            if (!node) continue;
            node.setPosition(control.x - size.width / 2, control.y - size.height / 2, 0);
            node.active = control.visible;
        }
    }

    private applyControlSprites(): void {
        if (!this.assets) return;
        const apply = (node: Node | null | undefined, frame: SpriteFrame | null, diameter: number): void => {
            if (!node || !frame) return;
            let sprite = node.getComponent(Sprite);
            if (!sprite) sprite = node.addComponent(Sprite);
            sprite.spriteFrame = frame;
            const width = Math.max(1, frame.rect.width);
            node.setScale(diameter / width, diameter / width, 1);
        };
        apply(this.joystickBase, this.assets.joystickBase, 220);
        apply(this.joystickKnob, this.assets.joystickKnob, 92);
        for (const control of snakeControlLayout(this.handedness, this.safeBottom)) {
            if (control.action === "boost") apply(this.slotNodes.get(control.id), this.assets.boost, control.visibleDiameter);
        }
    }

    private onTouchStart(event: EventTouch): void {
        if (!this.mounted || this.reliveLayer || this.confirmLayer || this.resultLayer || this.reconnectLayer) return;
        const point = event.getUILocation();
        this.router?.start(event.getID(), point.x, point.y);
    }

    private onTouchMove(event: EventTouch): void {
        const point = event.getUILocation();
        this.router?.move(event.getID(), point.x, point.y);
    }

    private onTouchEnd(event: EventTouch): void {
        const point = event.getUILocation();
        this.router?.end(event.getID(), point.x, point.y);
    }

    private onTouchCancel(event: EventTouch): void { this.router?.cancel(event.getID()); }

    private setBoost(active: boolean): void {
        if (this.boosting === active) return;
        this.boosting = active;
        this.dispatchInput(active
            ? { type: "steer", dirX: 0, dirY: 0, boost: true }
            : { type: "release-boost" });
    }

    private readSafeBottom(): number {
        const safe = (view as unknown as { getSafeAreaRect?: () => { y: number } }).getSafeAreaRect?.();
        return Math.max(0, safe?.y ?? 0);
    }

    private readSafeTop(): number {
        const size = view.getVisibleSize();
        const safe = (view as unknown as { getSafeAreaRect?: () => { y: number; height: number } }).getSafeAreaRect?.();
        return safe ? Math.max(0, size.height - safe.y - safe.height) : 0;
    }

    private frame(texture: Texture2D, rect?: { x: number; y: number; width: number; height: number }): SpriteFrame {
        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.rect = rect ? new Rect(rect.x, rect.y, rect.width, rect.height) : new Rect(0, 0, texture.width, texture.height);
        return frame;
    }

    private skinFrame(skinId: number, texture: Texture2D, definition: FrameDefinition): SpriteFrame {
        return this.definedFrame(`skin:${skinId}`, texture, definition);
    }

    private skinAvailability(presentation: ClientSkinPresentation): "available" | "missing" | "invalid" {
        const texture = this.assets?.skinTextures.get(presentation.skinId);
        if (!texture) return "missing";
        try {
            for (const motion of [presentation.normal, presentation.boost]) {
                for (const track of [motion.head, ...motion.body, ...(motion.tail ? [motion.tail] : [])]) {
                    for (const frame of track.frames) validateFrameDefinition(frame, texture.width, texture.height);
                }
            }
            return "available";
        } catch {
            return "invalid";
        }
    }

    private definedFrame(namespace: string, texture: Texture2D, definition: FrameDefinition): SpriteFrame {
        const key = `${namespace}:${definition.sourceFrameName}:${definition.rect.x}:${definition.rect.y}:${definition.rect.width}:${definition.rect.height}:${definition.rotated}`;
        const existing = this.skinFrameCache.get(key);
        if (existing) return existing;
        const frame = this.frame(texture, definition.rect);
        frame.rotated = definition.rotated;
        // ⛔ 不要写 frame.pivot：Cocos 3.8 的 SpriteFrame.pivot 只有 getter，ES module 是严格模式，
        // 赋值直接抛 TypeError。本函数在 loadAssets() 里建 magnet aura 帧时就会被调用，一抛就让整条
        // 资源装载链 reject、this.assets 永不赋值，结果是 11 个皮肤全报 default-unavailable、蛇渲染成
        // 白色（S5-05 真引擎取证实测；此前两套 cc 桩都没声明 SpriteFrame.pivot，配合 `as unknown as`
        // 强制转换，typecheck 与单测双双漏过）。
        // 引擎按节点 UITransform.anchorPoint 摆放精灵，⛔ 并不消费 SpriteFrame.pivot；且目录里 156 处
        // pivot 全是 (0.5, 0.5)，正好等于默认锚点，故删除赋值是行为等价的。⚠ 该前提由
        // snake-presentation.test.ts 的「目录 pivot 必须居中」用例机检钉住——真出现偏心 pivot 时它转红，
        // 那时才需要把 pivot 转写到消费节点的 anchorPoint 上。
        this.skinFrameCache.set(key, frame);
        return frame;
    }

    private observeCollectMagnet(frame: SnakeRenderFrame): void {
        const run = this.selfId ? frame.runs.find((entry) => entry.id === this.selfId) : undefined;
        if (!run) return;
        if (this.observedMagnetRunId !== run.runId) {
            this.observedMagnetRunId = run.runId;
            this.observedMagnetCount = run.magnetCollected;
            return;
        }
        if (run.magnetCollected > this.observedMagnetCount && this.sfxEnabled()) {
            const clip = this.assets?.collectMagnetClip;
            if (clip && this.audioSource) this.audioSource.playOneShot(clip, this.assets?.collectMagnetVolume ?? 1);
        }
        this.observedMagnetCount = Math.max(this.observedMagnetCount, run.magnetCollected);
    }

    private node(name: string, parent: Node, ui = false): Node {
        const node = new Node(name);
        node.layer = this.uiLayer || parent.layer;
        parent.addChild(node);
        if (ui) node.addComponent(UITransform);
        return node;
    }

    private newLabel(parent: Node, text: string, x: number, y: number, size: number, color: Color): Label {
        const node = this.node(`label-${text.slice(0, 8)}`, parent, true);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.color = color;
        return label;
    }

    /**
     * 给覆盖层铺一层压暗全屏底，可选再叠一块居中面板。
     *
     * ⚠ 复活提示与结束确认此前都是**裸文字直接画在世界之上**（S5-05 F6）：这两层显示期间
     * `render()` 并不早退（只有 `resultLayer` / `battleBlocked` 才早退），世界仍在逐帧渲染并跟随
     * 镜头移动，蛇身从字底下穿过时「金币复活」就完全读不出来。
     * ⛔ 别改成只调文字颜色或加描边——底下是活动的战场、颜色随机，唯一稳的办法是给一层不透明底。
     * ⚠ 必须在建文字**之前**调用：同层内后加的节点画在上面。
     */
    private newBackdrop(
        layer: Node,
        panel?: { readonly halfWidth: number; readonly halfHeight: number; readonly centerY: number },
    ): void {
        const size = view.getVisibleSize();
        const graphics = this.node("backdrop", layer, true).addComponent(Graphics);
        graphics.fillColor = SCRIM;
        graphics.rect(-size.width / 2, -size.height / 2, size.width, size.height);
        graphics.fill();
        if (!panel) return;
        graphics.fillColor = PANEL;
        graphics.rect(-panel.halfWidth, panel.centerY - panel.halfHeight,
            panel.halfWidth * 2, panel.halfHeight * 2);
        graphics.fill();
    }

    private newSprite(parent: Node, frame: SpriteFrame, x: number, y: number, name = "sprite"): Sprite {
        const node = this.node(name, parent, true);
        node.setPosition(x, y, 0);
        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = frame;
        sprite.color = WHITE;
        return sprite;
    }
}

function snakeDirectionOf(snake: SnakeRenderSnake): number {
    if (snake.points.length < 2) return 0;
    const head = snake.points[0];
    const neck = snake.points[1];
    return (Math.atan2(head.y - neck.y, head.x - neck.x) * 180) / Math.PI;
}

function snakeTailDirectionOf(snake: SnakeRenderSnake): number {
    if (snake.points.length < 2) return snakeDirectionOf(snake);
    const tail = snake.points[snake.points.length - 1];
    const before = snake.points[snake.points.length - 2];
    return (Math.atan2(tail.y - before.y, tail.x - before.x) * 180) / Math.PI;
}

function colorOf(value: readonly number[]): Color {
    return new Color(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 255);
}

// 让静态扫描明确看到 key 只在设备本地适配器使用，不进入任何网络 payload。
void SNAKE_HANDEDNESS_STORAGE_KEY;
