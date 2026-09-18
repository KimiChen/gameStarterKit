var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _CocosProvider_store, _CocosProvider_abort, _CocosProvider_backdrops;
import { BlockInputEvents, Camera, Color, director, Director, Font, Graphics, JsonAsset, Node, RenderTexture, resources, Sprite, SpriteFrame, Texture2D, UITransform, } from 'cc';
import { RetainedUIProvider, ResourceStore } from '../core/provider.js';
import { CocosHostDriver } from './cocos-host.js';
import { runCocosPerformanceSuite } from './cocos-performance.js';
import { Cancellation } from './cancellation.js';
export class CocosProvider extends RetainedUIProvider {
    constructor(options) {
        const store = new ResourceStore((entry) => load(entry, options.resources), (asset) => asset.decRef(), (ref) => {
            const mapped = options.resources[ref.id];
            if (!mapped || mapped.sha256 !== ref.sha256)
                return Promise.reject(new Error(`Missing or mismatched JSON mapping: ${ref.id}`));
            return new Promise((resolve, reject) => resources.load(mapped.path, JsonAsset, (error, asset) => {
                if (error || !asset) {
                    reject(error !== null && error !== void 0 ? error : new Error(`Missing JSON resource: ${ref.id}`));
                    return;
                }
                asset.addRef();
                resolve({
                    value: asset.json,
                    release: () => {
                        asset.decRef();
                    },
                });
            }));
        });
        super(Object.freeze({
            loadJson: store.loadJson.bind(store),
            prepare: store.prepare.bind(store),
            has: store.has.bind(store),
            acquire: store.acquire.bind(store),
            evictUnused: store.evictUnused.bind(store),
            trimUnused: store.trimUnused.bind(store),
            inspectRetention: store.inspectRetention.bind(store),
        }));
        this.options = options;
        _CocosProvider_store.set(this, void 0);
        _CocosProvider_abort.set(this, new Cancellation());
        _CocosProvider_backdrops.set(this, new Map());
        __classPrivateFieldSet(this, _CocosProvider_store, store, "f");
    }
    createHost(context) {
        const driver = new CocosHostDriver(this.options.container, __classPrivateFieldGet(this, _CocosProvider_store, "f").context(context.resources), context.anchorsChanged, this.options.onScroll, this.options.logFirstLayout, this.options.profileLayout);
        return {
            driver,
            metrics: driver.metrics,
            destroy: () => driver.destroy(),
            inspect: () => driver.inspect(),
            findAnchor: (name) => driver.findAnchor(name),
            present: (activity, order, options, transitionState) => driver.present(activity, order, options, transitionState),
        };
    }
    async presentNative(entries) {
        var _a;
        const activeBlur = entries.findIndex((entry) => entry.activity === 'active' && entry.presentation.backdrop === 'frozenBlur');
        if (activeBlur >= 0 && !((_a = __classPrivateFieldGet(this, _CocosProvider_backdrops, "f").get(entries[activeBlur].id)) === null || _a === void 0 ? void 0 : _a.texture)) {
            await Promise.all(entries.map((entry, order) => {
                const driver = entry.host.driver;
                const temporary = order === activeBlur ? 'parked' : entry.activity;
                driver.setSnapshotCovered(false);
                return driver.present(temporary, order, entry.presentation, 'steady');
            }));
            await this.capture(entries[activeBlur].id);
        }
        this.syncBackdrops(entries);
        let snapshotIndex = -1;
        for (let index = entries.length - 1; index >= 0; index--) {
            const entry = entries[index];
            if (entry.activity !== 'parked' && entry.presentation.backdrop === 'frozenBlur') {
                snapshotIndex = index;
                break;
            }
        }
        entries.forEach((entry, order) => {
            const driver = entry.host.driver;
            driver.setSnapshotCovered(snapshotIndex > order);
        });
        this.reorder(entries);
        await super.presentNative(entries);
        this.reorder(entries);
    }
    async capture(id) {
        var _a, _b;
        var _c;
        if (__classPrivateFieldGet(this, _CocosProvider_abort, "f").aborted)
            throw new Error('Cocos Provider has been disposed.');
        const scene = director.getScene();
        const camera = scene === null || scene === void 0 ? void 0 : scene.getComponentsInChildren(Camera).find((candidate) => candidate.enabledInHierarchy &&
            candidate.targetTexture === null &&
            (candidate.visibility & this.options.container.layer) !== 0);
        if (!camera)
            throw new Error('Frozen blur requires an active Cocos UI Camera.');
        const texture = new RenderTexture(`uniflex-backdrop-${id}`);
        // Keep the capture target's aspect ratio aligned with the logical viewport.
        // A fixed 27×48 target changes the camera projection on taller screens.
        const size = this.options.container.getComponent(UITransform).contentSize;
        texture.reset({ width: 27, height: Math.round((27 * size.height) / size.width) });
        texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
        const previous = camera.targetTexture;
        camera.targetTexture = texture;
        await new Promise((resolve, reject) => {
            let settled = false;
            const cancel = __classPrivateFieldGet(this, _CocosProvider_abort, "f").subscribe(() => {
                if (settled)
                    return;
                settled = true;
                camera.targetTexture = previous;
                director.off(Director.EVENT_AFTER_DRAW, finish);
                texture.destroy();
                reject(new Error('Frozen blur capture was cancelled.'));
            });
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                cancel();
                camera.targetTexture = previous;
                resolve();
            };
            director.once(Director.EVENT_AFTER_DRAW, finish);
        });
        const backdrop = this.ensureBackdrop(id);
        (_a = backdrop.texture) === null || _a === void 0 ? void 0 : _a.destroy();
        (_b = backdrop.frame) === null || _b === void 0 ? void 0 : _b.destroy();
        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.flipUVY = false;
        const sprite = (_c = backdrop.node.getComponent(Sprite)) !== null && _c !== void 0 ? _c : backdrop.node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.color = new Color(255, 255, 255, 255);
        sprite.spriteFrame = frame;
        backdrop.texture = texture;
        backdrop.frame = frame;
    }
    syncBackdrops(entries) {
        var _a, _b, _c;
        const live = new Set();
        for (const entry of entries) {
            if (entry.activity === 'parked' || !entry.presentation.blockInputBelow)
                continue;
            live.add(entry.id);
            const backdrop = this.ensureBackdrop(entry.id);
            backdrop.node.active = true;
            // A blocking shield without a visual backdrop must remain transparent.
            backdrop.tint.active = entry.presentation.backdrop === 'frozenBlur';
            if (entry.presentation.backdrop !== 'frozenBlur') {
                (_a = backdrop.node.getComponent(Sprite)) === null || _a === void 0 ? void 0 : _a.destroy();
                (_b = backdrop.frame) === null || _b === void 0 ? void 0 : _b.destroy();
                (_c = backdrop.texture) === null || _c === void 0 ? void 0 : _c.destroy();
                backdrop.frame = undefined;
                backdrop.texture = undefined;
            }
        }
        for (const [id, backdrop] of __classPrivateFieldGet(this, _CocosProvider_backdrops, "f")) {
            if (live.has(id))
                continue;
            this.destroyBackdrop(backdrop);
            __classPrivateFieldGet(this, _CocosProvider_backdrops, "f").delete(id);
        }
    }
    ensureBackdrop(id) {
        let backdrop = __classPrivateFieldGet(this, _CocosProvider_backdrops, "f").get(id);
        if (backdrop)
            return backdrop;
        const node = new Node(`surface-shield:${id}`);
        node.layer = this.options.container.layer;
        node.setParent(this.options.container);
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(this.options.container.getComponent(UITransform).contentSize);
        const tintNode = new Node('surface-shield-tint:' + id);
        tintNode.layer = this.options.container.layer;
        tintNode.setParent(node);
        const tint = tintNode.addComponent(Graphics);
        tint.fillColor = new Color(55, 70, 85, 102);
        const { width, height } = transform.contentSize;
        tint.rect(-width / 2, -height / 2, width, height);
        tint.fill();
        node.addComponent(BlockInputEvents);
        backdrop = { node, tint: tintNode };
        __classPrivateFieldGet(this, _CocosProvider_backdrops, "f").set(id, backdrop);
        return backdrop;
    }
    reorder(entries) {
        let index = 0;
        for (const entry of entries) {
            if (entry.activity === 'parked')
                continue;
            const backdrop = __classPrivateFieldGet(this, _CocosProvider_backdrops, "f").get(entry.id);
            if (backdrop === null || backdrop === void 0 ? void 0 : backdrop.node.isValid)
                backdrop.node.setSiblingIndex(index++);
            const node = entry.host.driver.surfaceNode;
            if (node)
                node.setSiblingIndex(index++);
        }
    }
    destroyBackdrop(backdrop) {
        var _a, _b;
        (_a = backdrop.frame) === null || _a === void 0 ? void 0 : _a.destroy();
        (_b = backdrop.texture) === null || _b === void 0 ? void 0 : _b.destroy();
        if (backdrop.node.isValid)
            backdrop.node.destroy();
    }
    disposeNative() {
        __classPrivateFieldGet(this, _CocosProvider_abort, "f").abort();
        for (const backdrop of __classPrivateFieldGet(this, _CocosProvider_backdrops, "f").values())
            this.destroyBackdrop(backdrop);
        __classPrivateFieldGet(this, _CocosProvider_backdrops, "f").clear();
        __classPrivateFieldGet(this, _CocosProvider_store, "f").dispose();
    }
    /** Launcher-only diagnostics, deliberately absent from the business UIProvider contract. */
    runPerformanceSuite() {
        return runCocosPerformanceSuite(this, __classPrivateFieldGet(this, _CocosProvider_abort, "f"));
    }
}
_CocosProvider_store = new WeakMap(), _CocosProvider_abort = new WeakMap(), _CocosProvider_backdrops = new WeakMap();
function load(entry, mapping) {
    const mapped = mapping[entry.id];
    if (!mapped || mapped.sha256 !== entry.sha256)
        return Promise.reject(new Error(`Missing or mismatched resource mapping: ${entry.id}`));
    return new Promise((resolve, reject) => {
        const type = entry.kind === 'image' ? SpriteFrame : Font;
        resources.load(mapped.path, type, (error, asset) => {
            var _a;
            if (error || !asset) {
                reject(error !== null && error !== void 0 ? error : new Error(`Missing resource: ${entry.id}`));
                return;
            }
            if (entry.kind === 'image') {
                const frame = asset;
                if (frame.originalSize.width !== entry.width ||
                    frame.originalSize.height !== entry.height) {
                    reject(new Error(`Imported size mismatch: ${entry.id}`));
                    return;
                }
                const insets = (_a = entry.nineSlice) !== null && _a !== void 0 ? _a : [0, 0, 0, 0];
                if ([frame.insetLeft, frame.insetTop, frame.insetRight, frame.insetBottom].some((n, i) => n !== insets[i])) {
                    reject(new Error(`Imported nine-slice mismatch: ${entry.id}`));
                    return;
                }
            }
            asset.addRef();
            resolve(asset);
        });
    });
}
