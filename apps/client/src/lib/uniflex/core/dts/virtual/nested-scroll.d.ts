import type { VirtualDirection } from './virtual-collection.js';
export type NestedScrollPhase = 'idle' | 'pending' | 'dragging' | 'ballistic' | 'spring';
export interface NestedScrollTarget {
    readonly id: string;
    readonly direction: VirtualDirection;
    readonly parent: NestedScrollTarget | null;
    getOffset(): number;
    getMaxOffset(): number;
    /** Applies an offset delta and returns the amount actually consumed. */
    scrollBy(delta: number): number;
    /** Applies terminal-edge visual displacement without changing logical offset. */
    setOverscroll?(distance: number): void;
    /** Optional native scroll lifecycle used by engine-backed targets. */
    beginDrag?(): void;
    /** Releases the active drag using the target's native inertia and bounce. */
    releaseDrag?(): void;
    /** Closes an unused native drag participant without starting inertia. */
    discardDrag?(): void;
    stop(): void;
}
/**
 * Coordinates one pointer session across a chain of virtual scroll containers.
 *
 * The hit target remains the start of the chain for every move. There is no
 * permanent "owner": a child can hand residual movement to its parent and then
 * consume movement again immediately when the gesture reverses.
 */
export declare class NestedScrollCoordinator {
    private readonly threshold;
    private readonly directionDominance;
    private readonly minimumFlingVelocity;
    private readonly maximumFlingVelocity;
    private readonly velocityScale;
    private readonly ballisticFriction;
    private readonly edgeLimit;
    private readonly springDuration;
    private origin;
    private axis;
    private currentPhase;
    private accumulatedX;
    private accumulatedY;
    private elapsed;
    private lastConsumer;
    private ballisticVelocity;
    private edgeTarget;
    private overscroll;
    private springStart;
    private springElapsed;
    private readonly samples;
    constructor(threshold?: number, directionDominance?: number, minimumFlingVelocity?: number, maximumFlingVelocity?: number, velocityScale?: number, ballisticFriction?: number, edgeLimit?: number, springDuration?: number);
    get phase(): NestedScrollPhase;
    get lockedAxis(): VirtualDirection | null;
    get isAnimating(): boolean;
    begin(target: NestedScrollTarget): void;
    move(deltaX: number, deltaY: number, elapsedSeconds: number): NestedScrollTarget | null;
    /** Consumes a wheel or trackpad delta without starting touch inertia. */
    wheel(target: NestedScrollTarget, deltaX: number, deltaY: number): NestedScrollTarget | null;
    end(): NestedScrollTarget | null;
    /** Advances coordinator-owned inertia and uses the same child-to-parent chain as dragging. */
    advance(elapsedSeconds: number): NestedScrollTarget | null;
    /** Native targets keep Cocos cancel behavior; pure targets cancel without inertia. */
    cancel(): void;
    private finishNativeDrag;
    private consume;
    private consumeOverscrollOnReverse;
    private applyTerminalOverscroll;
    private updateOverscrollVisual;
    private startSpring;
    private advanceSpring;
    private pushSample;
    private clearSession;
}
/** Bounded keyed offset storage for virtual containers recycled with ancestor rows. */
export declare class NestedScrollStateCache {
    private readonly capacity;
    private readonly values;
    constructor(capacity?: number);
    get size(): number;
    save(path: string, offset: number): void;
    restore(path: string): number | undefined;
    delete(path: string): void;
    deletePrefix(prefix: string): void;
}
