import {
  retainComponentResources
} from "./chunk-VVXXKJHP.js";
import {
  mountComponent
} from "./chunk-YDFCQFP2.js";
import {
  createAggregateError,
  promiseFinally
} from "./chunk-2T32RA5W.js";
import {
  canonicalJson,
  freezeJson,
  jsonHash
} from "./chunk-EAG4H2KJ.js";

// frontend/packages/core/dist/provider/resource-provider.js
var imageRef = (id) => Object.freeze({ kind: "image", id });
var fontRef = (id, weight) => Object.freeze({ kind: "font", id, weight });

// frontend/packages/core/dist/provider/provider-base.js
var __classPrivateFieldGet = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var _RetainedUIProvider_mounts;
var _RetainedUIProvider_hosts;
var _RetainedUIProvider_surfaces;
var _RetainedUIProvider_disposed;
var _RetainedUIProvider_nextSurfaceId;
var _RetainedUIProvider_presentation;
var _RetainedUIProvider_presentQueue;
var _RetainedUIProvider_anchorListeners;
var RetainedUIProvider = class {
  constructor(assets) {
    this.assets = assets;
    _RetainedUIProvider_mounts.set(this, /* @__PURE__ */ new Set());
    _RetainedUIProvider_hosts.set(this, /* @__PURE__ */ new Map());
    _RetainedUIProvider_surfaces.set(this, /* @__PURE__ */ new Map());
    _RetainedUIProvider_disposed.set(this, false);
    _RetainedUIProvider_nextSurfaceId.set(this, 1);
    _RetainedUIProvider_presentation.set(this, []);
    _RetainedUIProvider_presentQueue.set(this, Promise.resolve());
    _RetainedUIProvider_anchorListeners.set(this, /* @__PURE__ */ new Set());
    this.compositor = Object.freeze({
      present: (surfaces) => this.present(surfaces)
    });
    this.anchors = Object.freeze({
      resolve: (name) => this.resolveAnchor(name),
      subscribe: (listener) => {
        __classPrivateFieldGet(this, _RetainedUIProvider_anchorListeners, "f").add(listener);
        return () => __classPrivateFieldGet(this, _RetainedUIProvider_anchorListeners, "f").delete(listener);
      }
    });
  }
  mount(component, props, runtimeOptions = {}) {
    var _a;
    var _b, _c;
    if (__classPrivateFieldGet(this, _RetainedUIProvider_disposed, "f"))
      throw new Error("UIProvider has been disposed.");
    const source = {};
    const resources = retainComponentResources(component);
    let host;
    try {
      host = this.createHost({
        resources,
        anchorsChanged: () => {
          if (source.current)
            this.notifyAnchorsChanged(source.current);
        }
      });
    } catch (error) {
      resources === null || resources === void 0 ? void 0 : resources.release();
      throw error;
    }
    source.current = host;
    let runtime;
    try {
      runtime = mountComponent(component, host.driver, props, runtimeOptions);
    } catch (error) {
      try {
        host.destroy();
      } finally {
        resources === null || resources === void 0 ? void 0 : resources.release();
      }
      throw error;
    }
    let destroyed = false;
    const token = Object.freeze({ id: (__classPrivateFieldSet(this, _RetainedUIProvider_nextSurfaceId, (_c = __classPrivateFieldGet(this, _RetainedUIProvider_nextSurfaceId, "f"), _b = _c++, _c), "f"), _b) });
    const handle = {
      surface: token,
      get metrics() {
        return { runtime: Object.assign({}, runtime.metrics), layout: snapshotLayout(host.metrics) };
      },
      update: (p) => runtime.update(p),
      batch: (action) => runtime.batch(action),
      flushNow: () => runtime.flushNow(),
      destroy: () => {
        if (destroyed)
          return;
        destroyed = true;
        try {
          runtime.destroy();
        } finally {
          try {
            host.destroy();
          } finally {
            __classPrivateFieldGet(this, _RetainedUIProvider_mounts, "f").delete(handle);
            __classPrivateFieldGet(this, _RetainedUIProvider_hosts, "f").delete(host);
            __classPrivateFieldGet(this, _RetainedUIProvider_surfaces, "f").delete(token.id);
            __classPrivateFieldSet(this, _RetainedUIProvider_presentation, __classPrivateFieldGet(this, _RetainedUIProvider_presentation, "f").filter((entry) => entry.surface.id !== token.id), "f");
            try {
              this.notifyAnchorsChanged();
            } finally {
              resources === null || resources === void 0 ? void 0 : resources.release();
            }
          }
        }
      }
    };
    __classPrivateFieldGet(this, _RetainedUIProvider_mounts, "f").add(handle);
    __classPrivateFieldGet(this, _RetainedUIProvider_hosts, "f").set(host, handle);
    __classPrivateFieldGet(this, _RetainedUIProvider_surfaces, "f").set(token.id, {
      token,
      host,
      runtime,
      handle
    });
    try {
      runtime.setSuspended(true);
      (_a = host.present) === null || _a === void 0 ? void 0 : _a.call(host, "parked", -1, {
        coverage: "opaque",
        backdrop: "none",
        blockInputBelow: true,
        transition: "none"
      }, "steady");
    } catch (error) {
      handle.destroy();
      throw error;
    }
    return handle;
  }
  present(surfaces) {
    const snapshot = surfaces.map((entry) => Object.assign({}, entry));
    const operation = async () => {
      if (__classPrivateFieldGet(this, _RetainedUIProvider_disposed, "f"))
        throw new Error("UIProvider has been disposed.");
      const next = this.resolvePresentation(snapshot);
      const previous = this.resolvePresentation(__classPrivateFieldGet(this, _RetainedUIProvider_presentation, "f"));
      this.setRuntimeActivity(next);
      try {
        await this.presentNative(next);
        __classPrivateFieldSet(this, _RetainedUIProvider_presentation, snapshot, "f");
        this.notifyAnchorsChanged();
      } catch (error) {
        this.setRuntimeActivity(previous);
        try {
          await this.presentNative(previous);
        } catch (_a) {
        }
        throw error;
      }
    };
    const result = __classPrivateFieldGet(this, _RetainedUIProvider_presentQueue, "f").then(operation, operation);
    __classPrivateFieldSet(this, _RetainedUIProvider_presentQueue, result.catch(() => {
    }), "f");
    return result;
  }
  resolvePresentation(surfaces) {
    var _a;
    const seen = /* @__PURE__ */ new Set();
    const resolved = [];
    for (const entry of surfaces) {
      if (seen.has(entry.surface.id))
        throw new Error(`Duplicate surface in presentation: ${entry.surface.id}`);
      seen.add(entry.surface.id);
      const record = __classPrivateFieldGet(this, _RetainedUIProvider_surfaces, "f").get(entry.surface.id);
      if (!record)
        throw new Error(`Unknown or destroyed surface: ${entry.surface.id}`);
      resolved.push({
        id: entry.surface.id,
        host: record.host,
        activity: entry.activity,
        presentation: entry.presentation,
        transitionState: (_a = entry.transitionState) !== null && _a !== void 0 ? _a : "steady"
      });
    }
    for (const [id, record] of __classPrivateFieldGet(this, _RetainedUIProvider_surfaces, "f")) {
      if (seen.has(id))
        continue;
      resolved.push({
        id,
        host: record.host,
        activity: "parked",
        presentation: {
          coverage: "opaque",
          backdrop: "none",
          blockInputBelow: true,
          transition: "none"
        },
        transitionState: "steady"
      });
    }
    return resolved;
  }
  setRuntimeActivity(entries) {
    const presentations = new Map(entries.map((entry) => [entry.id, entry]));
    for (const [id, record] of __classPrivateFieldGet(this, _RetainedUIProvider_surfaces, "f")) {
      const entry = presentations.get(id);
      const active = (entry === null || entry === void 0 ? void 0 : entry.activity) === "active" && entry.transitionState !== "exiting";
      record.runtime.setSuspended(!active);
      if (active)
        record.runtime.flushNow();
    }
  }
  async presentNative(entries) {
    await Promise.all(entries.map((entry, order) => {
      var _a, _b;
      return (_b = (_a = entry.host).present) === null || _b === void 0 ? void 0 : _b.call(_a, entry.activity, order, entry.presentation, entry.transitionState);
    }));
  }
  resolveAnchor(name) {
    var _a, _b;
    if (!name)
      return void 0;
    for (let index = __classPrivateFieldGet(this, _RetainedUIProvider_presentation, "f").length - 1; index >= 0; index--) {
      const entry = __classPrivateFieldGet(this, _RetainedUIProvider_presentation, "f")[index];
      if (entry.activity === "parked" || entry.zIndex === "feedback")
        continue;
      const host = (_a = __classPrivateFieldGet(this, _RetainedUIProvider_surfaces, "f").get(entry.surface.id)) === null || _a === void 0 ? void 0 : _a.host;
      const rect = (_b = host === null || host === void 0 ? void 0 : host.findAnchor) === null || _b === void 0 ? void 0 : _b.call(host, name);
      if (rect)
        return Object.assign({}, rect);
    }
    return void 0;
  }
  notifyAnchorsChanged(source) {
    if (source) {
      const surface = [...__classPrivateFieldGet(this, _RetainedUIProvider_surfaces, "f").values()].find((entry) => entry.host === source);
      if (surface && __classPrivateFieldGet(this, _RetainedUIProvider_presentation, "f").some((entry) => entry.surface.id === surface.token.id && entry.zIndex === "feedback"))
        return;
    }
    for (const listener of [...__classPrivateFieldGet(this, _RetainedUIProvider_anchorListeners, "f")])
      listener();
  }
  dispose() {
    if (__classPrivateFieldGet(this, _RetainedUIProvider_disposed, "f"))
      return;
    __classPrivateFieldSet(this, _RetainedUIProvider_disposed, true, "f");
    let failure;
    for (const mount of [...__classPrivateFieldGet(this, _RetainedUIProvider_mounts, "f")]) {
      try {
        mount.destroy();
      } catch (error) {
        failure !== null && failure !== void 0 ? failure : failure = error;
      }
    }
    __classPrivateFieldGet(this, _RetainedUIProvider_mounts, "f").clear();
    __classPrivateFieldGet(this, _RetainedUIProvider_surfaces, "f").clear();
    __classPrivateFieldSet(this, _RetainedUIProvider_presentation, [], "f");
    __classPrivateFieldGet(this, _RetainedUIProvider_anchorListeners, "f").clear();
    try {
      this.disposeNative();
    } catch (error) {
      failure !== null && failure !== void 0 ? failure : failure = error;
    }
    if (failure)
      throw failure;
  }
  disposeNative() {
  }
  /** Read-only presentation checkpoint; tokens contain no platform handles. */
  inspectPresentation() {
    return __classPrivateFieldGet(this, _RetainedUIProvider_presentation, "f").map((entry) => Object.assign({}, entry));
  }
  /** Read-only diagnostics for launcher QA; contains no host handles. */
  inspect() {
    return [...__classPrivateFieldGet(this, _RetainedUIProvider_hosts, "f")].map(([host, handle]) => {
      var _a;
      var _b;
      return {
        nodes: (_b = (_a = host.inspect) === null || _a === void 0 ? void 0 : _a.call(host)) !== null && _b !== void 0 ? _b : [],
        layout: snapshotLayout(host.metrics),
        runtime: Object.assign({}, handle.metrics.runtime)
      };
    });
  }
};
_RetainedUIProvider_mounts = /* @__PURE__ */ new WeakMap(), _RetainedUIProvider_hosts = /* @__PURE__ */ new WeakMap(), _RetainedUIProvider_surfaces = /* @__PURE__ */ new WeakMap(), _RetainedUIProvider_disposed = /* @__PURE__ */ new WeakMap(), _RetainedUIProvider_nextSurfaceId = /* @__PURE__ */ new WeakMap(), _RetainedUIProvider_presentation = /* @__PURE__ */ new WeakMap(), _RetainedUIProvider_presentQueue = /* @__PURE__ */ new WeakMap(), _RetainedUIProvider_anchorListeners = /* @__PURE__ */ new WeakMap();
function snapshotLayout(metrics) {
  return Object.assign(Object.assign({}, metrics), metrics.work ? { work: Object.assign({}, metrics.work) } : {});
}

