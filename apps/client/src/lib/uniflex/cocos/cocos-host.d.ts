import type { LayoutWorkTotals } from '../core/provider.js';
import { Asset, Button, EditBox, EventMouse, EventTouch, Label, Node, ScrollView, Sprite, UIRenderer, UITransform, UIOpacity } from 'cc';
import type { EntranceOptions, HostBehavior } from '../core/host-plan.js';
import type { ResourceResolver, HostScrollSnapshot } from '../core/provider.js';
import type { SurfaceActivity, SurfacePresentationOptions, SurfaceTransitionState } from '../core/provider.js';
import { NestedScrollCoordinator } from '../core/nested-scroll.js';
import type { NestedScrollTarget } from '../core/nested-scroll.js';
import type { FlexNode, MeasuredSize } from '../core/flex-types.js';
import type { HostCommand, HostDriver, HostKind, HostRecord, HostValue } from '../core/host-plan.js';
interface CoordinatedScrollInput {
    readonly coordinator: NestedScrollCoordinator;
    readonly target: NestedScrollTarget;
    readonly interruptInitial: () => void;
}
/**
 * Keeps Cocos ScrollView as both the viewport adapter and physics owner. The
 * nested coordinator only locks the axis and routes deltas to the right native
 * ScrollView in the chain.
 */
declare class CoordinatedScrollView extends ScrollView {
    private nestedInput;
    private activeTouchId;
    coordinateWith(input: CoordinatedScrollInput): void;
    beginCoordinatedDrag(): void;
    applyCoordinatedDelta(delta: number, direction: 'vertical' | 'horizontal'): number;
    releaseCoordinatedDrag(): void;
    discardCoordinatedDrag(): void;
    private finishCoordinatedDrag;
    protected _onTouchBegan(event: EventTouch, captureListeners?: Node[]): void;
    protected _onTouchMoved(event: EventTouch, captureListeners?: Node[]): void;
    protected _onTouchEnded(event: EventTouch, captureListeners?: Node[]): void;
    protected _onTouchCancelled(event: EventTouch, captureListeners?: Node[]): void;
    protected _onMouseWheel(event: EventMouse, captureListeners?: Node[]): void;
}
export interface CocosHandle {
    readonly node: Node;
    readonly transform: UITransform;
    readonly flex: FlexNode;
    readonly lastRect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    label?: Label;
    sprite?: Sprite;
    button?: Button;
    editBox?: EditBox;
    inputDisplay?: Label;
    inputEditing?: boolean;
    controlProps?: Record<string, HostValue>;
    presentationProps?: Record<string, HostValue>;
    pressed?: boolean;
    rangeValue?: number;
    plainScroll?: boolean;
    pendingScrollOffset?: number;
    scrollEnabled?: boolean;
    floatingBlocker?: Node;
    floatingOrder?: number;
    opacity?: UIOpacity;
    baseOpacity?: number;
    entrance?: {
        x: number;
        y: number;
        opacity: number;
    };
    click?: () => void;
    overflowExplicit?: boolean;
    measureKey?: string;
    measured?: MeasuredSize;
    imageIntrinsic?: 'original' | 'trimmed';
    virtualContent?: {
        readonly node: Node;
        readonly transform: UITransform;
    };
    scrollView?: CoordinatedScrollView;
    virtualDirection?: 'vertical' | 'horizontal';
    virtualContentMainSize?: number;
    virtualRefresh?: () => void;
    scrollChanged?: () => void;
    scrollPositionChanged?: () => void;
    lastScrollPositionX?: number;
    lastScrollPositionY?: number;
    virtualParked?: boolean;
    parkedRenderers?: UIRenderer[];
    nestedTarget?: NestedScrollTarget;
    virtualScopePath?: string;
    lastVirtualViewportMain?: number;
    lastVirtualViewportCross?: number;
    visible: boolean;
    textProps?: Record<string, HostValue>;
}
export interface CocosLayoutMetrics {
    work?: Readonly<LayoutWorkTotals>;
    dirtyRoots: number;
    measuredLeaves: number;
    percentageFallbacks: number;
    layoutPasses: number;
    layoutMs: number;
    writebackMs: number;
}
export declare class CocosHostDriver implements HostDriver<CocosHandle> {
    private readonly container;
    private readonly assets;
    private readonly anchorsChanged;
    private readonly scrollChanged;
    private readonly logFirstLayout;
    readonly metrics: CocosLayoutMetrics;
    private readonly layoutProfiler?;
    private readonly records;
    private readonly nativeOwners;
    private readonly childOrder;
    private readonly created;
    private readonly flatCommands;
    private readonly fillFrame;
    private root;
    private scheduled;
    private readonly pendingCallbacks;
    private layoutDirty;
    private readonly nestedScroll;
    private firstLayoutLogged;
    private floatingSequence;
    private surfaceActivity;
    private cancelSurfaceTransition?;
    private readonly presentation;
    constructor(container: Node, assets: ResourceResolver<Asset>, anchorsChanged?: () => void, scrollChanged?: ((scroll: HostScrollSnapshot) => void) | undefined, logFirstLayout?: boolean, profileLayout?: boolean);
    create(kind: HostKind, planId: number, behavior?: HostBehavior): CocosHandle;
    validate(commands: readonly HostCommand<CocosHandle>[]): void;
    inspect(): import("../core/provider.js").InspectedNode[];
    present(activity: SurfaceActivity, order: number, options: SurfacePresentationOptions, transitionState: SurfaceTransitionState): void | Promise<void>;
    private fadeSurface;
    setSnapshotCovered(covered: boolean): void;
    get surfaceNode(): Node | undefined;
    commit(commands: readonly HostCommand<CocosHandle>[]): void;
    scheduleFlush(callback: () => void): void;
    private readonly flushPending;
    scheduleDelayed(callback: () => void, delayMs: number): () => void;
    startEntrance(record: HostRecord<CocosHandle>, options: EntranceOptions, complete: () => void): () => void;
    private writePresentation;
    flushLayout(): void;
    private layoutFloatingPanels;
    flushVirtualLayout(record: HostRecord<CocosHandle>): void;
    findAnchor(name: string): {
        width: number;
        height: number;
        x: number;
        y: number;
    } | undefined;
    private isRecordVisible;
    readVirtualViewport(record: HostRecord<CocosHandle>, direction: 'vertical' | 'horizontal'): {
        offset: number;
        mainSize: number;
        crossSize: number;
        scrolling: boolean;
    };
    private notifyScroll;
    scrollVirtualTo(record: HostRecord<CocosHandle>, direction: 'vertical' | 'horizontal', offset: number, duration: number): void;
    stopVirtualScroll(record: HostRecord<CocosHandle>): void;
    destroy(): void;
    private applyCommand;
    private queueChildParentChange;
    private applyProperty;
    private applyLabelAppearance;
    private ensureSprite;
    private configureNestedScroll;
    private interruptInitial;
    private getNestedTarget;
    private setClick;
    private measureText;
    private measureImage;
    private writeRecord;
    private writeEditBox;
    private writePlainScroll;
    private writeFloating;
    private floatingPanel;
    private floatingAnchorRecord;
    private floatingAnchorRect;
    private topFloating;
    private refreshFloatings;
    private ensureFloatingBlocker;
    private globalRect;
    private hideDetachedDescendants;
    private writeLabel;
    private writeVirtualChildren;
    private setVirtualParked;
    private readonly onContainerSizeChanged;
    private readonly onNestedScrollFrame;
}
export {};
