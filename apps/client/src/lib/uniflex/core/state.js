import {
  afterStateBatch,
  batchState,
  computed,
  createState,
  effectScope,
  markRaw,
  observe,
  reactivityStats,
  readonlyState,
  trackComputation,
  untracked
} from "./chunk-VOFEJ6OI.js";
import {
  createAggregateError
} from "./chunk-2T32RA5W.js";

// frontend/packages/core/dist/state/store-collection.js
var safeId = (id) => typeof id === "string" && id.length > 0 && id.length <= 256 && !id.startsWith("__v_") && !["__proto__", "constructor", "prototype"].includes(id);
function copy(value) {
  if (value === null || ["string", "boolean"].includes(typeof value))
    return value;
  if (typeof value === "number" && Number.isFinite(value))
    return value;
  if (Array.isArray(value))
    return value.map(copy);
  if (typeof value === "object" && value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("Unsafe entity field");
      out[key] = copy(item);
    }
    return out;
  }
  throw new Error("Store entities must contain JSON values");
}
function createStoreCollection(options = {}) {
  const entities = createState(/* @__PURE__ */ Object.create(null)), byId = readonlyState(entities);
  const structure = createState({ version: 0 });
  const listeners = /* @__PURE__ */ new Set(), indices = /* @__PURE__ */ new Map();
  let ids = [], pending = [], disposed = false;
  const reindex = () => {
    indices.clear();
    ids.forEach((id, i) => indices.set(id, i));
  };
  const flush = () => {
    if (!pending.length || disposed)
      return;
    const changes = pending;
    pending = [];
    const event = changes.length === 1 ? changes[0] : { type: "batch", changes };
    for (const listener of [...listeners])
      listener(event);
  };
  const notify = (change) => {
    pending.push(change);
    if (change.type !== "update")
      structure.version++;
    afterStateBatch(flush, 1);
  };
  const list = markRaw({
    reactiveItems: true,
    get length() {
      void structure.version;
      return ids.length;
    },
    get(index) {
      void structure.version;
      const id = ids[index];
      if (id === void 0)
        throw new RangeError("Store list index out of bounds");
      return byId[id];
    },
    indexOfKey(key, keyProperty) {
      var _a;
      void structure.version;
      if (keyProperty !== "id")
        throw new Error("Store collections use immutable id keys");
      return typeof key === "string" ? (_a = indices.get(key)) !== null && _a !== void 0 ? _a : -1 : -1;
    },
    subscribe(listener) {
      if (disposed)
        throw new Error("Collection is disposed");
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
  let derivation;
  if (options.compare || options.filter) {
    const recompute = () => {
      let next = Object.keys(entities).filter((id) => !options.filter || options.filter(byId[id]));
      if (options.compare)
        next = next.sort((a, b) => options.compare(byId[a], byId[b]) || a.localeCompare(b));
      if (next.length === ids.length && next.every((id, i) => ids[i] === id))
        return;
      ids = next;
      reindex();
      notify({ type: "reorder" });
    };
    derivation = trackComputation(recompute, () => derivation.run(), 0);
    derivation.run();
  }
  const ensure = () => {
    if (disposed)
      throw new Error("Collection is disposed");
  };
  const writer = {
    insert(value) {
      ensure();
      const next = copy(value);
      if (!safeId(next.id) || entities[next.id])
        throw new Error("Invalid or duplicate entity ID");
      batchState(() => {
        entities[next.id] = next;
        if (!derivation) {
          indices.set(next.id, ids.length);
          ids.push(next.id);
          notify({
            type: "splice",
            index: ids.length - 1,
            deleteCount: 0,
            insertCount: 1
          });
        }
      });
    },
    update(id, set, unset = []) {
      ensure();
      const entity = entities[id];
      if (!entity)
        throw new Error("Partial update for an absent entity");
      const fields = copy(set);
      if ("id" in fields && fields.id !== id || unset.includes("id"))
        throw new Error("Entity IDs are immutable");
      for (const key of unset)
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw new Error("Unsafe entity field");
      batchState(() => {
        const changed = [];
        for (const [key, value] of Object.entries(fields))
          if (JSON.stringify(entity[key]) !== JSON.stringify(value)) {
            entity[key] = value;
            changed.push(key);
          }
        for (const key of unset)
          if (Object.prototype.hasOwnProperty.call(entity, key)) {
            delete entity[key];
            changed.push(key);
          }
        const index = indices.get(id);
        if (changed.length && index !== void 0)
          notify({ type: "update", index, count: 1, fields: changed });
      });
    },
    remove(id) {
      ensure();
      if (!entities[id])
        return;
      batchState(() => {
        delete entities[id];
        if (!derivation) {
          const index = indices.get(id);
          ids.splice(index, 1);
          reindex();
          notify({ type: "splice", index, deleteCount: 1, insertCount: 0 });
        }
      });
    },
    replace(values) {
      ensure();
      const copied = values.map(copy), seen = /* @__PURE__ */ new Set();
      for (const value of copied) {
        if (!safeId(value.id) || seen.has(value.id))
          throw new Error("Invalid or duplicate snapshot entity");
        seen.add(value.id);
      }
      batchState(() => {
        for (const id of Object.keys(entities))
          if (!seen.has(id))
            writer.remove(id);
        for (const value of copied)
          if (entities[value.id])
            writer.update(value.id, value, Object.keys(entities[value.id]).filter((key) => !(key in value)));
          else
            writer.insert(value);
        if (!derivation) {
          ids = copied.map((v) => v.id);
          reindex();
        }
        pending = [{ type: "reset" }];
        structure.version++;
        afterStateBatch(flush, 1);
      });
    },
    dispose() {
      if (disposed)
        return;
      disposed = true;
      derivation === null || derivation === void 0 ? void 0 : derivation.stop();
      listeners.clear();
      pending = [];
    }
  };
  return { store: Object.freeze({ byId, list }), writer };
}

// frontend/packages/core/dist/state/store-root.js
var __classPrivateFieldGet = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _PortableAbortController_signal;
var _PortableAbortSignal_listeners;
var definitions = /* @__PURE__ */ new Map();
var activeRoot;
function defineStore(id, factory) {
  if (!/^[A-Za-z][A-Za-z0-9._/-]*$/.test(id))
    throw new Error(`Invalid Store id: ${id}`);
  if (definitions.has(id))
    throw new Error(`Duplicate Store id: ${id}`);
  const definition = (() => {
    if (!activeRoot)
      throw new Error(`Cannot access Store "${id}" without an active StoreRoot`);
    return activeRoot.get(definition);
  });
  Object.defineProperties(definition, {
    id: { value: id, enumerable: true },
    factory: { value: factory }
  });
  definitions.set(id, definition);
  return definition;
}
function createStoreRoot(environment) {
  if (activeRoot && !activeRoot.disposed)
    throw new Error("Only one StoreRoot can be active in this JavaScript realm");
  const root = new StoreRootImpl(environment);
  activeRoot = root;
  return root;
}
function getActiveStoreRoot() {
  return activeRoot;
}
var StoreRootImpl = class {
  constructor(environment) {
    this.environment = environment;
    this.abortController = createAbortController();
    this.records = /* @__PURE__ */ new Map();
    this.creationOrder = [];
    this.creating = /* @__PURE__ */ new Set();
    this.isDisposed = false;
  }
  get signal() {
    return this.abortController.signal;
  }
  get disposed() {
    return this.isDisposed;
  }
  get(definition) {
    if (this.isDisposed)
      throw new Error("Cannot access a disposed StoreRoot");
    const existing = this.records.get(definition);
    if (existing)
      return existing.value;
    if (this.creating.has(definition))
      throw new Error(`Circular Store creation: ${definition.id}`);
    const scope = effectScope(true), disposers = [];
    this.creating.add(definition);
    try {
      const raw = scope.run(() => definition.factory({
        environment: this.environment,
        signal: this.signal,
        onDispose(dispose) {
          if (typeof dispose !== "function")
            throw new TypeError("Store disposer must be a function");
          disposers.push(dispose);
        }
      }));
      if (!raw || typeof raw !== "object" && typeof raw !== "function")
        throw new TypeError(`Store "${definition.id}" factory must return an object`);
      const value = guardStore(raw, this, definition.id), record = { definition, scope, disposers, value };
      this.records.set(definition, record);
      this.creationOrder.push(record);
      return value;
    } catch (error) {
      disposeCallbacks(disposers);
      scope.stop();
      throw error;
    } finally {
      this.creating.delete(definition);
    }
  }
  dispose() {
    if (this.isDisposed)
      return;
    this.abortController.abort(new Error("StoreRoot disposed"));
    this.isDisposed = true;
    const errors = [];
    for (let index = this.creationOrder.length - 1; index >= 0; index--) {
      const record = this.creationOrder[index];
      for (let disposer = record.disposers.length - 1; disposer >= 0; disposer--) {
        try {
          record.disposers[disposer]();
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        record.scope.stop();
      } catch (error) {
        errors.push(error);
      }
    }
    this.records.clear();
    this.creationOrder.length = 0;
    this.creating.clear();
    if (activeRoot === this)
      activeRoot = void 0;
    if (errors.length)
      throw createAggregateError(errors, "StoreRoot disposal failed");
  }
};
function guardStore(store, root, id) {
  const assertAlive = () => {
    if (root.disposed)
      throw new Error(`Cannot access disposed Store "${id}"`);
  };
  return new Proxy(store, {
    get(target, property, receiver) {
      assertAlive();
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      assertAlive();
      return Reflect.set(target, property, value, receiver);
    },
    has(target, property) {
      assertAlive();
      return Reflect.has(target, property);
    },
    ownKeys(target) {
      assertAlive();
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, property) {
      assertAlive();
      return Reflect.getOwnPropertyDescriptor(target, property);
    }
  });
}
function disposeCallbacks(disposers) {
  for (let index = disposers.length - 1; index >= 0; index--) {
    try {
      disposers[index]();
    } catch (_a) {
    }
  }
}
function createAbortController() {
  const NativeAbortController = globalThis.AbortController;
  return NativeAbortController ? new NativeAbortController() : new PortableAbortController();
}
var PortableAbortController = class {
  constructor() {
    _PortableAbortController_signal.set(this, new PortableAbortSignal());
  }
  get signal() {
    return __classPrivateFieldGet(this, _PortableAbortController_signal, "f");
  }
  abort(reason) {
    __classPrivateFieldGet(this, _PortableAbortController_signal, "f").abort(reason);
  }
};
_PortableAbortController_signal = /* @__PURE__ */ new WeakMap();
var PortableAbortSignal = class {
  constructor() {
    this.aborted = false;
    this.onabort = null;
    _PortableAbortSignal_listeners.set(this, /* @__PURE__ */ new Set());
  }
  addEventListener(type, listener) {
    if (type === "abort" && listener)
      __classPrivateFieldGet(this, _PortableAbortSignal_listeners, "f").add(listener);
  }
  removeEventListener(type, listener) {
    if (type === "abort" && listener)
      __classPrivateFieldGet(this, _PortableAbortSignal_listeners, "f").delete(listener);
  }
  dispatchEvent(event) {
    var _a;
    if (event.type !== "abort")
      return true;
    (_a = this.onabort) === null || _a === void 0 ? void 0 : _a.call(this, event);
    for (const listener of [...__classPrivateFieldGet(this, _PortableAbortSignal_listeners, "f")]) {
      if (typeof listener === "function")
        listener.call(this, event);
      else
        listener.handleEvent(event);
    }
    return true;
  }
  throwIfAborted() {
    if (this.aborted)
      throw this.reason;
  }
  abort(reason) {
    if (this.aborted)
      return;
    this.aborted = true;
    this.reason = reason;
    this.dispatchEvent({ type: "abort" });
    __classPrivateFieldGet(this, _PortableAbortSignal_listeners, "f").clear();
    this.onabort = null;
  }
};
_PortableAbortSignal_listeners = /* @__PURE__ */ new WeakMap();
export {
  batchState,
  computed,
  createState,
  createStoreCollection,
  createStoreRoot,
  defineStore,
  getActiveStoreRoot,
  observe,
  reactivityStats,
  readonlyState,
  untracked
};
