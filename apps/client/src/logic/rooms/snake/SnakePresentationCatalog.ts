import {
    DEFAULT_SNAKE_SKIN,
    PUBLIC_SNAKE_SKIN_CATALOG,
    PUBLIC_SNAKE_SKIN_CATALOG_HASH,
} from "../../../shared/index";
import {
    CLIENT_SNAKE_PRESENTATION_CATALOG_DATA,
    CLIENT_SNAKE_PRESENTATION_HASH,
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH,
    SNAKE_ENTITY_PRESENTATION_CATALOG_DATA,
    SNAKE_PRESENTATION_VERSION as GENERATED_SNAKE_PRESENTATION_VERSION,
} from "./SnakePresentationCatalogData";

export interface FrameDefinition {
    readonly sourceFrameName: string;
    readonly rect: Readonly<{ x: number; y: number; width: number; height: number }>;
    readonly pivot: Readonly<{ x: number; y: number }>;
    readonly trimOffset: Readonly<{ x: number; y: number }>;
    readonly originalSize: Readonly<{ width: number; height: number }>;
    readonly rotated: boolean;
    readonly trimmed: boolean;
}

export interface TimedFrameDefinition extends FrameDefinition {
    /** 原作渲染帧保持次数，固定为 max(1, source.frame_time)，不是毫秒。 */
    readonly durationFrames: number;
}

export interface SkinPartTrack {
    readonly level: number;
    readonly sourceDistance: number;
    readonly frames: readonly TimedFrameDefinition[];
}

export interface SkinMotionPresentation {
    readonly head: SkinPartTrack;
    readonly body: readonly SkinPartTrack[];
    readonly tail: SkinPartTrack | null;
    readonly bodySequence: readonly number[];
    readonly sourceBodyOffset: number;
}

export interface ClientSkinPresentation {
    readonly skinId: number;
    readonly previewAsset: string;
    readonly textureAsset: string;
    readonly normal: SkinMotionPresentation;
    readonly boost: SkinMotionPresentation;
    readonly boostSource: "source" | "inherit-normal";
    readonly bodyRenderWidthRate: number;
    readonly bodyRenderType: 2;
    readonly headAnchorY: number;
    readonly visualScale: number;
    readonly fallbackSkinId: number | null;
}

export interface SkinLayoutMetrics {
    /**
     * 源像素 → 世界单位的换算系数：`36 * bodyRenderWidthRate / body[0].帧宽 * bodyScale`。
     * 它同时决定了身体精灵该画多大——某帧的世界尺寸就是 `rect.width/height * frameScale`。
     * ⚠ 分母固定取 `body[0]` 的帧宽（原作同款口径），所以同一皮肤内不同 body 轨道共用一个系数。
     */
    readonly frameScale: number;
    /** 蛇头点(索引 0)到**第一个身体精灵**之间隔多少个路径点。 */
    readonly firstBodyPointDistance: number;
    /** 相邻两个身体精灵之间隔多少个路径点。⚠ 是「隔几个点」，不是世界距离。 */
    readonly repeatedBodyPointDistance: number;
    readonly tailPointDistance: number | null;
}

export interface MagnetRenderingGroup {
    readonly batchGroup: "world-tools" | "passive-status-ui" | "snake-head-effects";
    readonly material: "sprite-alpha" | "recipe-defined";
}

export interface MagnetPresentation {
    readonly kind: "magnet";
    readonly sourceToolId: 10001;
    readonly world: {
        readonly logicalName: "magnet";
        readonly textureAsset: "snakeoff/snake_magnet_tools";
        readonly frame: FrameDefinition;
        readonly displaySize: 70;
        readonly rendering: MagnetRenderingGroup;
    };
    readonly statusIcon: {
        readonly logicalName: "magnet-status-icon";
        readonly logicalAliasOf: "magnet";
        readonly textureAsset: "snakeoff/snake_magnet_tools";
        readonly frame: FrameDefinition;
        readonly role: "passive-indicator";
        readonly interactive: false;
        readonly rendering: MagnetRenderingGroup;
    };
    readonly activeEffect: {
        readonly event: "magnet-active";
        readonly policy: "resource";
        readonly recipeAsset: "snakeoff/snake_magnet_aura";
        readonly rendering: MagnetRenderingGroup;
        readonly fallback: {
            readonly logicalName: "magnet-status-icon";
            readonly placement: "over-head";
        };
    };
}

