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
} from "./SnakePresentationCatalog.generated";

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
    readonly firstBodyPointDistance: number;
    readonly repeatedBodyPointDistance: number;
    readonly tailPointDistance: number | null;
}

const PRESENTATION_KEYS = [
    "bodyRenderType", "bodyRenderWidthRate", "boost", "boostSource", "fallbackSkinId",
    "headAnchorY", "normal", "previewAsset", "skinId", "textureAsset", "visualScale",
] as const;

function fail(message: string): never {
    throw new Error(`[snake-presentation-catalog] ${message}`);
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

export const CLIENT_SNAKE_PRESENTATION_CATALOG: readonly ClientSkinPresentation[] = validateClientSnakePresentationCatalog(
    CLIENT_SNAKE_PRESENTATION_CATALOG_DATA,
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH,
);
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
    return { firstBodyPointDistance, repeatedBodyPointDistance, tailPointDistance };
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
