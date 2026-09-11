import { paintSnapshotElement } from './frozen-snapshot.js';
import { createFlexNode } from '../core/flex-types.js';
import { layoutFlexTree, layoutFlexTreeIntrinsic, layoutScrollContent, measureScrollContent, } from '../core/flex-layout.js';
import { layoutText, inspectRecord } from '../core/provider.js';
import { HostFrameScheduler, normalizeRangeValue, placeFloating } from '../core/host-plan.js';
import { NestedScrollCoordinator } from '../core/nested-scroll.js';
import { ScrollMotion } from './scroll-motion.js';
export class DOMHostDriver {
    constructor(container, assets, width, height, anchorsChanged = () => { }, scrollChanged = undefined) {
        this.container = container;
        this.assets = assets;
        this.width = width;
        this.height = height;
        this.anchorsChanged = anchorsChanged;
        this.scrollChanged = scrollChanged;
        this.metrics = {
            dirtyRoots: 0,
            measuredLeaves: 0,
            percentageFallbacks: 0,
            layoutPasses: 0,
            layoutMs: 0,
            writebackMs: 0,
        };
        this.records = new Map();
        this.created = new Set();
        this.callbacks = [];
        this.nested = new NestedScrollCoordinator();
        this.glyphs = new Map();
        this.root = null;
        this.dirty = false;
        this.paint = new Set();
        this.frame = 0;
        this.animation = 0;
        this.activeMotions = new Set();
        this.disposed = false;
        this.suppressClick = false;
        this.clickReset = 0;
        this.consumeClick = false;
        this.consumeClickReset = 0;
        this.surfaceActivity = 'active';
        this.onPointerMove = (event) => { var _a; return (_a = this.pointerMove) === null || _a === void 0 ? void 0 : _a.call(this, event); };
        this.onPointerEnd = (event) => {
            var _a;
            this.releasePressedButton(event);
            (_a = this.pointerEnd) === null || _a === void 0 ? void 0 : _a.call(this, event);
            if (this.consumeClick) {
                this.window.clearTimeout(this.consumeClickReset);
                this.consumeClickReset = this.window.setTimeout(() => {
                    this.consumeClick = false;
                    this.consumeClickReset = 0;
                }, 0);
            }
        };
        this.onClickCapture = (event) => {
            if (!this.consumeClick)
                return;
            this.consumeClick = false;
            this.window.clearTimeout(this.consumeClickReset);
            this.consumeClickReset = 0;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        };
        this.floatingSequence = 0;
        this.onResize = () => {
            if (this.root && !this.disposed)
                this.write(this.root);
        };
        this.window = container.ownerDocument.defaultView;
        this.presentation = new HostFrameScheduler(() => this.window.performance.now(), (callback) => {
            const id = this.window.requestAnimationFrame(callback);
            return () => this.window.cancelAnimationFrame(id);
        });
        this.interactionStyle = container.ownerDocument.createElement('style');
        this.interactionStyle.textContent =
            '[data-uniflex-interaction="press"]{appearance:none;font:inherit;color:inherit}';
        container.append(this.interactionStyle);
        this.window.addEventListener('resize', this.onResize);
        this.window.addEventListener('pointermove', this.onPointerMove, true);
        this.window.addEventListener('pointerup', this.onPointerEnd, true);
        this.window.addEventListener('pointercancel', this.onPointerEnd, true);
        container.ownerDocument.addEventListener('click', this.onClickCapture, true);
    }
    create(kind, planId, behavior) {
        const element = this.container.ownerDocument.createElement(kind === 'input' ? 'input' : (behavior === null || behavior === void 0 ? void 0 : behavior.interaction) === 'press' ? 'button' : 'div');
        element.dataset.planId = String(planId);
        element.dataset.kind = kind;
        element.style.cssText =
            'position:absolute;box-sizing:border-box;margin:0;padding:0;border:0;border-radius:0;background:transparent;outline:none;pointer-events:none;';
        const handle = {
            element,
            flex: createFlexNode(),
            props: {},
            disposers: [],
            visible: true,
            offset: 0,
            overscroll: 0,
            direction: 'vertical',
            contentMain: 0,
        };
        this.created.add(handle);
        if (kind === 'input') {
            const input = (handle.input = element);
            input.style.pointerEvents = 'auto';
            input.style.padding = '0 12px';
            input.autocomplete = 'off';
            input.spellcheck = false;
            const emit = () => { var _a, _b; return (_b = (_a = handle.props).onInput) === null || _b === void 0 ? void 0 : _b.call(_a, input.value); };
            const listen = (event, callback) => {
                input.addEventListener(event, callback);
                handle.disposers.push(() => input.removeEventListener(event, callback));
            };
            listen('compositionstart', () => {
                handle.composing = true;
            });
            listen('compositionend', () => {
                handle.composing = false;
                emit();
            });
            listen('input', () => {
                if (!handle.composing)
                    emit();
            });
            listen('keydown', (event) => {
                var _a, _b, _c, _d;
                const key = event;
                if (key.key === 'Enter' && !key.isComposing && !handle.composing) {
                    (_b = (_a = handle.props).onSubmit) === null || _b === void 0 ? void 0 : _b.call(_a);
                    (_d = (_c = handle.props).onCommit) === null || _d === void 0 ? void 0 : _d.call(_c, input.value);
                }
            });
            listen('focus', () => {
                var _a, _b;
                input.style.outline = '2px solid #78dbc8';
                (_b = (_a = handle.props).onFocus) === null || _b === void 0 ? void 0 : _b.call(_a);
            });
            listen('blur', () => {
                var _a, _b, _c, _d;
                input.style.outline = 'none';
                (_b = (_a = handle.props).onCommit) === null || _b === void 0 ? void 0 : _b.call(_a, input.value);
                (_d = (_c = handle.props).onBlur) === null || _d === void 0 ? void 0 : _d.call(_c);
            });
            handle.flex.measure = () => { var _a; return ({
                width: 200,
                height: Number((_a = handle.props.fontSize) !== null && _a !== void 0 ? _a : 24) + 24,
            }); };
        }
        else if (kind === 'text') {
            handle.text = this.container.ownerDocument.createElement('span');
            handle.text.style.cssText =
                'position:absolute;display:block;white-space:pre;font-kerning:none;font-variant-ligatures:none;paint-order:stroke fill;';
            // Keep semantic text in the DOM; a retained glyph surface avoids browser
            // line-box/subpixel differences from the native Label raster path.
            handle.text.style.clipPath = 'inset(100%)';
            handle.textCanvas = this.container.ownerDocument.createElement('canvas');
            handle.textCanvas.setAttribute('aria-hidden', 'true');
            handle.textCanvas.style.cssText =
                'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
            element.append(handle.textCanvas);
            element.append(handle.text);
            handle.flex.measure = (constraint) => {
                var _a, _b, _c, _d, _e, _f;
                const p = handle.props, font = this.assets.font(p.font, p.bold === true).entry;
                const measured = layoutText(String((_a = p.value) !== null && _a !== void 0 ? _a : ''), font, Number((_b = p.fontSize) !== null && _b !== void 0 ? _b : 20), Number((_d = (_c = p.lineHeight) !== null && _c !== void 0 ? _c : p.fontSize) !== null && _d !== void 0 ? _d : 20), constraint.width, p.wrap !== false);
                return {
                    width: (_e = constraint.width) !== null && _e !== void 0 ? _e : measured.width,
                    height: (_f = constraint.height) !== null && _f !== void 0 ? _f : measured.height,
                };
            };
        }
        else if (kind === 'image') {
            handle.image = this.container.ownerDocument.createElement('canvas');
            handle.image.setAttribute('aria-hidden', 'true');
            handle.image.style.cssText =
                'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
            element.append(handle.image);
            handle.flex.measure = () => {
                if (!handle.props.source)
                    return { width: 64, height: 64 };
                const entry = this.assets.resolve(handle.props.source)
                    .entry;
                return { width: entry.width, height: entry.height };
            };
        }
        else if (kind === 'scroll-view' || kind === 'virtual-list') {
            // `overflow: hidden` still allows focus/scrollIntoView to mutate the
            // browser's native scrollTop behind the retained logical offset.
            element.style.overflow = 'clip';
            element.style.pointerEvents = 'auto';
            element.style.touchAction = 'none';
            element.dataset.uniflexDirection = 'vertical';
            handle.plainScroll = kind === 'scroll-view';
            handle.content = this.container.ownerDocument.createElement('div');
            handle.content.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
            element.append(handle.content);
        }
        if ((behavior === null || behavior === void 0 ? void 0 : behavior.interaction) === 'press') {
            element.dataset.uniflexInteraction = 'press';
            element.style.pointerEvents = 'auto';
            element.style.cursor = 'pointer';
            const press = (pressed, pointerId) => {
                var _a, _b, _c;
                if (handle.props.interactable === false || handle.pressed === pressed)
                    return;
                if (pressed && pointerId !== undefined) {
                    this.releasePressedButton();
                    this.pressedButton = { handle, pointerId };
                }
                else if (!pressed && ((_a = this.pressedButton) === null || _a === void 0 ? void 0 : _a.handle) === handle) {
                    this.pressedButton = undefined;
                }
                handle.pressed = pressed;
                (_c = (_b = handle.props).onPressChange) === null || _c === void 0 ? void 0 : _c.call(_b, pressed);
            };
            const down = (event) => {
                const pointer = event;
                if (pointer.button !== 0)
                    return;
                press(true, pointer.pointerId);
            };
            const up = () => press(false);
            const keydown = (event) => {
                const key = event;
                if (key.key === 'Enter' || key.key === ' ')
                    press(true);
            };
            const keyup = (event) => {
                const key = event;
                if (key.key === 'Enter' || key.key === ' ')
                    press(false);
            };
            element.addEventListener('pointerdown', down);
            element.addEventListener('pointerup', up);
            element.addEventListener('pointercancel', up);
            element.addEventListener('pointerleave', up);
            element.addEventListener('keydown', keydown);
            element.addEventListener('keyup', keyup);
            handle.disposers.push(() => element.removeEventListener('pointerdown', down), () => element.removeEventListener('pointerup', up), () => element.removeEventListener('pointercancel', up), () => element.removeEventListener('pointerleave', up), () => element.removeEventListener('keydown', keydown), () => element.removeEventListener('keyup', keyup));
            const click = (event) => {
                var _a, _b;
                if (this.suppressClick) {
                    event.preventDefault();
                    return;
                }
                if (handle.props.interactable !== false)
                    (_b = (_a = handle.props).onClick) === null || _b === void 0 ? void 0 : _b.call(_a);
            };
            element.addEventListener('click', click);
            handle.disposers.push(() => element.removeEventListener('click', click));
        }
        else if ((behavior === null || behavior === void 0 ? void 0 : behavior.interaction) === 'range') {
            element.dataset.uniflexInteraction = 'range';
            element.style.pointerEvents = 'auto';
            element.style.touchAction = 'none';
            element.tabIndex = 0;
            element.setAttribute('role', 'slider');
            const valueAt = (event) => {
                var _a, _b, _c;
                const rect = element.getBoundingClientRect();
                const min = Number((_a = handle.props.min) !== null && _a !== void 0 ? _a : 0);
                const max = Number((_b = handle.props.max) !== null && _b !== void 0 ? _b : 100);
                const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                return normalizeRangeValue(min + ratio * (max - min), min, max, Number((_c = handle.props.step) !== null && _c !== void 0 ? _c : 1));
            };
            const down = (event) => {
                var _a;
                if (handle.props.interactable === false)
                    return;
                const pointer = event;
                if (pointer.button !== 0)
                    return;
                pointer.preventDefault();
                pointer.stopPropagation();
                (_a = element.setPointerCapture) === null || _a === void 0 ? void 0 : _a.call(element, pointer.pointerId);
                const update = (next) => {
                    var _a, _b;
                    const value = valueAt(next);
                    handle.rangeValue = value;
                    (_b = (_a = handle.props).onChange) === null || _b === void 0 ? void 0 : _b.call(_a, value);
                    this.writeRange(handle);
                };
                update(pointer);
                this.pointerMove = update;
                this.pointerEnd = (end) => {
                    var _a, _b, _c, _d;
                    const value = valueAt(end);
                    handle.rangeValue = value;
                    (_b = (_a = handle.props).onChange) === null || _b === void 0 ? void 0 : _b.call(_a, value);
                    (_d = (_c = handle.props).onCommit) === null || _d === void 0 ? void 0 : _d.call(_c, value);
                    this.pointerMove = undefined;
                    this.pointerEnd = undefined;
                    this.writeRange(handle);
                };
            };
            const keydown = (event) => {
                var _a, _b, _c, _d;
                var _e, _f, _g, _h;
                if (handle.props.interactable === false)
                    return;
                const key = event;
                const min = Number((_e = handle.props.min) !== null && _e !== void 0 ? _e : 0);
                const max = Number((_f = handle.props.max) !== null && _f !== void 0 ? _f : 100);
                const step = Number((_g = handle.props.step) !== null && _g !== void 0 ? _g : 1);
                const current = normalizeRangeValue(Number((_h = handle.props.value) !== null && _h !== void 0 ? _h : min), min, max, step);
                const next = key.key === 'Home'
                    ? min
                    : key.key === 'End'
                        ? max
                        : key.key === 'ArrowLeft' || key.key === 'ArrowDown'
                            ? current - step
                            : key.key === 'ArrowRight' || key.key === 'ArrowUp'
                                ? current + step
                                : undefined;
                if (next === undefined)
                    return;
                key.preventDefault();
                const value = normalizeRangeValue(next, min, max, step);
                handle.rangeValue = value;
                (_b = (_a = handle.props).onChange) === null || _b === void 0 ? void 0 : _b.call(_a, value);
                (_d = (_c = handle.props).onCommit) === null || _d === void 0 ? void 0 : _d.call(_c, value);
                this.writeRange(handle);
            };
            element.addEventListener('pointerdown', down);
            element.addEventListener('keydown', keydown);
            handle.disposers.push(() => element.removeEventListener('pointerdown', down), () => element.removeEventListener('keydown', keydown));
        }
        if (behavior === null || behavior === void 0 ? void 0 : behavior.floating) {
            const outside = (event) => {
                var _a, _b, _c, _d, _e, _f;
                if (handle.props.open !== true)
                    return;
                const record = [...this.records.values()].find((value) => value.handle === handle);
                if (!record || this.topFloating() !== record)
                    return;
                const anchor = (_a = this.floatingAnchorRecord(record)) === null || _a === void 0 ? void 0 : _a.handle.element;
                const panel = (_b = this.floatingPanel(record)) === null || _b === void 0 ? void 0 : _b.handle.element;
                const target = event.target;
                if (target && !(anchor === null || anchor === void 0 ? void 0 : anchor.contains(target)) && !(panel === null || panel === void 0 ? void 0 : panel.contains(target))) {
                    this.consumeClick = true;
                    this.window.clearTimeout(this.consumeClickReset);
                    this.consumeClickReset = 0;
                    event.preventDefault();
                    event.stopPropagation();
                    (_d = (_c = event).stopImmediatePropagation) === null || _d === void 0 ? void 0 : _d.call(_c);
                    (_f = (_e = handle.props).onOpenChange) === null || _f === void 0 ? void 0 : _f.call(_e, false);
                }
            };
            this.container.ownerDocument.addEventListener('pointerdown', outside, true);
            handle.disposers.push(() => this.container.ownerDocument.removeEventListener('pointerdown', outside, true));
        }
        return handle;
    }
    imageCanvas() {
        const canvas = this.container.ownerDocument.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        canvas.style.cssText =
            'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
        return canvas;
    }
    inspect() {
        return [...this.records.values()].map((r) => {
            const h = r.handle, node = inspectRecord(r, h.flex.frame, this.isRecordVisible(r) && r.props.__virtualParked !== true, h.content ? h.offset : undefined);
            if (!h.content)
                return node;
            return Object.assign(Object.assign({}, node), { scrollEvidence: {
                    position: h.offset - h.overscroll,
                    offset: h.offset,
                    displacement: h.overscroll,
                    maximum: Math.max(0, h.contentMain -
                        (h.direction === 'vertical' ? h.flex.frame.height : h.flex.frame.width)),
                    scrolling: this.readVirtualViewport(r, h.direction).scrolling,
                } });
        });
    }
    paintSnapshot(context) {
        if (!this.root)
            return;
        // A window can open before the pending host frame writes its source surface.
        // Freeze the current layout and raster content, never an unpainted canvas.
        this.flushLayout();
        paintSnapshotElement(context, this.root.handle.element, this.container.getBoundingClientRect(), this.width, this.height);
    }
    present(activity, order, options, transitionState) {
        var _a, _b;
        const handle = (_a = this.root) === null || _a === void 0 ? void 0 : _a.handle;
        if (!handle)
            return;
        const root = handle.element;
        (_b = this.cancelSurfaceTransition) === null || _b === void 0 ? void 0 : _b.call(this);
        this.surfaceActivity = activity;
        root.style.zIndex = String(order * 3 + 2);
        root.style.display =
            activity === 'parked' || !handle.visible || handle.flex.hidden ? 'none' : 'block';
        root.style.pointerEvents = 'none';
        root.inert = activity !== 'active' || transitionState !== 'steady';
        if (activity === 'active' && options.transition === 'fade' && transitionState !== 'steady')
            return this.fadeSurface(root, transitionState);
        root.style.transition = '';
        root.style.opacity = '1';
    }
    fadeSurface(root, transitionState) {
        const entering = transitionState === 'entering';
        root.style.transition = 'none';
        root.style.opacity = entering ? '0' : '1';
        // Force the starting opacity into the current style generation.
        void root.offsetWidth;
        return new Promise((resolve) => {
            let settled = false;
            let timer = 0;
            const frame = this.window.requestAnimationFrame(() => {
                if (settled || this.disposed)
                    return;
                root.style.transition = 'opacity 120ms ease';
                root.style.opacity = entering ? '1' : '0';
                timer = this.window.setTimeout(finish, 140);
            });
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                this.window.cancelAnimationFrame(frame);
                if (timer)
                    this.window.clearTimeout(timer);
                if (this.cancelSurfaceTransition === cancel)
                    this.cancelSurfaceTransition = undefined;
                if (entering && !this.disposed && this.surfaceActivity === 'active')
                    root.inert = false;
                resolve();
            };
            const cancel = () => finish();
            this.cancelSurfaceTransition = cancel;
        });
    }
    validate(commands) {
        const ids = new Set(this.records.keys());
        for (const c of commands) {
            if (c.type === 'create') {
                if (c.record.kind === 'image' && !c.record.props.source)
                    throw new Error('Image requires a prepared ImageRef source.');
                if (ids.has(c.record.recordId))
                    throw new Error('Duplicate host record');
                ids.add(c.record.recordId);
            }
            else if (!ids.has(('record' in c ? c.record : c.child).recordId))
                throw new Error(`Unknown host record: ${c.type}`);
        }
    }
    commit(commands) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        var _m, _o, _p, _q;
        for (const c of commands) {
            if (c.type === 'create') {
                this.records.set(c.record.recordId, c.record);
                if (c.record.handle.plainScroll)
                    c.record.handle.flex.measure = (constraint) => {
                        var _a, _b;
                        const child = c.record.children[0];
                        return child
                            ? measureScrollContent(child.handle.flex, c.record.handle.direction, constraint)
                            : {
                                width: (_a = constraint.width) !== null && _a !== void 0 ? _a : 0,
                                height: (_b = constraint.height) !== null && _b !== void 0 ? _b : 0,
                            };
                    };
                if (c.record.handle.content)
                    this.bindInput(c.record);
            }
            else if (c.type === 'update')
                this.property(c.record, c.property, c.value);
            else if (c.type === 'visibility') {
                c.record.handle.visible = c.visible;
                c.record.handle.flex.style = Object.assign(Object.assign({}, c.record.handle.flex.style), { display: c.visible ? 'flex' : 'none' });
                if (!c.visible)
                    this.hideDetachedDescendants(c.record);
                this.dirty = true;
            }
            else if (c.type === 'insert' || c.type === 'move') {
                const parent = (_a = c.parent) === null || _a === void 0 ? void 0 : _a.handle, child = c.child.handle;
                const floatingPanel = ((_c = (_b = c.parent) === null || _b === void 0 ? void 0 : _b.behavior) === null || _c === void 0 ? void 0 : _c.floating) !== undefined &&
                    c.index === c.parent.behavior.floating.panelIndex;
                const target = floatingPanel
                    ? ((_m = (_d = this.root) === null || _d === void 0 ? void 0 : _d.handle.element) !== null && _m !== void 0 ? _m : this.container)
                    : ((_p = (_o = parent === null || parent === void 0 ? void 0 : parent.content) !== null && _o !== void 0 ? _o : parent === null || parent === void 0 ? void 0 : parent.element) !== null && _p !== void 0 ? _p : this.container);
                // Internal text/image/content elements are not HostRecord children.
                const siblings = (_q = (_e = c.parent) === null || _e === void 0 ? void 0 : _e.children) !== null && _q !== void 0 ? _q : [];
                const next = (_f = siblings[c.index + 1]) === null || _f === void 0 ? void 0 : _f.handle.element;
                target.insertBefore(child.element, (next === null || next === void 0 ? void 0 : next.parentElement) === target ? next : null);
                if (parent && !parent.content) {
                    const i = parent.flex.children.indexOf(child.flex);
                    if (i >= 0)
                        parent.flex.children.splice(i, 1);
                    if (!floatingPanel) {
                        const panelIndex = (_j = (_h = (_g = c.parent) === null || _g === void 0 ? void 0 : _g.behavior) === null || _h === void 0 ? void 0 : _h.floating) === null || _j === void 0 ? void 0 : _j.panelIndex;
                        const flexIndex = panelIndex !== undefined && panelIndex < c.index
                            ? c.index - 1
                            : c.index;
                        parent.flex.children.splice(flexIndex, 0, child.flex);
                    }
                }
                if (!c.parent)
                    this.root = c.child;
                this.dirty = true;
            }
            else if (c.type === 'remove') {
                const children = (_k = c.parent) === null || _k === void 0 ? void 0 : _k.handle.flex.children;
                if (children) {
                    const i = children.indexOf(c.child.handle.flex);
                    if (i >= 0)
                        children.splice(i, 1);
                }
                c.child.handle.element.remove();
                this.dirty = true;
            }
            else if (c.type === 'destroy') {
                if (((_l = this.pressedButton) === null || _l === void 0 ? void 0 : _l.handle) === c.record.handle)
                    this.releasePressedButton();
                this.stopVirtualScroll(c.record);
                for (const dispose of c.record.handle.disposers)
                    dispose();
                c.record.handle.element.remove();
                this.records.delete(c.record.recordId);
                this.created.delete(c.record.handle);
                if (this.root === c.record)
                    this.root = null;
                this.paint.delete(c.record.handle);
            }
        }
        try {
            // Geometry writes already repaint the tree. A paint-only commit has
            // no Core layout callback, so submit its changed renderers here.
            if (!this.dirty) {
                for (const handle of this.paint) {
                    if (handle.text)
                        this.writeText(handle);
                    else if (handle.image)
                        this.writeImage(handle);
                }
            }
        }
        finally {
            this.paint.clear();
        }
    }
    scheduleFlush(callback) {
        if (this.disposed)
            return;
        this.callbacks.push(callback);
        if (!this.frame)
            this.frame = this.window.requestAnimationFrame(() => {
                this.frame = 0;
                for (const run of this.callbacks.splice(0))
                    run();
            });
    }
    scheduleDelayed(callback, delayMs) {
        return this.presentation.delay(callback, delayMs);
    }
    startEntrance(record, options, complete) {
        const h = record.handle;
        return this.presentation.animate(options.durationMs, (progress) => {
            const offset = options.offset * (1 - progress);
            h.entrance =
                progress === 1
                    ? undefined
                    : {
                        x: options.direction === 'horizontal' ? offset : 0,
                        y: options.direction === 'vertical' ? offset : 0,
                        opacity: progress,
                    };
            this.writePresentation(h);
        }, complete);
    }
    writePresentation(h) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const effect = h.entrance;
        const translateX = Number((_a = h.props.translateX) !== null && _a !== void 0 ? _a : 0);
        const translateY = Number((_b = h.props.translateY) !== null && _b !== void 0 ? _b : 0);
        h.element.style.translate = `${translateX + ((_c = effect === null || effect === void 0 ? void 0 : effect.x) !== null && _c !== void 0 ? _c : 0)}px ${translateY + ((_d = effect === null || effect === void 0 ? void 0 : effect.y) !== null && _d !== void 0 ? _d : 0)}px`;
        h.element.style.scale = String(Number((_e = h.props.scale) !== null && _e !== void 0 ? _e : 1));
        const duration = Math.max(0, Number((_f = h.props.transformDurationMs) !== null && _f !== void 0 ? _f : 0));
        h.element.style.transition = duration
            ? `translate ${duration}ms linear, scale ${duration}ms linear`
            : '';
        h.element.style.opacity = String(Number((_g = h.props.opacity) !== null && _g !== void 0 ? _g : 1) * ((_h = effect === null || effect === void 0 ? void 0 : effect.opacity) !== null && _h !== void 0 ? _h : 1));
    }
    flushLayout() {
        if (!this.dirty || !this.root)
            return;
        this.dirty = false;
        const start = performance.now();
        const result = layoutFlexTree(this.root.handle.flex, this.width, this.height);
        const floatingStats = this.layoutFloatingPanels(this.width, this.height);
        Object.assign(this.metrics, {
            dirtyRoots: 1,
            measuredLeaves: result.stats.measuredLeaves + floatingStats.measuredLeaves,
            percentageFallbacks: result.stats.percentageFallbacks + floatingStats.percentageFallbacks,
            layoutMs: performance.now() - start,
        });
        this.metrics.layoutPasses++;
        const write = performance.now();
        this.write(this.root);
        this.metrics.writebackMs = performance.now() - write;
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
            const result = layoutFlexTreeIntrinsic(panel.handle.flex, detachedPercentage(panel.handle.flex.style.width, containingWidth), detachedPercentage(panel.handle.flex.style.height, containingHeight));
            measuredLeaves += result.stats.measuredLeaves;
            percentageFallbacks += result.stats.percentageFallbacks;
        }
        return { measuredLeaves, percentageFallbacks };
    }
    flushVirtualLayout(record) {
        if (!record.handle.content) {
            this.flushLayout();
            return;
        }
        this.dirty = false;
        const start = performance.now();
        this.writeVirtual(record);
        this.metrics.dirtyRoots = 1;
        this.metrics.layoutPasses++;
        this.metrics.layoutMs = performance.now() - start;
        this.metrics.writebackMs = 0;
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
                current.handle.element.style.display === 'none')
                return false;
        return true;
    }
    readVirtualViewport(record, direction) {
        var _a;
        const h = record.handle, f = h.flex.frame;
        return {
            offset: h.offset,
            mainSize: direction === 'vertical' ? f.height : f.width,
            crossSize: direction === 'vertical' ? f.width : f.height,
            scrolling: (this.nested.phase !== 'idle' && this.nested.phase !== 'pending') ||
                !!h.animation ||
                !!((_a = h.motion) === null || _a === void 0 ? void 0 : _a.animating),
        };
    }
    scrollVirtualTo(record, _direction, offset, duration) {
        this.stopVirtualScroll(record);
        const h = record.handle;
        if (!duration) {
            this.setOffset(record, offset);
            return;
        }
        const start = performance.now(), from = h.offset;
        const tick = (now) => {
            var _a;
            const t = Math.min(1, (now - start) / (duration * 1000));
            this.setOffset(record, from + (offset - from) * (1 - (1 - t) ** 3));
            if (t < 1)
                h.animation = this.window.requestAnimationFrame(tick);
            else {
                h.animation = undefined;
                (_a = h.refresh) === null || _a === void 0 ? void 0 : _a.call(h);
            }
        };
        h.animation = this.window.requestAnimationFrame(tick);
    }
    stopVirtualScroll(record) {
        var _a;
        if (record.handle.animation)
            this.window.cancelAnimationFrame(record.handle.animation);
        record.handle.animation = undefined;
        (_a = record.handle.motion) === null || _a === void 0 ? void 0 : _a.stop();
        this.activeMotions.delete(record);
    }
    destroy() {
        var _a, _b;
        (_a = this.cancelSurfaceTransition) === null || _a === void 0 ? void 0 : _a.call(this);
        this.presentation.dispose();
        this.disposed = true;
        this.window.cancelAnimationFrame(this.frame);
        this.window.cancelAnimationFrame(this.animation);
        this.window.clearTimeout(this.clickReset);
        this.window.clearTimeout(this.consumeClickReset);
        this.callbacks.length = 0;
        this.nested.cancel();
        for (const h of this.created) {
            (_b = h.motion) === null || _b === void 0 ? void 0 : _b.stop();
            if (h.animation)
                this.window.cancelAnimationFrame(h.animation);
            for (const dispose of h.disposers)
                dispose();
            h.element.remove();
        }
        this.created.clear();
        this.activeMotions.clear();
        this.glyphs.clear();
        this.interactionStyle.remove();
        this.window.removeEventListener('resize', this.onResize);
        this.window.removeEventListener('pointermove', this.onPointerMove, true);
        this.window.removeEventListener('pointerup', this.onPointerEnd, true);
        this.window.removeEventListener('pointercancel', this.onPointerEnd, true);
        this.container.ownerDocument.removeEventListener('click', this.onClickCapture, true);
        this.pointerMove = undefined;
        this.pointerEnd = undefined;
        this.pressedButton = undefined;
        this.records.clear();
        this.root = null;
    }
    releasePressedButton(event) {
        var _a, _b;
        const active = this.pressedButton;
        if (!active || (event && active.pointerId !== event.pointerId))
            return;
        this.pressedButton = undefined;
        if (!active.handle.pressed)
            return;
        active.handle.pressed = false;
        (_b = (_a = active.handle.props).onPressChange) === null || _b === void 0 ? void 0 : _b.call(_a, false);
    }
    property(record, property, value) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const h = record.handle;
        h.props[property] = value;
        if (property.startsWith('on'))
            return;
        if ((h.text &&
            (property === 'color' ||
                property === 'outlineColor' ||
                property === 'outlineWidth' ||
                property === 'horizontalAlign' ||
                property === 'verticalAlign' ||
                property === 'cacheMode')) ||
            (h.image && (property === 'tint' || property === 'sizeMode'))) {
            this.paint.add(h);
            return;
        }
        if (((_a = record.behavior) === null || _a === void 0 ? void 0 : _a.interaction) === 'range' && property === 'value')
            h.rangeValue = undefined;
        if (h.input) {
            if (property === 'value' && !h.composing && h.input.value !== String(value !== null && value !== void 0 ? value : ''))
                h.input.value = String(value !== null && value !== void 0 ? value : '');
            else if (property === 'placeholder')
                h.input.placeholder = String(value !== null && value !== void 0 ? value : '');
            else if (property === 'password')
                h.input.type = value === true ? 'password' : 'text';
            else if (property === 'maxLength')
                h.input.maxLength = Math.max(1, Number(value !== null && value !== void 0 ? value : 256));
            else if (property === 'fontSize')
                h.input.style.fontSize = `${Number(value !== null && value !== void 0 ? value : 24)}px`;
            else if (property === 'color')
                h.input.style.color = String(value !== null && value !== void 0 ? value : '#ffffff');
            else if (property === 'inputMode')
                h.input.inputMode = value === 'numeric' || value === 'decimal' ? value : 'text';
            else if (property === 'textAlign')
                h.input.style.textAlign = value === 'center' || value === 'right' ? value : 'left';
            else if (property === 'interactable')
                h.input.disabled = value === false;
            else if (property === 'focused') {
                if (value === true)
                    this.window.queueMicrotask(() => {
                        var _a;
                        if (((_a = h.input) === null || _a === void 0 ? void 0 : _a.isConnected) && !this.disposed)
                            h.input.focus();
                    });
                else
                    h.input.blur();
            }
        }
        if (property === 'style') {
            h.flex.style = h.visible
                ? (value !== null && value !== void 0 ? value : {})
                : Object.assign(Object.assign({}, value), { display: 'none' });
            this.dirty = true;
        }
        else if (property === 'visible') {
            h.visible = value !== false;
            h.flex.style = Object.assign(Object.assign({}, h.flex.style), { display: h.visible ? 'flex' : 'none' });
            this.dirty = true;
        }
        else if (property === 'name') {
            h.element.dataset.name = String(value);
            if (((_b = record.behavior) === null || _b === void 0 ? void 0 : _b.interaction) === 'press' || record.kind === 'input')
                h.element.setAttribute('aria-label', String(value));
        }
        else if (property === 'backgroundColor')
            h.element.style.backgroundColor = String(value !== null && value !== void 0 ? value : 'transparent');
        else if (property === 'opacity' ||
            property === 'scale' ||
            property === 'translateX' ||
            property === 'translateY' ||
            property === 'transformDurationMs')
            this.writePresentation(h);
        else if (property === 'accessibilityLabel')
            h.element.setAttribute('aria-label', String(value !== null && value !== void 0 ? value : ''));
        else if (property === 'interactable') {
            if (((_c = record.behavior) === null || _c === void 0 ? void 0 : _c.interaction) === 'press')
                h.element.disabled = value === false;
            if (value === false && ((_d = this.pressedButton) === null || _d === void 0 ? void 0 : _d.handle) === h)
                this.releasePressedButton();
            if (((_e = record.behavior) === null || _e === void 0 ? void 0 : _e.interaction) === 'range')
                this.writeRange(h);
        }
        else if (property === 'direction' && h.content) {
            h.direction = value === 'horizontal' ? 'horizontal' : 'vertical';
            h.element.dataset.uniflexDirection = h.direction;
            this.dirty = true;
        }
        else if (property === '__virtualRefresh')
            h.refresh = value;
        else if (property === '__virtualDirection') {
            h.direction = value === 'horizontal' ? 'horizontal' : 'vertical';
            h.element.dataset.uniflexDirection = h.direction;
            this.dirty = true;
        }
        else if (property === '__virtualContentMainSize') {
            h.contentMain = Number(value);
            this.dirty = true;
        }
        else if (property === '__virtualSticky') {
            if (value === true && record.parent)
                record.parent.handle.element.append(h.element);
            this.dirty = true;
        }
        else if ((property === 'resetKey' || property === 'scrollOffset') && h.plainScroll) {
            h.offset = property === 'scrollOffset' ? Math.max(0, Number(value) || 0) : 0;
            h.overscroll = 0;
            (_f = h.motion) === null || _f === void 0 ? void 0 : _f.stop();
            this.dirty = true;
        }
        else if (property === 'open' && ((_g = record.behavior) === null || _g === void 0 ? void 0 : _g.floating)) {
            h.floatingOrder = value === true ? ++this.floatingSequence : undefined;
            this.dirty = true;
        }
        else if (((_h = record.behavior) === null || _h === void 0 ? void 0 : _h.floating) && property === 'anchorRect')
            this.dirty = true;
        else if (property.startsWith('__virtual'))
            this.dirty = true;
        else if (h.text ||
            h.image ||
            ((_j = record.behavior) === null || _j === void 0 ? void 0 : _j.interaction) === 'range' ||
            ((_k = record.behavior) === null || _k === void 0 ? void 0 : _k.floating))
            this.dirty = true;
    }
    write(record) {
        var _a, _b;
        const h = record.handle, f = h.flex.frame, s = h.element.style;
        s.left = `${f.x}px`;
        s.top = `${f.y}px`;
        this.writePresentation(h);
        s.width = `${f.width}px`;
        s.height = `${f.height}px`;
        s.display = h.visible && !h.flex.hidden ? 'block' : 'none';
        if (s.display === 'none') {
            this.hideDetachedDescendants(record);
            return;
        }
        if (h.input)
            this.writeInput(h);
        if (h.text)
            this.writeText(h);
        if (h.image)
            this.writeImage(h);
        if (((_a = record.behavior) === null || _a === void 0 ? void 0 : _a.interaction) === 'range')
            this.writeRange(h);
        if ((_b = record.behavior) === null || _b === void 0 ? void 0 : _b.floating)
            this.writeFloating(record);
        else if (h.content) {
            if (h.plainScroll)
                this.writePlainScroll(record);
            else
                this.writeVirtual(record);
        }
        else
            for (const child of record.children)
                this.write(child);
    }
    writeInput(h) {
        var _a;
        const font = this.assets.font(h.props.font, h.props.bold === true);
        h.input.style.fontFamily = `"${font.native.family}"`;
        h.input.style.fontWeight = String(font.entry.weight);
        h.input.style.lineHeight = `${Number((_a = h.props.fontSize) !== null && _a !== void 0 ? _a : 24) * 1.3}px`;
    }
    writeText(h) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const p = h.props, font = this.assets.font(p.font, p.bold === true), f = h.flex.frame;
        const text = layoutText(String((_a = p.value) !== null && _a !== void 0 ? _a : ''), font.entry, Number((_b = p.fontSize) !== null && _b !== void 0 ? _b : 20), Number((_d = (_c = p.lineHeight) !== null && _c !== void 0 ? _c : p.fontSize) !== null && _d !== void 0 ? _d : 20), f.width, p.wrap !== false);
        const fontWeight = p.bold === true ? Math.max(700, font.entry.weight) : font.entry.weight;
        const span = h.text, s = span.style, value = text.lines.join('\n');
        if (span.textContent !== value)
            span.textContent = value;
        s.fontFamily = `"${font.native.family}"`;
        s.fontWeight = String(fontWeight);
        s.fontSize = `${text.fontSize}px`;
        s.lineHeight = `${text.lineHeight}px`;
        s.color = String((_e = p.color) !== null && _e !== void 0 ? _e : '#ffffff');
        s.textAlign = String((_f = p.horizontalAlign) !== null && _f !== void 0 ? _f : 'left');
        s.width = '100%';
        s.height = `${text.height}px`;
        s.left = '0px';
        s.top = `${p.verticalAlign === 'center' ? (f.height - text.height) / 2 : p.verticalAlign === 'bottom' ? f.height - text.height : 0}px`;
        s.webkitTextStroke = `${Number((_g = p.outlineWidth) !== null && _g !== void 0 ? _g : 0) * 2}px ${String((_h = p.outlineColor) !== null && _h !== void 0 ? _h : '#000000')}`;
        h.element.style.overflow = 'hidden';
        const key = JSON.stringify([
            p.value,
            font.entry.id,
            fontWeight,
            text.fontSize,
            text.lineHeight,
            f.width,
            f.height,
            p.color,
            p.outlineWidth,
            p.outlineColor,
            p.horizontalAlign,
            p.verticalAlign,
            p.overflow,
            p.cacheMode,
        ]);
        if (h.textKey === key)
            return;
        h.textKey = key;
        const canvas = h.textCanvas;
        canvas.width = Math.max(0, p.cacheMode === 'char' ? Math.ceil(f.width) : Math.floor(f.width));
        canvas.height = Math.max(0, p.cacheMode === 'char' ? Math.ceil(f.height) : Math.floor(f.height));
        canvas.style.width = p.cacheMode === 'char' ? `${canvas.width}px` : '100%';
        canvas.style.height = p.cacheMode === 'char' ? `${canvas.height}px` : '100%';
        const context = canvas.getContext('2d');
        const outline = Number((_j = p.outlineWidth) !== null && _j !== void 0 ? _j : 0);
        let size = text.fontSize, spacing = text.lineHeight;
        if (p.overflow === 'shrink') {
            const ratio = Math.min(1, Math.max(0, f.width - 2 * outline) / Math.max(1, text.width), f.height / Math.max(1, text.height));
            size = Math.floor(size * ratio);
            spacing = (spacing * size) / text.fontSize;
        }
        context.font = `${fontWeight} ${size}px "${font.native.family}"`;
        context.textAlign = String((_k = p.horizontalAlign) !== null && _k !== void 0 ? _k : 'left');
        context.textBaseline = 'alphabetic';
        context.lineJoin = 'round';
        context.fillStyle = String((_l = p.color) !== null && _l !== void 0 ? _l : '#ffffff');
        context.strokeStyle = String((_m = p.outlineColor) !== null && _m !== void 0 ? _m : '#000000');
        context.lineWidth = outline * 2;
        const x = p.horizontalAlign === 'center'
            ? f.width / 2
            : p.horizontalAlign === 'right'
                ? f.width - outline
                : outline;
        const excess = (text.lines.length - 1) * spacing + 2 * outline + size - f.height;
        let baseline = 0.87 * size + outline;
        if (p.verticalAlign === 'center')
            baseline -= excess / 2;
        else if (p.verticalAlign === 'bottom')
            baseline -= excess + 0.13 * size;
        if (p.cacheMode === 'char') {
            // The native character cache rasterizes individual padded glyphs, not a
            // whole line. Retain the same glyph surfaces here, including fractional
            // advances, so pooled text updates reuse glyphs without DOM churn.
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            for (let line = 0; line < text.lines.length; line++) {
                const glyphs = [...text.lines[line]].map((char) => {
                    const glyphKey = JSON.stringify([
                        font.entry.id,
                        fontWeight,
                        size,
                        char,
                        p.color,
                        outline,
                        p.outlineColor,
                    ]);
                    let glyph = this.glyphs.get(glyphKey);
                    if (!glyph) {
                        const width = Number(context.measureText(char).width.toFixed(2)) + outline * 2, height = 1.26 * size + outline * 2;
                        const textureWidth = Math.floor(width + 2), textureHeight = Math.floor(height + 2);
                        const surface = this.container.ownerDocument.createElement('canvas');
                        surface.width = Math.ceil(width + 2);
                        surface.height = Math.ceil(height + 2);
                        const ctx = surface.getContext('2d');
                        ctx.font = context.font;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'alphabetic';
                        ctx.lineJoin = 'round';
                        ctx.fillStyle = 'rgba(255,255,255,0.004)';
                        ctx.fillRect(0, 0, textureWidth, textureHeight);
                        ctx.fillStyle = context.fillStyle;
                        ctx.strokeStyle = context.strokeStyle;
                        ctx.lineWidth = outline * 2;
                        const cx = textureWidth / 2, cy = textureHeight / 2 + 0.37 * size;
                        if (outline > 0)
                            ctx.strokeText(char, cx, cy);
                        ctx.fillText(char, cx, cy);
                        glyph = { canvas: surface, width, height };
                        if (this.glyphs.size >= 2048)
                            this.glyphs.delete(this.glyphs.keys().next().value);
                        this.glyphs.set(glyphKey, glyph);
                    }
                    return glyph;
                });
                const lineWidth = glyphs.reduce((sum, g) => sum + g.width, 0);
                let left = p.horizontalAlign === 'center'
                    ? (f.width - lineWidth) / 2
                    : p.horizontalAlign === 'right'
                        ? f.width - lineWidth
                        : 0;
                const blank = f.height - (text.lines.length - 1) * spacing - size;
                const top = (p.verticalAlign === 'center'
                    ? blank / 2
                    : p.verticalAlign === 'bottom'
                        ? blank
                        : 0) +
                    line * spacing -
                    0.13 * size;
                for (const glyph of glyphs) {
                    context.drawImage(glyph.canvas, 1, 1, glyph.width, glyph.height, left, top, glyph.width, glyph.height);
                    left += glyph.width;
                }
            }
            return;
        }
        for (let i = 0; i < text.lines.length; i++) {
            const y = baseline + i * spacing;
            if (outline > 0)
                context.strokeText(text.lines[i], x, y);
            context.fillText(text.lines[i], x, y);
        }
    }
    writeImage(h) {
        var _a, _b;
        const image = h.image, source = h.props.source;
        if (!source)
            throw new Error('Image requires a prepared ImageRef source.');
        const { entry, native } = this.assets.resolve(source);
        const asset = entry;
        const scale = (this.container.getBoundingClientRect().width / this.width || 1) *
            this.window.devicePixelRatio;
        const width = Math.max(1, Math.round(h.flex.frame.width * scale)), height = Math.max(1, Math.round(h.flex.frame.height * scale));
        const tint = String((_a = h.props.tint) !== null && _a !== void 0 ? _a : '#ffffff');
        const key = JSON.stringify([entry.id, width, height, tint, h.props.sizeMode]);
        if (h.imageKey === key)
            return;
        h.imageKey = key;
        image.width = width;
        image.height = height;
        const context = image.getContext('2d');
        // One bilinear sample at the output density. Browser <img>/border-image
        // downsampling can use a wider filter and produce a visibly different UI.
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        if (h.props.sizeMode === 'sliced') {
            const [l, t, r, b] = (_b = asset.nineSlice) !== null && _b !== void 0 ? _b : [0, 0, 0, 0];
            const xScale = Math.min(scale, width / Math.max(1, l + r)), yScale = Math.min(scale, height / Math.max(1, t + b));
            const sx = [0, l, asset.width - r, asset.width], sy = [0, t, asset.height - b, asset.height];
            const dx = [0, Math.round(l * xScale), width - Math.round(r * xScale), width], dy = [0, Math.round(t * yScale), height - Math.round(b * yScale), height];
            for (let y = 0; y < 3; y++)
                for (let x = 0; x < 3; x++) {
                    if (sx[x + 1] > sx[x] &&
                        sy[y + 1] > sy[y] &&
                        dx[x + 1] > dx[x] &&
                        dy[y + 1] > dy[y])
                        context.drawImage(native.image, sx[x], sy[y], sx[x + 1] - sx[x], sy[y + 1] - sy[y], dx[x], dy[y], dx[x + 1] - dx[x], dy[y + 1] - dy[y]);
                }
        }
        else
            context.drawImage(native.image, 0, 0, width, height);
        if (tint.toLowerCase() !== '#ffffff') {
            // Pixel multiplication preserves transparent edges and exactly models
            // the ImageRef color operation without external SVG filter behavior.
            if (!/^#[\da-f]{6}$/i.test(tint))
                throw new Error(`Unsupported image tint: ${tint}`);
            const rgb = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16) / 255);
            const pixels = context.getImageData(0, 0, width, height);
            for (let i = 0; i < pixels.data.length; i += 4)
                for (let c = 0; c < 3; c++)
                    pixels.data[i + c] = Math.round(pixels.data[i + c] * rgb[c]);
            context.putImageData(pixels, 0, 0);
        }
    }
    writeRange(h) {
        var _a, _b, _c, _d, _e;
        const min = Number((_a = h.props.min) !== null && _a !== void 0 ? _a : 0);
        const max = Number((_b = h.props.max) !== null && _b !== void 0 ? _b : 100);
        const step = Number((_c = h.props.step) !== null && _c !== void 0 ? _c : 1);
        const value = normalizeRangeValue((_d = h.rangeValue) !== null && _d !== void 0 ? _d : Number((_e = h.props.value) !== null && _e !== void 0 ? _e : min), min, max, step);
        h.element.setAttribute('aria-valuemin', String(min));
        h.element.setAttribute('aria-valuemax', String(max));
        h.element.setAttribute('aria-valuenow', String(value));
        h.element.setAttribute('aria-disabled', String(h.props.interactable === false));
        h.element.tabIndex = h.props.interactable === false ? -1 : 0;
    }
    paintImage(canvas, source, logicalWidth, logicalHeight, sizeMode, tint, previousKey) {
        var _a;
        const { entry, native } = this.assets.resolve(source);
        const asset = entry;
        const scale = (this.container.getBoundingClientRect().width / this.width || 1) *
            this.window.devicePixelRatio;
        const width = Math.max(1, Math.round(logicalWidth * scale));
        const height = Math.max(1, Math.round(logicalHeight * scale));
        const key = JSON.stringify([entry.id, width, height, tint, sizeMode]);
        if (previousKey === key)
            return key;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        if (sizeMode === 'sliced') {
            const [l, t, r, b] = (_a = asset.nineSlice) !== null && _a !== void 0 ? _a : [0, 0, 0, 0];
            const xScale = Math.min(scale, width / Math.max(1, l + r));
            const yScale = Math.min(scale, height / Math.max(1, t + b));
            const sx = [0, l, asset.width - r, asset.width];
            const sy = [0, t, asset.height - b, asset.height];
            const dx = [0, Math.round(l * xScale), width - Math.round(r * xScale), width];
            const dy = [0, Math.round(t * yScale), height - Math.round(b * yScale), height];
            for (let y = 0; y < 3; y++)
                for (let x = 0; x < 3; x++)
                    if (sx[x + 1] > sx[x] &&
                        sy[y + 1] > sy[y] &&
                        dx[x + 1] > dx[x] &&
                        dy[y + 1] > dy[y])
                        context.drawImage(native.image, sx[x], sy[y], sx[x + 1] - sx[x], sy[y + 1] - sy[y], dx[x], dy[y], dx[x + 1] - dx[x], dy[y + 1] - dy[y]);
        }
        else
            context.drawImage(native.image, 0, 0, width, height);
        return key;
    }
    writePlainScroll(record) {
        var _a;
        const h = record.handle;
        const vertical = h.direction === 'vertical';
        const main = vertical ? h.flex.frame.height : h.flex.frame.width;
        const cross = vertical ? h.flex.frame.width : h.flex.frame.height;
        const old = h.offset;
        const child = record.children[0];
        if (child) {
            h.contentMain = layoutScrollContent(child.handle.flex, h.direction, main, cross).mainSize;
        }
        else
            h.contentMain = main;
        h.scrollEnabled = h.contentMain > main + 0.5;
        h.offset = h.scrollEnabled ? Math.max(0, Math.min(h.offset, h.contentMain - main)) : 0;
        h.overscroll = 0;
        if (!h.scrollEnabled)
            (_a = h.motion) === null || _a === void 0 ? void 0 : _a.stop();
        h.content.style.width = `${vertical ? cross : h.contentMain}px`;
        h.content.style.height = `${vertical ? h.contentMain : cross}px`;
        this.writeOffset(h);
        if (old !== h.offset)
            this.notifyScroll(h);
        if (child)
            this.write(child);
    }
    writeFloating(record) {
        var _a, _b, _c;
        const panel = this.floatingPanel(record);
        const localAnchor = this.floatingAnchorRecord(record);
        if (localAnchor)
            this.write(localAnchor);
        if (!panel)
            return;
        panel.handle.element.style.zIndex = String(1000 + ((_a = record.handle.floatingOrder) !== null && _a !== void 0 ? _a : 0));
        const anchorRect = this.floatingAnchorRect(record);
        if (record.handle.props.open !== true || !anchorRect || !this.isRecordVisible(record)) {
            panel.handle.element.style.display = 'none';
            return;
        }
        const placement = placeFloating(anchorRect, panel.handle.flex.frame, { width: this.width, height: this.height }, {
            placement: record.handle.props.placement,
            align: record.handle.props.align,
            gap: Number((_b = record.handle.props.gap) !== null && _b !== void 0 ? _b : 14),
            viewportPadding: Number((_c = record.handle.props.viewportPadding) !== null && _c !== void 0 ? _c : 16),
        });
        Object.assign(panel.handle.flex.frame, placement);
        this.write(panel);
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
        var _a;
        const behavior = (_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating;
        if (!behavior)
            return undefined;
        if (behavior.anchor === 'child') {
            const anchor = this.floatingAnchorRecord(record);
            return anchor ? this.globalRect(anchor) : undefined;
        }
        const rect = record.handle.props.anchorRect;
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
        var _a;
        for (const record of this.records.values())
            if (((_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating) && record.handle.props.open === true)
                this.writeFloating(record);
    }
    globalRect(record) {
        let x = record.handle.flex.frame.x;
        let y = record.handle.flex.frame.y;
        for (let parent = record.parent; parent; parent = parent.parent) {
            x += parent.handle.flex.frame.x;
            y += parent.handle.flex.frame.y;
            if (parent.handle.content) {
                const displacement = -parent.handle.offset + parent.handle.overscroll;
                if (parent.handle.direction === 'vertical')
                    y += displacement;
                else
                    x += displacement;
            }
        }
        return Object.assign(Object.assign({}, record.handle.flex.frame), { x, y });
    }
    hideDetachedDescendants(record) {
        var _a;
        if ((_a = record.behavior) === null || _a === void 0 ? void 0 : _a.floating) {
            const panel = this.floatingPanel(record);
            if (panel)
                panel.handle.element.style.display = 'none';
        }
        for (const child of record.children)
            this.hideDetachedDescendants(child);
    }
    writeVirtual(record) {
        var _a, _b, _c, _d;
        const h = record.handle, f = h.flex.frame, vertical = h.direction === 'vertical';
        const main = vertical ? f.height : f.width, cross = vertical ? f.width : f.height;
        const viewport = `${main}:${cross}`;
        if (h.lastViewport !== viewport) {
            h.lastViewport = viewport;
            this.scheduleFlush(() => { var _a; return (_a = h.refresh) === null || _a === void 0 ? void 0 : _a.call(h); });
        }
        h.content.style.width = `${vertical ? cross : Math.max(main, h.contentMain)}px`;
        h.content.style.height = `${vertical ? Math.max(main, h.contentMain) : cross}px`;
        this.writeOffset(h);
        for (const child of record.children) {
            const c = child.handle, p = child.props;
            if (p.__virtualParked === true) {
                c.element.style.visibility = 'hidden';
                continue;
            }
            c.element.style.visibility = 'visible';
            const cm = Number((_a = p.__virtualMainSize) !== null && _a !== void 0 ? _a : 0), cc = Number((_b = p.__virtualCrossSize) !== null && _b !== void 0 ? _b : cross);
            const width = vertical ? cc : cm, height = vertical ? cm : cc;
            layoutFlexTree(c.flex, width, height);
            Object.assign(c.flex.frame, {
                x: Number((_c = p[vertical ? '__virtualCrossOffset' : '__virtualMainOffset']) !== null && _c !== void 0 ? _c : 0),
                y: Number((_d = p[vertical ? '__virtualMainOffset' : '__virtualCrossOffset']) !== null && _d !== void 0 ? _d : 0),
                width,
                height,
            });
            this.write(child);
        }
    }
    writeOffset(h) {
        // The retained host owns scrolling. Never let browser focus restoration
        // introduce a second, untracked geometry writer.
        if (h.element.scrollLeft !== 0)
            h.element.scrollLeft = 0;
        if (h.element.scrollTop !== 0)
            h.element.scrollTop = 0;
        h.content.style.transform =
            h.direction === 'vertical'
                ? `translateY(${-h.offset + h.overscroll}px)`
                : `translateX(${-h.offset + h.overscroll}px)`;
    }
    setOffset(record, offset) {
        var _a;
        const h = record.handle, main = h.direction === 'vertical' ? h.flex.frame.height : h.flex.frame.width;
        const old = h.offset;
        h.offset = Math.max(0, Math.min(offset, Math.max(0, h.contentMain - main)));
        h.overscroll = 0;
        this.writeOffset(h);
        if (old !== h.offset) {
            this.notifyScroll(h);
            (_a = h.refresh) === null || _a === void 0 ? void 0 : _a.call(h);
            this.refreshFloatings();
            this.anchorsChanged();
        }
        return h.offset - old;
    }
    writeMotion(record) {
        var _a;
        const h = record.handle, motion = h.motion;
        const old = h.offset;
        const previousDisplacement = -h.offset + h.overscroll;
        h.offset = Math.max(0, Math.min(motion.max, motion.position));
        h.overscroll = h.offset - motion.position;
        this.writeOffset(h);
        if (old !== h.offset) {
            this.notifyScroll(h);
            (_a = h.refresh) === null || _a === void 0 ? void 0 : _a.call(h);
        }
        if (previousDisplacement !== -h.offset + h.overscroll) {
            this.refreshFloatings();
            this.anchorsChanged();
        }
    }
    notifyScroll(h) {
        const name = h.props.name;
        if (!this.scrollChanged || typeof name !== 'string' || name.length === 0)
            return;
        const main = h.direction === 'vertical' ? h.flex.frame.height : h.flex.frame.width;
        this.scrollChanged({
            name,
            direction: h.direction,
            offset: h.offset,
            maximum: Math.max(0, h.contentMain - main),
        });
    }
    target(record) {
        if (record.handle.target)
            return record.handle.target;
        // Object-literal getters bind their own this; keep the outer host available.
        // eslint-disable-next-line typescript/no-this-alias
        const driver = this, h = record.handle;
        h.motion = new ScrollMotion();
        return (h.target = {
            id: `virtual:${record.recordId}`,
            get direction() {
                return h.direction;
            },
            get parent() {
                var _a;
                let p = record.parent;
                while (p && !p.handle.content) {
                    if ((_a = p.behavior) === null || _a === void 0 ? void 0 : _a.floating)
                        return null;
                    p = p.parent;
                }
                return p ? driver.target(p) : null;
            },
            getOffset: () => h.offset,
            getMaxOffset: () => Math.max(0, h.contentMain -
                (h.direction === 'vertical' ? h.flex.frame.height : h.flex.frame.width)),
            scrollBy: (delta) => {
                if (h.plainScroll && !h.scrollEnabled)
                    return 0;
                driver.interruptInitial(record);
                if (!h.motion.dragging)
                    return driver.setOffset(record, h.offset + delta);
                const moved = h.motion.drag(delta, performance.now());
                driver.writeMotion(record);
                return moved;
            },
            beginDrag: () => {
                var _a, _b;
                if (h.plainScroll && !h.scrollEnabled)
                    return;
                let parent = h.target.parent, sameAxis = false;
                while (parent) {
                    sameAxis || (sameAxis = parent.direction === h.direction);
                    parent = parent.parent;
                }
                h.motion.begin(h.offset - h.overscroll, h.target.getMaxOffset(), performance.now(), {
                    brake: Number((_a = h.props.brake) !== null && _a !== void 0 ? _a : 0.5),
                    inertia: h.props.inertia !== false,
                    elastic: h.props.elastic !== false && !sameAxis,
                    bounceDuration: Number((_b = h.props.bounceDuration) !== null && _b !== void 0 ? _b : 1),
                });
            },
            releaseDrag: () => {
                if (h.plainScroll && !h.scrollEnabled)
                    return;
                h.motion.release();
                if (h.motion.animating)
                    driver.activeMotions.add(record);
                driver.animate();
            },
            discardDrag: () => h.motion.stop(),
            stop: () => driver.stopVirtualScroll(record),
        });
    }
    interruptInitial(record) {
        var _a, _b;
        for (let current = record; current; current = current.parent) {
            (_b = (_a = current.props).__virtualInteraction) === null || _b === void 0 ? void 0 : _b.call(_a);
        }
    }
    bindInput(record) {
        const h = record.handle, element = h.element;
        let pointer, capture, x = 0, y = 0, time = 0;
        const on = (type, callback, options) => {
            element.addEventListener(type, callback, options);
            h.disposers.push(() => element.removeEventListener(type, callback, options));
        };
        const scale = () => this.container.getBoundingClientRect().width / this.width || 1;
        on('wheel', (event) => {
            const e = event;
            if (h.plainScroll && !h.scrollEnabled)
                return;
            e.preventDefault();
            e.stopPropagation();
            this.interruptInitial(record);
            const unit = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? h.flex.frame.height : 1;
            this.nested.wheel(this.target(record), (e.deltaX * unit) / scale(), (e.deltaY * unit) / scale());
        }, { passive: false });
        on('pointerdown', (event) => {
            const e = event;
            if (e.button !== 0)
                return;
            if (h.plainScroll && !h.scrollEnabled)
                return;
            e.stopPropagation();
            pointer = e.pointerId;
            x = e.clientX;
            y = e.clientY;
            time = e.timeStamp;
            this.suppressClick = false;
            this.nested.begin(this.target(record));
            this.pointerMove = move;
            this.pointerEnd = end;
            // Capture at press time: the first vertical move can already leave a
            // narrow horizontal rail. Keep the pressed button as target until drag
            // lock, so ordinary taps still reach that button's click listener.
            capture = e.target instanceof Element ? e.target : element;
            capture.setPointerCapture(e.pointerId);
        });
        // One host-level move/end dispatcher follows a pointer outside a narrow
        // child, including environments where native pointer capture is unavailable.
        const move = (event) => {
            const e = event;
            if (pointer !== e.pointerId)
                return;
            e.stopPropagation();
            this.nested.move((x - e.clientX) / scale(), (y - e.clientY) / scale(), Math.max(1 / 240, (e.timeStamp - time) / 1000));
            x = e.clientX;
            y = e.clientY;
            time = e.timeStamp;
            if (this.nested.phase === 'dragging') {
                this.suppressClick = true;
                element.setPointerCapture(e.pointerId);
                capture = element;
                e.preventDefault();
            }
        };
        const end = (event) => {
            var _a;
            const e = event;
            if (pointer !== e.pointerId)
                return;
            pointer = undefined;
            e.stopPropagation();
            if (capture === null || capture === void 0 ? void 0 : capture.hasPointerCapture(e.pointerId))
                capture.releasePointerCapture(e.pointerId);
            capture = undefined;
            this.pointerMove = undefined;
            this.pointerEnd = undefined;
            if (e.type === 'pointercancel')
                this.nested.cancel();
            else
                this.nested.end();
            this.animate();
            (_a = h.refresh) === null || _a === void 0 ? void 0 : _a.call(h);
            // Suppress only the synthetic click belonging to this drag, not a later
            // independent click on a navigation control outside the scroll viewport.
            this.window.clearTimeout(this.clickReset);
            this.clickReset = this.window.setTimeout(() => {
                this.suppressClick = false;
                this.clickReset = 0;
            }, 0);
        };
        h.disposers.push(() => {
            if (this.pointerMove === move) {
                this.pointerMove = undefined;
                this.pointerEnd = undefined;
                this.nested.cancel();
            }
        });
    }
    animate() {
        if (this.disposed || this.animation || !this.activeMotions.size)
            return;
        let last = performance.now();
        const tick = (time) => {
            var _a, _b;
            let active = false;
            for (const record of this.activeMotions) {
                record.handle.motion.advance((time - last) / 1000);
                this.writeMotion(record);
                active || (active = record.handle.motion.animating);
                if (!record.handle.motion.animating) {
                    this.activeMotions.delete(record);
                    (_b = (_a = record.handle).refresh) === null || _b === void 0 ? void 0 : _b.call(_a);
                }
            }
            last = time;
            this.animation = active ? this.window.requestAnimationFrame(tick) : 0;
        };
        this.animation = this.window.requestAnimationFrame(tick);
    }
}
function detachedPercentage(value, parent) {
    if (typeof value !== 'string' || value === 'auto')
        return undefined;
    const percent = Number.parseFloat(value);
    return Number.isFinite(percent) ? Math.max(0, (parent * percent) / 100) : undefined;
}