export const SNAKE_PRESENTATION_VERSION = GENERATED_SNAKE_PRESENTATION_VERSION;

const PRESENTATION_KEYS = [
    "bodyRenderType", "bodyRenderWidthRate", "boost", "boostSource", "fallbackSkinId",
    "headAnchorY", "normal", "previewAsset", "skinId", "textureAsset", "visualScale",
] as const;

function fail(message: string): never {
    throw new Error(`[snake-presentation-catalog] ${message}`);
}

function record(value: unknown, context: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${context} must be an object`);
    return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], context: string): void {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        fail(`${context} must contain exactly ${wanted.join(", ")}`);
    }
}

function finite(value: number, context: string): number {
    if (!Number.isFinite(value)) fail(`${context} must be finite`);
    return value;
}

function positive(value: number, context: string): number {
    finite(value, context);
    if (value <= 0) fail(`${context} must be positive`);
    return value;
}

export function validateFrameDefinition(frame: FrameDefinition, textureWidth?: number, textureHeight?: number): void {
    if (!frame.sourceFrameName) fail("frame sourceFrameName must be non-empty");
    finite(frame.rect.x, `${frame.sourceFrameName}.rect.x`);
    finite(frame.rect.y, `${frame.sourceFrameName}.rect.y`);
    positive(frame.rect.width, `${frame.sourceFrameName}.rect.width`);
    positive(frame.rect.height, `${frame.sourceFrameName}.rect.height`);
    finite(frame.pivot.x, `${frame.sourceFrameName}.pivot.x`);
    finite(frame.pivot.y, `${frame.sourceFrameName}.pivot.y`);
    finite(frame.trimOffset.x, `${frame.sourceFrameName}.trimOffset.x`);
    finite(frame.trimOffset.y, `${frame.sourceFrameName}.trimOffset.y`);
    positive(frame.originalSize.width, `${frame.sourceFrameName}.originalSize.width`);
    positive(frame.originalSize.height, `${frame.sourceFrameName}.originalSize.height`);
    if (textureWidth !== undefined && textureHeight !== undefined) {
        positive(textureWidth, "textureWidth");
        positive(textureHeight, "textureHeight");
        const packedWidth = frame.rotated ? frame.rect.height : frame.rect.width;
        const packedHeight = frame.rotated ? frame.rect.width : frame.rect.height;
        if (frame.rect.x < 0 || frame.rect.y < 0 || frame.rect.x + packedWidth > textureWidth || frame.rect.y + packedHeight > textureHeight) {
            fail(`${frame.sourceFrameName} rect lies outside the loaded texture`);
        }
    }
}

function frameIdentity(frame: FrameDefinition): readonly unknown[] {
    return [
        frame.sourceFrameName,
        frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height,
        frame.pivot.x, frame.pivot.y,
        frame.trimOffset.x, frame.trimOffset.y,
        frame.originalSize.width, frame.originalSize.height,
        frame.rotated, frame.trimmed,
    ];
}

function validateTrack(track: SkinPartTrack, context: string): void {
    finite(track.level, `${context}.level`);
    finite(track.sourceDistance, `${context}.sourceDistance`);
    if (track.frames.length === 0) fail(`${context}.frames must not be empty`);
    for (const frame of track.frames) {
        validateFrameDefinition(frame);
        if (!Number.isFinite(frame.durationFrames) || frame.durationFrames < 1) fail(`${context}.${frame.sourceFrameName}.durationFrames must be >= 1`);
    }
}

function validateMotion(motion: SkinMotionPresentation, context: string): void {
    validateTrack(motion.head, `${context}.head`);
    if (motion.body.length === 0) fail(`${context}.body must not be empty`);
    motion.body.forEach((track, index) => validateTrack(track, `${context}.body[${index}]`));
    if (motion.tail) validateTrack(motion.tail, `${context}.tail`);
    finite(motion.sourceBodyOffset, `${context}.sourceBodyOffset`);
    if (motion.bodySequence.length === 0 || motion.bodySequence.some((index) => !Number.isInteger(index) || index < 0 || index >= motion.body.length)) {
        fail(`${context}.bodySequence contains an invalid body index`);
    }
}

export function validateClientSnakePresentationCatalog(value: unknown, embeddedPublicHash: string): readonly ClientSkinPresentation[] {
    if (embeddedPublicHash !== PUBLIC_SNAKE_SKIN_CATALOG_HASH) {
        fail("embedded public catalog hash differs from shared; regenerate and sync S1 outputs");
    }
    if (!Array.isArray(value) || value.length !== PUBLIC_SNAKE_SKIN_CATALOG.length) fail("client/public catalog lengths differ");
    const publicById = new Map(PUBLIC_SNAKE_SKIN_CATALOG.map((entry) => [entry.skinId, entry]));
    const seen = new Set<number>();
    const result: ClientSkinPresentation[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const candidate: unknown = value[index];
        if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) fail("presentation entry must be an object");
        const raw = candidate as Record<string, unknown>;
        const presentation = raw as unknown as ClientSkinPresentation;
        const keys = Object.keys(raw).sort();
        if (keys.length !== PRESENTATION_KEYS.length || keys.some((key, index) => key !== PRESENTATION_KEYS[index])) {
            fail(`skin ${presentation.skinId} has unexpected or missing presentation fields`);
        }
        if (!publicById.has(presentation.skinId) || seen.has(presentation.skinId)) fail(`unknown or duplicate skinId ${presentation.skinId}`);
        if (presentation.skinId !== PUBLIC_SNAKE_SKIN_CATALOG[index].skinId) fail(`skin ${presentation.skinId} is out of public catalog order`);
        if (!presentation.previewAsset || !presentation.textureAsset || presentation.previewAsset.startsWith("/") || presentation.textureAsset.startsWith("/")
            || presentation.previewAsset.includes("://") || presentation.textureAsset.includes("://")) {
            fail(`skin ${presentation.skinId} resource paths must be stable repository-relative logical paths`);
        }
        if (presentation.bodyRenderType !== 2) fail(`skin ${presentation.skinId} has unsupported bodyRenderType`);
        positive(presentation.bodyRenderWidthRate, `skin ${presentation.skinId}.bodyRenderWidthRate`);
        positive(presentation.visualScale, `skin ${presentation.skinId}.visualScale`);
        finite(presentation.headAnchorY, `skin ${presentation.skinId}.headAnchorY`);
        validateMotion(presentation.normal, `skin ${presentation.skinId}.normal`);
        validateMotion(presentation.boost, `skin ${presentation.skinId}.boost`);
        const expectedFallback = presentation.skinId === DEFAULT_SNAKE_SKIN.skinId ? null : DEFAULT_SNAKE_SKIN.skinId;
        if (presentation.fallbackSkinId !== expectedFallback) fail(`skin ${presentation.skinId} must fall back directly to skin ${DEFAULT_SNAKE_SKIN.skinId}`);
        if (presentation.boostSource === "inherit-normal" && JSON.stringify(presentation.boost) !== JSON.stringify(presentation.normal)) {
            fail(`skin ${presentation.skinId} declares inherit-normal but boost content differs`);
        }
        if (presentation.boostSource !== "source" && presentation.boostSource !== "inherit-normal") fail(`skin ${presentation.skinId}.boostSource is invalid`);
        seen.add(presentation.skinId);
        result.push(presentation);
    }
    return result;
}

/** 历史 S1 envelope 无字段时仅用于迁移解释为 1；当前生成物必须显式为 2。 */
export function readSnakePresentationVersion(value: unknown): 1 | 2 {
    const raw = record(value, "presentation envelope").presentationVersion;
    if (raw === undefined) return 1;
    if (raw !== 1 && raw !== 2) fail(`unsupported presentationVersion ${String(raw)}`);
    return raw;
}

function validateRendering(value: unknown, batchGroup: string, material: string, context: string): void {
    const rendering = record(value, context);
    exactKeys(rendering, ["batchGroup", "material"], context);
    if (rendering.batchGroup !== batchGroup || rendering.material !== material) fail(`${context} has an invalid batch/material assignment`);
}

export function validateMagnetPresentation(value: unknown): MagnetPresentation {
    const magnet = record(value, "tools.magnet");
    exactKeys(magnet, ["activeEffect", "kind", "sourceToolId", "statusIcon", "world"], "tools.magnet");
    if (magnet.kind !== "magnet" || magnet.sourceToolId !== 10001) fail("tools.magnet kind/sourceToolId must be magnet/10001");

    const world = record(magnet.world, "tools.magnet.world");
    exactKeys(world, ["displaySize", "frame", "logicalName", "rendering", "textureAsset"], "tools.magnet.world");
    if (world.logicalName !== "magnet" || world.textureAsset !== "snakeoff/snake_magnet_tools" || world.displaySize !== 70) {
        fail("tools.magnet.world identity, texture or displaySize is invalid");
    }
    const worldFrameRecord = record(world.frame, "tools.magnet.world.frame");
    exactKeys(worldFrameRecord, ["originalSize", "pivot", "rect", "rotated", "sourceFrameName", "trimOffset", "trimmed"], "tools.magnet.world.frame");
    const worldFrame = world.frame as FrameDefinition;
    validateFrameDefinition(worldFrame, 468, 769);
    if (JSON.stringify(frameIdentity(worldFrame)) !== JSON.stringify(["10001", 346, 256, 84, 92, 0.5, 0.5, 0, 0, 84, 92, false, false])) {
        fail("tools.magnet.world.frame differs from frozen frame 10001");
    }
    validateRendering(world.rendering, "world-tools", "sprite-alpha", "tools.magnet.world.rendering");

    const statusIcon = record(magnet.statusIcon, "tools.magnet.statusIcon");
    exactKeys(statusIcon, ["frame", "interactive", "logicalAliasOf", "logicalName", "rendering", "role", "textureAsset"], "tools.magnet.statusIcon");
    const statusFrameRecord = record(statusIcon.frame, "tools.magnet.statusIcon.frame");
    exactKeys(statusFrameRecord, ["originalSize", "pivot", "rect", "rotated", "sourceFrameName", "trimOffset", "trimmed"], "tools.magnet.statusIcon.frame");
    const statusFrame = statusIcon.frame as FrameDefinition;
    validateFrameDefinition(statusFrame, 468, 769);
    if (statusIcon.logicalName !== "magnet-status-icon" || statusIcon.logicalAliasOf !== "magnet"
        || statusIcon.role !== "passive-indicator" || statusIcon.interactive !== false
        || statusIcon.textureAsset !== world.textureAsset
        || JSON.stringify(frameIdentity(statusFrame)) !== JSON.stringify(frameIdentity(worldFrame))) {
        fail("tools.magnet.statusIcon must be a non-interactive exact logical alias of the world texture/frame");
    }
    validateRendering(statusIcon.rendering, "passive-status-ui", "sprite-alpha", "tools.magnet.statusIcon.rendering");

    const activeEffect = record(magnet.activeEffect, "tools.magnet.activeEffect");
    exactKeys(activeEffect, ["event", "fallback", "policy", "recipeAsset", "rendering"], "tools.magnet.activeEffect");
    if (activeEffect.event !== "magnet-active" || activeEffect.policy !== "resource" || activeEffect.recipeAsset !== "snakeoff/snake_magnet_aura") {
        fail("tools.magnet.activeEffect must use the registered magnet aura recipe");
    }
    validateRendering(activeEffect.rendering, "snake-head-effects", "recipe-defined", "tools.magnet.activeEffect.rendering");
    const fallback = record(activeEffect.fallback, "tools.magnet.activeEffect.fallback");
    exactKeys(fallback, ["logicalName", "placement"], "tools.magnet.activeEffect.fallback");
    if (fallback.logicalName !== "magnet-status-icon" || fallback.placement !== "over-head") {
        fail("tools.magnet.activeEffect fallback must directly use magnet-status-icon over-head");
    }
    return magnet as unknown as MagnetPresentation;
}

export function validateSnakeEntityPresentationCatalog(value: unknown, generatedVersion = GENERATED_SNAKE_PRESENTATION_VERSION): MagnetPresentation {
    const catalog = record(value, "presentation catalog");
    exactKeys(catalog, ["audio", "effects", "food", "grid", "identity", "presentationVersion", "tools", "walls", "wreck"], "presentation catalog");
    if (readSnakePresentationVersion(catalog) !== 2 || generatedVersion !== 2 || catalog.presentationVersion !== generatedVersion) {
        fail("current presentation envelope and generated SNAKE_PRESENTATION_VERSION must both be 2");
    }

    const identity = record(catalog.identity, "presentation.identity");
    exactKeys(identity, ["ai", "otherHuman", "seatTinting", "self", "skinTint"], "presentation.identity");
    if (JSON.stringify(identity.skinTint) !== JSON.stringify([255, 255, 255, 255]) || identity.seatTinting !== "forbidden") {
        fail("presentation.identity must preserve white skin tint and forbid seat tinting");
    }
    const self = record(identity.self, "presentation.identity.self");
    const otherHuman = record(identity.otherHuman, "presentation.identity.otherHuman");
    const ai = record(identity.ai, "presentation.identity.ai");
    exactKeys(self, ["arrow", "nameplate", "outline"], "presentation.identity.self");
    exactKeys(otherHuman, ["arrow", "nameplate", "outline"], "presentation.identity.otherHuman");
    exactKeys(ai, ["arrow", "avatar", "nameplate", "outline"], "presentation.identity.ai");
    if (self.arrow !== "none" || self.nameplate !== "none" || self.outline !== "fine-white"
        || otherHuman.arrow !== "none" || otherHuman.nameplate !== "text" || otherHuman.outline !== "none"
        || ai.arrow !== "none" || ai.avatar !== "none" || ai.nameplate !== "text" || ai.outline !== "none") {
        fail("presentation.identity exposes an old arrow, AI outline/avatar, or non-frozen identity branch");
    }

    const tools = record(catalog.tools, "presentation.tools");
    exactKeys(tools, ["magnet"], "presentation.tools");
    const magnet = validateMagnetPresentation(tools.magnet);

    if (!Array.isArray(catalog.audio)) fail("presentation.audio must be an array");
    const audio = catalog.audio.map((entry, index) => {
        const audioEntry = record(entry, `presentation.audio[${index}]`);
        exactKeys(audioEntry, ["asset", "endlessReachability", "event", "maxConcurrent", "missingPolicy", "playback", "policy", "reason", "resourceHash", "sfxOnGuarded", "volume"], `presentation.audio[${index}]`);
        return audioEntry;
    });
    const names = audio.map((entry) => entry.event);
    if (names.some((name) => typeof name !== "string") || new Set(names).size !== names.length) fail("presentation.audio event names must be unique strings");
    const collect = audio.find((entry) => entry.event === "collect-magnet");
    const loop = audio.find((entry) => entry.event === "magnet-active-loop");
    if (!collect || collect.policy !== "resource" || collect.asset !== "snakeoff/snake_sfx_collect_magnet"
        || typeof collect.resourceHash !== "string" || !/^[a-f0-9]{64}$/.test(collect.resourceHash)
        || collect.sfxOnGuarded !== true || collect.playback !== "single-instance" || collect.maxConcurrent !== 1
        || collect.missingPolicy !== "silent" || collect.endlessReachability !== "mapped") {
        fail("collect-magnet audio must be sfxOn-controlled, single-instance, bounded and silent when missing");
    }
    if (!loop || loop.policy !== "silent" || loop.asset !== null || loop.resourceHash !== null || loop.volume !== null
        || loop.sfxOnGuarded !== null || loop.playback !== null || loop.maxConcurrent !== null || loop.missingPolicy !== "silent"
        || loop.reason !== "no-approved-loop-audio" || loop.endlessReachability !== "silent") {
        fail("magnet-active-loop must be explicit silent and resource-free");
    }
    return magnet;
}

export const CLIENT_SNAKE_PRESENTATION_CATALOG: readonly ClientSkinPresentation[] = validateClientSnakePresentationCatalog(
    CLIENT_SNAKE_PRESENTATION_CATALOG_DATA,
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH,
);
validateSnakeEntityPresentationCatalog(SNAKE_ENTITY_PRESENTATION_CATALOG_DATA);
export const SNAKE_ENTITY_PRESENTATION_CATALOG = SNAKE_ENTITY_PRESENTATION_CATALOG_DATA;
export { CLIENT_SNAKE_PRESENTATION_HASH };

const PRESENTATION_BY_ID = new Map(CLIENT_SNAKE_PRESENTATION_CATALOG.map((entry) => [entry.skinId, entry]));

export function getClientSnakeSkinPresentation(skinId: number): ClientSkinPresentation | undefined {
    return PRESENTATION_BY_ID.get(skinId);
}

/**
 * NormalRepeat(2) 的原作布局公式。负 source offset/distance 保持有符号，仅最终路径点距离必须为正。
 * boost 只换纹理，不改变路径点布局。
 */
export function deriveSkinLayoutMetrics(
    presentation: ClientSkinPresentation,
    bodyScale: number,
    pointDistance: number,
): SkinLayoutMetrics {
    positive(bodyScale, "bodyScale");
    positive(pointDistance, "pointDistance");
    if (presentation.bodyRenderType !== 2) fail(`skin ${presentation.skinId} is not NormalRepeat(2)`);
    const bodyTrack = presentation.normal.body[0];
    const bodyFrame = bodyTrack.frames[0];
    const headFrame = presentation.normal.head.frames[0];
    const frameScale = 36 * presentation.bodyRenderWidthRate / bodyFrame.rect.width * bodyScale;
    const bodyHeight = bodyFrame.rect.height * frameScale;
    const headHeight = headFrame.rect.height * frameScale;
    const firstBodyPointDistance = Math.round((0.5 * headHeight + 0.5 * bodyHeight + presentation.normal.sourceBodyOffset * frameScale) / pointDistance);
    const repeatedBodyPointDistance = Math.round((bodyHeight + bodyTrack.sourceDistance * frameScale) / pointDistance);
    let tailPointDistance: number | null = null;
    if (presentation.normal.tail) {
        const tailFrame = presentation.normal.tail.frames[0];
        const tailHeight = tailFrame.rect.height * frameScale;
        tailPointDistance = Math.round((0.5 * bodyHeight + 0.5 * tailHeight + presentation.normal.tail.sourceDistance * frameScale) / pointDistance);
    }
    for (const [name, value] of [
        ["firstBodyPointDistance", firstBodyPointDistance],
        ["repeatedBodyPointDistance", repeatedBodyPointDistance],
        ...(tailPointDistance === null ? [] : [["tailPointDistance", tailPointDistance] as const]),
    ] as const) positive(value, `skin ${presentation.skinId}.${name}`);
    return { frameScale, firstBodyPointDistance, repeatedBodyPointDistance, tailPointDistance };
}

export type SnakePresentationAvailability = "available" | "missing" | "invalid";
export type SnakePresentationDiagnosticCode =
    | "ok"
    | "unknown-skin-id"
    | "resource-missing"
    | "invalid-frame"
    | "public-hash-mismatch"
    | "default-unavailable";

export interface ClientSkinResolution {
    readonly requestedSkinId: number;
    readonly presentation: ClientSkinPresentation | null;
    readonly usedFallback: boolean;
    readonly diagnostic: SnakePresentationDiagnosticCode;
}

export type SnakePresentationProbe = (presentation: ClientSkinPresentation) => SnakePresentationAvailability;

/** 运行时部署损坏才走 fallback；retired 但资源完整的 entry 仍解析自身。 */
export function resolveClientSnakeSkinPresentation(
    requestedSkinId: number,
    probe: SnakePresentationProbe = () => "available",
    peerPublicHash = PUBLIC_SNAKE_SKIN_CATALOG_HASH,
): ClientSkinResolution {
    const requested = PRESENTATION_BY_ID.get(requestedSkinId);
    const hashMismatch = peerPublicHash !== PUBLIC_SNAKE_SKIN_CATALOG_HASH;
    let requestedAvailability: SnakePresentationAvailability | null = null;
    if (requested && !hashMismatch) {
        requestedAvailability = probe(requested);
        if (requestedAvailability === "available") return { requestedSkinId, presentation: requested, usedFallback: false, diagnostic: "ok" };
    }
    const fallback = PRESENTATION_BY_ID.get(DEFAULT_SNAKE_SKIN.skinId);
    const fallbackAvailability = fallback === requested && requestedAvailability !== null ? requestedAvailability : fallback ? probe(fallback) : "missing";
    if (!fallback || fallbackAvailability !== "available") return { requestedSkinId, presentation: null, usedFallback: true, diagnostic: "default-unavailable" };
    let diagnostic: SnakePresentationDiagnosticCode = "unknown-skin-id";
    if (hashMismatch) diagnostic = "public-hash-mismatch";
    else if (requested) diagnostic = requestedAvailability === "invalid" ? "invalid-frame" : "resource-missing";
    return { requestedSkinId, presentation: fallback, usedFallback: true, diagnostic };
}

export type MagnetRuntimeAssetKind = "world-texture" | "aura-recipe";
export type MagnetRuntimeAssetProbe = (kind: MagnetRuntimeAssetKind, logicalAsset: string) => SnakePresentationAvailability;
export type MagnetRuntimeDiagnostic = "ok" | "world-resource-missing" | "world-resource-invalid" | "aura-fallback-missing" | "aura-fallback-invalid";

export interface MagnetRuntimeResolution {
    readonly battleReady: boolean;
    readonly world: MagnetPresentation["world"] | null;
    readonly activeVisual:
        | Readonly<{ mode: "aura"; recipeAsset: "snakeoff/snake_magnet_aura" }>
        | Readonly<{
            mode: "status-icon-fallback";
            logicalName: "magnet-status-icon";
            placement: "over-head";
            textureAsset: "snakeoff/snake_magnet_tools";
            frame: FrameDefinition;
        }>
        | null;
    readonly diagnostic: MagnetRuntimeDiagnostic;
}

/**
 * World asset failure is a battle-entry blocker. Aura deployment failure takes one direct, non-recursive hop to the
 * already-loaded passive icon; it never invents another logical asset name or changes authoritative magnet state.
 */
export function resolveMagnetRuntimePresentation(
    probe: MagnetRuntimeAssetProbe = () => "available",
): MagnetRuntimeResolution {
    const magnet = SNAKE_ENTITY_PRESENTATION_CATALOG.tools.magnet;
    const worldAvailability = probe("world-texture", magnet.world.textureAsset);
    if (worldAvailability !== "available") {
        return {
            battleReady: false,
            world: null,
            activeVisual: null,
            diagnostic: worldAvailability === "invalid" ? "world-resource-invalid" : "world-resource-missing",
        };
    }
    const auraAvailability = probe("aura-recipe", magnet.activeEffect.recipeAsset);
    if (auraAvailability === "available") {
        return {
            battleReady: true,
            world: magnet.world,
            activeVisual: { mode: "aura", recipeAsset: magnet.activeEffect.recipeAsset },
            diagnostic: "ok",
        };
    }
    return {
        battleReady: true,
        world: magnet.world,
        activeVisual: {
            mode: "status-icon-fallback",
            logicalName: magnet.activeEffect.fallback.logicalName,
            placement: magnet.activeEffect.fallback.placement,
            textureAsset: magnet.statusIcon.textureAsset,
            frame: magnet.statusIcon.frame,
        },
        diagnostic: auraAvailability === "invalid" ? "aura-fallback-invalid" : "aura-fallback-missing",
    };
}
