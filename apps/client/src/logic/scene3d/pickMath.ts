/** Engine-free picking; structurally compatible with Stage3DLease.screenToRay. */
export interface PickPoint { readonly x: number; readonly y: number; readonly z: number }
export interface PickRay { readonly origin: PickPoint; readonly direction: PickPoint }
export interface PickAabb { readonly min: PickPoint; readonly max: PickPoint }
export interface PickHit {
    /** origin + t * direction, t >= 0. Distance only when direction has unit length. */
    readonly t: number;
    readonly point: PickPoint;
}
export type DesignPxToRay = (xDesignPx: number, yDesignPx: number) => PickRay;

const AXES = ["x", "y", "z"] as const;

function finite(value: number, label: string): void {
    if (!Number.isFinite(value)) throw new RangeError(`[pickMath] ${label} must be finite`);
}

function validatePoint(point: PickPoint, label: string): void {
    for (const axis of AXES) finite(point[axis], `${label}.${axis}`);
}

function validateRay(ray: PickRay): void {
    validatePoint(ray.origin, "origin");
    validatePoint(ray.direction, "direction");
    if (ray.direction.x === 0 && ray.direction.y === 0 && ray.direction.z === 0) {
        throw new RangeError("[pickMath] direction must be nonzero");
    }
}

function hitAt(ray: PickRay, t: number): PickHit {
    finite(t, "intersection t");
    // Canonicalize -0, including an outward ray starting exactly on a surface.
    if (t === 0) t = 0;
    const point = {
        x: ray.origin.x + t * ray.direction.x,
        y: ray.origin.y + t * ray.direction.y,
        z: ray.origin.z + t * ray.direction.z,
    };
    validatePoint(point, "intersection");
    return { t, point };
}

/**
 * Intersect the horizontal plane y = height, from either side. Parallel rays (including
 * coplanar rays with no unique crossing) and crossings behind the origin return null.
 * Direction need not be normalized; exact zero avoids a scale-dependent parallel epsilon.
 * Nonfinite inputs, zero directions and unrepresentable hits throw RangeError.
 */
export function rayPlane(ray: PickRay, height = 0): PickHit | null {
    validateRay(ray);
    finite(height, "height");
    if (ray.direction.y === 0) return null;
    const t = (height - ray.origin.y) / ray.direction.y;
    if (t < 0) return null;
    return hitAt(ray, t);
}

/**
 * First overlap with a closed, solid AABB. An origin inside/on the box hits at t = 0;
 * tangencies and zero-thickness boxes count. Reversed bounds are invalid, not reordered.
 * Handle parallel slabs explicitly so boundary origins never multiply zero by infinity.
 */
export function rayAabb(ray: PickRay, box: PickAabb): PickHit | null {
    validateRay(ray);
    validatePoint(box.min, "min");
    validatePoint(box.max, "max");
    for (const axis of AXES) {
        if (box.min[axis] > box.max[axis]) throw new RangeError(`[pickMath] min.${axis} must not exceed max.${axis}`);
    }
    let enter = -Infinity, exit = Infinity;
    for (const axis of AXES) {
        const origin = ray.origin[axis], direction = ray.direction[axis];
        if (direction === 0) {
            if (origin < box.min[axis] || origin > box.max[axis]) return null;
            continue;
        }
        const a = (box.min[axis] - origin) / direction;
        const b = (box.max[axis] - origin) / direction;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
        if (enter > exit) return null;
    }
    if (exit < 0) return null;
    return hitAt(ray, Math.max(0, enter));
}

/**
 * Unproject absolute lower-left design pixels onto y = height. Inject the stage lease's
 * screenToRay: it already uses viewport.ts and the current camera matrices. Do not pass
 * Camera.screenPointToRay directly (screen pixels), flip Y, or apply viewport scaling twice.
 * Keep out-of-viewport points for an owned drag. No engine, matrix or viewport state is cached.
 */
export function unprojectDesignPx(x: number, y: number, screenToRay: DesignPxToRay, height = 0): PickHit | null {
    finite(x, "design x");
    finite(y, "design y");
    finite(height, "height");
    return rayPlane(screenToRay(x, y), height);
}
