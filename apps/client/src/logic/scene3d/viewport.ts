/** Design and screen coordinates both use Cocos' lower-left origin. No FGUI y flip. */
export interface RectDesignPx {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface ViewportMetrics {
    /** Visible design region; its origin need not be (0, 0). */
    readonly design: RectDesignPx;
    /** Render target size in pixels, in the same units as Camera.screenPointToRay. */
    readonly screen: { readonly width: number; readonly height: number };
    /** Screen pixel region occupied by design, excluding any letterbox bars. */
    readonly content: RectDesignPx;
}

export interface ResolvedViewport {
    /** Camera.rect, normalized against the full screen, including letterbox bars. */
    readonly rect: RectDesignPx;
    /** Actual pixel aspect ratio of this viewport, including nonuniform scaling. */
    readonly aspect: number;
}

function finite(value: number, label: string): void {
    if (!Number.isFinite(value)) throw new RangeError(`[Stage3D viewport] ${label} must be finite`);
}

function positive(value: number, label: string): void {
    finite(value, label);
    if (value <= 0) throw new RangeError(`[Stage3D viewport] ${label} must be greater than zero`);
}

function validateRect(rect: RectDesignPx, label: string): void {
    if (!rect || typeof rect !== "object") throw new TypeError(`[Stage3D viewport] ${label} must be a rectangle`);
    finite(rect.x, `${label}.x`);
    finite(rect.y, `${label}.y`);
    positive(rect.width, `${label}.width`);
    positive(rect.height, `${label}.height`);
    finite(rect.x + rect.width, `${label} right edge`);
    finite(rect.y + rect.height, `${label} top edge`);
    if (rect.x + rect.width <= rect.x || rect.y + rect.height <= rect.y) {
        throw new RangeError(`[Stage3D viewport] ${label} edges must enclose a representable positive area`);
    }
}

function contained(rect: RectDesignPx, bounds: RectDesignPx, label: string): void {
    if (rect.x < bounds.x || rect.y < bounds.y
        || rect.x + rect.width > bounds.x + bounds.width
        || rect.y + rect.height > bounds.y + bounds.height) {
        throw new RangeError(`[Stage3D viewport] ${label} must be within its visible bounds`);
    }
}

function validateMetrics(metrics: ViewportMetrics): void {
    if (!metrics || !metrics.screen) throw new TypeError("[Stage3D viewport] metrics must include screen size");
    validateRect(metrics.design, "metrics.design");
    positive(metrics.screen.width, "metrics.screen.width");
    positive(metrics.screen.height, "metrics.screen.height");
    validateRect(metrics.content, "metrics.content");
    contained(metrics.content, { x: 0, y: 0, width: metrics.screen.width, height: metrics.screen.height }, "metrics.content");
}

function mapPoint(x: number, y: number, metrics: ViewportMetrics): { x: number; y: number } {
    const { design, content } = metrics;
    const screenX = content.x + (x - design.x) / design.width * content.width;
    const screenY = content.y + (y - design.y) / design.height * content.height;
    finite(screenX, "mapped screen x");
    finite(screenY, "mapped screen y");
    return { x: screenX, y: screenY };
}

/** Convert an in-bounds design viewport to Camera.rect and its true pixel aspect. */
export function resolveViewport(rect: RectDesignPx, metrics: ViewportMetrics): ResolvedViewport {
    validateMetrics(metrics);
    validateRect(rect, "viewport");
    contained(rect, metrics.design, "viewport");
    const origin = mapPoint(rect.x, rect.y, metrics);
    const width = rect.width / metrics.design.width * metrics.content.width;
    const height = rect.height / metrics.design.height * metrics.content.height;
    positive(width, "mapped viewport width");
    positive(height, "mapped viewport height");
    const normalized = {
        x: origin.x / metrics.screen.width,
        y: origin.y / metrics.screen.height,
        width: width / metrics.screen.width,
        height: height / metrics.screen.height,
    };
    positive(normalized.width, "normalized viewport width");
    positive(normalized.height, "normalized viewport height");
    const aspect = width / height;
    positive(aspect, "viewport aspect");
    return { rect: normalized, aspect };
}

/** Preserve finite points outside design: an owned drag may cross a viewport/HUD boundary. */
export function designToScreen(x: number, y: number, metrics: ViewportMetrics): { x: number; y: number } {
    validateMetrics(metrics);
    finite(x, "design x");
    finite(y, "design y");
    return mapPoint(x, y, metrics);
}
