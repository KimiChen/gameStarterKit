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
const SELF = new Color(255, 255, 255, 220);
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
        void this.loadAssets();
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
            this.statusLabel.string = message.outcome === "insufficientCoins" ? "测试余额不足" : "测试提交失败，可重试";
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
        const size = view.getVisibleSize();
        if (this.assets?.resultBg) this.newSprite(layer, this.assets.resultBg, 0, 0);
        this.newLabel(layer, "本次游玩结束", 0, size.height * 0.2, 42, TEXT);
        this.newLabel(layer, `原因：${model.endReason}`, 0, size.height * 0.12, 26, DIM);
        this.newLabel(layer, "奖励：本阶段未开放", 0, size.height * 0.06, 24, DIM);
        const exit = this.newLabel(layer, "返回主页", 0, -size.height * 0.18, 34, TEXT).node;
        exit.on(Node.EventType.TOUCH_END, () => this.requestExit(), this);
    }

    showEndRunConfirmation(visible: boolean): void {
        this.cancelInput();
        if (!visible) {
            this.confirmLayer?.destroy();
            this.confirmLayer = null;
            return;
        }
        if (this.confirmLayer || !this.root) return;
        const layer = this.node("SnakeWorld.EndRunConfirm", this.root, true);
        this.confirmLayer = layer;
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
            load("snakeoff/snake_control_joystick_base"),
            load("snakeoff/snake_control_joystick_knob"),
            load("snakeoff/snake_control_boost"),
            load("snakeoff/snake_magnet_tools"),
            loadJson(SNAKE_ENTITY_PRESENTATION_CATALOG.tools.magnet.activeEffect.recipeAsset),
            load("snakeoff/snake_result_bg"),
            load("snakeoff/snake_btn_blue"),
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
        if (resolution.usedFallback && !this.warnedSkinIds.has(snake.skinId)) {
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
            graphics.fillColor = WHITE;
            for (let index = 1; index < snake.points.length; index += 1) {
                graphics.circle(snake.points[index].x, snake.points[index].y, 18 * bodyScale);
            }
            graphics.fill();
        }
        if (snake.id === this.selfId) {
            graphics.lineWidth = 3;
            graphics.strokeColor = SELF;
            for (let index = 1; index < snake.points.length; index += 1) {
                graphics.circle(snake.points[index].x, snake.points[index].y, 20 * bodyScale);
            }
            graphics.stroke();
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
        const palette = SNAKE_ENTITY_PRESENTATION_CATALOG.grid.palette.dark;
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
            this.reliveLabel = this.newLabel(layer, "", 0, 70, 28, TEXT);
            const decline = this.newLabel(layer, "放弃", -110, -55, 28, DIM).node;
            const accept = this.newLabel(layer, "测试复活", 110, -55, 28, TEXT).node;
            decline.on(Node.EventType.TOUCH_END, () => this.dispatchInput({ type: "relive", decision: "decline" }), this);
            accept.on(Node.EventType.TOUCH_END, () => this.dispatchInput({ type: "relive", decision: "accept" }), this);
        }
        if (this.reliveLabel) {
            const deathCause = model.deathCause === "wall" ? "撞到边界"
                : model.deathCause === "collision" ? "碰撞"
                    : model.deathCause === "forced" ? "本次已结束" : "未知原因";
            this.reliveLabel.string = model.processing
                ? "测试续命处理中…"
                : `${deathCause} · 分数 ${model.score} · 长度 ${model.length}\n第 ${model.reliveIndex} 次，测试金币 ${model.coinCost}\n${model.decisionSeconds}s`;
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
        const mutable = frame as unknown as {
            rotated?: boolean;
            pivot?: { x: number; y: number };
        };
        mutable.rotated = definition.rotated;
        mutable.pivot = { x: definition.pivot.x, y: definition.pivot.y };
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
