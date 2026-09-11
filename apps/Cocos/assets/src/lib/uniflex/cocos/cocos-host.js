import { LayoutProfiler } from './layout-profiler.js';
import { NativeChildOrderBatch } from './native-child-order.js';
import { Button, EditBox, Color, director, Director, EventTouch, HorizontalTextAlignment, Label, Mask, Node, ScrollView, Sprite, SpriteFrame, Size, Texture2D, UIRenderer, UITransform, UIOpacity, Vec2, Vec3, VerticalTextAlignment, view, screen, tween, Tween, } from 'cc';
import { HostFrameScheduler, normalizeRangeValue, placeFloating } from '../core/host-plan.js';
import { layoutText, inspectRecord } from '../core/provider.js';
import { NestedScrollCoordinator } from '../core/nested-scroll.js';
import { createFlexNode } from '../core/flex-types.js';
import { layoutFlexTree, layoutFlexTreeIntrinsic, layoutScrollContent, measureScrollContent, } from '../core/flex-layout.js';
/**
 * Keeps Cocos ScrollView as both the viewport adapter and physics owner. The
 * nested coordinator only locks the axis and routes deltas to the right native
 * ScrollView in the chain.
 */
class CoordinatedScrollView extends ScrollView {
    constructor() {
        super(...arguments);
        this.nestedInput = null;
        this.activeTouchId = null;
    }
    coordinateWith(input) {
        this.nestedInput = input;
        // Keep the engine defaults for the terminal target. Only an inner
        // same-axis target clamps at its edge so residual movement can hand off.
        this.elastic = !hasSameDirectionAncestor(input.target);
    }
    beginCoordinatedDrag() {
        this._handlePressLogic();
    }
    applyCoordinatedDelta(delta, direction) {
        const content = this.content;
        if (!content || Math.abs(delta) < 0.0001)
            return 0;
        const before = direction === 'horizontal' ? content.position.x : content.position.y;
        const movement = direction === 'horizontal' ? new Vec3(-delta, 0, 0) : new Vec3(0, delta, 0);
        const boundary = this._getHowMuchOutOfBoundary();
        const noise = Math.max(Math.abs(boundary.x), Math.abs(boundary.y));
        const elastic = this.elastic;
        // Fractional viewport arithmetic can report 1e-12px outside an edge.
        // Do not let native elastic resistance halve an inward first delta.
        if (noise > 0 && noise < 0.01 && Vec3.dot(boundary, movement) > 0)
            this.elastic = false;
        try {
            this._processDeltaMove(movement);
        }
        finally {
            this.elastic = elastic;
        }
        const moved = (direction === 'horizontal' ? content.position.x : content.position.y) - before;
        return direction === 'horizontal' ? -moved : moved;
    }
    releaseCoordinatedDrag() {
        this.finishCoordinatedDrag(true);
    }
    discardCoordinatedDrag() {
        this.finishCoordinatedDrag(false);
    }
    finishCoordinatedDrag(startNativeInertia) {
        if (startNativeInertia)
            this._processInertiaScroll();
        else
            this._onScrollBarTouchEnded();
        if (!this._scrolling)
            return;
        this._scrolling = false;
        if (!this._autoScrolling)
            this._dispatchEvent(ScrollView.EventType.SCROLL_ENDED);
    }
    _onTouchBegan(event, captureListeners) {
        const input = this.nestedInput;
        if (!input) {
            super._onTouchBegan(event, captureListeners);
            return;
        }
        if (!this.enabledInHierarchy ||
            !this.content ||
            this._hasNestedViewGroup(event, captureListeners))
            return;
        this.activeTouchId = event.getID();
        this._touchMoved = false;
        input.coordinator.begin(input.target);
        this._stopPropagationIfTargetIsMe(event);
    }
    _onTouchMoved(event, captureListeners) {
        const input = this.nestedInput;
        if (!input) {
            super._onTouchMoved(event, captureListeners);
            return;
        }
        if (!this.enabledInHierarchy ||
            !this.content ||
            this._hasNestedViewGroup(event, captureListeners))
            return;
        if (this.activeTouchId !== event.getID())
            return;
        const delta = event.getUIDelta();
        // Offset grows leftward on X, but upward on Cocos UI-space Y.
        input.coordinator.move(-delta.x, delta.y, Math.max(1 / 240, director.getDeltaTime()));
        if (input.coordinator.phase !== 'dragging')
            return;
        if (this.cancelInnerEvents && !this._touchMoved && event.target !== this.node) {
            const target = event.target;
            if (target) {
                const cancelEvent = new EventTouch(event.getTouches(), event.bubbles, Node.EventType.TOUCH_CANCEL);
                cancelEvent.touch = event.touch;
                cancelEvent.simulate = true;
                target.dispatchEvent(cancelEvent);
            }
        }
        this._touchMoved = true;
        this._stopPropagationIfTargetIsMe(event);
    }
    _onTouchEnded(event, captureListeners) {
        const input = this.nestedInput;
        if (!input) {
            super._onTouchEnded(event, captureListeners);
            return;
        }
        if (!this.enabledInHierarchy ||
            !this.content ||
            this._hasNestedViewGroup(event, captureListeners))
            return;
        if (this.activeTouchId !== event.getID())
            return;
        this.activeTouchId = null;
        input.coordinator.end();
        if (this._touchMoved)
            event.propagationStopped = true;
        else
            this._stopPropagationIfTargetIsMe(event);
    }
    _onTouchCancelled(event, captureListeners) {
        const input = this.nestedInput;
        if (!input) {
            super._onTouchCancelled(event, captureListeners);
            return;
        }
        // Ignore the synthetic cancel sent to a pressed child after direction lock.
        if (event.simulate)
            return;
        if (!this.enabledInHierarchy ||
            !this.content ||
            this._hasNestedViewGroup(event, captureListeners))
            return;
        if (this.activeTouchId !== event.getID())
            return;
        this.activeTouchId = null;
        input.coordinator.cancel();
        this._stopPropagationIfTargetIsMe(event);
    }
    _onMouseWheel(event, captureListeners) {
        const input = this.nestedInput;
        if (!input) {
            super._onMouseWheel(event, captureListeners);
            return;
        }
        if (!this.enabledInHierarchy ||
            !this.content ||
            this._hasNestedViewGroup(event, captureListeners))
            return;
        // The Creator Web input layer encodes CSS wheel deltas at 5x and
        // reverses Y. Convert once to logical stage units, as the DOM host does.
        const precision = screen.devicePixelRatio / (5 * view.getScaleX());
        const deltaX = event.getScrollX() * precision;
        const deltaY = -event.getScrollY() * precision;
        input.interruptInitial();
        input.coordinator.wheel(input.target, deltaX, deltaY);
        this._stopPropagationIfTargetIsMe(event);
    }
}
export class CocosHostDriver {
    constructor(container, assets, anchorsChanged = () => { }, scrollChanged = undefined, logFirstLayout = true, profileLayout = false) {
        this.container = container;
        this.assets = assets;
        this.anchorsChanged = anchorsChanged;
        this.scrollChanged = scrollChanged;
        this.logFirstLayout = logFirstLayout;
        this.metrics = {
            dirtyRoots: 0,
            measuredLeaves: 0,
            percentageFallbacks: 0,
            layoutPasses: 0,
            layoutMs: 0,
            writebackMs: 0,
        };
        this.records = new Map();
        this.nativeOwners = new WeakMap();
        this.childOrder = new NativeChildOrderBatch((parent) => this.nativeOwners.get(parent), (owner) => owner.children.map((child) => child.handle.node));
        this.created = new Set();
        this.flatCommands = [];
        this.root = null;
        this.scheduled = false;
        this.pendingCallbacks = [];
        this.layoutDirty = false;
        this.nestedScroll = new NestedScrollCoordinator(8);
        this.firstLayoutLogged = false;
        this.floatingSequence = 0;
        this.surfaceActivity = 'active';
        this.presentation = new HostFrameScheduler(now, (callback) => {
            director.once(Director.EVENT_AFTER_UPDATE, callback);
            return () => director.off(Director.EVENT_AFTER_UPDATE, callback);
        });
        this.flushPending = () => {
            this.scheduled = false;
            const pending = this.pendingCallbacks.splice(0);
            for (const callback of pending)
                callback();
        };
        this.onContainerSizeChanged = () => {
            this.layoutDirty = true;
            this.scheduleFlush(() => this.flushLayout());
        };
        this.onNestedScrollFrame = () => {
            if (this.nestedScroll.isAnimating)
                this.nestedScroll.advance(director.getDeltaTime());
        };
        if (profileLayout) {
            this.layoutProfiler = new LayoutProfiler(now);
            this.metrics.work = this.layoutProfiler.totals;
        }
        this.fillFrame = createFillFrame();
        this.container.on(Node.EventType.SIZE_CHANGED, this.onContainerSizeChanged, this);
        director.on(Director.EVENT_AFTER_UPDATE, this.onNestedScrollFrame, this);
    }
    create(kind, planId, behavior) {
        const node = new Node(`${kind}:${planId}`);
        node.layer = this.container.layer;
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(0, 0);
        const flex = createFlexNode();
        const handle = {
            node,
            transform,
            flex,
            lastRect: { x: Number.NaN, y: Number.NaN, width: Number.NaN, height: Number.NaN },
            presentationProps: {},
            visible: true,
        };
        this.created.add(handle);
        if (kind === 'virtual-list' || kind === 'scroll-view') {
            node.addComponent(Mask);
            const contentNode = new Node(`content:${planId}`);
            contentNode.layer = node.layer;
            const contentTransform = contentNode.addComponent(UITransform);
            contentTransform.setAnchorPoint(0.5, 1);
            // UITransform defaults to 100x100. Before the first layout that
            // otherwise looks like a 50px horizontal scroll to the runtime.
            contentTransform.setContentSize(0, 0);
            contentNode.setParent(node);
            handle.virtualContent = { node: contentNode, transform: contentTransform };
            handle.scrollView = node.addComponent(CoordinatedScrollView);
            handle.scrollView.content = contentNode;
            handle.scrollView.vertical = true;
            handle.scrollView.horizontal = false;
            handle.scrollView.inertia = true;
            handle.scrollView.elastic = true;
            handle.plainScroll = kind === 'scroll-view';
            handle.virtualDirection = 'vertical';
            handle.lastScrollPositionX = contentNode.position.x;
            handle.lastScrollPositionY = contentNode.position.y;
            handle.scrollPositionChanged = () => {
                var _a;
                var _b, _c;
                const { x, y } = contentNode.position;
                if (same(x, (_b = handle.lastScrollPositionX) !== null && _b !== void 0 ? _b : Number.NaN) &&
                    same(y, (_c = handle.lastScrollPositionY) !== null && _c !== void 0 ? _c : Number.NaN))
                    return;
                handle.lastScrollPositionX = x;
                handle.lastScrollPositionY = y;
                (_a = handle.virtualRefresh) === null || _a === void 0 ? void 0 : _a.call(handle);
                this.refreshFloatings();
                this.anchorsChanged();
                // Coordinated mouse-wheel and nested-scroll input writes the retained
                // content transform directly, so it does not always emit Cocos'
                // ScrollView.SCROLLING event. The transform is the common observable
                // for touch, wheel and programmatic scrolling.
                this.notifyScroll(handle);
            };
            handle.scrollChanged = () => {
                var _a, _b;
                (_a = handle.virtualRefresh) === null || _a === void 0 ? void 0 : _a.call(handle);
                (_b = handle.scrollPositionChanged) === null || _b === void 0 ? void 0 : _b.call(handle);
            };
            contentNode.on(Node.EventType.TRANSFORM_CHANGED, handle.scrollPositionChanged);
            node.on(ScrollView.EventType.SCROLLING, handle.scrollChanged);
            node.on(ScrollView.EventType.SCROLL_ENDED, handle.scrollChanged);
        }
        else if (kind === 'input') {
            node.active = false;
            // Native EditBox allocates its platform view before the first Flex pass.
            // Avoid negative inner dimensions when the engine applies its padding.
            transform.setContentSize(200, 48);
            handle.textProps = {};
            const label = (name) => {
                const child = new Node(name);
                child.layer = node.layer;
                child.setParent(node);
                // EditBox positions labels from their top-left, unlike ordinary host nodes.
                child.addComponent(UITransform).setAnchorPoint(0, 1);
                const text = child.addComponent(Label);
                text.string = '';
                text.fontSize = 24;
                text.lineHeight = 32;
                text.verticalAlign = VerticalTextAlignment.CENTER;
                text.horizontalAlign = HorizontalTextAlignment.LEFT;
                text.overflow = Label.Overflow.CLAMP;
                return text;
            };
            const text = label('input-text'), placeholder = label('input-placeholder'), display = (handle.inputDisplay = label('input-display'));
            // Match Chromium's stable placeholder color; EditBox otherwise leaves the
            // author-created Label white, which disappears on light input skins.
            placeholder.color = new Color(117, 117, 117, 255);
            const edit = (handle.editBox = node.addComponent(EditBox));
            edit.textLabel = text;
            edit.placeholderLabel = placeholder;
            // EditBox requires a background Sprite for its native overlay lifecycle. Keep that
            // Sprite transparent: the authored input skin is a separate sibling, and an opaque
            // inset EditBox background would cover the skin's horizontal borders.
            edit.backgroundImage = this.fillFrame;
            handle.sprite = node.getComponent(Sprite);
            handle.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            handle.sprite.color = new Color(255, 255, 255, 0);
            edit.inputMode = EditBox.InputMode.SINGLE_LINE;
            edit.inputFlag = EditBox.InputFlag.DEFAULT;
            text.verticalAlign = placeholder.verticalAlign = VerticalTextAlignment.CENTER;
            edit.returnType = EditBox.KeyboardReturnType.DONE;
            edit.maxLength = 256;
            node.on(EditBox.EventType.TEXT_CHANGED, () => {
                var _a, _b;
                this.writeEditBox(handle);
                (_b = (_a = handle.textProps).onInput) === null || _b === void 0 ? void 0 : _b.call(_a, edit.string);
            });
            node.on(EditBox.EventType.EDITING_RETURN, () => {
                var _a, _b, _c, _d;
                (_b = (_a = handle.textProps).onSubmit) === null || _b === void 0 ? void 0 : _b.call(_a);
                (_d = (_c = handle.textProps).onCommit) === null || _d === void 0 ? void 0 : _d.call(_c, edit.string);
            });
            node.on(EditBox.EventType.EDITING_DID_BEGAN, () => {
                var _a, _b;
                handle.inputEditing = true;
                display.node.active = false;
                (_b = (_a = handle.textProps).onFocus) === null || _b === void 0 ? void 0 : _b.call(_a);
            });
            node.on(EditBox.EventType.EDITING_DID_ENDED, () => {
                var _a, _b, _c, _d;
                handle.inputEditing = false;
                display.node.active = true;
                this.writeEditBox(handle);
                (_b = (_a = handle.textProps).onCommit) === null || _b === void 0 ? void 0 : _b.call(_a, edit.string);
                (_d = (_c = handle.textProps).onBlur) === null || _d === void 0 ? void 0 : _d.call(_c);
            });
            flex.measure = () => { var _a; return ({
                width: 200,
                height: Number((_a = handle.textProps.fontSize) !== null && _a !== void 0 ? _a : 24) + 24,
            }); };
        }
        else if (kind === 'text') {
            node.active = false;
            handle.label = node.addComponent(Label);
            handle.label.string = '';
            handle.textProps = {};
            flex.measure = (constraint) => this.measureText(handle, constraint.width, constraint.height);
        }
        else if (kind === 'image') {
            handle.sprite = node.addComponent(Sprite);
            handle.sprite.spriteFrame = this.fillFrame;
            handle.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            flex.measure = () => this.measureImage(handle);
        }
        if ((behavior === null || behavior === void 0 ? void 0 : behavior.interaction) === 'press') {
            handle.controlProps = {};
            handle.button = node.addComponent(Button);
            handle.button.transition = Button.Transition.NONE;
            handle.button.target = node;
            const press = (pressed) => {
                var _a, _b;
                if (handle.controlProps.interactable === false || handle.pressed === pressed)
                    return;
                handle.pressed = pressed;
                (_b = (_a = handle.controlProps).onPressChange) === null || _b === void 0 ? void 0 : _b.call(_a, pressed);
            };
            node.on(Node.EventType.TOUCH_START, () => press(true));
            node.on(Node.EventType.TOUCH_END, () => press(false));
            node.on(Node.EventType.TOUCH_CANCEL, () => press(false));
        }
        else if ((behavior === null || behavior === void 0 ? void 0 : behavior.interaction) === 'range') {
            handle.controlProps = {};
            const valueAt = (event) => {
                var _a, _b, _c;
                const point = event.getUILocation();
                const local = transform.convertToNodeSpaceAR(new Vec3(point.x, point.y, 0));
                const min = Number((_a = handle.controlProps.min) !== null && _a !== void 0 ? _a : 0);
                const max = Number((_b = handle.controlProps.max) !== null && _b !== void 0 ? _b : 100);
                return normalizeRangeValue(min + Math.max(0, Math.min(1, local.x / transform.width + 0.5)) * (max - min), min, max, Number((_c = handle.controlProps.step) !== null && _c !== void 0 ? _c : 1));
            };
            const change = (event) => {
                var _a, _b;
                if (handle.controlProps.interactable === false)
                    return;
                const value = valueAt(event);
                handle.rangeValue = value;
                (_b = (_a = handle.controlProps).onChange) === null || _b === void 0 ? void 0 : _b.call(_a, value);
            };
            const commit = (event) => {
                var _a, _b;
                var _c, _d, _e, _f;
                if (handle.controlProps.interactable === false)
                    return;
                change(event);
                const value = normalizeRangeValue((_c = handle.rangeValue) !== null && _c !== void 0 ? _c : Number(handle.controlProps.value), Number((_d = handle.controlProps.min) !== null && _d !== void 0 ? _d : 0), Number((_e = handle.controlProps.max) !== null && _e !== void 0 ? _e : 100), Number((_f = handle.controlProps.step) !== null && _f !== void 0 ? _f : 1));
                (_b = (_a = handle.controlProps).onCommit) === null || _b === void 0 ? void 0 : _b.call(_a, value);
            };
            node.on(Node.EventType.TOUCH_START, change);
            node.on(Node.EventType.TOUCH_MOVE, change);
            node.on(Node.EventType.TOUCH_END, commit);
            node.on(Node.EventType.TOUCH_CANCEL, commit);
        }
        if (behavior === null || behavior === void 0 ? void 0 : behavior.floating) {
            handle.controlProps = {};
        }
        return handle;
    }
    validate(commands) {
        const known = new Set(this.records.keys());
        for (const command of commands) {
            if (command.type === 'create') {
                if (command.record.kind === 'image' && !command.record.props.source)
                    throw new Error('Image requires a prepared ImageRef source.');
                if (known.has(command.record.recordId))
                    throw new Error(`Host record ${command.record.recordId} already exists.`);
                known.add(command.record.recordId);
                continue;
            }
            const recordId = command.type === 'update' ||
                command.type === 'destroy' ||
                command.type === 'visibility'
                ? command.record.recordId
                : command.child.recordId;
            if (!known.has(recordId)) {
                throw new Error(`Host command ${command.type} references unknown record ${recordId}.`);
            }
        }
    }
    inspect() {
        return [...this.records.values()].map((r) => {
            var _a, _b;
            const h = r.handle, node = inspectRecord(r, h.flex.frame, this.isRecordVisible(r) && r.props.__virtualParked !== true, h.virtualContent
                ? this.readVirtualViewport(r, (_a = h.virtualDirection) !== null && _a !== void 0 ? _a : 'vertical').offset
                : undefined);
            if (!h.virtualContent || !h.scrollView)
                return node;
            const direction = (_b = h.virtualDirection) !== null && _b !== void 0 ? _b : 'vertical', native = h.scrollView.getScrollOffset(), max = h.scrollView.getMaxScrollOffset();
            const position = direction === 'vertical' ? native.y : -native.x, maximum = Math.max(0, direction === 'vertical' ? max.y : max.x), offset = Math.max(0, Math.min(maximum, position));
            return Object.assign(Object.assign({}, node), { scrollEvidence: {
                    position,
                    offset,
                    displacement: offset - position,
                    maximum,
                    scrolling: this.readVirtualViewport(r, direction).scrolling,
                } });
        });
    }
    present(activity, order, options, transitionState) {
        var _a, _b;
        var _c;
        const root = (_a = this.root) === null || _a === void 0 ? void 0 : _a.handle.node;
        if (!(root === null || root === void 0 ? void 0 : root.isValid))
            return;
        (_b = this.cancelSurfaceTransition) === null || _b === void 0 ? void 0 : _b.call(this);
        this.surfaceActivity = activity;
        root.setSiblingIndex(order * 3 + 2);
        root.active =
            activity !== 'parked' && this.root.handle.visible && !this.root.handle.flex.hidden;
        const opacity = (_c = root.getComponent(UIOpacity)) !== null && _c !== void 0 ? _c : root.addComponent(UIOpacity);
        if (activity === 'active' && options.transition === 'fade' && transitionState !== 'steady')
            return this.fadeSurface(opacity, transitionState);
        opacity.opacity = 255;
    }
    fadeSurface(opacity, transitionState) {
        const entering = transitionState === 'entering';
        opacity.opacity = entering ? 0 : 255;
        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                if (this.cancelSurfaceTransition === cancel)
                    this.cancelSurfaceTransition = undefined;
                resolve();
            };
            const cancel = () => {
                Tween.stopAllByTarget(opacity);
                finish();
            };
            this.cancelSurfaceTransition = cancel;
            tween(opacity)
                .to(0.12, { opacity: entering ? 255 : 0 })
                .call(finish)
                .start();
        });
    }
    setSnapshotCovered(covered) {
        var _a;
        const root = (_a = this.root) === null || _a === void 0 ? void 0 : _a.handle.node;
        if ((root === null || root === void 0 ? void 0 : root.isValid) && this.surfaceActivity === 'covered')
            root.active = !covered && this.root.handle.visible && !this.root.handle.flex.hidden;
    }
    get surfaceNode() {
        var _a;
        const node = (_a = this.root) === null || _a === void 0 ? void 0 : _a.handle.node;
        return (node === null || node === void 0 ? void 0 : node.isValid) ? node : undefined;
    }
    commit(commands) {
        // Copy into a reusable buffer so validation and mutation never interleave.
        this.flatCommands.length = 0;
        this.flatCommands.push(...commands);
        try {
            for (const command of this.flatCommands)
                this.applyCommand(command);
            this.childOrder.flush();
        }
        finally {
            this.childOrder.clear();
            this.flatCommands.length = 0;
        }
    }
    scheduleFlush(callback) {
        this.pendingCallbacks.push(callback);
        if (this.scheduled)
            return;
        this.scheduled = true;
        director.once(Director.EVENT_AFTER_UPDATE, this.flushPending, this);
    }
    scheduleDelayed(callback, delayMs) {
        return this.presentation.delay(callback, delayMs);
    }
    startEntrance(record, options, complete) {
        const handle = record.handle;
        return this.presentation.animate(options.durationMs, (progress) => {
            const offset = options.offset * (1 - progress);
            handle.entrance =
                progress === 1
                    ? undefined
                    : {
                        x: options.direction === 'horizontal' ? offset : 0,
                        y: options.direction === 'vertical' ? -offset : 0,
                        opacity: progress,
                    };
            this.writePresentation(handle, false);
        }, complete);
    }
    writePresentation(handle, animateTransform = false) {
        var _a;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const effect = handle.entrance;
        const props = (_b = handle.presentationProps) !== null && _b !== void 0 ? _b : {};
        if (Number.isFinite(handle.lastRect.x) && !handle.virtualParked) {
            const position = new Vec3(handle.lastRect.x + Number((_c = props.translateX) !== null && _c !== void 0 ? _c : 0) + ((_d = effect === null || effect === void 0 ? void 0 : effect.x) !== null && _d !== void 0 ? _d : 0), handle.lastRect.y - Number((_e = props.translateY) !== null && _e !== void 0 ? _e : 0) + ((_f = effect === null || effect === void 0 ? void 0 : effect.y) !== null && _f !== void 0 ? _f : 0), 0);
            const scale = Math.max(0, Number((_g = props.scale) !== null && _g !== void 0 ? _g : 1));
            const duration = Math.max(0, Number((_h = props.transformDurationMs) !== null && _h !== void 0 ? _h : 0)) / 1000;
            if (animateTransform && duration > 0 && !effect && handle.node.activeInHierarchy) {
                Tween.stopAllByTarget(handle.node);
                tween(handle.node)
                    .to(duration, { position, scale: new Vec3(scale, scale, 1) })
                    .start();
            }
            else {
                handle.node.setPosition(position);
                handle.node.setScale(scale, scale, 1);
            }
            if (((_a = handle.inputDisplay) === null || _a === void 0 ? void 0 : _a.node.isValid) &&
                handle.inputDisplay.node.parent === handle.node.parent)
                handle.inputDisplay.node.setPosition(handle.node.position);
        }
        if (effect || handle.opacity) {
            (_j = handle.opacity) !== null && _j !== void 0 ? _j : (handle.opacity = handle.node.addComponent(UIOpacity));
            const opacity = Math.round(((_k = handle.baseOpacity) !== null && _k !== void 0 ? _k : 1) * ((_l = effect === null || effect === void 0 ? void 0 : effect.opacity) !== null && _l !== void 0 ? _l : 1) * 255);
            if (handle.opacity.opacity !== opacity)
                handle.opacity.opacity = opacity;
        }
    }
    flushLayout() {
        if (!this.layoutDirty || !this.root)
            return;
        this.layoutDirty = false;
        this.metrics.dirtyRoots = 1;
        const containerTransform = this.container.getComponent(UITransform);
        if (!containerTransform)
            throw new Error('Flex root container requires UITransform.');
        const width = containerTransform.contentSize.width;
        const height = containerTransform.contentSize.height;
        const layoutStart = now();
        if (this.layoutProfiler)
            this.layoutProfiler.totals.flushes++;
        const result = this.layoutProfiler
            ? this.layoutProfiler.layout(() => layoutFlexTree(this.root.handle.flex, width, height))
            : layoutFlexTree(this.root.handle.flex, width, height);
        const floatingStats = this.layoutFloatingPanels(width, height);
        this.metrics.layoutMs = now() - layoutStart;
        if (this.logFirstLayout && !this.firstLayoutLogged) {
            this.firstLayoutLogged = true;
            console.info('[cocos-flex] first layout ' +
                JSON.stringify({
                    container: { width, height },
                    root: Object.assign({}, this.root.handle.flex.frame),
                    children: this.root.children.slice(0, 4).map((child) => { var _a; return ({
                        name: (_a = child.props.name) !== null && _a !== void 0 ? _a : child.kind,
                        frame: Object.assign({}, child.handle.flex.frame),
                    }); }),
                }));
        }
        this.metrics.measuredLeaves = result.stats.measuredLeaves + floatingStats.measuredLeaves;
        this.metrics.percentageFallbacks =
            result.stats.percentageFallbacks + floatingStats.percentageFallbacks;
        this.metrics.layoutPasses++;
        const writeStart = now();
        if (this.layoutProfiler)
            this.layoutProfiler.write(() => this.writeRecord(this.root, containerTransform));
        else
            this.writeRecord(this.root, containerTransform);
        this.metrics.writebackMs = now() - writeStart;
        this.anchorsChanged();
    }
    layoutFloatingPanels(viewportWidth, viewportHeight) {
        var _a;
        let measuredLeaves = 0;
        let percentageFallbacks = 0;
        for (const record of this.records.values()) {
            if (!((_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating))
                continue;
            const panel = this.floatingPanel(record);
            if (!panel)
                continue;
            const containingWidth = record.behavior.floating.anchor === 'child'
                ? record.handle.flex.frame.width
                : viewportWidth;
            const containingHeight = record.behavior.floating.anchor === 'child'
                ? record.handle.flex.frame.height
                : viewportHeight;
            const width = detachedPercentage(panel.handle.flex.style.width, containingWidth);
            const height = detachedPercentage(panel.handle.flex.style.height, containingHeight);
            const result = this.layoutProfiler
                ? this.layoutProfiler.layout(() => layoutFlexTreeIntrinsic(panel.handle.flex, width, height))
                : layoutFlexTreeIntrinsic(panel.handle.flex, width, height);
            measuredLeaves += result.stats.measuredLeaves;
            percentageFallbacks += result.stats.percentageFallbacks;
        }
        return { measuredLeaves, percentageFallbacks };
    }
    flushVirtualLayout(record) {
        if (!record.handle.virtualContent) {
            this.flushLayout();
            return;
        }
        this.layoutDirty = false;
        this.metrics.dirtyRoots = 1;
        const started = now();
        if (this.layoutProfiler) {
            this.layoutProfiler.totals.flushes++;
            this.layoutProfiler.write(() => this.writeVirtualChildren(record));
        }
        else
            this.writeVirtualChildren(record);
        this.metrics.layoutMs = now() - started;
        this.metrics.writebackMs = 0;
        this.metrics.layoutPasses++;
        this.anchorsChanged();
    }
    findAnchor(name) {
        const record = [...this.records.values()].find((candidate) => candidate.props.name === name && this.isRecordVisible(candidate));
        return record ? this.globalRect(record) : undefined;
    }
    isRecordVisible(record) {
        for (let current = record; current; current = current.parent)
            if (!current.handle.visible ||
                current.handle.flex.hidden ||
                !current.handle.node.active)
                return false;
        return true;
    }
    readVirtualViewport(record, direction) {
        var _a, _b, _c;
        var _d, _e, _f, _g;
        const handle = record.handle;
        const offset = (_a = handle.scrollView) === null || _a === void 0 ? void 0 : _a.getScrollOffset();
        return {
            offset: Math.max(0, direction === 'vertical' ? ((_d = offset === null || offset === void 0 ? void 0 : offset.y) !== null && _d !== void 0 ? _d : 0) : -((_e = offset === null || offset === void 0 ? void 0 : offset.x) !== null && _e !== void 0 ? _e : 0)),
            mainSize: direction === 'vertical'
                ? handle.transform.contentSize.height
                : handle.transform.contentSize.width,
            crossSize: direction === 'vertical'
                ? handle.transform.contentSize.width
                : handle.transform.contentSize.height,
            scrolling: ((_f = (_b = handle.scrollView) === null || _b === void 0 ? void 0 : _b.isScrolling()) !== null && _f !== void 0 ? _f : false) ||
                ((_g = (_c = handle.scrollView) === null || _c === void 0 ? void 0 : _c.isAutoScrolling()) !== null && _g !== void 0 ? _g : false) ||
                (this.nestedScroll.phase !== 'idle' && this.nestedScroll.phase !== 'pending'),
        };
    }
    notifyScroll(handle) {
        const scroll = handle.scrollView;
        const name = handle.node.name.split('›').join('/');
        if (!this.scrollChanged ||
            !scroll ||
            !name ||
            /^(?:scroll-view|virtual-list):\d+$/.test(name))
            return;
        const direction = scroll.horizontal && !scroll.vertical ? 'horizontal' : 'vertical';
        const current = scroll.getScrollOffset();
        const maximum = scroll.getMaxScrollOffset();
        this.scrollChanged({
            name,
            direction,
            offset: direction === 'vertical' ? Math.max(0, current.y) : Math.abs(current.x),
            maximum: Math.max(0, direction === 'vertical' ? maximum.y : maximum.x),
        });
    }
    scrollVirtualTo(record, direction, offset, duration) {
        const scroll = record.handle.scrollView;
        if (!scroll)
            return;
        scroll.scrollToOffset(direction === 'vertical' ? new Vec2(0, offset) : new Vec2(offset, 0), duration, true);
    }
    stopVirtualScroll(record) {
        var _a;
        (_a = record.handle.scrollView) === null || _a === void 0 ? void 0 : _a.stopAutoScroll();
    }
    destroy() {
        var _a, _b;
        (_a = this.cancelSurfaceTransition) === null || _a === void 0 ? void 0 : _a.call(this);
        this.presentation.dispose();
        director.off(Director.EVENT_AFTER_UPDATE, this.flushPending, this);
        this.scheduled = false;
        this.container.off(Node.EventType.SIZE_CHANGED, this.onContainerSizeChanged, this);
        director.off(Director.EVENT_AFTER_UPDATE, this.onNestedScrollFrame, this);
        this.nestedScroll.cancel();
        for (const handle of this.created) {
            if ((_b = handle.floatingBlocker) === null || _b === void 0 ? void 0 : _b.isValid)
                handle.floatingBlocker.destroy();
            if (handle.node.isValid)
                handle.node.destroy();
        }
        this.created.clear();
        this.records.clear();
        this.childOrder.clear();
        const texture = this.fillFrame.texture;
        this.fillFrame.destroy();
        texture === null || texture === void 0 ? void 0 : texture.destroy();
        this.root = null;
        this.pendingCallbacks.length = 0;
    }
    applyCommand(command) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        var _t, _u, _v, _w, _x;
        switch (command.type) {
            case 'create':
                this.records.set(command.record.recordId, command.record);
                this.nativeOwners.set(command.record.handle.node, command.record);
                if (command.record.handle.virtualContent)
                    this.nativeOwners.set(command.record.handle.virtualContent.node, command.record);
                if (command.record.handle.plainScroll)
                    command.record.handle.flex.measure = (constraint) => {
                        var _a, _b, _c;
                        const child = command.record.children[0];
                        return child
                            ? measureScrollContent(child.handle.flex, (_a = command.record.handle.virtualDirection) !== null && _a !== void 0 ? _a : 'vertical', constraint)
                            : {
                                width: (_b = constraint.width) !== null && _b !== void 0 ? _b : 0,
                                height: (_c = constraint.height) !== null && _c !== void 0 ? _c : 0,
                            };
                    };
                break;
            case 'update':
                this.applyProperty(command.record, command.property, command.value);
                break;
            case 'insert': {
                const floatingPanel = ((_b = (_a = command.parent) === null || _a === void 0 ? void 0 : _a.behavior) === null || _b === void 0 ? void 0 : _b.floating) !== undefined &&
                    command.index === command.parent.behavior.floating.panelIndex;
                const parentNode = floatingPanel
                    ? ((_t = (_c = this.root) === null || _c === void 0 ? void 0 : _c.handle.node) !== null && _t !== void 0 ? _t : this.container)
                    : ((_v = (_u = (_e = (_d = command.parent) === null || _d === void 0 ? void 0 : _d.handle.virtualContent) === null || _e === void 0 ? void 0 : _e.node) !== null && _u !== void 0 ? _u : (_f = command.parent) === null || _f === void 0 ? void 0 : _f.handle.node) !== null && _v !== void 0 ? _v : this.container);
                this.queueChildParentChange(command.child, command.parent, parentNode);
                command.child.handle.node.setParent(parentNode);
                if (floatingPanel)
                    this.childOrder.putLast(parentNode, command.child.handle.node);
                this.configureNestedScroll(command.child);
                if (command.parent) {
                    if (!command.parent.handle.virtualContent) {
                        const flexChildren = command.parent.handle.flex.children;
                        const existing = flexChildren.indexOf(command.child.handle.flex);
                        if (existing >= 0)
                            flexChildren.splice(existing, 1);
                        if (!floatingPanel) {
                            const panelIndex = (_h = (_g = command.parent.behavior) === null || _g === void 0 ? void 0 : _g.floating) === null || _h === void 0 ? void 0 : _h.panelIndex;
                            const flexIndex = panelIndex !== undefined && panelIndex < command.index
                                ? command.index - 1
                                : command.index;
                            flexChildren.splice(flexIndex, 0, command.child.handle.flex);
                        }
                    }
                }
                else {
                    this.root = command.child;
                }
                this.layoutDirty = true;
                break;
            }
            case 'move': {
                const floatingPanel = ((_j = command.parent.behavior) === null || _j === void 0 ? void 0 : _j.floating) !== undefined &&
                    command.index === command.parent.behavior.floating.panelIndex;
                const parentNode = floatingPanel
                    ? ((_w = (_k = this.root) === null || _k === void 0 ? void 0 : _k.handle.node) !== null && _w !== void 0 ? _w : this.container)
                    : ((_x = (_l = command.parent.handle.virtualContent) === null || _l === void 0 ? void 0 : _l.node) !== null && _x !== void 0 ? _x : command.parent.handle.node);
                this.queueChildParentChange(command.child, command.parent, parentNode);
                if (command.child.handle.node.parent !== parentNode)
                    command.child.handle.node.setParent(parentNode);
                if (floatingPanel)
                    this.childOrder.putLast(parentNode, command.child.handle.node);
                if (!command.parent.handle.virtualContent) {
                    const children = command.parent.handle.flex.children;
                    const previous = children.indexOf(command.child.handle.flex);
                    if (previous >= 0)
                        children.splice(previous, 1);
                    const panelIndex = (_o = (_m = command.parent.behavior) === null || _m === void 0 ? void 0 : _m.floating) === null || _o === void 0 ? void 0 : _o.panelIndex;
                    if (panelIndex === undefined || panelIndex !== command.index) {
                        const flexIndex = panelIndex !== undefined && panelIndex < command.index
                            ? command.index - 1
                            : command.index;
                        children.splice(flexIndex, 0, command.child.handle.flex);
                    }
                }
                this.layoutDirty = true;
                break;
            }
            case 'remove':
                this.childOrder.queue(command.child.handle.node.parent);
                if (command.parent && !command.parent.handle.virtualContent) {
                    const children = command.parent.handle.flex.children;
                    const index = children.indexOf(command.child.handle.flex);
                    if (index >= 0)
                        children.splice(index, 1);
                }
                command.child.handle.node.removeFromParent();
                if (((_p = command.child.handle.inputDisplay) === null || _p === void 0 ? void 0 : _p.node.parent) !== command.child.handle.node)
                    (_q = command.child.handle.inputDisplay) === null || _q === void 0 ? void 0 : _q.node.removeFromParent();
                this.layoutDirty = true;
                break;
            case 'destroy':
                this.childOrder.queue(command.record.handle.node.parent);
                this.records.delete(command.record.recordId);
                this.nativeOwners.delete(command.record.handle.node);
                if (command.record.handle.virtualContent)
                    this.nativeOwners.delete(command.record.handle.virtualContent.node);
                this.created.delete(command.record.handle);
                if ((_r = command.record.handle.floatingBlocker) === null || _r === void 0 ? void 0 : _r.isValid)
                    command.record.handle.floatingBlocker.destroy();
                if (((_s = command.record.handle.inputDisplay) === null || _s === void 0 ? void 0 : _s.node.isValid) &&
                    command.record.handle.inputDisplay.node.parent !== command.record.handle.node)
                    command.record.handle.inputDisplay.node.destroy();
                command.record.handle.node.destroy();
                if (this.root === command.record)
                    this.root = null;
                break;
            case 'visibility':
                command.record.handle.visible = command.visible;
                if (command.record.handle.node.active !== command.visible) {
                    command.record.handle.node.active = command.visible;
                }
                if (command.record.handle.inputDisplay &&
                    command.record.handle.inputDisplay.node.parent !== command.record.handle.node)
                    command.record.handle.inputDisplay.node.active =
                        command.visible && !command.record.handle.inputEditing;
                command.record.handle.flex.style = Object.assign(Object.assign({}, command.record.handle.flex.style), { display: command.visible ? 'flex' : 'none' });
                if (!command.visible)
                    this.hideDetachedDescendants(command.record);
                this.layoutDirty = true;
                break;
        }
    }
    queueChildParentChange(child, nextOwner, nextParent) {
        const previousParent = child.handle.node.parent;
        this.childOrder.queue(previousParent);
        this.childOrder.queue(nextParent);
        // reparent 的旧逻辑父节点可能已经被 Core 改写，以提交前的物理所有者为准。
        const previousOwner = previousParent && this.nativeOwners.get(previousParent);
        if (previousOwner && previousOwner !== nextOwner && !previousOwner.handle.virtualContent) {
            const children = previousOwner.handle.flex.children;
            const index = children.indexOf(child.handle.flex);
            if (index >= 0)
                children.splice(index, 1);
        }
    }
    applyProperty(record, property, value) {
        var _a, _b, _c, _d, _e, _f, _g;
        var _h;
        const handle = record.handle;
        handle.presentationProps[property] = value;
        if (handle.textProps)
            handle.textProps[property] = value;
        if (handle.controlProps)
            handle.controlProps[property] = value;
        if (handle.editBox) {
            const edit = handle.editBox;
            if (property === 'value' && edit.string !== String(value !== null && value !== void 0 ? value : ''))
                edit.string = String(value !== null && value !== void 0 ? value : '');
            else if (property === 'placeholder')
                edit.placeholder = String(value !== null && value !== void 0 ? value : '');
            else if (property === 'password')
                edit.inputFlag =
                    value === true ? EditBox.InputFlag.PASSWORD : EditBox.InputFlag.DEFAULT;
            else if (property === 'maxLength')
                edit.maxLength = Math.max(1, Number(value !== null && value !== void 0 ? value : 256));
            else if (property === 'fontSize') {
                edit.textLabel.fontSize = edit.placeholderLabel.fontSize = Number(value !== null && value !== void 0 ? value : 24);
                edit.textLabel.lineHeight = edit.placeholderLabel.lineHeight =
                    Number(value !== null && value !== void 0 ? value : 24) * 1.3;
            }
            else if (property === 'color') {
                const color = parseColor(value, Color.WHITE);
                edit.textLabel.color = color;
                if (edit.string && handle.inputDisplay)
                    handle.inputDisplay.color = color;
            }
            else if (property === 'inputMode')
                edit.inputMode =
                    value === 'numeric'
                        ? EditBox.InputMode.NUMERIC
                        : value === 'decimal'
                            ? EditBox.InputMode.DECIMAL
                            : EditBox.InputMode.SINGLE_LINE;
            else if (property === 'textAlign')
                edit.textLabel.horizontalAlign = edit.placeholderLabel.horizontalAlign =
                    horizontalAlignment(value);
            else if (property === 'interactable')
                edit.enabled = value !== false;
            else if (property === 'focused') {
                if (value === true)
                    this.scheduleFlush(() => {
                        if (handle.node.isValid && handle.node.activeInHierarchy)
                            edit.focus();
                    });
                else
                    edit.blur();
            }
            if (['value', 'placeholder', 'fontSize', 'textAlign'].includes(property))
                this.writeEditBox(handle);
        }
        if (handle.label && this.applyLabelAppearance(handle.label, property, value))
            return;
        if (handle.label &&
            ['value', 'fontSize', 'lineHeight', 'font', 'bold', 'wrap', 'overflow'].includes(property)) {
            handle.measureKey = undefined;
            this.layoutDirty = true;
            return; // Stage text properties until final geometry is known.
        }
        switch (property) {
            case 'name':
                // Cocos reserves slash for hierarchy paths. Keep the shared logical name
                // in record props for inspection while assigning an engine-safe node name.
                handle.node.name = String(value !== null && value !== void 0 ? value : `${record.kind}:${record.planId}`).split('/').join('›');
                break;
            case 'style':
                handle.flex.style = handle.visible
                    ? (value !== null && value !== void 0 ? value : {})
                    : Object.assign(Object.assign({}, (value !== null && value !== void 0 ? value : {})), { display: 'none' });
                this.layoutDirty = true;
                break;
            case 'visible':
                handle.visible = value !== false;
                if (handle.node.active !== handle.visible)
                    handle.node.active = handle.visible;
                handle.flex.style = Object.assign(Object.assign({}, handle.flex.style), { display: handle.visible ? 'flex' : 'none' });
                this.layoutDirty = true;
                break;
            case 'backgroundColor':
                this.ensureSprite(handle).color = parseColor(value, Color.WHITE);
                break;
            case 'opacity':
                (_h = handle.opacity) !== null && _h !== void 0 ? _h : (handle.opacity = handle.node.addComponent(UIOpacity));
                handle.baseOpacity = clampNumber(value, 0, 1, 1);
                this.writePresentation(handle, false);
                break;
            case 'scale':
            case 'translateX':
            case 'translateY':
                this.writePresentation(handle, true);
                break;
            case 'transformDurationMs':
                this.writePresentation(handle, false);
                break;
            case 'source':
                if (handle.sprite) {
                    handle.sprite.spriteFrame = this.assets.resolve(value)
                        .native;
                    handle.measureKey = undefined;
                    this.layoutDirty = true;
                }
                break;
            case 'tint':
                if (handle.sprite)
                    handle.sprite.color = parseColor(value, Color.WHITE);
                break;
            case 'sizeMode':
                if (handle.sprite) {
                    handle.sprite.type =
                        value === 'sliced'
                            ? Sprite.Type.SLICED
                            : value === 'filled'
                                ? Sprite.Type.FILLED
                                : Sprite.Type.SIMPLE;
                    handle.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                }
                break;
            case 'intrinsic':
                handle.imageIntrinsic = value === 'trimmed' ? 'trimmed' : 'original';
                handle.measureKey = undefined;
                this.layoutDirty = true;
                break;
            case 'interactable':
                if (handle.button)
                    handle.button.interactable = value !== false;
                break;
            case 'onClick':
                if (handle.button)
                    this.setClick(handle, typeof value === 'function' ? value : undefined);
                break;
            case 'inertia':
                if (handle.scrollView)
                    handle.scrollView.inertia = value !== false;
                break;
            case 'elastic':
                if (handle.scrollView)
                    handle.scrollView.elastic = value !== false;
                break;
            case 'brake':
                if (handle.scrollView)
                    handle.scrollView.brake = clampNumber(value, 0, 1, 0.5);
                break;
            case 'direction':
                if (handle.scrollView) {
                    handle.virtualDirection = value === 'horizontal' ? 'horizontal' : 'vertical';
                    handle.scrollView.horizontal = handle.virtualDirection === 'horizontal';
                    handle.scrollView.vertical = handle.virtualDirection === 'vertical';
                    (_a = handle.virtualContent) === null || _a === void 0 ? void 0 : _a.transform.setAnchorPoint(handle.virtualDirection === 'vertical' ? 0.5 : 0, handle.virtualDirection === 'vertical' ? 1 : 0.5);
                    this.layoutDirty = true;
                }
                break;
            case 'value':
            case 'min':
            case 'max':
            case 'step':
                if (((_b = record.behavior) === null || _b === void 0 ? void 0 : _b.interaction) === 'range') {
                    if (property === 'value')
                        handle.rangeValue = undefined;
                    this.layoutDirty = true;
                }
                break;
            case 'open':
                if ((_c = record.behavior) === null || _c === void 0 ? void 0 : _c.floating) {
                    handle.floatingOrder = value === true ? ++this.floatingSequence : undefined;
                    this.layoutDirty = true;
                }
                break;
            case 'anchorRect':
            case 'placement':
            case 'align':
            case 'gap':
            case 'viewportPadding':
                if ((_d = record.behavior) === null || _d === void 0 ? void 0 : _d.floating)
                    this.layoutDirty = true;
                break;
            case 'scrollOffset':
                if (handle.plainScroll) {
                    handle.pendingScrollOffset = Math.max(0, Number(value) || 0);
                    (_e = handle.scrollView) === null || _e === void 0 ? void 0 : _e.stopAutoScroll();
                    this.layoutDirty = true;
                }
                break;
            case 'resetKey':
                if (handle.plainScroll && handle.scrollView) {
                    handle.scrollView.stopAutoScroll();
                    handle.scrollView.scrollToOffset(new Vec2(0, 0), 0, true);
                    this.layoutDirty = true;
                }
                break;
            case '__virtualDirection':
                if (handle.scrollView) {
                    handle.virtualDirection = value === 'horizontal' ? 'horizontal' : 'vertical';
                    handle.scrollView.horizontal = handle.virtualDirection === 'horizontal';
                    handle.scrollView.vertical = handle.virtualDirection === 'vertical';
                    (_f = handle.virtualContent) === null || _f === void 0 ? void 0 : _f.transform.setAnchorPoint(handle.virtualDirection === 'vertical' ? 0.5 : 0, handle.virtualDirection === 'vertical' ? 1 : 0.5);
                    this.layoutDirty = true;
                }
                break;
            case '__virtualContentMainSize':
                handle.virtualContentMainSize = readFiniteNumber(value, 0);
                this.layoutDirty = true;
                break;
            case '__virtualRefresh':
                handle.virtualRefresh =
                    typeof value === 'function' ? value : undefined;
                break;
            case '__virtualScopePath': {
                const next = typeof value === 'string' ? value : undefined;
                if (handle.scrollView)
                    handle.virtualScopePath = next;
                break;
            }
            case '__virtualSticky':
                if (value === true && ((_g = record.parent) === null || _g === void 0 ? void 0 : _g.handle.virtualContent)) {
                    handle.node.setParent(record.parent.handle.node);
                }
                this.layoutDirty = true;
                break;
            case '__virtualMainOffset':
            case '__virtualCrossOffset':
            case '__virtualMainSize':
            case '__virtualCrossSize':
            case '__virtualParked':
                this.layoutDirty = true;
                break;
            default:
                // Reserved AOT structural properties (__for*) are consumed by a future
                // universal driver and intentionally ignored by the native leaf host.
                break;
        }
    }
    applyLabelAppearance(label, property, value) {
        switch (property) {
            case 'color': {
                const color = parseColor(value, Color.WHITE);
                if (!label.color.equals(color))
                    label.color = color;
                return true;
            }
            case 'outlineColor': {
                const color = parseColor(value, Color.BLACK);
                if (!label.outlineColor.equals(color))
                    label.outlineColor = color;
                return true;
            }
            case 'outlineWidth':
                label.outlineWidth = clampNumber(value, 0, 32, 0);
                label.enableOutline = Number(value !== null && value !== void 0 ? value : 0) > 0;
                return true;
            case 'horizontalAlign':
                label.horizontalAlign = horizontalAlignment(value);
                return true;
            case 'verticalAlign':
                label.verticalAlign = verticalAlignment(value);
                return true;
            case 'cacheMode':
                label.cacheMode =
                    value === 'char'
                        ? Label.CacheMode.CHAR
                        : value === 'bitmap'
                            ? Label.CacheMode.BITMAP
                            : Label.CacheMode.NONE;
                return true;
            default:
                return false;
        }
    }
    ensureSprite(handle) {
        if (!handle.sprite) {
            // Adding a Sprite with its default RAW size mode rewrites UITransform
            // to the frame's intrinsic size. This can happen after layout when a
            // previously unselected button receives its selected background.
            const width = handle.transform.width;
            const height = handle.transform.height;
            handle.sprite = handle.node.addComponent(Sprite);
            handle.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            handle.sprite.spriteFrame = this.fillFrame;
            handle.transform.setContentSize(width, height);
        }
        return handle.sprite;
    }
    configureNestedScroll(record) {
        const handle = record.handle;
        if (!handle.scrollView)
            return;
        // Once a virtual collection contains another virtual collection, the
        // entire chain must share one physics writer. Otherwise a drag that
        // begins on the parent surface uses native ScrollView physics while an
        // equivalent drag beginning over a child uses the coordinator.
        for (let current = record; current;) {
            const scrollView = current.handle.scrollView;
            if (scrollView) {
                const target = this.getNestedTarget(current);
                const record = current;
                scrollView.coordinateWith({
                    coordinator: this.nestedScroll,
                    target,
                    interruptInitial: () => this.interruptInitial(record),
                });
            }
            current = findVirtualAncestor(current.parent);
        }
    }
    interruptInitial(record) {
        var _a, _b;
        for (let current = record; current; current = current.parent) {
            (_b = (_a = current.props).__virtualInteraction) === null || _b === void 0 ? void 0 : _b.call(_a);
        }
    }
    getNestedTarget(record) {
        const cached = record.handle.nestedTarget;
        if (cached)
            return cached;
        // Object-literal getters bind their own this; keep the outer host available.
        // eslint-disable-next-line typescript/no-this-alias
        const driver = this;
        const target = {
            id: `virtual:${record.recordId}`,
            get direction() {
                var _a;
                return (_a = record.handle.virtualDirection) !== null && _a !== void 0 ? _a : 'vertical';
            },
            get parent() {
                const parent = findVirtualAncestor(record.parent);
                return parent ? driver.getNestedTarget(parent) : null;
            },
            getOffset: () => { var _a; return driver.readVirtualViewport(record, (_a = record.handle.virtualDirection) !== null && _a !== void 0 ? _a : 'vertical')
                .offset; },
            getMaxOffset: () => {
                var _a, _b;
                const direction = (_a = record.handle.virtualDirection) !== null && _a !== void 0 ? _a : 'vertical';
                const viewport = driver.readVirtualViewport(record, direction);
                return Math.max(0, ((_b = record.handle.virtualContentMainSize) !== null && _b !== void 0 ? _b : 0) - viewport.mainSize);
            },
            scrollBy: (delta) => {
                var _a, _b, _c;
                var _d, _e;
                if (record.handle.plainScroll && !record.handle.scrollEnabled)
                    return 0;
                driver.interruptInitial(record);
                const direction = (_d = record.handle.virtualDirection) !== null && _d !== void 0 ? _d : 'vertical';
                if (driver.nestedScroll.phase === 'idle') {
                    const before = target.getOffset();
                    const after = Math.max(0, Math.min(target.getMaxOffset(), before + delta));
                    driver.scrollVirtualTo(record, direction, after, 0);
                    (_b = (_a = record.handle).virtualRefresh) === null || _b === void 0 ? void 0 : _b.call(_a);
                    return after - before;
                }
                return (_e = (_c = record.handle.scrollView) === null || _c === void 0 ? void 0 : _c.applyCoordinatedDelta(delta, direction)) !== null && _e !== void 0 ? _e : 0;
            },
            beginDrag: () => {
                var _a;
                if (!record.handle.plainScroll || record.handle.scrollEnabled)
                    (_a = record.handle.scrollView) === null || _a === void 0 ? void 0 : _a.beginCoordinatedDrag();
            },
            releaseDrag: () => {
                var _a;
                if (!record.handle.plainScroll || record.handle.scrollEnabled)
                    (_a = record.handle.scrollView) === null || _a === void 0 ? void 0 : _a.releaseCoordinatedDrag();
            },
            discardDrag: () => { var _a; return (_a = record.handle.scrollView) === null || _a === void 0 ? void 0 : _a.discardCoordinatedDrag(); },
            stop: () => driver.stopVirtualScroll(record),
        };
        record.handle.nestedTarget = target;
        return target;
    }
    setClick(handle, callback) {
        if (handle.click)
            handle.node.off(Button.EventType.CLICK, handle.click);
        handle.click = callback;
        if (callback)
            handle.node.on(Button.EventType.CLICK, callback);
    }
    measureText(handle, width, height) {
        var _a, _b, _c, _d;
        const p = handle.textProps;
        const font = this.assets.font(p.font, p.bold === true).entry;
        const key = `${p.value}\u0000${font.id}\u0000${p.fontSize}\u0000${p.lineHeight}\u0000${p.wrap}\u0000${width}\u0000${height}`;
        if (this.layoutProfiler)
            this.layoutProfiler.totals.textMeasureCalls++;
        if (handle.measureKey === key && handle.measured) {
            if (this.layoutProfiler)
                this.layoutProfiler.totals.textMeasureCacheHits++;
            return handle.measured;
        }
        const measured = layoutText(String((_a = p.value) !== null && _a !== void 0 ? _a : ''), font, Number((_b = p.fontSize) !== null && _b !== void 0 ? _b : 20), Number((_d = (_c = p.lineHeight) !== null && _c !== void 0 ? _c : p.fontSize) !== null && _d !== void 0 ? _d : 20), width, p.wrap !== false);
        handle.measureKey = key;
        handle.measured = { width: width !== null && width !== void 0 ? width : measured.width, height: height !== null && height !== void 0 ? height : measured.height };
        return handle.measured;
    }
    measureImage(handle) {
        var _a;
        const frame = (_a = handle.sprite) === null || _a === void 0 ? void 0 : _a.spriteFrame;
        if (!frame)
            return { width: 0, height: 0 };
        const original = frame.originalSize;
        const rect = frame.rect;
        const useTrimmed = handle.imageIntrinsic === 'trimmed';
        return useTrimmed
            ? { width: rect.width, height: rect.height }
            : { width: original.width || rect.width, height: original.height || rect.height };
    }
    writeRecord(record, parentTransform) {
        var _a;
        var _b, _c, _d;
        if (this.layoutProfiler)
            this.layoutProfiler.totals.writeVisits++;
        const handle = record.handle;
        const frame = handle.flex.frame;
        const sizeChanged = !same(frame.width, handle.lastRect.width) ||
            !same(frame.height, handle.lastRect.height);
        const previousOffset = sizeChanged && handle.scrollView
            ? Number.isFinite(handle.lastRect.width)
                ? this.readVirtualViewport(record, (_b = handle.virtualDirection) !== null && _b !== void 0 ? _b : 'vertical').offset
                : 0
            : undefined;
        const shouldBeActive = handle.visible && !handle.flex.hidden;
        if (!shouldBeActive) {
            if (handle.node.active)
                handle.node.active = false;
            if (handle.inputDisplay && handle.inputDisplay.node.parent !== handle.node)
                handle.inputDisplay.node.active = false;
            this.hideDetachedDescendants(record);
            return;
        }
        if (sizeChanged) {
            if (this.layoutProfiler)
                this.layoutProfiler.totals.sizeWrites++;
            handle.transform.setContentSize(frame.width, frame.height);
            handle.lastRect.width = frame.width;
            handle.lastRect.height = frame.height;
        }
        const parentSize = parentTransform.contentSize;
        const parentAnchor = parentTransform.anchorPoint;
        const childAnchor = handle.transform.anchorPoint;
        const localX = frame.x - parentSize.width * parentAnchor.x + frame.width * childAnchor.x;
        const localY = parentSize.height * (1 - parentAnchor.y) - frame.y - frame.height * (1 - childAnchor.y);
        if (!same(localX, handle.lastRect.x) || !same(localY, handle.lastRect.y)) {
            if (this.layoutProfiler)
                this.layoutProfiler.totals.positionWrites++;
            handle.lastRect.x = localX;
            handle.lastRect.y = localY;
            this.writePresentation(handle, false);
        }
        if (handle.label)
            this.writeLabel(handle);
        if (handle.node.active !== shouldBeActive)
            handle.node.active = shouldBeActive;
        if (handle.editBox)
            this.writeEditBox(handle);
        if ((_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating) {
            this.writeFloating(record);
        }
        else if (handle.virtualContent) {
            if (handle.plainScroll)
                this.writePlainScroll(record);
            else
                this.writeVirtualChildren(record);
            // ScrollView centers its content when viewport geometry changes.
            // Preserve the logical leading-edge offset used by every Provider.
            const requestedOffset = (_c = handle.pendingScrollOffset) !== null && _c !== void 0 ? _c : previousOffset;
            handle.pendingScrollOffset = undefined;
            if (requestedOffset !== undefined)
                this.scrollVirtualTo(record, (_d = handle.virtualDirection) !== null && _d !== void 0 ? _d : 'vertical', requestedOffset, 0);
        }
        else {
            for (const child of record.children)
                this.writeRecord(child, handle.transform);
        }
    }
    writeEditBox(handle) {
        const edit = handle.editBox;
        if (!(edit === null || edit === void 0 ? void 0 : edit.textLabel) || !edit.placeholderLabel || !handle.inputDisplay)
            return;
        const width = Math.max(0, handle.transform.width);
        const height = Math.max(0, handle.transform.height);
        const inset = Math.min(12, width / 2);
        const labelWidth = Math.max(0, width - inset * 2);
        const font = this.assets.font(undefined, false).native;
        for (const label of [edit.textLabel, edit.placeholderLabel]) {
            const transform = label.getComponent(UITransform);
            transform.setContentSize(labelWidth, height);
            label.node.setPosition(-width / 2 + inset, height / 2, 0);
            if (label.font !== font)
                label.font = font;
        }
        const displayTransform = handle.inputDisplay.getComponent(UITransform);
        displayTransform.setAnchorPoint(0.5, 0.5);
        displayTransform.setContentSize(labelWidth, height);
        const hostParent = handle.node.parent;
        if (hostParent && handle.inputDisplay.node.parent !== hostParent) {
            handle.inputDisplay.node.setParent(hostParent);
        }
        if (hostParent) {
            const displayIndex = Math.min(hostParent.children.length - 1, handle.node.getSiblingIndex() + 1);
            if (handle.inputDisplay.node.getSiblingIndex() !== displayIndex)
                handle.inputDisplay.node.setSiblingIndex(displayIndex);
        }
        handle.inputDisplay.node.setPosition(handle.node.position);
        handle.inputDisplay.node.active = handle.node.activeInHierarchy && !handle.inputEditing;
        if (handle.inputDisplay.font !== font)
            handle.inputDisplay.font = font;
        // Keep engine-native Label rendering authoritative even before the
        // platform EditBox overlay has been focused for the first time.
        edit.textLabel.string = edit.string;
        edit.placeholderLabel.string = edit.string ? '' : edit.placeholder;
        const displayStyle = edit.string ? edit.textLabel : edit.placeholderLabel;
        handle.inputDisplay.string = edit.string || edit.placeholder;
        handle.inputDisplay.fontSize = displayStyle.fontSize;
        handle.inputDisplay.lineHeight = displayStyle.lineHeight;
        handle.inputDisplay.horizontalAlign = displayStyle.horizontalAlign;
        handle.inputDisplay.color = displayStyle.color;
        edit.textLabel.updateRenderData(true);
        edit.placeholderLabel.updateRenderData(true);
        handle.inputDisplay.updateRenderData(true);
    }
    writePlainScroll(record) {
        var _a;
        const handle = record.handle;
        const content = handle.virtualContent;
        const direction = (_a = handle.virtualDirection) !== null && _a !== void 0 ? _a : 'vertical';
        const viewportMain = direction === 'vertical' ? handle.transform.height : handle.transform.width;
        const cross = direction === 'vertical' ? handle.transform.width : handle.transform.height;
        const child = record.children[0];
        let main = viewportMain;
        if (child) {
            main = (this.layoutProfiler
                ? this.layoutProfiler.layout(() => layoutScrollContent(child.handle.flex, direction, viewportMain, cross))
                : layoutScrollContent(child.handle.flex, direction, viewportMain, cross)).mainSize;
        }
        handle.virtualContentMainSize = main;
        handle.scrollEnabled = main > viewportMain + 0.5;
        if (handle.scrollView) {
            handle.scrollView.enabled = handle.scrollEnabled;
            if (!handle.scrollEnabled) {
                handle.scrollView.stopAutoScroll();
                handle.scrollView.scrollToOffset(new Vec2(0, 0), 0, true);
            }
        }
        content.transform.setContentSize(direction === 'vertical' ? cross : main, direction === 'vertical' ? main : cross);
        if (child)
            this.writeRecord(child, content.transform);
    }
    writeFloating(record) {
        var _a, _b, _c, _d, _e, _f;
        var _g, _h, _j;
        const panel = this.floatingPanel(record);
        const localAnchor = this.floatingAnchorRecord(record);
        if (localAnchor)
            this.writeRecord(localAnchor, record.handle.transform);
        if (!panel)
            return;
        const open = ((_a = record.handle.controlProps) === null || _a === void 0 ? void 0 : _a.open) === true;
        const anchorRect = this.floatingAnchorRect(record);
        if (!open || !anchorRect || !this.isRecordVisible(record)) {
            panel.handle.node.active = false;
            if (record.handle.floatingBlocker)
                record.handle.floatingBlocker.active = false;
            return;
        }
        const overlayRoot = (_g = (_b = this.root) === null || _b === void 0 ? void 0 : _b.handle.node) !== null && _g !== void 0 ? _g : this.container;
        const overlayTransform = overlayRoot.getComponent(UITransform);
        const placement = placeFloating(anchorRect, panel.handle.flex.frame, {
            width: overlayTransform.width,
            height: overlayTransform.height,
        }, {
            placement: (_c = record.handle.controlProps) === null || _c === void 0 ? void 0 : _c.placement,
            align: (_d = record.handle.controlProps) === null || _d === void 0 ? void 0 : _d.align,
            gap: Number((_h = (_e = record.handle.controlProps) === null || _e === void 0 ? void 0 : _e.gap) !== null && _h !== void 0 ? _h : 14),
            viewportPadding: Number((_j = (_f = record.handle.controlProps) === null || _f === void 0 ? void 0 : _f.viewportPadding) !== null && _j !== void 0 ? _j : 16),
        });
        Object.assign(panel.handle.flex.frame, placement);
        const blocker = this.ensureFloatingBlocker(record, overlayRoot, overlayTransform);
        blocker.active = true;
        blocker.setSiblingIndex(Math.max(0, overlayRoot.children.length - 2));
        panel.handle.node.active = true;
        panel.handle.node.setSiblingIndex(overlayRoot.children.length - 1);
        this.writeRecord(panel, overlayTransform);
    }
    floatingPanel(record) {
        var _a;
        const behavior = (_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating;
        return behavior ? record.children[behavior.panelIndex] : undefined;
    }
    floatingAnchorRecord(record) {
        var _a;
        const behavior = (_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating;
        if (!behavior || behavior.anchor !== 'child' || behavior.anchorIndex === undefined)
            return undefined;
        const anchor = record.children[behavior.anchorIndex];
        return anchor && this.isRecordVisible(anchor) ? anchor : undefined;
    }
    floatingAnchorRect(record) {
        var _a, _b;
        const behavior = (_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating;
        if (!behavior)
            return undefined;
        if (behavior.anchor === 'child') {
            const anchor = this.floatingAnchorRecord(record);
            return anchor ? this.globalRect(anchor) : undefined;
        }
        const rect = (_b = record.handle.controlProps) === null || _b === void 0 ? void 0 : _b.anchorRect;
        if (!rect ||
            ![rect.x, rect.y, rect.width, rect.height].every((value) => typeof value === 'number' && Number.isFinite(value)))
            return undefined;
        return rect;
    }
    topFloating() {
        return [...this.records.values()]
            .filter((record) => { var _a; return ((_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating) &&
            record.props.open === true &&
            this.isRecordVisible(record); })
            .sort((left, right) => { var _a, _b; return ((_a = right.handle.floatingOrder) !== null && _a !== void 0 ? _a : 0) - ((_b = left.handle.floatingOrder) !== null && _b !== void 0 ? _b : 0); })[0];
    }
    refreshFloatings() {
        var _a, _b;
        for (const record of this.records.values())
            if (((_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating) && ((_b = record.handle.controlProps) === null || _b === void 0 ? void 0 : _b.open) === true)
                this.writeFloating(record);
    }
    ensureFloatingBlocker(record, overlayRoot, overlayTransform) {
        var _a;
        if ((_a = record.handle.floatingBlocker) === null || _a === void 0 ? void 0 : _a.isValid) {
            record.handle.floatingBlocker
                .getComponent(UITransform)
                .setContentSize(overlayTransform.contentSize);
            return record.handle.floatingBlocker;
        }
        const blocker = new Node(`floating-blocker:${record.planId}`);
        blocker.layer = this.container.layer;
        blocker.setParent(overlayRoot);
        blocker.addComponent(UITransform).setContentSize(overlayTransform.contentSize);
        const sprite = blocker.addComponent(Sprite);
        sprite.spriteFrame = this.fillFrame;
        sprite.color = new Color(255, 255, 255, 1);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        blocker.addComponent(Button).transition = Button.Transition.NONE;
        blocker.on(Node.EventType.TOUCH_END, (event) => {
            var _a, _b;
            event.propagationStopped = true;
            if (this.topFloating() === record)
                (_b = (_a = record.handle.controlProps) === null || _a === void 0 ? void 0 : _a.onOpenChange) === null || _b === void 0 ? void 0 : _b.call(_a, false);
        });
        record.handle.floatingBlocker = blocker;
        return blocker;
    }
    globalRect(record) {
        var _a;
        let x = record.handle.flex.frame.x;
        let y = record.handle.flex.frame.y;
        for (let parent = record.parent; parent; parent = parent.parent) {
            x += parent.handle.flex.frame.x;
            y += parent.handle.flex.frame.y;
            if (parent.handle.scrollView) {
                const direction = (_a = parent.handle.virtualDirection) !== null && _a !== void 0 ? _a : 'vertical';
                const offset = this.readVirtualViewport(parent, direction).offset;
                if (direction === 'vertical')
                    y -= offset;
                else
                    x -= offset;
            }
        }
        return Object.assign(Object.assign({}, record.handle.flex.frame), { x, y });
    }
    hideDetachedDescendants(record) {
        var _a;
        if ((_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating) {
            const panel = this.floatingPanel(record);
            if (panel === null || panel === void 0 ? void 0 : panel.handle.node.active)
                panel.handle.node.active = false;
            if (record.handle.floatingBlocker)
                record.handle.floatingBlocker.active = false;
        }
        for (const child of record.children)
            this.hideDetachedDescendants(child);
    }
    writeLabel(handle) {
        var _a, _b, _c, _d, _e;
        if (this.layoutProfiler)
            this.layoutProfiler.totals.labelLayouts++;
        const label = handle.label, p = handle.textProps, frame = handle.flex.frame;
        const font = this.assets.font(p.font, p.bold === true);
        const text = layoutText(String((_a = p.value) !== null && _a !== void 0 ? _a : ''), font.entry, Number((_b = p.fontSize) !== null && _b !== void 0 ? _b : 20), Number((_d = (_c = p.lineHeight) !== null && _c !== void 0 ? _c : p.fontSize) !== null && _d !== void 0 ? _d : 20), frame.width, p.wrap !== false);
        const values = {
            string: text.lines.join('\n'),
            fontSize: text.fontSize,
            lineHeight: text.lineHeight,
            isBold: p.bold === true && font.entry.weight < 700,
            enableWrapText: false,
            horizontalAlign: horizontalAlignment(p.horizontalAlign),
            verticalAlign: verticalAlignment(p.verticalAlign),
            overflow: p.overflow === 'shrink' ? Label.Overflow.SHRINK : Label.Overflow.CLAMP,
            outlineWidth: clampNumber(p.outlineWidth, 0, 32, 0),
            enableOutline: Number((_e = p.outlineWidth) !== null && _e !== void 0 ? _e : 0) > 0,
            cacheMode: p.cacheMode === 'char'
                ? Label.CacheMode.CHAR
                : p.cacheMode === 'bitmap'
                    ? Label.CacheMode.BITMAP
                    : Label.CacheMode.NONE,
        };
        const assign = (key, value) => {
            if (label[key] !== value)
                label[key] = value;
        };
        for (const key of Object.keys(values))
            assign(key, values[key]);
        const color = parseColor(p.color, Color.WHITE), outlineColor = parseColor(p.outlineColor, Color.BLACK);
        if (!label.color.equals(color))
            label.color = color;
        if (!label.outlineColor.equals(outlineColor))
            label.outlineColor = outlineColor;
        // font's native setter forces render data immediately. Set it once, last,
        // after text, style AND UITransform size; never rasterize default "label".
        if (label.font !== font.native)
            label.font = font.native;
    }
    writeVirtualChildren(record) {
        var _a, _b, _c, _d;
        const handle = record.handle;
        const content = handle.virtualContent;
        const direction = (_a = handle.virtualDirection) !== null && _a !== void 0 ? _a : 'vertical';
        const mainSize = Math.max(direction === 'vertical'
            ? handle.transform.contentSize.height
            : handle.transform.contentSize.width, (_b = handle.virtualContentMainSize) !== null && _b !== void 0 ? _b : 0);
        const crossSize = direction === 'vertical'
            ? handle.transform.contentSize.width
            : handle.transform.contentSize.height;
        const viewportMain = direction === 'vertical'
            ? handle.transform.contentSize.height
            : handle.transform.contentSize.width;
        if (!same((_c = handle.lastVirtualViewportMain) !== null && _c !== void 0 ? _c : Number.NaN, viewportMain) ||
            !same((_d = handle.lastVirtualViewportCross) !== null && _d !== void 0 ? _d : Number.NaN, crossSize)) {
            handle.lastVirtualViewportMain = viewportMain;
            handle.lastVirtualViewportCross = crossSize;
            this.scheduleFlush(() => { var _a; return (_a = handle.virtualRefresh) === null || _a === void 0 ? void 0 : _a.call(handle); });
        }
        content.transform.setContentSize(direction === 'vertical' ? crossSize : mainSize, direction === 'vertical' ? mainSize : crossSize);
        for (const child of record.children) {
            if (child.props.__virtualParked === true) {
                this.setVirtualParked(child.handle, true);
                continue;
            }
            this.setVirtualParked(child.handle, false);
            const itemMain = readFiniteNumber(child.props.__virtualMainSize, 0);
            const itemCross = readFiniteNumber(child.props.__virtualCrossSize, crossSize);
            const mainOffset = readFiniteNumber(child.props.__virtualMainOffset, 0);
            const crossOffset = readFiniteNumber(child.props.__virtualCrossOffset, 0);
            const width = direction === 'vertical' ? itemCross : itemMain;
            const height = direction === 'vertical' ? itemMain : itemCross;
            if (this.layoutProfiler)
                this.layoutProfiler.layout(() => layoutFlexTree(child.handle.flex, width, height));
            else
                layoutFlexTree(child.handle.flex, width, height);
            child.handle.flex.frame.x = direction === 'vertical' ? crossOffset : mainOffset;
            child.handle.flex.frame.y = direction === 'vertical' ? mainOffset : crossOffset;
            child.handle.flex.frame.width = width;
            child.handle.flex.frame.height = height;
            this.writeRecord(child, child.props.__virtualSticky === true ? handle.transform : content.transform);
        }
    }
    setVirtualParked(handle, parked) {
        var _a;
        if (handle.virtualParked === parked)
            return;
        if (parked) {
            const enabledRenderers = [];
            const pending = [handle.node];
            while (pending.length > 0) {
                const node = pending.pop();
                for (const renderer of node.getComponents(UIRenderer)) {
                    if (!renderer.enabled)
                        continue;
                    renderer.enabled = false;
                    enabledRenderers.push(renderer);
                }
                pending.push(...node.children);
            }
            handle.parkedRenderers = enabledRenderers;
            handle.node.setPosition(-1000000, -1000000, 0);
            handle.lastRect.x = Number.NaN;
            handle.lastRect.y = Number.NaN;
        }
        else {
            for (const renderer of (_a = handle.parkedRenderers) !== null && _a !== void 0 ? _a : []) {
                if (renderer.isValid)
                    renderer.enabled = true;
            }
            handle.parkedRenderers = undefined;
        }
        handle.virtualParked = parked;
    }
}
function createFillFrame() {
    const texture = new Texture2D();
    texture.reset({ width: 8, height: 8, format: Texture2D.PixelFormat.RGBA8888, mipmapLevel: 1 });
    const bytes = new Uint8Array(8 * 8 * 4);
    bytes.fill(255);
    texture.uploadData(bytes);
    const frame = new SpriteFrame();
    frame.texture = texture;
    frame.packable = false;
    frame.originalSize = new Size(64, 64);
    frame.insetLeft = 2;
    frame.insetRight = 2;
    frame.insetTop = 2;
    frame.insetBottom = 2;
    return frame;
}
function horizontalAlignment(value) {
    if (value === 'center')
        return HorizontalTextAlignment.CENTER;
    if (value === 'right')
        return HorizontalTextAlignment.RIGHT;
    return HorizontalTextAlignment.LEFT;
}
function verticalAlignment(value) {
    if (value === 'center')
        return VerticalTextAlignment.CENTER;
    if (value === 'bottom')
        return VerticalTextAlignment.BOTTOM;
    return VerticalTextAlignment.TOP;
}
function parseColor(value, fallback) {
    return typeof value === 'string' ? new Color(value) : fallback.clone();
}
function clampNumber(value, min, max, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(min, Math.min(max, value))
        : fallback;
}
function detachedPercentage(value, parent) {
    if (typeof value !== 'string' || value === 'auto')
        return undefined;
    const percent = Number.parseFloat(value);
    return Number.isFinite(percent) ? Math.max(0, (parent * percent) / 100) : undefined;
}
function readFiniteNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function findVirtualAncestor(record) {
    var _a;
    let cursor = record;
    while (cursor) {
        if ((_a = cursor.behavior) === null || _a === void 0 ? void 0 : _a.floating)
            return null;
        if (cursor.handle.scrollView)
            return cursor;
        cursor = cursor.parent;
    }
    return null;
}
function hasSameDirectionAncestor(target) {
    for (let current = target.parent; current; current = current.parent) {
        if (current.direction === target.direction)
            return true;
    }
    return false;
}
function same(a, b) {
    return Math.abs(a - b) < 0.001;
}
function now() {
    var _a, _b;
    var _c;
    return (_c = (_b = (_a = globalThis.performance) === null || _a === void 0 ? void 0 : _a.now) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : Date.now();
}