// frontend/packages/core/dist/provider/json-resource-store.js
var __classPrivateFieldGet2 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet2 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var _JsonResourceStore_ready;
var _JsonResourceStore_pending;
var _JsonResourceStore_disposed;
var JsonResourceStore = class {
  constructor(load) {
    this.load = load;
    _JsonResourceStore_ready.set(this, /* @__PURE__ */ new Map());
    _JsonResourceStore_pending.set(this, /* @__PURE__ */ new Map());
    _JsonResourceStore_disposed.set(this, false);
  }
  async loadJson(ref) {
    var _a;
    if (__classPrivateFieldGet2(this, _JsonResourceStore_disposed, "f"))
      throw new Error("ResourceProvider has been disposed.");
    if (!ref || typeof ref.id !== "string" || !ref.id || ref.id.startsWith("/") || // eslint-disable-next-line no-control-regex -- Resource identifiers must reject NUL.
    /[:\\\x00]/.test(ref.id) || ref.id.split("/").some((part) => !part || part === "..") || !/^[a-f0-9]{64}$/.test(ref.sha256))
      throw new Error("Invalid JSON reference.");
    ref = Object.freeze({ id: ref.id, sha256: ref.sha256 });
    const ready = __classPrivateFieldGet2(this, _JsonResourceStore_ready, "f").get(ref.id), pending = __classPrivateFieldGet2(this, _JsonResourceStore_pending, "f").get(ref.id);
    const previousHash = (_a = ready === null || ready === void 0 ? void 0 : ready.hash) !== null && _a !== void 0 ? _a : pending === null || pending === void 0 ? void 0 : pending.hash;
    if (previousHash && previousHash !== ref.sha256)
      throw new Error(`JSON hash conflict: ${ref.id}`);
    if (ready)
      return ready.value;
    if (pending)
      return pending.promise;
    const promise = promiseFinally(Promise.resolve().then(() => {
      if (__classPrivateFieldGet2(this, _JsonResourceStore_disposed, "f"))
        throw new Error("ResourceProvider disposed before JSON load.");
      return this.load(ref);
    }).then((loaded) => {
      var _a2;
      try {
        if (__classPrivateFieldGet2(this, _JsonResourceStore_disposed, "f"))
          throw new Error("ResourceProvider disposed during JSON load.");
        if (jsonHash(loaded.value) !== ref.sha256)
          throw new Error(`JSON checksum mismatch: ${ref.id}`);
        freezeJson(loaded.value);
        __classPrivateFieldGet2(this, _JsonResourceStore_ready, "f").set(ref.id, Object.assign(Object.assign({}, loaded), { hash: ref.sha256 }));
        return loaded.value;
      } catch (error) {
        (_a2 = loaded.release) === null || _a2 === void 0 ? void 0 : _a2.call(loaded);
        throw error;
      }
    }), () => __classPrivateFieldGet2(this, _JsonResourceStore_pending, "f").delete(ref.id));
    __classPrivateFieldGet2(this, _JsonResourceStore_pending, "f").set(ref.id, { hash: ref.sha256, promise });
    return promise;
  }
  has(id) {
    return __classPrivateFieldGet2(this, _JsonResourceStore_ready, "f").has(id);
  }
  dispose() {
    var _a;
    if (__classPrivateFieldGet2(this, _JsonResourceStore_disposed, "f"))
      return;
    __classPrivateFieldSet2(this, _JsonResourceStore_disposed, true, "f");
    let failure;
    for (const loaded of __classPrivateFieldGet2(this, _JsonResourceStore_ready, "f").values()) {
      try {
        (_a = loaded.release) === null || _a === void 0 ? void 0 : _a.call(loaded);
      } catch (error) {
        failure !== null && failure !== void 0 ? failure : failure = error;
      }
    }
    __classPrivateFieldGet2(this, _JsonResourceStore_ready, "f").clear();
    __classPrivateFieldGet2(this, _JsonResourceStore_pending, "f").clear();
    if (failure)
      throw failure;
  }
};
_JsonResourceStore_ready = /* @__PURE__ */ new WeakMap(), _JsonResourceStore_pending = /* @__PURE__ */ new WeakMap(), _JsonResourceStore_disposed = /* @__PURE__ */ new WeakMap();

