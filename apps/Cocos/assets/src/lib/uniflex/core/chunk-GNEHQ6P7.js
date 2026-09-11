import {
  releaseComponentResources
} from "./chunk-VVXXKJHP.js";
import {
  promiseFinally
} from "./chunk-2T32RA5W.js";

// frontend/packages/core/dist/navigation/ui-surface.js
var runtimeBrand = Symbol("UniFlex.UIDefinition");
var hotReferenceBrand = Symbol("UniFlex.HotUIDefinition");
var hotReferences = /* @__PURE__ */ new Map();
function defineUISurface(id, options) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(id))
    throw new Error(`Invalid UI id: ${id}`);
  if (options.zIndex !== "screen" && options.zIndex !== "window")
    throw new Error(`Unsupported View zIndex: ${String(options.zIndex)}`);
  return Object.freeze({
    id,
    options: Object.freeze(Object.assign({}, options)),
    [runtimeBrand]: true
  });
}
function hotUIDefinition(id) {
  let reference = hotReferences.get(id);
  if (!reference) {
    reference = Object.freeze({
      id,
      options: Object.freeze({ zIndex: "screen" }),
      [hotReferenceBrand]: true
    });
    hotReferences.set(id, reference);
  }
  return reference;
}
function isHotUIDefinition(value) {
  return value[hotReferenceBrand] === true;
}
function bindUISurface(ui, component) {
  return Object.freeze(Object.assign({ id: ui.id, ui }, eagerComponent(component)));
}
function bindDeferredUISurface(ui, load) {
  const deferred = deferredComponent(load);
  return Object.freeze({
    id: ui.id,
    ui,
    prepare: deferred.prepare,
    acquirePrepared: deferred.acquirePrepared,
    evictPrepared: deferred.evictPrepared,
    inspectPrepared: deferred.inspectPrepared,
    dispose: deferred.dispose,
    get component() {
      return deferred.get();
    }
  });
}
function eagerComponent(component) {
  const pin = Object.freeze({ component, release() {
  } });
  return {
    component,
    acquirePrepared: () => Promise.resolve(pin),
    evictPrepared: () => false,
    inspectPrepared: () => ({ state: "ready", pins: 0 })
  };
}
function deferredComponent(load) {
  let component;
  let pending;
  let disposed = false;
  let pins = 0;
  const clear = () => {
    const previous = component;
    component = void 0;
    if (previous)
      releaseComponentResources(previous);
  };
  const releasePin = () => {
    pins--;
    if (disposed && pins === 0)
      clear();
  };
  const prepare = () => {
    if (disposed)
      return Promise.reject(new Error("UI binding has been disposed."));
    if (component)
      return Promise.resolve();
    return pending !== null && pending !== void 0 ? pending : pending = promiseFinally(Promise.resolve().then(() => {
      if (disposed)
        throw new Error("UI binding has been disposed.");
      return load();
    }).then((value) => {
      if (disposed) {
        releaseComponentResources(value);
        throw new Error("UI binding disposed during preparation.");
      }
      component = value;
    }), () => {
      pending = void 0;
    });
  };
  return {
    get() {
      if (disposed || !component)
        throw new Error("UI boundary has not been prepared or was disposed.");
      return component;
    },
    prepare,
    async acquirePrepared() {
      if (disposed)
        throw new Error("UI binding has been disposed.");
      pins++;
      try {
        await prepare();
        if (disposed)
          throw new Error("UI binding has been disposed.");
        let released = false;
        return Object.freeze({
          component,
          release() {
            if (released)
              return;
            released = true;
            releasePin();
          }
        });
      } catch (error) {
        releasePin();
        throw error;
      }
    },
    evictPrepared() {
      if (disposed || pending || pins > 0 || !component)
        return false;
      clear();
      return true;
    },
    inspectPrepared() {
      return {
        state: disposed ? "disposed" : pending ? "preparing" : component ? "ready" : "empty",
        pins
      };
    },
    dispose() {
      if (disposed)
        return;
      disposed = true;
      if (pins === 0)
        clear();
    }
  };
}
function createUISurfaceRegistry(bindings) {
  const byDefinition = /* @__PURE__ */ new Map(), byId = /* @__PURE__ */ new Map();
  for (const erased of bindings) {
    const binding = erased;
    if (byDefinition.has(binding.ui) || byId.has(binding.ui.id))
      throw new Error(`Duplicate UI binding: ${binding.ui.id}`);
    byDefinition.set(binding.ui, binding);
    byId.set(binding.ui.id, binding);
  }
  const frozen = Object.freeze([...bindings]);
  return Object.freeze({
    bindings: frozen,
    get(ui) {
      var _a;
      const erased = ui;
      return (_a = byDefinition.get(erased)) !== null && _a !== void 0 ? _a : isHotUIDefinition(erased) ? byId.get(erased.id) : void 0;
    }
  });
}

export {
  defineUISurface,
  hotUIDefinition,
  isHotUIDefinition,
  bindUISurface,
  bindDeferredUISurface,
  eagerComponent,
  deferredComponent,
  createUISurfaceRegistry
};
