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
var _WebProvider_store, _WebProvider_abort, _WebProvider_backdrops;
import { paintSnapshotElement } from './frozen-snapshot.js';
import { RetainedUIProvider, ResourceStore, sha256 } from '../core/provider.js';
import { DOMHostDriver } from './dom-host.js';
export class WebProvider extends RetainedUIProvider {
    constructor(options) {
        const abort = new AbortController();
        const store = new ResourceStore((entry) => load(entry, options.resources, options.container.ownerDocument, abort.signal), (value) => {
            if (value.font)
                options.container.ownerDocument.fonts.delete(value.font);
            URL.revokeObjectURL(value.url);
        }, async (ref) => {
            const mapped = options.resources[ref.id];
            if (!mapped || mapped.sha256 !== ref.sha256)
                throw new Error(`Missing or mismatched JSON mapping: ${ref.id}`);
            const response = await fetch(mapped.url, { signal: abort.signal });
            if (!response.ok)
                throw new Error(`JSON ${ref.id}: HTTP ${response.status}`);
            return { value: JSON.parse(await response.text()) };
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
        _WebProvider_store.set(this, void 0);
        _WebProvider_abort.set(this, new AbortController());
        _WebProvider_backdrops.set(this, new Map());
        __classPrivateFieldSet(this, _WebProvider_store, store, "f");
        __classPrivateFieldSet(this, _WebProvider_abort, abort, "f");
    }
    createHost(context) {
        var _a, _b;
        const driver = new DOMHostDriver(this.options.container, __classPrivateFieldGet(this, _WebProvider_store, "f").context(context.resources), (_a = this.options.width) !== null && _a !== void 0 ? _a : 750, (_b = this.options.height) !== null && _b !== void 0 ? _b : 1334, context.anchorsChanged, this.options.onScroll);
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
        var _b, _c, _d, _e;
        const activeBlur = entries.findIndex((entry) => entry.activity === 'active' && entry.presentation.backdrop === 'frozenBlur');
        let snapshot;
        if (activeBlur >= 0 &&
            !((_a = __classPrivateFieldGet(this, _WebProvider_backdrops, "f").get(entries[activeBlur].id)) === null || _a === void 0 ? void 0 : _a.querySelector('canvas'))) {
            await Promise.all(entries.map((entry, order) => entry.host.driver.present(order === activeBlur ? 'parked' : entry.activity, order, entry.presentation, 'steady')));
            snapshot = this.options.container.ownerDocument.createElement('canvas');
            snapshot.width = 27;
            snapshot.height = Math.round((27 * ((_b = this.options.height) !== null && _b !== void 0 ? _b : 1334)) / ((_c = this.options.width) !== null && _c !== void 0 ? _c : 750));
            snapshot.style.cssText =
                'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
            const context = snapshot.getContext('2d');
            const width = (_d = this.options.width) !== null && _d !== void 0 ? _d : 750, height = (_e = this.options.height) !== null && _e !== void 0 ? _e : 1334;
            context.scale(snapshot.width / width, snapshot.height / height);
            for (let order = 0; order < activeBlur; order++) {
                const entry = entries[order];
                if (entry.activity === 'parked')
                    continue;
                const prior = __classPrivateFieldGet(this, _WebProvider_backdrops, "f").get(entry.id);
                if (prior)
                    paintSnapshotElement(context, prior, this.options.container.getBoundingClientRect(), width, height);
                entry.host.driver.paintSnapshot(context);
            }
        }
        const live = new Set();
        entries.forEach((entry, order) => {
            var _a, _b;
            if (entry.activity === 'parked' || !entry.presentation.blockInputBelow)
                return;
            live.add(entry.id);
            let backdrop = __classPrivateFieldGet(this, _WebProvider_backdrops, "f").get(entry.id);
            if (!backdrop) {
                backdrop = this.options.container.ownerDocument.createElement('div');
                backdrop.dataset.uniflexSurfaceShield = String(entry.id);
                backdrop.style.cssText = `position:absolute;left:0;top:0;width:${(_a = this.options.width) !== null && _a !== void 0 ? _a : 750}px;height:${(_b = this.options.height) !== null && _b !== void 0 ? _b : 1334}px;box-sizing:border-box;`;
                this.options.container.append(backdrop);
                __classPrivateFieldGet(this, _WebProvider_backdrops, "f").set(entry.id, backdrop);
            }
            backdrop.style.display = 'block';
            backdrop.style.zIndex = String(order * 3 + 1);
            backdrop.style.pointerEvents = entry.activity === 'active' ? 'auto' : 'none';
            if (entry.presentation.backdrop === 'frozenBlur') {
                if (snapshot && order === activeBlur) {
                    backdrop.replaceChildren(snapshot);
                    const tint = this.options.container.ownerDocument.createElement('div');
                    tint.style.cssText =
                        'position:absolute;inset:0;background:rgba(5,10,20,0.28);pointer-events:none;';
                    backdrop.append(tint);
                }
            }
            else
                backdrop.replaceChildren();
        });
        for (const [id, backdrop] of __classPrivateFieldGet(this, _WebProvider_backdrops, "f")) {
            if (live.has(id))
                continue;
            backdrop.remove();
            __classPrivateFieldGet(this, _WebProvider_backdrops, "f").delete(id);
        }
        await super.presentNative(entries);
    }
    disposeNative() {
        __classPrivateFieldGet(this, _WebProvider_abort, "f").abort();
        for (const backdrop of __classPrivateFieldGet(this, _WebProvider_backdrops, "f").values())
            backdrop.remove();
        __classPrivateFieldGet(this, _WebProvider_backdrops, "f").clear();
        __classPrivateFieldGet(this, _WebProvider_store, "f").dispose();
    }
}
_WebProvider_store = new WeakMap(), _WebProvider_abort = new WeakMap(), _WebProvider_backdrops = new WeakMap();
async function load(entry, mapping, document, signal) {
    var _a;
    const mapped = mapping[entry.id];
    if (!mapped || mapped.sha256 !== entry.sha256)
        throw new Error(`Missing or mismatched resource mapping: ${entry.id}`);
    const response = await fetch(mapped.url, { signal });
    if (!response.ok)
        throw new Error(`Resource ${entry.id}: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const subtle = (_a = globalThis.crypto) === null || _a === void 0 ? void 0 : _a.subtle;
    const digest = subtle
        ? Array.from(new Uint8Array(await subtle.digest('SHA-256', bytes)), (n) => n.toString(16).padStart(2, '0')).join('')
        : sha256(new Uint8Array(bytes));
    if (digest !== entry.sha256)
        throw new Error(`Resource checksum mismatch: ${entry.id}`);
    const url = URL.createObjectURL(new Blob([bytes], { type: entry.kind === 'font' ? 'font/ttf' : 'image/png' }));
    try {
        if (entry.kind === 'font') {
            const family = `UniFlex-${entry.sha256.slice(0, 16)}`;
            const font = new FontFace(family, bytes, { weight: String(entry.weight) });
            await font.load();
            if (signal.aborted)
                throw new Error('Font load cancelled.');
            document.fonts.add(font);
            return { url, font, family };
        }
        const image = document.createElement('img');
        image.src = url;
        await image.decode();
        if (image.naturalWidth !== entry.width || image.naturalHeight !== entry.height)
            throw new Error(`Decoded size mismatch: ${entry.id}`);
        return { url, image };
    }
    catch (error) {
        URL.revokeObjectURL(url);
        throw error;
    }
}
