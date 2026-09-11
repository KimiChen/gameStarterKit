import type { HostDriver, HostKind, HostMetrics, HostPlan, HostRecord, HostValue } from './host-plan.js';
import type { TabController } from '../navigation/tabs.js';
import type { UINavigationContext, UISurfaceRenderContext } from '../navigation/ui-surface.js';
export { componentRef } from './host-plan.js';
/** Generated component evaluators use this to read the last defined value from a StyleProp. */
export declare function resolveStyleValue(style: unknown, property: string): unknown;
export interface CompiledComponent<Props = Record<string, never>> {
    readonly plan: HostPlan;
    readonly evaluate: (props: Props, slots: HostValue[], environment: Record<string, unknown>) => void;
    readonly repeatEvaluators?: Readonly<Record<number, RepeatEvaluator>>;
    readonly components?: Readonly<Record<string, CompiledComponent<unknown>>>;
    /** @internal Development-only identity and compatibility metadata for HMR. */
    readonly hot?: HotComponentMetadata;
}
/** Development-only metadata emitted by the AOT compiler. */
export interface HotComponentMetadata {
    readonly familyId: string;
    readonly hookSignature: string;
    readonly structureHash: string;
    /** Pure components specialized into this compiled component. */
    readonly inlineFamilies?: readonly string[];
}
/** A prepared development update. Module loading happens before this reaches Core. */
export interface HotUpdateV1 {
    readonly version: 1;
    readonly revision: number;
    readonly changedFamilies: readonly string[];
    readonly components: readonly CompiledComponent<unknown>[];
}
export interface HotUpdateResult {
    readonly revision: number;
    readonly ignored: boolean;
    readonly patchedInstances: number;
    readonly remountedInstances: number;
    readonly deferredInstances: number;
    readonly createdNodes: number;
    readonly destroyedNodes: number;
}
export type RepeatEvaluator = (scopeItems: readonly unknown[], scopeIndices: readonly unknown[], slots: HostValue[], environment: Record<string, unknown>) => void;
export interface ComponentHandle<Props, NativeHandle = unknown> {
    readonly root: HostRecord<NativeHandle>;
    readonly metrics: Readonly<HostMetrics>;
    update(nextProps?: Props): void;
    batch(action: () => void): void;
    flushNow(): void;
    setSuspended(suspended: boolean): void;
    destroy(): void;
}
export type ActionArguments<Input> = [Input] extends [void] ? [] : [input: Input];
export type ActionExecutor<Input = void, Output = void> = (...arguments_: ActionArguments<Input>) => Output | PromiseLike<Output>;
export type ActionStatus = 'idle' | 'pending' | 'success' | 'error';
export interface ActionOptions<Input = void, Output = void> {
    readonly onSuccess?: (result: Output, input: Input) => void | PromiseLike<void>;
    readonly onError?: (error: unknown, input: Input) => void | PromiseLike<void>;
}
/** Stable, callable command handle owned by one compiled component instance. */
export interface Action<Input = void, Output = void> {
    (...arguments_: ActionArguments<Input>): void;
    readonly status: ActionStatus;
    readonly pending: boolean;
    readonly result: Output | undefined;
    readonly error: unknown;
    reset(): void;
}
export type ActionErrorHandler = (error: unknown) => void | PromiseLike<void>;
export interface RuntimeTabBinding {
    readonly controller: TabController<string>;
    sync(key: string): void;
}
export interface RuntimeTabsAdapter {
    activate(component: string, hookId: number, key: string): void | PromiseLike<void>;
    register?(component: string, hookId: number, binding: RuntimeTabBinding): void | (() => void);
    /** @internal The navigation adapter owns errors raised after activation starts. */
    readonly reportsActivationErrors?: boolean;
}
export interface ComponentRuntimeOptions {
    readonly onActionError?: ActionErrorHandler;
    readonly prepareModule?: import('./host-plan.js').ModulePreparer;
    /** @internal Navigation-backed TabGroup bridge supplied by SurfaceNavigator. */
    readonly tabs?: RuntimeTabsAdapter;
}
/** @internal Installed only by the development-only @uniflex/core/hmr entry. */
export declare function enableComponentHMR(): void;
export declare function defineCompiledComponent<Props>(plan: HostPlan, evaluate: CompiledComponent<Props>['evaluate'], repeatEvaluators?: Readonly<Record<number, RepeatEvaluator>>, components?: Readonly<Record<string, CompiledComponent<unknown>>>, hot?: HotComponentMetadata): CompiledComponent<Props>;
/**
 * Applies already-loaded development component modules to every mounted family instance.
 * The function is intentionally synchronous: callers must finish module preparation first.
 */
export declare function applyHotUpdate(update: HotUpdateV1): HotUpdateResult;
/** @internal A Game-root restart installs a complete, self-consistent component graph. */
export declare function resetHotDefinitionsForRootRestart(): () => void;
export declare function mountComponent<Props, NativeHandle>(component: CompiledComponent<Props>, driver: HostDriver<NativeHandle>, props: Props, runtimeOptions?: ComponentRuntimeOptions): ComponentHandle<Props, NativeHandle>;
export declare function useState<T>(hookId: number, initial: T | (() => T)): [T, (next: T | ((old: T) => T)) => void];
/** Stable local selection controller shared by Tabs, BottomNavigation and TabPanel. */
export declare function useTabs<Key extends string>(hookId: number, initialKey: Key, onSelectionChange?: (key: Key) => void): TabController<Key>;
/** Returns the owning Surface context without threading navigation callbacks through props. */
export declare function useSurfaceContext<Params = void, Result = void>(hookId: number): UISurfaceRenderContext<Params, Result>;
/** Returns navigation shared by View and Layer roots. */
export declare function useNavigationContext(hookId: number): UINavigationContext;
export declare function useRef<T>(hookId: number, initial: T): {
    current: T;
};
export declare function useAction<Input = void, Output = void>(hookId: number, execute: ActionExecutor<Input, Output>, options?: ActionOptions<Input, Output>): Action<Input, Output>;
export declare function useMemo<T>(hookId: number, factory: () => T, deps: readonly unknown[]): T;
export declare function useEffect(hookId: number, effect: () => void | (() => void), deps: readonly unknown[]): void;
export declare function useLayoutEffect(hookId: number, effect: () => void | (() => void), deps: readonly unknown[]): void;
export declare function batch(action: () => void): void;
export declare function Show<T>(when: T | null | undefined | false, render: (value: T) => void, fallback?: () => void): void;
export interface KeyedEntry<Key, Value, RecordValue> {
    readonly key: Key;
    value: Value;
    record: RecordValue;
}
/** Retained keyed reconciliation used by compiled For blocks. */
export declare class KeyedFor<Key, Value, RecordValue> {
    private readonly entries;
    private order;
    forEach(visit: (record: RecordValue) => void): void;
    dispose(disposeRecord: (record: RecordValue) => void): void;
    reconcile(values: readonly Value[], keyOf: (value: Value) => Key, create: (value: Value, index: number) => RecordValue, update: (record: RecordValue, value: Value, index: number) => void, destroy: (record: RecordValue) => void, recycleRemoved?: boolean): readonly KeyedEntry<Key, Value, RecordValue>[];
}
export declare function isHostKind(value: string): value is HostKind;
