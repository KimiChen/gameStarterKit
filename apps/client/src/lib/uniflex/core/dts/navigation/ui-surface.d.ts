import type { CompiledComponent } from '../runtime/runtime.js';
import type { ProviderMetrics } from '../provider/ui-provider.js';
import type { NavigationSignal, RouteLaunchMode, RoutePresentation, RouteRetention, SurfaceRef } from './navigator.js';
import type { ViewZIndex } from './semantic-z-index.js';
declare const uiDefinitionBrand: unique symbol;
export interface UIDefinitionOptions<Params> {
    readonly zIndex: ViewZIndex;
    readonly presentation?: Partial<RoutePresentation>;
    readonly retention?: RouteRetention;
    readonly launchMode?: RouteLaunchMode;
    readonly instanceKey?: (params: Params) => string;
}
export interface UIDefinition<Params = void, Result = void> {
    readonly id: string;
    readonly options: Readonly<UIDefinitionOptions<Params>>;
    readonly [uiDefinitionBrand]: {
        readonly params: Params;
        readonly result: Result;
    };
}
export type UIParams<Definition> = Definition extends UIDefinition<infer Params, unknown> ? Params : never;
export type UIResult<Definition> = Definition extends UIDefinition<unknown, infer Result> ? Result : never;
type NavigationArguments<Params> = [Params] extends [void] ? [params?: Params] : [params: Params];
export interface UINavigationContext {
    open<TargetParams, TargetResult>(target: UIDefinition<TargetParams, TargetResult>, ...arguments_: NavigationArguments<TargetParams>): SurfaceRef<TargetResult>;
    goto<TargetParams, TargetResult>(target: UIDefinition<TargetParams, TargetResult>, ...arguments_: NavigationArguments<TargetParams>): SurfaceRef<TargetResult>;
}
export interface UISurfaceRenderContext<Params = void, Result = void> extends UINavigationContext {
    readonly params: Params;
    readonly signal: NavigationSignal;
    readonly metrics: ProviderMetrics | undefined;
    back(): void;
    complete(...value: [Result] extends [void] ? [value?: Result] : [value: Result]): void;
}
/** A short-lived mount preparation owner; release is idempotent. */
export interface PreparedComponentPin<Props> {
    readonly component: CompiledComponent<Props>;
    release(): void;
}
export interface PreparedComponentSnapshot {
    readonly state: 'empty' | 'preparing' | 'ready' | 'disposed';
    readonly pins: number;
}
export interface BoundUISurface<Params = void, Result = void> {
    readonly id: string;
    readonly ui: UIDefinition<Params, Result>;
    readonly component: CompiledComponent<UISurfaceRenderContext<Params, Result>>;
    /** Loads this boundary until eviction; failure remains retryable. */
    readonly prepare?: () => Promise<void>;
    readonly acquirePrepared?: () => Promise<PreparedComponentPin<UISurfaceRenderContext<Params, Result>>>;
    /** Only deferred bindings own an evictable prepared cache. */
    readonly evictPrepared?: () => boolean;
    readonly inspectPrepared?: () => PreparedComponentSnapshot;
    readonly dispose?: () => void;
}
/** Type-erased registry entry; Params and Result remain available through get(). */
export interface AnyBoundUISurface {
    readonly id: string;
    readonly evictPrepared?: () => boolean;
    readonly inspectPrepared?: () => PreparedComponentSnapshot;
    readonly dispose?: () => void;
}
export interface UISurfaceRegistry {
    readonly bindings: readonly AnyBoundUISurface[];
    get<Params, Result>(ui: UIDefinition<Params, Result>): BoundUISurface<Params, Result> | undefined;
}
export declare function defineUISurface<Params = void, Result = void>(id: string, options: UIDefinitionOptions<Params>): UIDefinition<Params, Result>;
/** @internal Development-only reference used by AOT output to avoid evaluating authoring modules. */
export declare function hotUIDefinition<Params = void, Result = void>(id: string): UIDefinition<Params, Result>;
/** @internal */
export declare function isHotUIDefinition<Params, Result>(value: UIDefinition<Params, Result>): boolean;
export declare function bindUISurface<Params, Result>(ui: UIDefinition<Params, Result>, component: CompiledComponent<UISurfaceRenderContext<Params, Result>>): BoundUISurface<Params, Result>;
/** Registers navigation identity without loading the component's Plan or resources. */
export declare function bindDeferredUISurface<Params, Result>(ui: UIDefinition<Params, Result>, load: () => Promise<CompiledComponent<UISurfaceRenderContext<Params, Result>>>): BoundUISurface<Params, Result>;
/** @internal Eager components retain their caller-owned lifetime and cannot be evicted. */
export declare function eagerComponent<Props>(component: CompiledComponent<Props>): {
    component: CompiledComponent<Props>;
    acquirePrepared: () => Promise<PreparedComponentPin<Props>>;
    evictPrepared: () => boolean;
    inspectPrepared: () => PreparedComponentSnapshot;
};
/** @internal A failed preparation can be retried; concurrent consumers share work. */
export declare function deferredComponent<Props>(load: () => Promise<CompiledComponent<Props>>): {
    get(): CompiledComponent<Props>;
    prepare: () => Promise<void>;
    acquirePrepared(): Promise<PreparedComponentPin<Props>>;
    evictPrepared(): boolean;
    inspectPrepared(): PreparedComponentSnapshot;
    dispose(): void;
};
export declare function createUISurfaceRegistry(bindings: readonly AnyBoundUISurface[]): UISurfaceRegistry;
export {};