// frontend/packages/core/dist/provider/parse-catalog.js
function parseResourceCatalog(value) {
  const fail = (message) => {
    throw new Error(message);
  };
  if (!value || typeof value !== "object")
    fail("Invalid resource catalog.");
  const catalog = value;
  if (catalog.version !== 1 || !/^[a-f0-9]{64}$/.test(catalog.hash) || !Array.isArray(catalog.resources))
    fail("Invalid resource catalog version/shape.");
  const ids = /* @__PURE__ */ new Set();
  const finite = (v) => typeof v === "number" && Number.isFinite(v);
  for (const entry of catalog.resources) {
    if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) || !/^[a-f0-9]{64}$/.test(entry.sha256))
      fail(`Invalid or duplicate resource: ${entry === null || entry === void 0 ? void 0 : entry.id}`);
    ids.add(entry.id);
    if (entry.kind !== "image" && entry.kind !== "font")
      fail("Unsupported resource kind.");
    if (typeof entry.file !== "string" || !entry.file || entry.file.startsWith("/") || entry.file.split("/").some((p) => !p || p === "..") || // eslint-disable-next-line no-control-regex -- Resource paths must reject NUL.
    /[:\\\x00]/.test(entry.file))
      fail(`Resource path must be relative: ${entry.id}`);
    if (entry.kind === "image") {
      if (!finite(entry.width) || !finite(entry.height) || entry.width <= 0 || entry.height <= 0)
        fail(`Invalid image size: ${entry.id}`);
      if (entry.nineSlice !== void 0 && (!Array.isArray(entry.nineSlice) || entry.nineSlice.length !== 4 || entry.nineSlice.some((n) => !finite(n) || n < 0) || entry.nineSlice[0] + entry.nineSlice[2] > entry.width || entry.nineSlice[1] + entry.nineSlice[3] > entry.height))
        fail(`Invalid nine-slice: ${entry.id}`);
    } else {
      const m = entry.metrics;
      if (![400, 700].includes(entry.weight) || !m || !finite(m.unitsPerEm) || m.unitsPerEm <= 0 || !finite(m.ascender) || !finite(m.descender) || !finite(m.lineGap) || !m.advances || typeof m.advances !== "object" || Array.isArray(m.advances) || Object.values(m.advances).some((n) => !finite(n) || n < 0))
        fail(`Missing or invalid font metrics: ${entry.id}`);
      if (entry.fallbackCharacter !== void 0 && ([...entry.fallbackCharacter].length !== 1 || m.advances[entry.fallbackCharacter] === void 0))
        fail(`Invalid fallback glyph: ${entry.id}`);
    }
  }
  return catalog;
}

