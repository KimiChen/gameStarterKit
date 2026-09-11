import type { SurfaceActivity, SurfacePresentationOptions, SurfaceTransitionState, SurfaceToken, UIProvider } from '../provider/ui-provider.js';
import { type LayerZIndex, type ViewZIndex } from './semantic-z-index.js';
export type RouteContract<Params = void, Result = void> = {
    readonly params: Params;
    readonly result: Result;
};
type RouteConstraint<Routes> = {
    readonly [Key in keyof Routes]: RouteContract<unknown, unknown>;
};
export type RouteParams<Contract> = Contract extends RouteContract<infer Params, unknown> ? Params : never;
export type RouteResult<Contract> = Contract extends RouteContract<unknown, infer Result> ? Result : never;
export type NavigationAction = 'push' | 'replace' | 'reset' | 'goto';
export type SurfaceCloseReason = 'back' | 'closed' | 'replaced' | 'reset' | 'popTo' | 'evicted' | 'timeout' | 'destroyed' | 'failed';
export type SurfaceCloseOutcome<Result> = {
    readonly status: 'completed';
    readonly value: Result;
} | {
    readonly status: 'cancelled';
    readonly reason: SurfaceCloseReason;
};
export interface SurfaceMount {
    readonly surface: SurfaceToken;
    setActivity?(activity: SurfaceActivity): void;
    destroy(): void;
}
export interface SurfaceRef<Result> {
    readonly id: string;
    readonly route: string;
    readonly ready: Promise<void>;
    readonly closed: Promise<SurfaceCloseOutcome<Result>>;
    close(...value: [Result] extends [void] ? [value?: Result] : [value: Result]): Promise<boolean>;
}
export interface RoutePresentation extends SurfacePresentationOptions {
}
export interface RouteRetention {
    readonly covered?: 'retain' | 'destroy';
    readonly inactiveTtlMs?: number;
}
export type RouteLaunchMode = 'singleTop' | 'multiple' | 'singleInstance';
export interface RouteContext<Routes extends RouteConstraint<Routes>, Key extends Extract<keyof Routes, string>> {
    readonly navigator: Navigator<Routes>;
    readonly scope: StackNavigator<Routes>;
    readonly id: string;
    readonly route: Key;
    readonly params: RouteParams<Routes[Key]>;
    readonly signal: NavigationSignal;
    back(): void;
    complete(value: RouteResult<Routes[Key]>): void;
}
export interface NavigationSignal {
    readonly aborted: boolean;
    readonly reason: unknown;
    subscribe(listener: () => void): () => void;
}
export interface RouteDefinition<Routes extends RouteConstraint<Routes>, Key extends Extract<keyof Routes, string>> {
    readonly zIndex?: ViewZIndex;
    /** @internal Navigation-backed TabGroup membership. */
    readonly navigationGroup?: {
        readonly id: string;
        readonly key: string;
    };
    readonly create: (context: RouteContext<Routes, Key>) => SurfaceMount | PromiseLike<SurfaceMount>;
    readonly presentation?: Partial<RoutePresentation>;
    readonly retention?: RouteRetention;
    readonly launchMode?: RouteLaunchMode;
    readonly instanceKey?: (params: RouteParams<Routes[Key]>) => string;
}
export type RouteRegistry<Routes extends RouteConstraint<Routes>> = {
    readonly [Key in Extract<keyof Routes, string>]: RouteDefinition<Routes, Key>;
};
export interface NavigatorClock {
    now(): number;
    schedule(callback: () => void, delayMs: number): () => void;
}
export interface NavigatorOptions {
    readonly clock?: NavigatorClock;
    readonly onRootBack?: () => void;
    /** @internal Runs after a target mounts and before the compositor commit. */
    readonly beforePresent?: (route: string, action: NavigationAction) => void | PromiseLike<void>;
}
export interface SemanticLayerMount {
    readonly id: string;
    readonly mount: SurfaceMount;
    readonly zIndex: LayerZIndex;
    readonly ownerGroup?: string;
}
export interface OpenOptions {
    readonly action?: NavigationAction;
}
export interface ScopeOptions {
    readonly inactiveTtlMs?: number;
}
export interface NavigationEntrySnapshot {
    readonly id: string;
    readonly route: string;
    readonly scope: string;
    readonly state: 'preparing' | 'mounted' | 'closing';
    readonly activity: SurfaceActivity;
    readonly transitionState: SurfaceTransitionState;
}
export interface NavigationSnapshot {
    readonly entries: readonly NavigationEntrySnapshot[];
    readonly activeGroups: Readonly<Record<string, string | undefined>>;
}
interface Deferred<Value> {
    readonly promise: Promise<Value>;
    resolve(value: Value): void;
    reject(error: unknown): void;
}
export declare class NavigationCancelledError extends Error {
    readonly reason: SurfaceCloseReason;
    constructor(reason: SurfaceCloseReason);
}
interface Entry<Routes extends RouteConstraint<Routes>> {
    readonly id: string;
    readonly route: Extract<keyof Routes, string>;
    readonly params: unknown;
    readonly key: string;
    readonly definition: RouteDefinition<Routes, Extract<keyof Routes, string>>;
    readonly scope: StackNavigator<Routes>;
    readonly abort: NavigationCancellation;
    readonly ready: Deferred<void>;
    readonly closed: Deferred<SurfaceCloseOutcome<unknown>>;
    action: NavigationAction;
    ref?: SurfaceRef<unknown>;
    mount?: SurfaceMount;
    state: 'preparing' | 'mounted' | 'closing';
    activity: SurfaceActivity;
    transitionState: SurfaceTransitionState;
    cancelled?: SurfaceCloseReason;
    cancelEviction?: () => void;
    inactiveSince?: number;
    activationRequests: number;
}
declare class NavigationCancellation implements NavigationSignal {
    aborted: boolean;
    reason: unknown;
    private readonly listeners;
    subscribe(listener: () => void): () => void;
    abort(reason?: unknown): void;
}
interface Branch<Routes extends RouteConstraint<Routes>> {
    readonly key: string;
    readonly navigator: StackNavigator<Routes>;
    readonly ttlMs?: number;
    inactiveSince?: number;
    cancelEviction?: () => void;
}
export declare class StackNavigator<Routes extends RouteConstraint<Routes>> {
    protected readonly kernel: NavigationKernel<Routes>;
    readonly id: string;
    /** @internal */ readonly parentGroup?: ExclusiveScopeGroup<Routes> | undefined;
    /** @internal */ readonly entries: Entry<Routes>[];
    /** @internal */ readonly pending: Set<Entry<Routes>>;
    /** @internal */
    constructor(kernel: NavigationKernel<Routes>, id: string, 
    /** @internal */ parentGroup?: ExclusiveScopeGroup<Routes> | undefined);
    open<Key extends Extract<keyof Routes, string>>(route: Key, params: RouteParams<Routes[Key]>, options?: OpenOptions): SurfaceRef<RouteResult<Routes[Key]>>;
    goto<Key extends Extract<keyof Routes, string>>(route: Key, params: RouteParams<Routes[Key]>): SurfaceRef<RouteResult<Routes[Key]>>;
    back(): Promise<boolean>;
    close(instanceId: string): Promise<boolean>;
    popTo(instanceId: string): Promise<boolean>;
    evict(instanceId: string): Promise<boolean>;
}
export declare class ExclusiveScopeGroup<Routes extends RouteConstraint<Routes>> {
    #private;
    private readonly kernel;
    readonly id: string;
    readonly anchorId: string;
    /** @internal */
    constructor(kernel: NavigationKernel<Routes>, id: string, anchorId: string);
    get activeKey(): string | undefined;
    scope(key: string, options?: ScopeOptions): StackNavigator<Routes>;
    activate(key: string): Promise<void>;
    evict(key: string): Promise<boolean>;
    /** @internal */
    activeBranch(): Branch<Routes> | undefined;
    /** @internal */
    branches(): readonly Branch<Routes>[];
    /** @internal */
    destroy(reason: SurfaceCloseReason): Promise<void>;
    /** @internal */
    disposeNow(): void;
    private park;
}
export declare class Navigator<Routes extends RouteConstraint<Routes>> extends StackNavigator<Routes> {
    constructor(kernel: NavigationKernel<Routes>);
    createExclusiveScopeGroup(id: string, anchor: {
        readonly id: string;
    }): ExclusiveScopeGroup<Routes>;
    back(): Promise<boolean>;
    getSnapshot(): NavigationSnapshot;
    subscribe(listener: () => void): () => void;
    /** Explicit count budget; protected parked instances may remain above it. */
    trimParked(maxInstances: number): Promise<readonly string[]>;
    /** @internal Attaches one retained semantic Layer without exposing provider ordering. */
    attachLayer(layer: SemanticLayerMount): () => Promise<void>;
    /** @internal Destroys retained targets after their navigation-owned group is no longer active. */
    clearNavigationGroup(groupId: string, canClear?: () => boolean): Promise<boolean>;
    /** @internal Supersedes uncommitted targets without touching retained group entries. */
    cancelPendingNavigationGroup(groupId: string, exceptRoute: string): void;
    destroy(): void;
}
declare class NavigationKernel<Routes extends RouteConstraint<Routes>> {
    private readonly provider;
    private readonly registry;
    private readonly options;
    readonly clock: NavigatorClock;
    private root?;
    private readonly scopes;
    private readonly groups;
    private readonly groupsByAnchor;
    private readonly listeners;
    private readonly layers;
    private sequence;
    private destroyed;
    private operation;
    constructor(provider: UIProvider, registry: RouteRegistry<Routes>, options: NavigatorOptions);
    attachRoot(root: Navigator<Routes>): void;
    createChildScope(id: string, parentGroup: ExclusiveScopeGroup<Routes>): StackNavigator<Routes>;
    createGroup(id: string, anchorId: string): ExclusiveScopeGroup<Routes>;
    removeGroup(group: ExclusiveScopeGroup<Routes>): void;
    attachLayer(layer: SemanticLayerMount): () => Promise<void>;
    open<Key extends Extract<keyof Routes, string>>(scope: StackNavigator<Routes>, route: Key, params: RouteParams<Routes[Key]>, options: OpenOptions): SurfaceRef<RouteResult<Routes[Key]>>;
    private findLaunchMatch;
    private protectActivation;
    private focus;
    private gotoExisting;
    private refWithActivation;
    private commitOpen;
    private failOpen;
    closeEntry(entry: Entry<Routes>, reason: SurfaceCloseReason, value?: unknown, completed?: boolean, canClose?: () => boolean): Promise<boolean>;
    popTo(scope: StackNavigator<Routes>, instanceId: string): Promise<boolean>;
    clearScope(scope: StackNavigator<Routes>, reason: SurfaceCloseReason, refresh?: boolean): Promise<void>;
    clearNavigationGroup(groupId: string, canClear: () => boolean): Promise<boolean>;
    cancelPendingNavigationGroup(groupId: string, exceptRoute: string): void;
    private destroyEntry;
    private finishCancelled;
    findInScope(scope: StackNavigator<Routes>, id: string): Entry<Routes> | undefined;
    private find;
    private animateExit;
    refreshPresentation(): Promise<void>;
    private flatten;
    private presentation;
    private isGroupSibling;
    private activeScreen;
    trimParked(maxInstances: number): Promise<readonly string[]>;
    private parkedEntries;
    private canTrimParked;
    private updateEntryEviction;
    back(): Promise<boolean>;
    private backEntry;
    snapshot(): NavigationSnapshot;
    subscribe(listener: () => void): () => void;
    notify(): void;
    destroy(): void;
    perform<Value>(operation: () => Value | PromiseLike<Value>): Promise<Value>;
    private enqueue;
}
export declare function createNavigator<Routes extends RouteConstraint<Routes>>(provider: UIProvider, registry: RouteRegistry<Routes>, options?: NavigatorOptions): Navigator<Routes>;
export {};
