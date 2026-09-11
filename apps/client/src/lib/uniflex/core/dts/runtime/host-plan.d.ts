import type { FlexStyle, LayoutRect } from '../layout/flex-types.js';
export { parseHostPlan } from './parse-host-plan.js';
export type { HostPlanContract } from './parse-host-plan.js';
export { HostFrameScheduler } from './host-frame-scheduler.js';
export { resolveInitialRender } from './initial-render.js';
import type { VirtualCollectionController, VirtualDirection } from '../virtual/virtual-collection.js';
import type { VirtualCollectionKey, VirtualListDataSource } from '../virtual/virtual-data-source.js';
export type { VirtualAlign, VirtualCollectionController, VirtualCollectionMetrics, VirtualDirection, VirtualRange, } from '../virtual/virtual-collection.js';
export type HostKind = 'view' | 'text' | 'input' | 'image' | 'scroll-view' | 'virtual-list';
export type HostInteraction = 'press' | 'range';
export type FloatingPlacement = 'auto' | 'top' | 'right' | 'bottom' | 'left';
export type FloatingAlign = 'auto' | 'start' | 'center' | 'end';
export interface FloatingBehavior {
    readonly anchor: 'child' | 'rect';
    readonly anchorIndex?: number;
    readonly panelIndex: number;
}
/** Static behavior selected by AOT. It never creates project-owned visual nodes. */
export interface HostBehavior {
    readonly interaction?: HostInteraction;
    readonly floating?: FloatingBehavior;
}
export type HostValue = string | number | boolean | null | undefined | object | ((...args: unknown[]) => unknown);
export interface SlotBinding {
    readonly slot: number;
    readonly property: string;
}
/** Build-time inferred feature/config/data/service requirements for one UI boundary. */
export interface UIModuleInfo {
    readonly feature: string | null;
    readonly features: readonly string[];
    readonly configKeys: readonly string[];
    readonly dataModules: readonly string[];
    readonly services: readonly string[];
}
export type HostPlanTabTarget = {
    readonly kind: 'view';
    readonly id: string;
} | {
    readonly kind: 'panel';
    readonly component: string;
};
/** Navigation targets owned by one useTabs hook in a retained Layer. */
export interface HostPlanTabTargetGroup {
    readonly targetZIndex: 'screen';
    readonly initialKey: string;
    readonly targets: Readonly<Record<string, HostPlanTabTarget>>;
}
export interface ModulePrepareSignal {
    readonly aborted: boolean;
    readonly reason: unknown;
    subscribe(listener: () => void): () => void;
}
export type ModulePreparer = (info: UIModuleInfo, signal?: ModulePrepareSignal) => void | PromiseLike<void>;
export interface HostPlanNode {
    readonly planId: number;
    readonly kind: HostKind;
    readonly props?: Readonly<Record<string, HostValue>>;
    readonly bindings?: readonly SlotBinding[];
    readonly children?: readonly RenderPlanNode[];
    readonly repeat?: RepeatPlan;
    readonly virtual?: VirtualRepeatPlan;
    readonly behavior?: HostBehavior;
    /** A Show boundary whose descendants are materialized on first visibility. */
    readonly lazy?: boolean;
    /** Dependencies prepared before a lazy boundary is first materialized. */
    readonly moduleInfo?: UIModuleInfo;
}
/** Logical component boundary. It never creates a native Host wrapper. */
export interface ComponentPlanNode {
    readonly planId: number;
    readonly kind: 'component';
    readonly component: string;
    readonly props?: Readonly<Record<string, HostValue>>;
    readonly bindings?: readonly SlotBinding[];
    /** AOT-only ComponentOutlet bridge: the slot contains the complete props object. */
    readonly propsSlot?: number;
    /** Shared plan shape only; validated component plans must omit this field. */
    readonly children?: readonly RenderPlanNode[];
    /** Shared plan shape only; validated component plans must omit this field. */
    readonly repeat?: RepeatPlan;
    /** Shared plan shape only; validated component plans must omit this field. */
    readonly virtual?: VirtualRepeatPlan;
    /** Shared plan shape only; validated component plans must omit this field. */
    readonly lazy?: boolean;
}
export type RenderPlanNode = HostPlanNode | ComponentPlanNode;
export interface RepeatPlan {
    readonly collectionSlot: number;
    readonly key: string;
    readonly itemSlotCount: number;
    readonly template: RenderPlanNode;
}
export interface VirtualRepeatPlan {
    readonly sourceSlot: number;
    readonly key: string;
    readonly itemSlotCount: number;
    readonly template: RenderPlanNode;
    readonly layout: 'list' | 'grid';
    readonly header?: VirtualHeaderPlan;
}
export interface VirtualHeaderPlan {
    readonly planId: number;
    readonly groupKey: string;
    readonly itemSlotCount: number;
    readonly template: RenderPlanNode;
}
export interface HostPlan {
    readonly version: 5;
    readonly name: string;
    readonly slotCount: number;
    readonly root: RenderPlanNode;
    /** Logical components reachable from this v5 root bundle. */
    readonly components?: Readonly<Record<string, HostPlan>>;
    /** Dependencies prepared before mounting this root component. */
    readonly moduleInfo?: UIModuleInfo;
    /** Per-useTabs hook dependencies keyed by hook id then tab key. */
    readonly tabModules?: Readonly<Record<number, Readonly<Record<string, UIModuleInfo>>>>;
    /** Optional navigation-backed TabGroup metadata keyed by useTabs hook id. */
    readonly tabTargets?: Readonly<Record<number, HostPlanTabTargetGroup>>;
    readonly sourceMap?: Readonly<Record<number, {
        line: number;
        column: number;
    }>>;
}
export interface HostRecord<Handle = unknown> {
    readonly recordId: number;
    readonly planId: number;
    readonly kind: HostKind;
    readonly behavior?: HostBehavior;
    readonly handle: Handle;
    parent: HostRecord<Handle> | null;
    readonly children: HostRecord<Handle>[];
    readonly props: Record<string, HostValue>;
}
export type HostCommand<Handle = unknown> = {
    readonly type: 'create';
    readonly record: HostRecord<Handle>;
} | {
    readonly type: 'update';
    readonly record: HostRecord<Handle>;
    readonly property: string;
    readonly value: HostValue;
} | {
    readonly type: 'insert';
    readonly parent: HostRecord<Handle> | null;
    readonly child: HostRecord<Handle>;
    readonly index: number;
} | {
    readonly type: 'move';
    readonly parent: HostRecord<Handle>;
    readonly child: HostRecord<Handle>;
    readonly index: number;
} | {
    readonly type: 'remove';
    readonly parent: HostRecord<Handle> | null;
    readonly child: HostRecord<Handle>;
} | {
    readonly type: 'destroy';
    readonly record: HostRecord<Handle>;
} | {
    readonly type: 'visibility';
    readonly record: HostRecord<Handle>;
    readonly visible: boolean;
};
export interface HostMetrics {
    commits: number;
    commands: number;
    nodesCreated: number;
    nodesDestroyed: number;
    componentUpdates: number;
}
export interface HostDriver<Handle = unknown> {
    /** Allocate logical handles only; materialize native nodes within the host transaction. */
    allocateTemplate?(plan: HostPlan, root: HostPlanNode): HostTemplateAllocation<Handle>;
    /** Prepared native changes remain reversible until every owner has committed. */
    prepareCommit?(commands: readonly HostCommand<Handle>[]): PreparedHostCommit;
    create(kind: HostKind, planId: number, behavior?: HostBehavior): Handle;
    validate(commands: readonly HostCommand<Handle>[]): void;
    commit(commands: readonly HostCommand<Handle>[]): void;
    scheduleFlush(callback: () => void): void;
    scheduleDelayed(callback: () => void, delayMs: number): () => void;
    startEntrance(record: HostRecord<Handle>, options: EntranceOptions, complete: () => void): () => void;
    flushLayout(): void;
    flushVirtualLayout?(record: HostRecord<Handle>): void;
    readVirtualViewport?(record: HostRecord<Handle>, direction: VirtualDirection): {
        readonly offset: number;
        readonly mainSize: number;
        readonly crossSize: number;
        readonly scrolling: boolean;
    };
    scrollVirtualTo?(record: HostRecord<Handle>, direction: VirtualDirection, offset: number, duration: number): void;
    stopVirtualScroll?(record: HostRecord<Handle>): void;
}
export interface HostTemplateAllocation<Handle> {
    create(planId: number): Handle;
}
export interface PreparedHostCommit {
    commit(): void;
    rollback(): void;
    /** Release obsolete resources after the complete transaction succeeds. Must not throw. */
    finalize(): void;
}
export interface EntranceOptions {
    readonly direction: VirtualDirection;
    readonly durationMs: number;
    readonly offset: number;
}
export interface InitialRenderOptions {
    intervalMs?: number;
    animation?: boolean;
    durationMs?: number;
    offset?: number;
}
export interface BaseViewProps {
    children?: unknown;
    name?: string;
    style?: FlexStyle;
    backgroundColor?: string;
    opacity?: number;
    visible?: boolean;
    scale?: number;
    translateX?: number;
    translateY?: number;
    transformDurationMs?: number;
}
export interface PlainViewProps extends BaseViewProps {
    interaction?: undefined;
}
export interface PressViewProps extends BaseViewProps {
    interaction: 'press';
    interactable?: boolean;
    accessibilityLabel?: string;
    onPressChange?: (pressed: boolean) => void;
    onClick?: () => void;
}
export interface RangeViewProps extends BaseViewProps {
    interaction: 'range';
    value: number;
    min?: number;
    max?: number;
    step?: number;
    interactable?: boolean;
    accessibilityLabel?: string;
    onChange?: (value: number) => void;
    onCommit?: (value: number) => void;
}
export type ViewProps = PlainViewProps | PressViewProps | RangeViewProps;
export interface TextProps extends BaseViewProps {
    value?: string;
    fontSize?: number;
    lineHeight?: number;
    color?: string;
    bold?: boolean;
    font?: import('../provider/resource-provider.js').FontRef;
    outlineColor?: string;
    outlineWidth?: number;
    horizontalAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'center' | 'bottom';
    wrap?: boolean;
    overflow?: 'none' | 'resizeHeight' | 'clamp' | 'shrink';
    cacheMode?: 'none' | 'bitmap' | 'char';
}
export interface ImageProps extends BaseViewProps {
    source: import('../provider/resource-provider.js').ImageRef;
    tint?: string;
    sizeMode?: 'simple' | 'sliced' | 'filled';
    intrinsic?: 'original' | 'trimmed';
}
/** Single-line controlled editor. Keep draft state separate from server state. */
export interface InputProps extends BaseViewProps {
    value?: string;
    placeholder?: string;
    password?: boolean;
    maxLength?: number;
    fontSize?: number;
    color?: string;
    inputMode?: 'text' | 'numeric' | 'decimal';
    textAlign?: 'left' | 'center' | 'right';
    interactable?: boolean;
    focused?: boolean;
    onInput?: (value: string) => void;
    onSubmit?: () => void;
    onCommit?: (value: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
}
export interface ScrollViewProps extends BaseViewProps {
    /** A changed value scrolls to this leading-edge offset after layout. */
    scrollOffset?: number;
    direction?: VirtualDirection;
    inertia?: boolean;
    elastic?: boolean;
    brake?: number;
    /** Changing this value resets the retained offset before the next layout. */
    resetKey?: string | number;
}
export interface FloatingProps extends BaseViewProps {
    open: boolean;
    anchorRect?: LayoutRect;
    placement?: FloatingPlacement;
    align?: FloatingAlign;
    gap?: number;
    viewportPadding?: number;
    onOpenChange?: (open: boolean) => void;
}
export interface FloatingPlacementResult extends LayoutRect {
    readonly placement: Exclude<FloatingPlacement, 'auto'>;
    readonly align: Exclude<FloatingAlign, 'auto'>;
}
/** Shared range arithmetic keeps pointer, keyboard and Cocos input identical. */
export declare function normalizeRangeValue(value: number, min?: number, max?: number, step?: number): number;
export interface FloatingPlacementOptions {
    readonly placement?: FloatingPlacement;
    readonly align?: FloatingAlign;
    readonly gap?: number;
    readonly viewportPadding?: number;
}
/** Places a floating panel in shared stage coordinates without DOM/native measurements. */
export declare function placeFloating(anchor: LayoutRect, panel: Pick<LayoutRect, 'width' | 'height'>, viewport: Pick<LayoutRect, 'width' | 'height'>, options?: FloatingPlacementOptions): FloatingPlacementResult;
export interface VirtualCommonProps<T, Key extends VirtualCollectionKey = VirtualCollectionKey> extends BaseViewProps {
    /** First nonempty window only. Defaults to one item every 32ms with entrance animation. */
    initialRender?: false | InitialRenderOptions;
    source: VirtualListDataSource<T>;
    key: keyof T;
    direction?: VirtualDirection;
    gap?: number;
    overscan?: number;
    inertia?: boolean;
    elastic?: boolean;
    brake?: number;
    groupKey?: keyof T;
    headerSize?: number;
    estimatedHeaderSize?: number;
    renderHeader?: (group: unknown, firstItem: T) => unknown;
    controller?: {
        current: VirtualCollectionController<Key> | null;
    } | ((controller: VirtualCollectionController<Key>) => void);
    children: (item: T, index: number) => unknown;
}
export type VirtualListProps<T> = VirtualCommonProps<T> & ({
    layout?: 'list';
    itemSize?: number;
    estimatedItemSize?: number;
    sizeKey?: keyof T;
    mode?: never;
    lanes?: never;
    minLaneSize?: never;
    crossGap?: never;
} | {
    layout: 'grid';
    mode?: 'regular' | 'masonry';
    lanes?: number;
    minLaneSize?: number;
    itemSize?: number;
    estimatedItemSize?: number;
    /** Exact cell main-axis extent; prevents scroll-path-dependent measurements. */
    sizeKey?: keyof T;
    crossGap?: number;
});
declare const componentPropsBrand: unique symbol;
/** Stable AOT component reference. The explicit registry ID remains build-local. */
export interface ComponentRef<Props> {
    readonly id: string;
    readonly [componentPropsBrand]?: Props;
}
export type ComponentDefinition<Props> = ComponentRef<Props> & ((props: Omit<Props, 'children'> & {
    children?: Props extends {
        children?: infer Children;
    } ? Children : unknown;
}) => never);
export interface ComponentSelection<Props = Record<string, unknown>> {
    readonly component: ComponentRef<Props>;
    readonly props: Props;
}
export interface ComponentRegistry<Entries extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> {
    readonly entries: Entries;
}
export declare function componentRef<Props>(id: string): ComponentRef<Props>;
export interface JSXIntrinsicElements {
    view: ViewProps;
    text: TextProps;
    input: InputProps;
    image: ImageProps;
    'scroll-view': ScrollViewProps;
    'virtual-list': VirtualListProps<unknown>;
}