// frontend/packages/core/dist/provider/resource-contexts.js
var __classPrivateFieldGet3 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet3 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var _ResourceContexts_entries;
var _ResourceContexts_leases;
var _ResourceContexts_failedCleanup;
var _ResourceContexts_disposed;
var _ResourceContexts_sequence;
var ResourceContexts = class {
  constructor(create, destroy) {
    this.create = create;
    this.destroy = destroy;
    _ResourceContexts_entries.set(this, /* @__PURE__ */ new Map());
    _ResourceContexts_leases.set(this, /* @__PURE__ */ new WeakMap());
    _ResourceContexts_failedCleanup.set(this, /* @__PURE__ */ new Map());
    _ResourceContexts_disposed.set(this, false);
    _ResourceContexts_sequence.set(this, 0);
  }
  async acquire(catalog) {
    var _a, _b;
    if (__classPrivateFieldGet3(this, _ResourceContexts_disposed, "f"))
      throw new Error("Resource contexts have been disposed.");
    parseResourceCatalog(catalog);
    const resources = JSON.parse(canonicalJson(catalog.resources));
    freezeJson(resources);
    const key = jsonHash(resources);
    if (__classPrivateFieldGet3(this, _ResourceContexts_failedCleanup, "f").has(key))
      throw new Error(`Resource context cleanup failed: ${key}`);
    let entry = __classPrivateFieldGet3(this, _ResourceContexts_entries, "f").get(key);
    if (!entry) {
      const fresh = {
        key,
        owners: 0,
        disposed: false,
        lastUse: __classPrivateFieldSet3(this, _ResourceContexts_sequence, (_a = __classPrivateFieldGet3(this, _ResourceContexts_sequence, "f"), ++_a), "f"),
        ready: Promise.resolve().then(() => {
          if (__classPrivateFieldGet3(this, _ResourceContexts_disposed, "f"))
            throw new Error("Resource contexts have been disposed.");
          return this.create({ version: 1, hash: key, resources }, key);
        }).then((value) => {
          if (fresh.disposed || __classPrivateFieldGet3(this, _ResourceContexts_disposed, "f")) {
            this.destroyContext(key, value);
            throw new Error("Resource context disposed during preparation.");
          }
          fresh.value = value;
          return value;
        }).catch((error) => {
          if (__classPrivateFieldGet3(this, _ResourceContexts_entries, "f").get(key) === fresh)
            __classPrivateFieldGet3(this, _ResourceContexts_entries, "f").delete(key);
          throw error;
        })
      };
      entry = fresh;
      __classPrivateFieldGet3(this, _ResourceContexts_entries, "f").set(key, entry);
    }
    entry.owners++;
    entry.lastUse = __classPrivateFieldSet3(this, _ResourceContexts_sequence, (_b = __classPrivateFieldGet3(this, _ResourceContexts_sequence, "f"), ++_b), "f");
    try {
      await entry.ready;
      if (__classPrivateFieldGet3(this, _ResourceContexts_disposed, "f") || entry.disposed)
        throw new Error("Resource context has been disposed.");
      return this.lease(entry);
    } catch (error) {
      entry.owners--;
      throw error;
    }
  }
  resolve(lease) {
    const state = __classPrivateFieldGet3(this, _ResourceContexts_leases, "f").get(lease);
    if (__classPrivateFieldGet3(this, _ResourceContexts_disposed, "f") || !state || state.released || state.entry.disposed)
      throw new Error("Foreign, released or disposed resource lease.");
    return state.entry.value;
  }
  lease(entry) {
    const state = { entry, released: false };
    const lease = Object.freeze({
      key: entry.key,
      retain: () => {
        var _a;
        this.resolve(lease);
        entry.owners++;
        entry.lastUse = __classPrivateFieldSet3(this, _ResourceContexts_sequence, (_a = __classPrivateFieldGet3(this, _ResourceContexts_sequence, "f"), ++_a), "f");
        return this.lease(entry);
      },
      release: () => {
        var _a;
        if (state.released)
          return;
        state.released = true;
        entry.owners--;
        entry.lastUse = __classPrivateFieldSet3(this, _ResourceContexts_sequence, (_a = __classPrivateFieldGet3(this, _ResourceContexts_sequence, "f"), ++_a), "f");
      }
    });
    __classPrivateFieldGet3(this, _ResourceContexts_leases, "f").set(lease, state);
    return lease;
  }
  evictUnused() {
    this.clear((entry) => entry.owners === 0);
  }
  trimUnused({ maxContexts }) {
    if (!Number.isSafeInteger(maxContexts) || maxContexts < 0)
      throw new Error("Resource context budget must be a non-negative integer.");
    const evicted = new Set([...__classPrivateFieldGet3(this, _ResourceContexts_entries, "f").values()].filter((entry) => entry.owners === 0).sort((a, b) => b.lastUse - a.lastUse).slice(maxContexts));
    this.clear((entry) => evicted.has(entry));
  }
  inspectRetention() {
    return {
      contexts: [...__classPrivateFieldGet3(this, _ResourceContexts_entries, "f").values()].map((entry) => ({
        key: entry.key,
        owners: entry.owners,
        state: entry.value === void 0 ? "preparing" : "ready",
        lastUse: entry.lastUse
      })),
      failedCleanup: __classPrivateFieldGet3(this, _ResourceContexts_failedCleanup, "f").size,
      nativeBytes: "unknown"
    };
  }
  dispose() {
    if (__classPrivateFieldGet3(this, _ResourceContexts_disposed, "f")) {
      if (__classPrivateFieldGet3(this, _ResourceContexts_failedCleanup, "f").size)
        throw createAggregateError([...__classPrivateFieldGet3(this, _ResourceContexts_failedCleanup, "f").values()].map((value) => value.error), "Resource context cleanup failed");
      return;
    }
    __classPrivateFieldSet3(this, _ResourceContexts_disposed, true, "f");
    this.clear(() => true);
  }
  destroyContext(key, value) {
    try {
      this.destroy(value);
    } catch (error) {
      __classPrivateFieldGet3(this, _ResourceContexts_failedCleanup, "f").set(key, { value, error });
      throw error;
    }
  }
  clear(select) {
    let failure;
    for (const [key, entry] of __classPrivateFieldGet3(this, _ResourceContexts_entries, "f")) {
      if (!select(entry))
        continue;
      __classPrivateFieldGet3(this, _ResourceContexts_entries, "f").delete(key);
      entry.disposed = true;
      if (entry.value !== void 0) {
        try {
          this.destroyContext(key, entry.value);
        } catch (error) {
          failure !== null && failure !== void 0 ? failure : failure = error;
        }
      }
    }
    if (failure)
      throw failure;
    if (__classPrivateFieldGet3(this, _ResourceContexts_failedCleanup, "f").size)
      throw createAggregateError([...__classPrivateFieldGet3(this, _ResourceContexts_failedCleanup, "f").values()].map((value) => value.error), "Resource context cleanup failed");
  }
};
_ResourceContexts_entries = /* @__PURE__ */ new WeakMap(), _ResourceContexts_leases = /* @__PURE__ */ new WeakMap(), _ResourceContexts_failedCleanup = /* @__PURE__ */ new WeakMap(), _ResourceContexts_disposed = /* @__PURE__ */ new WeakMap(), _ResourceContexts_sequence = /* @__PURE__ */ new WeakMap();

