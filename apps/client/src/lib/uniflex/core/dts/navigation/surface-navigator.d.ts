import type { UIProvider } from '../provider/ui-provider.js';
import type { ActionErrorHandler, ComponentRuntimeOptions } from '../runtime/runtime.js';
import { type ExclusiveScopeGroup as LegacyExclusiveScopeGroup, type NavigationSnapshot, type NavigatorClock, type RouteContract, type ScopeOptions, type StackNavigator as LegacyStackNavigator, type SurfaceCloseOutcome, type SurfaceRef } from './navigator.js';
import type { ViewZIndex } from './semantic-z-index.js';
import type { BoundUILayer } from './ui-layer.js';
import type { UIDefinition, UIParams, UIResult, UISurfaceRegistry } from './ui-surface.js';
type DynamicRoutes = Record<string, RouteContract<unknown, unknown>>;
export interface SurfaceNavigatorOptions {
    readonly clock?: NavigatorClock;
    readonly onRootBack?: () => void;
    readonly layers?: readonly BoundUILayer[];
    readonly onActionError?: ActionErrorHandler;
    readonly prepareModule?: ComponentRuntimeOptions['prepareModule'];
    /** Called only when a prepared goto is about to commit. */
    readonly onGoto?: (targetZIndex: ViewZIndex) => void | PromiseLike<void>;
    /** Return true after consuming back, for example by settling a Confirm. */
    readonly onBack?: () => boolean | PromiseLike<boolean>;
}
export interface UIRetentionBudget {
    /** Prepared bindings without a mounted instance. This is a count, not a byte budget. */
    readonly maxIdleTemplates: number;
    readonly maxUnusedResourceContexts?: number;
}
type NavigationArguments<Params> = [Params] extends [void] ? [params?: Params] : [params: Params];
export declare class SurfaceStackNavigator {
    protected owner: SurfaceNavigator;
    /** @internal */ protected readonly stack: LegacyStackNavigator<DynamicRoutes>;
    /** @internal */
    constructor(owner: SurfaceNavigator, 
    /** @internal */ stack: LegacyStackNavigator<DynamicRoutes>);
    open<Params, Result>(ui: UIDefinition<Params, Result>, ...arguments_: NavigationArguments<Params>): SurfaceRef<Result>;
    goto<Params, Result>(ui: UIDefinition<Params, Result>, ...arguments_: NavigationArguments<Params>): SurfaceRef<Result>;
    back(): Promise<boolean>;
    close(instanceId: string): Promise<boolean>;
    popTo(instanceId: string): Promise<boolean>;
    evict(instanceId: string): Promise<boolean>;
}
export declare class SurfaceExclusiveScopeGroup {
    private readonly owner;
    private readonly group;
    private readonly scopes;
    /** @internal */
    constructor(owner: SurfaceNavigator, group: LegacyExclusiveScopeGroup<DynamicRoutes>);
    get activeKey(): string | undefined;
    scope(key: string, options?: ScopeOptions): SurfaceStackNavigator;
    activate(key: string): Promise<void>;
    evict(key: string): Promise<boolean>;
    destroy(): Promise<void>;
}
export declare class SurfaceNavigator extends SurfaceStackNavigator {
    private readonly provider;
    private readonly bindings;
    private readonly routeGroups;
    private readonly tabGroups;
    private readonly mountedLayers;
    private readonly clearingGroups;
    private readonly reportedErrors;
    private readonly legacy;
    private readonly runtimeOptions;
    private readonly options;
    private unsubscribe?;
    private screenIntentVersion;
    private screenIntentGroup?;
    private destroyed;
    private useSequence;
    private readonly lastUse;
    /** @internal */
    constructor(provider: UIProvider, registry: UISurfaceRegistry, options?: SurfaceNavigatorOptions);
    back(): Promise<boolean>;
    createExclusiveScopeGroup(id: string, anchor: {
        readonly id: string;
    }): SurfaceExclusiveScopeGroup;
    getSnapshot(): NavigationSnapshot;
    subscribe(listener: () => void): () => void;
    inspectRetention(): {
        instances: readonly import("./navigator.js").NavigationEntrySnapshot[];
        layers: string[];
        templates: {
            state?: "disposed" | "empty" | "preparing" | "ready" | undefined;
            pins?: number | undefined;
            id: string;
            lastUse: number;
        }[];
        resources: import("../index.js").ResourceRetentionSnapshot | undefined;
    };
    /** Explicitly discard inactive instances; reopening reconstructs their local UI state. */
    trimParked(maxInstances: number): Promise<readonly string[]>;
    /** Explicit memory-pressure trim. Parked instances remain governed by navigation retention. */
    trim(budget: UIRetentionBudget): {
        readonly evictedTemplates: readonly string[];
    };
    private preparedBindings;
    private withPrepared;
    destroy(): void;
    /** @internal */
    openOn<Params, Result>(stack: LegacyStackNavigator<DynamicRoutes>, ui: UIDefinition<Params, Result>, params: Params, mode: 'open' | 'goto'): SurfaceRef<Result>;
    private beforePresent;
    private activateTab;
    private navigateGroup;
    private finishGroupNavigation;
    private registerTabs;
    private navigationChanged;
    private mountLayer;
    private unmountLayer;
    private mountSurface;
    private mountPanel;
    private prepareAndMount;
    private failPreparation;
    private reportNavigationError;
    private mountPreparedSurface;
    private scopedRuntime;
    private navigationContext;
}
export declare function createSurfaceNavigator(provider: UIProvider, registry: UISurfaceRegistry, options?: SurfaceNavigatorOptions): SurfaceNavigator;
export type SurfaceParams<UI> = UIParams<UI>;
export type SurfaceResult<UI> = UIResult<UI>;
export type SurfaceClosed<Result> = SurfaceCloseOutcome<Result>;
export {};
