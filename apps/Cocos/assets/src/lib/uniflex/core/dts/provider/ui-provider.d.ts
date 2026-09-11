import type { CompiledComponent, ComponentRuntimeOptions } from '../runtime/runtime.js';
import type { HostMetrics } from '../runtime/host-plan.js';
import type { LayoutRect } from '../layout/flex-types.js';
import type { ResourceProvider } from './resource-provider.js';
import type { SemanticZIndex } from '../navigation/semantic-z-index.js';
/** Optional lifetime counters. Snapshot before/after an operation to include every pass. */
export interface LayoutWorkTotals {
    readonly flushes: number;
    readonly flexMs: number;
    readonly writebackMs: number;
    readonly layoutCalls: number;
    readonly layoutNodes: number;
    readonly measuredLeaves: number;
    readonly percentageFallbacks: number;
    readonly textMeasureCalls: number;
    readonly textMeasureCacheHits: number;
    readonly writeVisits: number;
    readonly sizeWrites: number;
    readonly positionWrites: number;
    readonly labelLayouts: number;
}
export interface LayoutMetrics {
    readonly dirtyRoots: number;
    readonly measuredLeaves: number;
    readonly layoutPasses: number;
    readonly layoutMs: number;
    readonly writebackMs: number;
    readonly work?: Readonly<LayoutWorkTotals>;
}
export interface ProviderMetrics {
    readonly runtime: Readonly<HostMetrics>;
    readonly layout: Readonly<LayoutMetrics>;
}
/** Logical named scroll position without exposing a platform-native view. */
export interface HostScrollSnapshot {
    readonly name: string;
    readonly direction: 'vertical' | 'horizontal';
    readonly offset: number;
    readonly maximum: number;
}
declare const surfaceTokenBrand: unique symbol;
/** Opaque identity used by the compositor. It never exposes a native node or DOM element. */
export interface SurfaceToken {
    readonly id: number;
    readonly [surfaceTokenBrand]: true;
}
export type SurfaceActivity = 'active' | 'covered' | 'parked';
export type SurfaceTransitionState = 'steady' | 'entering' | 'exiting';
export interface SurfacePresentationOptions {
    readonly coverage: 'opaque' | 'translucent';
    readonly backdrop: 'none' | 'frozenBlur';
    readonly blockInputBelow: boolean;
    readonly transition: 'none' | 'fade';
}
export interface PresentedSurface {
    readonly surface: SurfaceToken;
    readonly activity: SurfaceActivity;
    readonly presentation: SurfacePresentationOptions;
    /** Semantic stage tier; providers derive numeric/sibling ordering from the plan order. */
    readonly zIndex: SemanticZIndex;
    /** Transient visual phase; it does not create another navigation state. */
    readonly transitionState?: SurfaceTransitionState;
}
/** Neutral stage-space lookup shared by independently mounted retained Hosts. */
export interface StageAnchorRegistry {
    resolve(name: string): LayoutRect | undefined;
    subscribe(listener: () => void): () => void;
}
export interface SurfaceCompositor {
    /** Atomically applies bottom-to-top surface order and activity. */
    present(surfaces: readonly PresentedSurface[]): Promise<void>;
}
export interface MountedComponent<Props> {
    readonly surface: SurfaceToken;
    readonly metrics: ProviderMetrics;
    update(nextProps?: Props): void;
    batch(action: () => void): void;
    flushNow(): void;
    destroy(): void;
}
export interface UIProvider {
    readonly assets: ResourceProvider;
    readonly compositor: SurfaceCompositor;
    readonly anchors: StageAnchorRegistry;
    mount<Props>(component: CompiledComponent<Props>, props: Props, runtimeOptions?: ComponentRuntimeOptions): MountedComponent<Props>;
    dispose(): void;
}
export {};