// frontend/packages/core/dist/provider/resource-store.js
var __classPrivateFieldSet4 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet4 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _ResourceStore_ready;
var _ResourceStore_pending;
var _ResourceStore_disposed;
var _ResourceStore_json;
var _ResourceStore_activeLoads;
var _ResourceStore_loadQueue;
var _ResourceStore_shared;
var _ResourceStore_failedShared;
var _ResourceStore_loadedIds;
var _ResourceStore_defaultFonts;
var _ResourceStore_contexts;
var ResourceStore = class _ResourceStore {
  constructor(load, release, loadJson = async (ref) => {
    throw new Error(`Missing JSON mapping: ${ref.id}`);
  }, maxConcurrentLoads = 8) {
    this.load = load;
    this.release = release;
    this.maxConcurrentLoads = maxConcurrentLoads;
    _ResourceStore_ready.set(this, /* @__PURE__ */ new Map());
    _ResourceStore_pending.set(this, /* @__PURE__ */ new Map());
    _ResourceStore_disposed.set(this, false);
    _ResourceStore_json.set(this, void 0);
    _ResourceStore_activeLoads.set(this, 0);
    _ResourceStore_loadQueue.set(this, []);
    _ResourceStore_shared.set(this, /* @__PURE__ */ new Map());
    _ResourceStore_failedShared.set(this, /* @__PURE__ */ new Map());
    _ResourceStore_loadedIds.set(this, /* @__PURE__ */ new Map());
    _ResourceStore_defaultFonts.set(this, /* @__PURE__ */ new Map());
    _ResourceStore_contexts.set(this, void 0);
    if (!Number.isSafeInteger(maxConcurrentLoads) || maxConcurrentLoads < 1)
      throw new Error("Resource load concurrency must be a positive integer.");
    __classPrivateFieldSet4(this, _ResourceStore_json, new JsonResourceStore(loadJson), "f");
    __classPrivateFieldSet4(this, _ResourceStore_contexts, new ResourceContexts(async (catalog) => {
      const scoped = new _ResourceStore((entry) => this.loadShared(entry), (value) => this.releaseShared(value), void 0, maxConcurrentLoads);
      try {
        await scoped.prepare(catalog);
        return scoped;
      } catch (error) {
        scoped.dispose();
        throw error;
      }
    }, (scoped) => scoped.dispose()), "f");
  }
  acquire(catalog) {
    return __classPrivateFieldGet4(this, _ResourceStore_contexts, "f").acquire(catalog);
  }
  context(lease) {
    if (!lease)
      return this;
    const scoped = __classPrivateFieldGet4(this, _ResourceStore_contexts, "f").resolve(lease);
    return {
      resolve: (ref) => {
        const result = scoped.resolve(ref);
        return { entry: result.entry, native: result.native.native };
      },
      font: (ref, bold) => {
        const result = scoped.font(ref, bold);
        return { entry: result.entry, native: result.native.native };
      }
    };
  }
  evictUnused() {
    __classPrivateFieldGet4(this, _ResourceStore_contexts, "f").evictUnused();
  }
  trimUnused(options) {
    __classPrivateFieldGet4(this, _ResourceStore_contexts, "f").trimUnused(options);
  }
  inspectRetention() {
    return Object.assign(Object.assign({}, __classPrivateFieldGet4(this, _ResourceStore_contexts, "f").inspectRetention()), { sharedNativeEntries: __classPrivateFieldGet4(this, _ResourceStore_shared, "f").size, failedNativeCleanup: __classPrivateFieldGet4(this, _ResourceStore_failedShared, "f").size });
  }
  async loadShared(entry) {
    const key = jsonHash(entry);
    if (__classPrivateFieldGet4(this, _ResourceStore_failedShared, "f").has(key))
      throw new Error(`Native resource cleanup failed: ${entry.id}`);
    let shared = __classPrivateFieldGet4(this, _ResourceStore_shared, "f").get(key);
    if (!shared) {
      const created = {
        key,
        entry,
        references: 0,
        promise: Promise.resolve().then(() => this.loadBounded(entry)).then((native) => {
          var _a;
          created.native = native;
          __classPrivateFieldGet4(this, _ResourceStore_loadedIds, "f").set(entry.id, ((_a = __classPrivateFieldGet4(this, _ResourceStore_loadedIds, "f").get(entry.id)) !== null && _a !== void 0 ? _a : 0) + 1);
          return native;
        })
      };
      shared = created;
      __classPrivateFieldGet4(this, _ResourceStore_shared, "f").set(key, shared);
    }
    shared.references++;
    try {
      await shared.promise;
      return shared;
    } catch (error) {
      shared.references--;
      if (__classPrivateFieldGet4(this, _ResourceStore_shared, "f").get(key) === shared)
        __classPrivateFieldGet4(this, _ResourceStore_shared, "f").delete(key);
      throw error;
    }
  }
  releaseShared(shared) {
    var _a;
    if (--shared.references !== 0)
      return;
    if (__classPrivateFieldGet4(this, _ResourceStore_shared, "f").get(shared.key) === shared)
      __classPrivateFieldGet4(this, _ResourceStore_shared, "f").delete(shared.key);
    const remaining = ((_a = __classPrivateFieldGet4(this, _ResourceStore_loadedIds, "f").get(shared.entry.id)) !== null && _a !== void 0 ? _a : 1) - 1;
    if (remaining)
      __classPrivateFieldGet4(this, _ResourceStore_loadedIds, "f").set(shared.entry.id, remaining);
    else
      __classPrivateFieldGet4(this, _ResourceStore_loadedIds, "f").delete(shared.entry.id);
    try {
      this.release(shared.native);
    } catch (error) {
      __classPrivateFieldGet4(this, _ResourceStore_failedShared, "f").set(shared.key, { native: shared.native, error });
      throw error;
    }
  }
  loadJson(ref) {
    return __classPrivateFieldGet4(this, _ResourceStore_json, "f").loadJson(ref);
  }
  async prepare(catalog) {
    var _a, _b;
    var _c;
    if (__classPrivateFieldGet4(this, _ResourceStore_disposed, "f"))
      throw new Error("ResourceProvider has been disposed.");
    parseResourceCatalog(catalog);
    catalog = JSON.parse(canonicalJson(catalog));
    freezeJson(catalog);
    for (const entry of catalog.resources) {
      const hash = (_c = (_a = __classPrivateFieldGet4(this, _ResourceStore_ready, "f").get(entry.id)) === null || _a === void 0 ? void 0 : _a.entry.sha256) !== null && _c !== void 0 ? _c : (_b = __classPrivateFieldGet4(this, _ResourceStore_pending, "f").get(entry.id)) === null || _b === void 0 ? void 0 : _b.hash;
      if (hash && hash !== entry.sha256)
        throw new Error(`Resource hash conflict: ${entry.id}`);
    }
    for (const entry of catalog.resources) {
      if (entry.kind === "font" && !__classPrivateFieldGet4(this, _ResourceStore_defaultFonts, "f").has(entry.weight))
        __classPrivateFieldGet4(this, _ResourceStore_defaultFonts, "f").set(entry.weight, {
          kind: "font",
          id: entry.id,
          weight: entry.weight
        });
    }
    await Promise.all(catalog.resources.map((entry) => {
      if (__classPrivateFieldGet4(this, _ResourceStore_ready, "f").has(entry.id))
        return;
      const pending = __classPrivateFieldGet4(this, _ResourceStore_pending, "f").get(entry.id);
      if (pending)
        return pending.promise;
      const promise = promiseFinally(Promise.resolve().then(() => this.loadShared(entry)).then((shared) => {
        if (__classPrivateFieldGet4(this, _ResourceStore_disposed, "f")) {
          this.releaseShared(shared);
          throw new Error("ResourceProvider disposed during prepare.");
        }
        __classPrivateFieldGet4(this, _ResourceStore_ready, "f").set(entry.id, { entry, native: shared.native, shared });
      }), () => __classPrivateFieldGet4(this, _ResourceStore_pending, "f").delete(entry.id));
      __classPrivateFieldGet4(this, _ResourceStore_pending, "f").set(entry.id, { hash: entry.sha256, promise });
      return promise;
    }));
  }
  async loadBounded(entry) {
    var _a, _b;
    if (__classPrivateFieldGet4(this, _ResourceStore_activeLoads, "f") >= this.maxConcurrentLoads)
      await new Promise((resolve) => __classPrivateFieldGet4(this, _ResourceStore_loadQueue, "f").push(resolve));
    else
      __classPrivateFieldSet4(this, _ResourceStore_activeLoads, (_a = __classPrivateFieldGet4(this, _ResourceStore_activeLoads, "f"), _a++, _a), "f");
    try {
      if (__classPrivateFieldGet4(this, _ResourceStore_disposed, "f"))
        throw new Error("ResourceProvider disposed before prepare.");
      return await this.load(entry);
    } finally {
      const next = __classPrivateFieldGet4(this, _ResourceStore_loadQueue, "f").shift();
      if (next)
        next();
      else
        __classPrivateFieldSet4(this, _ResourceStore_activeLoads, (_b = __classPrivateFieldGet4(this, _ResourceStore_activeLoads, "f"), _b--, _b), "f");
    }
  }
  has(id) {
    return __classPrivateFieldGet4(this, _ResourceStore_ready, "f").has(id) || __classPrivateFieldGet4(this, _ResourceStore_json, "f").has(id) || __classPrivateFieldGet4(this, _ResourceStore_loadedIds, "f").has(id);
  }
  resolve(ref) {
    if (__classPrivateFieldGet4(this, _ResourceStore_disposed, "f"))
      throw new Error("ResourceProvider has been disposed.");
    const found = __classPrivateFieldGet4(this, _ResourceStore_ready, "f").get(ref === null || ref === void 0 ? void 0 : ref.id);
    if (!found || found.entry.kind !== ref.kind)
      throw new Error(`Unprepared or missing ${ref === null || ref === void 0 ? void 0 : ref.kind} resource: ${ref === null || ref === void 0 ? void 0 : ref.id}`);
    return found;
  }
  font(ref, bold = false) {
    const selected = ref !== null && ref !== void 0 ? ref : __classPrivateFieldGet4(this, _ResourceStore_defaultFonts, "f").get(bold ? 700 : 400);
    const result = selected ? this.resolve(selected) : void 0;
    if (!result || result.entry.kind !== "font")
      throw new Error(`Missing font weight ${bold ? 700 : 400}`);
    return result;
  }
  dispose() {
    if (__classPrivateFieldGet4(this, _ResourceStore_disposed, "f"))
      return;
    __classPrivateFieldSet4(this, _ResourceStore_disposed, true, "f");
    let failure;
    try {
      __classPrivateFieldGet4(this, _ResourceStore_json, "f").dispose();
    } catch (error) {
      failure = error;
    }
    try {
      __classPrivateFieldGet4(this, _ResourceStore_contexts, "f").dispose();
    } catch (error) {
      failure !== null && failure !== void 0 ? failure : failure = error;
    }
    for (const v of __classPrivateFieldGet4(this, _ResourceStore_ready, "f").values()) {
      try {
        this.releaseShared(v.shared);
      } catch (error) {
        failure !== null && failure !== void 0 ? failure : failure = error;
      }
    }
    __classPrivateFieldGet4(this, _ResourceStore_ready, "f").clear();
    __classPrivateFieldGet4(this, _ResourceStore_defaultFonts, "f").clear();
    if (failure)
      throw failure;
  }
};
_ResourceStore_ready = /* @__PURE__ */ new WeakMap(), _ResourceStore_pending = /* @__PURE__ */ new WeakMap(), _ResourceStore_disposed = /* @__PURE__ */ new WeakMap(), _ResourceStore_json = /* @__PURE__ */ new WeakMap(), _ResourceStore_activeLoads = /* @__PURE__ */ new WeakMap(), _ResourceStore_loadQueue = /* @__PURE__ */ new WeakMap(), _ResourceStore_shared = /* @__PURE__ */ new WeakMap(), _ResourceStore_failedShared = /* @__PURE__ */ new WeakMap(), _ResourceStore_loadedIds = /* @__PURE__ */ new WeakMap(), _ResourceStore_defaultFonts = /* @__PURE__ */ new WeakMap(), _ResourceStore_contexts = /* @__PURE__ */ new WeakMap();

