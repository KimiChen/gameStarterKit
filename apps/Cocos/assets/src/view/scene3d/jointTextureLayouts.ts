import { director } from "cc";

export interface JointTextureLayout {
    readonly textureLength: number;
    readonly contents: readonly { readonly skeleton: number; readonly clips: readonly number[] }[];
}
const registrations = new WeakMap<object, Map<string, "ready" | "failed">>();

/** Optional author layout, registered BEFORE first instantiation/baking. Hashes only are retained.
 * Identical declarations reuse the engine's persistent chunks across opens. Different declarations
 * may not claim the same skeleton/clip pair (Creator keys them by signed skeleton XOR clip).
 * Width must fit complete joint records in both RGBA32F (3 pixels) and RGBA8 (12 pixels,
 * doubled texture width). This API never clears another owner's global texture pool.
 */
export function registerJointTextureLayouts(layouts: readonly JointTextureLayout[]): void {
    const pool = director.root?.dataPoolManager.jointTexturePool;
    if (!pool) throw new Error("Joint texture layouts require a live Creator pool");
    const claims = new Set<number>();
    const normalized = layouts.map((layout) => {
        if (!Number.isSafeInteger(layout.textureLength) || layout.textureLength <= 0 || layout.textureLength % 12 !== 0
            || !layout.contents.length) throw new Error("Joint texture layout requires a positive 12-aligned width and contents");
        return { textureLength: layout.textureLength, contents: layout.contents.map((content) => {
            if (!Number.isInteger(content.skeleton) || !content.clips.length) throw new Error("Joint texture layout requires skeleton and clips");
            const clips = [...content.clips].sort((a, b) => a - b);
            for (const clip of clips) {
                const claim = content.skeleton ^ clip;
                if (!Number.isInteger(clip) || clip === 0 || claims.has(claim)) throw new Error("Invalid or colliding joint texture clip hash");
                claims.add(claim);
            }
            return { skeleton: content.skeleton, clips };
        }).sort((a, b) => a.skeleton - b.skeleton) };
    });
    if (!normalized.length) return;
    const key = JSON.stringify(normalized);
    let keys = registrations.get(pool);
    if (!keys) { keys = new Map(); registrations.set(pool, keys); }
    if (keys.get(key) === "ready") return;
    if (keys.get(key) === "failed") throw new Error("Joint texture registration previously failed; restart engine pool");
    for (const previous of keys.keys()) {
        const previousLayouts = JSON.parse(previous) as JointTextureLayout[];
        if (previousLayouts.some((layout) => layout.contents.some((content) => content.clips.some((clip) => claims.has(content.skeleton ^ clip))))) {
            throw new Error("Joint texture declaration conflicts with an existing registration");
        }
    }
    keys.set(key, "failed"); // Partial allocations cannot be safely undone/retried in a shared pool.
    pool.registerCustomTextureLayouts(normalized);
    keys.set(key, "ready");
}