// frontend/packages/core/dist/layout/text-layout.js
function layoutText(text, font, fontSize = 20, lineHeight = fontSize, width, wrap = true) {
  const lines = [];
  let line = "", advance = 0, max = 0;
  const finish = () => {
    lines.push(line);
    max = Math.max(max, advance);
    line = "";
    advance = 0;
  };
  for (const char of text.replace(/\r\n?/g, "\n")) {
    if (char === "\n") {
      finish();
      continue;
    }
    const glyph = font.metrics.advances[char] === void 0 && font.fallbackCharacter ? font.fallbackCharacter : char;
    const units = font.metrics.advances[glyph];
    if (units === void 0)
      throw new Error(`Font ${font.id} has no measured glyph U+${char.codePointAt(0).toString(16)}`);
    const next = units * fontSize / font.metrics.unitsPerEm;
    if (wrap && width !== void 0 && line && advance + next > width + 1e-3)
      finish();
    line += glyph;
    advance += next;
  }
  finish();
  return { lines, width: max, height: lines.length * lineHeight, lineHeight, fontSize };
}

// frontend/packages/core/dist/provider/inspection.js
function inspectRecord(r, rect, visible, scrollOffset) {
  var _a, _b, _c;
  var _d, _e, _f, _g, _h, _j;
  const key = r.props.__virtualKey;
  const source = r.props.source;
  return Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ id: r.recordId, parent: (_d = (_a = r.parent) === null || _a === void 0 ? void 0 : _a.recordId) !== null && _d !== void 0 ? _d : null, planId: r.planId, kind: r.kind, name: String((_e = r.props.name) !== null && _e !== void 0 ? _e : ""), value: String((_f = r.props.value) !== null && _f !== void 0 ? _f : ""), visible, rect: Object.assign({}, rect) }, ((_b = r.behavior) === null || _b === void 0 ? void 0 : _b.interaction) ? {
    interaction: r.behavior.interaction,
    interactable: r.props.interactable !== false
  } : {}), ((_c = r.behavior) === null || _c === void 0 ? void 0 : _c.interaction) === "range" ? {
    range: {
      min: Number((_g = r.props.min) !== null && _g !== void 0 ? _g : 0),
      max: Number((_h = r.props.max) !== null && _h !== void 0 ? _h : 100),
      step: Number((_j = r.props.step) !== null && _j !== void 0 ? _j : 1)
    }
  } : {}), typeof (source === null || source === void 0 ? void 0 : source.id) === "string" ? { resourceId: source.id } : {}), { scrollOffset }), scrollOffset !== void 0 ? {
    direction: r.props.direction === "horizontal" ? "horizontal" : "vertical"
  } : {}), typeof key === "string" || typeof key === "number" ? { virtualKey: key } : {}), r.props.__virtualSticky !== void 0 ? { sticky: r.props.__virtualSticky === true } : {});
}

export {
  imageRef,
  fontRef,
  RetainedUIProvider,
  JsonResourceStore,
  parseResourceCatalog,
  ResourceContexts,
  ResourceStore,
  layoutText,
  inspectRecord
};
