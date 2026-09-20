"use strict";
const http = require("node:http");
const crypto$1 = require("node:crypto");
const node_child_process = require("node:child_process");
const node_url = require("node:url");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
let EventEmitter$1 = class EventEmitter2 {
  constructor() {
    this.events = {};
  }
  on(event2, listener) {
    if (!this.events[event2]) {
      this.events[event2] = [];
    }
    this.events[event2].push(listener);
  }
  off(event2, listenerToRemove) {
    if (!this.events[event2]) return;
    this.events[event2] = this.events[event2].filter((listener) => listener !== listenerToRemove);
  }
  emit(event2, data) {
    if (!this.events[event2]) return;
    this.events[event2].forEach((listener) => {
      try {
        listener(data);
      } catch (e2) {
        console.error("ws event callback error", e2, listener);
      }
    });
  }
};
/**
* @vue/shared v3.5.26
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function makeMap(str) {
  const map = /* @__PURE__ */ Object.create(null);
  for (const key of str.split(",")) map[key] = 1;
  return (val) => val in map;
}
const EMPTY_OBJ = {};
const EMPTY_ARR = [];
const NOOP = () => {
};
const NO = () => false;
const isOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // uppercase letter
(key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97);
const isModelListener = (key) => key.startsWith("onUpdate:");
const extend$1 = Object.assign;
const remove = (arr, el) => {
  const i2 = arr.indexOf(el);
  if (i2 > -1) {
    arr.splice(i2, 1);
  }
};
const hasOwnProperty$6 = Object.prototype.hasOwnProperty;
const hasOwn = (val, key) => hasOwnProperty$6.call(val, key);
const isArray$2 = Array.isArray;
const isMap = (val) => toTypeString(val) === "[object Map]";
const isSet = (val) => toTypeString(val) === "[object Set]";
const isFunction$2 = (val) => typeof val === "function";
const isString$2 = (val) => typeof val === "string";
const isSymbol$1 = (val) => typeof val === "symbol";
const isObject$2 = (val) => val !== null && typeof val === "object";
const isPromise = (val) => {
  return (isObject$2(val) || isFunction$2(val)) && isFunction$2(val.then) && isFunction$2(val.catch);
};
const objectToString$1 = Object.prototype.toString;
const toTypeString = (value) => objectToString$1.call(value);
const toRawType = (value) => {
  return toTypeString(value).slice(8, -1);
};
const isPlainObject$2 = (val) => toTypeString(val) === "[object Object]";
const isIntegerKey = (key) => isString$2(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
const isReservedProp = /* @__PURE__ */ makeMap(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
);
const cacheStringFunction = (fn) => {
  const cache = /* @__PURE__ */ Object.create(null);
  return (str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  };
};
const camelizeRE = /-\w/g;
const camelize = cacheStringFunction(
  (str) => {
    return str.replace(camelizeRE, (c2) => c2.slice(1).toUpperCase());
  }
);
const hyphenateRE = /\B([A-Z])/g;
const hyphenate = cacheStringFunction(
  (str) => str.replace(hyphenateRE, "-$1").toLowerCase()
);
const capitalize = cacheStringFunction((str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
});
const toHandlerKey = cacheStringFunction(
  (str) => {
    const s2 = str ? `on${capitalize(str)}` : ``;
    return s2;
  }
);
const hasChanged = (value, oldValue) => !Object.is(value, oldValue);
const invokeArrayFns = (fns, ...arg) => {
  for (let i2 = 0; i2 < fns.length; i2++) {
    fns[i2](...arg);
  }
};
const def = (obj, key, value, writable = false) => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    writable,
    value
  });
};
const looseToNumber = (val) => {
  const n2 = parseFloat(val);
  return isNaN(n2) ? val : n2;
};
const toNumber = (val) => {
  const n2 = isString$2(val) ? Number(val) : NaN;
  return isNaN(n2) ? val : n2;
};
let _globalThis;
const getGlobalThis = () => {
  return _globalThis || (_globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
};
function normalizeStyle(value) {
  if (isArray$2(value)) {
    const res = {};
    for (let i2 = 0; i2 < value.length; i2++) {
      const item = value[i2];
      const normalized = isString$2(item) ? parseStringStyle(item) : normalizeStyle(item);
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key];
        }
      }
    }
    return res;
  } else if (isString$2(value) || isObject$2(value)) {
    return value;
  }
}
const listDelimiterRE = /;(?![^(]*\))/g;
const propertyDelimiterRE = /:([^]+)/;
const styleCommentRE = /\/\*[^]*?\*\//g;
function parseStringStyle(cssText) {
  const ret = {};
  cssText.replace(styleCommentRE, "").split(listDelimiterRE).forEach((item) => {
    if (item) {
      const tmp = item.split(propertyDelimiterRE);
      tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
    }
  });
  return ret;
}
function normalizeClass(value) {
  let res = "";
  if (isString$2(value)) {
    res = value;
  } else if (isArray$2(value)) {
    for (let i2 = 0; i2 < value.length; i2++) {
      const normalized = normalizeClass(value[i2]);
      if (normalized) {
        res += normalized + " ";
      }
    }
  } else if (isObject$2(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + " ";
      }
    }
  }
  return res.trim();
}
const specialBooleanAttrs = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`;
const isSpecialBooleanAttr = /* @__PURE__ */ makeMap(specialBooleanAttrs);
function includeBooleanAttr(value) {
  return !!value || value === "";
}
const isRef$1 = (val) => {
  return !!(val && val["__v_isRef"] === true);
};
const toDisplayString = (val) => {
  return isString$2(val) ? val : val == null ? "" : isArray$2(val) || isObject$2(val) && (val.toString === objectToString$1 || !isFunction$2(val.toString)) ? isRef$1(val) ? toDisplayString(val.value) : JSON.stringify(val, replacer, 2) : String(val);
};
const replacer = (_key, val) => {
  if (isRef$1(val)) {
    return replacer(_key, val.value);
  } else if (isMap(val)) {
    return {
      [`Map(${val.size})`]: [...val.entries()].reduce(
        (entries, [key, val2], i2) => {
          entries[stringifySymbol(key, i2) + " =>"] = val2;
          return entries;
        },
        {}
      )
    };
  } else if (isSet(val)) {
    return {
      [`Set(${val.size})`]: [...val.values()].map((v2) => stringifySymbol(v2))
    };
  } else if (isSymbol$1(val)) {
    return stringifySymbol(val);
  } else if (isObject$2(val) && !isArray$2(val) && !isPlainObject$2(val)) {
    return String(val);
  }
  return val;
};
const stringifySymbol = (v2, i2 = "") => {
  var _a2;
  return (
    // Symbol.description in es2019+ so we need to cast here to pass
    // the lib: es2016 check
    isSymbol$1(v2) ? `Symbol(${(_a2 = v2.description) != null ? _a2 : i2})` : v2
  );
};
/**
* @vue/reactivity v3.5.26
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let activeEffectScope;
class EffectScope {
  constructor(detached = false) {
    this.detached = detached;
    this._active = true;
    this._on = 0;
    this.effects = [];
    this.cleanups = [];
    this._isPaused = false;
    this.parent = activeEffectScope;
    if (!detached && activeEffectScope) {
      this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
        this
      ) - 1;
    }
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = true;
      let i2, l2;
      if (this.scopes) {
        for (i2 = 0, l2 = this.scopes.length; i2 < l2; i2++) {
          this.scopes[i2].pause();
        }
      }
      for (i2 = 0, l2 = this.effects.length; i2 < l2; i2++) {
        this.effects[i2].pause();
      }
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false;
        let i2, l2;
        if (this.scopes) {
          for (i2 = 0, l2 = this.scopes.length; i2 < l2; i2++) {
            this.scopes[i2].resume();
          }
        }
        for (i2 = 0, l2 = this.effects.length; i2 < l2; i2++) {
          this.effects[i2].resume();
        }
      }
    }
  }
  run(fn) {
    if (this._active) {
      const currentEffectScope = activeEffectScope;
      try {
        activeEffectScope = this;
        return fn();
      } finally {
        activeEffectScope = currentEffectScope;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope;
      activeEffectScope = this;
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      activeEffectScope = this.prevScope;
      this.prevScope = void 0;
    }
  }
  stop(fromParent) {
    if (this._active) {
      this._active = false;
      let i2, l2;
      for (i2 = 0, l2 = this.effects.length; i2 < l2; i2++) {
        this.effects[i2].stop();
      }
      this.effects.length = 0;
      for (i2 = 0, l2 = this.cleanups.length; i2 < l2; i2++) {
        this.cleanups[i2]();
      }
      this.cleanups.length = 0;
      if (this.scopes) {
        for (i2 = 0, l2 = this.scopes.length; i2 < l2; i2++) {
          this.scopes[i2].stop(true);
        }
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !fromParent) {
        const last = this.parent.scopes.pop();
        if (last && last !== this) {
          this.parent.scopes[this.index] = last;
          last.index = this.index;
        }
      }
      this.parent = void 0;
    }
  }
}
function effectScope(detached) {
  return new EffectScope(detached);
}
function getCurrentScope() {
  return activeEffectScope;
}
function onScopeDispose(fn, failSilently = false) {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn);
  }
}
let activeSub;
const pausedQueueEffects = /* @__PURE__ */ new WeakSet();
class ReactiveEffect {
  constructor(fn) {
    this.fn = fn;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 1 | 4;
    this.next = void 0;
    this.cleanup = void 0;
    this.scheduler = void 0;
    if (activeEffectScope && activeEffectScope.active) {
      activeEffectScope.effects.push(this);
    }
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    if (this.flags & 64) {
      this.flags &= -65;
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this);
        this.trigger();
      }
    }
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags & 2 && !(this.flags & 32)) {
      return;
    }
    if (!(this.flags & 8)) {
      batch(this);
    }
  }
  run() {
    if (!(this.flags & 1)) {
      return this.fn();
    }
    this.flags |= 2;
    cleanupEffect(this);
    prepareDeps(this);
    const prevEffect = activeSub;
    const prevShouldTrack = shouldTrack;
    activeSub = this;
    shouldTrack = true;
    try {
      return this.fn();
    } finally {
      cleanupDeps(this);
      activeSub = prevEffect;
      shouldTrack = prevShouldTrack;
      this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link);
      }
      this.deps = this.depsTail = void 0;
      cleanupEffect(this);
      this.onStop && this.onStop();
      this.flags &= -2;
    }
  }
  trigger() {
    if (this.flags & 64) {
      pausedQueueEffects.add(this);
    } else if (this.scheduler) {
      this.scheduler();
    } else {
      this.runIfDirty();
    }
  }
  /**
   * @internal
   */
  runIfDirty() {
    if (isDirty(this)) {
      this.run();
    }
  }
  get dirty() {
    return isDirty(this);
  }
}
let batchDepth = 0;
let batchedSub;
let batchedComputed;
function batch(sub, isComputed2 = false) {
  sub.flags |= 8;
  if (isComputed2) {
    sub.next = batchedComputed;
    batchedComputed = sub;
    return;
  }
  sub.next = batchedSub;
  batchedSub = sub;
}
function startBatch() {
  batchDepth++;
}
function endBatch() {
  if (--batchDepth > 0) {
    return;
  }
  if (batchedComputed) {
    let e2 = batchedComputed;
    batchedComputed = void 0;
    while (e2) {
      const next = e2.next;
      e2.next = void 0;
      e2.flags &= -9;
      e2 = next;
    }
  }
  let error;
  while (batchedSub) {
    let e2 = batchedSub;
    batchedSub = void 0;
    while (e2) {
      const next = e2.next;
      e2.next = void 0;
      e2.flags &= -9;
      if (e2.flags & 1) {
        try {
          ;
          e2.trigger();
        } catch (err) {
          if (!error) error = err;
        }
      }
      e2 = next;
    }
  }
  if (error) throw error;
}
function prepareDeps(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    link.version = -1;
    link.prevActiveLink = link.dep.activeLink;
    link.dep.activeLink = link;
  }
}
function cleanupDeps(sub) {
  let head;
  let tail = sub.depsTail;
  let link = tail;
  while (link) {
    const prev = link.prevDep;
    if (link.version === -1) {
      if (link === tail) tail = prev;
      removeSub(link);
      removeDep(link);
    } else {
      head = link;
    }
    link.dep.activeLink = link.prevActiveLink;
    link.prevActiveLink = void 0;
    link = prev;
  }
  sub.deps = head;
  sub.depsTail = tail;
}
function isDirty(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) {
      return true;
    }
  }
  if (sub._dirty) {
    return true;
  }
  return false;
}
function refreshComputed(computed2) {
  if (computed2.flags & 4 && !(computed2.flags & 16)) {
    return;
  }
  computed2.flags &= -17;
  if (computed2.globalVersion === globalVersion) {
    return;
  }
  computed2.globalVersion = globalVersion;
  if (!computed2.isSSR && computed2.flags & 128 && (!computed2.deps && !computed2._dirty || !isDirty(computed2))) {
    return;
  }
  computed2.flags |= 2;
  const dep = computed2.dep;
  const prevSub = activeSub;
  const prevShouldTrack = shouldTrack;
  activeSub = computed2;
  shouldTrack = true;
  try {
    prepareDeps(computed2);
    const value = computed2.fn(computed2._value);
    if (dep.version === 0 || hasChanged(value, computed2._value)) {
      computed2.flags |= 128;
      computed2._value = value;
      dep.version++;
    }
  } catch (err) {
    dep.version++;
    throw err;
  } finally {
    activeSub = prevSub;
    shouldTrack = prevShouldTrack;
    cleanupDeps(computed2);
    computed2.flags &= -3;
  }
}
function removeSub(link, soft = false) {
  const { dep, prevSub, nextSub } = link;
  if (prevSub) {
    prevSub.nextSub = nextSub;
    link.prevSub = void 0;
  }
  if (nextSub) {
    nextSub.prevSub = prevSub;
    link.nextSub = void 0;
  }
  if (dep.subs === link) {
    dep.subs = prevSub;
    if (!prevSub && dep.computed) {
      dep.computed.flags &= -5;
      for (let l2 = dep.computed.deps; l2; l2 = l2.nextDep) {
        removeSub(l2, true);
      }
    }
  }
  if (!soft && !--dep.sc && dep.map) {
    dep.map.delete(dep.key);
  }
}
function removeDep(link) {
  const { prevDep, nextDep } = link;
  if (prevDep) {
    prevDep.nextDep = nextDep;
    link.prevDep = void 0;
  }
  if (nextDep) {
    nextDep.prevDep = prevDep;
    link.nextDep = void 0;
  }
}
let shouldTrack = true;
const trackStack = [];
function pauseTracking() {
  trackStack.push(shouldTrack);
  shouldTrack = false;
}
function resetTracking() {
  const last = trackStack.pop();
  shouldTrack = last === void 0 ? true : last;
}
function cleanupEffect(e2) {
  const { cleanup } = e2;
  e2.cleanup = void 0;
  if (cleanup) {
    const prevSub = activeSub;
    activeSub = void 0;
    try {
      cleanup();
    } finally {
      activeSub = prevSub;
    }
  }
}
let globalVersion = 0;
class Link {
  constructor(sub, dep) {
    this.sub = sub;
    this.dep = dep;
    this.version = dep.version;
    this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class Dep {
  // TODO isolatedDeclarations "__v_skip"
  constructor(computed2) {
    this.computed = computed2;
    this.version = 0;
    this.activeLink = void 0;
    this.subs = void 0;
    this.map = void 0;
    this.key = void 0;
    this.sc = 0;
    this.__v_skip = true;
  }
  track(debugInfo) {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return;
    }
    let link = this.activeLink;
    if (link === void 0 || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this);
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link;
      } else {
        link.prevDep = activeSub.depsTail;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
      }
      addSub(link);
    } else if (link.version === -1) {
      link.version = this.version;
      if (link.nextDep) {
        const next = link.nextDep;
        next.prevDep = link.prevDep;
        if (link.prevDep) {
          link.prevDep.nextDep = next;
        }
        link.prevDep = activeSub.depsTail;
        link.nextDep = void 0;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
        if (activeSub.deps === link) {
          activeSub.deps = next;
        }
      }
    }
    return link;
  }
  trigger(debugInfo) {
    this.version++;
    globalVersion++;
    this.notify(debugInfo);
  }
  notify(debugInfo) {
    startBatch();
    try {
      if (false) ;
      for (let link = this.subs; link; link = link.prevSub) {
        if (link.sub.notify()) {
          ;
          link.sub.dep.notify();
        }
      }
    } finally {
      endBatch();
    }
  }
}
function addSub(link) {
  link.dep.sc++;
  if (link.sub.flags & 4) {
    const computed2 = link.dep.computed;
    if (computed2 && !link.dep.subs) {
      computed2.flags |= 4 | 16;
      for (let l2 = computed2.deps; l2; l2 = l2.nextDep) {
        addSub(l2);
      }
    }
    const currentTail = link.dep.subs;
    if (currentTail !== link) {
      link.prevSub = currentTail;
      if (currentTail) currentTail.nextSub = link;
    }
    link.dep.subs = link;
  }
}
const targetMap = /* @__PURE__ */ new WeakMap();
const ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
function track(target, type2, key) {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, dep = new Dep());
      dep.map = depsMap;
      dep.key = key;
    }
    {
      dep.track();
    }
  }
}
function trigger(target, type2, key, newValue, oldValue, oldTarget) {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    globalVersion++;
    return;
  }
  const run = (dep) => {
    if (dep) {
      {
        dep.trigger();
      }
    }
  };
  startBatch();
  if (type2 === "clear") {
    depsMap.forEach(run);
  } else {
    const targetIsArray = isArray$2(target);
    const isArrayIndex = targetIsArray && isIntegerKey(key);
    if (targetIsArray && key === "length") {
      const newLength = Number(newValue);
      depsMap.forEach((dep, key2) => {
        if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol$1(key2) && key2 >= newLength) {
          run(dep);
        }
      });
    } else {
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key));
      }
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY));
      }
      switch (type2) {
        case "add":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          } else if (isArrayIndex) {
            run(depsMap.get("length"));
          }
          break;
        case "delete":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          }
          break;
        case "set":
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY));
          }
          break;
      }
    }
  }
  endBatch();
}
function getDepFromReactive(object2, key) {
  const depMap = targetMap.get(object2);
  return depMap && depMap.get(key);
}
function reactiveReadArray(array) {
  const raw = toRaw(array);
  if (raw === array) return raw;
  track(raw, "iterate", ARRAY_ITERATE_KEY);
  return isShallow(array) ? raw : raw.map(toReactive);
}
function shallowReadArray(arr) {
  track(arr = toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
  return arr;
}
function toWrapped(target, item) {
  if (isReadonly(target)) {
    return isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item);
  }
  return toReactive(item);
}
const arrayInstrumentations = {
  __proto__: null,
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
  },
  concat(...args) {
    return reactiveReadArray(this).concat(
      ...args.map((x2) => isArray$2(x2) ? reactiveReadArray(x2) : x2)
    );
  },
  entries() {
    return iterator(this, "entries", (value) => {
      value[1] = toWrapped(this, value[1]);
      return value;
    });
  },
  every(fn, thisArg) {
    return apply(this, "every", fn, thisArg, void 0, arguments);
  },
  filter(fn, thisArg) {
    return apply(
      this,
      "filter",
      fn,
      thisArg,
      (v2) => v2.map((item) => toWrapped(this, item)),
      arguments
    );
  },
  find(fn, thisArg) {
    return apply(
      this,
      "find",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findIndex(fn, thisArg) {
    return apply(this, "findIndex", fn, thisArg, void 0, arguments);
  },
  findLast(fn, thisArg) {
    return apply(
      this,
      "findLast",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findLastIndex(fn, thisArg) {
    return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(fn, thisArg) {
    return apply(this, "forEach", fn, thisArg, void 0, arguments);
  },
  includes(...args) {
    return searchProxy(this, "includes", args);
  },
  indexOf(...args) {
    return searchProxy(this, "indexOf", args);
  },
  join(separator) {
    return reactiveReadArray(this).join(separator);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...args) {
    return searchProxy(this, "lastIndexOf", args);
  },
  map(fn, thisArg) {
    return apply(this, "map", fn, thisArg, void 0, arguments);
  },
  pop() {
    return noTracking(this, "pop");
  },
  push(...args) {
    return noTracking(this, "push", args);
  },
  reduce(fn, ...args) {
    return reduce(this, "reduce", fn, args);
  },
  reduceRight(fn, ...args) {
    return reduce(this, "reduceRight", fn, args);
  },
  shift() {
    return noTracking(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(fn, thisArg) {
    return apply(this, "some", fn, thisArg, void 0, arguments);
  },
  splice(...args) {
    return noTracking(this, "splice", args);
  },
  toReversed() {
    return reactiveReadArray(this).toReversed();
  },
  toSorted(comparer) {
    return reactiveReadArray(this).toSorted(comparer);
  },
  toSpliced(...args) {
    return reactiveReadArray(this).toSpliced(...args);
  },
  unshift(...args) {
    return noTracking(this, "unshift", args);
  },
  values() {
    return iterator(this, "values", (item) => toWrapped(this, item));
  }
};
function iterator(self2, method2, wrapValue) {
  const arr = shallowReadArray(self2);
  const iter = arr[method2]();
  if (arr !== self2 && !isShallow(self2)) {
    iter._next = iter.next;
    iter.next = () => {
      const result = iter._next();
      if (!result.done) {
        result.value = wrapValue(result.value);
      }
      return result;
    };
  }
  return iter;
}
const arrayProto$1 = Array.prototype;
function apply(self2, method2, fn, thisArg, wrappedRetFn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !isShallow(self2);
  const methodFn = arr[method2];
  if (methodFn !== arrayProto$1[method2]) {
    const result2 = methodFn.apply(self2, args);
    return needsWrap ? toReactive(result2) : result2;
  }
  let wrappedFn = fn;
  if (arr !== self2) {
    if (needsWrap) {
      wrappedFn = function(item, index) {
        return fn.call(this, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 2) {
      wrappedFn = function(item, index) {
        return fn.call(this, item, index, self2);
      };
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg);
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self2, method2, fn, args) {
  const arr = shallowReadArray(self2);
  let wrappedFn = fn;
  if (arr !== self2) {
    if (!isShallow(self2)) {
      wrappedFn = function(acc, item, index) {
        return fn.call(this, acc, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 3) {
      wrappedFn = function(acc, item, index) {
        return fn.call(this, acc, item, index, self2);
      };
    }
  }
  return arr[method2](wrappedFn, ...args);
}
function searchProxy(self2, method2, args) {
  const arr = toRaw(self2);
  track(arr, "iterate", ARRAY_ITERATE_KEY);
  const res = arr[method2](...args);
  if ((res === -1 || res === false) && isProxy(args[0])) {
    args[0] = toRaw(args[0]);
    return arr[method2](...args);
  }
  return res;
}
function noTracking(self2, method2, args = []) {
  pauseTracking();
  startBatch();
  const res = toRaw(self2)[method2].apply(self2, args);
  endBatch();
  resetTracking();
  return res;
}
const isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
const builtInSymbols = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol$1)
);
function hasOwnProperty$5(key) {
  if (!isSymbol$1(key)) key = String(key);
  const obj = toRaw(this);
  track(obj, "has", key);
  return obj.hasOwnProperty(key);
}
class BaseReactiveHandler {
  constructor(_isReadonly = false, _isShallow = false) {
    this._isReadonly = _isReadonly;
    this._isShallow = _isShallow;
  }
  get(target, key, receiver) {
    if (key === "__v_skip") return target["__v_skip"];
    const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_isShallow") {
      return isShallow2;
    } else if (key === "__v_raw") {
      if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) {
        return target;
      }
      return;
    }
    const targetIsArray = isArray$2(target);
    if (!isReadonly2) {
      let fn;
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn;
      }
      if (key === "hasOwnProperty") {
        return hasOwnProperty$5;
      }
    }
    const res = Reflect.get(
      target,
      key,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      isRef(target) ? target : receiver
    );
    if (isSymbol$1(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res;
    }
    if (!isReadonly2) {
      track(target, "get", key);
    }
    if (isShallow2) {
      return res;
    }
    if (isRef(res)) {
      const value = targetIsArray && isIntegerKey(key) ? res : res.value;
      return isReadonly2 && isObject$2(value) ? readonly(value) : value;
    }
    if (isObject$2(res)) {
      return isReadonly2 ? readonly(res) : reactive(res);
    }
    return res;
  }
}
class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(false, isShallow2);
  }
  set(target, key, value, receiver) {
    let oldValue = target[key];
    const isArrayWithIntegerKey = isArray$2(target) && isIntegerKey(key);
    if (!this._isShallow) {
      const isOldValueReadonly = isReadonly(oldValue);
      if (!isShallow(value) && !isReadonly(value)) {
        oldValue = toRaw(oldValue);
        value = toRaw(value);
      }
      if (!isArrayWithIntegerKey && isRef(oldValue) && !isRef(value)) {
        if (isOldValueReadonly) {
          return true;
        } else {
          oldValue.value = value;
          return true;
        }
      }
    }
    const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
    const result = Reflect.set(
      target,
      key,
      value,
      isRef(target) ? target : receiver
    );
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        trigger(target, "add", key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, "set", key, value);
      }
    }
    return result;
  }
  deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      trigger(target, "delete", key, void 0);
    }
    return result;
  }
  has(target, key) {
    const result = Reflect.has(target, key);
    if (!isSymbol$1(key) || !builtInSymbols.has(key)) {
      track(target, "has", key);
    }
    return result;
  }
  ownKeys(target) {
    track(
      target,
      "iterate",
      isArray$2(target) ? "length" : ITERATE_KEY
    );
    return Reflect.ownKeys(target);
  }
}
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(true, isShallow2);
  }
  set(target, key) {
    return true;
  }
  deleteProperty(target, key) {
    return true;
  }
}
const mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
const readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
const shallowReactiveHandlers = /* @__PURE__ */ new MutableReactiveHandler(true);
const shallowReadonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler(true);
const toShallow = (value) => value;
const getProto = (v2) => Reflect.getPrototypeOf(v2);
function createIterableMethod(method2, isReadonly2, isShallow2) {
  return function(...args) {
    const target = this["__v_raw"];
    const rawTarget = toRaw(target);
    const targetIsMap = isMap(rawTarget);
    const isPair = method2 === "entries" || method2 === Symbol.iterator && targetIsMap;
    const isKeyOnly = method2 === "keys" && targetIsMap;
    const innerIterator = target[method2](...args);
    const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
    !isReadonly2 && track(
      rawTarget,
      "iterate",
      isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY
    );
    return {
      // iterator protocol
      next() {
        const { value, done } = innerIterator.next();
        return done ? { value, done } : {
          value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
          done
        };
      },
      // iterable protocol
      [Symbol.iterator]() {
        return this;
      }
    };
  };
}
function createReadonlyMethod(type2) {
  return function(...args) {
    return type2 === "delete" ? false : type2 === "clear" ? void 0 : this;
  };
}
function createInstrumentations(readonly2, shallow) {
  const instrumentations = {
    get(key) {
      const target = this["__v_raw"];
      const rawTarget = toRaw(target);
      const rawKey = toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "get", key);
        }
        track(rawTarget, "get", rawKey);
      }
      const { has } = getProto(rawTarget);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
      } else if (target !== rawTarget) {
        target.get(key);
      }
    },
    get size() {
      const target = this["__v_raw"];
      !readonly2 && track(toRaw(target), "iterate", ITERATE_KEY);
      return target.size;
    },
    has(key) {
      const target = this["__v_raw"];
      const rawTarget = toRaw(target);
      const rawKey = toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "has", key);
        }
        track(rawTarget, "has", rawKey);
      }
      return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    },
    forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw"];
      const rawTarget = toRaw(target);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      !readonly2 && track(rawTarget, "iterate", ITERATE_KEY);
      return target.forEach((value, key) => {
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    }
  };
  extend$1(
    instrumentations,
    readonly2 ? {
      add: createReadonlyMethod("add"),
      set: createReadonlyMethod("set"),
      delete: createReadonlyMethod("delete"),
      clear: createReadonlyMethod("clear")
    } : {
      add(value) {
        if (!shallow && !isShallow(value) && !isReadonly(value)) {
          value = toRaw(value);
        }
        const target = toRaw(this);
        const proto = getProto(target);
        const hadKey = proto.has.call(target, value);
        if (!hadKey) {
          target.add(value);
          trigger(target, "add", value, value);
        }
        return this;
      },
      set(key, value) {
        if (!shallow && !isShallow(value) && !isReadonly(value)) {
          value = toRaw(value);
        }
        const target = toRaw(this);
        const { has, get: get2 } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = toRaw(key);
          hadKey = has.call(target, key);
        }
        const oldValue = get2.call(target, key);
        target.set(key, value);
        if (!hadKey) {
          trigger(target, "add", key, value);
        } else if (hasChanged(value, oldValue)) {
          trigger(target, "set", key, value);
        }
        return this;
      },
      delete(key) {
        const target = toRaw(this);
        const { has, get: get2 } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = toRaw(key);
          hadKey = has.call(target, key);
        }
        get2 ? get2.call(target, key) : void 0;
        const result = target.delete(key);
        if (hadKey) {
          trigger(target, "delete", key, void 0);
        }
        return result;
      },
      clear() {
        const target = toRaw(this);
        const hadItems = target.size !== 0;
        const result = target.clear();
        if (hadItems) {
          trigger(
            target,
            "clear",
            void 0,
            void 0
          );
        }
        return result;
      }
    }
  );
  const iteratorMethods = [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ];
  iteratorMethods.forEach((method2) => {
    instrumentations[method2] = createIterableMethod(method2, readonly2, shallow);
  });
  return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
  const instrumentations = createInstrumentations(isReadonly2, shallow);
  return (target, key, receiver) => {
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_raw") {
      return target;
    }
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target ? instrumentations : target,
      key,
      receiver
    );
  };
}
const mutableCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, false)
};
const shallowCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, true)
};
const readonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, false)
};
const shallowReadonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, true)
};
const reactiveMap = /* @__PURE__ */ new WeakMap();
const shallowReactiveMap = /* @__PURE__ */ new WeakMap();
const readonlyMap = /* @__PURE__ */ new WeakMap();
const shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
function targetTypeMap(rawType) {
  switch (rawType) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
function getTargetType(value) {
  return value["__v_skip"] || !Object.isExtensible(value) ? 0 : targetTypeMap(toRawType(value));
}
function reactive(target) {
  if (isReadonly(target)) {
    return target;
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap
  );
}
function shallowReactive(target) {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap
  );
}
function readonly(target) {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap
  );
}
function shallowReadonly(target) {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap
  );
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
  if (!isObject$2(target)) {
    return target;
  }
  if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) {
    return target;
  }
  const targetType = getTargetType(target);
  if (targetType === 0) {
    return target;
  }
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  const proxy = new Proxy(
    target,
    targetType === 2 ? collectionHandlers : baseHandlers
  );
  proxyMap.set(target, proxy);
  return proxy;
}
function isReactive(value) {
  if (isReadonly(value)) {
    return isReactive(value["__v_raw"]);
  }
  return !!(value && value["__v_isReactive"]);
}
function isReadonly(value) {
  return !!(value && value["__v_isReadonly"]);
}
function isShallow(value) {
  return !!(value && value["__v_isShallow"]);
}
function isProxy(value) {
  return value ? !!value["__v_raw"] : false;
}
function toRaw(observed) {
  const raw = observed && observed["__v_raw"];
  return raw ? toRaw(raw) : observed;
}
function markRaw(value) {
  if (!hasOwn(value, "__v_skip") && Object.isExtensible(value)) {
    def(value, "__v_skip", true);
  }
  return value;
}
const toReactive = (value) => isObject$2(value) ? reactive(value) : value;
const toReadonly = (value) => isObject$2(value) ? readonly(value) : value;
function isRef(r2) {
  return r2 ? r2["__v_isRef"] === true : false;
}
function ref(value) {
  return createRef(value, false);
}
function createRef(rawValue, shallow) {
  if (isRef(rawValue)) {
    return rawValue;
  }
  return new RefImpl(rawValue, shallow);
}
class RefImpl {
  constructor(value, isShallow2) {
    this.dep = new Dep();
    this["__v_isRef"] = true;
    this["__v_isShallow"] = false;
    this._rawValue = isShallow2 ? value : toRaw(value);
    this._value = isShallow2 ? value : toReactive(value);
    this["__v_isShallow"] = isShallow2;
  }
  get value() {
    {
      this.dep.track();
    }
    return this._value;
  }
  set value(newValue) {
    const oldValue = this._rawValue;
    const useDirectValue = this["__v_isShallow"] || isShallow(newValue) || isReadonly(newValue);
    newValue = useDirectValue ? newValue : toRaw(newValue);
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue;
      this._value = useDirectValue ? newValue : toReactive(newValue);
      {
        this.dep.trigger();
      }
    }
  }
}
function unref(ref2) {
  return isRef(ref2) ? ref2.value : ref2;
}
const shallowUnwrapHandlers = {
  get: (target, key, receiver) => key === "__v_raw" ? target : unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key];
    if (isRef(oldValue) && !isRef(value)) {
      oldValue.value = value;
      return true;
    } else {
      return Reflect.set(target, key, value, receiver);
    }
  }
};
function proxyRefs(objectWithRefs) {
  return isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}
function toRefs(object2) {
  const ret = isArray$2(object2) ? new Array(object2.length) : {};
  for (const key in object2) {
    ret[key] = propertyToRef(object2, key);
  }
  return ret;
}
class ObjectRefImpl {
  constructor(_object, _key, _defaultValue) {
    this._object = _object;
    this._key = _key;
    this._defaultValue = _defaultValue;
    this["__v_isRef"] = true;
    this._value = void 0;
    this._raw = toRaw(_object);
    let shallow = true;
    let obj = _object;
    if (!isArray$2(_object) || !isIntegerKey(String(_key))) {
      do {
        shallow = !isProxy(obj) || isShallow(obj);
      } while (shallow && (obj = obj["__v_raw"]));
    }
    this._shallow = shallow;
  }
  get value() {
    let val = this._object[this._key];
    if (this._shallow) {
      val = unref(val);
    }
    return this._value = val === void 0 ? this._defaultValue : val;
  }
  set value(newVal) {
    if (this._shallow && isRef(this._raw[this._key])) {
      const nestedRef = this._object[this._key];
      if (isRef(nestedRef)) {
        nestedRef.value = newVal;
        return;
      }
    }
    this._object[this._key] = newVal;
  }
  get dep() {
    return getDepFromReactive(this._raw, this._key);
  }
}
class GetterRefImpl {
  constructor(_getter) {
    this._getter = _getter;
    this["__v_isRef"] = true;
    this["__v_isReadonly"] = true;
    this._value = void 0;
  }
  get value() {
    return this._value = this._getter();
  }
}
function toRef(source, key, defaultValue) {
  if (isRef(source)) {
    return source;
  } else if (isFunction$2(source)) {
    return new GetterRefImpl(source);
  } else if (isObject$2(source) && arguments.length > 1) {
    return propertyToRef(source, key, defaultValue);
  } else {
    return ref(source);
  }
}
function propertyToRef(source, key, defaultValue) {
  return new ObjectRefImpl(source, key, defaultValue);
}
class ComputedRefImpl {
  constructor(fn, setter, isSSR) {
    this.fn = fn;
    this.setter = setter;
    this._value = void 0;
    this.dep = new Dep(this);
    this.__v_isRef = true;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 16;
    this.globalVersion = globalVersion - 1;
    this.next = void 0;
    this.effect = this;
    this["__v_isReadonly"] = !setter;
    this.isSSR = isSSR;
  }
  /**
   * @internal
   */
  notify() {
    this.flags |= 16;
    if (!(this.flags & 8) && // avoid infinite self recursion
    activeSub !== this) {
      batch(this, true);
      return true;
    }
  }
  get value() {
    const link = this.dep.track();
    refreshComputed(this);
    if (link) {
      link.version = this.dep.version;
    }
    return this._value;
  }
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue);
    }
  }
}
function computed$1(getterOrOptions, debugOptions, isSSR = false) {
  let getter;
  let setter;
  if (isFunction$2(getterOrOptions)) {
    getter = getterOrOptions;
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }
  const cRef = new ComputedRefImpl(getter, setter, isSSR);
  return cRef;
}
const INITIAL_WATCHER_VALUE = {};
const cleanupMap = /* @__PURE__ */ new WeakMap();
let activeWatcher = void 0;
function onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher) {
  if (owner) {
    let cleanups = cleanupMap.get(owner);
    if (!cleanups) cleanupMap.set(owner, cleanups = []);
    cleanups.push(cleanupFn);
  }
}
function watch$1(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, once, scheduler, augmentJob, call } = options;
  const reactiveGetter = (source2) => {
    if (deep) return source2;
    if (isShallow(source2) || deep === false || deep === 0)
      return traverse(source2, 1);
    return traverse(source2);
  };
  let effect2;
  let getter;
  let cleanup;
  let boundCleanup;
  let forceTrigger = false;
  let isMultiSource = false;
  if (isRef(source)) {
    getter = () => source.value;
    forceTrigger = isShallow(source);
  } else if (isReactive(source)) {
    getter = () => reactiveGetter(source);
    forceTrigger = true;
  } else if (isArray$2(source)) {
    isMultiSource = true;
    forceTrigger = source.some((s2) => isReactive(s2) || isShallow(s2));
    getter = () => source.map((s2) => {
      if (isRef(s2)) {
        return s2.value;
      } else if (isReactive(s2)) {
        return reactiveGetter(s2);
      } else if (isFunction$2(s2)) {
        return call ? call(s2, 2) : s2();
      } else ;
    });
  } else if (isFunction$2(source)) {
    if (cb) {
      getter = call ? () => call(source, 2) : source;
    } else {
      getter = () => {
        if (cleanup) {
          pauseTracking();
          try {
            cleanup();
          } finally {
            resetTracking();
          }
        }
        const currentEffect = activeWatcher;
        activeWatcher = effect2;
        try {
          return call ? call(source, 3, [boundCleanup]) : source(boundCleanup);
        } finally {
          activeWatcher = currentEffect;
        }
      };
    }
  } else {
    getter = NOOP;
  }
  if (cb && deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }
  const scope = getCurrentScope();
  const watchHandle = () => {
    effect2.stop();
    if (scope && scope.active) {
      remove(scope.effects, effect2);
    }
  };
  if (once && cb) {
    const _cb = cb;
    cb = (...args) => {
      _cb(...args);
      watchHandle();
    };
  }
  let oldValue = isMultiSource ? new Array(source.length).fill(INITIAL_WATCHER_VALUE) : INITIAL_WATCHER_VALUE;
  const job = (immediateFirstRun) => {
    if (!(effect2.flags & 1) || !effect2.dirty && !immediateFirstRun) {
      return;
    }
    if (cb) {
      const newValue = effect2.run();
      if (deep || forceTrigger || (isMultiSource ? newValue.some((v2, i2) => hasChanged(v2, oldValue[i2])) : hasChanged(newValue, oldValue))) {
        if (cleanup) {
          cleanup();
        }
        const currentWatcher = activeWatcher;
        activeWatcher = effect2;
        try {
          const args = [
            newValue,
            // pass undefined as the old value when it's changed for the first time
            oldValue === INITIAL_WATCHER_VALUE ? void 0 : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE ? [] : oldValue,
            boundCleanup
          ];
          oldValue = newValue;
          call ? call(cb, 3, args) : (
            // @ts-expect-error
            cb(...args)
          );
        } finally {
          activeWatcher = currentWatcher;
        }
      }
    } else {
      effect2.run();
    }
  };
  if (augmentJob) {
    augmentJob(job);
  }
  effect2 = new ReactiveEffect(getter);
  effect2.scheduler = scheduler ? () => scheduler(job, false) : job;
  boundCleanup = (fn) => onWatcherCleanup(fn, false, effect2);
  cleanup = effect2.onStop = () => {
    const cleanups = cleanupMap.get(effect2);
    if (cleanups) {
      if (call) {
        call(cleanups, 4);
      } else {
        for (const cleanup2 of cleanups) cleanup2();
      }
      cleanupMap.delete(effect2);
    }
  };
  if (cb) {
    if (immediate) {
      job(true);
    } else {
      oldValue = effect2.run();
    }
  } else if (scheduler) {
    scheduler(job.bind(null, true), true);
  } else {
    effect2.run();
  }
  watchHandle.pause = effect2.pause.bind(effect2);
  watchHandle.resume = effect2.resume.bind(effect2);
  watchHandle.stop = watchHandle;
  return watchHandle;
}
function traverse(value, depth = Infinity, seen) {
  if (depth <= 0 || !isObject$2(value) || value["__v_skip"]) {
    return value;
  }
  seen = seen || /* @__PURE__ */ new Map();
  if ((seen.get(value) || 0) >= depth) {
    return value;
  }
  seen.set(value, depth);
  depth--;
  if (isRef(value)) {
    traverse(value.value, depth, seen);
  } else if (isArray$2(value)) {
    for (let i2 = 0; i2 < value.length; i2++) {
      traverse(value[i2], depth, seen);
    }
  } else if (isSet(value) || isMap(value)) {
    value.forEach((v2) => {
      traverse(v2, depth, seen);
    });
  } else if (isPlainObject$2(value)) {
    for (const key in value) {
      traverse(value[key], depth, seen);
    }
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key], depth, seen);
      }
    }
  }
  return value;
}
/**
* @vue/runtime-core v3.5.26
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
const stack = [];
let isWarning = false;
function warn$1(msg, ...args) {
  if (isWarning) return;
  isWarning = true;
  pauseTracking();
  const instance = stack.length ? stack[stack.length - 1].component : null;
  const appWarnHandler = instance && instance.appContext.config.warnHandler;
  const trace = getComponentTrace();
  if (appWarnHandler) {
    callWithErrorHandling(
      appWarnHandler,
      instance,
      11,
      [
        // eslint-disable-next-line no-restricted-syntax
        msg + args.map((a2) => {
          var _a2, _b;
          return (_b = (_a2 = a2.toString) == null ? void 0 : _a2.call(a2)) != null ? _b : JSON.stringify(a2);
        }).join(""),
        instance && instance.proxy,
        trace.map(
          ({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`
        ).join("\n"),
        trace
      ]
    );
  } else {
    const warnArgs = [`[Vue warn]: ${msg}`, ...args];
    if (trace.length && // avoid spamming console during tests
    true) {
      warnArgs.push(`
`, ...formatTrace(trace));
    }
    console.warn(...warnArgs);
  }
  resetTracking();
  isWarning = false;
}
function getComponentTrace() {
  let currentVNode = stack[stack.length - 1];
  if (!currentVNode) {
    return [];
  }
  const normalizedStack = [];
  while (currentVNode) {
    const last = normalizedStack[0];
    if (last && last.vnode === currentVNode) {
      last.recurseCount++;
    } else {
      normalizedStack.push({
        vnode: currentVNode,
        recurseCount: 0
      });
    }
    const parentInstance = currentVNode.component && currentVNode.component.parent;
    currentVNode = parentInstance && parentInstance.vnode;
  }
  return normalizedStack;
}
function formatTrace(trace) {
  const logs = [];
  trace.forEach((entry, i2) => {
    logs.push(...i2 === 0 ? [] : [`
`], ...formatTraceEntry(entry));
  });
  return logs;
}
function formatTraceEntry({ vnode, recurseCount }) {
  const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
  const isRoot = vnode.component ? vnode.component.parent == null : false;
  const open = ` at <${formatComponentName(
    vnode.component,
    vnode.type,
    isRoot
  )}`;
  const close2 = `>` + postfix;
  return vnode.props ? [open, ...formatProps(vnode.props), close2] : [open + close2];
}
function formatProps(props) {
  const res = [];
  const keys = Object.keys(props);
  keys.slice(0, 3).forEach((key) => {
    res.push(...formatProp(key, props[key]));
  });
  if (keys.length > 3) {
    res.push(` ...`);
  }
  return res;
}
function formatProp(key, value, raw) {
  if (isString$2(value)) {
    value = JSON.stringify(value);
    return raw ? value : [`${key}=${value}`];
  } else if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return raw ? value : [`${key}=${value}`];
  } else if (isRef(value)) {
    value = formatProp(key, toRaw(value.value), true);
    return raw ? value : [`${key}=Ref<`, value, `>`];
  } else if (isFunction$2(value)) {
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
  } else {
    value = toRaw(value);
    return raw ? value : [`${key}=`, value];
  }
}
function callWithErrorHandling(fn, instance, type2, args) {
  try {
    return args ? fn(...args) : fn();
  } catch (err) {
    handleError(err, instance, type2);
  }
}
function callWithAsyncErrorHandling(fn, instance, type2, args) {
  if (isFunction$2(fn)) {
    const res = callWithErrorHandling(fn, instance, type2, args);
    if (res && isPromise(res)) {
      res.catch((err) => {
        handleError(err, instance, type2);
      });
    }
    return res;
  }
  if (isArray$2(fn)) {
    const values = [];
    for (let i2 = 0; i2 < fn.length; i2++) {
      values.push(callWithAsyncErrorHandling(fn[i2], instance, type2, args));
    }
    return values;
  }
}
function handleError(err, instance, type2, throwInDev = true) {
  const contextVNode = instance ? instance.vnode : null;
  const { errorHandler, throwUnhandledErrorInProduction } = instance && instance.appContext.config || EMPTY_OBJ;
  if (instance) {
    let cur = instance.parent;
    const exposedInstance = instance.proxy;
    const errorInfo = `https://vuejs.org/error-reference/#runtime-${type2}`;
    while (cur) {
      const errorCapturedHooks = cur.ec;
      if (errorCapturedHooks) {
        for (let i2 = 0; i2 < errorCapturedHooks.length; i2++) {
          if (errorCapturedHooks[i2](err, exposedInstance, errorInfo) === false) {
            return;
          }
        }
      }
      cur = cur.parent;
    }
    if (errorHandler) {
      pauseTracking();
      callWithErrorHandling(errorHandler, null, 10, [
        err,
        exposedInstance,
        errorInfo
      ]);
      resetTracking();
      return;
    }
  }
  logError(err, type2, contextVNode, throwInDev, throwUnhandledErrorInProduction);
}
function logError(err, type2, contextVNode, throwInDev = true, throwInProd = false) {
  if (throwInProd) {
    throw err;
  } else {
    console.error(err);
  }
}
const queue = [];
let flushIndex = -1;
const pendingPostFlushCbs = [];
let activePostFlushCbs = null;
let postFlushIndex = 0;
const resolvedPromise = /* @__PURE__ */ Promise.resolve();
let currentFlushPromise = null;
function nextTick(fn) {
  const p2 = currentFlushPromise || resolvedPromise;
  return fn ? p2.then(this ? fn.bind(this) : fn) : p2;
}
function findInsertionIndex(id) {
  let start2 = flushIndex + 1;
  let end2 = queue.length;
  while (start2 < end2) {
    const middle = start2 + end2 >>> 1;
    const middleJob = queue[middle];
    const middleJobId = getId(middleJob);
    if (middleJobId < id || middleJobId === id && middleJob.flags & 2) {
      start2 = middle + 1;
    } else {
      end2 = middle;
    }
  }
  return start2;
}
function queueJob(job) {
  if (!(job.flags & 1)) {
    const jobId = getId(job);
    const lastJob = queue[queue.length - 1];
    if (!lastJob || // fast path when the job id is larger than the tail
    !(job.flags & 2) && jobId >= getId(lastJob)) {
      queue.push(job);
    } else {
      queue.splice(findInsertionIndex(jobId), 0, job);
    }
    job.flags |= 1;
    queueFlush();
  }
}
function queueFlush() {
  if (!currentFlushPromise) {
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}
function queuePostFlushCb(cb) {
  if (!isArray$2(cb)) {
    if (activePostFlushCbs && cb.id === -1) {
      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb);
    } else if (!(cb.flags & 1)) {
      pendingPostFlushCbs.push(cb);
      cb.flags |= 1;
    }
  } else {
    pendingPostFlushCbs.push(...cb);
  }
  queueFlush();
}
function flushPreFlushCbs(instance, seen, i2 = flushIndex + 1) {
  for (; i2 < queue.length; i2++) {
    const cb = queue[i2];
    if (cb && cb.flags & 2) {
      if (instance && cb.id !== instance.uid) {
        continue;
      }
      queue.splice(i2, 1);
      i2--;
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      cb();
      if (!(cb.flags & 4)) {
        cb.flags &= -2;
      }
    }
  }
}
function flushPostFlushCbs(seen) {
  if (pendingPostFlushCbs.length) {
    const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a2, b2) => getId(a2) - getId(b2)
    );
    pendingPostFlushCbs.length = 0;
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped);
      return;
    }
    activePostFlushCbs = deduped;
    for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
      const cb = activePostFlushCbs[postFlushIndex];
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      if (!(cb.flags & 8)) cb();
      cb.flags &= -2;
    }
    activePostFlushCbs = null;
    postFlushIndex = 0;
  }
}
const getId = (job) => job.id == null ? job.flags & 2 ? -1 : Infinity : job.id;
function flushJobs(seen) {
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job && !(job.flags & 8)) {
        if (false) ;
        if (job.flags & 4) {
          job.flags &= ~1;
        }
        callWithErrorHandling(
          job,
          job.i,
          job.i ? 15 : 14
        );
        if (!(job.flags & 4)) {
          job.flags &= ~1;
        }
      }
    }
  } finally {
    for (; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job) {
        job.flags &= -2;
      }
    }
    flushIndex = -1;
    queue.length = 0;
    flushPostFlushCbs();
    currentFlushPromise = null;
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs();
    }
  }
}
let devtools$1;
let buffer = [];
let devtoolsNotInstalled = false;
function emit$1(event2, ...args) {
  if (devtools$1) {
    devtools$1.emit(event2, ...args);
  } else if (!devtoolsNotInstalled) {
    buffer.push({ event: event2, args });
  }
}
function setDevtoolsHook$1(hook, target) {
  var _a2, _b;
  devtools$1 = hook;
  if (devtools$1) {
    devtools$1.enabled = true;
    buffer.forEach(({ event: event2, args }) => devtools$1.emit(event2, ...args));
    buffer = [];
  } else if (
    // handle late devtools injection - only do this if we are in an actual
    // browser environment to avoid the timer handle stalling test runner exit
    // (#4815)
    typeof window !== "undefined" && // some envs mock window but not fully
    window.HTMLElement && // also exclude jsdom
    // eslint-disable-next-line no-restricted-syntax
    !((_b = (_a2 = window.navigator) == null ? void 0 : _a2.userAgent) == null ? void 0 : _b.includes("jsdom"))
  ) {
    const replay = target.__VUE_DEVTOOLS_HOOK_REPLAY__ = target.__VUE_DEVTOOLS_HOOK_REPLAY__ || [];
    replay.push((newHook) => {
      setDevtoolsHook$1(newHook, target);
    });
    setTimeout(() => {
      if (!devtools$1) {
        target.__VUE_DEVTOOLS_HOOK_REPLAY__ = null;
        devtoolsNotInstalled = true;
        buffer = [];
      }
    }, 3e3);
  } else {
    devtoolsNotInstalled = true;
    buffer = [];
  }
}
function devtoolsInitApp(app, version2) {
  emit$1("app:init", app, version2, {
    Fragment,
    Text,
    Comment,
    Static
  });
}
function devtoolsUnmountApp(app) {
  emit$1("app:unmount", app);
}
const devtoolsComponentAdded = /* @__PURE__ */ createDevtoolsComponentHook(
  "component:added"
  /* COMPONENT_ADDED */
);
const devtoolsComponentUpdated = /* @__PURE__ */ createDevtoolsComponentHook(
  "component:updated"
  /* COMPONENT_UPDATED */
);
const _devtoolsComponentRemoved = /* @__PURE__ */ createDevtoolsComponentHook(
  "component:removed"
  /* COMPONENT_REMOVED */
);
const devtoolsComponentRemoved = (component) => {
  if (devtools$1 && typeof devtools$1.cleanupBuffer === "function" && // remove the component if it wasn't buffered
  !devtools$1.cleanupBuffer(component)) {
    _devtoolsComponentRemoved(component);
  }
};
// @__NO_SIDE_EFFECTS__
function createDevtoolsComponentHook(hook) {
  return (component) => {
    emit$1(
      hook,
      component.appContext.app,
      component.uid,
      component.parent ? component.parent.uid : void 0,
      component
    );
  };
}
function devtoolsComponentEmit(component, event2, params) {
  emit$1(
    "component:emit",
    component.appContext.app,
    component,
    event2,
    params
  );
}
let currentRenderingInstance = null;
let currentScopeId = null;
function setCurrentRenderingInstance(instance) {
  const prev = currentRenderingInstance;
  currentRenderingInstance = instance;
  currentScopeId = instance && instance.type.__scopeId || null;
  return prev;
}
function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot) {
  if (!ctx) return fn;
  if (fn._n) {
    return fn;
  }
  const renderFnWithContext = (...args) => {
    if (renderFnWithContext._d) {
      setBlockTracking(-1);
    }
    const prevInstance = setCurrentRenderingInstance(ctx);
    let res;
    try {
      res = fn(...args);
    } finally {
      setCurrentRenderingInstance(prevInstance);
      if (renderFnWithContext._d) {
        setBlockTracking(1);
      }
    }
    if (__VUE_PROD_DEVTOOLS__) {
      devtoolsComponentUpdated(ctx);
    }
    return res;
  };
  renderFnWithContext._n = true;
  renderFnWithContext._c = true;
  renderFnWithContext._d = true;
  return renderFnWithContext;
}
function withDirectives(vnode, directives) {
  if (currentRenderingInstance === null) {
    return vnode;
  }
  const instance = getComponentPublicInstance(currentRenderingInstance);
  const bindings = vnode.dirs || (vnode.dirs = []);
  for (let i2 = 0; i2 < directives.length; i2++) {
    let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i2];
    if (dir) {
      if (isFunction$2(dir)) {
        dir = {
          mounted: dir,
          updated: dir
        };
      }
      if (dir.deep) {
        traverse(value);
      }
      bindings.push({
        dir,
        instance,
        value,
        oldValue: void 0,
        arg,
        modifiers
      });
    }
  }
  return vnode;
}
function invokeDirectiveHook(vnode, prevVNode, instance, name) {
  const bindings = vnode.dirs;
  const oldBindings = prevVNode && prevVNode.dirs;
  for (let i2 = 0; i2 < bindings.length; i2++) {
    const binding = bindings[i2];
    if (oldBindings) {
      binding.oldValue = oldBindings[i2].value;
    }
    let hook = binding.dir[name];
    if (hook) {
      pauseTracking();
      callWithAsyncErrorHandling(hook, instance, 8, [
        vnode.el,
        binding,
        vnode,
        prevVNode
      ]);
      resetTracking();
    }
  }
}
function provide(key, value) {
  if (currentInstance) {
    let provides = currentInstance.provides;
    const parentProvides = currentInstance.parent && currentInstance.parent.provides;
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides);
    }
    provides[key] = value;
  }
}
function inject(key, defaultValue, treatDefaultAsFactory = false) {
  const instance = getCurrentInstance();
  if (instance || currentApp) {
    let provides = currentApp ? currentApp._context.provides : instance ? instance.parent == null || instance.ce ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides : void 0;
    if (provides && key in provides) {
      return provides[key];
    } else if (arguments.length > 1) {
      return treatDefaultAsFactory && isFunction$2(defaultValue) ? defaultValue.call(instance && instance.proxy) : defaultValue;
    } else ;
  }
}
function hasInjectionContext() {
  return !!(getCurrentInstance() || currentApp);
}
const ssrContextKey = /* @__PURE__ */ Symbol.for("v-scx");
const useSSRContext = () => {
  {
    const ctx = inject(ssrContextKey);
    return ctx;
  }
};
function watch(source, cb, options) {
  return doWatch(source, cb, options);
}
function doWatch(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, flush, once } = options;
  const baseWatchOptions = extend$1({}, options);
  const runsImmediately = cb && immediate || !cb && flush !== "post";
  let ssrCleanup;
  if (isInSSRComponentSetup) {
    if (flush === "sync") {
      const ctx = useSSRContext();
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = []);
    } else if (!runsImmediately) {
      const watchStopHandle = () => {
      };
      watchStopHandle.stop = NOOP;
      watchStopHandle.resume = NOOP;
      watchStopHandle.pause = NOOP;
      return watchStopHandle;
    }
  }
  const instance = currentInstance;
  baseWatchOptions.call = (fn, type2, args) => callWithAsyncErrorHandling(fn, instance, type2, args);
  let isPre = false;
  if (flush === "post") {
    baseWatchOptions.scheduler = (job) => {
      queuePostRenderEffect(job, instance && instance.suspense);
    };
  } else if (flush !== "sync") {
    isPre = true;
    baseWatchOptions.scheduler = (job, isFirstRun) => {
      if (isFirstRun) {
        job();
      } else {
        queueJob(job);
      }
    };
  }
  baseWatchOptions.augmentJob = (job) => {
    if (cb) {
      job.flags |= 4;
    }
    if (isPre) {
      job.flags |= 2;
      if (instance) {
        job.id = instance.uid;
        job.i = instance;
      }
    }
  };
  const watchHandle = watch$1(source, cb, baseWatchOptions);
  if (isInSSRComponentSetup) {
    if (ssrCleanup) {
      ssrCleanup.push(watchHandle);
    } else if (runsImmediately) {
      watchHandle();
    }
  }
  return watchHandle;
}
function instanceWatch(source, value, options) {
  const publicThis = this.proxy;
  const getter = isString$2(source) ? source.includes(".") ? createPathGetter(publicThis, source) : () => publicThis[source] : source.bind(publicThis, publicThis);
  let cb;
  if (isFunction$2(value)) {
    cb = value;
  } else {
    cb = value.handler;
    options = value;
  }
  const reset2 = setCurrentInstance(this);
  const res = doWatch(getter, cb.bind(publicThis), options);
  reset2();
  return res;
}
function createPathGetter(ctx, path2) {
  const segments = path2.split(".");
  return () => {
    let cur = ctx;
    for (let i2 = 0; i2 < segments.length && cur; i2++) {
      cur = cur[segments[i2]];
    }
    return cur;
  };
}
const TeleportEndKey = /* @__PURE__ */ Symbol("_vte");
const isTeleport = (type2) => type2.__isTeleport;
const leaveCbKey = /* @__PURE__ */ Symbol("_leaveCb");
const enterCbKey = /* @__PURE__ */ Symbol("_enterCb");
function useTransitionState() {
  const state = {
    isMounted: false,
    isLeaving: false,
    isUnmounting: false,
    leavingVNodes: /* @__PURE__ */ new Map()
  };
  onMounted(() => {
    state.isMounted = true;
  });
  onBeforeUnmount(() => {
    state.isUnmounting = true;
  });
  return state;
}
const TransitionHookValidator = [Function, Array];
const BaseTransitionPropsValidators = {
  mode: String,
  appear: Boolean,
  persisted: Boolean,
  // enter
  onBeforeEnter: TransitionHookValidator,
  onEnter: TransitionHookValidator,
  onAfterEnter: TransitionHookValidator,
  onEnterCancelled: TransitionHookValidator,
  // leave
  onBeforeLeave: TransitionHookValidator,
  onLeave: TransitionHookValidator,
  onAfterLeave: TransitionHookValidator,
  onLeaveCancelled: TransitionHookValidator,
  // appear
  onBeforeAppear: TransitionHookValidator,
  onAppear: TransitionHookValidator,
  onAfterAppear: TransitionHookValidator,
  onAppearCancelled: TransitionHookValidator
};
const recursiveGetSubtree = (instance) => {
  const subTree = instance.subTree;
  return subTree.component ? recursiveGetSubtree(subTree.component) : subTree;
};
const BaseTransitionImpl = {
  name: `BaseTransition`,
  props: BaseTransitionPropsValidators,
  setup(props, { slots }) {
    const instance = getCurrentInstance();
    const state = useTransitionState();
    return () => {
      const children = slots.default && getTransitionRawChildren(slots.default(), true);
      if (!children || !children.length) {
        return;
      }
      const child = findNonCommentChild(children);
      const rawProps = toRaw(props);
      const { mode } = rawProps;
      if (state.isLeaving) {
        return emptyPlaceholder(child);
      }
      const innerChild = getInnerChild$1(child);
      if (!innerChild) {
        return emptyPlaceholder(child);
      }
      let enterHooks = resolveTransitionHooks(
        innerChild,
        rawProps,
        state,
        instance,
        // #11061, ensure enterHooks is fresh after clone
        (hooks) => enterHooks = hooks
      );
      if (innerChild.type !== Comment) {
        setTransitionHooks(innerChild, enterHooks);
      }
      let oldInnerChild = instance.subTree && getInnerChild$1(instance.subTree);
      if (oldInnerChild && oldInnerChild.type !== Comment && !isSameVNodeType(oldInnerChild, innerChild) && recursiveGetSubtree(instance).type !== Comment) {
        let leavingHooks = resolveTransitionHooks(
          oldInnerChild,
          rawProps,
          state,
          instance
        );
        setTransitionHooks(oldInnerChild, leavingHooks);
        if (mode === "out-in" && innerChild.type !== Comment) {
          state.isLeaving = true;
          leavingHooks.afterLeave = () => {
            state.isLeaving = false;
            if (!(instance.job.flags & 8)) {
              instance.update();
            }
            delete leavingHooks.afterLeave;
            oldInnerChild = void 0;
          };
          return emptyPlaceholder(child);
        } else if (mode === "in-out" && innerChild.type !== Comment) {
          leavingHooks.delayLeave = (el, earlyRemove, delayedLeave) => {
            const leavingVNodesCache = getLeavingNodesForType(
              state,
              oldInnerChild
            );
            leavingVNodesCache[String(oldInnerChild.key)] = oldInnerChild;
            el[leaveCbKey] = () => {
              earlyRemove();
              el[leaveCbKey] = void 0;
              delete enterHooks.delayedLeave;
              oldInnerChild = void 0;
            };
            enterHooks.delayedLeave = () => {
              delayedLeave();
              delete enterHooks.delayedLeave;
              oldInnerChild = void 0;
            };
          };
        } else {
          oldInnerChild = void 0;
        }
      } else if (oldInnerChild) {
        oldInnerChild = void 0;
      }
      return child;
    };
  }
};
function findNonCommentChild(children) {
  let child = children[0];
  if (children.length > 1) {
    for (const c2 of children) {
      if (c2.type !== Comment) {
        child = c2;
        break;
      }
    }
  }
  return child;
}
const BaseTransition = BaseTransitionImpl;
function getLeavingNodesForType(state, vnode) {
  const { leavingVNodes } = state;
  let leavingVNodesCache = leavingVNodes.get(vnode.type);
  if (!leavingVNodesCache) {
    leavingVNodesCache = /* @__PURE__ */ Object.create(null);
    leavingVNodes.set(vnode.type, leavingVNodesCache);
  }
  return leavingVNodesCache;
}
function resolveTransitionHooks(vnode, props, state, instance, postClone) {
  const {
    appear,
    mode,
    persisted = false,
    onBeforeEnter,
    onEnter,
    onAfterEnter,
    onEnterCancelled,
    onBeforeLeave,
    onLeave,
    onAfterLeave,
    onLeaveCancelled,
    onBeforeAppear,
    onAppear,
    onAfterAppear,
    onAppearCancelled
  } = props;
  const key = String(vnode.key);
  const leavingVNodesCache = getLeavingNodesForType(state, vnode);
  const callHook2 = (hook, args) => {
    hook && callWithAsyncErrorHandling(
      hook,
      instance,
      9,
      args
    );
  };
  const callAsyncHook = (hook, args) => {
    const done = args[1];
    callHook2(hook, args);
    if (isArray$2(hook)) {
      if (hook.every((hook2) => hook2.length <= 1)) done();
    } else if (hook.length <= 1) {
      done();
    }
  };
  const hooks = {
    mode,
    persisted,
    beforeEnter(el) {
      let hook = onBeforeEnter;
      if (!state.isMounted) {
        if (appear) {
          hook = onBeforeAppear || onBeforeEnter;
        } else {
          return;
        }
      }
      if (el[leaveCbKey]) {
        el[leaveCbKey](
          true
          /* cancelled */
        );
      }
      const leavingVNode = leavingVNodesCache[key];
      if (leavingVNode && isSameVNodeType(vnode, leavingVNode) && leavingVNode.el[leaveCbKey]) {
        leavingVNode.el[leaveCbKey]();
      }
      callHook2(hook, [el]);
    },
    enter(el) {
      let hook = onEnter;
      let afterHook = onAfterEnter;
      let cancelHook = onEnterCancelled;
      if (!state.isMounted) {
        if (appear) {
          hook = onAppear || onEnter;
          afterHook = onAfterAppear || onAfterEnter;
          cancelHook = onAppearCancelled || onEnterCancelled;
        } else {
          return;
        }
      }
      let called = false;
      const done = el[enterCbKey] = (cancelled) => {
        if (called) return;
        called = true;
        if (cancelled) {
          callHook2(cancelHook, [el]);
        } else {
          callHook2(afterHook, [el]);
        }
        if (hooks.delayedLeave) {
          hooks.delayedLeave();
        }
        el[enterCbKey] = void 0;
      };
      if (hook) {
        callAsyncHook(hook, [el, done]);
      } else {
        done();
      }
    },
    leave(el, remove2) {
      const key2 = String(vnode.key);
      if (el[enterCbKey]) {
        el[enterCbKey](
          true
          /* cancelled */
        );
      }
      if (state.isUnmounting) {
        return remove2();
      }
      callHook2(onBeforeLeave, [el]);
      let called = false;
      const done = el[leaveCbKey] = (cancelled) => {
        if (called) return;
        called = true;
        remove2();
        if (cancelled) {
          callHook2(onLeaveCancelled, [el]);
        } else {
          callHook2(onAfterLeave, [el]);
        }
        el[leaveCbKey] = void 0;
        if (leavingVNodesCache[key2] === vnode) {
          delete leavingVNodesCache[key2];
        }
      };
      leavingVNodesCache[key2] = vnode;
      if (onLeave) {
        callAsyncHook(onLeave, [el, done]);
      } else {
        done();
      }
    },
    clone(vnode2) {
      const hooks2 = resolveTransitionHooks(
        vnode2,
        props,
        state,
        instance,
        postClone
      );
      if (postClone) postClone(hooks2);
      return hooks2;
    }
  };
  return hooks;
}
function emptyPlaceholder(vnode) {
  if (isKeepAlive(vnode)) {
    vnode = cloneVNode(vnode);
    vnode.children = null;
    return vnode;
  }
}
function getInnerChild$1(vnode) {
  if (!isKeepAlive(vnode)) {
    if (isTeleport(vnode.type) && vnode.children) {
      return findNonCommentChild(vnode.children);
    }
    return vnode;
  }
  if (vnode.component) {
    return vnode.component.subTree;
  }
  const { shapeFlag, children } = vnode;
  if (children) {
    if (shapeFlag & 16) {
      return children[0];
    }
    if (shapeFlag & 32 && isFunction$2(children.default)) {
      return children.default();
    }
  }
}
function setTransitionHooks(vnode, hooks) {
  if (vnode.shapeFlag & 6 && vnode.component) {
    vnode.transition = hooks;
    setTransitionHooks(vnode.component.subTree, hooks);
  } else if (vnode.shapeFlag & 128) {
    vnode.ssContent.transition = hooks.clone(vnode.ssContent);
    vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
  } else {
    vnode.transition = hooks;
  }
}
function getTransitionRawChildren(children, keepComment = false, parentKey) {
  let ret = [];
  let keyedFragmentCount = 0;
  for (let i2 = 0; i2 < children.length; i2++) {
    let child = children[i2];
    const key = parentKey == null ? child.key : String(parentKey) + String(child.key != null ? child.key : i2);
    if (child.type === Fragment) {
      if (child.patchFlag & 128) keyedFragmentCount++;
      ret = ret.concat(
        getTransitionRawChildren(child.children, keepComment, key)
      );
    } else if (keepComment || child.type !== Comment) {
      ret.push(key != null ? cloneVNode(child, { key }) : child);
    }
  }
  if (keyedFragmentCount > 1) {
    for (let i2 = 0; i2 < ret.length; i2++) {
      ret[i2].patchFlag = -2;
    }
  }
  return ret;
}
// @__NO_SIDE_EFFECTS__
function defineComponent(options, extraOptions) {
  return isFunction$2(options) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    /* @__PURE__ */ (() => extend$1({ name: options.name }, extraOptions, { setup: options }))()
  ) : options;
}
function markAsyncBoundary(instance) {
  instance.ids = [instance.ids[0] + instance.ids[2]++ + "-", 0, 0];
}
const pendingSetRefMap = /* @__PURE__ */ new WeakMap();
function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
  if (isArray$2(rawRef)) {
    rawRef.forEach(
      (r2, i2) => setRef(
        r2,
        oldRawRef && (isArray$2(oldRawRef) ? oldRawRef[i2] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount
      )
    );
    return;
  }
  if (isAsyncWrapper(vnode) && !isUnmount) {
    if (vnode.shapeFlag & 512 && vnode.type.__asyncResolved && vnode.component.subTree.component) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component.subTree);
    }
    return;
  }
  const refValue = vnode.shapeFlag & 4 ? getComponentPublicInstance(vnode.component) : vnode.el;
  const value = isUnmount ? null : refValue;
  const { i: owner, r: ref3 } = rawRef;
  const oldRef = oldRawRef && oldRawRef.r;
  const refs = owner.refs === EMPTY_OBJ ? owner.refs = {} : owner.refs;
  const setupState = owner.setupState;
  const rawSetupState = toRaw(setupState);
  const canSetSetupRef = setupState === EMPTY_OBJ ? NO : (key) => {
    return hasOwn(rawSetupState, key);
  };
  if (oldRef != null && oldRef !== ref3) {
    invalidatePendingSetRef(oldRawRef);
    if (isString$2(oldRef)) {
      refs[oldRef] = null;
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null;
      }
    } else if (isRef(oldRef)) {
      {
        oldRef.value = null;
      }
      const oldRawRefAtom = oldRawRef;
      if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null;
    }
  }
  if (isFunction$2(ref3)) {
    callWithErrorHandling(ref3, owner, 12, [value, refs]);
  } else {
    const _isString = isString$2(ref3);
    const _isRef = isRef(ref3);
    if (_isString || _isRef) {
      const doSet = () => {
        if (rawRef.f) {
          const existing = _isString ? canSetSetupRef(ref3) ? setupState[ref3] : refs[ref3] : ref3.value;
          if (isUnmount) {
            isArray$2(existing) && remove(existing, refValue);
          } else {
            if (!isArray$2(existing)) {
              if (_isString) {
                refs[ref3] = [refValue];
                if (canSetSetupRef(ref3)) {
                  setupState[ref3] = refs[ref3];
                }
              } else {
                const newVal = [refValue];
                {
                  ref3.value = newVal;
                }
                if (rawRef.k) refs[rawRef.k] = newVal;
              }
            } else if (!existing.includes(refValue)) {
              existing.push(refValue);
            }
          }
        } else if (_isString) {
          refs[ref3] = value;
          if (canSetSetupRef(ref3)) {
            setupState[ref3] = value;
          }
        } else if (_isRef) {
          {
            ref3.value = value;
          }
          if (rawRef.k) refs[rawRef.k] = value;
        } else ;
      };
      if (value) {
        const job = () => {
          doSet();
          pendingSetRefMap.delete(rawRef);
        };
        job.id = -1;
        pendingSetRefMap.set(rawRef, job);
        queuePostRenderEffect(job, parentSuspense);
      } else {
        invalidatePendingSetRef(rawRef);
        doSet();
      }
    }
  }
}
function invalidatePendingSetRef(rawRef) {
  const pendingSetRef = pendingSetRefMap.get(rawRef);
  if (pendingSetRef) {
    pendingSetRef.flags |= 8;
    pendingSetRefMap.delete(rawRef);
  }
}
getGlobalThis().requestIdleCallback || ((cb) => setTimeout(cb, 1));
getGlobalThis().cancelIdleCallback || ((id) => clearTimeout(id));
const isAsyncWrapper = (i2) => !!i2.type.__asyncLoader;
const isKeepAlive = (vnode) => vnode.type.__isKeepAlive;
function onActivated(hook, target) {
  registerKeepAliveHook(hook, "a", target);
}
function onDeactivated(hook, target) {
  registerKeepAliveHook(hook, "da", target);
}
function registerKeepAliveHook(hook, type2, target = currentInstance) {
  const wrappedHook = hook.__wdc || (hook.__wdc = () => {
    let current = target;
    while (current) {
      if (current.isDeactivated) {
        return;
      }
      current = current.parent;
    }
    return hook();
  });
  injectHook(type2, wrappedHook, target);
  if (target) {
    let current = target.parent;
    while (current && current.parent) {
      if (isKeepAlive(current.parent.vnode)) {
        injectToKeepAliveRoot(wrappedHook, type2, target, current);
      }
      current = current.parent;
    }
  }
}
function injectToKeepAliveRoot(hook, type2, target, keepAliveRoot) {
  const injected = injectHook(
    type2,
    hook,
    keepAliveRoot,
    true
    /* prepend */
  );
  onUnmounted(() => {
    remove(keepAliveRoot[type2], injected);
  }, target);
}
function injectHook(type2, hook, target = currentInstance, prepend = false) {
  if (target) {
    const hooks = target[type2] || (target[type2] = []);
    const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
      pauseTracking();
      const reset2 = setCurrentInstance(target);
      const res = callWithAsyncErrorHandling(hook, target, type2, args);
      reset2();
      resetTracking();
      return res;
    });
    if (prepend) {
      hooks.unshift(wrappedHook);
    } else {
      hooks.push(wrappedHook);
    }
    return wrappedHook;
  }
}
const createHook = (lifecycle) => (hook, target = currentInstance) => {
  if (!isInSSRComponentSetup || lifecycle === "sp") {
    injectHook(lifecycle, (...args) => hook(...args), target);
  }
};
const onBeforeMount = createHook("bm");
const onMounted = createHook("m");
const onBeforeUpdate = createHook(
  "bu"
);
const onUpdated = createHook("u");
const onBeforeUnmount = createHook(
  "bum"
);
const onUnmounted = createHook("um");
const onServerPrefetch = createHook(
  "sp"
);
const onRenderTriggered = createHook("rtg");
const onRenderTracked = createHook("rtc");
function onErrorCaptured(hook, target = currentInstance) {
  injectHook("ec", hook, target);
}
const COMPONENTS = "components";
const NULL_DYNAMIC_COMPONENT = /* @__PURE__ */ Symbol.for("v-ndc");
function resolveDynamicComponent(component) {
  if (isString$2(component)) {
    return resolveAsset(COMPONENTS, component, false) || component;
  } else {
    return component || NULL_DYNAMIC_COMPONENT;
  }
}
function resolveAsset(type2, name, warnMissing = true, maybeSelfReference = false) {
  const instance = currentRenderingInstance || currentInstance;
  if (instance) {
    const Component = instance.type;
    {
      const selfName = getComponentName(
        Component,
        false
      );
      if (selfName && (selfName === name || selfName === camelize(name) || selfName === capitalize(camelize(name)))) {
        return Component;
      }
    }
    const res = (
      // local registration
      // check instance[type] first which is resolved for options API
      resolve(instance[type2] || Component[type2], name) || // global registration
      resolve(instance.appContext[type2], name)
    );
    if (!res && maybeSelfReference) {
      return Component;
    }
    return res;
  }
}
function resolve(registry, name) {
  return registry && (registry[name] || registry[camelize(name)] || registry[capitalize(camelize(name))]);
}
function renderSlot(slots, name, props = {}, fallback, noSlotted) {
  if (currentRenderingInstance.ce || currentRenderingInstance.parent && isAsyncWrapper(currentRenderingInstance.parent) && currentRenderingInstance.parent.ce) {
    const hasProps = Object.keys(props).length > 0;
    if (name !== "default") props.name = name;
    return openBlock(), createBlock(
      Fragment,
      null,
      [createVNode("slot", props, fallback && fallback())],
      hasProps ? -2 : 64
    );
  }
  let slot = slots[name];
  if (slot && slot._c) {
    slot._d = false;
  }
  openBlock();
  const validSlotContent = slot && ensureValidVNode(slot(props));
  const slotKey = props.key || // slot content array of a dynamic conditional slot may have a branch
  // key attached in the `createSlots` helper, respect that
  validSlotContent && validSlotContent.key;
  const rendered = createBlock(
    Fragment,
    {
      key: (slotKey && !isSymbol$1(slotKey) ? slotKey : `_${name}`) + // #7256 force differentiate fallback content from actual content
      (!validSlotContent && fallback ? "_fb" : "")
    },
    validSlotContent || (fallback ? fallback() : []),
    validSlotContent && slots._ === 1 ? 64 : -2
  );
  if (rendered.scopeId) {
    rendered.slotScopeIds = [rendered.scopeId + "-s"];
  }
  if (slot && slot._c) {
    slot._d = true;
  }
  return rendered;
}
function ensureValidVNode(vnodes) {
  return vnodes.some((child) => {
    if (!isVNode(child)) return true;
    if (child.type === Comment) return false;
    if (child.type === Fragment && !ensureValidVNode(child.children))
      return false;
    return true;
  }) ? vnodes : null;
}
const getPublicInstance = (i2) => {
  if (!i2) return null;
  if (isStatefulComponent(i2)) return getComponentPublicInstance(i2);
  return getPublicInstance(i2.parent);
};
const publicPropertiesMap = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ extend$1(/* @__PURE__ */ Object.create(null), {
    $: (i2) => i2,
    $el: (i2) => i2.vnode.el,
    $data: (i2) => i2.data,
    $props: (i2) => i2.props,
    $attrs: (i2) => i2.attrs,
    $slots: (i2) => i2.slots,
    $refs: (i2) => i2.refs,
    $parent: (i2) => getPublicInstance(i2.parent),
    $root: (i2) => getPublicInstance(i2.root),
    $host: (i2) => i2.ce,
    $emit: (i2) => i2.emit,
    $options: (i2) => __VUE_OPTIONS_API__ ? resolveMergedOptions(i2) : i2.type,
    $forceUpdate: (i2) => i2.f || (i2.f = () => {
      queueJob(i2.update);
    }),
    $nextTick: (i2) => i2.n || (i2.n = nextTick.bind(i2.proxy)),
    $watch: (i2) => __VUE_OPTIONS_API__ ? instanceWatch.bind(i2) : NOOP
  })
);
const hasSetupBinding = (state, key) => state !== EMPTY_OBJ && !state.__isScriptSetup && hasOwn(state, key);
const PublicInstanceProxyHandlers = {
  get({ _: instance }, key) {
    if (key === "__v_skip") {
      return true;
    }
    const { ctx, setupState, data, props, accessCache, type: type2, appContext } = instance;
    if (key[0] !== "$") {
      const n2 = accessCache[key];
      if (n2 !== void 0) {
        switch (n2) {
          case 1:
            return setupState[key];
          case 2:
            return data[key];
          case 4:
            return ctx[key];
          case 3:
            return props[key];
        }
      } else if (hasSetupBinding(setupState, key)) {
        accessCache[key] = 1;
        return setupState[key];
      } else if (__VUE_OPTIONS_API__ && data !== EMPTY_OBJ && hasOwn(data, key)) {
        accessCache[key] = 2;
        return data[key];
      } else if (hasOwn(props, key)) {
        accessCache[key] = 3;
        return props[key];
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache[key] = 4;
        return ctx[key];
      } else if (!__VUE_OPTIONS_API__ || shouldCacheAccess) {
        accessCache[key] = 0;
      }
    }
    const publicGetter = publicPropertiesMap[key];
    let cssModule, globalProperties;
    if (publicGetter) {
      if (key === "$attrs") {
        track(instance.attrs, "get", "");
      }
      return publicGetter(instance);
    } else if (
      // css module (injected by vue-loader)
      (cssModule = type2.__cssModules) && (cssModule = cssModule[key])
    ) {
      return cssModule;
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      accessCache[key] = 4;
      return ctx[key];
    } else if (
      // global properties
      globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key)
    ) {
      {
        return globalProperties[key];
      }
    } else ;
  },
  set({ _: instance }, key, value) {
    const { data, setupState, ctx } = instance;
    if (hasSetupBinding(setupState, key)) {
      setupState[key] = value;
      return true;
    } else if (__VUE_OPTIONS_API__ && data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value;
      return true;
    } else if (hasOwn(instance.props, key)) {
      return false;
    }
    if (key[0] === "$" && key.slice(1) in instance) {
      return false;
    } else {
      {
        ctx[key] = value;
      }
    }
    return true;
  },
  has({
    _: { data, setupState, accessCache, ctx, appContext, props, type: type2 }
  }, key) {
    let cssModules;
    return !!(accessCache[key] || __VUE_OPTIONS_API__ && data !== EMPTY_OBJ && key[0] !== "$" && hasOwn(data, key) || hasSetupBinding(setupState, key) || hasOwn(props, key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key) || (cssModules = type2.__cssModules) && cssModules[key]);
  },
  defineProperty(target, key, descriptor) {
    if (descriptor.get != null) {
      target._.accessCache[key] = 0;
    } else if (hasOwn(descriptor, "value")) {
      this.set(target, key, descriptor.value, null);
    }
    return Reflect.defineProperty(target, key, descriptor);
  }
};
function normalizePropsOrEmits(props) {
  return isArray$2(props) ? props.reduce(
    (normalized, p2) => (normalized[p2] = null, normalized),
    {}
  ) : props;
}
let shouldCacheAccess = true;
function applyOptions(instance) {
  const options = resolveMergedOptions(instance);
  const publicThis = instance.proxy;
  const ctx = instance.ctx;
  shouldCacheAccess = false;
  if (options.beforeCreate) {
    callHook$1(options.beforeCreate, instance, "bc");
  }
  const {
    // state
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // lifecycle
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    activated,
    deactivated,
    beforeDestroy,
    beforeUnmount,
    destroyed,
    unmounted,
    render: render2,
    renderTracked,
    renderTriggered,
    errorCaptured,
    serverPrefetch,
    // public API
    expose,
    inheritAttrs,
    // assets
    components,
    directives,
    filters
  } = options;
  const checkDuplicateProperties = null;
  if (injectOptions) {
    resolveInjections(injectOptions, ctx, checkDuplicateProperties);
  }
  if (methods) {
    for (const key in methods) {
      const methodHandler = methods[key];
      if (isFunction$2(methodHandler)) {
        {
          ctx[key] = methodHandler.bind(publicThis);
        }
      }
    }
  }
  if (dataOptions) {
    const data = dataOptions.call(publicThis, publicThis);
    if (!isObject$2(data)) ;
    else {
      instance.data = reactive(data);
    }
  }
  shouldCacheAccess = true;
  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = computedOptions[key];
      const get2 = isFunction$2(opt) ? opt.bind(publicThis, publicThis) : isFunction$2(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP;
      const set = !isFunction$2(opt) && isFunction$2(opt.set) ? opt.set.bind(publicThis) : NOOP;
      const c2 = computed({
        get: get2,
        set
      });
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => c2.value,
        set: (v2) => c2.value = v2
      });
    }
  }
  if (watchOptions) {
    for (const key in watchOptions) {
      createWatcher(watchOptions[key], ctx, publicThis, key);
    }
  }
  if (provideOptions) {
    const provides = isFunction$2(provideOptions) ? provideOptions.call(publicThis) : provideOptions;
    Reflect.ownKeys(provides).forEach((key) => {
      provide(key, provides[key]);
    });
  }
  if (created) {
    callHook$1(created, instance, "c");
  }
  function registerLifecycleHook(register, hook) {
    if (isArray$2(hook)) {
      hook.forEach((_hook) => register(_hook.bind(publicThis)));
    } else if (hook) {
      register(hook.bind(publicThis));
    }
  }
  registerLifecycleHook(onBeforeMount, beforeMount);
  registerLifecycleHook(onMounted, mounted);
  registerLifecycleHook(onBeforeUpdate, beforeUpdate);
  registerLifecycleHook(onUpdated, updated);
  registerLifecycleHook(onActivated, activated);
  registerLifecycleHook(onDeactivated, deactivated);
  registerLifecycleHook(onErrorCaptured, errorCaptured);
  registerLifecycleHook(onRenderTracked, renderTracked);
  registerLifecycleHook(onRenderTriggered, renderTriggered);
  registerLifecycleHook(onBeforeUnmount, beforeUnmount);
  registerLifecycleHook(onUnmounted, unmounted);
  registerLifecycleHook(onServerPrefetch, serverPrefetch);
  if (isArray$2(expose)) {
    if (expose.length) {
      const exposed = instance.exposed || (instance.exposed = {});
      expose.forEach((key) => {
        Object.defineProperty(exposed, key, {
          get: () => publicThis[key],
          set: (val) => publicThis[key] = val,
          enumerable: true
        });
      });
    } else if (!instance.exposed) {
      instance.exposed = {};
    }
  }
  if (render2 && instance.render === NOOP) {
    instance.render = render2;
  }
  if (inheritAttrs != null) {
    instance.inheritAttrs = inheritAttrs;
  }
  if (components) instance.components = components;
  if (directives) instance.directives = directives;
  if (serverPrefetch) {
    markAsyncBoundary(instance);
  }
}
function resolveInjections(injectOptions, ctx, checkDuplicateProperties = NOOP) {
  if (isArray$2(injectOptions)) {
    injectOptions = normalizeInject(injectOptions);
  }
  for (const key in injectOptions) {
    const opt = injectOptions[key];
    let injected;
    if (isObject$2(opt)) {
      if ("default" in opt) {
        injected = inject(
          opt.from || key,
          opt.default,
          true
        );
      } else {
        injected = inject(opt.from || key);
      }
    } else {
      injected = inject(opt);
    }
    if (isRef(injected)) {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => injected.value,
        set: (v2) => injected.value = v2
      });
    } else {
      ctx[key] = injected;
    }
  }
}
function callHook$1(hook, instance, type2) {
  callWithAsyncErrorHandling(
    isArray$2(hook) ? hook.map((h2) => h2.bind(instance.proxy)) : hook.bind(instance.proxy),
    instance,
    type2
  );
}
function createWatcher(raw, ctx, publicThis, key) {
  let getter = key.includes(".") ? createPathGetter(publicThis, key) : () => publicThis[key];
  if (isString$2(raw)) {
    const handler = ctx[raw];
    if (isFunction$2(handler)) {
      {
        watch(getter, handler);
      }
    }
  } else if (isFunction$2(raw)) {
    {
      watch(getter, raw.bind(publicThis));
    }
  } else if (isObject$2(raw)) {
    if (isArray$2(raw)) {
      raw.forEach((r2) => createWatcher(r2, ctx, publicThis, key));
    } else {
      const handler = isFunction$2(raw.handler) ? raw.handler.bind(publicThis) : ctx[raw.handler];
      if (isFunction$2(handler)) {
        watch(getter, handler, raw);
      }
    }
  } else ;
}
function resolveMergedOptions(instance) {
  const base = instance.type;
  const { mixins, extends: extendsOptions } = base;
  const {
    mixins: globalMixins,
    optionsCache: cache,
    config: { optionMergeStrategies }
  } = instance.appContext;
  const cached = cache.get(base);
  let resolved;
  if (cached) {
    resolved = cached;
  } else if (!globalMixins.length && !mixins && !extendsOptions) {
    {
      resolved = base;
    }
  } else {
    resolved = {};
    if (globalMixins.length) {
      globalMixins.forEach(
        (m2) => mergeOptions(resolved, m2, optionMergeStrategies, true)
      );
    }
    mergeOptions(resolved, base, optionMergeStrategies);
  }
  if (isObject$2(base)) {
    cache.set(base, resolved);
  }
  return resolved;
}
function mergeOptions(to, from, strats, asMixin = false) {
  const { mixins, extends: extendsOptions } = from;
  if (extendsOptions) {
    mergeOptions(to, extendsOptions, strats, true);
  }
  if (mixins) {
    mixins.forEach(
      (m2) => mergeOptions(to, m2, strats, true)
    );
  }
  for (const key in from) {
    if (asMixin && key === "expose") ;
    else {
      const strat = internalOptionMergeStrats[key] || strats && strats[key];
      to[key] = strat ? strat(to[key], from[key]) : from[key];
    }
  }
  return to;
}
const internalOptionMergeStrats = {
  data: mergeDataFn,
  props: mergeEmitsOrPropsOptions,
  emits: mergeEmitsOrPropsOptions,
  // objects
  methods: mergeObjectOptions,
  computed: mergeObjectOptions,
  // lifecycle
  beforeCreate: mergeAsArray,
  created: mergeAsArray,
  beforeMount: mergeAsArray,
  mounted: mergeAsArray,
  beforeUpdate: mergeAsArray,
  updated: mergeAsArray,
  beforeDestroy: mergeAsArray,
  beforeUnmount: mergeAsArray,
  destroyed: mergeAsArray,
  unmounted: mergeAsArray,
  activated: mergeAsArray,
  deactivated: mergeAsArray,
  errorCaptured: mergeAsArray,
  serverPrefetch: mergeAsArray,
  // assets
  components: mergeObjectOptions,
  directives: mergeObjectOptions,
  // watch
  watch: mergeWatchOptions,
  // provide / inject
  provide: mergeDataFn,
  inject: mergeInject
};
function mergeDataFn(to, from) {
  if (!from) {
    return to;
  }
  if (!to) {
    return from;
  }
  return function mergedDataFn() {
    return extend$1(
      isFunction$2(to) ? to.call(this, this) : to,
      isFunction$2(from) ? from.call(this, this) : from
    );
  };
}
function mergeInject(to, from) {
  return mergeObjectOptions(normalizeInject(to), normalizeInject(from));
}
function normalizeInject(raw) {
  if (isArray$2(raw)) {
    const res = {};
    for (let i2 = 0; i2 < raw.length; i2++) {
      res[raw[i2]] = raw[i2];
    }
    return res;
  }
  return raw;
}
function mergeAsArray(to, from) {
  return to ? [...new Set([].concat(to, from))] : from;
}
function mergeObjectOptions(to, from) {
  return to ? extend$1(/* @__PURE__ */ Object.create(null), to, from) : from;
}
function mergeEmitsOrPropsOptions(to, from) {
  if (to) {
    if (isArray$2(to) && isArray$2(from)) {
      return [.../* @__PURE__ */ new Set([...to, ...from])];
    }
    return extend$1(
      /* @__PURE__ */ Object.create(null),
      normalizePropsOrEmits(to),
      normalizePropsOrEmits(from != null ? from : {})
    );
  } else {
    return from;
  }
}
function mergeWatchOptions(to, from) {
  if (!to) return from;
  if (!from) return to;
  const merged = extend$1(/* @__PURE__ */ Object.create(null), to);
  for (const key in from) {
    merged[key] = mergeAsArray(to[key], from[key]);
  }
  return merged;
}
function createAppContext() {
  return {
    app: null,
    config: {
      isNativeTag: NO,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let uid$1 = 0;
function createAppAPI(render2, hydrate) {
  return function createApp2(rootComponent, rootProps = null) {
    if (!isFunction$2(rootComponent)) {
      rootComponent = extend$1({}, rootComponent);
    }
    if (rootProps != null && !isObject$2(rootProps)) {
      rootProps = null;
    }
    const context = createAppContext();
    const installedPlugins = /* @__PURE__ */ new WeakSet();
    const pluginCleanupFns = [];
    let isMounted = false;
    const app = context.app = {
      _uid: uid$1++,
      _component: rootComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      _instance: null,
      version,
      get config() {
        return context.config;
      },
      set config(v2) {
      },
      use(plugin, ...options) {
        if (installedPlugins.has(plugin)) ;
        else if (plugin && isFunction$2(plugin.install)) {
          installedPlugins.add(plugin);
          plugin.install(app, ...options);
        } else if (isFunction$2(plugin)) {
          installedPlugins.add(plugin);
          plugin(app, ...options);
        } else ;
        return app;
      },
      mixin(mixin) {
        if (__VUE_OPTIONS_API__) {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin);
          }
        }
        return app;
      },
      component(name, component) {
        if (!component) {
          return context.components[name];
        }
        context.components[name] = component;
        return app;
      },
      directive(name, directive) {
        if (!directive) {
          return context.directives[name];
        }
        context.directives[name] = directive;
        return app;
      },
      mount(rootContainer, isHydrate, namespace2) {
        if (!isMounted) {
          const vnode = app._ceVNode || createVNode(rootComponent, rootProps);
          vnode.appContext = context;
          if (namespace2 === true) {
            namespace2 = "svg";
          } else if (namespace2 === false) {
            namespace2 = void 0;
          }
          {
            render2(vnode, rootContainer, namespace2);
          }
          isMounted = true;
          app._container = rootContainer;
          rootContainer.__vue_app__ = app;
          if (__VUE_PROD_DEVTOOLS__) {
            app._instance = vnode.component;
            devtoolsInitApp(app, version);
          }
          return getComponentPublicInstance(vnode.component);
        }
      },
      onUnmount(cleanupFn) {
        pluginCleanupFns.push(cleanupFn);
      },
      unmount() {
        if (isMounted) {
          callWithAsyncErrorHandling(
            pluginCleanupFns,
            app._instance,
            16
          );
          render2(null, app._container);
          if (__VUE_PROD_DEVTOOLS__) {
            app._instance = null;
            devtoolsUnmountApp(app);
          }
          delete app._container.__vue_app__;
        }
      },
      provide(key, value) {
        context.provides[key] = value;
        return app;
      },
      runWithContext(fn) {
        const lastApp = currentApp;
        currentApp = app;
        try {
          return fn();
        } finally {
          currentApp = lastApp;
        }
      }
    };
    return app;
  };
}
let currentApp = null;
const getModelModifiers = (props, modelName) => {
  return modelName === "modelValue" || modelName === "model-value" ? props.modelModifiers : props[`${modelName}Modifiers`] || props[`${camelize(modelName)}Modifiers`] || props[`${hyphenate(modelName)}Modifiers`];
};
function emit(instance, event2, ...rawArgs) {
  if (instance.isUnmounted) return;
  const props = instance.vnode.props || EMPTY_OBJ;
  let args = rawArgs;
  const isModelListener2 = event2.startsWith("update:");
  const modifiers = isModelListener2 && getModelModifiers(props, event2.slice(7));
  if (modifiers) {
    if (modifiers.trim) {
      args = rawArgs.map((a2) => isString$2(a2) ? a2.trim() : a2);
    }
    if (modifiers.number) {
      args = rawArgs.map(looseToNumber);
    }
  }
  if (__VUE_PROD_DEVTOOLS__) {
    devtoolsComponentEmit(instance, event2, args);
  }
  let handlerName;
  let handler = props[handlerName = toHandlerKey(event2)] || // also try camelCase event handler (#2249)
  props[handlerName = toHandlerKey(camelize(event2))];
  if (!handler && isModelListener2) {
    handler = props[handlerName = toHandlerKey(hyphenate(event2))];
  }
  if (handler) {
    callWithAsyncErrorHandling(
      handler,
      instance,
      6,
      args
    );
  }
  const onceHandler = props[handlerName + `Once`];
  if (onceHandler) {
    if (!instance.emitted) {
      instance.emitted = {};
    } else if (instance.emitted[handlerName]) {
      return;
    }
    instance.emitted[handlerName] = true;
    callWithAsyncErrorHandling(
      onceHandler,
      instance,
      6,
      args
    );
  }
}
const mixinEmitsCache = /* @__PURE__ */ new WeakMap();
function normalizeEmitsOptions(comp, appContext, asMixin = false) {
  const cache = __VUE_OPTIONS_API__ && asMixin ? mixinEmitsCache : appContext.emitsCache;
  const cached = cache.get(comp);
  if (cached !== void 0) {
    return cached;
  }
  const raw = comp.emits;
  let normalized = {};
  let hasExtends = false;
  if (__VUE_OPTIONS_API__ && !isFunction$2(comp)) {
    const extendEmits = (raw2) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw2, appContext, true);
      if (normalizedFromExtend) {
        hasExtends = true;
        extend$1(normalized, normalizedFromExtend);
      }
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits);
    }
    if (comp.extends) {
      extendEmits(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject$2(comp)) {
      cache.set(comp, null);
    }
    return null;
  }
  if (isArray$2(raw)) {
    raw.forEach((key) => normalized[key] = null);
  } else {
    extend$1(normalized, raw);
  }
  if (isObject$2(comp)) {
    cache.set(comp, normalized);
  }
  return normalized;
}
function isEmitListener(options, key) {
  if (!options || !isOn(key)) {
    return false;
  }
  key = key.slice(2).replace(/Once$/, "");
  return hasOwn(options, key[0].toLowerCase() + key.slice(1)) || hasOwn(options, hyphenate(key)) || hasOwn(options, key);
}
function markAttrsAccessed() {
}
function renderComponentRoot(instance) {
  const {
    type: Component,
    vnode,
    proxy,
    withProxy,
    propsOptions: [propsOptions],
    slots,
    attrs,
    emit: emit22,
    render: render2,
    renderCache,
    props,
    data,
    setupState,
    ctx,
    inheritAttrs
  } = instance;
  const prev = setCurrentRenderingInstance(instance);
  let result;
  let fallthroughAttrs;
  try {
    if (vnode.shapeFlag & 4) {
      const proxyToUse = withProxy || proxy;
      const thisProxy = false ? new Proxy(proxyToUse, {
        get(target, key, receiver) {
          warn$1(
            `Property '${String(
              key
            )}' was accessed via 'this'. Avoid using 'this' in templates.`
          );
          return Reflect.get(target, key, receiver);
        }
      }) : proxyToUse;
      result = normalizeVNode(
        render2.call(
          thisProxy,
          proxyToUse,
          renderCache,
          false ? shallowReadonly(props) : props,
          setupState,
          data,
          ctx
        )
      );
      fallthroughAttrs = attrs;
    } else {
      const render22 = Component;
      if (false) ;
      result = normalizeVNode(
        render22.length > 1 ? render22(
          false ? shallowReadonly(props) : props,
          false ? {
            get attrs() {
              markAttrsAccessed();
              return shallowReadonly(attrs);
            },
            slots,
            emit: emit22
          } : { attrs, slots, emit: emit22 }
        ) : render22(
          false ? shallowReadonly(props) : props,
          null
        )
      );
      fallthroughAttrs = Component.props ? attrs : getFunctionalFallthrough(attrs);
    }
  } catch (err) {
    blockStack.length = 0;
    handleError(err, instance, 1);
    result = createVNode(Comment);
  }
  let root2 = result;
  if (fallthroughAttrs && inheritAttrs !== false) {
    const keys = Object.keys(fallthroughAttrs);
    const { shapeFlag } = root2;
    if (keys.length) {
      if (shapeFlag & (1 | 6)) {
        if (propsOptions && keys.some(isModelListener)) {
          fallthroughAttrs = filterModelListeners(
            fallthroughAttrs,
            propsOptions
          );
        }
        root2 = cloneVNode(root2, fallthroughAttrs, false, true);
      }
    }
  }
  if (vnode.dirs) {
    root2 = cloneVNode(root2, null, false, true);
    root2.dirs = root2.dirs ? root2.dirs.concat(vnode.dirs) : vnode.dirs;
  }
  if (vnode.transition) {
    setTransitionHooks(root2, vnode.transition);
  }
  {
    result = root2;
  }
  setCurrentRenderingInstance(prev);
  return result;
}
const getFunctionalFallthrough = (attrs) => {
  let res;
  for (const key in attrs) {
    if (key === "class" || key === "style" || isOn(key)) {
      (res || (res = {}))[key] = attrs[key];
    }
  }
  return res;
};
const filterModelListeners = (attrs, props) => {
  const res = {};
  for (const key in attrs) {
    if (!isModelListener(key) || !(key.slice(9) in props)) {
      res[key] = attrs[key];
    }
  }
  return res;
};
function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
  const { props: prevProps, children: prevChildren, component } = prevVNode;
  const { props: nextProps, children: nextChildren, patchFlag } = nextVNode;
  const emits = component.emitsOptions;
  if (nextVNode.dirs || nextVNode.transition) {
    return true;
  }
  if (optimized && patchFlag >= 0) {
    if (patchFlag & 1024) {
      return true;
    }
    if (patchFlag & 16) {
      if (!prevProps) {
        return !!nextProps;
      }
      return hasPropsChanged(prevProps, nextProps, emits);
    } else if (patchFlag & 8) {
      const dynamicProps = nextVNode.dynamicProps;
      for (let i2 = 0; i2 < dynamicProps.length; i2++) {
        const key = dynamicProps[i2];
        if (nextProps[key] !== prevProps[key] && !isEmitListener(emits, key)) {
          return true;
        }
      }
    }
  } else {
    if (prevChildren || nextChildren) {
      if (!nextChildren || !nextChildren.$stable) {
        return true;
      }
    }
    if (prevProps === nextProps) {
      return false;
    }
    if (!prevProps) {
      return !!nextProps;
    }
    if (!nextProps) {
      return true;
    }
    return hasPropsChanged(prevProps, nextProps, emits);
  }
  return false;
}
function hasPropsChanged(prevProps, nextProps, emitsOptions) {
  const nextKeys = Object.keys(nextProps);
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }
  for (let i2 = 0; i2 < nextKeys.length; i2++) {
    const key = nextKeys[i2];
    if (nextProps[key] !== prevProps[key] && !isEmitListener(emitsOptions, key)) {
      return true;
    }
  }
  return false;
}
function updateHOCHostEl({ vnode, parent }, el) {
  while (parent) {
    const root2 = parent.subTree;
    if (root2.suspense && root2.suspense.activeBranch === vnode) {
      root2.el = vnode.el;
    }
    if (root2 === vnode) {
      (vnode = parent.vnode).el = el;
      parent = parent.parent;
    } else {
      break;
    }
  }
}
const internalObjectProto = {};
const createInternalObject = () => Object.create(internalObjectProto);
const isInternalObject = (obj) => Object.getPrototypeOf(obj) === internalObjectProto;
function initProps(instance, rawProps, isStateful, isSSR = false) {
  const props = {};
  const attrs = createInternalObject();
  instance.propsDefaults = /* @__PURE__ */ Object.create(null);
  setFullProps(instance, rawProps, props, attrs);
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      props[key] = void 0;
    }
  }
  if (isStateful) {
    instance.props = isSSR ? props : shallowReactive(props);
  } else {
    if (!instance.type.props) {
      instance.props = attrs;
    } else {
      instance.props = props;
    }
  }
  instance.attrs = attrs;
}
function updateProps(instance, rawProps, rawPrevProps, optimized) {
  const {
    props,
    attrs,
    vnode: { patchFlag }
  } = instance;
  const rawCurrentProps = toRaw(props);
  const [options] = instance.propsOptions;
  let hasAttrsChanged = false;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (optimized || patchFlag > 0) && !(patchFlag & 16)
  ) {
    if (patchFlag & 8) {
      const propsToUpdate = instance.vnode.dynamicProps;
      for (let i2 = 0; i2 < propsToUpdate.length; i2++) {
        let key = propsToUpdate[i2];
        if (isEmitListener(instance.emitsOptions, key)) {
          continue;
        }
        const value = rawProps[key];
        if (options) {
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value;
              hasAttrsChanged = true;
            }
          } else {
            const camelizedKey = camelize(key);
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false
            );
          }
        } else {
          if (value !== attrs[key]) {
            attrs[key] = value;
            hasAttrsChanged = true;
          }
        }
      }
    }
  } else {
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true;
    }
    let kebabKey;
    for (const key in rawCurrentProps) {
      if (!rawProps || // for camelCase
      !hasOwn(rawProps, key) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) {
        if (options) {
          if (rawPrevProps && // for camelCase
          (rawPrevProps[key] !== void 0 || // for kebab-case
          rawPrevProps[kebabKey] !== void 0)) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              void 0,
              instance,
              true
            );
          }
        } else {
          delete props[key];
        }
      }
    }
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (!rawProps || !hasOwn(rawProps, key) && true) {
          delete attrs[key];
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (hasAttrsChanged) {
    trigger(instance.attrs, "set", "");
  }
}
function setFullProps(instance, rawProps, props, attrs) {
  const [options, needCastKeys] = instance.propsOptions;
  let hasAttrsChanged = false;
  let rawCastValues;
  if (rawProps) {
    for (let key in rawProps) {
      if (isReservedProp(key)) {
        continue;
      }
      const value = rawProps[key];
      let camelKey;
      if (options && hasOwn(options, camelKey = camelize(key))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          props[camelKey] = value;
        } else {
          (rawCastValues || (rawCastValues = {}))[camelKey] = value;
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value;
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (needCastKeys) {
    const rawCurrentProps = toRaw(props);
    const castValues = rawCastValues || EMPTY_OBJ;
    for (let i2 = 0; i2 < needCastKeys.length; i2++) {
      const key = needCastKeys[i2];
      props[key] = resolvePropValue(
        options,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        !hasOwn(castValues, key)
      );
    }
  }
  return hasAttrsChanged;
}
function resolvePropValue(options, props, key, value, instance, isAbsent) {
  const opt = options[key];
  if (opt != null) {
    const hasDefault = hasOwn(opt, "default");
    if (hasDefault && value === void 0) {
      const defaultValue = opt.default;
      if (opt.type !== Function && !opt.skipFactory && isFunction$2(defaultValue)) {
        const { propsDefaults } = instance;
        if (key in propsDefaults) {
          value = propsDefaults[key];
        } else {
          const reset2 = setCurrentInstance(instance);
          value = propsDefaults[key] = defaultValue.call(
            null,
            props
          );
          reset2();
        }
      } else {
        value = defaultValue;
      }
      if (instance.ce) {
        instance.ce._setProp(key, value);
      }
    }
    if (opt[
      0
      /* shouldCast */
    ]) {
      if (isAbsent && !hasDefault) {
        value = false;
      } else if (opt[
        1
        /* shouldCastTrue */
      ] && (value === "" || value === hyphenate(key))) {
        value = true;
      }
    }
  }
  return value;
}
const mixinPropsCache = /* @__PURE__ */ new WeakMap();
function normalizePropsOptions(comp, appContext, asMixin = false) {
  const cache = __VUE_OPTIONS_API__ && asMixin ? mixinPropsCache : appContext.propsCache;
  const cached = cache.get(comp);
  if (cached) {
    return cached;
  }
  const raw = comp.props;
  const normalized = {};
  const needCastKeys = [];
  let hasExtends = false;
  if (__VUE_OPTIONS_API__ && !isFunction$2(comp)) {
    const extendProps = (raw2) => {
      hasExtends = true;
      const [props, keys] = normalizePropsOptions(raw2, appContext, true);
      extend$1(normalized, props);
      if (keys) needCastKeys.push(...keys);
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps);
    }
    if (comp.extends) {
      extendProps(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject$2(comp)) {
      cache.set(comp, EMPTY_ARR);
    }
    return EMPTY_ARR;
  }
  if (isArray$2(raw)) {
    for (let i2 = 0; i2 < raw.length; i2++) {
      const normalizedKey = camelize(raw[i2]);
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ;
      }
    }
  } else if (raw) {
    for (const key in raw) {
      const normalizedKey = camelize(key);
      if (validatePropName(normalizedKey)) {
        const opt = raw[key];
        const prop = normalized[normalizedKey] = isArray$2(opt) || isFunction$2(opt) ? { type: opt } : extend$1({}, opt);
        const propType = prop.type;
        let shouldCast = false;
        let shouldCastTrue = true;
        if (isArray$2(propType)) {
          for (let index = 0; index < propType.length; ++index) {
            const type2 = propType[index];
            const typeName = isFunction$2(type2) && type2.name;
            if (typeName === "Boolean") {
              shouldCast = true;
              break;
            } else if (typeName === "String") {
              shouldCastTrue = false;
            }
          }
        } else {
          shouldCast = isFunction$2(propType) && propType.name === "Boolean";
        }
        prop[
          0
          /* shouldCast */
        ] = shouldCast;
        prop[
          1
          /* shouldCastTrue */
        ] = shouldCastTrue;
        if (shouldCast || hasOwn(prop, "default")) {
          needCastKeys.push(normalizedKey);
        }
      }
    }
  }
  const res = [normalized, needCastKeys];
  if (isObject$2(comp)) {
    cache.set(comp, res);
  }
  return res;
}
function validatePropName(key) {
  if (key[0] !== "$" && !isReservedProp(key)) {
    return true;
  }
  return false;
}
const isInternalKey = (key) => key === "_" || key === "_ctx" || key === "$stable";
const normalizeSlotValue = (value) => isArray$2(value) ? value.map(normalizeVNode) : [normalizeVNode(value)];
const normalizeSlot = (key, rawSlot, ctx) => {
  if (rawSlot._n) {
    return rawSlot;
  }
  const normalized = withCtx((...args) => {
    if (false) ;
    return normalizeSlotValue(rawSlot(...args));
  }, ctx);
  normalized._c = false;
  return normalized;
};
const normalizeObjectSlots = (rawSlots, slots, instance) => {
  const ctx = rawSlots._ctx;
  for (const key in rawSlots) {
    if (isInternalKey(key)) continue;
    const value = rawSlots[key];
    if (isFunction$2(value)) {
      slots[key] = normalizeSlot(key, value, ctx);
    } else if (value != null) {
      const normalized = normalizeSlotValue(value);
      slots[key] = () => normalized;
    }
  }
};
const normalizeVNodeSlots = (instance, children) => {
  const normalized = normalizeSlotValue(children);
  instance.slots.default = () => normalized;
};
const assignSlots = (slots, children, optimized) => {
  for (const key in children) {
    if (optimized || !isInternalKey(key)) {
      slots[key] = children[key];
    }
  }
};
const initSlots = (instance, children, optimized) => {
  const slots = instance.slots = createInternalObject();
  if (instance.vnode.shapeFlag & 32) {
    const type2 = children._;
    if (type2) {
      assignSlots(slots, children, optimized);
      if (optimized) {
        def(slots, "_", type2, true);
      }
    } else {
      normalizeObjectSlots(children, slots);
    }
  } else if (children) {
    normalizeVNodeSlots(instance, children);
  }
};
const updateSlots = (instance, children, optimized) => {
  const { vnode, slots } = instance;
  let needDeletionCheck = true;
  let deletionComparisonTarget = EMPTY_OBJ;
  if (vnode.shapeFlag & 32) {
    const type2 = children._;
    if (type2) {
      if (optimized && type2 === 1) {
        needDeletionCheck = false;
      } else {
        assignSlots(slots, children, optimized);
      }
    } else {
      needDeletionCheck = !children.$stable;
      normalizeObjectSlots(children, slots);
    }
    deletionComparisonTarget = children;
  } else if (children) {
    normalizeVNodeSlots(instance, children);
    deletionComparisonTarget = { default: 1 };
  }
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key];
      }
    }
  }
};
function initFeatureFlags() {
  if (typeof __VUE_OPTIONS_API__ !== "boolean") {
    getGlobalThis().__VUE_OPTIONS_API__ = true;
  }
  if (typeof __VUE_PROD_DEVTOOLS__ !== "boolean") {
    getGlobalThis().__VUE_PROD_DEVTOOLS__ = false;
  }
  if (typeof __VUE_PROD_HYDRATION_MISMATCH_DETAILS__ !== "boolean") {
    getGlobalThis().__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false;
  }
}
const queuePostRenderEffect = queueEffectWithSuspense;
function createRenderer(options) {
  return baseCreateRenderer(options);
}
function baseCreateRenderer(options, createHydrationFns) {
  {
    initFeatureFlags();
  }
  const target = getGlobalThis();
  target.__VUE__ = true;
  if (__VUE_PROD_DEVTOOLS__) {
    setDevtoolsHook$1(target.__VUE_DEVTOOLS_GLOBAL_HOOK__, target);
  }
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    insertStaticContent: hostInsertStaticContent
  } = options;
  const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, namespace2 = void 0, slotScopeIds = null, optimized = !!n2.dynamicChildren) => {
    if (n1 === n2) {
      return;
    }
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1);
      unmount(n1, parentComponent, parentSuspense, true);
      n1 = null;
    }
    if (n2.patchFlag === -2) {
      optimized = false;
      n2.dynamicChildren = null;
    }
    const { type: type2, ref: ref3, shapeFlag } = n2;
    switch (type2) {
      case Text:
        processText(n1, n2, container, anchor);
        break;
      case Comment:
        processCommentNode(n1, n2, container, anchor);
        break;
      case Static:
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, namespace2);
        }
        break;
      case Fragment:
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace2,
          slotScopeIds,
          optimized
        );
        break;
      default:
        if (shapeFlag & 1) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace2,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 6) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace2,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 64) {
          type2.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace2,
            slotScopeIds,
            optimized,
            internals
          );
        } else if (shapeFlag & 128) {
          type2.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace2,
            slotScopeIds,
            optimized,
            internals
          );
        } else ;
    }
    if (ref3 != null && parentComponent) {
      setRef(ref3, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
    } else if (ref3 == null && n1 && n1.ref != null) {
      setRef(n1.ref, null, parentSuspense, n1, true);
    }
  };
  const processText = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateText(n2.children),
        container,
        anchor
      );
    } else {
      const el = n2.el = n1.el;
      if (n2.children !== n1.children) {
        {
          hostSetText(el, n2.children);
        }
      }
    }
  };
  const processCommentNode = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateComment(n2.children || ""),
        container,
        anchor
      );
    } else {
      n2.el = n1.el;
    }
  };
  const mountStaticNode = (n2, container, anchor, namespace2) => {
    [n2.el, n2.anchor] = hostInsertStaticContent(
      n2.children,
      container,
      anchor,
      namespace2,
      n2.el,
      n2.anchor
    );
  };
  const moveStaticNode = ({ el, anchor }, container, nextSibling) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostInsert(el, container, nextSibling);
      el = next;
    }
    hostInsert(anchor, container, nextSibling);
  };
  const removeStaticNode = ({ el, anchor }) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostRemove(el);
      el = next;
    }
    hostRemove(anchor);
  };
  const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace2, slotScopeIds, optimized) => {
    if (n2.type === "svg") {
      namespace2 = "svg";
    } else if (n2.type === "math") {
      namespace2 = "mathml";
    }
    if (n1 == null) {
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace2,
        slotScopeIds,
        optimized
      );
    } else {
      const customElement = !!(n1.el && n1.el._isVueCE) ? n1.el : null;
      try {
        if (customElement) {
          customElement._beginPatch();
        }
        patchElement(
          n1,
          n2,
          parentComponent,
          parentSuspense,
          namespace2,
          slotScopeIds,
          optimized
        );
      } finally {
        if (customElement) {
          customElement._endPatch();
        }
      }
    }
  };
  const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, namespace2, slotScopeIds, optimized) => {
    let el;
    let vnodeHook;
    const { props, shapeFlag, transition, dirs } = vnode;
    el = vnode.el = hostCreateElement(
      vnode.type,
      namespace2,
      props && props.is,
      props
    );
    if (shapeFlag & 8) {
      hostSetElementText(el, vnode.children);
    } else if (shapeFlag & 16) {
      mountChildren(
        vnode.children,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(vnode, namespace2),
        slotScopeIds,
        optimized
      );
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "created");
    }
    setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
    if (props) {
      for (const key in props) {
        if (key !== "value" && !isReservedProp(key)) {
          hostPatchProp(el, key, null, props[key], namespace2, parentComponent);
        }
      }
      if ("value" in props) {
        hostPatchProp(el, "value", null, props.value, namespace2);
      }
      if (vnodeHook = props.onVnodeBeforeMount) {
        invokeVNodeHook(vnodeHook, parentComponent, vnode);
      }
    }
    if (__VUE_PROD_DEVTOOLS__) {
      def(el, "__vnode", vnode, true);
      def(el, "__vueParentComponent", parentComponent, true);
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "beforeMount");
    }
    const needCallTransitionHooks = needTransition(parentSuspense, transition);
    if (needCallTransitionHooks) {
      transition.beforeEnter(el);
    }
    hostInsert(el, container, anchor);
    if ((vnodeHook = props && props.onVnodeMounted) || needCallTransitionHooks || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        needCallTransitionHooks && transition.enter(el);
        dirs && invokeDirectiveHook(vnode, null, parentComponent, "mounted");
      }, parentSuspense);
    }
  };
  const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
    if (scopeId) {
      hostSetScopeId(el, scopeId);
    }
    if (slotScopeIds) {
      for (let i2 = 0; i2 < slotScopeIds.length; i2++) {
        hostSetScopeId(el, slotScopeIds[i2]);
      }
    }
    if (parentComponent) {
      let subTree = parentComponent.subTree;
      if (vnode === subTree || isSuspense(subTree.type) && (subTree.ssContent === vnode || subTree.ssFallback === vnode)) {
        const parentVNode = parentComponent.vnode;
        setScopeId(
          el,
          parentVNode,
          parentVNode.scopeId,
          parentVNode.slotScopeIds,
          parentComponent.parent
        );
      }
    }
  };
  const mountChildren = (children, container, anchor, parentComponent, parentSuspense, namespace2, slotScopeIds, optimized, start2 = 0) => {
    for (let i2 = start2; i2 < children.length; i2++) {
      const child = children[i2] = optimized ? cloneIfMounted(children[i2]) : normalizeVNode(children[i2]);
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace2,
        slotScopeIds,
        optimized
      );
    }
  };
  const patchElement = (n1, n2, parentComponent, parentSuspense, namespace2, slotScopeIds, optimized) => {
    const el = n2.el = n1.el;
    if (__VUE_PROD_DEVTOOLS__) {
      el.__vnode = n2;
    }
    let { patchFlag, dynamicChildren, dirs } = n2;
    patchFlag |= n1.patchFlag & 16;
    const oldProps = n1.props || EMPTY_OBJ;
    const newProps = n2.props || EMPTY_OBJ;
    let vnodeHook;
    parentComponent && toggleRecurse(parentComponent, false);
    if (vnodeHook = newProps.onVnodeBeforeUpdate) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
    }
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, "beforeUpdate");
    }
    parentComponent && toggleRecurse(parentComponent, true);
    if (oldProps.innerHTML && newProps.innerHTML == null || oldProps.textContent && newProps.textContent == null) {
      hostSetElementText(el, "");
    }
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace2),
        slotScopeIds
      );
    } else if (!optimized) {
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace2),
        slotScopeIds,
        false
      );
    }
    if (patchFlag > 0) {
      if (patchFlag & 16) {
        patchProps(el, oldProps, newProps, parentComponent, namespace2);
      } else {
        if (patchFlag & 2) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, "class", null, newProps.class, namespace2);
          }
        }
        if (patchFlag & 4) {
          hostPatchProp(el, "style", oldProps.style, newProps.style, namespace2);
        }
        if (patchFlag & 8) {
          const propsToUpdate = n2.dynamicProps;
          for (let i2 = 0; i2 < propsToUpdate.length; i2++) {
            const key = propsToUpdate[i2];
            const prev = oldProps[key];
            const next = newProps[key];
            if (next !== prev || key === "value") {
              hostPatchProp(el, key, prev, next, namespace2, parentComponent);
            }
          }
        }
      }
      if (patchFlag & 1) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children);
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      patchProps(el, oldProps, newProps, parentComponent, namespace2);
    }
    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
        dirs && invokeDirectiveHook(n2, n1, parentComponent, "updated");
      }, parentSuspense);
    }
  };
  const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, namespace2, slotScopeIds) => {
    for (let i2 = 0; i2 < newChildren.length; i2++) {
      const oldVNode = oldChildren[i2];
      const newVNode = newChildren[i2];
      const container = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        oldVNode.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (oldVNode.type === Fragment || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !isSameVNodeType(oldVNode, newVNode) || // - In the case of a component, it could contain anything.
        oldVNode.shapeFlag & (6 | 64 | 128)) ? hostParentNode(oldVNode.el) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          fallbackContainer
        )
      );
      patch(
        oldVNode,
        newVNode,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace2,
        slotScopeIds,
        true
      );
    }
  };
  const patchProps = (el, oldProps, newProps, parentComponent, namespace2) => {
    if (oldProps !== newProps) {
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              namespace2,
              parentComponent
            );
          }
        }
      }
      for (const key in newProps) {
        if (isReservedProp(key)) continue;
        const next = newProps[key];
        const prev = oldProps[key];
        if (next !== prev && key !== "value") {
          hostPatchProp(el, key, prev, next, namespace2, parentComponent);
        }
      }
      if ("value" in newProps) {
        hostPatchProp(el, "value", oldProps.value, newProps.value, namespace2);
      }
    }
  };
  const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace2, slotScopeIds, optimized) => {
    const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText("");
    const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText("");
    let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds ? slotScopeIds.concat(fragmentSlotScopeIds) : fragmentSlotScopeIds;
    }
    if (n1 == null) {
      hostInsert(fragmentStartAnchor, container, anchor);
      hostInsert(fragmentEndAnchor, container, anchor);
      mountChildren(
        // #10007
        // such fragment like `<></>` will be compiled into
        // a fragment which doesn't have a children.
        // In this case fallback to an empty array
        n2.children || [],
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        namespace2,
        slotScopeIds,
        optimized
      );
    } else {
      if (patchFlag > 0 && patchFlag & 64 && dynamicChildren && // #2715 the previous fragment could've been a BAILed one as a result
      // of renderSlot() with no valid children
      n1.dynamicChildren && n1.dynamicChildren.length === dynamicChildren.length) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          namespace2,
          slotScopeIds
        );
        if (
          // #2080 if the stable fragment has a key, it's a <template v-for> that may
          //  get moved around. Make sure all root level vnodes inherit el.
          // #2134 or if it's a component root, it may also get moved around
          // as the component is being moved.
          n2.key != null || parentComponent && n2 === parentComponent.subTree
        ) {
          traverseStaticChildren(
            n1,
            n2,
            true
            /* shallow */
          );
        }
      } else {
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          namespace2,
          slotScopeIds,
          optimized
        );
      }
    }
  };
  const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace2, slotScopeIds, optimized) => {
    n2.slotScopeIds = slotScopeIds;
    if (n1 == null) {
      if (n2.shapeFlag & 512) {
        parentComponent.ctx.activate(
          n2,
          container,
          anchor,
          namespace2,
          optimized
        );
      } else {
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace2,
          optimized
        );
      }
    } else {
      updateComponent(n1, n2, optimized);
    }
  };
  const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, namespace2, optimized) => {
    const instance = initialVNode.component = createComponentInstance(
      initialVNode,
      parentComponent,
      parentSuspense
    );
    if (isKeepAlive(initialVNode)) {
      instance.ctx.renderer = internals;
    }
    {
      setupComponent(instance, false, optimized);
    }
    if (instance.asyncDep) {
      parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect, optimized);
      if (!initialVNode.el) {
        const placeholder = instance.subTree = createVNode(Comment);
        processCommentNode(null, placeholder, container, anchor);
        initialVNode.placeholder = placeholder.el;
      }
    } else {
      setupRenderEffect(
        instance,
        initialVNode,
        container,
        anchor,
        parentSuspense,
        namespace2,
        optimized
      );
    }
  };
  const updateComponent = (n1, n2, optimized) => {
    const instance = n2.component = n1.component;
    if (shouldUpdateComponent(n1, n2, optimized)) {
      if (instance.asyncDep && !instance.asyncResolved) {
        updateComponentPreRender(instance, n2, optimized);
        return;
      } else {
        instance.next = n2;
        instance.update();
      }
    } else {
      n2.el = n1.el;
      instance.vnode = n2;
    }
  };
  const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, namespace2, optimized) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        let vnodeHook;
        const { el, props } = initialVNode;
        const { bm, m: m2, parent, root: root2, type: type2 } = instance;
        const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);
        toggleRecurse(instance, false);
        if (bm) {
          invokeArrayFns(bm);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parent, initialVNode);
        }
        toggleRecurse(instance, true);
        {
          if (root2.ce && // @ts-expect-error _def is private
          root2.ce._def.shadowRoot !== false) {
            root2.ce._injectChildStyle(type2);
          }
          const subTree = instance.subTree = renderComponentRoot(instance);
          patch(
            null,
            subTree,
            container,
            anchor,
            instance,
            parentSuspense,
            namespace2
          );
          initialVNode.el = subTree.el;
        }
        if (m2) {
          queuePostRenderEffect(m2, parentSuspense);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeMounted)) {
          const scopedInitialVNode = initialVNode;
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode),
            parentSuspense
          );
        }
        if (initialVNode.shapeFlag & 256 || parent && isAsyncWrapper(parent.vnode) && parent.vnode.shapeFlag & 256) {
          instance.a && queuePostRenderEffect(instance.a, parentSuspense);
        }
        instance.isMounted = true;
        if (__VUE_PROD_DEVTOOLS__) {
          devtoolsComponentAdded(instance);
        }
        initialVNode = container = anchor = null;
      } else {
        let { next, bu, u: u2, parent, vnode } = instance;
        {
          const nonHydratedAsyncRoot = locateNonHydratedAsyncRoot(instance);
          if (nonHydratedAsyncRoot) {
            if (next) {
              next.el = vnode.el;
              updateComponentPreRender(instance, next, optimized);
            }
            nonHydratedAsyncRoot.asyncDep.then(() => {
              if (!instance.isUnmounted) {
                componentUpdateFn();
              }
            });
            return;
          }
        }
        let originNext = next;
        let vnodeHook;
        toggleRecurse(instance, false);
        if (next) {
          next.el = vnode.el;
          updateComponentPreRender(instance, next, optimized);
        } else {
          next = vnode;
        }
        if (bu) {
          invokeArrayFns(bu);
        }
        if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) {
          invokeVNodeHook(vnodeHook, parent, next, vnode);
        }
        toggleRecurse(instance, true);
        const nextTree = renderComponentRoot(instance);
        const prevTree = instance.subTree;
        instance.subTree = nextTree;
        patch(
          prevTree,
          nextTree,
          // parent may have changed if it's in a teleport
          hostParentNode(prevTree.el),
          // anchor may have changed if it's in a fragment
          getNextHostNode(prevTree),
          instance,
          parentSuspense,
          namespace2
        );
        next.el = nextTree.el;
        if (originNext === null) {
          updateHOCHostEl(instance, nextTree.el);
        }
        if (u2) {
          queuePostRenderEffect(u2, parentSuspense);
        }
        if (vnodeHook = next.props && next.props.onVnodeUpdated) {
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, next, vnode),
            parentSuspense
          );
        }
        if (__VUE_PROD_DEVTOOLS__) {
          devtoolsComponentUpdated(instance);
        }
      }
    };
    instance.scope.on();
    const effect2 = instance.effect = new ReactiveEffect(componentUpdateFn);
    instance.scope.off();
    const update = instance.update = effect2.run.bind(effect2);
    const job = instance.job = effect2.runIfDirty.bind(effect2);
    job.i = instance;
    job.id = instance.uid;
    effect2.scheduler = () => queueJob(job);
    toggleRecurse(instance, true);
    update();
  };
  const updateComponentPreRender = (instance, nextVNode, optimized) => {
    nextVNode.component = instance;
    const prevProps = instance.vnode.props;
    instance.vnode = nextVNode;
    instance.next = null;
    updateProps(instance, nextVNode.props, prevProps, optimized);
    updateSlots(instance, nextVNode.children, optimized);
    pauseTracking();
    flushPreFlushCbs(instance);
    resetTracking();
  };
  const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace2, slotScopeIds, optimized = false) => {
    const c1 = n1 && n1.children;
    const prevShapeFlag = n1 ? n1.shapeFlag : 0;
    const c2 = n2.children;
    const { patchFlag, shapeFlag } = n2;
    if (patchFlag > 0) {
      if (patchFlag & 128) {
        patchKeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace2,
          slotScopeIds,
          optimized
        );
        return;
      } else if (patchFlag & 256) {
        patchUnkeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace2,
          slotScopeIds,
          optimized
        );
        return;
      }
    }
    if (shapeFlag & 8) {
      if (prevShapeFlag & 16) {
        unmountChildren(c1, parentComponent, parentSuspense);
      }
      if (c2 !== c1) {
        hostSetElementText(container, c2);
      }
    } else {
      if (prevShapeFlag & 16) {
        if (shapeFlag & 16) {
          patchKeyedChildren(
            c1,
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace2,
            slotScopeIds,
            optimized
          );
        } else {
          unmountChildren(c1, parentComponent, parentSuspense, true);
        }
      } else {
        if (prevShapeFlag & 8) {
          hostSetElementText(container, "");
        }
        if (shapeFlag & 16) {
          mountChildren(
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace2,
            slotScopeIds,
            optimized
          );
        }
      }
    }
  };
  const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, namespace2, slotScopeIds, optimized) => {
    c1 = c1 || EMPTY_ARR;
    c2 = c2 || EMPTY_ARR;
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);
    let i2;
    for (i2 = 0; i2 < commonLength; i2++) {
      const nextChild = c2[i2] = optimized ? cloneIfMounted(c2[i2]) : normalizeVNode(c2[i2]);
      patch(
        c1[i2],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace2,
        slotScopeIds,
        optimized
      );
    }
    if (oldLength > newLength) {
      unmountChildren(
        c1,
        parentComponent,
        parentSuspense,
        true,
        false,
        commonLength
      );
    } else {
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace2,
        slotScopeIds,
        optimized,
        commonLength
      );
    }
  };
  const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, namespace2, slotScopeIds, optimized) => {
    let i2 = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;
    while (i2 <= e1 && i2 <= e2) {
      const n1 = c1[i2];
      const n2 = c2[i2] = optimized ? cloneIfMounted(c2[i2]) : normalizeVNode(c2[i2]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace2,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      i2++;
    }
    while (i2 <= e1 && i2 <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace2,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      e1--;
      e2--;
    }
    if (i2 > e1) {
      if (i2 <= e2) {
        const nextPos = e2 + 1;
        const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
        while (i2 <= e2) {
          patch(
            null,
            c2[i2] = optimized ? cloneIfMounted(c2[i2]) : normalizeVNode(c2[i2]),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace2,
            slotScopeIds,
            optimized
          );
          i2++;
        }
      }
    } else if (i2 > e2) {
      while (i2 <= e1) {
        unmount(c1[i2], parentComponent, parentSuspense, true);
        i2++;
      }
    } else {
      const s1 = i2;
      const s2 = i2;
      const keyToNewIndexMap = /* @__PURE__ */ new Map();
      for (i2 = s2; i2 <= e2; i2++) {
        const nextChild = c2[i2] = optimized ? cloneIfMounted(c2[i2]) : normalizeVNode(c2[i2]);
        if (nextChild.key != null) {
          keyToNewIndexMap.set(nextChild.key, i2);
        }
      }
      let j2;
      let patched = 0;
      const toBePatched = e2 - s2 + 1;
      let moved = false;
      let maxNewIndexSoFar = 0;
      const newIndexToOldIndexMap = new Array(toBePatched);
      for (i2 = 0; i2 < toBePatched; i2++) newIndexToOldIndexMap[i2] = 0;
      for (i2 = s1; i2 <= e1; i2++) {
        const prevChild = c1[i2];
        if (patched >= toBePatched) {
          unmount(prevChild, parentComponent, parentSuspense, true);
          continue;
        }
        let newIndex;
        if (prevChild.key != null) {
          newIndex = keyToNewIndexMap.get(prevChild.key);
        } else {
          for (j2 = s2; j2 <= e2; j2++) {
            if (newIndexToOldIndexMap[j2 - s2] === 0 && isSameVNodeType(prevChild, c2[j2])) {
              newIndex = j2;
              break;
            }
          }
        }
        if (newIndex === void 0) {
          unmount(prevChild, parentComponent, parentSuspense, true);
        } else {
          newIndexToOldIndexMap[newIndex - s2] = i2 + 1;
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex;
          } else {
            moved = true;
          }
          patch(
            prevChild,
            c2[newIndex],
            container,
            null,
            parentComponent,
            parentSuspense,
            namespace2,
            slotScopeIds,
            optimized
          );
          patched++;
        }
      }
      const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
      j2 = increasingNewIndexSequence.length - 1;
      for (i2 = toBePatched - 1; i2 >= 0; i2--) {
        const nextIndex = s2 + i2;
        const nextChild = c2[nextIndex];
        const anchorVNode = c2[nextIndex + 1];
        const anchor = nextIndex + 1 < l2 ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          anchorVNode.el || resolveAsyncComponentPlaceholder(anchorVNode)
        ) : parentAnchor;
        if (newIndexToOldIndexMap[i2] === 0) {
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace2,
            slotScopeIds,
            optimized
          );
        } else if (moved) {
          if (j2 < 0 || i2 !== increasingNewIndexSequence[j2]) {
            move(nextChild, container, anchor, 2);
          } else {
            j2--;
          }
        }
      }
    }
  };
  const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
    const { el, type: type2, transition, children, shapeFlag } = vnode;
    if (shapeFlag & 6) {
      move(vnode.component.subTree, container, anchor, moveType);
      return;
    }
    if (shapeFlag & 128) {
      vnode.suspense.move(container, anchor, moveType);
      return;
    }
    if (shapeFlag & 64) {
      type2.move(vnode, container, anchor, internals);
      return;
    }
    if (type2 === Fragment) {
      hostInsert(el, container, anchor);
      for (let i2 = 0; i2 < children.length; i2++) {
        move(children[i2], container, anchor, moveType);
      }
      hostInsert(vnode.anchor, container, anchor);
      return;
    }
    if (type2 === Static) {
      moveStaticNode(vnode, container, anchor);
      return;
    }
    const needTransition2 = moveType !== 2 && shapeFlag & 1 && transition;
    if (needTransition2) {
      if (moveType === 0) {
        transition.beforeEnter(el);
        hostInsert(el, container, anchor);
        queuePostRenderEffect(() => transition.enter(el), parentSuspense);
      } else {
        const { leave, delayLeave, afterLeave } = transition;
        const remove22 = () => {
          if (vnode.ctx.isUnmounted) {
            hostRemove(el);
          } else {
            hostInsert(el, container, anchor);
          }
        };
        const performLeave = () => {
          if (el._isLeaving) {
            el[leaveCbKey](
              true
              /* cancelled */
            );
          }
          leave(el, () => {
            remove22();
            afterLeave && afterLeave();
          });
        };
        if (delayLeave) {
          delayLeave(el, remove22, performLeave);
        } else {
          performLeave();
        }
      }
    } else {
      hostInsert(el, container, anchor);
    }
  };
  const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false) => {
    const {
      type: type2,
      props,
      ref: ref3,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs,
      cacheIndex
    } = vnode;
    if (patchFlag === -2) {
      optimized = false;
    }
    if (ref3 != null) {
      pauseTracking();
      setRef(ref3, null, parentSuspense, vnode, true);
      resetTracking();
    }
    if (cacheIndex != null) {
      parentComponent.renderCache[cacheIndex] = void 0;
    }
    if (shapeFlag & 256) {
      parentComponent.ctx.deactivate(vnode);
      return;
    }
    const shouldInvokeDirs = shapeFlag & 1 && dirs;
    const shouldInvokeVnodeHook = !isAsyncWrapper(vnode);
    let vnodeHook;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeBeforeUnmount)) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode);
    }
    if (shapeFlag & 6) {
      unmountComponent(vnode.component, parentSuspense, doRemove);
    } else {
      if (shapeFlag & 128) {
        vnode.suspense.unmount(parentSuspense, doRemove);
        return;
      }
      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, "beforeUnmount");
      }
      if (shapeFlag & 64) {
        vnode.type.remove(
          vnode,
          parentComponent,
          parentSuspense,
          internals,
          doRemove
        );
      } else if (dynamicChildren && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !dynamicChildren.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (type2 !== Fragment || patchFlag > 0 && patchFlag & 64)) {
        unmountChildren(
          dynamicChildren,
          parentComponent,
          parentSuspense,
          false,
          true
        );
      } else if (type2 === Fragment && patchFlag & (128 | 256) || !optimized && shapeFlag & 16) {
        unmountChildren(children, parentComponent, parentSuspense);
      }
      if (doRemove) {
        remove2(vnode);
      }
    }
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, "unmounted");
      }, parentSuspense);
    }
  };
  const remove2 = (vnode) => {
    const { type: type2, el, anchor, transition } = vnode;
    if (type2 === Fragment) {
      {
        removeFragment(el, anchor);
      }
      return;
    }
    if (type2 === Static) {
      removeStaticNode(vnode);
      return;
    }
    const performRemove = () => {
      hostRemove(el);
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave();
      }
    };
    if (vnode.shapeFlag & 1 && transition && !transition.persisted) {
      const { leave, delayLeave } = transition;
      const performLeave = () => leave(el, performRemove);
      if (delayLeave) {
        delayLeave(vnode.el, performRemove, performLeave);
      } else {
        performLeave();
      }
    } else {
      performRemove();
    }
  };
  const removeFragment = (cur, end2) => {
    let next;
    while (cur !== end2) {
      next = hostNextSibling(cur);
      hostRemove(cur);
      cur = next;
    }
    hostRemove(end2);
  };
  const unmountComponent = (instance, parentSuspense, doRemove) => {
    const { bum, scope, job, subTree, um, m: m2, a: a2 } = instance;
    invalidateMount(m2);
    invalidateMount(a2);
    if (bum) {
      invokeArrayFns(bum);
    }
    scope.stop();
    if (job) {
      job.flags |= 8;
      unmount(subTree, instance, parentSuspense, doRemove);
    }
    if (um) {
      queuePostRenderEffect(um, parentSuspense);
    }
    queuePostRenderEffect(() => {
      instance.isUnmounted = true;
    }, parentSuspense);
    if (__VUE_PROD_DEVTOOLS__) {
      devtoolsComponentRemoved(instance);
    }
  };
  const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start2 = 0) => {
    for (let i2 = start2; i2 < children.length; i2++) {
      unmount(children[i2], parentComponent, parentSuspense, doRemove, optimized);
    }
  };
  const getNextHostNode = (vnode) => {
    if (vnode.shapeFlag & 6) {
      return getNextHostNode(vnode.component.subTree);
    }
    if (vnode.shapeFlag & 128) {
      return vnode.suspense.next();
    }
    const el = hostNextSibling(vnode.anchor || vnode.el);
    const teleportEnd = el && el[TeleportEndKey];
    return teleportEnd ? hostNextSibling(teleportEnd) : el;
  };
  let isFlushing = false;
  const render2 = (vnode, container, namespace2) => {
    let instance;
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true);
        instance = container._vnode.component;
      }
    } else {
      patch(
        container._vnode || null,
        vnode,
        container,
        null,
        null,
        null,
        namespace2
      );
    }
    container._vnode = vnode;
    if (!isFlushing) {
      isFlushing = true;
      flushPreFlushCbs(instance);
      flushPostFlushCbs();
      isFlushing = false;
    }
  };
  const internals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove2,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options
  };
  let hydrate;
  return {
    render: render2,
    hydrate,
    createApp: createAppAPI(render2)
  };
}
function resolveChildrenNamespace({ type: type2, props }, currentNamespace) {
  return currentNamespace === "svg" && type2 === "foreignObject" || currentNamespace === "mathml" && type2 === "annotation-xml" && props && props.encoding && props.encoding.includes("html") ? void 0 : currentNamespace;
}
function toggleRecurse({ effect: effect2, job }, allowed) {
  if (allowed) {
    effect2.flags |= 32;
    job.flags |= 4;
  } else {
    effect2.flags &= -33;
    job.flags &= -5;
  }
}
function needTransition(parentSuspense, transition) {
  return (!parentSuspense || parentSuspense && !parentSuspense.pendingBranch) && transition && !transition.persisted;
}
function traverseStaticChildren(n1, n2, shallow = false) {
  const ch1 = n1.children;
  const ch2 = n2.children;
  if (isArray$2(ch1) && isArray$2(ch2)) {
    for (let i2 = 0; i2 < ch1.length; i2++) {
      const c1 = ch1[i2];
      let c2 = ch2[i2];
      if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
        if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
          c2 = ch2[i2] = cloneIfMounted(ch2[i2]);
          c2.el = c1.el;
        }
        if (!shallow && c2.patchFlag !== -2)
          traverseStaticChildren(c1, c2);
      }
      if (c2.type === Text) {
        if (c2.patchFlag !== -1) {
          c2.el = c1.el;
        } else {
          c2.__elIndex = i2 + // take fragment start anchor into account
          (n1.type === Fragment ? 1 : 0);
        }
      }
      if (c2.type === Comment && !c2.el) {
        c2.el = c1.el;
      }
    }
  }
}
function getSequence(arr) {
  const p2 = arr.slice();
  const result = [0];
  let i2, j2, u2, v2, c2;
  const len = arr.length;
  for (i2 = 0; i2 < len; i2++) {
    const arrI = arr[i2];
    if (arrI !== 0) {
      j2 = result[result.length - 1];
      if (arr[j2] < arrI) {
        p2[i2] = j2;
        result.push(i2);
        continue;
      }
      u2 = 0;
      v2 = result.length - 1;
      while (u2 < v2) {
        c2 = u2 + v2 >> 1;
        if (arr[result[c2]] < arrI) {
          u2 = c2 + 1;
        } else {
          v2 = c2;
        }
      }
      if (arrI < arr[result[u2]]) {
        if (u2 > 0) {
          p2[i2] = result[u2 - 1];
        }
        result[u2] = i2;
      }
    }
  }
  u2 = result.length;
  v2 = result[u2 - 1];
  while (u2-- > 0) {
    result[u2] = v2;
    v2 = p2[v2];
  }
  return result;
}
function locateNonHydratedAsyncRoot(instance) {
  const subComponent = instance.subTree.component;
  if (subComponent) {
    if (subComponent.asyncDep && !subComponent.asyncResolved) {
      return subComponent;
    } else {
      return locateNonHydratedAsyncRoot(subComponent);
    }
  }
}
function invalidateMount(hooks) {
  if (hooks) {
    for (let i2 = 0; i2 < hooks.length; i2++)
      hooks[i2].flags |= 8;
  }
}
function resolveAsyncComponentPlaceholder(anchorVnode) {
  if (anchorVnode.placeholder) {
    return anchorVnode.placeholder;
  }
  const instance = anchorVnode.component;
  if (instance) {
    return resolveAsyncComponentPlaceholder(instance.subTree);
  }
  return null;
}
const isSuspense = (type2) => type2.__isSuspense;
function queueEffectWithSuspense(fn, suspense) {
  if (suspense && suspense.pendingBranch) {
    if (isArray$2(fn)) {
      suspense.effects.push(...fn);
    } else {
      suspense.effects.push(fn);
    }
  } else {
    queuePostFlushCb(fn);
  }
}
const Fragment = /* @__PURE__ */ Symbol.for("v-fgt");
const Text = /* @__PURE__ */ Symbol.for("v-txt");
const Comment = /* @__PURE__ */ Symbol.for("v-cmt");
const Static = /* @__PURE__ */ Symbol.for("v-stc");
const blockStack = [];
let currentBlock = null;
function openBlock(disableTracking = false) {
  blockStack.push(currentBlock = disableTracking ? null : []);
}
function closeBlock() {
  blockStack.pop();
  currentBlock = blockStack[blockStack.length - 1] || null;
}
let isBlockTreeEnabled = 1;
function setBlockTracking(value, inVOnce = false) {
  isBlockTreeEnabled += value;
  if (value < 0 && currentBlock && inVOnce) {
    currentBlock.hasOnce = true;
  }
}
function setupBlock(vnode) {
  vnode.dynamicChildren = isBlockTreeEnabled > 0 ? currentBlock || EMPTY_ARR : null;
  closeBlock();
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode);
  }
  return vnode;
}
function createElementBlock(type2, props, children, patchFlag, dynamicProps, shapeFlag) {
  return setupBlock(
    createBaseVNode(
      type2,
      props,
      children,
      patchFlag,
      dynamicProps,
      shapeFlag,
      true
    )
  );
}
function createBlock(type2, props, children, patchFlag, dynamicProps) {
  return setupBlock(
    createVNode(
      type2,
      props,
      children,
      patchFlag,
      dynamicProps,
      true
    )
  );
}
function isVNode(value) {
  return value ? value.__v_isVNode === true : false;
}
function isSameVNodeType(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key;
}
const normalizeKey = ({ key }) => key != null ? key : null;
const normalizeRef = ({
  ref: ref3,
  ref_key,
  ref_for
}) => {
  if (typeof ref3 === "number") {
    ref3 = "" + ref3;
  }
  return ref3 != null ? isString$2(ref3) || isRef(ref3) || isFunction$2(ref3) ? { i: currentRenderingInstance, r: ref3, k: ref_key, f: !!ref_for } : ref3 : null;
};
function createBaseVNode(type2, props = null, children = null, patchFlag = 0, dynamicProps = null, shapeFlag = type2 === Fragment ? 0 : 1, isBlockNode = false, needFullChildrenNormalization = false) {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type: type2,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
    ctx: currentRenderingInstance
  };
  if (needFullChildrenNormalization) {
    normalizeChildren(vnode, children);
    if (shapeFlag & 128) {
      type2.normalize(vnode);
    }
  } else if (children) {
    vnode.shapeFlag |= isString$2(children) ? 8 : 16;
  }
  if (isBlockTreeEnabled > 0 && // avoid a block node from tracking itself
  !isBlockNode && // has current parent block
  currentBlock && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (vnode.patchFlag > 0 || shapeFlag & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  vnode.patchFlag !== 32) {
    currentBlock.push(vnode);
  }
  return vnode;
}
const createVNode = _createVNode;
function _createVNode(type2, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
  if (!type2 || type2 === NULL_DYNAMIC_COMPONENT) {
    type2 = Comment;
  }
  if (isVNode(type2)) {
    const cloned = cloneVNode(
      type2,
      props,
      true
      /* mergeRef: true */
    );
    if (children) {
      normalizeChildren(cloned, children);
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & 6) {
        currentBlock[currentBlock.indexOf(type2)] = cloned;
      } else {
        currentBlock.push(cloned);
      }
    }
    cloned.patchFlag = -2;
    return cloned;
  }
  if (isClassComponent(type2)) {
    type2 = type2.__vccOpts;
  }
  if (props) {
    props = guardReactiveProps(props);
    let { class: klass, style } = props;
    if (klass && !isString$2(klass)) {
      props.class = normalizeClass(klass);
    }
    if (isObject$2(style)) {
      if (isProxy(style) && !isArray$2(style)) {
        style = extend$1({}, style);
      }
      props.style = normalizeStyle(style);
    }
  }
  const shapeFlag = isString$2(type2) ? 1 : isSuspense(type2) ? 128 : isTeleport(type2) ? 64 : isObject$2(type2) ? 4 : isFunction$2(type2) ? 2 : 0;
  return createBaseVNode(
    type2,
    props,
    children,
    patchFlag,
    dynamicProps,
    shapeFlag,
    isBlockNode,
    true
  );
}
function guardReactiveProps(props) {
  if (!props) return null;
  return isProxy(props) || isInternalObject(props) ? extend$1({}, props) : props;
}
function cloneVNode(vnode, extraProps, mergeRef = false, cloneTransition = false) {
  const { props, ref: ref3, patchFlag, children, transition } = vnode;
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
  const cloned = {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref: extraProps && extraProps.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      mergeRef && ref3 ? isArray$2(ref3) ? ref3.concat(normalizeRef(extraProps)) : [ref3, normalizeRef(extraProps)] : normalizeRef(extraProps)
    ) : ref3,
    scopeId: vnode.scopeId,
    slotScopeIds: vnode.slotScopeIds,
    children,
    target: vnode.target,
    targetStart: vnode.targetStart,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 ? 16 : patchFlag | 16 : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    placeholder: vnode.placeholder,
    el: vnode.el,
    anchor: vnode.anchor,
    ctx: vnode.ctx,
    ce: vnode.ce
  };
  if (transition && cloneTransition) {
    setTransitionHooks(
      cloned,
      transition.clone(cloned)
    );
  }
  return cloned;
}
function createTextVNode(text = " ", flag = 0) {
  return createVNode(Text, null, text, flag);
}
function createCommentVNode(text = "", asBlock = false) {
  return asBlock ? (openBlock(), createBlock(Comment, null, text)) : createVNode(Comment, null, text);
}
function normalizeVNode(child) {
  if (child == null || typeof child === "boolean") {
    return createVNode(Comment);
  } else if (isArray$2(child)) {
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      child.slice()
    );
  } else if (isVNode(child)) {
    return cloneIfMounted(child);
  } else {
    return createVNode(Text, null, String(child));
  }
}
function cloneIfMounted(child) {
  return child.el === null && child.patchFlag !== -1 || child.memo ? child : cloneVNode(child);
}
function normalizeChildren(vnode, children) {
  let type2 = 0;
  const { shapeFlag } = vnode;
  if (children == null) {
    children = null;
  } else if (isArray$2(children)) {
    type2 = 16;
  } else if (typeof children === "object") {
    if (shapeFlag & (1 | 64)) {
      const slot = children.default;
      if (slot) {
        slot._c && (slot._d = false);
        normalizeChildren(vnode, slot());
        slot._c && (slot._d = true);
      }
      return;
    } else {
      type2 = 32;
      const slotFlag = children._;
      if (!slotFlag && !isInternalObject(children)) {
        children._ctx = currentRenderingInstance;
      } else if (slotFlag === 3 && currentRenderingInstance) {
        if (currentRenderingInstance.slots._ === 1) {
          children._ = 1;
        } else {
          children._ = 2;
          vnode.patchFlag |= 1024;
        }
      }
    }
  } else if (isFunction$2(children)) {
    children = { default: children, _ctx: currentRenderingInstance };
    type2 = 32;
  } else {
    children = String(children);
    if (shapeFlag & 64) {
      type2 = 16;
      children = [createTextVNode(children)];
    } else {
      type2 = 8;
    }
  }
  vnode.children = children;
  vnode.shapeFlag |= type2;
}
function mergeProps(...args) {
  const ret = {};
  for (let i2 = 0; i2 < args.length; i2++) {
    const toMerge = args[i2];
    for (const key in toMerge) {
      if (key === "class") {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class]);
        }
      } else if (key === "style") {
        ret.style = normalizeStyle([ret.style, toMerge.style]);
      } else if (isOn(key)) {
        const existing = ret[key];
        const incoming = toMerge[key];
        if (incoming && existing !== incoming && !(isArray$2(existing) && existing.includes(incoming))) {
          ret[key] = existing ? [].concat(existing, incoming) : incoming;
        }
      } else if (key !== "") {
        ret[key] = toMerge[key];
      }
    }
  }
  return ret;
}
function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
  callWithAsyncErrorHandling(hook, instance, 7, [
    vnode,
    prevVNode
  ]);
}
const emptyAppContext = createAppContext();
let uid = 0;
function createComponentInstance(vnode, parent, suspense) {
  const type2 = vnode.type;
  const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
  const instance = {
    uid: uid++,
    vnode,
    type: type2,
    parent,
    appContext,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new EffectScope(
      true
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: parent ? parent.provides : Object.create(appContext.provides),
    ids: parent ? parent.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: normalizePropsOptions(type2, appContext),
    emitsOptions: normalizeEmitsOptions(type2, appContext),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: EMPTY_OBJ,
    // inheritAttrs
    inheritAttrs: type2.inheritAttrs,
    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,
    // suspense related
    suspense,
    suspenseId: suspense ? suspense.pendingId : 0,
    asyncDep: null,
    asyncResolved: false,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  {
    instance.ctx = { _: instance };
  }
  instance.root = parent ? parent.root : instance;
  instance.emit = emit.bind(null, instance);
  if (vnode.ce) {
    vnode.ce(instance);
  }
  return instance;
}
let currentInstance = null;
const getCurrentInstance = () => currentInstance || currentRenderingInstance;
let internalSetCurrentInstance;
let setInSSRSetupState;
{
  const g2 = getGlobalThis();
  const registerGlobalSetter = (key, setter) => {
    let setters;
    if (!(setters = g2[key])) setters = g2[key] = [];
    setters.push(setter);
    return (v2) => {
      if (setters.length > 1) setters.forEach((set) => set(v2));
      else setters[0](v2);
    };
  };
  internalSetCurrentInstance = registerGlobalSetter(
    `__VUE_INSTANCE_SETTERS__`,
    (v2) => currentInstance = v2
  );
  setInSSRSetupState = registerGlobalSetter(
    `__VUE_SSR_SETTERS__`,
    (v2) => isInSSRComponentSetup = v2
  );
}
const setCurrentInstance = (instance) => {
  const prev = currentInstance;
  internalSetCurrentInstance(instance);
  instance.scope.on();
  return () => {
    instance.scope.off();
    internalSetCurrentInstance(prev);
  };
};
const unsetCurrentInstance = () => {
  currentInstance && currentInstance.scope.off();
  internalSetCurrentInstance(null);
};
function isStatefulComponent(instance) {
  return instance.vnode.shapeFlag & 4;
}
let isInSSRComponentSetup = false;
function setupComponent(instance, isSSR = false, optimized = false) {
  isSSR && setInSSRSetupState(isSSR);
  const { props, children } = instance.vnode;
  const isStateful = isStatefulComponent(instance);
  initProps(instance, props, isStateful, isSSR);
  initSlots(instance, children, optimized || isSSR);
  const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : void 0;
  isSSR && setInSSRSetupState(false);
  return setupResult;
}
function setupStatefulComponent(instance, isSSR) {
  const Component = instance.type;
  instance.accessCache = /* @__PURE__ */ Object.create(null);
  instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers);
  const { setup } = Component;
  if (setup) {
    pauseTracking();
    const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
    const reset2 = setCurrentInstance(instance);
    const setupResult = callWithErrorHandling(
      setup,
      instance,
      0,
      [
        instance.props,
        setupContext
      ]
    );
    const isAsyncSetup = isPromise(setupResult);
    resetTracking();
    reset2();
    if ((isAsyncSetup || instance.sp) && !isAsyncWrapper(instance)) {
      markAsyncBoundary(instance);
    }
    if (isAsyncSetup) {
      setupResult.then(unsetCurrentInstance, unsetCurrentInstance);
      if (isSSR) {
        return setupResult.then((resolvedResult) => {
          handleSetupResult(instance, resolvedResult);
        }).catch((e2) => {
          handleError(e2, instance, 0);
        });
      } else {
        instance.asyncDep = setupResult;
      }
    } else {
      handleSetupResult(instance, setupResult);
    }
  } else {
    finishComponentSetup(instance);
  }
}
function handleSetupResult(instance, setupResult, isSSR) {
  if (isFunction$2(setupResult)) {
    if (instance.type.__ssrInlineRender) {
      instance.ssrRender = setupResult;
    } else {
      instance.render = setupResult;
    }
  } else if (isObject$2(setupResult)) {
    if (__VUE_PROD_DEVTOOLS__) {
      instance.devtoolsRawSetupState = setupResult;
    }
    instance.setupState = proxyRefs(setupResult);
  } else ;
  finishComponentSetup(instance);
}
function finishComponentSetup(instance, isSSR, skipOptions) {
  const Component = instance.type;
  if (!instance.render) {
    instance.render = Component.render || NOOP;
  }
  if (__VUE_OPTIONS_API__ && true) {
    const reset2 = setCurrentInstance(instance);
    pauseTracking();
    try {
      applyOptions(instance);
    } finally {
      resetTracking();
      reset2();
    }
  }
}
const attrsProxyHandlers = {
  get(target, key) {
    track(target, "get", "");
    return target[key];
  }
};
function createSetupContext(instance) {
  const expose = (exposed) => {
    instance.exposed = exposed || {};
  };
  {
    return {
      attrs: new Proxy(instance.attrs, attrsProxyHandlers),
      slots: instance.slots,
      emit: instance.emit,
      expose
    };
  }
}
function getComponentPublicInstance(instance) {
  if (instance.exposed) {
    return instance.exposeProxy || (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
      get(target, key) {
        if (key in target) {
          return target[key];
        } else if (key in publicPropertiesMap) {
          return publicPropertiesMap[key](instance);
        }
      },
      has(target, key) {
        return key in target || key in publicPropertiesMap;
      }
    }));
  } else {
    return instance.proxy;
  }
}
const classifyRE = /(?:^|[-_])\w/g;
const classify = (str) => str.replace(classifyRE, (c2) => c2.toUpperCase()).replace(/[-_]/g, "");
function getComponentName(Component, includeInferred = true) {
  return isFunction$2(Component) ? Component.displayName || Component.name : Component.name || includeInferred && Component.__name;
}
function formatComponentName(instance, Component, isRoot = false) {
  let name = getComponentName(Component);
  if (!name && Component.__file) {
    const match = Component.__file.match(/([^/\\]+)\.\w+$/);
    if (match) {
      name = match[1];
    }
  }
  if (!name && instance) {
    const inferFromRegistry = (registry) => {
      for (const key in registry) {
        if (registry[key] === Component) {
          return key;
        }
      }
    };
    name = inferFromRegistry(instance.components) || instance.parent && inferFromRegistry(
      instance.parent.type.components
    ) || inferFromRegistry(instance.appContext.components);
  }
  return name ? classify(name) : isRoot ? `App` : `Anonymous`;
}
function isClassComponent(value) {
  return isFunction$2(value) && "__vccOpts" in value;
}
const computed = (getterOrOptions, debugOptions) => {
  const c2 = computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup);
  return c2;
};
function h$1(type2, propsOrChildren, children) {
  try {
    setBlockTracking(-1);
    const l2 = arguments.length;
    if (l2 === 2) {
      if (isObject$2(propsOrChildren) && !isArray$2(propsOrChildren)) {
        if (isVNode(propsOrChildren)) {
          return createVNode(type2, null, [propsOrChildren]);
        }
        return createVNode(type2, propsOrChildren);
      } else {
        return createVNode(type2, null, propsOrChildren);
      }
    } else {
      if (l2 > 3) {
        children = Array.prototype.slice.call(arguments, 2);
      } else if (l2 === 3 && isVNode(children)) {
        children = [children];
      }
      return createVNode(type2, propsOrChildren, children);
    }
  } finally {
    setBlockTracking(1);
  }
}
const version = "3.5.26";
const warn = NOOP;
/**
* @vue/runtime-dom v3.5.26
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let policy = void 0;
const tt$1 = typeof window !== "undefined" && window.trustedTypes;
if (tt$1) {
  try {
    policy = /* @__PURE__ */ tt$1.createPolicy("vue", {
      createHTML: (val) => val
    });
  } catch (e2) {
  }
}
const unsafeToTrustedHTML = policy ? (val) => policy.createHTML(val) : (val) => val;
const svgNS = "http://www.w3.org/2000/svg";
const mathmlNS = "http://www.w3.org/1998/Math/MathML";
const doc = typeof document !== "undefined" ? document : null;
const templateContainer = doc && /* @__PURE__ */ doc.createElement("template");
const nodeOps = {
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null);
  },
  remove: (child) => {
    const parent = child.parentNode;
    if (parent) {
      parent.removeChild(child);
    }
  },
  createElement: (tag, namespace2, is, props) => {
    const el = namespace2 === "svg" ? doc.createElementNS(svgNS, tag) : namespace2 === "mathml" ? doc.createElementNS(mathmlNS, tag) : is ? doc.createElement(tag, { is }) : doc.createElement(tag);
    if (tag === "select" && props && props.multiple != null) {
      el.setAttribute("multiple", props.multiple);
    }
    return el;
  },
  createText: (text) => doc.createTextNode(text),
  createComment: (text) => doc.createComment(text),
  setText: (node, text) => {
    node.nodeValue = text;
  },
  setElementText: (el, text) => {
    el.textContent = text;
  },
  parentNode: (node) => node.parentNode,
  nextSibling: (node) => node.nextSibling,
  querySelector: (selector) => doc.querySelector(selector),
  setScopeId(el, id) {
    el.setAttribute(id, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(content, parent, anchor, namespace2, start2, end2) {
    const before = anchor ? anchor.previousSibling : parent.lastChild;
    if (start2 && (start2 === end2 || start2.nextSibling)) {
      while (true) {
        parent.insertBefore(start2.cloneNode(true), anchor);
        if (start2 === end2 || !(start2 = start2.nextSibling)) break;
      }
    } else {
      templateContainer.innerHTML = unsafeToTrustedHTML(
        namespace2 === "svg" ? `<svg>${content}</svg>` : namespace2 === "mathml" ? `<math>${content}</math>` : content
      );
      const template = templateContainer.content;
      if (namespace2 === "svg" || namespace2 === "mathml") {
        const wrapper = template.firstChild;
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild);
        }
        template.removeChild(wrapper);
      }
      parent.insertBefore(template, anchor);
    }
    return [
      // first
      before ? before.nextSibling : parent.firstChild,
      // last
      anchor ? anchor.previousSibling : parent.lastChild
    ];
  }
};
const TRANSITION = "transition";
const ANIMATION = "animation";
const vtcKey = /* @__PURE__ */ Symbol("_vtc");
const DOMTransitionPropsValidators = {
  name: String,
  type: String,
  css: {
    type: Boolean,
    default: true
  },
  duration: [String, Number, Object],
  enterFromClass: String,
  enterActiveClass: String,
  enterToClass: String,
  appearFromClass: String,
  appearActiveClass: String,
  appearToClass: String,
  leaveFromClass: String,
  leaveActiveClass: String,
  leaveToClass: String
};
const TransitionPropsValidators = /* @__PURE__ */ extend$1(
  {},
  BaseTransitionPropsValidators,
  DOMTransitionPropsValidators
);
const decorate$1 = (t2) => {
  t2.displayName = "Transition";
  t2.props = TransitionPropsValidators;
  return t2;
};
const Transition = /* @__PURE__ */ decorate$1(
  (props, { slots }) => h$1(BaseTransition, resolveTransitionProps(props), slots)
);
const callHook = (hook, args = []) => {
  if (isArray$2(hook)) {
    hook.forEach((h2) => h2(...args));
  } else if (hook) {
    hook(...args);
  }
};
const hasExplicitCallback = (hook) => {
  return hook ? isArray$2(hook) ? hook.some((h2) => h2.length > 1) : hook.length > 1 : false;
};
function resolveTransitionProps(rawProps) {
  const baseProps = {};
  for (const key in rawProps) {
    if (!(key in DOMTransitionPropsValidators)) {
      baseProps[key] = rawProps[key];
    }
  }
  if (rawProps.css === false) {
    return baseProps;
  }
  const {
    name = "v",
    type: type2,
    duration,
    enterFromClass = `${name}-enter-from`,
    enterActiveClass = `${name}-enter-active`,
    enterToClass = `${name}-enter-to`,
    appearFromClass = enterFromClass,
    appearActiveClass = enterActiveClass,
    appearToClass = enterToClass,
    leaveFromClass = `${name}-leave-from`,
    leaveActiveClass = `${name}-leave-active`,
    leaveToClass = `${name}-leave-to`
  } = rawProps;
  const durations = normalizeDuration(duration);
  const enterDuration = durations && durations[0];
  const leaveDuration = durations && durations[1];
  const {
    onBeforeEnter,
    onEnter,
    onEnterCancelled,
    onLeave,
    onLeaveCancelled,
    onBeforeAppear = onBeforeEnter,
    onAppear = onEnter,
    onAppearCancelled = onEnterCancelled
  } = baseProps;
  const finishEnter = (el, isAppear, done, isCancelled) => {
    el._enterCancelled = isCancelled;
    removeTransitionClass(el, isAppear ? appearToClass : enterToClass);
    removeTransitionClass(el, isAppear ? appearActiveClass : enterActiveClass);
    done && done();
  };
  const finishLeave = (el, done) => {
    el._isLeaving = false;
    removeTransitionClass(el, leaveFromClass);
    removeTransitionClass(el, leaveToClass);
    removeTransitionClass(el, leaveActiveClass);
    done && done();
  };
  const makeEnterHook = (isAppear) => {
    return (el, done) => {
      const hook = isAppear ? onAppear : onEnter;
      const resolve2 = () => finishEnter(el, isAppear, done);
      callHook(hook, [el, resolve2]);
      nextFrame(() => {
        removeTransitionClass(el, isAppear ? appearFromClass : enterFromClass);
        addTransitionClass(el, isAppear ? appearToClass : enterToClass);
        if (!hasExplicitCallback(hook)) {
          whenTransitionEnds(el, type2, enterDuration, resolve2);
        }
      });
    };
  };
  return extend$1(baseProps, {
    onBeforeEnter(el) {
      callHook(onBeforeEnter, [el]);
      addTransitionClass(el, enterFromClass);
      addTransitionClass(el, enterActiveClass);
    },
    onBeforeAppear(el) {
      callHook(onBeforeAppear, [el]);
      addTransitionClass(el, appearFromClass);
      addTransitionClass(el, appearActiveClass);
    },
    onEnter: makeEnterHook(false),
    onAppear: makeEnterHook(true),
    onLeave(el, done) {
      el._isLeaving = true;
      const resolve2 = () => finishLeave(el, done);
      addTransitionClass(el, leaveFromClass);
      if (!el._enterCancelled) {
        forceReflow(el);
        addTransitionClass(el, leaveActiveClass);
      } else {
        addTransitionClass(el, leaveActiveClass);
        forceReflow(el);
      }
      nextFrame(() => {
        if (!el._isLeaving) {
          return;
        }
        removeTransitionClass(el, leaveFromClass);
        addTransitionClass(el, leaveToClass);
        if (!hasExplicitCallback(onLeave)) {
          whenTransitionEnds(el, type2, leaveDuration, resolve2);
        }
      });
      callHook(onLeave, [el, resolve2]);
    },
    onEnterCancelled(el) {
      finishEnter(el, false, void 0, true);
      callHook(onEnterCancelled, [el]);
    },
    onAppearCancelled(el) {
      finishEnter(el, true, void 0, true);
      callHook(onAppearCancelled, [el]);
    },
    onLeaveCancelled(el) {
      finishLeave(el);
      callHook(onLeaveCancelled, [el]);
    }
  });
}
function normalizeDuration(duration) {
  if (duration == null) {
    return null;
  } else if (isObject$2(duration)) {
    return [NumberOf(duration.enter), NumberOf(duration.leave)];
  } else {
    const n2 = NumberOf(duration);
    return [n2, n2];
  }
}
function NumberOf(val) {
  const res = toNumber(val);
  return res;
}
function addTransitionClass(el, cls) {
  cls.split(/\s+/).forEach((c2) => c2 && el.classList.add(c2));
  (el[vtcKey] || (el[vtcKey] = /* @__PURE__ */ new Set())).add(cls);
}
function removeTransitionClass(el, cls) {
  cls.split(/\s+/).forEach((c2) => c2 && el.classList.remove(c2));
  const _vtc = el[vtcKey];
  if (_vtc) {
    _vtc.delete(cls);
    if (!_vtc.size) {
      el[vtcKey] = void 0;
    }
  }
}
function nextFrame(cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}
let endId = 0;
function whenTransitionEnds(el, expectedType, explicitTimeout, resolve2) {
  const id = el._endId = ++endId;
  const resolveIfNotStale = () => {
    if (id === el._endId) {
      resolve2();
    }
  };
  if (explicitTimeout != null) {
    return setTimeout(resolveIfNotStale, explicitTimeout);
  }
  const { type: type2, timeout, propCount } = getTransitionInfo(el, expectedType);
  if (!type2) {
    return resolve2();
  }
  const endEvent = type2 + "end";
  let ended = 0;
  const end2 = () => {
    el.removeEventListener(endEvent, onEnd);
    resolveIfNotStale();
  };
  const onEnd = (e2) => {
    if (e2.target === el && ++ended >= propCount) {
      end2();
    }
  };
  setTimeout(() => {
    if (ended < propCount) {
      end2();
    }
  }, timeout + 1);
  el.addEventListener(endEvent, onEnd);
}
function getTransitionInfo(el, expectedType) {
  const styles = window.getComputedStyle(el);
  const getStyleProperties = (key) => (styles[key] || "").split(", ");
  const transitionDelays = getStyleProperties(`${TRANSITION}Delay`);
  const transitionDurations = getStyleProperties(`${TRANSITION}Duration`);
  const transitionTimeout = getTimeout(transitionDelays, transitionDurations);
  const animationDelays = getStyleProperties(`${ANIMATION}Delay`);
  const animationDurations = getStyleProperties(`${ANIMATION}Duration`);
  const animationTimeout = getTimeout(animationDelays, animationDurations);
  let type2 = null;
  let timeout = 0;
  let propCount = 0;
  if (expectedType === TRANSITION) {
    if (transitionTimeout > 0) {
      type2 = TRANSITION;
      timeout = transitionTimeout;
      propCount = transitionDurations.length;
    }
  } else if (expectedType === ANIMATION) {
    if (animationTimeout > 0) {
      type2 = ANIMATION;
      timeout = animationTimeout;
      propCount = animationDurations.length;
    }
  } else {
    timeout = Math.max(transitionTimeout, animationTimeout);
    type2 = timeout > 0 ? transitionTimeout > animationTimeout ? TRANSITION : ANIMATION : null;
    propCount = type2 ? type2 === TRANSITION ? transitionDurations.length : animationDurations.length : 0;
  }
  const hasTransform = type2 === TRANSITION && /\b(?:transform|all)(?:,|$)/.test(
    getStyleProperties(`${TRANSITION}Property`).toString()
  );
  return {
    type: type2,
    timeout,
    propCount,
    hasTransform
  };
}
function getTimeout(delays, durations) {
  while (delays.length < durations.length) {
    delays = delays.concat(delays);
  }
  return Math.max(...durations.map((d2, i2) => toMs(d2) + toMs(delays[i2])));
}
function toMs(s2) {
  if (s2 === "auto") return 0;
  return Number(s2.slice(0, -1).replace(",", ".")) * 1e3;
}
function forceReflow(el) {
  const targetDocument = el ? el.ownerDocument : document;
  return targetDocument.body.offsetHeight;
}
function patchClass(el, value, isSVG) {
  const transitionClasses = el[vtcKey];
  if (transitionClasses) {
    value = (value ? [value, ...transitionClasses] : [...transitionClasses]).join(" ");
  }
  if (value == null) {
    el.removeAttribute("class");
  } else if (isSVG) {
    el.setAttribute("class", value);
  } else {
    el.className = value;
  }
}
const vShowOriginalDisplay = /* @__PURE__ */ Symbol("_vod");
const vShowHidden = /* @__PURE__ */ Symbol("_vsh");
const vShow = {
  // used for prop mismatch check during hydration
  name: "show",
  beforeMount(el, { value }, { transition }) {
    el[vShowOriginalDisplay] = el.style.display === "none" ? "" : el.style.display;
    if (transition && value) {
      transition.beforeEnter(el);
    } else {
      setDisplay(el, value);
    }
  },
  mounted(el, { value }, { transition }) {
    if (transition && value) {
      transition.enter(el);
    }
  },
  updated(el, { value, oldValue }, { transition }) {
    if (!value === !oldValue) return;
    if (transition) {
      if (value) {
        transition.beforeEnter(el);
        setDisplay(el, true);
        transition.enter(el);
      } else {
        transition.leave(el, () => {
          setDisplay(el, false);
        });
      }
    } else {
      setDisplay(el, value);
    }
  },
  beforeUnmount(el, { value }) {
    setDisplay(el, value);
  }
};
function setDisplay(el, value) {
  el.style.display = value ? el[vShowOriginalDisplay] : "none";
  el[vShowHidden] = !value;
}
const CSS_VAR_TEXT = /* @__PURE__ */ Symbol("");
const displayRE = /(?:^|;)\s*display\s*:/;
function patchStyle(el, prev, next) {
  const style = el.style;
  const isCssString = isString$2(next);
  let hasControlledDisplay = false;
  if (next && !isCssString) {
    if (prev) {
      if (!isString$2(prev)) {
        for (const key in prev) {
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      } else {
        for (const prevStyle of prev.split(";")) {
          const key = prevStyle.slice(0, prevStyle.indexOf(":")).trim();
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      }
    }
    for (const key in next) {
      if (key === "display") {
        hasControlledDisplay = true;
      }
      setStyle(style, key, next[key]);
    }
  } else {
    if (isCssString) {
      if (prev !== next) {
        const cssVarText = style[CSS_VAR_TEXT];
        if (cssVarText) {
          next += ";" + cssVarText;
        }
        style.cssText = next;
        hasControlledDisplay = displayRE.test(next);
      }
    } else if (prev) {
      el.removeAttribute("style");
    }
  }
  if (vShowOriginalDisplay in el) {
    el[vShowOriginalDisplay] = hasControlledDisplay ? style.display : "";
    if (el[vShowHidden]) {
      style.display = "none";
    }
  }
}
const importantRE = /\s*!important$/;
function setStyle(style, name, val) {
  if (isArray$2(val)) {
    val.forEach((v2) => setStyle(style, name, v2));
  } else {
    if (val == null) val = "";
    if (name.startsWith("--")) {
      style.setProperty(name, val);
    } else {
      const prefixed = autoPrefix(style, name);
      if (importantRE.test(val)) {
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ""),
          "important"
        );
      } else {
        style[prefixed] = val;
      }
    }
  }
}
const prefixes = ["Webkit", "Moz", "ms"];
const prefixCache = {};
function autoPrefix(style, rawName) {
  const cached = prefixCache[rawName];
  if (cached) {
    return cached;
  }
  let name = camelize(rawName);
  if (name !== "filter" && name in style) {
    return prefixCache[rawName] = name;
  }
  name = capitalize(name);
  for (let i2 = 0; i2 < prefixes.length; i2++) {
    const prefixed = prefixes[i2] + name;
    if (prefixed in style) {
      return prefixCache[rawName] = prefixed;
    }
  }
  return rawName;
}
const xlinkNS = "http://www.w3.org/1999/xlink";
function patchAttr(el, key, value, isSVG, instance, isBoolean2 = isSpecialBooleanAttr(key)) {
  if (isSVG && key.startsWith("xlink:")) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length));
    } else {
      el.setAttributeNS(xlinkNS, key, value);
    }
  } else {
    if (value == null || isBoolean2 && !includeBooleanAttr(value)) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(
        key,
        isBoolean2 ? "" : isSymbol$1(value) ? String(value) : value
      );
    }
  }
}
function patchDOMProp(el, key, value, parentComponent, attrName) {
  if (key === "innerHTML" || key === "textContent") {
    if (value != null) {
      el[key] = key === "innerHTML" ? unsafeToTrustedHTML(value) : value;
    }
    return;
  }
  const tag = el.tagName;
  if (key === "value" && tag !== "PROGRESS" && // custom elements may use _value internally
  !tag.includes("-")) {
    const oldValue = tag === "OPTION" ? el.getAttribute("value") || "" : el.value;
    const newValue = value == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      el.type === "checkbox" ? "on" : ""
    ) : String(value);
    if (oldValue !== newValue || !("_value" in el)) {
      el.value = newValue;
    }
    if (value == null) {
      el.removeAttribute(key);
    }
    el._value = value;
    return;
  }
  let needRemove = false;
  if (value === "" || value == null) {
    const type2 = typeof el[key];
    if (type2 === "boolean") {
      value = includeBooleanAttr(value);
    } else if (value == null && type2 === "string") {
      value = "";
      needRemove = true;
    } else if (type2 === "number") {
      value = 0;
      needRemove = true;
    }
  }
  try {
    el[key] = value;
  } catch (e2) {
  }
  needRemove && el.removeAttribute(attrName || key);
}
function addEventListener(el, event2, handler, options) {
  el.addEventListener(event2, handler, options);
}
function removeEventListener(el, event2, handler, options) {
  el.removeEventListener(event2, handler, options);
}
const veiKey = /* @__PURE__ */ Symbol("_vei");
function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
  const invokers = el[veiKey] || (el[veiKey] = {});
  const existingInvoker = invokers[rawName];
  if (nextValue && existingInvoker) {
    existingInvoker.value = nextValue;
  } else {
    const [name, options] = parseName(rawName);
    if (nextValue) {
      const invoker = invokers[rawName] = createInvoker(
        nextValue,
        instance
      );
      addEventListener(el, name, invoker, options);
    } else if (existingInvoker) {
      removeEventListener(el, name, existingInvoker, options);
      invokers[rawName] = void 0;
    }
  }
}
const optionsModifierRE = /(?:Once|Passive|Capture)$/;
function parseName(name) {
  let options;
  if (optionsModifierRE.test(name)) {
    options = {};
    let m2;
    while (m2 = name.match(optionsModifierRE)) {
      name = name.slice(0, name.length - m2[0].length);
      options[m2[0].toLowerCase()] = true;
    }
  }
  const event2 = name[2] === ":" ? name.slice(3) : hyphenate(name.slice(2));
  return [event2, options];
}
let cachedNow = 0;
const p$1 = /* @__PURE__ */ Promise.resolve();
const getNow = () => cachedNow || (p$1.then(() => cachedNow = 0), cachedNow = Date.now());
function createInvoker(initialValue, instance) {
  const invoker = (e2) => {
    if (!e2._vts) {
      e2._vts = Date.now();
    } else if (e2._vts <= invoker.attached) {
      return;
    }
    callWithAsyncErrorHandling(
      patchStopImmediatePropagation(e2, invoker.value),
      instance,
      5,
      [e2]
    );
  };
  invoker.value = initialValue;
  invoker.attached = getNow();
  return invoker;
}
function patchStopImmediatePropagation(e2, value) {
  if (isArray$2(value)) {
    const originalStop = e2.stopImmediatePropagation;
    e2.stopImmediatePropagation = () => {
      originalStop.call(e2);
      e2._stopped = true;
    };
    return value.map(
      (fn) => (e22) => !e22._stopped && fn && fn(e22)
    );
  } else {
    return value;
  }
}
const isNativeOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // lowercase letter
key.charCodeAt(2) > 96 && key.charCodeAt(2) < 123;
const patchProp = (el, key, prevValue, nextValue, namespace2, parentComponent) => {
  const isSVG = namespace2 === "svg";
  if (key === "class") {
    patchClass(el, nextValue, isSVG);
  } else if (key === "style") {
    patchStyle(el, prevValue, nextValue);
  } else if (isOn(key)) {
    if (!isModelListener(key)) {
      patchEvent(el, key, prevValue, nextValue, parentComponent);
    }
  } else if (key[0] === "." ? (key = key.slice(1), true) : key[0] === "^" ? (key = key.slice(1), false) : shouldSetAsProp(el, key, nextValue, isSVG)) {
    patchDOMProp(el, key, nextValue);
    if (!el.tagName.includes("-") && (key === "value" || key === "checked" || key === "selected")) {
      patchAttr(el, key, nextValue, isSVG, parentComponent, key !== "value");
    }
  } else if (
    // #11081 force set props for possible async custom element
    el._isVueCE && (/[A-Z]/.test(key) || !isString$2(nextValue))
  ) {
    patchDOMProp(el, camelize(key), nextValue, parentComponent, key);
  } else {
    if (key === "true-value") {
      el._trueValue = nextValue;
    } else if (key === "false-value") {
      el._falseValue = nextValue;
    }
    patchAttr(el, key, nextValue, isSVG);
  }
};
function shouldSetAsProp(el, key, value, isSVG) {
  if (isSVG) {
    if (key === "innerHTML" || key === "textContent") {
      return true;
    }
    if (key in el && isNativeOn(key) && isFunction$2(value)) {
      return true;
    }
    return false;
  }
  if (key === "spellcheck" || key === "draggable" || key === "translate" || key === "autocorrect") {
    return false;
  }
  if (key === "sandbox" && el.tagName === "IFRAME") {
    return false;
  }
  if (key === "form") {
    return false;
  }
  if (key === "list" && el.tagName === "INPUT") {
    return false;
  }
  if (key === "type" && el.tagName === "TEXTAREA") {
    return false;
  }
  if (key === "width" || key === "height") {
    const tag = el.tagName;
    if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "SOURCE") {
      return false;
    }
  }
  if (isNativeOn(key) && isString$2(value)) {
    return false;
  }
  return key in el;
}
const systemModifiers = ["ctrl", "shift", "alt", "meta"];
const modifierGuards = {
  stop: (e2) => e2.stopPropagation(),
  prevent: (e2) => e2.preventDefault(),
  self: (e2) => e2.target !== e2.currentTarget,
  ctrl: (e2) => !e2.ctrlKey,
  shift: (e2) => !e2.shiftKey,
  alt: (e2) => !e2.altKey,
  meta: (e2) => !e2.metaKey,
  left: (e2) => "button" in e2 && e2.button !== 0,
  middle: (e2) => "button" in e2 && e2.button !== 1,
  right: (e2) => "button" in e2 && e2.button !== 2,
  exact: (e2, modifiers) => systemModifiers.some((m2) => e2[`${m2}Key`] && !modifiers.includes(m2))
};
const withModifiers = (fn, modifiers) => {
  const cache = fn._withMods || (fn._withMods = {});
  const cacheKey = modifiers.join(".");
  return cache[cacheKey] || (cache[cacheKey] = (event2, ...args) => {
    for (let i2 = 0; i2 < modifiers.length; i2++) {
      const guard = modifierGuards[modifiers[i2]];
      if (guard && guard(event2, modifiers)) return;
    }
    return fn(event2, ...args);
  });
};
const rendererOptions = /* @__PURE__ */ extend$1({ patchProp }, nodeOps);
let renderer;
function ensureRenderer() {
  return renderer || (renderer = createRenderer(rendererOptions));
}
const render = (...args) => {
  ensureRenderer().render(...args);
};
const createApp = (...args) => {
  const app = ensureRenderer().createApp(...args);
  const { mount } = app;
  app.mount = (containerOrSelector) => {
    const container = normalizeContainer(containerOrSelector);
    if (!container) return;
    const component = app._component;
    if (!isFunction$2(component) && !component.render && !component.template) {
      component.template = container.innerHTML;
    }
    if (container.nodeType === 1) {
      container.textContent = "";
    }
    const proxy = mount(container, false, resolveRootNamespace(container));
    if (container instanceof Element) {
      container.removeAttribute("v-cloak");
      container.setAttribute("data-v-app", "");
    }
    return proxy;
  };
  return app;
};
function resolveRootNamespace(container) {
  if (container instanceof SVGElement) {
    return "svg";
  }
  if (typeof MathMLElement === "function" && container instanceof MathMLElement) {
    return "mathml";
  }
}
function normalizeContainer(container) {
  if (isString$2(container)) {
    const res = document.querySelector(container);
    return res;
  }
  return container;
}
const configProviderContextKey = Symbol();
const defaultNamespace = "el";
const statePrefix = "is-";
const _bem = (namespace2, block, blockSuffix, element, modifier) => {
  let cls = `${namespace2}-${block}`;
  if (blockSuffix) {
    cls += `-${blockSuffix}`;
  }
  if (element) {
    cls += `__${element}`;
  }
  if (modifier) {
    cls += `--${modifier}`;
  }
  return cls;
};
const namespaceContextKey = Symbol("namespaceContextKey");
const useGetDerivedNamespace = (namespaceOverrides) => {
  const derivedNamespace = namespaceOverrides || (getCurrentInstance() ? inject(namespaceContextKey, ref(defaultNamespace)) : ref(defaultNamespace));
  const namespace2 = computed(() => {
    return unref(derivedNamespace) || defaultNamespace;
  });
  return namespace2;
};
const useNamespace = (block, namespaceOverrides) => {
  const namespace2 = useGetDerivedNamespace(namespaceOverrides);
  const b2 = (blockSuffix = "") => _bem(namespace2.value, block, blockSuffix, "", "");
  const e2 = (element) => element ? _bem(namespace2.value, block, "", element, "") : "";
  const m2 = (modifier) => modifier ? _bem(namespace2.value, block, "", "", modifier) : "";
  const be2 = (blockSuffix, element) => blockSuffix && element ? _bem(namespace2.value, block, blockSuffix, element, "") : "";
  const em = (element, modifier) => element && modifier ? _bem(namespace2.value, block, "", element, modifier) : "";
  const bm = (blockSuffix, modifier) => blockSuffix && modifier ? _bem(namespace2.value, block, blockSuffix, "", modifier) : "";
  const bem = (blockSuffix, element, modifier) => blockSuffix && element && modifier ? _bem(namespace2.value, block, blockSuffix, element, modifier) : "";
  const is = (name, ...args) => {
    const state = args.length >= 1 ? args[0] : true;
    return name && state ? `${statePrefix}${name}` : "";
  };
  const cssVar = (object2) => {
    const styles = {};
    for (const key in object2) {
      if (object2[key]) {
        styles[`--${namespace2.value}-${key}`] = object2[key];
      }
    }
    return styles;
  };
  const cssVarBlock = (object2) => {
    const styles = {};
    for (const key in object2) {
      if (object2[key]) {
        styles[`--${namespace2.value}-${block}-${key}`] = object2[key];
      }
    }
    return styles;
  };
  const cssVarName = (name) => `--${namespace2.value}-${name}`;
  const cssVarBlockName = (name) => `--${namespace2.value}-${block}-${name}`;
  return {
    namespace: namespace2,
    b: b2,
    e: e2,
    m: m2,
    be: be2,
    em,
    bm,
    bem,
    is,
    cssVar,
    cssVarName,
    cssVarBlock,
    cssVarBlockName
  };
};
var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
var freeSelf = typeof self == "object" && self && self.Object === Object && self;
var root$1 = freeGlobal || freeSelf || Function("return this")();
var Symbol$1 = root$1.Symbol;
var objectProto$4 = Object.prototype;
var hasOwnProperty$4 = objectProto$4.hasOwnProperty;
var nativeObjectToString$1 = objectProto$4.toString;
var symToStringTag$1 = Symbol$1 ? Symbol$1.toStringTag : void 0;
function getRawTag(value) {
  var isOwn = hasOwnProperty$4.call(value, symToStringTag$1), tag = value[symToStringTag$1];
  try {
    value[symToStringTag$1] = void 0;
    var unmasked = true;
  } catch (e2) {
  }
  var result = nativeObjectToString$1.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag$1] = tag;
    } else {
      delete value[symToStringTag$1];
    }
  }
  return result;
}
var objectProto$3 = Object.prototype;
var nativeObjectToString = objectProto$3.toString;
function objectToString(value) {
  return nativeObjectToString.call(value);
}
var nullTag = "[object Null]", undefinedTag = "[object Undefined]";
var symToStringTag = Symbol$1 ? Symbol$1.toStringTag : void 0;
function baseGetTag(value) {
  if (value == null) {
    return value === void 0 ? undefinedTag : nullTag;
  }
  return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
}
function isObjectLike(value) {
  return value != null && typeof value == "object";
}
var symbolTag = "[object Symbol]";
function isSymbol(value) {
  return typeof value == "symbol" || isObjectLike(value) && baseGetTag(value) == symbolTag;
}
function arrayMap(array, iteratee) {
  var index = -1, length = array == null ? 0 : array.length, result = Array(length);
  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}
var isArray$1 = Array.isArray;
var symbolProto = Symbol$1 ? Symbol$1.prototype : void 0, symbolToString = symbolProto ? symbolProto.toString : void 0;
function baseToString(value) {
  if (typeof value == "string") {
    return value;
  }
  if (isArray$1(value)) {
    return arrayMap(value, baseToString) + "";
  }
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : "";
  }
  var result = value + "";
  return result == "0" && 1 / value == -Infinity ? "-0" : result;
}
function isObject$1(value) {
  var type2 = typeof value;
  return value != null && (type2 == "object" || type2 == "function");
}
var asyncTag = "[object AsyncFunction]", funcTag = "[object Function]", genTag = "[object GeneratorFunction]", proxyTag = "[object Proxy]";
function isFunction$1(value) {
  if (!isObject$1(value)) {
    return false;
  }
  var tag = baseGetTag(value);
  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
}
var coreJsData = root$1["__core-js_shared__"];
var maskSrcKey = function() {
  var uid2 = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
  return uid2 ? "Symbol(src)_1." + uid2 : "";
}();
function isMasked(func) {
  return !!maskSrcKey && maskSrcKey in func;
}
var funcProto$1 = Function.prototype;
var funcToString$1 = funcProto$1.toString;
function toSource(func) {
  if (func != null) {
    try {
      return funcToString$1.call(func);
    } catch (e2) {
    }
    try {
      return func + "";
    } catch (e2) {
    }
  }
  return "";
}
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
var reIsHostCtor = /^\[object .+?Constructor\]$/;
var funcProto = Function.prototype, objectProto$2 = Object.prototype;
var funcToString = funcProto.toString;
var hasOwnProperty$3 = objectProto$2.hasOwnProperty;
var reIsNative = RegExp(
  "^" + funcToString.call(hasOwnProperty$3).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
);
function baseIsNative(value) {
  if (!isObject$1(value) || isMasked(value)) {
    return false;
  }
  var pattern = isFunction$1(value) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}
function getValue(object2, key) {
  return object2 == null ? void 0 : object2[key];
}
function getNative(object2, key) {
  var value = getValue(object2, key);
  return baseIsNative(value) ? value : void 0;
}
function eq(value, other) {
  return value === other || value !== value && other !== other;
}
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/, reIsPlainProp = /^\w*$/;
function isKey(value, object2) {
  if (isArray$1(value)) {
    return false;
  }
  var type2 = typeof value;
  if (type2 == "number" || type2 == "symbol" || type2 == "boolean" || value == null || isSymbol(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) || object2 != null && value in Object(object2);
}
var nativeCreate = getNative(Object, "create");
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
  this.size = 0;
}
function hashDelete(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}
var HASH_UNDEFINED$1 = "__lodash_hash_undefined__";
var objectProto$1 = Object.prototype;
var hasOwnProperty$2 = objectProto$1.hasOwnProperty;
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED$1 ? void 0 : result;
  }
  return hasOwnProperty$2.call(data, key) ? data[key] : void 0;
}
var objectProto = Object.prototype;
var hasOwnProperty$1 = objectProto.hasOwnProperty;
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? data[key] !== void 0 : hasOwnProperty$1.call(data, key);
}
var HASH_UNDEFINED = "__lodash_hash_undefined__";
function hashSet(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
  return this;
}
function Hash(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
Hash.prototype.clear = hashClear;
Hash.prototype["delete"] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;
function listCacheClear() {
  this.__data__ = [];
  this.size = 0;
}
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}
var arrayProto = Array.prototype;
var splice = arrayProto.splice;
function listCacheDelete(key) {
  var data = this.__data__, index = assocIndexOf(data, key);
  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}
function listCacheGet(key) {
  var data = this.__data__, index = assocIndexOf(data, key);
  return index < 0 ? void 0 : data[index][1];
}
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}
function listCacheSet(key, value) {
  var data = this.__data__, index = assocIndexOf(data, key);
  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}
function ListCache(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
ListCache.prototype.clear = listCacheClear;
ListCache.prototype["delete"] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;
var Map$1 = getNative(root$1, "Map");
function mapCacheClear() {
  this.size = 0;
  this.__data__ = {
    "hash": new Hash(),
    "map": new (Map$1 || ListCache)(),
    "string": new Hash()
  };
}
function isKeyable(value) {
  var type2 = typeof value;
  return type2 == "string" || type2 == "number" || type2 == "symbol" || type2 == "boolean" ? value !== "__proto__" : value === null;
}
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
}
function mapCacheDelete(key) {
  var result = getMapData(this, key)["delete"](key);
  this.size -= result ? 1 : 0;
  return result;
}
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}
function mapCacheSet(key, value) {
  var data = getMapData(this, key), size = data.size;
  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}
function MapCache(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype["delete"] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;
var FUNC_ERROR_TEXT = "Expected a function";
function memoize(func, resolver) {
  if (typeof func != "function" || resolver != null && typeof resolver != "function") {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache = memoized.cache;
    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result) || cache;
    return result;
  };
  memoized.cache = new (memoize.Cache || MapCache)();
  return memoized;
}
memoize.Cache = MapCache;
var MAX_MEMOIZE_SIZE = 500;
function memoizeCapped(func) {
  var result = memoize(func, function(key) {
    if (cache.size === MAX_MEMOIZE_SIZE) {
      cache.clear();
    }
    return key;
  });
  var cache = result.cache;
  return result;
}
var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
var reEscapeChar = /\\(\\)?/g;
var stringToPath = memoizeCapped(function(string) {
  var result = [];
  if (string.charCodeAt(0) === 46) {
    result.push("");
  }
  string.replace(rePropName, function(match, number, quote, subString) {
    result.push(quote ? subString.replace(reEscapeChar, "$1") : number || match);
  });
  return result;
});
function toString$1(value) {
  return value == null ? "" : baseToString(value);
}
function castPath(value, object2) {
  if (isArray$1(value)) {
    return value;
  }
  return isKey(value, object2) ? [value] : stringToPath(toString$1(value));
}
function toKey(value) {
  if (typeof value == "string" || isSymbol(value)) {
    return value;
  }
  var result = value + "";
  return result == "0" && 1 / value == -Infinity ? "-0" : result;
}
function baseGet(object2, path2) {
  path2 = castPath(path2, object2);
  var index = 0, length = path2.length;
  while (object2 != null && index < length) {
    object2 = object2[toKey(path2[index++])];
  }
  return index && index == length ? object2 : void 0;
}
function get(object2, path2, defaultValue) {
  var result = object2 == null ? void 0 : baseGet(object2, path2);
  return result === void 0 ? defaultValue : result;
}
function fromPairs(pairs) {
  var index = -1, length = pairs == null ? 0 : pairs.length, result = {};
  while (++index < length) {
    var pair = pairs[index];
    result[pair[0]] = pair[1];
  }
  return result;
}
const isUndefined$1 = (val) => val === void 0;
const isBoolean$1 = (val) => typeof val === "boolean";
const isNumber$1 = (val) => typeof val === "number";
const isElement = (e2) => {
  if (typeof Element === "undefined")
    return false;
  return e2 instanceof Element;
};
const isStringNumber = (val) => {
  if (!isString$2(val)) {
    return false;
  }
  return !Number.isNaN(Number(val));
};
var _a;
const isClient = typeof window !== "undefined";
const isString$1 = (val) => typeof val === "string";
const noop$3 = () => {
};
isClient && ((_a = window == null ? void 0 : window.navigator) == null ? void 0 : _a.userAgent) && /iP(ad|hone|od)/.test(window.navigator.userAgent);
function resolveUnref(r2) {
  return typeof r2 === "function" ? r2() : unref(r2);
}
function identity(arg) {
  return arg;
}
function tryOnScopeDispose(fn) {
  if (getCurrentScope()) {
    onScopeDispose(fn);
    return true;
  }
  return false;
}
function tryOnMounted(fn, sync = true) {
  if (getCurrentInstance())
    onMounted(fn);
  else if (sync)
    fn();
  else
    nextTick(fn);
}
function useTimeoutFn(cb, interval, options = {}) {
  const {
    immediate = true
  } = options;
  const isPending = ref(false);
  let timer = null;
  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
  function stop() {
    isPending.value = false;
    clear();
  }
  function start2(...args) {
    clear();
    isPending.value = true;
    timer = setTimeout(() => {
      isPending.value = false;
      timer = null;
      cb(...args);
    }, resolveUnref(interval));
  }
  if (immediate) {
    isPending.value = true;
    if (isClient)
      start2();
  }
  tryOnScopeDispose(stop);
  return {
    isPending: readonly(isPending),
    start: start2,
    stop
  };
}
function unrefElement(elRef) {
  var _a2;
  const plain = resolveUnref(elRef);
  return (_a2 = plain == null ? void 0 : plain.$el) != null ? _a2 : plain;
}
const defaultWindow = isClient ? window : void 0;
function useEventListener(...args) {
  let target;
  let events;
  let listeners;
  let options;
  if (isString$1(args[0]) || Array.isArray(args[0])) {
    [events, listeners, options] = args;
    target = defaultWindow;
  } else {
    [target, events, listeners, options] = args;
  }
  if (!target)
    return noop$3;
  if (!Array.isArray(events))
    events = [events];
  if (!Array.isArray(listeners))
    listeners = [listeners];
  const cleanups = [];
  const cleanup = () => {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  };
  const register = (el, event2, listener, options2) => {
    el.addEventListener(event2, listener, options2);
    return () => el.removeEventListener(event2, listener, options2);
  };
  const stopWatch = watch(() => [unrefElement(target), resolveUnref(options)], ([el, options2]) => {
    cleanup();
    if (!el)
      return;
    cleanups.push(...events.flatMap((event2) => {
      return listeners.map((listener) => register(el, event2, listener, options2));
    }));
  }, { immediate: true, flush: "post" });
  const stop = () => {
    stopWatch();
    cleanup();
  };
  tryOnScopeDispose(stop);
  return stop;
}
function useSupported(callback, sync = false) {
  const isSupported = ref();
  const update = () => isSupported.value = Boolean(callback());
  update();
  tryOnMounted(update, sync);
  return isSupported;
}
const _global$1 = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
const globalKey = "__vueuse_ssr_handlers__";
_global$1[globalKey] = _global$1[globalKey] || {};
var __getOwnPropSymbols$g = Object.getOwnPropertySymbols;
var __hasOwnProp$g = Object.prototype.hasOwnProperty;
var __propIsEnum$g = Object.prototype.propertyIsEnumerable;
var __objRest$2 = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp$g.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols$g)
    for (var prop of __getOwnPropSymbols$g(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum$g.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
function useResizeObserver(target, callback, options = {}) {
  const _a2 = options, { window: window2 = defaultWindow } = _a2, observerOptions = __objRest$2(_a2, ["window"]);
  let observer;
  const isSupported = useSupported(() => window2 && "ResizeObserver" in window2);
  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = void 0;
    }
  };
  const stopWatch = watch(() => unrefElement(target), (el) => {
    cleanup();
    if (isSupported.value && window2 && el) {
      observer = new ResizeObserver(callback);
      observer.observe(el, observerOptions);
    }
  }, { immediate: true, flush: "post" });
  const stop = () => {
    cleanup();
    stopWatch();
  };
  tryOnScopeDispose(stop);
  return {
    isSupported,
    stop
  };
}
var SwipeDirection;
(function(SwipeDirection2) {
  SwipeDirection2["UP"] = "UP";
  SwipeDirection2["RIGHT"] = "RIGHT";
  SwipeDirection2["DOWN"] = "DOWN";
  SwipeDirection2["LEFT"] = "LEFT";
  SwipeDirection2["NONE"] = "NONE";
})(SwipeDirection || (SwipeDirection = {}));
var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a2, b2) => {
  for (var prop in b2 || (b2 = {}))
    if (__hasOwnProp.call(b2, prop))
      __defNormalProp(a2, prop, b2[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b2)) {
      if (__propIsEnum.call(b2, prop))
        __defNormalProp(a2, prop, b2[prop]);
    }
  return a2;
};
const _TransitionPresets = {
  easeInSine: [0.12, 0, 0.39, 0],
  easeOutSine: [0.61, 1, 0.88, 1],
  easeInOutSine: [0.37, 0, 0.63, 1],
  easeInQuad: [0.11, 0, 0.5, 0],
  easeOutQuad: [0.5, 1, 0.89, 1],
  easeInOutQuad: [0.45, 0, 0.55, 1],
  easeInCubic: [0.32, 0, 0.67, 0],
  easeOutCubic: [0.33, 1, 0.68, 1],
  easeInOutCubic: [0.65, 0, 0.35, 1],
  easeInQuart: [0.5, 0, 0.75, 0],
  easeOutQuart: [0.25, 1, 0.5, 1],
  easeInOutQuart: [0.76, 0, 0.24, 1],
  easeInQuint: [0.64, 0, 0.78, 0],
  easeOutQuint: [0.22, 1, 0.36, 1],
  easeInOutQuint: [0.83, 0, 0.17, 1],
  easeInExpo: [0.7, 0, 0.84, 0],
  easeOutExpo: [0.16, 1, 0.3, 1],
  easeInOutExpo: [0.87, 0, 0.13, 1],
  easeInCirc: [0.55, 0, 1, 0.45],
  easeOutCirc: [0, 0.55, 0.45, 1],
  easeInOutCirc: [0.85, 0, 0.15, 1],
  easeInBack: [0.36, 0, 0.66, -0.56],
  easeOutBack: [0.34, 1.56, 0.64, 1],
  easeInOutBack: [0.68, -0.6, 0.32, 1.6]
};
__spreadValues({
  linear: identity
}, _TransitionPresets);
const initial = {
  current: 0
};
const zIndex = ref(0);
const defaultInitialZIndex = 2e3;
const ZINDEX_INJECTION_KEY = Symbol("elZIndexContextKey");
const zIndexContextKey = Symbol("zIndexContextKey");
const useZIndex = (zIndexOverrides) => {
  const increasingInjection = getCurrentInstance() ? inject(ZINDEX_INJECTION_KEY, initial) : initial;
  const zIndexInjection = zIndexOverrides || (getCurrentInstance() ? inject(zIndexContextKey, void 0) : void 0);
  const initialZIndex = computed(() => {
    const zIndexFromInjection = unref(zIndexInjection);
    return isNumber$1(zIndexFromInjection) ? zIndexFromInjection : defaultInitialZIndex;
  });
  const currentZIndex = computed(() => initialZIndex.value + zIndex.value);
  const nextZIndex = () => {
    increasingInjection.current++;
    zIndex.value = increasingInjection.current;
    return currentZIndex.value;
  };
  if (!isClient && !inject(ZINDEX_INJECTION_KEY)) ;
  return {
    initialZIndex,
    currentZIndex,
    nextZIndex
  };
};
var English = {
  name: "en",
  el: {
    breadcrumb: {
      label: "Breadcrumb"
    },
    colorpicker: {
      confirm: "OK",
      clear: "Clear",
      defaultLabel: "color picker",
      description: "current color is {color}. press enter to select a new color.",
      alphaLabel: "pick alpha value"
    },
    datepicker: {
      now: "Now",
      today: "Today",
      cancel: "Cancel",
      clear: "Clear",
      confirm: "OK",
      dateTablePrompt: "Use the arrow keys and enter to select the day of the month",
      monthTablePrompt: "Use the arrow keys and enter to select the month",
      yearTablePrompt: "Use the arrow keys and enter to select the year",
      selectedDate: "Selected date",
      selectDate: "Select date",
      selectTime: "Select time",
      startDate: "Start Date",
      startTime: "Start Time",
      endDate: "End Date",
      endTime: "End Time",
      prevYear: "Previous Year",
      nextYear: "Next Year",
      prevMonth: "Previous Month",
      nextMonth: "Next Month",
      year: "",
      month1: "January",
      month2: "February",
      month3: "March",
      month4: "April",
      month5: "May",
      month6: "June",
      month7: "July",
      month8: "August",
      month9: "September",
      month10: "October",
      month11: "November",
      month12: "December",
      week: "week",
      weeks: {
        sun: "Sun",
        mon: "Mon",
        tue: "Tue",
        wed: "Wed",
        thu: "Thu",
        fri: "Fri",
        sat: "Sat"
      },
      weeksFull: {
        sun: "Sunday",
        mon: "Monday",
        tue: "Tuesday",
        wed: "Wednesday",
        thu: "Thursday",
        fri: "Friday",
        sat: "Saturday"
      },
      months: {
        jan: "Jan",
        feb: "Feb",
        mar: "Mar",
        apr: "Apr",
        may: "May",
        jun: "Jun",
        jul: "Jul",
        aug: "Aug",
        sep: "Sep",
        oct: "Oct",
        nov: "Nov",
        dec: "Dec"
      }
    },
    inputNumber: {
      decrease: "decrease number",
      increase: "increase number"
    },
    select: {
      loading: "Loading",
      noMatch: "No matching data",
      noData: "No data",
      placeholder: "Select"
    },
    mention: {
      loading: "Loading"
    },
    dropdown: {
      toggleDropdown: "Toggle Dropdown"
    },
    cascader: {
      noMatch: "No matching data",
      loading: "Loading",
      placeholder: "Select",
      noData: "No data"
    },
    pagination: {
      goto: "Go to",
      pagesize: "/page",
      total: "Total {total}",
      pageClassifier: "",
      page: "Page",
      prev: "Go to previous page",
      next: "Go to next page",
      currentPage: "page {pager}",
      prevPages: "Previous {pager} pages",
      nextPages: "Next {pager} pages",
      deprecationWarning: "Deprecated usages detected, please refer to the el-pagination documentation for more details"
    },
    dialog: {
      close: "Close this dialog"
    },
    drawer: {
      close: "Close this dialog"
    },
    messagebox: {
      title: "Message",
      confirm: "OK",
      cancel: "Cancel",
      error: "Illegal input",
      close: "Close this dialog"
    },
    upload: {
      deleteTip: "press delete to remove",
      delete: "Delete",
      preview: "Preview",
      continue: "Continue"
    },
    slider: {
      defaultLabel: "slider between {min} and {max}",
      defaultRangeStartLabel: "pick start value",
      defaultRangeEndLabel: "pick end value"
    },
    table: {
      emptyText: "No Data",
      confirmFilter: "Confirm",
      resetFilter: "Reset",
      clearFilter: "All",
      sumText: "Sum"
    },
    tour: {
      next: "Next",
      previous: "Previous",
      finish: "Finish"
    },
    tree: {
      emptyText: "No Data"
    },
    transfer: {
      noMatch: "No matching data",
      noData: "No data",
      titles: ["List 1", "List 2"],
      filterPlaceholder: "Enter keyword",
      noCheckedFormat: "{total} items",
      hasCheckedFormat: "{checked}/{total} checked"
    },
    image: {
      error: "FAILED"
    },
    pageHeader: {
      title: "Back"
    },
    popconfirm: {
      confirmButtonText: "Yes",
      cancelButtonText: "No"
    },
    carousel: {
      leftArrow: "Carousel arrow left",
      rightArrow: "Carousel arrow right",
      indicator: "Carousel switch to index {index}"
    }
  }
};
const buildTranslator = (locale) => (path2, option) => translate(path2, option, unref(locale));
const translate = (path2, option, locale) => get(locale, path2, path2).replace(/\{(\w+)\}/g, (_2, key) => {
  var _a2;
  return `${(_a2 = option == null ? void 0 : option[key]) != null ? _a2 : `{${key}}`}`;
});
const buildLocaleContext = (locale) => {
  const lang = computed(() => unref(locale).name);
  const localeRef = isRef(locale) ? locale : ref(locale);
  return {
    lang,
    locale: localeRef,
    t: buildTranslator(locale)
  };
};
const localeContextKey = Symbol("localeContextKey");
const useLocale = (localeOverrides) => {
  const locale = localeOverrides || inject(localeContextKey, ref());
  return buildLocaleContext(computed(() => locale.value || English));
};
const epPropKey = "__epPropKey";
const definePropType = (val) => val;
const isEpProp = (val) => isObject$2(val) && !!val[epPropKey];
const buildProp = (prop, key) => {
  if (!isObject$2(prop) || isEpProp(prop))
    return prop;
  const { values, required, default: defaultValue, type: type2, validator: validator2 } = prop;
  const _validator = values || validator2 ? (val) => {
    let valid = false;
    let allowedValues = [];
    if (values) {
      allowedValues = Array.from(values);
      if (hasOwn(prop, "default")) {
        allowedValues.push(defaultValue);
      }
      valid || (valid = allowedValues.includes(val));
    }
    if (validator2)
      valid || (valid = validator2(val));
    if (!valid && allowedValues.length > 0) {
      const allowValuesText = [...new Set(allowedValues)].map((value) => JSON.stringify(value)).join(", ");
      warn(`Invalid prop: validation failed${key ? ` for prop "${key}"` : ""}. Expected one of [${allowValuesText}], got value ${JSON.stringify(val)}.`);
    }
    return valid;
  } : void 0;
  const epProp = {
    type: type2,
    required: !!required,
    validator: _validator,
    [epPropKey]: true
  };
  if (hasOwn(prop, "default"))
    epProp.default = defaultValue;
  return epProp;
};
const buildProps = (props) => fromPairs(Object.entries(props).map(([key, option]) => [
  key,
  buildProp(option, key)
]));
const componentSizes = ["", "default", "small", "large"];
const useSizeProp = buildProp({
  type: String,
  values: componentSizes,
  required: false
});
const SIZE_INJECTION_KEY = Symbol("size");
const emptyValuesContextKey = Symbol("emptyValuesContextKey");
const useEmptyValuesProps = buildProps({
  emptyValues: Array,
  valueOnClear: {
    type: [String, Number, Boolean, Function],
    default: void 0,
    validator: (val) => isFunction$2(val) ? !val() : !val
  }
});
const keysOf = (arr) => Object.keys(arr);
const globalConfig = ref();
function useGlobalConfig(key, defaultValue = void 0) {
  const config = getCurrentInstance() ? inject(configProviderContextKey, globalConfig) : globalConfig;
  {
    return config;
  }
}
function useGlobalComponentSettings(block, sizeFallback) {
  const config = useGlobalConfig();
  const ns = useNamespace(block, computed(() => {
    var _a2;
    return ((_a2 = config.value) == null ? void 0 : _a2.namespace) || defaultNamespace;
  }));
  const locale = useLocale(computed(() => {
    var _a2;
    return (_a2 = config.value) == null ? void 0 : _a2.locale;
  }));
  const zIndex2 = useZIndex(computed(() => {
    var _a2;
    return ((_a2 = config.value) == null ? void 0 : _a2.zIndex) || defaultInitialZIndex;
  }));
  const size = computed(() => {
    var _a2;
    return unref(sizeFallback) || ((_a2 = config.value) == null ? void 0 : _a2.size) || "";
  });
  provideGlobalConfig(computed(() => unref(config) || {}));
  return {
    ns,
    locale,
    zIndex: zIndex2,
    size
  };
}
const provideGlobalConfig = (config, app, global2 = false) => {
  var _a2;
  const inSetup = !!getCurrentInstance();
  const oldConfig = inSetup ? useGlobalConfig() : void 0;
  const provideFn = (_a2 = void 0) != null ? _a2 : inSetup ? provide : void 0;
  if (!provideFn) {
    return;
  }
  const context = computed(() => {
    const cfg = unref(config);
    if (!(oldConfig == null ? void 0 : oldConfig.value))
      return cfg;
    return mergeConfig$2(oldConfig.value, cfg);
  });
  provideFn(configProviderContextKey, context);
  provideFn(localeContextKey, computed(() => context.value.locale));
  provideFn(namespaceContextKey, computed(() => context.value.namespace));
  provideFn(zIndexContextKey, computed(() => context.value.zIndex));
  provideFn(SIZE_INJECTION_KEY, {
    size: computed(() => context.value.size || "")
  });
  provideFn(emptyValuesContextKey, computed(() => ({
    emptyValues: context.value.emptyValues,
    valueOnClear: context.value.valueOnClear
  })));
  if (global2 || !globalConfig.value) {
    globalConfig.value = context.value;
  }
  return context;
};
const mergeConfig$2 = (a2, b2) => {
  const keys = [.../* @__PURE__ */ new Set([...keysOf(a2), ...keysOf(b2)])];
  const obj = {};
  for (const key of keys) {
    obj[key] = b2[key] !== void 0 ? b2[key] : a2[key];
  }
  return obj;
};
var _export_sfc = (sfc, props) => {
  const target = sfc.__vccOpts || sfc;
  for (const [key, val] of props) {
    target[key] = val;
  }
  return target;
};
const classNameToArray = (cls = "") => cls.split(" ").filter((item) => !!item.trim());
const addClass = (el, cls) => {
  if (!el || !cls.trim())
    return;
  el.classList.add(...classNameToArray(cls));
};
const removeClass = (el, cls) => {
  if (!el || !cls.trim())
    return;
  el.classList.remove(...classNameToArray(cls));
};
const getStyle = (element, styleName) => {
  var _a2;
  if (!isClient || !element || !styleName)
    return "";
  let key = camelize(styleName);
  if (key === "float")
    key = "cssFloat";
  try {
    const style = element.style[key];
    if (style)
      return style;
    const computed2 = (_a2 = document.defaultView) == null ? void 0 : _a2.getComputedStyle(element, "");
    return computed2 ? computed2[key] : "";
  } catch (e2) {
    return element.style[key];
  }
};
function addUnit(value, defaultUnit = "px") {
  if (!value)
    return "";
  if (isNumber$1(value) || isStringNumber(value)) {
    return `${value}${defaultUnit}`;
  } else if (isString$2(value)) {
    return value;
  }
}
const withInstall = (main, extra) => {
  main.install = (app) => {
    for (const comp of [main, ...Object.values({})]) {
      app.component(comp.name, comp);
    }
  };
  return main;
};
const withInstallFunction = (fn, name) => {
  fn.install = (app) => {
    fn._context = app._context;
    app.config.globalProperties[name] = fn;
  };
  return fn;
};
const iconProps = buildProps({
  size: {
    type: definePropType([Number, String])
  },
  color: {
    type: String
  }
});
const __default__$3 = /* @__PURE__ */ defineComponent({
  name: "ElIcon",
  inheritAttrs: false
});
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  ...__default__$3,
  props: iconProps,
  setup(__props) {
    const props = __props;
    const ns = useNamespace("icon");
    const style = computed(() => {
      const { size, color } = props;
      if (!size && !color)
        return {};
      return {
        fontSize: isUndefined$1(size) ? void 0 : addUnit(size),
        "--color": color
      };
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("i", mergeProps({
        class: unref(ns).b(),
        style: unref(style)
      }, _ctx.$attrs), [
        renderSlot(_ctx.$slots, "default")
      ], 16);
    };
  }
});
var Icon = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__file", "icon.vue"]]);
const ElIcon = withInstall(Icon);
/*! Element Plus Icons Vue v2.3.1 */
var circle_close_filled_vue_vue_type_script_setup_true_lang_default = /* @__PURE__ */ defineComponent({
  name: "CircleCloseFilled",
  __name: "circle-close-filled",
  setup(__props) {
    return (_ctx, _cache) => (openBlock(), createElementBlock("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 1024 1024"
    }, [
      createBaseVNode("path", {
        fill: "currentColor",
        d: "M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m0 393.664L407.936 353.6a38.4 38.4 0 1 0-54.336 54.336L457.664 512 353.6 616.064a38.4 38.4 0 1 0 54.336 54.336L512 566.336 616.064 670.4a38.4 38.4 0 1 0 54.336-54.336L566.336 512 670.4 407.936a38.4 38.4 0 1 0-54.336-54.336z"
      })
    ]));
  }
});
var circle_close_filled_default = circle_close_filled_vue_vue_type_script_setup_true_lang_default;
var close_vue_vue_type_script_setup_true_lang_default = /* @__PURE__ */ defineComponent({
  name: "Close",
  __name: "close",
  setup(__props) {
    return (_ctx, _cache) => (openBlock(), createElementBlock("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 1024 1024"
    }, [
      createBaseVNode("path", {
        fill: "currentColor",
        d: "M764.288 214.592 512 466.88 259.712 214.592a31.936 31.936 0 0 0-45.12 45.12L466.752 512 214.528 764.224a31.936 31.936 0 1 0 45.12 45.184L512 557.184l252.288 252.288a31.936 31.936 0 0 0 45.12-45.12L557.12 512.064l252.288-252.352a31.936 31.936 0 1 0-45.12-45.184z"
      })
    ]));
  }
});
var close_default = close_vue_vue_type_script_setup_true_lang_default;
var info_filled_vue_vue_type_script_setup_true_lang_default = /* @__PURE__ */ defineComponent({
  name: "InfoFilled",
  __name: "info-filled",
  setup(__props) {
    return (_ctx, _cache) => (openBlock(), createElementBlock("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 1024 1024"
    }, [
      createBaseVNode("path", {
        fill: "currentColor",
        d: "M512 64a448 448 0 1 1 0 896.064A448 448 0 0 1 512 64m67.2 275.072c33.28 0 60.288-23.104 60.288-57.344s-27.072-57.344-60.288-57.344c-33.28 0-60.16 23.104-60.16 57.344s26.88 57.344 60.16 57.344M590.912 699.2c0-6.848 2.368-24.64 1.024-34.752l-52.608 60.544c-10.88 11.456-24.512 19.392-30.912 17.28a12.992 12.992 0 0 1-8.256-14.72l87.68-276.992c7.168-35.136-12.544-67.2-54.336-71.296-44.096 0-108.992 44.736-148.48 101.504 0 6.784-1.28 23.68.064 33.792l52.544-60.608c10.88-11.328 23.552-19.328 29.952-17.152a12.8 12.8 0 0 1 7.808 16.128L388.48 728.576c-10.048 32.256 8.96 63.872 55.04 71.04 67.84 0 107.904-43.648 147.456-100.416z"
      })
    ]));
  }
});
var info_filled_default = info_filled_vue_vue_type_script_setup_true_lang_default;
var success_filled_vue_vue_type_script_setup_true_lang_default = /* @__PURE__ */ defineComponent({
  name: "SuccessFilled",
  __name: "success-filled",
  setup(__props) {
    return (_ctx, _cache) => (openBlock(), createElementBlock("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 1024 1024"
    }, [
      createBaseVNode("path", {
        fill: "currentColor",
        d: "M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m-55.808 536.384-99.52-99.584a38.4 38.4 0 1 0-54.336 54.336l126.72 126.72a38.272 38.272 0 0 0 54.336 0l262.4-262.464a38.4 38.4 0 1 0-54.272-54.336z"
      })
    ]));
  }
});
var success_filled_default = success_filled_vue_vue_type_script_setup_true_lang_default;
var warning_filled_vue_vue_type_script_setup_true_lang_default = /* @__PURE__ */ defineComponent({
  name: "WarningFilled",
  __name: "warning-filled",
  setup(__props) {
    return (_ctx, _cache) => (openBlock(), createElementBlock("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 1024 1024"
    }, [
      createBaseVNode("path", {
        fill: "currentColor",
        d: "M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m0 192a58.432 58.432 0 0 0-58.24 63.744l23.36 256.384a35.072 35.072 0 0 0 69.76 0l23.296-256.384A58.432 58.432 0 0 0 512 256m0 512a51.2 51.2 0 1 0 0-102.4 51.2 51.2 0 0 0 0 102.4"
      })
    ]));
  }
});
var warning_filled_default = warning_filled_vue_vue_type_script_setup_true_lang_default;
const iconPropType = definePropType([
  String,
  Object,
  Function
]);
const CloseComponents = {
  Close: close_default
};
const TypeComponents = {
  Close: close_default
};
const TypeComponentsMap = {
  success: success_filled_default,
  warning: warning_filled_default,
  error: circle_close_filled_default,
  info: info_filled_default
};
const mutable = (val) => val;
const EVENT_CODE = {
  esc: "Escape",
  delete: "Delete",
  backspace: "Backspace"
};
const badgeProps = buildProps({
  value: {
    type: [String, Number],
    default: ""
  },
  max: {
    type: Number,
    default: 99
  },
  isDot: Boolean,
  hidden: Boolean,
  type: {
    type: String,
    values: ["primary", "success", "warning", "info", "danger"],
    default: "danger"
  },
  showZero: {
    type: Boolean,
    default: true
  },
  color: String,
  badgeStyle: {
    type: definePropType([String, Object, Array])
  },
  offset: {
    type: definePropType(Array),
    default: [0, 0]
  },
  badgeClass: {
    type: String
  }
});
const __default__$2 = /* @__PURE__ */ defineComponent({
  name: "ElBadge"
});
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  ...__default__$2,
  props: badgeProps,
  setup(__props, { expose }) {
    const props = __props;
    const ns = useNamespace("badge");
    const content = computed(() => {
      if (props.isDot)
        return "";
      if (isNumber$1(props.value) && isNumber$1(props.max)) {
        return props.max < props.value ? `${props.max}+` : `${props.value}`;
      }
      return `${props.value}`;
    });
    const style = computed(() => {
      var _a2, _b, _c, _d, _e2;
      return [
        {
          backgroundColor: props.color,
          marginRight: addUnit(-((_b = (_a2 = props.offset) == null ? void 0 : _a2[0]) != null ? _b : 0)),
          marginTop: addUnit((_d = (_c = props.offset) == null ? void 0 : _c[1]) != null ? _d : 0)
        },
        (_e2 = props.badgeStyle) != null ? _e2 : {}
      ];
    });
    expose({
      content
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(unref(ns).b())
      }, [
        renderSlot(_ctx.$slots, "default"),
        createVNode(Transition, {
          name: `${unref(ns).namespace.value}-zoom-in-center`,
          persisted: ""
        }, {
          default: withCtx(() => [
            withDirectives(createBaseVNode("sup", {
              class: normalizeClass([
                unref(ns).e("content"),
                unref(ns).em("content", _ctx.type),
                unref(ns).is("fixed", !!_ctx.$slots.default),
                unref(ns).is("dot", _ctx.isDot),
                unref(ns).is("hide-zero", !_ctx.showZero && props.value === 0),
                _ctx.badgeClass
              ]),
              style: normalizeStyle(unref(style))
            }, [
              renderSlot(_ctx.$slots, "content", { value: unref(content) }, () => [
                createTextVNode(toDisplayString(unref(content)), 1)
              ])
            ], 6), [
              [vShow, !_ctx.hidden && (unref(content) || _ctx.isDot || _ctx.$slots.content)]
            ])
          ]),
          _: 3
        }, 8, ["name"])
      ], 2);
    };
  }
});
var Badge = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__file", "badge.vue"]]);
const ElBadge = withInstall(Badge);
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x2) {
  return x2 && x2.__esModule && Object.prototype.hasOwnProperty.call(x2, "default") ? x2["default"] : x2;
}
buildProps({
  a11y: {
    type: Boolean,
    default: true
  },
  locale: {
    type: definePropType(Object)
  },
  size: useSizeProp,
  button: {
    type: definePropType(Object)
  },
  experimentalFeatures: {
    type: definePropType(Object)
  },
  keyboardNavigation: {
    type: Boolean,
    default: true
  },
  message: {
    type: definePropType(Object)
  },
  zIndex: Number,
  namespace: {
    type: String,
    default: "el"
  },
  ...useEmptyValuesProps
});
const messageConfig = {};
function createLoadingComponent(options) {
  let afterLeaveTimer;
  const afterLeaveFlag = ref(false);
  const data = reactive({
    ...options,
    originalPosition: "",
    originalOverflow: "",
    visible: false
  });
  function setText(text) {
    data.text = text;
  }
  function destroySelf() {
    const target = data.parent;
    const ns = vm.ns;
    if (!target.vLoadingAddClassList) {
      let loadingNumber = target.getAttribute("loading-number");
      loadingNumber = Number.parseInt(loadingNumber) - 1;
      if (!loadingNumber) {
        removeClass(target, ns.bm("parent", "relative"));
        target.removeAttribute("loading-number");
      } else {
        target.setAttribute("loading-number", loadingNumber.toString());
      }
      removeClass(target, ns.bm("parent", "hidden"));
    }
    removeElLoadingChild();
    loadingInstance2.unmount();
  }
  function removeElLoadingChild() {
    var _a2, _b;
    (_b = (_a2 = vm.$el) == null ? void 0 : _a2.parentNode) == null ? void 0 : _b.removeChild(vm.$el);
  }
  function close2() {
    var _a2;
    if (options.beforeClose && !options.beforeClose())
      return;
    afterLeaveFlag.value = true;
    clearTimeout(afterLeaveTimer);
    afterLeaveTimer = setTimeout(handleAfterLeave, 400);
    data.visible = false;
    (_a2 = options.closed) == null ? void 0 : _a2.call(options);
  }
  function handleAfterLeave() {
    if (!afterLeaveFlag.value)
      return;
    const target = data.parent;
    afterLeaveFlag.value = false;
    target.vLoadingAddClassList = void 0;
    destroySelf();
  }
  const elLoadingComponent = /* @__PURE__ */ defineComponent({
    name: "ElLoading",
    setup(_2, { expose }) {
      const { ns, zIndex: zIndex2 } = useGlobalComponentSettings("loading");
      expose({
        ns,
        zIndex: zIndex2
      });
      return () => {
        const svg = data.spinner || data.svg;
        const spinner = h$1("svg", {
          class: "circular",
          viewBox: data.svgViewBox ? data.svgViewBox : "0 0 50 50",
          ...svg ? { innerHTML: svg } : {}
        }, [
          h$1("circle", {
            class: "path",
            cx: "25",
            cy: "25",
            r: "20",
            fill: "none"
          })
        ]);
        const spinnerText = data.text ? h$1("p", { class: ns.b("text") }, [data.text]) : void 0;
        return h$1(Transition, {
          name: ns.b("fade"),
          onAfterLeave: handleAfterLeave
        }, {
          default: withCtx(() => [
            withDirectives(createVNode("div", {
              style: {
                backgroundColor: data.background || ""
              },
              class: [
                ns.b("mask"),
                data.customClass,
                data.fullscreen ? "is-fullscreen" : ""
              ]
            }, [
              h$1("div", {
                class: ns.b("spinner")
              }, [spinner, spinnerText])
            ]), [[vShow, data.visible]])
          ])
        });
      };
    }
  });
  const loadingInstance2 = createApp(elLoadingComponent);
  const vm = loadingInstance2.mount(document.createElement("div"));
  return {
    ...toRefs(data),
    setText,
    removeElLoadingChild,
    close: close2,
    handleAfterLeave,
    vm,
    get $el() {
      return vm.$el;
    }
  };
}
let fullscreenInstance = void 0;
const Loading = function(options = {}) {
  if (!isClient)
    return void 0;
  const resolved = resolveOptions(options);
  if (resolved.fullscreen && fullscreenInstance) {
    return fullscreenInstance;
  }
  const instance = createLoadingComponent({
    ...resolved,
    closed: () => {
      var _a2;
      (_a2 = resolved.closed) == null ? void 0 : _a2.call(resolved);
      if (resolved.fullscreen)
        fullscreenInstance = void 0;
    }
  });
  addStyle(resolved, resolved.parent, instance);
  addClassList(resolved, resolved.parent, instance);
  resolved.parent.vLoadingAddClassList = () => addClassList(resolved, resolved.parent, instance);
  let loadingNumber = resolved.parent.getAttribute("loading-number");
  if (!loadingNumber) {
    loadingNumber = "1";
  } else {
    loadingNumber = `${Number.parseInt(loadingNumber) + 1}`;
  }
  resolved.parent.setAttribute("loading-number", loadingNumber);
  resolved.parent.appendChild(instance.$el);
  nextTick(() => instance.visible.value = resolved.visible);
  if (resolved.fullscreen) {
    fullscreenInstance = instance;
  }
  return instance;
};
const resolveOptions = (options) => {
  var _a2, _b, _c, _d;
  let target;
  if (isString$2(options.target)) {
    target = (_a2 = document.querySelector(options.target)) != null ? _a2 : document.body;
  } else {
    target = options.target || document.body;
  }
  return {
    parent: target === document.body || options.body ? document.body : target,
    background: options.background || "",
    svg: options.svg || "",
    svgViewBox: options.svgViewBox || "",
    spinner: options.spinner || false,
    text: options.text || "",
    fullscreen: target === document.body && ((_b = options.fullscreen) != null ? _b : true),
    lock: (_c = options.lock) != null ? _c : false,
    customClass: options.customClass || "",
    visible: (_d = options.visible) != null ? _d : true,
    beforeClose: options.beforeClose,
    closed: options.closed,
    target
  };
};
const addStyle = async (options, parent, instance) => {
  const { nextZIndex } = instance.vm.zIndex || instance.vm._.exposed.zIndex;
  const maskStyle = {};
  if (options.fullscreen) {
    instance.originalPosition.value = getStyle(document.body, "position");
    instance.originalOverflow.value = getStyle(document.body, "overflow");
    maskStyle.zIndex = nextZIndex();
  } else if (options.parent === document.body) {
    instance.originalPosition.value = getStyle(document.body, "position");
    await nextTick();
    for (const property of ["top", "left"]) {
      const scroll = property === "top" ? "scrollTop" : "scrollLeft";
      maskStyle[property] = `${options.target.getBoundingClientRect()[property] + document.body[scroll] + document.documentElement[scroll] - Number.parseInt(getStyle(document.body, `margin-${property}`), 10)}px`;
    }
    for (const property of ["height", "width"]) {
      maskStyle[property] = `${options.target.getBoundingClientRect()[property]}px`;
    }
  } else {
    instance.originalPosition.value = getStyle(parent, "position");
  }
  for (const [key, value] of Object.entries(maskStyle)) {
    instance.$el.style[key] = value;
  }
};
const addClassList = (options, parent, instance) => {
  const ns = instance.vm.ns || instance.vm._.exposed.ns;
  if (!["absolute", "fixed", "sticky"].includes(instance.originalPosition.value)) {
    addClass(parent, ns.bm("parent", "relative"));
  } else {
    removeClass(parent, ns.bm("parent", "relative"));
  }
  if (options.fullscreen && options.lock) {
    addClass(parent, ns.bm("parent", "hidden"));
  } else {
    removeClass(parent, ns.bm("parent", "hidden"));
  }
};
const INSTANCE_KEY = Symbol("ElLoading");
const createInstance$1 = (el, binding) => {
  var _a2, _b, _c, _d;
  const vm = binding.instance;
  const getBindingProp = (key) => isObject$2(binding.value) ? binding.value[key] : void 0;
  const resolveExpression = (key) => {
    const data = isString$2(key) && (vm == null ? void 0 : vm[key]) || key;
    if (data)
      return ref(data);
    else
      return data;
  };
  const getProp = (name) => resolveExpression(getBindingProp(name) || el.getAttribute(`element-loading-${hyphenate(name)}`));
  const fullscreen = (_a2 = getBindingProp("fullscreen")) != null ? _a2 : binding.modifiers.fullscreen;
  const options = {
    text: getProp("text"),
    svg: getProp("svg"),
    svgViewBox: getProp("svgViewBox"),
    spinner: getProp("spinner"),
    background: getProp("background"),
    customClass: getProp("customClass"),
    fullscreen,
    target: (_b = getBindingProp("target")) != null ? _b : fullscreen ? void 0 : el,
    body: (_c = getBindingProp("body")) != null ? _c : binding.modifiers.body,
    lock: (_d = getBindingProp("lock")) != null ? _d : binding.modifiers.lock
  };
  el[INSTANCE_KEY] = {
    options,
    instance: Loading(options)
  };
};
const updateOptions = (newOptions, originalOptions) => {
  for (const key of Object.keys(originalOptions)) {
    if (isRef(originalOptions[key]))
      originalOptions[key].value = newOptions[key];
  }
};
const vLoading = {
  mounted(el, binding) {
    if (binding.value) {
      createInstance$1(el, binding);
    }
  },
  updated(el, binding) {
    const instance = el[INSTANCE_KEY];
    if (binding.oldValue !== binding.value) {
      if (binding.value && !binding.oldValue) {
        createInstance$1(el, binding);
      } else if (binding.value && binding.oldValue) {
        if (isObject$2(binding.value))
          updateOptions(binding.value, instance.options);
      } else {
        instance == null ? void 0 : instance.instance.close();
      }
    }
  },
  unmounted(el) {
    var _a2;
    (_a2 = el[INSTANCE_KEY]) == null ? void 0 : _a2.instance.close();
    el[INSTANCE_KEY] = null;
  }
};
const ElLoading = {
  install(app) {
    app.directive("loading", vLoading);
    app.config.globalProperties.$loading = Loading;
  },
  directive: vLoading,
  service: Loading
};
const messageTypes = ["success", "info", "warning", "error"];
const messageDefaults = mutable({
  customClass: "",
  center: false,
  dangerouslyUseHTMLString: false,
  duration: 3e3,
  icon: void 0,
  id: "",
  message: "",
  onClose: void 0,
  showClose: false,
  type: "info",
  plain: false,
  offset: 16,
  zIndex: 0,
  grouping: false,
  repeatNum: 1,
  appendTo: isClient ? document.body : void 0
});
const messageProps = buildProps({
  customClass: {
    type: String,
    default: messageDefaults.customClass
  },
  center: {
    type: Boolean,
    default: messageDefaults.center
  },
  dangerouslyUseHTMLString: {
    type: Boolean,
    default: messageDefaults.dangerouslyUseHTMLString
  },
  duration: {
    type: Number,
    default: messageDefaults.duration
  },
  icon: {
    type: iconPropType,
    default: messageDefaults.icon
  },
  id: {
    type: String,
    default: messageDefaults.id
  },
  message: {
    type: definePropType([
      String,
      Object,
      Function
    ]),
    default: messageDefaults.message
  },
  onClose: {
    type: definePropType(Function),
    default: messageDefaults.onClose
  },
  showClose: {
    type: Boolean,
    default: messageDefaults.showClose
  },
  type: {
    type: String,
    values: messageTypes,
    default: messageDefaults.type
  },
  plain: {
    type: Boolean,
    default: messageDefaults.plain
  },
  offset: {
    type: Number,
    default: messageDefaults.offset
  },
  zIndex: {
    type: Number,
    default: messageDefaults.zIndex
  },
  grouping: {
    type: Boolean,
    default: messageDefaults.grouping
  },
  repeatNum: {
    type: Number,
    default: messageDefaults.repeatNum
  }
});
const messageEmits = {
  destroy: () => true
};
const instances = shallowReactive([]);
const getInstance = (id) => {
  const idx = instances.findIndex((instance) => instance.id === id);
  const current = instances[idx];
  let prev;
  if (idx > 0) {
    prev = instances[idx - 1];
  }
  return { current, prev };
};
const getLastOffset = (id) => {
  const { prev } = getInstance(id);
  if (!prev)
    return 0;
  return prev.vm.exposed.bottom.value;
};
const getOffsetOrSpace = (id, offset) => {
  const idx = instances.findIndex((instance) => instance.id === id);
  return idx > 0 ? 16 : offset;
};
const __default__$1 = /* @__PURE__ */ defineComponent({
  name: "ElMessage"
});
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  ...__default__$1,
  props: messageProps,
  emits: messageEmits,
  setup(__props, { expose }) {
    const props = __props;
    const { Close } = TypeComponents;
    const { ns, zIndex: zIndex2 } = useGlobalComponentSettings("message");
    const { currentZIndex, nextZIndex } = zIndex2;
    const messageRef = ref();
    const visible = ref(false);
    const height = ref(0);
    let stopTimer = void 0;
    const badgeType = computed(() => props.type ? props.type === "error" ? "danger" : props.type : "info");
    const typeClass = computed(() => {
      const type2 = props.type;
      return { [ns.bm("icon", type2)]: type2 && TypeComponentsMap[type2] };
    });
    const iconComponent = computed(() => props.icon || TypeComponentsMap[props.type] || "");
    const lastOffset = computed(() => getLastOffset(props.id));
    const offset = computed(() => getOffsetOrSpace(props.id, props.offset) + lastOffset.value);
    const bottom = computed(() => height.value + offset.value);
    const customStyle = computed(() => ({
      top: `${offset.value}px`,
      zIndex: currentZIndex.value
    }));
    function startTimer() {
      if (props.duration === 0)
        return;
      ({ stop: stopTimer } = useTimeoutFn(() => {
        close2();
      }, props.duration));
    }
    function clearTimer() {
      stopTimer == null ? void 0 : stopTimer();
    }
    function close2() {
      visible.value = false;
    }
    function keydown({ code }) {
      if (code === EVENT_CODE.esc) {
        close2();
      }
    }
    onMounted(() => {
      startTimer();
      nextZIndex();
      visible.value = true;
    });
    watch(() => props.repeatNum, () => {
      clearTimer();
      startTimer();
    });
    useEventListener(document, "keydown", keydown);
    useResizeObserver(messageRef, () => {
      height.value = messageRef.value.getBoundingClientRect().height;
    });
    expose({
      visible,
      bottom,
      close: close2
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, {
        name: unref(ns).b("fade"),
        onBeforeLeave: _ctx.onClose,
        onAfterLeave: ($event) => _ctx.$emit("destroy"),
        persisted: ""
      }, {
        default: withCtx(() => [
          withDirectives(createBaseVNode("div", {
            id: _ctx.id,
            ref_key: "messageRef",
            ref: messageRef,
            class: normalizeClass([
              unref(ns).b(),
              { [unref(ns).m(_ctx.type)]: _ctx.type },
              unref(ns).is("center", _ctx.center),
              unref(ns).is("closable", _ctx.showClose),
              unref(ns).is("plain", _ctx.plain),
              _ctx.customClass
            ]),
            style: normalizeStyle(unref(customStyle)),
            role: "alert",
            onMouseenter: clearTimer,
            onMouseleave: startTimer
          }, [
            _ctx.repeatNum > 1 ? (openBlock(), createBlock(unref(ElBadge), {
              key: 0,
              value: _ctx.repeatNum,
              type: unref(badgeType),
              class: normalizeClass(unref(ns).e("badge"))
            }, null, 8, ["value", "type", "class"])) : createCommentVNode("v-if", true),
            unref(iconComponent) ? (openBlock(), createBlock(unref(ElIcon), {
              key: 1,
              class: normalizeClass([unref(ns).e("icon"), unref(typeClass)])
            }, {
              default: withCtx(() => [
                (openBlock(), createBlock(resolveDynamicComponent(unref(iconComponent))))
              ]),
              _: 1
            }, 8, ["class"])) : createCommentVNode("v-if", true),
            renderSlot(_ctx.$slots, "default", {}, () => [
              !_ctx.dangerouslyUseHTMLString ? (openBlock(), createElementBlock("p", {
                key: 0,
                class: normalizeClass(unref(ns).e("content"))
              }, toDisplayString(_ctx.message), 3)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                createCommentVNode(" Caution here, message could've been compromised, never use user's input as message "),
                createBaseVNode("p", {
                  class: normalizeClass(unref(ns).e("content")),
                  innerHTML: _ctx.message
                }, null, 10, ["innerHTML"])
              ], 2112))
            ]),
            _ctx.showClose ? (openBlock(), createBlock(unref(ElIcon), {
              key: 2,
              class: normalizeClass(unref(ns).e("closeBtn")),
              onClick: withModifiers(close2, ["stop"])
            }, {
              default: withCtx(() => [
                createVNode(unref(Close))
              ]),
              _: 1
            }, 8, ["class", "onClick"])) : createCommentVNode("v-if", true)
          ], 46, ["id"]), [
            [vShow, visible.value]
          ])
        ]),
        _: 3
      }, 8, ["name", "onBeforeLeave", "onAfterLeave"]);
    };
  }
});
var MessageConstructor = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__file", "message.vue"]]);
let seed$1 = 1;
const normalizeOptions = (params) => {
  const options = !params || isString$2(params) || isVNode(params) || isFunction$2(params) ? { message: params } : params;
  const normalized = {
    ...messageDefaults,
    ...options
  };
  if (!normalized.appendTo) {
    normalized.appendTo = document.body;
  } else if (isString$2(normalized.appendTo)) {
    let appendTo = document.querySelector(normalized.appendTo);
    if (!isElement(appendTo)) {
      appendTo = document.body;
    }
    normalized.appendTo = appendTo;
  }
  if (isBoolean$1(messageConfig.grouping) && !normalized.grouping) {
    normalized.grouping = messageConfig.grouping;
  }
  if (isNumber$1(messageConfig.duration) && normalized.duration === 3e3) {
    normalized.duration = messageConfig.duration;
  }
  if (isNumber$1(messageConfig.offset) && normalized.offset === 16) {
    normalized.offset = messageConfig.offset;
  }
  if (isBoolean$1(messageConfig.showClose) && !normalized.showClose) {
    normalized.showClose = messageConfig.showClose;
  }
  return normalized;
};
const closeMessage = (instance) => {
  const idx = instances.indexOf(instance);
  if (idx === -1)
    return;
  instances.splice(idx, 1);
  const { handler } = instance;
  handler.close();
};
const createMessage = ({ appendTo, ...options }, context) => {
  const id = `message_${seed$1++}`;
  const userOnClose = options.onClose;
  const container = document.createElement("div");
  const props = {
    ...options,
    id,
    onClose: () => {
      userOnClose == null ? void 0 : userOnClose();
      closeMessage(instance);
    },
    onDestroy: () => {
      render(null, container);
    }
  };
  const vnode = createVNode(MessageConstructor, props, isFunction$2(props.message) || isVNode(props.message) ? {
    default: isFunction$2(props.message) ? props.message : () => props.message
  } : null);
  vnode.appContext = context || message$1._context;
  render(vnode, container);
  appendTo.appendChild(container.firstElementChild);
  const vm = vnode.component;
  const handler = {
    close: () => {
      vm.exposed.visible.value = false;
    }
  };
  const instance = {
    id,
    vnode,
    vm,
    handler,
    props: vnode.component.props
  };
  return instance;
};
const message$1 = (options = {}, context) => {
  if (!isClient)
    return { close: () => void 0 };
  const normalized = normalizeOptions(options);
  if (normalized.grouping && instances.length) {
    const instance2 = instances.find(({ vnode: vm }) => {
      var _a2;
      return ((_a2 = vm.props) == null ? void 0 : _a2.message) === normalized.message;
    });
    if (instance2) {
      instance2.props.repeatNum += 1;
      instance2.props.type = normalized.type;
      return instance2.handler;
    }
  }
  if (isNumber$1(messageConfig.max) && instances.length >= messageConfig.max) {
    return { close: () => void 0 };
  }
  const instance = createMessage(normalized, context);
  instances.push(instance);
  return instance.handler;
};
messageTypes.forEach((type2) => {
  message$1[type2] = (options = {}, appContext) => {
    const normalized = normalizeOptions(options);
    return message$1({ ...normalized, type: type2 }, appContext);
  };
});
function closeAll$1(type2) {
  for (const instance of instances) {
    if (!type2 || type2 === instance.props.type) {
      instance.handler.close();
    }
  }
}
message$1.closeAll = closeAll$1;
message$1._context = null;
const ElMessage = withInstallFunction(message$1, "$message");
const notificationTypes = [
  "success",
  "info",
  "warning",
  "error"
];
const notificationProps = buildProps({
  customClass: {
    type: String,
    default: ""
  },
  dangerouslyUseHTMLString: Boolean,
  duration: {
    type: Number,
    default: 4500
  },
  icon: {
    type: iconPropType
  },
  id: {
    type: String,
    default: ""
  },
  message: {
    type: definePropType([
      String,
      Object,
      Function
    ]),
    default: ""
  },
  offset: {
    type: Number,
    default: 0
  },
  onClick: {
    type: definePropType(Function),
    default: () => void 0
  },
  onClose: {
    type: definePropType(Function),
    required: true
  },
  position: {
    type: String,
    values: ["top-right", "top-left", "bottom-right", "bottom-left"],
    default: "top-right"
  },
  showClose: {
    type: Boolean,
    default: true
  },
  title: {
    type: String,
    default: ""
  },
  type: {
    type: String,
    values: [...notificationTypes, ""],
    default: ""
  },
  zIndex: Number
});
const notificationEmits = {
  destroy: () => true
};
const __default__ = /* @__PURE__ */ defineComponent({
  name: "ElNotification"
});
const _sfc_main = /* @__PURE__ */ defineComponent({
  ...__default__,
  props: notificationProps,
  emits: notificationEmits,
  setup(__props, { expose }) {
    const props = __props;
    const { ns, zIndex: zIndex2 } = useGlobalComponentSettings("notification");
    const { nextZIndex, currentZIndex } = zIndex2;
    const { Close } = CloseComponents;
    const visible = ref(false);
    let timer = void 0;
    const typeClass = computed(() => {
      const type2 = props.type;
      return type2 && TypeComponentsMap[props.type] ? ns.m(type2) : "";
    });
    const iconComponent = computed(() => {
      if (!props.type)
        return props.icon;
      return TypeComponentsMap[props.type] || props.icon;
    });
    const horizontalClass = computed(() => props.position.endsWith("right") ? "right" : "left");
    const verticalProperty = computed(() => props.position.startsWith("top") ? "top" : "bottom");
    const positionStyle = computed(() => {
      var _a2;
      return {
        [verticalProperty.value]: `${props.offset}px`,
        zIndex: (_a2 = props.zIndex) != null ? _a2 : currentZIndex.value
      };
    });
    function startTimer() {
      if (props.duration > 0) {
        ({ stop: timer } = useTimeoutFn(() => {
          if (visible.value)
            close2();
        }, props.duration));
      }
    }
    function clearTimer() {
      timer == null ? void 0 : timer();
    }
    function close2() {
      visible.value = false;
    }
    function onKeydown({ code }) {
      if (code === EVENT_CODE.delete || code === EVENT_CODE.backspace) {
        clearTimer();
      } else if (code === EVENT_CODE.esc) {
        if (visible.value) {
          close2();
        }
      } else {
        startTimer();
      }
    }
    onMounted(() => {
      startTimer();
      nextZIndex();
      visible.value = true;
    });
    useEventListener(document, "keydown", onKeydown);
    expose({
      visible,
      close: close2
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, {
        name: unref(ns).b("fade"),
        onBeforeLeave: _ctx.onClose,
        onAfterLeave: ($event) => _ctx.$emit("destroy"),
        persisted: ""
      }, {
        default: withCtx(() => [
          withDirectives(createBaseVNode("div", {
            id: _ctx.id,
            class: normalizeClass([unref(ns).b(), _ctx.customClass, unref(horizontalClass)]),
            style: normalizeStyle(unref(positionStyle)),
            role: "alert",
            onMouseenter: clearTimer,
            onMouseleave: startTimer,
            onClick: _ctx.onClick
          }, [
            unref(iconComponent) ? (openBlock(), createBlock(unref(ElIcon), {
              key: 0,
              class: normalizeClass([unref(ns).e("icon"), unref(typeClass)])
            }, {
              default: withCtx(() => [
                (openBlock(), createBlock(resolveDynamicComponent(unref(iconComponent))))
              ]),
              _: 1
            }, 8, ["class"])) : createCommentVNode("v-if", true),
            createBaseVNode("div", {
              class: normalizeClass(unref(ns).e("group"))
            }, [
              createBaseVNode("h2", {
                class: normalizeClass(unref(ns).e("title")),
                textContent: toDisplayString(_ctx.title)
              }, null, 10, ["textContent"]),
              withDirectives(createBaseVNode("div", {
                class: normalizeClass(unref(ns).e("content")),
                style: normalizeStyle(!!_ctx.title ? void 0 : { margin: 0 })
              }, [
                renderSlot(_ctx.$slots, "default", {}, () => [
                  !_ctx.dangerouslyUseHTMLString ? (openBlock(), createElementBlock("p", { key: 0 }, toDisplayString(_ctx.message), 1)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                    createCommentVNode(" Caution here, message could've been compromised, never use user's input as message "),
                    createBaseVNode("p", { innerHTML: _ctx.message }, null, 8, ["innerHTML"])
                  ], 2112))
                ])
              ], 6), [
                [vShow, _ctx.message]
              ]),
              _ctx.showClose ? (openBlock(), createBlock(unref(ElIcon), {
                key: 0,
                class: normalizeClass(unref(ns).e("closeBtn")),
                onClick: withModifiers(close2, ["stop"])
              }, {
                default: withCtx(() => [
                  createVNode(unref(Close))
                ]),
                _: 1
              }, 8, ["class", "onClick"])) : createCommentVNode("v-if", true)
            ], 2)
          ], 46, ["id", "onClick"]), [
            [vShow, visible.value]
          ])
        ]),
        _: 3
      }, 8, ["name", "onBeforeLeave", "onAfterLeave"]);
    };
  }
});
var NotificationConstructor = /* @__PURE__ */ _export_sfc(_sfc_main, [["__file", "notification.vue"]]);
const notifications = {
  "top-left": [],
  "top-right": [],
  "bottom-left": [],
  "bottom-right": []
};
const GAP_SIZE = 16;
let seed = 1;
const notify = function(options = {}, context) {
  if (!isClient)
    return { close: () => void 0 };
  if (isString$2(options) || isVNode(options)) {
    options = { message: options };
  }
  const position = options.position || "top-right";
  let verticalOffset = options.offset || 0;
  notifications[position].forEach(({ vm: vm2 }) => {
    var _a2;
    verticalOffset += (((_a2 = vm2.el) == null ? void 0 : _a2.offsetHeight) || 0) + GAP_SIZE;
  });
  verticalOffset += GAP_SIZE;
  const id = `notification_${seed++}`;
  const userOnClose = options.onClose;
  const props = {
    ...options,
    offset: verticalOffset,
    id,
    onClose: () => {
      close$1(id, position, userOnClose);
    }
  };
  let appendTo = document.body;
  if (isElement(options.appendTo)) {
    appendTo = options.appendTo;
  } else if (isString$2(options.appendTo)) {
    appendTo = document.querySelector(options.appendTo);
  }
  if (!isElement(appendTo)) {
    appendTo = document.body;
  }
  const container = document.createElement("div");
  const vm = createVNode(NotificationConstructor, props, isFunction$2(props.message) ? props.message : isVNode(props.message) ? () => props.message : null);
  vm.appContext = isUndefined$1(context) ? notify._context : context;
  vm.props.onDestroy = () => {
    render(null, container);
  };
  render(vm, container);
  notifications[position].push({ vm });
  appendTo.appendChild(container.firstElementChild);
  return {
    close: () => {
      vm.component.exposed.visible.value = false;
    }
  };
};
notificationTypes.forEach((type2) => {
  notify[type2] = (options = {}, appContext) => {
    if (isString$2(options) || isVNode(options)) {
      options = {
        message: options
      };
    }
    return notify({ ...options, type: type2 }, appContext);
  };
});
function close$1(id, position, userOnClose) {
  const orientedNotifications = notifications[position];
  const idx = orientedNotifications.findIndex(({ vm: vm2 }) => {
    var _a2;
    return ((_a2 = vm2.component) == null ? void 0 : _a2.props.id) === id;
  });
  if (idx === -1)
    return;
  const { vm } = orientedNotifications[idx];
  if (!vm)
    return;
  userOnClose == null ? void 0 : userOnClose(vm);
  const removedHeight = vm.el.offsetHeight;
  const verticalPos = position.split("-")[0];
  orientedNotifications.splice(idx, 1);
  const len = orientedNotifications.length;
  if (len < 1)
    return;
  for (let i2 = idx; i2 < len; i2++) {
    const { el, component } = orientedNotifications[i2].vm;
    const pos = Number.parseInt(el.style[verticalPos], 10) - removedHeight - GAP_SIZE;
    component.props.offset = pos;
  }
}
function closeAll() {
  for (const orientedNotifications of Object.values(notifications)) {
    orientedNotifications.forEach(({ vm }) => {
      vm.component.exposed.visible.value = false;
    });
  }
}
notify.closeAll = closeAll;
notify._context = null;
const ElNotification = withInstallFunction(notify, "$notify");
function dateFormat(fmt, date) {
  let ret;
  const opt = {
    "Y+": date.getFullYear().toString(),
    // 年
    "m+": (date.getMonth() + 1).toString(),
    // 月
    "d+": date.getDate().toString(),
    // 日
    "H+": date.getHours().toString(),
    // 时
    "M+": date.getMinutes().toString(),
    // 分
    "S+": date.getSeconds().toString()
    // 秒
    // 有其他格式化字符需求可以继续添加，必须转化成字符串
  };
  for (const k2 in opt) {
    ret = new RegExp("(" + k2 + ")").exec(fmt);
    if (ret) {
      fmt = fmt.replace(ret[1], ret[1].length === 1 ? opt[k2] : opt[k2].padStart(ret[1].length, "0"));
    }
  }
  return fmt;
}
function removeTrailingSlash(str) {
  return `${str}`.replace(/\/+$/, "");
}
function Sleep(second) {
  return new Promise((resolve2) => setTimeout(resolve2, second * 1e3));
}
function Time() {
  return (/* @__PURE__ */ new Date()).getTime() / 1e3;
}
var byteToHex = [];
for (var i$1 = 0; i$1 < 256; ++i$1) {
  byteToHex.push((i$1 + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
var getRandomValues;
var rnds8 = new Uint8Array(16);
function rng() {
  if (!getRandomValues) {
    getRandomValues = typeof crypto !== "undefined" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);
    if (!getRandomValues) {
      throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
    }
  }
  return getRandomValues(rnds8);
}
var randomUUID = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID.bind(crypto);
const native = {
  randomUUID
};
function v4(options, buf, offset) {
  if (native.randomUUID && true && !options) {
    return native.randomUUID();
  }
  options = options || {};
  var rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  return unsafeStringify(rnds);
}
var indexLight = { exports: {} };
var indexMinimal = {};
var minimal = {};
var aspromise = asPromise$1;
function asPromise$1(fn, ctx) {
  var params = new Array(arguments.length - 1), offset = 0, index = 2, pending = true;
  while (index < arguments.length)
    params[offset++] = arguments[index++];
  return new Promise(function executor(resolve2, reject) {
    params[offset] = function callback(err) {
      if (pending) {
        pending = false;
        if (err)
          reject(err);
        else {
          var params2 = new Array(arguments.length - 1), offset2 = 0;
          while (offset2 < params2.length)
            params2[offset2++] = arguments[offset2];
          resolve2.apply(null, params2);
        }
      }
    };
    try {
      fn.apply(ctx || null, params);
    } catch (err) {
      if (pending) {
        pending = false;
        reject(err);
      }
    }
  });
}
var base64$1 = {};
(function(exports) {
  var base642 = exports;
  base642.length = function length(string) {
    var p2 = string.length;
    if (!p2)
      return 0;
    var n2 = 0;
    while (--p2 % 4 > 1 && string.charAt(p2) === "=")
      ++n2;
    return Math.ceil(string.length * 3) / 4 - n2;
  };
  var b64 = new Array(64);
  var s64 = new Array(123);
  for (var i2 = 0; i2 < 64; )
    s64[b64[i2] = i2 < 26 ? i2 + 65 : i2 < 52 ? i2 + 71 : i2 < 62 ? i2 - 4 : i2 - 59 | 43] = i2++;
  base642.encode = function encode3(buffer2, start2, end2) {
    var parts = null, chunk = [];
    var i3 = 0, j2 = 0, t2;
    while (start2 < end2) {
      var b2 = buffer2[start2++];
      switch (j2) {
        case 0:
          chunk[i3++] = b64[b2 >> 2];
          t2 = (b2 & 3) << 4;
          j2 = 1;
          break;
        case 1:
          chunk[i3++] = b64[t2 | b2 >> 4];
          t2 = (b2 & 15) << 2;
          j2 = 2;
          break;
        case 2:
          chunk[i3++] = b64[t2 | b2 >> 6];
          chunk[i3++] = b64[b2 & 63];
          j2 = 0;
          break;
      }
      if (i3 > 8191) {
        (parts || (parts = [])).push(String.fromCharCode.apply(String, chunk));
        i3 = 0;
      }
    }
    if (j2) {
      chunk[i3++] = b64[t2];
      chunk[i3++] = 61;
      if (j2 === 1)
        chunk[i3++] = 61;
    }
    if (parts) {
      if (i3)
        parts.push(String.fromCharCode.apply(String, chunk.slice(0, i3)));
      return parts.join("");
    }
    return String.fromCharCode.apply(String, chunk.slice(0, i3));
  };
  var invalidEncoding = "invalid encoding";
  base642.decode = function decode2(string, buffer2, offset) {
    var start2 = offset;
    var j2 = 0, t2;
    for (var i3 = 0; i3 < string.length; ) {
      var c2 = string.charCodeAt(i3++);
      if (c2 === 61 && j2 > 1)
        break;
      if ((c2 = s64[c2]) === void 0)
        throw Error(invalidEncoding);
      switch (j2) {
        case 0:
          t2 = c2;
          j2 = 1;
          break;
        case 1:
          buffer2[offset++] = t2 << 2 | (c2 & 48) >> 4;
          t2 = c2;
          j2 = 2;
          break;
        case 2:
          buffer2[offset++] = (t2 & 15) << 4 | (c2 & 60) >> 2;
          t2 = c2;
          j2 = 3;
          break;
        case 3:
          buffer2[offset++] = (t2 & 3) << 6 | c2;
          j2 = 0;
          break;
      }
    }
    if (j2 === 1)
      throw Error(invalidEncoding);
    return offset - start2;
  };
  base642.test = function test2(string) {
    return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(string);
  };
})(base64$1);
var eventemitter = EventEmitter;
function EventEmitter() {
  this._listeners = {};
}
EventEmitter.prototype.on = function on(evt, fn, ctx) {
  (this._listeners[evt] || (this._listeners[evt] = [])).push({
    fn,
    ctx: ctx || this
  });
  return this;
};
EventEmitter.prototype.off = function off(evt, fn) {
  if (evt === void 0)
    this._listeners = {};
  else {
    if (fn === void 0)
      this._listeners[evt] = [];
    else {
      var listeners = this._listeners[evt];
      for (var i2 = 0; i2 < listeners.length; )
        if (listeners[i2].fn === fn)
          listeners.splice(i2, 1);
        else
          ++i2;
    }
  }
  return this;
};
EventEmitter.prototype.emit = function emit2(evt) {
  var listeners = this._listeners[evt];
  if (listeners) {
    var args = [], i2 = 1;
    for (; i2 < arguments.length; )
      args.push(arguments[i2++]);
    for (i2 = 0; i2 < listeners.length; )
      listeners[i2].fn.apply(listeners[i2++].ctx, args);
  }
  return this;
};
var float = factory(factory);
function factory(exports) {
  if (typeof Float32Array !== "undefined") (function() {
    var f32 = new Float32Array([-0]), f8b = new Uint8Array(f32.buffer), le2 = f8b[3] === 128;
    function writeFloat_f32_cpy(val, buf, pos) {
      f32[0] = val;
      buf[pos] = f8b[0];
      buf[pos + 1] = f8b[1];
      buf[pos + 2] = f8b[2];
      buf[pos + 3] = f8b[3];
    }
    function writeFloat_f32_rev(val, buf, pos) {
      f32[0] = val;
      buf[pos] = f8b[3];
      buf[pos + 1] = f8b[2];
      buf[pos + 2] = f8b[1];
      buf[pos + 3] = f8b[0];
    }
    exports.writeFloatLE = le2 ? writeFloat_f32_cpy : writeFloat_f32_rev;
    exports.writeFloatBE = le2 ? writeFloat_f32_rev : writeFloat_f32_cpy;
    function readFloat_f32_cpy(buf, pos) {
      f8b[0] = buf[pos];
      f8b[1] = buf[pos + 1];
      f8b[2] = buf[pos + 2];
      f8b[3] = buf[pos + 3];
      return f32[0];
    }
    function readFloat_f32_rev(buf, pos) {
      f8b[3] = buf[pos];
      f8b[2] = buf[pos + 1];
      f8b[1] = buf[pos + 2];
      f8b[0] = buf[pos + 3];
      return f32[0];
    }
    exports.readFloatLE = le2 ? readFloat_f32_cpy : readFloat_f32_rev;
    exports.readFloatBE = le2 ? readFloat_f32_rev : readFloat_f32_cpy;
  })();
  else (function() {
    function writeFloat_ieee754(writeUint, val, buf, pos) {
      var sign = val < 0 ? 1 : 0;
      if (sign)
        val = -val;
      if (val === 0)
        writeUint(1 / val > 0 ? (
          /* positive */
          0
        ) : (
          /* negative 0 */
          2147483648
        ), buf, pos);
      else if (isNaN(val))
        writeUint(2143289344, buf, pos);
      else if (val > 34028234663852886e22)
        writeUint((sign << 31 | 2139095040) >>> 0, buf, pos);
      else if (val < 11754943508222875e-54)
        writeUint((sign << 31 | Math.round(val / 1401298464324817e-60)) >>> 0, buf, pos);
      else {
        var exponent = Math.floor(Math.log(val) / Math.LN2), mantissa = Math.round(val * Math.pow(2, -exponent) * 8388608) & 8388607;
        writeUint((sign << 31 | exponent + 127 << 23 | mantissa) >>> 0, buf, pos);
      }
    }
    exports.writeFloatLE = writeFloat_ieee754.bind(null, writeUintLE);
    exports.writeFloatBE = writeFloat_ieee754.bind(null, writeUintBE);
    function readFloat_ieee754(readUint, buf, pos) {
      var uint = readUint(buf, pos), sign = (uint >> 31) * 2 + 1, exponent = uint >>> 23 & 255, mantissa = uint & 8388607;
      return exponent === 255 ? mantissa ? NaN : sign * Infinity : exponent === 0 ? sign * 1401298464324817e-60 * mantissa : sign * Math.pow(2, exponent - 150) * (mantissa + 8388608);
    }
    exports.readFloatLE = readFloat_ieee754.bind(null, readUintLE);
    exports.readFloatBE = readFloat_ieee754.bind(null, readUintBE);
  })();
  if (typeof Float64Array !== "undefined") (function() {
    var f64 = new Float64Array([-0]), f8b = new Uint8Array(f64.buffer), le2 = f8b[7] === 128;
    function writeDouble_f64_cpy(val, buf, pos) {
      f64[0] = val;
      buf[pos] = f8b[0];
      buf[pos + 1] = f8b[1];
      buf[pos + 2] = f8b[2];
      buf[pos + 3] = f8b[3];
      buf[pos + 4] = f8b[4];
      buf[pos + 5] = f8b[5];
      buf[pos + 6] = f8b[6];
      buf[pos + 7] = f8b[7];
    }
    function writeDouble_f64_rev(val, buf, pos) {
      f64[0] = val;
      buf[pos] = f8b[7];
      buf[pos + 1] = f8b[6];
      buf[pos + 2] = f8b[5];
      buf[pos + 3] = f8b[4];
      buf[pos + 4] = f8b[3];
      buf[pos + 5] = f8b[2];
      buf[pos + 6] = f8b[1];
      buf[pos + 7] = f8b[0];
    }
    exports.writeDoubleLE = le2 ? writeDouble_f64_cpy : writeDouble_f64_rev;
    exports.writeDoubleBE = le2 ? writeDouble_f64_rev : writeDouble_f64_cpy;
    function readDouble_f64_cpy(buf, pos) {
      f8b[0] = buf[pos];
      f8b[1] = buf[pos + 1];
      f8b[2] = buf[pos + 2];
      f8b[3] = buf[pos + 3];
      f8b[4] = buf[pos + 4];
      f8b[5] = buf[pos + 5];
      f8b[6] = buf[pos + 6];
      f8b[7] = buf[pos + 7];
      return f64[0];
    }
    function readDouble_f64_rev(buf, pos) {
      f8b[7] = buf[pos];
      f8b[6] = buf[pos + 1];
      f8b[5] = buf[pos + 2];
      f8b[4] = buf[pos + 3];
      f8b[3] = buf[pos + 4];
      f8b[2] = buf[pos + 5];
      f8b[1] = buf[pos + 6];
      f8b[0] = buf[pos + 7];
      return f64[0];
    }
    exports.readDoubleLE = le2 ? readDouble_f64_cpy : readDouble_f64_rev;
    exports.readDoubleBE = le2 ? readDouble_f64_rev : readDouble_f64_cpy;
  })();
  else (function() {
    function writeDouble_ieee754(writeUint, off0, off1, val, buf, pos) {
      var sign = val < 0 ? 1 : 0;
      if (sign)
        val = -val;
      if (val === 0) {
        writeUint(0, buf, pos + off0);
        writeUint(1 / val > 0 ? (
          /* positive */
          0
        ) : (
          /* negative 0 */
          2147483648
        ), buf, pos + off1);
      } else if (isNaN(val)) {
        writeUint(0, buf, pos + off0);
        writeUint(2146959360, buf, pos + off1);
      } else if (val > 17976931348623157e292) {
        writeUint(0, buf, pos + off0);
        writeUint((sign << 31 | 2146435072) >>> 0, buf, pos + off1);
      } else {
        var mantissa;
        if (val < 22250738585072014e-324) {
          mantissa = val / 5e-324;
          writeUint(mantissa >>> 0, buf, pos + off0);
          writeUint((sign << 31 | mantissa / 4294967296) >>> 0, buf, pos + off1);
        } else {
          var exponent = Math.floor(Math.log(val) / Math.LN2);
          if (exponent === 1024)
            exponent = 1023;
          mantissa = val * Math.pow(2, -exponent);
          writeUint(mantissa * 4503599627370496 >>> 0, buf, pos + off0);
          writeUint((sign << 31 | exponent + 1023 << 20 | mantissa * 1048576 & 1048575) >>> 0, buf, pos + off1);
        }
      }
    }
    exports.writeDoubleLE = writeDouble_ieee754.bind(null, writeUintLE, 0, 4);
    exports.writeDoubleBE = writeDouble_ieee754.bind(null, writeUintBE, 4, 0);
    function readDouble_ieee754(readUint, off0, off1, buf, pos) {
      var lo = readUint(buf, pos + off0), hi = readUint(buf, pos + off1);
      var sign = (hi >> 31) * 2 + 1, exponent = hi >>> 20 & 2047, mantissa = 4294967296 * (hi & 1048575) + lo;
      return exponent === 2047 ? mantissa ? NaN : sign * Infinity : exponent === 0 ? sign * 5e-324 * mantissa : sign * Math.pow(2, exponent - 1075) * (mantissa + 4503599627370496);
    }
    exports.readDoubleLE = readDouble_ieee754.bind(null, readUintLE, 0, 4);
    exports.readDoubleBE = readDouble_ieee754.bind(null, readUintBE, 4, 0);
  })();
  return exports;
}
function writeUintLE(val, buf, pos) {
  buf[pos] = val & 255;
  buf[pos + 1] = val >>> 8 & 255;
  buf[pos + 2] = val >>> 16 & 255;
  buf[pos + 3] = val >>> 24;
}
function writeUintBE(val, buf, pos) {
  buf[pos] = val >>> 24;
  buf[pos + 1] = val >>> 16 & 255;
  buf[pos + 2] = val >>> 8 & 255;
  buf[pos + 3] = val & 255;
}
function readUintLE(buf, pos) {
  return (buf[pos] | buf[pos + 1] << 8 | buf[pos + 2] << 16 | buf[pos + 3] << 24) >>> 0;
}
function readUintBE(buf, pos) {
  return (buf[pos] << 24 | buf[pos + 1] << 16 | buf[pos + 2] << 8 | buf[pos + 3]) >>> 0;
}
var inquire_1 = inquire$1;
function inquire$1(moduleName) {
  try {
    var mod = eval("quire".replace(/^/, "re"))(moduleName);
    if (mod && (mod.length || Object.keys(mod).length))
      return mod;
  } catch (e2) {
  }
  return null;
}
var utf8$2 = {};
(function(exports) {
  var utf82 = exports;
  utf82.length = function utf8_length(string) {
    var len = 0, c2 = 0;
    for (var i2 = 0; i2 < string.length; ++i2) {
      c2 = string.charCodeAt(i2);
      if (c2 < 128)
        len += 1;
      else if (c2 < 2048)
        len += 2;
      else if ((c2 & 64512) === 55296 && (string.charCodeAt(i2 + 1) & 64512) === 56320) {
        ++i2;
        len += 4;
      } else
        len += 3;
    }
    return len;
  };
  utf82.read = function utf8_read(buffer2, start2, end2) {
    var len = end2 - start2;
    if (len < 1)
      return "";
    var parts = null, chunk = [], i2 = 0, t2;
    while (start2 < end2) {
      t2 = buffer2[start2++];
      if (t2 < 128)
        chunk[i2++] = t2;
      else if (t2 > 191 && t2 < 224)
        chunk[i2++] = (t2 & 31) << 6 | buffer2[start2++] & 63;
      else if (t2 > 239 && t2 < 365) {
        t2 = ((t2 & 7) << 18 | (buffer2[start2++] & 63) << 12 | (buffer2[start2++] & 63) << 6 | buffer2[start2++] & 63) - 65536;
        chunk[i2++] = 55296 + (t2 >> 10);
        chunk[i2++] = 56320 + (t2 & 1023);
      } else
        chunk[i2++] = (t2 & 15) << 12 | (buffer2[start2++] & 63) << 6 | buffer2[start2++] & 63;
      if (i2 > 8191) {
        (parts || (parts = [])).push(String.fromCharCode.apply(String, chunk));
        i2 = 0;
      }
    }
    if (parts) {
      if (i2)
        parts.push(String.fromCharCode.apply(String, chunk.slice(0, i2)));
      return parts.join("");
    }
    return String.fromCharCode.apply(String, chunk.slice(0, i2));
  };
  utf82.write = function utf8_write(string, buffer2, offset) {
    var start2 = offset, c1, c2;
    for (var i2 = 0; i2 < string.length; ++i2) {
      c1 = string.charCodeAt(i2);
      if (c1 < 128) {
        buffer2[offset++] = c1;
      } else if (c1 < 2048) {
        buffer2[offset++] = c1 >> 6 | 192;
        buffer2[offset++] = c1 & 63 | 128;
      } else if ((c1 & 64512) === 55296 && ((c2 = string.charCodeAt(i2 + 1)) & 64512) === 56320) {
        c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
        ++i2;
        buffer2[offset++] = c1 >> 18 | 240;
        buffer2[offset++] = c1 >> 12 & 63 | 128;
        buffer2[offset++] = c1 >> 6 & 63 | 128;
        buffer2[offset++] = c1 & 63 | 128;
      } else {
        buffer2[offset++] = c1 >> 12 | 224;
        buffer2[offset++] = c1 >> 6 & 63 | 128;
        buffer2[offset++] = c1 & 63 | 128;
      }
    }
    return offset - start2;
  };
})(utf8$2);
var pool_1 = pool;
function pool(alloc2, slice, size) {
  var SIZE = size || 8192;
  var MAX = SIZE >>> 1;
  var slab = null;
  var offset = SIZE;
  return function pool_alloc(size2) {
    if (size2 < 1 || size2 > MAX)
      return alloc2(size2);
    if (offset + size2 > SIZE) {
      slab = alloc2(SIZE);
      offset = 0;
    }
    var buf = slice.call(slab, offset, offset += size2);
    if (offset & 7)
      offset = (offset | 7) + 1;
    return buf;
  };
}
var longbits;
var hasRequiredLongbits;
function requireLongbits() {
  if (hasRequiredLongbits) return longbits;
  hasRequiredLongbits = 1;
  longbits = LongBits2;
  var util2 = requireMinimal();
  function LongBits2(lo, hi) {
    this.lo = lo >>> 0;
    this.hi = hi >>> 0;
  }
  var zero = LongBits2.zero = new LongBits2(0, 0);
  zero.toNumber = function() {
    return 0;
  };
  zero.zzEncode = zero.zzDecode = function() {
    return this;
  };
  zero.length = function() {
    return 1;
  };
  var zeroHash = LongBits2.zeroHash = "\0\0\0\0\0\0\0\0";
  LongBits2.fromNumber = function fromNumber(value) {
    if (value === 0)
      return zero;
    var sign = value < 0;
    if (sign)
      value = -value;
    var lo = value >>> 0, hi = (value - lo) / 4294967296 >>> 0;
    if (sign) {
      hi = ~hi >>> 0;
      lo = ~lo >>> 0;
      if (++lo > 4294967295) {
        lo = 0;
        if (++hi > 4294967295)
          hi = 0;
      }
    }
    return new LongBits2(lo, hi);
  };
  LongBits2.from = function from(value) {
    if (typeof value === "number")
      return LongBits2.fromNumber(value);
    if (util2.isString(value)) {
      if (util2.Long)
        value = util2.Long.fromString(value);
      else
        return LongBits2.fromNumber(parseInt(value, 10));
    }
    return value.low || value.high ? new LongBits2(value.low >>> 0, value.high >>> 0) : zero;
  };
  LongBits2.prototype.toNumber = function toNumber2(unsigned) {
    if (!unsigned && this.hi >>> 31) {
      var lo = ~this.lo + 1 >>> 0, hi = ~this.hi >>> 0;
      if (!lo)
        hi = hi + 1 >>> 0;
      return -(lo + hi * 4294967296);
    }
    return this.lo + this.hi * 4294967296;
  };
  LongBits2.prototype.toLong = function toLong(unsigned) {
    return util2.Long ? new util2.Long(this.lo | 0, this.hi | 0, Boolean(unsigned)) : { low: this.lo | 0, high: this.hi | 0, unsigned: Boolean(unsigned) };
  };
  var charCodeAt = String.prototype.charCodeAt;
  LongBits2.fromHash = function fromHash(hash) {
    if (hash === zeroHash)
      return zero;
    return new LongBits2(
      (charCodeAt.call(hash, 0) | charCodeAt.call(hash, 1) << 8 | charCodeAt.call(hash, 2) << 16 | charCodeAt.call(hash, 3) << 24) >>> 0,
      (charCodeAt.call(hash, 4) | charCodeAt.call(hash, 5) << 8 | charCodeAt.call(hash, 6) << 16 | charCodeAt.call(hash, 7) << 24) >>> 0
    );
  };
  LongBits2.prototype.toHash = function toHash() {
    return String.fromCharCode(
      this.lo & 255,
      this.lo >>> 8 & 255,
      this.lo >>> 16 & 255,
      this.lo >>> 24,
      this.hi & 255,
      this.hi >>> 8 & 255,
      this.hi >>> 16 & 255,
      this.hi >>> 24
    );
  };
  LongBits2.prototype.zzEncode = function zzEncode() {
    var mask = this.hi >> 31;
    this.hi = ((this.hi << 1 | this.lo >>> 31) ^ mask) >>> 0;
    this.lo = (this.lo << 1 ^ mask) >>> 0;
    return this;
  };
  LongBits2.prototype.zzDecode = function zzDecode() {
    var mask = -(this.lo & 1);
    this.lo = ((this.lo >>> 1 | this.hi << 31) ^ mask) >>> 0;
    this.hi = (this.hi >>> 1 ^ mask) >>> 0;
    return this;
  };
  LongBits2.prototype.length = function length() {
    var part0 = this.lo, part1 = (this.lo >>> 28 | this.hi << 4) >>> 0, part2 = this.hi >>> 24;
    return part2 === 0 ? part1 === 0 ? part0 < 16384 ? part0 < 128 ? 1 : 2 : part0 < 2097152 ? 3 : 4 : part1 < 16384 ? part1 < 128 ? 5 : 6 : part1 < 2097152 ? 7 : 8 : part2 < 128 ? 9 : 10;
  };
  return longbits;
}
var hasRequiredMinimal;
function requireMinimal() {
  if (hasRequiredMinimal) return minimal;
  hasRequiredMinimal = 1;
  (function(exports) {
    var util2 = exports;
    util2.asPromise = aspromise;
    util2.base64 = base64$1;
    util2.EventEmitter = eventemitter;
    util2.float = float;
    util2.inquire = inquire_1;
    util2.utf8 = utf8$2;
    util2.pool = pool_1;
    util2.LongBits = requireLongbits();
    util2.isNode = Boolean(typeof commonjsGlobal !== "undefined" && commonjsGlobal && commonjsGlobal.process && commonjsGlobal.process.versions && commonjsGlobal.process.versions.node);
    util2.global = util2.isNode && commonjsGlobal || typeof window !== "undefined" && window || typeof self !== "undefined" && self || commonjsGlobal;
    util2.emptyArray = Object.freeze ? Object.freeze([]) : (
      /* istanbul ignore next */
      []
    );
    util2.emptyObject = Object.freeze ? Object.freeze({}) : (
      /* istanbul ignore next */
      {}
    );
    util2.isInteger = Number.isInteger || /* istanbul ignore next */
    function isInteger(value) {
      return typeof value === "number" && isFinite(value) && Math.floor(value) === value;
    };
    util2.isString = function isString2(value) {
      return typeof value === "string" || value instanceof String;
    };
    util2.isObject = function isObject2(value) {
      return value && typeof value === "object";
    };
    util2.isset = /**
     * Checks if a property on a message is considered to be present.
     * @param {Object} obj Plain object or message instance
     * @param {string} prop Property name
     * @returns {boolean} `true` if considered to be present, otherwise `false`
     */
    util2.isSet = function isSet2(obj, prop) {
      var value = obj[prop];
      if (value != null && obj.hasOwnProperty(prop))
        return typeof value !== "object" || (Array.isArray(value) ? value.length : Object.keys(value).length) > 0;
      return false;
    };
    util2.Buffer = function() {
      try {
        var Buffer2 = util2.inquire("buffer").Buffer;
        return Buffer2.prototype.utf8Write ? Buffer2 : (
          /* istanbul ignore next */
          null
        );
      } catch (e2) {
        return null;
      }
    }();
    util2._Buffer_from = null;
    util2._Buffer_allocUnsafe = null;
    util2.newBuffer = function newBuffer(sizeOrArray) {
      return typeof sizeOrArray === "number" ? util2.Buffer ? util2._Buffer_allocUnsafe(sizeOrArray) : new util2.Array(sizeOrArray) : util2.Buffer ? util2._Buffer_from(sizeOrArray) : typeof Uint8Array === "undefined" ? sizeOrArray : new Uint8Array(sizeOrArray);
    };
    util2.Array = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    util2.Long = /* istanbul ignore next */
    util2.global.dcodeIO && /* istanbul ignore next */
    util2.global.dcodeIO.Long || /* istanbul ignore next */
    util2.global.Long || util2.inquire("long");
    util2.key2Re = /^true|false|0|1$/;
    util2.key32Re = /^-?(?:0|[1-9][0-9]*)$/;
    util2.key64Re = /^(?:[\\x00-\\xff]{8}|-?(?:0|[1-9][0-9]*))$/;
    util2.longToHash = function longToHash(value) {
      return value ? util2.LongBits.from(value).toHash() : util2.LongBits.zeroHash;
    };
    util2.longFromHash = function longFromHash(hash, unsigned) {
      var bits = util2.LongBits.fromHash(hash);
      if (util2.Long)
        return util2.Long.fromBits(bits.lo, bits.hi, unsigned);
      return bits.toNumber(Boolean(unsigned));
    };
    function merge2(dst, src, ifNotSet) {
      for (var keys = Object.keys(src), i2 = 0; i2 < keys.length; ++i2)
        if (dst[keys[i2]] === void 0 || !ifNotSet)
          dst[keys[i2]] = src[keys[i2]];
      return dst;
    }
    util2.merge = merge2;
    util2.lcFirst = function lcFirst(str) {
      return str.charAt(0).toLowerCase() + str.substring(1);
    };
    function newError(name) {
      function CustomError(message2, properties) {
        if (!(this instanceof CustomError))
          return new CustomError(message2, properties);
        Object.defineProperty(this, "message", { get: function() {
          return message2;
        } });
        if (Error.captureStackTrace)
          Error.captureStackTrace(this, CustomError);
        else
          Object.defineProperty(this, "stack", { value: new Error().stack || "" });
        if (properties)
          merge2(this, properties);
      }
      CustomError.prototype = Object.create(Error.prototype, {
        constructor: {
          value: CustomError,
          writable: true,
          enumerable: false,
          configurable: true
        },
        name: {
          get: function get2() {
            return name;
          },
          set: void 0,
          enumerable: false,
          // configurable: false would accurately preserve the behavior of
          // the original, but I'm guessing that was not intentional.
          // For an actual error subclass, this property would
          // be configurable.
          configurable: true
        },
        toString: {
          value: function value() {
            return this.name + ": " + this.message;
          },
          writable: true,
          enumerable: false,
          configurable: true
        }
      });
      return CustomError;
    }
    util2.newError = newError;
    util2.ProtocolError = newError("ProtocolError");
    util2.oneOfGetter = function getOneOf(fieldNames) {
      var fieldMap = {};
      for (var i2 = 0; i2 < fieldNames.length; ++i2)
        fieldMap[fieldNames[i2]] = 1;
      return function() {
        for (var keys = Object.keys(this), i3 = keys.length - 1; i3 > -1; --i3)
          if (fieldMap[keys[i3]] === 1 && this[keys[i3]] !== void 0 && this[keys[i3]] !== null)
            return keys[i3];
      };
    };
    util2.oneOfSetter = function setOneOf(fieldNames) {
      return function(name) {
        for (var i2 = 0; i2 < fieldNames.length; ++i2)
          if (fieldNames[i2] !== name)
            delete this[fieldNames[i2]];
      };
    };
    util2.toJSONOptions = {
      longs: String,
      enums: String,
      bytes: String,
      json: true
    };
    util2._configure = function() {
      var Buffer2 = util2.Buffer;
      if (!Buffer2) {
        util2._Buffer_from = util2._Buffer_allocUnsafe = null;
        return;
      }
      util2._Buffer_from = Buffer2.from !== Uint8Array.from && Buffer2.from || /* istanbul ignore next */
      function Buffer_from(value, encoding) {
        return new Buffer2(value, encoding);
      };
      util2._Buffer_allocUnsafe = Buffer2.allocUnsafe || /* istanbul ignore next */
      function Buffer_allocUnsafe(size) {
        return new Buffer2(size);
      };
    };
  })(minimal);
  return minimal;
}
var writer = Writer$1;
var util$6 = requireMinimal();
var BufferWriter$1;
var LongBits$1 = util$6.LongBits, base64 = util$6.base64, utf8$1 = util$6.utf8;
function Op(fn, len, val) {
  this.fn = fn;
  this.len = len;
  this.next = void 0;
  this.val = val;
}
function noop$2() {
}
function State(writer2) {
  this.head = writer2.head;
  this.tail = writer2.tail;
  this.len = writer2.len;
  this.next = writer2.states;
}
function Writer$1() {
  this.len = 0;
  this.head = new Op(noop$2, 0, 0);
  this.tail = this.head;
  this.states = null;
}
var create$1 = function create2() {
  return util$6.Buffer ? function create_buffer_setup() {
    return (Writer$1.create = function create_buffer() {
      return new BufferWriter$1();
    })();
  } : function create_array3() {
    return new Writer$1();
  };
};
Writer$1.create = create$1();
Writer$1.alloc = function alloc(size) {
  return new util$6.Array(size);
};
if (util$6.Array !== Array)
  Writer$1.alloc = util$6.pool(Writer$1.alloc, util$6.Array.prototype.subarray);
Writer$1.prototype._push = function push(fn, len, val) {
  this.tail = this.tail.next = new Op(fn, len, val);
  this.len += len;
  return this;
};
function writeByte(val, buf, pos) {
  buf[pos] = val & 255;
}
function writeVarint32(val, buf, pos) {
  while (val > 127) {
    buf[pos++] = val & 127 | 128;
    val >>>= 7;
  }
  buf[pos] = val;
}
function VarintOp(len, val) {
  this.len = len;
  this.next = void 0;
  this.val = val;
}
VarintOp.prototype = Object.create(Op.prototype);
VarintOp.prototype.fn = writeVarint32;
Writer$1.prototype.uint32 = function write_uint32(value) {
  this.len += (this.tail = this.tail.next = new VarintOp(
    (value = value >>> 0) < 128 ? 1 : value < 16384 ? 2 : value < 2097152 ? 3 : value < 268435456 ? 4 : 5,
    value
  )).len;
  return this;
};
Writer$1.prototype.int32 = function write_int32(value) {
  return value < 0 ? this._push(writeVarint64, 10, LongBits$1.fromNumber(value)) : this.uint32(value);
};
Writer$1.prototype.sint32 = function write_sint32(value) {
  return this.uint32((value << 1 ^ value >> 31) >>> 0);
};
function writeVarint64(val, buf, pos) {
  while (val.hi) {
    buf[pos++] = val.lo & 127 | 128;
    val.lo = (val.lo >>> 7 | val.hi << 25) >>> 0;
    val.hi >>>= 7;
  }
  while (val.lo > 127) {
    buf[pos++] = val.lo & 127 | 128;
    val.lo = val.lo >>> 7;
  }
  buf[pos++] = val.lo;
}
Writer$1.prototype.uint64 = function write_uint64(value) {
  var bits = LongBits$1.from(value);
  return this._push(writeVarint64, bits.length(), bits);
};
Writer$1.prototype.int64 = Writer$1.prototype.uint64;
Writer$1.prototype.sint64 = function write_sint64(value) {
  var bits = LongBits$1.from(value).zzEncode();
  return this._push(writeVarint64, bits.length(), bits);
};
Writer$1.prototype.bool = function write_bool(value) {
  return this._push(writeByte, 1, value ? 1 : 0);
};
function writeFixed32(val, buf, pos) {
  buf[pos] = val & 255;
  buf[pos + 1] = val >>> 8 & 255;
  buf[pos + 2] = val >>> 16 & 255;
  buf[pos + 3] = val >>> 24;
}
Writer$1.prototype.fixed32 = function write_fixed32(value) {
  return this._push(writeFixed32, 4, value >>> 0);
};
Writer$1.prototype.sfixed32 = Writer$1.prototype.fixed32;
Writer$1.prototype.fixed64 = function write_fixed64(value) {
  var bits = LongBits$1.from(value);
  return this._push(writeFixed32, 4, bits.lo)._push(writeFixed32, 4, bits.hi);
};
Writer$1.prototype.sfixed64 = Writer$1.prototype.fixed64;
Writer$1.prototype.float = function write_float(value) {
  return this._push(util$6.float.writeFloatLE, 4, value);
};
Writer$1.prototype.double = function write_double(value) {
  return this._push(util$6.float.writeDoubleLE, 8, value);
};
var writeBytes = util$6.Array.prototype.set ? function writeBytes_set(val, buf, pos) {
  buf.set(val, pos);
} : function writeBytes_for(val, buf, pos) {
  for (var i2 = 0; i2 < val.length; ++i2)
    buf[pos + i2] = val[i2];
};
Writer$1.prototype.bytes = function write_bytes(value) {
  var len = value.length >>> 0;
  if (!len)
    return this._push(writeByte, 1, 0);
  if (util$6.isString(value)) {
    var buf = Writer$1.alloc(len = base64.length(value));
    base64.decode(value, buf, 0);
    value = buf;
  }
  return this.uint32(len)._push(writeBytes, len, value);
};
Writer$1.prototype.string = function write_string(value) {
  var len = utf8$1.length(value);
  return len ? this.uint32(len)._push(utf8$1.write, len, value) : this._push(writeByte, 1, 0);
};
Writer$1.prototype.fork = function fork() {
  this.states = new State(this);
  this.head = this.tail = new Op(noop$2, 0, 0);
  this.len = 0;
  return this;
};
Writer$1.prototype.reset = function reset() {
  if (this.states) {
    this.head = this.states.head;
    this.tail = this.states.tail;
    this.len = this.states.len;
    this.states = this.states.next;
  } else {
    this.head = this.tail = new Op(noop$2, 0, 0);
    this.len = 0;
  }
  return this;
};
Writer$1.prototype.ldelim = function ldelim() {
  var head = this.head, tail = this.tail, len = this.len;
  this.reset().uint32(len);
  if (len) {
    this.tail.next = head.next;
    this.tail = tail;
    this.len += len;
  }
  return this;
};
Writer$1.prototype.finish = function finish() {
  var head = this.head.next, buf = this.constructor.alloc(this.len), pos = 0;
  while (head) {
    head.fn(head.val, buf, pos);
    pos += head.len;
    head = head.next;
  }
  return buf;
};
Writer$1._configure = function(BufferWriter_) {
  BufferWriter$1 = BufferWriter_;
  Writer$1.create = create$1();
  BufferWriter$1._configure();
};
var writer_buffer = BufferWriter;
var Writer = writer;
(BufferWriter.prototype = Object.create(Writer.prototype)).constructor = BufferWriter;
var util$5 = requireMinimal();
function BufferWriter() {
  Writer.call(this);
}
BufferWriter._configure = function() {
  BufferWriter.alloc = util$5._Buffer_allocUnsafe;
  BufferWriter.writeBytesBuffer = util$5.Buffer && util$5.Buffer.prototype instanceof Uint8Array && util$5.Buffer.prototype.set.name === "set" ? function writeBytesBuffer_set(val, buf, pos) {
    buf.set(val, pos);
  } : function writeBytesBuffer_copy(val, buf, pos) {
    if (val.copy)
      val.copy(buf, pos, 0, val.length);
    else for (var i2 = 0; i2 < val.length; )
      buf[pos++] = val[i2++];
  };
};
BufferWriter.prototype.bytes = function write_bytes_buffer(value) {
  if (util$5.isString(value))
    value = util$5._Buffer_from(value, "base64");
  var len = value.length >>> 0;
  this.uint32(len);
  if (len)
    this._push(BufferWriter.writeBytesBuffer, len, value);
  return this;
};
function writeStringBuffer(val, buf, pos) {
  if (val.length < 40)
    util$5.utf8.write(val, buf, pos);
  else if (buf.utf8Write)
    buf.utf8Write(val, pos);
  else
    buf.write(val, pos);
}
BufferWriter.prototype.string = function write_string_buffer(value) {
  var len = util$5.Buffer.byteLength(value);
  this.uint32(len);
  if (len)
    this._push(writeStringBuffer, len, value);
  return this;
};
BufferWriter._configure();
var reader = Reader$1;
var util$4 = requireMinimal();
var BufferReader$1;
var LongBits = util$4.LongBits, utf8 = util$4.utf8;
function indexOutOfRange(reader2, writeLength) {
  return RangeError("index out of range: " + reader2.pos + " + " + (writeLength || 1) + " > " + reader2.len);
}
function Reader$1(buffer2) {
  this.buf = buffer2;
  this.pos = 0;
  this.len = buffer2.length;
}
var create_array = typeof Uint8Array !== "undefined" ? function create_typed_array(buffer2) {
  if (buffer2 instanceof Uint8Array || Array.isArray(buffer2))
    return new Reader$1(buffer2);
  throw Error("illegal buffer");
} : function create_array2(buffer2) {
  if (Array.isArray(buffer2))
    return new Reader$1(buffer2);
  throw Error("illegal buffer");
};
var create = function create3() {
  return util$4.Buffer ? function create_buffer_setup(buffer2) {
    return (Reader$1.create = function create_buffer(buffer3) {
      return util$4.Buffer.isBuffer(buffer3) ? new BufferReader$1(buffer3) : create_array(buffer3);
    })(buffer2);
  } : create_array;
};
Reader$1.create = create();
Reader$1.prototype._slice = util$4.Array.prototype.subarray || /* istanbul ignore next */
util$4.Array.prototype.slice;
Reader$1.prototype.uint32 = /* @__PURE__ */ function read_uint32_setup() {
  var value = 4294967295;
  return function read_uint32() {
    value = (this.buf[this.pos] & 127) >>> 0;
    if (this.buf[this.pos++] < 128) return value;
    value = (value | (this.buf[this.pos] & 127) << 7) >>> 0;
    if (this.buf[this.pos++] < 128) return value;
    value = (value | (this.buf[this.pos] & 127) << 14) >>> 0;
    if (this.buf[this.pos++] < 128) return value;
    value = (value | (this.buf[this.pos] & 127) << 21) >>> 0;
    if (this.buf[this.pos++] < 128) return value;
    value = (value | (this.buf[this.pos] & 15) << 28) >>> 0;
    if (this.buf[this.pos++] < 128) return value;
    if ((this.pos += 5) > this.len) {
      this.pos = this.len;
      throw indexOutOfRange(this, 10);
    }
    return value;
  };
}();
Reader$1.prototype.int32 = function read_int32() {
  return this.uint32() | 0;
};
Reader$1.prototype.sint32 = function read_sint32() {
  var value = this.uint32();
  return value >>> 1 ^ -(value & 1) | 0;
};
function readLongVarint() {
  var bits = new LongBits(0, 0);
  var i2 = 0;
  if (this.len - this.pos > 4) {
    for (; i2 < 4; ++i2) {
      bits.lo = (bits.lo | (this.buf[this.pos] & 127) << i2 * 7) >>> 0;
      if (this.buf[this.pos++] < 128)
        return bits;
    }
    bits.lo = (bits.lo | (this.buf[this.pos] & 127) << 28) >>> 0;
    bits.hi = (bits.hi | (this.buf[this.pos] & 127) >> 4) >>> 0;
    if (this.buf[this.pos++] < 128)
      return bits;
    i2 = 0;
  } else {
    for (; i2 < 3; ++i2) {
      if (this.pos >= this.len)
        throw indexOutOfRange(this);
      bits.lo = (bits.lo | (this.buf[this.pos] & 127) << i2 * 7) >>> 0;
      if (this.buf[this.pos++] < 128)
        return bits;
    }
    bits.lo = (bits.lo | (this.buf[this.pos++] & 127) << i2 * 7) >>> 0;
    return bits;
  }
  if (this.len - this.pos > 4) {
    for (; i2 < 5; ++i2) {
      bits.hi = (bits.hi | (this.buf[this.pos] & 127) << i2 * 7 + 3) >>> 0;
      if (this.buf[this.pos++] < 128)
        return bits;
    }
  } else {
    for (; i2 < 5; ++i2) {
      if (this.pos >= this.len)
        throw indexOutOfRange(this);
      bits.hi = (bits.hi | (this.buf[this.pos] & 127) << i2 * 7 + 3) >>> 0;
      if (this.buf[this.pos++] < 128)
        return bits;
    }
  }
  throw Error("invalid varint encoding");
}
Reader$1.prototype.bool = function read_bool() {
  return this.uint32() !== 0;
};
function readFixed32_end(buf, end2) {
  return (buf[end2 - 4] | buf[end2 - 3] << 8 | buf[end2 - 2] << 16 | buf[end2 - 1] << 24) >>> 0;
}
Reader$1.prototype.fixed32 = function read_fixed32() {
  if (this.pos + 4 > this.len)
    throw indexOutOfRange(this, 4);
  return readFixed32_end(this.buf, this.pos += 4);
};
Reader$1.prototype.sfixed32 = function read_sfixed32() {
  if (this.pos + 4 > this.len)
    throw indexOutOfRange(this, 4);
  return readFixed32_end(this.buf, this.pos += 4) | 0;
};
function readFixed64() {
  if (this.pos + 8 > this.len)
    throw indexOutOfRange(this, 8);
  return new LongBits(readFixed32_end(this.buf, this.pos += 4), readFixed32_end(this.buf, this.pos += 4));
}
Reader$1.prototype.float = function read_float() {
  if (this.pos + 4 > this.len)
    throw indexOutOfRange(this, 4);
  var value = util$4.float.readFloatLE(this.buf, this.pos);
  this.pos += 4;
  return value;
};
Reader$1.prototype.double = function read_double() {
  if (this.pos + 8 > this.len)
    throw indexOutOfRange(this, 4);
  var value = util$4.float.readDoubleLE(this.buf, this.pos);
  this.pos += 8;
  return value;
};
Reader$1.prototype.bytes = function read_bytes() {
  var length = this.uint32(), start2 = this.pos, end2 = this.pos + length;
  if (end2 > this.len)
    throw indexOutOfRange(this, length);
  this.pos += length;
  if (Array.isArray(this.buf))
    return this.buf.slice(start2, end2);
  if (start2 === end2) {
    var nativeBuffer = util$4.Buffer;
    return nativeBuffer ? nativeBuffer.alloc(0) : new this.buf.constructor(0);
  }
  return this._slice.call(this.buf, start2, end2);
};
Reader$1.prototype.string = function read_string() {
  var bytes = this.bytes();
  return utf8.read(bytes, 0, bytes.length);
};
Reader$1.prototype.skip = function skip(length) {
  if (typeof length === "number") {
    if (this.pos + length > this.len)
      throw indexOutOfRange(this, length);
    this.pos += length;
  } else {
    do {
      if (this.pos >= this.len)
        throw indexOutOfRange(this);
    } while (this.buf[this.pos++] & 128);
  }
  return this;
};
Reader$1.prototype.skipType = function(wireType) {
  switch (wireType) {
    case 0:
      this.skip();
      break;
    case 1:
      this.skip(8);
      break;
    case 2:
      this.skip(this.uint32());
      break;
    case 3:
      while ((wireType = this.uint32() & 7) !== 4) {
        this.skipType(wireType);
      }
      break;
    case 5:
      this.skip(4);
      break;
    default:
      throw Error("invalid wire type " + wireType + " at offset " + this.pos);
  }
  return this;
};
Reader$1._configure = function(BufferReader_) {
  BufferReader$1 = BufferReader_;
  Reader$1.create = create();
  BufferReader$1._configure();
  var fn = util$4.Long ? "toLong" : (
    /* istanbul ignore next */
    "toNumber"
  );
  util$4.merge(Reader$1.prototype, {
    int64: function read_int64() {
      return readLongVarint.call(this)[fn](false);
    },
    uint64: function read_uint64() {
      return readLongVarint.call(this)[fn](true);
    },
    sint64: function read_sint64() {
      return readLongVarint.call(this).zzDecode()[fn](false);
    },
    fixed64: function read_fixed64() {
      return readFixed64.call(this)[fn](true);
    },
    sfixed64: function read_sfixed64() {
      return readFixed64.call(this)[fn](false);
    }
  });
};
var reader_buffer = BufferReader;
var Reader = reader;
(BufferReader.prototype = Object.create(Reader.prototype)).constructor = BufferReader;
var util$3 = requireMinimal();
function BufferReader(buffer2) {
  Reader.call(this, buffer2);
}
BufferReader._configure = function() {
  if (util$3.Buffer)
    BufferReader.prototype._slice = util$3.Buffer.prototype.slice;
};
BufferReader.prototype.string = function read_string_buffer() {
  var len = this.uint32();
  return this.buf.utf8Slice ? this.buf.utf8Slice(this.pos, this.pos = Math.min(this.pos + len, this.len)) : this.buf.toString("utf-8", this.pos, this.pos = Math.min(this.pos + len, this.len));
};
BufferReader._configure();
var rpc = {};
var service$1 = Service;
var util$2 = requireMinimal();
(Service.prototype = Object.create(util$2.EventEmitter.prototype)).constructor = Service;
function Service(rpcImpl, requestDelimited, responseDelimited) {
  if (typeof rpcImpl !== "function")
    throw TypeError("rpcImpl must be a function");
  util$2.EventEmitter.call(this);
  this.rpcImpl = rpcImpl;
  this.requestDelimited = Boolean(requestDelimited);
  this.responseDelimited = Boolean(responseDelimited);
}
Service.prototype.rpcCall = function rpcCall(method2, requestCtor, responseCtor, request2, callback) {
  if (!request2)
    throw TypeError("request must be specified");
  var self2 = this;
  if (!callback)
    return util$2.asPromise(rpcCall, self2, method2, requestCtor, responseCtor, request2);
  if (!self2.rpcImpl) {
    setTimeout(function() {
      callback(Error("already ended"));
    }, 0);
    return void 0;
  }
  try {
    return self2.rpcImpl(
      method2,
      requestCtor[self2.requestDelimited ? "encodeDelimited" : "encode"](request2).finish(),
      function rpcCallback(err, response) {
        if (err) {
          self2.emit("error", err, method2);
          return callback(err);
        }
        if (response === null) {
          self2.end(
            /* endedByRPC */
            true
          );
          return void 0;
        }
        if (!(response instanceof responseCtor)) {
          try {
            response = responseCtor[self2.responseDelimited ? "decodeDelimited" : "decode"](response);
          } catch (err2) {
            self2.emit("error", err2, method2);
            return callback(err2);
          }
        }
        self2.emit("data", response, method2);
        return callback(null, response);
      }
    );
  } catch (err) {
    self2.emit("error", err, method2);
    setTimeout(function() {
      callback(err);
    }, 0);
    return void 0;
  }
};
Service.prototype.end = function end(endedByRPC) {
  if (this.rpcImpl) {
    if (!endedByRPC)
      this.rpcImpl(null, null, null);
    this.rpcImpl = null;
    this.emit("end").off();
  }
  return this;
};
(function(exports) {
  var rpc2 = exports;
  rpc2.Service = service$1;
})(rpc);
var roots = {};
(function(exports) {
  var protobuf2 = exports;
  protobuf2.build = "minimal";
  protobuf2.Writer = writer;
  protobuf2.BufferWriter = writer_buffer;
  protobuf2.Reader = reader;
  protobuf2.BufferReader = reader_buffer;
  protobuf2.util = requireMinimal();
  protobuf2.rpc = rpc;
  protobuf2.roots = roots;
  protobuf2.configure = configure;
  function configure() {
    protobuf2.util._configure();
    protobuf2.Writer._configure(protobuf2.BufferWriter);
    protobuf2.Reader._configure(protobuf2.BufferReader);
  }
  configure();
})(indexMinimal);
var util$1 = { exports: {} };
var codegen_1 = codegen;
function codegen(functionParams, functionName) {
  if (typeof functionParams === "string") {
    functionName = functionParams;
    functionParams = void 0;
  }
  var body = [];
  function Codegen(formatStringOrScope) {
    if (typeof formatStringOrScope !== "string") {
      var source = toString3();
      if (codegen.verbose)
        console.log("codegen: " + source);
      source = "return " + source;
      if (formatStringOrScope) {
        var scopeKeys = Object.keys(formatStringOrScope), scopeParams = new Array(scopeKeys.length + 1), scopeValues = new Array(scopeKeys.length), scopeOffset = 0;
        while (scopeOffset < scopeKeys.length) {
          scopeParams[scopeOffset] = scopeKeys[scopeOffset];
          scopeValues[scopeOffset] = formatStringOrScope[scopeKeys[scopeOffset++]];
        }
        scopeParams[scopeOffset] = source;
        return Function.apply(null, scopeParams).apply(null, scopeValues);
      }
      return Function(source)();
    }
    var formatParams = new Array(arguments.length - 1), formatOffset = 0;
    while (formatOffset < formatParams.length)
      formatParams[formatOffset] = arguments[++formatOffset];
    formatOffset = 0;
    formatStringOrScope = formatStringOrScope.replace(/%([%dfijs])/g, function replace($0, $1) {
      var value = formatParams[formatOffset++];
      switch ($1) {
        case "d":
        case "f":
          return String(Number(value));
        case "i":
          return String(Math.floor(value));
        case "j":
          return JSON.stringify(value);
        case "s":
          return String(value);
      }
      return "%";
    });
    if (formatOffset !== formatParams.length)
      throw Error("parameter count mismatch");
    body.push(formatStringOrScope);
    return Codegen;
  }
  function toString3(functionNameOverride) {
    return "function " + (functionNameOverride || functionName || "") + "(" + (functionParams && functionParams.join(",") || "") + "){\n  " + body.join("\n  ") + "\n}";
  }
  Codegen.toString = toString3;
  return Codegen;
}
codegen.verbose = false;
var fetch_1 = fetch$1;
var asPromise = aspromise, inquire = inquire_1;
var fs = inquire("fs");
function fetch$1(filename, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  } else if (!options)
    options = {};
  if (!callback)
    return asPromise(fetch$1, this, filename, options);
  if (!options.xhr && fs && fs.readFile)
    return fs.readFile(filename, function fetchReadFileCallback(err, contents) {
      return err && typeof XMLHttpRequest !== "undefined" ? fetch$1.xhr(filename, options, callback) : err ? callback(err) : callback(null, options.binary ? contents : contents.toString("utf8"));
    });
  return fetch$1.xhr(filename, options, callback);
}
fetch$1.xhr = function fetch_xhr(filename, options, callback) {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function fetchOnReadyStateChange() {
    if (xhr.readyState !== 4)
      return void 0;
    if (xhr.status !== 0 && xhr.status !== 200)
      return callback(Error("status " + xhr.status));
    if (options.binary) {
      var buffer2 = xhr.response;
      if (!buffer2) {
        buffer2 = [];
        for (var i2 = 0; i2 < xhr.responseText.length; ++i2)
          buffer2.push(xhr.responseText.charCodeAt(i2) & 255);
      }
      return callback(null, typeof Uint8Array !== "undefined" ? new Uint8Array(buffer2) : buffer2);
    }
    return callback(null, xhr.responseText);
  };
  if (options.binary) {
    if ("overrideMimeType" in xhr)
      xhr.overrideMimeType("text/plain; charset=x-user-defined");
    xhr.responseType = "arraybuffer";
  }
  xhr.open("GET", filename);
  xhr.send();
};
var path = {};
(function(exports) {
  var path2 = exports;
  var isAbsolute = (
    /**
     * Tests if the specified path is absolute.
     * @param {string} path Path to test
     * @returns {boolean} `true` if path is absolute
     */
    path2.isAbsolute = function isAbsolute2(path3) {
      return /^(?:\/|\w+:)/.test(path3);
    }
  );
  var normalize = (
    /**
     * Normalizes the specified path.
     * @param {string} path Path to normalize
     * @returns {string} Normalized path
     */
    path2.normalize = function normalize2(path3) {
      path3 = path3.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
      var parts = path3.split("/"), absolute = isAbsolute(path3), prefix = "";
      if (absolute)
        prefix = parts.shift() + "/";
      for (var i2 = 0; i2 < parts.length; ) {
        if (parts[i2] === "..") {
          if (i2 > 0 && parts[i2 - 1] !== "..")
            parts.splice(--i2, 2);
          else if (absolute)
            parts.splice(i2, 1);
          else
            ++i2;
        } else if (parts[i2] === ".")
          parts.splice(i2, 1);
        else
          ++i2;
      }
      return prefix + parts.join("/");
    }
  );
  path2.resolve = function resolve2(originPath, includePath, alreadyNormalized) {
    if (!alreadyNormalized)
      includePath = normalize(includePath);
    if (isAbsolute(includePath))
      return includePath;
    if (!alreadyNormalized)
      originPath = normalize(originPath);
    return (originPath = originPath.replace(/(?:\/|^)[^/]+$/, "")).length ? normalize(originPath + "/" + includePath) : includePath;
  };
})(path);
var types = {};
var hasRequiredTypes;
function requireTypes() {
  if (hasRequiredTypes) return types;
  hasRequiredTypes = 1;
  (function(exports) {
    var types2 = exports;
    var util2 = requireUtil();
    var s2 = [
      "double",
      // 0
      "float",
      // 1
      "int32",
      // 2
      "uint32",
      // 3
      "sint32",
      // 4
      "fixed32",
      // 5
      "sfixed32",
      // 6
      "int64",
      // 7
      "uint64",
      // 8
      "sint64",
      // 9
      "fixed64",
      // 10
      "sfixed64",
      // 11
      "bool",
      // 12
      "string",
      // 13
      "bytes"
      // 14
    ];
    function bake(values, offset) {
      var i2 = 0, o2 = {};
      offset |= 0;
      while (i2 < values.length) o2[s2[i2 + offset]] = values[i2++];
      return o2;
    }
    types2.basic = bake([
      /* double   */
      1,
      /* float    */
      5,
      /* int32    */
      0,
      /* uint32   */
      0,
      /* sint32   */
      0,
      /* fixed32  */
      5,
      /* sfixed32 */
      5,
      /* int64    */
      0,
      /* uint64   */
      0,
      /* sint64   */
      0,
      /* fixed64  */
      1,
      /* sfixed64 */
      1,
      /* bool     */
      0,
      /* string   */
      2,
      /* bytes    */
      2
    ]);
    types2.defaults = bake([
      /* double   */
      0,
      /* float    */
      0,
      /* int32    */
      0,
      /* uint32   */
      0,
      /* sint32   */
      0,
      /* fixed32  */
      0,
      /* sfixed32 */
      0,
      /* int64    */
      0,
      /* uint64   */
      0,
      /* sint64   */
      0,
      /* fixed64  */
      0,
      /* sfixed64 */
      0,
      /* bool     */
      false,
      /* string   */
      "",
      /* bytes    */
      util2.emptyArray,
      /* message  */
      null
    ]);
    types2.long = bake([
      /* int64    */
      0,
      /* uint64   */
      0,
      /* sint64   */
      0,
      /* fixed64  */
      1,
      /* sfixed64 */
      1
    ], 7);
    types2.mapKey = bake([
      /* int32    */
      0,
      /* uint32   */
      0,
      /* sint32   */
      0,
      /* fixed32  */
      5,
      /* sfixed32 */
      5,
      /* int64    */
      0,
      /* uint64   */
      0,
      /* sint64   */
      0,
      /* fixed64  */
      1,
      /* sfixed64 */
      1,
      /* bool     */
      0,
      /* string   */
      2
    ], 2);
    types2.packed = bake([
      /* double   */
      1,
      /* float    */
      5,
      /* int32    */
      0,
      /* uint32   */
      0,
      /* sint32   */
      0,
      /* fixed32  */
      5,
      /* sfixed32 */
      5,
      /* int64    */
      0,
      /* uint64   */
      0,
      /* sint64   */
      0,
      /* fixed64  */
      1,
      /* sfixed64 */
      1,
      /* bool     */
      0
    ]);
  })(types);
  return types;
}
var field;
var hasRequiredField;
function requireField() {
  if (hasRequiredField) return field;
  hasRequiredField = 1;
  field = Field;
  var ReflectionObject = requireObject();
  ((Field.prototype = Object.create(ReflectionObject.prototype)).constructor = Field).className = "Field";
  var Enum = require_enum(), types2 = requireTypes(), util2 = requireUtil();
  var Type;
  var ruleRe = /^required|optional|repeated$/;
  Field.fromJSON = function fromJSON(name, json) {
    return new Field(name, json.id, json.type, json.rule, json.extend, json.options, json.comment);
  };
  function Field(name, id, type2, rule, extend2, options, comment) {
    if (util2.isObject(rule)) {
      comment = extend2;
      options = rule;
      rule = extend2 = void 0;
    } else if (util2.isObject(extend2)) {
      comment = options;
      options = extend2;
      extend2 = void 0;
    }
    ReflectionObject.call(this, name, options);
    if (!util2.isInteger(id) || id < 0)
      throw TypeError("id must be a non-negative integer");
    if (!util2.isString(type2))
      throw TypeError("type must be a string");
    if (rule !== void 0 && !ruleRe.test(rule = rule.toString().toLowerCase()))
      throw TypeError("rule must be a string rule");
    if (extend2 !== void 0 && !util2.isString(extend2))
      throw TypeError("extend must be a string");
    if (rule === "proto3_optional") {
      rule = "optional";
    }
    this.rule = rule && rule !== "optional" ? rule : void 0;
    this.type = type2;
    this.id = id;
    this.extend = extend2 || void 0;
    this.required = rule === "required";
    this.optional = !this.required;
    this.repeated = rule === "repeated";
    this.map = false;
    this.message = null;
    this.partOf = null;
    this.typeDefault = null;
    this.defaultValue = null;
    this.long = util2.Long ? types2.long[type2] !== void 0 : (
      /* istanbul ignore next */
      false
    );
    this.bytes = type2 === "bytes";
    this.resolvedType = null;
    this.extensionField = null;
    this.declaringField = null;
    this._packed = null;
    this.comment = comment;
  }
  Object.defineProperty(Field.prototype, "packed", {
    get: function() {
      if (this._packed === null)
        this._packed = this.getOption("packed") !== false;
      return this._packed;
    }
  });
  Field.prototype.setOption = function setOption(name, value, ifNotSet) {
    if (name === "packed")
      this._packed = null;
    return ReflectionObject.prototype.setOption.call(this, name, value, ifNotSet);
  };
  Field.prototype.toJSON = function toJSON3(toJSONOptions) {
    var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
    return util2.toObject([
      "rule",
      this.rule !== "optional" && this.rule || void 0,
      "type",
      this.type,
      "id",
      this.id,
      "extend",
      this.extend,
      "options",
      this.options,
      "comment",
      keepComments ? this.comment : void 0
    ]);
  };
  Field.prototype.resolve = function resolve2() {
    if (this.resolved)
      return this;
    if ((this.typeDefault = types2.defaults[this.type]) === void 0) {
      this.resolvedType = (this.declaringField ? this.declaringField.parent : this.parent).lookupTypeOrEnum(this.type);
      if (this.resolvedType instanceof Type)
        this.typeDefault = null;
      else
        this.typeDefault = this.resolvedType.values[Object.keys(this.resolvedType.values)[0]];
    } else if (this.options && this.options.proto3_optional) {
      this.typeDefault = null;
    }
    if (this.options && this.options["default"] != null) {
      this.typeDefault = this.options["default"];
      if (this.resolvedType instanceof Enum && typeof this.typeDefault === "string")
        this.typeDefault = this.resolvedType.values[this.typeDefault];
    }
    if (this.options) {
      if (this.options.packed === true || this.options.packed !== void 0 && this.resolvedType && !(this.resolvedType instanceof Enum))
        delete this.options.packed;
      if (!Object.keys(this.options).length)
        this.options = void 0;
    }
    if (this.long) {
      this.typeDefault = util2.Long.fromNumber(this.typeDefault, this.type.charAt(0) === "u");
      if (Object.freeze)
        Object.freeze(this.typeDefault);
    } else if (this.bytes && typeof this.typeDefault === "string") {
      var buf;
      if (util2.base64.test(this.typeDefault))
        util2.base64.decode(this.typeDefault, buf = util2.newBuffer(util2.base64.length(this.typeDefault)), 0);
      else
        util2.utf8.write(this.typeDefault, buf = util2.newBuffer(util2.utf8.length(this.typeDefault)), 0);
      this.typeDefault = buf;
    }
    if (this.map)
      this.defaultValue = util2.emptyObject;
    else if (this.repeated)
      this.defaultValue = util2.emptyArray;
    else
      this.defaultValue = this.typeDefault;
    if (this.parent instanceof Type)
      this.parent.ctor.prototype[this.name] = this.defaultValue;
    return ReflectionObject.prototype.resolve.call(this);
  };
  Field.d = function decorateField(fieldId, fieldType, fieldRule, defaultValue) {
    if (typeof fieldType === "function")
      fieldType = util2.decorateType(fieldType).name;
    else if (fieldType && typeof fieldType === "object")
      fieldType = util2.decorateEnum(fieldType).name;
    return function fieldDecorator(prototype2, fieldName) {
      util2.decorateType(prototype2.constructor).add(new Field(fieldName, fieldId, fieldType, fieldRule, { "default": defaultValue }));
    };
  };
  Field._configure = function configure(Type_) {
    Type = Type_;
  };
  return field;
}
var oneof;
var hasRequiredOneof;
function requireOneof() {
  if (hasRequiredOneof) return oneof;
  hasRequiredOneof = 1;
  oneof = OneOf;
  var ReflectionObject = requireObject();
  ((OneOf.prototype = Object.create(ReflectionObject.prototype)).constructor = OneOf).className = "OneOf";
  var Field = requireField(), util2 = requireUtil();
  function OneOf(name, fieldNames, options, comment) {
    if (!Array.isArray(fieldNames)) {
      options = fieldNames;
      fieldNames = void 0;
    }
    ReflectionObject.call(this, name, options);
    if (!(fieldNames === void 0 || Array.isArray(fieldNames)))
      throw TypeError("fieldNames must be an Array");
    this.oneof = fieldNames || [];
    this.fieldsArray = [];
    this.comment = comment;
  }
  OneOf.fromJSON = function fromJSON(name, json) {
    return new OneOf(name, json.oneof, json.options, json.comment);
  };
  OneOf.prototype.toJSON = function toJSON3(toJSONOptions) {
    var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
    return util2.toObject([
      "options",
      this.options,
      "oneof",
      this.oneof,
      "comment",
      keepComments ? this.comment : void 0
    ]);
  };
  function addFieldsToParent(oneof2) {
    if (oneof2.parent) {
      for (var i2 = 0; i2 < oneof2.fieldsArray.length; ++i2)
        if (!oneof2.fieldsArray[i2].parent)
          oneof2.parent.add(oneof2.fieldsArray[i2]);
    }
  }
  OneOf.prototype.add = function add(field2) {
    if (!(field2 instanceof Field))
      throw TypeError("field must be a Field");
    if (field2.parent && field2.parent !== this.parent)
      field2.parent.remove(field2);
    this.oneof.push(field2.name);
    this.fieldsArray.push(field2);
    field2.partOf = this;
    addFieldsToParent(this);
    return this;
  };
  OneOf.prototype.remove = function remove2(field2) {
    if (!(field2 instanceof Field))
      throw TypeError("field must be a Field");
    var index = this.fieldsArray.indexOf(field2);
    if (index < 0)
      throw Error(field2 + " is not a member of " + this);
    this.fieldsArray.splice(index, 1);
    index = this.oneof.indexOf(field2.name);
    if (index > -1)
      this.oneof.splice(index, 1);
    field2.partOf = null;
    return this;
  };
  OneOf.prototype.onAdd = function onAdd(parent) {
    ReflectionObject.prototype.onAdd.call(this, parent);
    var self2 = this;
    for (var i2 = 0; i2 < this.oneof.length; ++i2) {
      var field2 = parent.get(this.oneof[i2]);
      if (field2 && !field2.partOf) {
        field2.partOf = self2;
        self2.fieldsArray.push(field2);
      }
    }
    addFieldsToParent(this);
  };
  OneOf.prototype.onRemove = function onRemove(parent) {
    for (var i2 = 0, field2; i2 < this.fieldsArray.length; ++i2)
      if ((field2 = this.fieldsArray[i2]).parent)
        field2.parent.remove(field2);
    ReflectionObject.prototype.onRemove.call(this, parent);
  };
  OneOf.d = function decorateOneOf() {
    var fieldNames = new Array(arguments.length), index = 0;
    while (index < arguments.length)
      fieldNames[index] = arguments[index++];
    return function oneOfDecorator(prototype2, oneofName) {
      util2.decorateType(prototype2.constructor).add(new OneOf(oneofName, fieldNames));
      Object.defineProperty(prototype2, oneofName, {
        get: util2.oneOfGetter(fieldNames),
        set: util2.oneOfSetter(fieldNames)
      });
    };
  };
  return oneof;
}
var namespace$1;
var hasRequiredNamespace;
function requireNamespace() {
  if (hasRequiredNamespace) return namespace$1;
  hasRequiredNamespace = 1;
  namespace$1 = Namespace;
  var ReflectionObject = requireObject();
  ((Namespace.prototype = Object.create(ReflectionObject.prototype)).constructor = Namespace).className = "Namespace";
  var Field = requireField(), util2 = requireUtil(), OneOf = requireOneof();
  var Type, Service2, Enum;
  Namespace.fromJSON = function fromJSON(name, json) {
    return new Namespace(name, json.options).addJSON(json.nested);
  };
  function arrayToJSON(array, toJSONOptions) {
    if (!(array && array.length))
      return void 0;
    var obj = {};
    for (var i2 = 0; i2 < array.length; ++i2)
      obj[array[i2].name] = array[i2].toJSON(toJSONOptions);
    return obj;
  }
  Namespace.arrayToJSON = arrayToJSON;
  Namespace.isReservedId = function isReservedId(reserved, id) {
    if (reserved) {
      for (var i2 = 0; i2 < reserved.length; ++i2)
        if (typeof reserved[i2] !== "string" && reserved[i2][0] <= id && reserved[i2][1] > id)
          return true;
    }
    return false;
  };
  Namespace.isReservedName = function isReservedName(reserved, name) {
    if (reserved) {
      for (var i2 = 0; i2 < reserved.length; ++i2)
        if (reserved[i2] === name)
          return true;
    }
    return false;
  };
  function Namespace(name, options) {
    ReflectionObject.call(this, name, options);
    this.nested = void 0;
    this._nestedArray = null;
  }
  function clearCache(namespace2) {
    namespace2._nestedArray = null;
    return namespace2;
  }
  Object.defineProperty(Namespace.prototype, "nestedArray", {
    get: function() {
      return this._nestedArray || (this._nestedArray = util2.toArray(this.nested));
    }
  });
  Namespace.prototype.toJSON = function toJSON3(toJSONOptions) {
    return util2.toObject([
      "options",
      this.options,
      "nested",
      arrayToJSON(this.nestedArray, toJSONOptions)
    ]);
  };
  Namespace.prototype.addJSON = function addJSON(nestedJson) {
    var ns = this;
    if (nestedJson) {
      for (var names = Object.keys(nestedJson), i2 = 0, nested; i2 < names.length; ++i2) {
        nested = nestedJson[names[i2]];
        ns.add(
          // most to least likely
          (nested.fields !== void 0 ? Type.fromJSON : nested.values !== void 0 ? Enum.fromJSON : nested.methods !== void 0 ? Service2.fromJSON : nested.id !== void 0 ? Field.fromJSON : Namespace.fromJSON)(names[i2], nested)
        );
      }
    }
    return this;
  };
  Namespace.prototype.get = function get2(name) {
    return this.nested && this.nested[name] || null;
  };
  Namespace.prototype.getEnum = function getEnum(name) {
    if (this.nested && this.nested[name] instanceof Enum)
      return this.nested[name].values;
    throw Error("no such enum: " + name);
  };
  Namespace.prototype.add = function add(object2) {
    if (!(object2 instanceof Field && object2.extend !== void 0 || object2 instanceof Type || object2 instanceof OneOf || object2 instanceof Enum || object2 instanceof Service2 || object2 instanceof Namespace))
      throw TypeError("object must be a valid nested object");
    if (!this.nested)
      this.nested = {};
    else {
      var prev = this.get(object2.name);
      if (prev) {
        if (prev instanceof Namespace && object2 instanceof Namespace && !(prev instanceof Type || prev instanceof Service2)) {
          var nested = prev.nestedArray;
          for (var i2 = 0; i2 < nested.length; ++i2)
            object2.add(nested[i2]);
          this.remove(prev);
          if (!this.nested)
            this.nested = {};
          object2.setOptions(prev.options, true);
        } else
          throw Error("duplicate name '" + object2.name + "' in " + this);
      }
    }
    this.nested[object2.name] = object2;
    object2.onAdd(this);
    return clearCache(this);
  };
  Namespace.prototype.remove = function remove2(object2) {
    if (!(object2 instanceof ReflectionObject))
      throw TypeError("object must be a ReflectionObject");
    if (object2.parent !== this)
      throw Error(object2 + " is not a member of " + this);
    delete this.nested[object2.name];
    if (!Object.keys(this.nested).length)
      this.nested = void 0;
    object2.onRemove(this);
    return clearCache(this);
  };
  Namespace.prototype.define = function define(path2, json) {
    if (util2.isString(path2))
      path2 = path2.split(".");
    else if (!Array.isArray(path2))
      throw TypeError("illegal path");
    if (path2 && path2.length && path2[0] === "")
      throw Error("path must be relative");
    var ptr = this;
    while (path2.length > 0) {
      var part = path2.shift();
      if (ptr.nested && ptr.nested[part]) {
        ptr = ptr.nested[part];
        if (!(ptr instanceof Namespace))
          throw Error("path conflicts with non-namespace objects");
      } else
        ptr.add(ptr = new Namespace(part));
    }
    if (json)
      ptr.addJSON(json);
    return ptr;
  };
  Namespace.prototype.resolveAll = function resolveAll() {
    var nested = this.nestedArray, i2 = 0;
    while (i2 < nested.length)
      if (nested[i2] instanceof Namespace)
        nested[i2++].resolveAll();
      else
        nested[i2++].resolve();
    return this.resolve();
  };
  Namespace.prototype.lookup = function lookup(path2, filterTypes, parentAlreadyChecked) {
    if (typeof filterTypes === "boolean") {
      parentAlreadyChecked = filterTypes;
      filterTypes = void 0;
    } else if (filterTypes && !Array.isArray(filterTypes))
      filterTypes = [filterTypes];
    if (util2.isString(path2) && path2.length) {
      if (path2 === ".")
        return this.root;
      path2 = path2.split(".");
    } else if (!path2.length)
      return this;
    if (path2[0] === "")
      return this.root.lookup(path2.slice(1), filterTypes);
    var found = this.get(path2[0]);
    if (found) {
      if (path2.length === 1) {
        if (!filterTypes || filterTypes.indexOf(found.constructor) > -1)
          return found;
      } else if (found instanceof Namespace && (found = found.lookup(path2.slice(1), filterTypes, true)))
        return found;
    } else
      for (var i2 = 0; i2 < this.nestedArray.length; ++i2)
        if (this._nestedArray[i2] instanceof Namespace && (found = this._nestedArray[i2].lookup(path2, filterTypes, true)))
          return found;
    if (this.parent === null || parentAlreadyChecked)
      return null;
    return this.parent.lookup(path2, filterTypes);
  };
  Namespace.prototype.lookupType = function lookupType(path2) {
    var found = this.lookup(path2, [Type]);
    if (!found)
      throw Error("no such type: " + path2);
    return found;
  };
  Namespace.prototype.lookupEnum = function lookupEnum(path2) {
    var found = this.lookup(path2, [Enum]);
    if (!found)
      throw Error("no such Enum '" + path2 + "' in " + this);
    return found;
  };
  Namespace.prototype.lookupTypeOrEnum = function lookupTypeOrEnum(path2) {
    var found = this.lookup(path2, [Type, Enum]);
    if (!found)
      throw Error("no such Type or Enum '" + path2 + "' in " + this);
    return found;
  };
  Namespace.prototype.lookupService = function lookupService(path2) {
    var found = this.lookup(path2, [Service2]);
    if (!found)
      throw Error("no such Service '" + path2 + "' in " + this);
    return found;
  };
  Namespace._configure = function(Type_, Service_, Enum_) {
    Type = Type_;
    Service2 = Service_;
    Enum = Enum_;
  };
  return namespace$1;
}
var mapfield;
var hasRequiredMapfield;
function requireMapfield() {
  if (hasRequiredMapfield) return mapfield;
  hasRequiredMapfield = 1;
  mapfield = MapField;
  var Field = requireField();
  ((MapField.prototype = Object.create(Field.prototype)).constructor = MapField).className = "MapField";
  var types2 = requireTypes(), util2 = requireUtil();
  function MapField(name, id, keyType, type2, options, comment) {
    Field.call(this, name, id, type2, void 0, void 0, options, comment);
    if (!util2.isString(keyType))
      throw TypeError("keyType must be a string");
    this.keyType = keyType;
    this.resolvedKeyType = null;
    this.map = true;
  }
  MapField.fromJSON = function fromJSON(name, json) {
    return new MapField(name, json.id, json.keyType, json.type, json.options, json.comment);
  };
  MapField.prototype.toJSON = function toJSON3(toJSONOptions) {
    var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
    return util2.toObject([
      "keyType",
      this.keyType,
      "type",
      this.type,
      "id",
      this.id,
      "extend",
      this.extend,
      "options",
      this.options,
      "comment",
      keepComments ? this.comment : void 0
    ]);
  };
  MapField.prototype.resolve = function resolve2() {
    if (this.resolved)
      return this;
    if (types2.mapKey[this.keyType] === void 0)
      throw Error("invalid key type: " + this.keyType);
    return Field.prototype.resolve.call(this);
  };
  MapField.d = function decorateMapField(fieldId, fieldKeyType, fieldValueType) {
    if (typeof fieldValueType === "function")
      fieldValueType = util2.decorateType(fieldValueType).name;
    else if (fieldValueType && typeof fieldValueType === "object")
      fieldValueType = util2.decorateEnum(fieldValueType).name;
    return function mapFieldDecorator(prototype2, fieldName) {
      util2.decorateType(prototype2.constructor).add(new MapField(fieldName, fieldId, fieldKeyType, fieldValueType));
    };
  };
  return mapfield;
}
var method;
var hasRequiredMethod;
function requireMethod() {
  if (hasRequiredMethod) return method;
  hasRequiredMethod = 1;
  method = Method;
  var ReflectionObject = requireObject();
  ((Method.prototype = Object.create(ReflectionObject.prototype)).constructor = Method).className = "Method";
  var util2 = requireUtil();
  function Method(name, type2, requestType, responseType, requestStream, responseStream, options, comment, parsedOptions) {
    if (util2.isObject(requestStream)) {
      options = requestStream;
      requestStream = responseStream = void 0;
    } else if (util2.isObject(responseStream)) {
      options = responseStream;
      responseStream = void 0;
    }
    if (!(type2 === void 0 || util2.isString(type2)))
      throw TypeError("type must be a string");
    if (!util2.isString(requestType))
      throw TypeError("requestType must be a string");
    if (!util2.isString(responseType))
      throw TypeError("responseType must be a string");
    ReflectionObject.call(this, name, options);
    this.type = type2 || "rpc";
    this.requestType = requestType;
    this.requestStream = requestStream ? true : void 0;
    this.responseType = responseType;
    this.responseStream = responseStream ? true : void 0;
    this.resolvedRequestType = null;
    this.resolvedResponseType = null;
    this.comment = comment;
    this.parsedOptions = parsedOptions;
  }
  Method.fromJSON = function fromJSON(name, json) {
    return new Method(name, json.type, json.requestType, json.responseType, json.requestStream, json.responseStream, json.options, json.comment, json.parsedOptions);
  };
  Method.prototype.toJSON = function toJSON3(toJSONOptions) {
    var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
    return util2.toObject([
      "type",
      this.type !== "rpc" && /* istanbul ignore next */
      this.type || void 0,
      "requestType",
      this.requestType,
      "requestStream",
      this.requestStream,
      "responseType",
      this.responseType,
      "responseStream",
      this.responseStream,
      "options",
      this.options,
      "comment",
      keepComments ? this.comment : void 0,
      "parsedOptions",
      this.parsedOptions
    ]);
  };
  Method.prototype.resolve = function resolve2() {
    if (this.resolved)
      return this;
    this.resolvedRequestType = this.parent.lookupType(this.requestType);
    this.resolvedResponseType = this.parent.lookupType(this.responseType);
    return ReflectionObject.prototype.resolve.call(this);
  };
  return method;
}
var service;
var hasRequiredService;
function requireService() {
  if (hasRequiredService) return service;
  hasRequiredService = 1;
  service = Service2;
  var Namespace = requireNamespace();
  ((Service2.prototype = Object.create(Namespace.prototype)).constructor = Service2).className = "Service";
  var Method = requireMethod(), util2 = requireUtil(), rpc$1 = rpc;
  function Service2(name, options) {
    Namespace.call(this, name, options);
    this.methods = {};
    this._methodsArray = null;
  }
  Service2.fromJSON = function fromJSON(name, json) {
    var service2 = new Service2(name, json.options);
    if (json.methods)
      for (var names = Object.keys(json.methods), i2 = 0; i2 < names.length; ++i2)
        service2.add(Method.fromJSON(names[i2], json.methods[names[i2]]));
    if (json.nested)
      service2.addJSON(json.nested);
    service2.comment = json.comment;
    return service2;
  };
  Service2.prototype.toJSON = function toJSON3(toJSONOptions) {
    var inherited = Namespace.prototype.toJSON.call(this, toJSONOptions);
    var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
    return util2.toObject([
      "options",
      inherited && inherited.options || void 0,
      "methods",
      Namespace.arrayToJSON(this.methodsArray, toJSONOptions) || /* istanbul ignore next */
      {},
      "nested",
      inherited && inherited.nested || void 0,
      "comment",
      keepComments ? this.comment : void 0
    ]);
  };
  Object.defineProperty(Service2.prototype, "methodsArray", {
    get: function() {
      return this._methodsArray || (this._methodsArray = util2.toArray(this.methods));
    }
  });
  function clearCache(service2) {
    service2._methodsArray = null;
    return service2;
  }
  Service2.prototype.get = function get2(name) {
    return this.methods[name] || Namespace.prototype.get.call(this, name);
  };
  Service2.prototype.resolveAll = function resolveAll() {
    var methods = this.methodsArray;
    for (var i2 = 0; i2 < methods.length; ++i2)
      methods[i2].resolve();
    return Namespace.prototype.resolve.call(this);
  };
  Service2.prototype.add = function add(object2) {
    if (this.get(object2.name))
      throw Error("duplicate name '" + object2.name + "' in " + this);
    if (object2 instanceof Method) {
      this.methods[object2.name] = object2;
      object2.parent = this;
      return clearCache(this);
    }
    return Namespace.prototype.add.call(this, object2);
  };
  Service2.prototype.remove = function remove2(object2) {
    if (object2 instanceof Method) {
      if (this.methods[object2.name] !== object2)
        throw Error(object2 + " is not a member of " + this);
      delete this.methods[object2.name];
      object2.parent = null;
      return clearCache(this);
    }
    return Namespace.prototype.remove.call(this, object2);
  };
  Service2.prototype.create = function create5(rpcImpl, requestDelimited, responseDelimited) {
    var rpcService = new rpc$1.Service(rpcImpl, requestDelimited, responseDelimited);
    for (var i2 = 0, method2; i2 < /* initializes */
    this.methodsArray.length; ++i2) {
      var methodName = util2.lcFirst((method2 = this._methodsArray[i2]).resolve().name).replace(/[^$\w_]/g, "");
      rpcService[methodName] = util2.codegen(["r", "c"], util2.isReserved(methodName) ? methodName + "_" : methodName)("return this.rpcCall(m,q,s,r,c)")({
        m: method2,
        q: method2.resolvedRequestType.ctor,
        s: method2.resolvedResponseType.ctor
      });
    }
    return rpcService;
  };
  return service;
}
var message = Message;
var util = requireMinimal();
function Message(properties) {
  if (properties)
    for (var keys = Object.keys(properties), i2 = 0; i2 < keys.length; ++i2)
      this[keys[i2]] = properties[keys[i2]];
}
Message.create = function create4(properties) {
  return this.$type.create(properties);
};
Message.encode = function encode2(message2, writer2) {
  return this.$type.encode(message2, writer2);
};
Message.encodeDelimited = function encodeDelimited(message2, writer2) {
  return this.$type.encodeDelimited(message2, writer2);
};
Message.decode = function decode(reader2) {
  return this.$type.decode(reader2);
};
Message.decodeDelimited = function decodeDelimited(reader2) {
  return this.$type.decodeDelimited(reader2);
};
Message.verify = function verify(message2) {
  return this.$type.verify(message2);
};
Message.fromObject = function fromObject(object2) {
  return this.$type.fromObject(object2);
};
Message.toObject = function toObject(message2, options) {
  return this.$type.toObject(message2, options);
};
Message.prototype.toJSON = function toJSON() {
  return this.$type.toObject(this, util.toJSONOptions);
};
var decoder_1;
var hasRequiredDecoder;
function requireDecoder() {
  if (hasRequiredDecoder) return decoder_1;
  hasRequiredDecoder = 1;
  decoder_1 = decoder;
  var Enum = require_enum(), types2 = requireTypes(), util2 = requireUtil();
  function missing(field2) {
    return "missing required '" + field2.name + "'";
  }
  function decoder(mtype) {
    var gen = util2.codegen(["r", "l"], mtype.name + "$decode")("if(!(r instanceof Reader))")("r=Reader.create(r)")("var c=l===undefined?r.len:r.pos+l,m=new this.ctor" + (mtype.fieldsArray.filter(function(field3) {
      return field3.map;
    }).length ? ",k,value" : ""))("while(r.pos<c){")("var t=r.uint32()");
    if (mtype.group) gen("if((t&7)===4)")("break");
    gen("switch(t>>>3){");
    var i2 = 0;
    for (; i2 < /* initializes */
    mtype.fieldsArray.length; ++i2) {
      var field2 = mtype._fieldsArray[i2].resolve(), type2 = field2.resolvedType instanceof Enum ? "int32" : field2.type, ref2 = "m" + util2.safeProp(field2.name);
      gen("case %i: {", field2.id);
      if (field2.map) {
        gen("if(%s===util.emptyObject)", ref2)("%s={}", ref2)("var c2 = r.uint32()+r.pos");
        if (types2.defaults[field2.keyType] !== void 0) gen("k=%j", types2.defaults[field2.keyType]);
        else gen("k=null");
        if (types2.defaults[type2] !== void 0) gen("value=%j", types2.defaults[type2]);
        else gen("value=null");
        gen("while(r.pos<c2){")("var tag2=r.uint32()")("switch(tag2>>>3){")("case 1: k=r.%s(); break", field2.keyType)("case 2:");
        if (types2.basic[type2] === void 0) gen("value=types[%i].decode(r,r.uint32())", i2);
        else gen("value=r.%s()", type2);
        gen("break")("default:")("r.skipType(tag2&7)")("break")("}")("}");
        if (types2.long[field2.keyType] !== void 0) gen('%s[typeof k==="object"?util.longToHash(k):k]=value', ref2);
        else gen("%s[k]=value", ref2);
      } else if (field2.repeated) {
        gen("if(!(%s&&%s.length))", ref2, ref2)("%s=[]", ref2);
        if (types2.packed[type2] !== void 0) gen("if((t&7)===2){")("var c2=r.uint32()+r.pos")("while(r.pos<c2)")("%s.push(r.%s())", ref2, type2)("}else");
        if (types2.basic[type2] === void 0) gen(field2.resolvedType.group ? "%s.push(types[%i].decode(r))" : "%s.push(types[%i].decode(r,r.uint32()))", ref2, i2);
        else gen("%s.push(r.%s())", ref2, type2);
      } else if (types2.basic[type2] === void 0) gen(field2.resolvedType.group ? "%s=types[%i].decode(r)" : "%s=types[%i].decode(r,r.uint32())", ref2, i2);
      else gen("%s=r.%s()", ref2, type2);
      gen("break")("}");
    }
    gen("default:")("r.skipType(t&7)")("break")("}")("}");
    for (i2 = 0; i2 < mtype._fieldsArray.length; ++i2) {
      var rfield = mtype._fieldsArray[i2];
      if (rfield.required) gen("if(!m.hasOwnProperty(%j))", rfield.name)("throw util.ProtocolError(%j,{instance:m})", missing(rfield));
    }
    return gen("return m");
  }
  return decoder_1;
}
var verifier_1;
var hasRequiredVerifier;
function requireVerifier() {
  if (hasRequiredVerifier) return verifier_1;
  hasRequiredVerifier = 1;
  verifier_1 = verifier;
  var Enum = require_enum(), util2 = requireUtil();
  function invalid(field2, expected) {
    return field2.name + ": " + expected + (field2.repeated && expected !== "array" ? "[]" : field2.map && expected !== "object" ? "{k:" + field2.keyType + "}" : "") + " expected";
  }
  function genVerifyValue(gen, field2, fieldIndex, ref2) {
    if (field2.resolvedType) {
      if (field2.resolvedType instanceof Enum) {
        gen("switch(%s){", ref2)("default:")("return%j", invalid(field2, "enum value"));
        for (var keys = Object.keys(field2.resolvedType.values), j2 = 0; j2 < keys.length; ++j2) gen("case %i:", field2.resolvedType.values[keys[j2]]);
        gen("break")("}");
      } else {
        gen("{")("var e=types[%i].verify(%s);", fieldIndex, ref2)("if(e)")("return%j+e", field2.name + ".")("}");
      }
    } else {
      switch (field2.type) {
        case "int32":
        case "uint32":
        case "sint32":
        case "fixed32":
        case "sfixed32":
          gen("if(!util.isInteger(%s))", ref2)("return%j", invalid(field2, "integer"));
          break;
        case "int64":
        case "uint64":
        case "sint64":
        case "fixed64":
        case "sfixed64":
          gen("if(!util.isInteger(%s)&&!(%s&&util.isInteger(%s.low)&&util.isInteger(%s.high)))", ref2, ref2, ref2, ref2)("return%j", invalid(field2, "integer|Long"));
          break;
        case "float":
        case "double":
          gen('if(typeof %s!=="number")', ref2)("return%j", invalid(field2, "number"));
          break;
        case "bool":
          gen('if(typeof %s!=="boolean")', ref2)("return%j", invalid(field2, "boolean"));
          break;
        case "string":
          gen("if(!util.isString(%s))", ref2)("return%j", invalid(field2, "string"));
          break;
        case "bytes":
          gen('if(!(%s&&typeof %s.length==="number"||util.isString(%s)))', ref2, ref2, ref2)("return%j", invalid(field2, "buffer"));
          break;
      }
    }
    return gen;
  }
  function genVerifyKey(gen, field2, ref2) {
    switch (field2.keyType) {
      case "int32":
      case "uint32":
      case "sint32":
      case "fixed32":
      case "sfixed32":
        gen("if(!util.key32Re.test(%s))", ref2)("return%j", invalid(field2, "integer key"));
        break;
      case "int64":
      case "uint64":
      case "sint64":
      case "fixed64":
      case "sfixed64":
        gen("if(!util.key64Re.test(%s))", ref2)("return%j", invalid(field2, "integer|Long key"));
        break;
      case "bool":
        gen("if(!util.key2Re.test(%s))", ref2)("return%j", invalid(field2, "boolean key"));
        break;
    }
    return gen;
  }
  function verifier(mtype) {
    var gen = util2.codegen(["m"], mtype.name + "$verify")('if(typeof m!=="object"||m===null)')("return%j", "object expected");
    var oneofs = mtype.oneofsArray, seenFirstField = {};
    if (oneofs.length) gen("var p={}");
    for (var i2 = 0; i2 < /* initializes */
    mtype.fieldsArray.length; ++i2) {
      var field2 = mtype._fieldsArray[i2].resolve(), ref2 = "m" + util2.safeProp(field2.name);
      if (field2.optional) gen("if(%s!=null&&m.hasOwnProperty(%j)){", ref2, field2.name);
      if (field2.map) {
        gen("if(!util.isObject(%s))", ref2)("return%j", invalid(field2, "object"))("var k=Object.keys(%s)", ref2)("for(var i=0;i<k.length;++i){");
        genVerifyKey(gen, field2, "k[i]");
        genVerifyValue(gen, field2, i2, ref2 + "[k[i]]")("}");
      } else if (field2.repeated) {
        gen("if(!Array.isArray(%s))", ref2)("return%j", invalid(field2, "array"))("for(var i=0;i<%s.length;++i){", ref2);
        genVerifyValue(gen, field2, i2, ref2 + "[i]")("}");
      } else {
        if (field2.partOf) {
          var oneofProp = util2.safeProp(field2.partOf.name);
          if (seenFirstField[field2.partOf.name] === 1) gen("if(p%s===1)", oneofProp)("return%j", field2.partOf.name + ": multiple values");
          seenFirstField[field2.partOf.name] = 1;
          gen("p%s=1", oneofProp);
        }
        genVerifyValue(gen, field2, i2, ref2);
      }
      if (field2.optional) gen("}");
    }
    return gen("return null");
  }
  return verifier_1;
}
var converter = {};
var hasRequiredConverter;
function requireConverter() {
  if (hasRequiredConverter) return converter;
  hasRequiredConverter = 1;
  (function(exports) {
    var converter2 = exports;
    var Enum = require_enum(), util2 = requireUtil();
    function genValuePartial_fromObject(gen, field2, fieldIndex, prop) {
      var defaultAlreadyEmitted = false;
      if (field2.resolvedType) {
        if (field2.resolvedType instanceof Enum) {
          gen("switch(d%s){", prop);
          for (var values = field2.resolvedType.values, keys = Object.keys(values), i2 = 0; i2 < keys.length; ++i2) {
            if (values[keys[i2]] === field2.typeDefault && !defaultAlreadyEmitted) {
              gen("default:")('if(typeof(d%s)==="number"){m%s=d%s;break}', prop, prop, prop);
              if (!field2.repeated) gen("break");
              defaultAlreadyEmitted = true;
            }
            gen("case%j:", keys[i2])("case %i:", values[keys[i2]])("m%s=%j", prop, values[keys[i2]])("break");
          }
          gen("}");
        } else gen('if(typeof d%s!=="object")', prop)("throw TypeError(%j)", field2.fullName + ": object expected")("m%s=types[%i].fromObject(d%s)", prop, fieldIndex, prop);
      } else {
        var isUnsigned = false;
        switch (field2.type) {
          case "double":
          case "float":
            gen("m%s=Number(d%s)", prop, prop);
            break;
          case "uint32":
          case "fixed32":
            gen("m%s=d%s>>>0", prop, prop);
            break;
          case "int32":
          case "sint32":
          case "sfixed32":
            gen("m%s=d%s|0", prop, prop);
            break;
          case "uint64":
            isUnsigned = true;
          case "int64":
          case "sint64":
          case "fixed64":
          case "sfixed64":
            gen("if(util.Long)")("(m%s=util.Long.fromValue(d%s)).unsigned=%j", prop, prop, isUnsigned)('else if(typeof d%s==="string")', prop)("m%s=parseInt(d%s,10)", prop, prop)('else if(typeof d%s==="number")', prop)("m%s=d%s", prop, prop)('else if(typeof d%s==="object")', prop)("m%s=new util.LongBits(d%s.low>>>0,d%s.high>>>0).toNumber(%s)", prop, prop, prop, isUnsigned ? "true" : "");
            break;
          case "bytes":
            gen('if(typeof d%s==="string")', prop)("util.base64.decode(d%s,m%s=util.newBuffer(util.base64.length(d%s)),0)", prop, prop, prop)("else if(d%s.length >= 0)", prop)("m%s=d%s", prop, prop);
            break;
          case "string":
            gen("m%s=String(d%s)", prop, prop);
            break;
          case "bool":
            gen("m%s=Boolean(d%s)", prop, prop);
            break;
        }
      }
      return gen;
    }
    converter2.fromObject = function fromObject2(mtype) {
      var fields = mtype.fieldsArray;
      var gen = util2.codegen(["d"], mtype.name + "$fromObject")("if(d instanceof this.ctor)")("return d");
      if (!fields.length) return gen("return new this.ctor");
      gen("var m=new this.ctor");
      for (var i2 = 0; i2 < fields.length; ++i2) {
        var field2 = fields[i2].resolve(), prop = util2.safeProp(field2.name);
        if (field2.map) {
          gen("if(d%s){", prop)('if(typeof d%s!=="object")', prop)("throw TypeError(%j)", field2.fullName + ": object expected")("m%s={}", prop)("for(var ks=Object.keys(d%s),i=0;i<ks.length;++i){", prop);
          genValuePartial_fromObject(
            gen,
            field2,
            /* not sorted */
            i2,
            prop + "[ks[i]]"
          )("}")("}");
        } else if (field2.repeated) {
          gen("if(d%s){", prop)("if(!Array.isArray(d%s))", prop)("throw TypeError(%j)", field2.fullName + ": array expected")("m%s=[]", prop)("for(var i=0;i<d%s.length;++i){", prop);
          genValuePartial_fromObject(
            gen,
            field2,
            /* not sorted */
            i2,
            prop + "[i]"
          )("}")("}");
        } else {
          if (!(field2.resolvedType instanceof Enum)) gen("if(d%s!=null){", prop);
          genValuePartial_fromObject(
            gen,
            field2,
            /* not sorted */
            i2,
            prop
          );
          if (!(field2.resolvedType instanceof Enum)) gen("}");
        }
      }
      return gen("return m");
    };
    function genValuePartial_toObject(gen, field2, fieldIndex, prop) {
      if (field2.resolvedType) {
        if (field2.resolvedType instanceof Enum) gen("d%s=o.enums===String?(types[%i].values[m%s]===undefined?m%s:types[%i].values[m%s]):m%s", prop, fieldIndex, prop, prop, fieldIndex, prop, prop);
        else gen("d%s=types[%i].toObject(m%s,o)", prop, fieldIndex, prop);
      } else {
        var isUnsigned = false;
        switch (field2.type) {
          case "double":
          case "float":
            gen("d%s=o.json&&!isFinite(m%s)?String(m%s):m%s", prop, prop, prop, prop);
            break;
          case "uint64":
            isUnsigned = true;
          case "int64":
          case "sint64":
          case "fixed64":
          case "sfixed64":
            gen('if(typeof m%s==="number")', prop)("d%s=o.longs===String?String(m%s):m%s", prop, prop, prop)("else")("d%s=o.longs===String?util.Long.prototype.toString.call(m%s):o.longs===Number?new util.LongBits(m%s.low>>>0,m%s.high>>>0).toNumber(%s):m%s", prop, prop, prop, prop, isUnsigned ? "true" : "", prop);
            break;
          case "bytes":
            gen("d%s=o.bytes===String?util.base64.encode(m%s,0,m%s.length):o.bytes===Array?Array.prototype.slice.call(m%s):m%s", prop, prop, prop, prop, prop);
            break;
          default:
            gen("d%s=m%s", prop, prop);
            break;
        }
      }
      return gen;
    }
    converter2.toObject = function toObject2(mtype) {
      var fields = mtype.fieldsArray.slice().sort(util2.compareFieldsById);
      if (!fields.length)
        return util2.codegen()("return {}");
      var gen = util2.codegen(["m", "o"], mtype.name + "$toObject")("if(!o)")("o={}")("var d={}");
      var repeatedFields = [], mapFields = [], normalFields = [], i2 = 0;
      for (; i2 < fields.length; ++i2)
        if (!fields[i2].partOf)
          (fields[i2].resolve().repeated ? repeatedFields : fields[i2].map ? mapFields : normalFields).push(fields[i2]);
      if (repeatedFields.length) {
        gen("if(o.arrays||o.defaults){");
        for (i2 = 0; i2 < repeatedFields.length; ++i2) gen("d%s=[]", util2.safeProp(repeatedFields[i2].name));
        gen("}");
      }
      if (mapFields.length) {
        gen("if(o.objects||o.defaults){");
        for (i2 = 0; i2 < mapFields.length; ++i2) gen("d%s={}", util2.safeProp(mapFields[i2].name));
        gen("}");
      }
      if (normalFields.length) {
        gen("if(o.defaults){");
        for (i2 = 0; i2 < normalFields.length; ++i2) {
          var field2 = normalFields[i2], prop = util2.safeProp(field2.name);
          if (field2.resolvedType instanceof Enum) gen("d%s=o.enums===String?%j:%j", prop, field2.resolvedType.valuesById[field2.typeDefault], field2.typeDefault);
          else if (field2.long) gen("if(util.Long){")("var n=new util.Long(%i,%i,%j)", field2.typeDefault.low, field2.typeDefault.high, field2.typeDefault.unsigned)("d%s=o.longs===String?n.toString():o.longs===Number?n.toNumber():n", prop)("}else")("d%s=o.longs===String?%j:%i", prop, field2.typeDefault.toString(), field2.typeDefault.toNumber());
          else if (field2.bytes) {
            var arrayDefault = "[" + Array.prototype.slice.call(field2.typeDefault).join(",") + "]";
            gen("if(o.bytes===String)d%s=%j", prop, String.fromCharCode.apply(String, field2.typeDefault))("else{")("d%s=%s", prop, arrayDefault)("if(o.bytes!==Array)d%s=util.newBuffer(d%s)", prop, prop)("}");
          } else gen("d%s=%j", prop, field2.typeDefault);
        }
        gen("}");
      }
      var hasKs2 = false;
      for (i2 = 0; i2 < fields.length; ++i2) {
        var field2 = fields[i2], index = mtype._fieldsArray.indexOf(field2), prop = util2.safeProp(field2.name);
        if (field2.map) {
          if (!hasKs2) {
            hasKs2 = true;
            gen("var ks2");
          }
          gen("if(m%s&&(ks2=Object.keys(m%s)).length){", prop, prop)("d%s={}", prop)("for(var j=0;j<ks2.length;++j){");
          genValuePartial_toObject(
            gen,
            field2,
            /* sorted */
            index,
            prop + "[ks2[j]]"
          )("}");
        } else if (field2.repeated) {
          gen("if(m%s&&m%s.length){", prop, prop)("d%s=[]", prop)("for(var j=0;j<m%s.length;++j){", prop);
          genValuePartial_toObject(
            gen,
            field2,
            /* sorted */
            index,
            prop + "[j]"
          )("}");
        } else {
          gen("if(m%s!=null&&m.hasOwnProperty(%j)){", prop, field2.name);
          genValuePartial_toObject(
            gen,
            field2,
            /* sorted */
            index,
            prop
          );
          if (field2.partOf) gen("if(o.oneofs)")("d%s=%j", util2.safeProp(field2.partOf.name), field2.name);
        }
        gen("}");
      }
      return gen("return d");
    };
  })(converter);
  return converter;
}
var wrappers = {};
(function(exports) {
  var wrappers2 = exports;
  var Message2 = message;
  wrappers2[".google.protobuf.Any"] = {
    fromObject: function(object2) {
      if (object2 && object2["@type"]) {
        var name = object2["@type"].substring(object2["@type"].lastIndexOf("/") + 1);
        var type2 = this.lookup(name);
        if (type2) {
          var type_url = object2["@type"].charAt(0) === "." ? object2["@type"].slice(1) : object2["@type"];
          if (type_url.indexOf("/") === -1) {
            type_url = "/" + type_url;
          }
          return this.create({
            type_url,
            value: type2.encode(type2.fromObject(object2)).finish()
          });
        }
      }
      return this.fromObject(object2);
    },
    toObject: function(message2, options) {
      var googleApi = "type.googleapis.com/";
      var prefix = "";
      var name = "";
      if (options && options.json && message2.type_url && message2.value) {
        name = message2.type_url.substring(message2.type_url.lastIndexOf("/") + 1);
        prefix = message2.type_url.substring(0, message2.type_url.lastIndexOf("/") + 1);
        var type2 = this.lookup(name);
        if (type2)
          message2 = type2.decode(message2.value);
      }
      if (!(message2 instanceof this.ctor) && message2 instanceof Message2) {
        var object2 = message2.$type.toObject(message2, options);
        var messageName = message2.$type.fullName[0] === "." ? message2.$type.fullName.slice(1) : message2.$type.fullName;
        if (prefix === "") {
          prefix = googleApi;
        }
        name = prefix + messageName;
        object2["@type"] = name;
        return object2;
      }
      return this.toObject(message2, options);
    }
  };
})(wrappers);
var type;
var hasRequiredType;
function requireType() {
  if (hasRequiredType) return type;
  hasRequiredType = 1;
  type = Type;
  var Namespace = requireNamespace();
  ((Type.prototype = Object.create(Namespace.prototype)).constructor = Type).className = "Type";
  var Enum = require_enum(), OneOf = requireOneof(), Field = requireField(), MapField = requireMapfield(), Service2 = requireService(), Message2 = message, Reader2 = reader, Writer2 = writer, util2 = requireUtil(), encoder = requireEncoder(), decoder = requireDecoder(), verifier = requireVerifier(), converter2 = requireConverter(), wrappers$1 = wrappers;
  function Type(name, options) {
    Namespace.call(this, name, options);
    this.fields = {};
    this.oneofs = void 0;
    this.extensions = void 0;
    this.reserved = void 0;
    this.group = void 0;
    this._fieldsById = null;
    this._fieldsArray = null;
    this._oneofsArray = null;
    this._ctor = null;
  }
  Object.defineProperties(Type.prototype, {
    /**
     * Message fields by id.
     * @name Type#fieldsById
     * @type {Object.<number,Field>}
     * @readonly
     */
    fieldsById: {
      get: function() {
        if (this._fieldsById)
          return this._fieldsById;
        this._fieldsById = {};
        for (var names = Object.keys(this.fields), i2 = 0; i2 < names.length; ++i2) {
          var field2 = this.fields[names[i2]], id = field2.id;
          if (this._fieldsById[id])
            throw Error("duplicate id " + id + " in " + this);
          this._fieldsById[id] = field2;
        }
        return this._fieldsById;
      }
    },
    /**
     * Fields of this message as an array for iteration.
     * @name Type#fieldsArray
     * @type {Field[]}
     * @readonly
     */
    fieldsArray: {
      get: function() {
        return this._fieldsArray || (this._fieldsArray = util2.toArray(this.fields));
      }
    },
    /**
     * Oneofs of this message as an array for iteration.
     * @name Type#oneofsArray
     * @type {OneOf[]}
     * @readonly
     */
    oneofsArray: {
      get: function() {
        return this._oneofsArray || (this._oneofsArray = util2.toArray(this.oneofs));
      }
    },
    /**
     * The registered constructor, if any registered, otherwise a generic constructor.
     * Assigning a function replaces the internal constructor. If the function does not extend {@link Message} yet, its prototype will be setup accordingly and static methods will be populated. If it already extends {@link Message}, it will just replace the internal constructor.
     * @name Type#ctor
     * @type {Constructor<{}>}
     */
    ctor: {
      get: function() {
        return this._ctor || (this.ctor = Type.generateConstructor(this)());
      },
      set: function(ctor) {
        var prototype2 = ctor.prototype;
        if (!(prototype2 instanceof Message2)) {
          (ctor.prototype = new Message2()).constructor = ctor;
          util2.merge(ctor.prototype, prototype2);
        }
        ctor.$type = ctor.prototype.$type = this;
        util2.merge(ctor, Message2, true);
        this._ctor = ctor;
        var i2 = 0;
        for (; i2 < /* initializes */
        this.fieldsArray.length; ++i2)
          this._fieldsArray[i2].resolve();
        var ctorProperties = {};
        for (i2 = 0; i2 < /* initializes */
        this.oneofsArray.length; ++i2)
          ctorProperties[this._oneofsArray[i2].resolve().name] = {
            get: util2.oneOfGetter(this._oneofsArray[i2].oneof),
            set: util2.oneOfSetter(this._oneofsArray[i2].oneof)
          };
        if (i2)
          Object.defineProperties(ctor.prototype, ctorProperties);
      }
    }
  });
  Type.generateConstructor = function generateConstructor(mtype) {
    var gen = util2.codegen(["p"], mtype.name);
    for (var i2 = 0, field2; i2 < mtype.fieldsArray.length; ++i2)
      if ((field2 = mtype._fieldsArray[i2]).map) gen("this%s={}", util2.safeProp(field2.name));
      else if (field2.repeated) gen("this%s=[]", util2.safeProp(field2.name));
    return gen("if(p)for(var ks=Object.keys(p),i=0;i<ks.length;++i)if(p[ks[i]]!=null)")("this[ks[i]]=p[ks[i]]");
  };
  function clearCache(type2) {
    type2._fieldsById = type2._fieldsArray = type2._oneofsArray = null;
    delete type2.encode;
    delete type2.decode;
    delete type2.verify;
    return type2;
  }
  Type.fromJSON = function fromJSON(name, json) {
    var type2 = new Type(name, json.options);
    type2.extensions = json.extensions;
    type2.reserved = json.reserved;
    var names = Object.keys(json.fields), i2 = 0;
    for (; i2 < names.length; ++i2)
      type2.add(
        (typeof json.fields[names[i2]].keyType !== "undefined" ? MapField.fromJSON : Field.fromJSON)(names[i2], json.fields[names[i2]])
      );
    if (json.oneofs)
      for (names = Object.keys(json.oneofs), i2 = 0; i2 < names.length; ++i2)
        type2.add(OneOf.fromJSON(names[i2], json.oneofs[names[i2]]));
    if (json.nested)
      for (names = Object.keys(json.nested), i2 = 0; i2 < names.length; ++i2) {
        var nested = json.nested[names[i2]];
        type2.add(
          // most to least likely
          (nested.id !== void 0 ? Field.fromJSON : nested.fields !== void 0 ? Type.fromJSON : nested.values !== void 0 ? Enum.fromJSON : nested.methods !== void 0 ? Service2.fromJSON : Namespace.fromJSON)(names[i2], nested)
        );
      }
    if (json.extensions && json.extensions.length)
      type2.extensions = json.extensions;
    if (json.reserved && json.reserved.length)
      type2.reserved = json.reserved;
    if (json.group)
      type2.group = true;
    if (json.comment)
      type2.comment = json.comment;
    return type2;
  };
  Type.prototype.toJSON = function toJSON3(toJSONOptions) {
    var inherited = Namespace.prototype.toJSON.call(this, toJSONOptions);
    var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
    return util2.toObject([
      "options",
      inherited && inherited.options || void 0,
      "oneofs",
      Namespace.arrayToJSON(this.oneofsArray, toJSONOptions),
      "fields",
      Namespace.arrayToJSON(this.fieldsArray.filter(function(obj) {
        return !obj.declaringField;
      }), toJSONOptions) || {},
      "extensions",
      this.extensions && this.extensions.length ? this.extensions : void 0,
      "reserved",
      this.reserved && this.reserved.length ? this.reserved : void 0,
      "group",
      this.group || void 0,
      "nested",
      inherited && inherited.nested || void 0,
      "comment",
      keepComments ? this.comment : void 0
    ]);
  };
  Type.prototype.resolveAll = function resolveAll() {
    var fields = this.fieldsArray, i2 = 0;
    while (i2 < fields.length)
      fields[i2++].resolve();
    var oneofs = this.oneofsArray;
    i2 = 0;
    while (i2 < oneofs.length)
      oneofs[i2++].resolve();
    return Namespace.prototype.resolveAll.call(this);
  };
  Type.prototype.get = function get2(name) {
    return this.fields[name] || this.oneofs && this.oneofs[name] || this.nested && this.nested[name] || null;
  };
  Type.prototype.add = function add(object2) {
    if (this.get(object2.name))
      throw Error("duplicate name '" + object2.name + "' in " + this);
    if (object2 instanceof Field && object2.extend === void 0) {
      if (this._fieldsById ? (
        /* istanbul ignore next */
        this._fieldsById[object2.id]
      ) : this.fieldsById[object2.id])
        throw Error("duplicate id " + object2.id + " in " + this);
      if (this.isReservedId(object2.id))
        throw Error("id " + object2.id + " is reserved in " + this);
      if (this.isReservedName(object2.name))
        throw Error("name '" + object2.name + "' is reserved in " + this);
      if (object2.parent)
        object2.parent.remove(object2);
      this.fields[object2.name] = object2;
      object2.message = this;
      object2.onAdd(this);
      return clearCache(this);
    }
    if (object2 instanceof OneOf) {
      if (!this.oneofs)
        this.oneofs = {};
      this.oneofs[object2.name] = object2;
      object2.onAdd(this);
      return clearCache(this);
    }
    return Namespace.prototype.add.call(this, object2);
  };
  Type.prototype.remove = function remove2(object2) {
    if (object2 instanceof Field && object2.extend === void 0) {
      if (!this.fields || this.fields[object2.name] !== object2)
        throw Error(object2 + " is not a member of " + this);
      delete this.fields[object2.name];
      object2.parent = null;
      object2.onRemove(this);
      return clearCache(this);
    }
    if (object2 instanceof OneOf) {
      if (!this.oneofs || this.oneofs[object2.name] !== object2)
        throw Error(object2 + " is not a member of " + this);
      delete this.oneofs[object2.name];
      object2.parent = null;
      object2.onRemove(this);
      return clearCache(this);
    }
    return Namespace.prototype.remove.call(this, object2);
  };
  Type.prototype.isReservedId = function isReservedId(id) {
    return Namespace.isReservedId(this.reserved, id);
  };
  Type.prototype.isReservedName = function isReservedName(name) {
    return Namespace.isReservedName(this.reserved, name);
  };
  Type.prototype.create = function create5(properties) {
    return new this.ctor(properties);
  };
  Type.prototype.setup = function setup() {
    var fullName = this.fullName, types2 = [];
    for (var i2 = 0; i2 < /* initializes */
    this.fieldsArray.length; ++i2)
      types2.push(this._fieldsArray[i2].resolve().resolvedType);
    this.encode = encoder(this)({
      Writer: Writer2,
      types: types2,
      util: util2
    });
    this.decode = decoder(this)({
      Reader: Reader2,
      types: types2,
      util: util2
    });
    this.verify = verifier(this)({
      types: types2,
      util: util2
    });
    this.fromObject = converter2.fromObject(this)({
      types: types2,
      util: util2
    });
    this.toObject = converter2.toObject(this)({
      types: types2,
      util: util2
    });
    var wrapper = wrappers$1[fullName];
    if (wrapper) {
      var originalThis = Object.create(this);
      originalThis.fromObject = this.fromObject;
      this.fromObject = wrapper.fromObject.bind(originalThis);
      originalThis.toObject = this.toObject;
      this.toObject = wrapper.toObject.bind(originalThis);
    }
    return this;
  };
  Type.prototype.encode = function encode_setup(message2, writer2) {
    return this.setup().encode(message2, writer2);
  };
  Type.prototype.encodeDelimited = function encodeDelimited2(message2, writer2) {
    return this.encode(message2, writer2 && writer2.len ? writer2.fork() : writer2).ldelim();
  };
  Type.prototype.decode = function decode_setup(reader2, length) {
    return this.setup().decode(reader2, length);
  };
  Type.prototype.decodeDelimited = function decodeDelimited2(reader2) {
    if (!(reader2 instanceof Reader2))
      reader2 = Reader2.create(reader2);
    return this.decode(reader2, reader2.uint32());
  };
  Type.prototype.verify = function verify_setup(message2) {
    return this.setup().verify(message2);
  };
  Type.prototype.fromObject = function fromObject2(object2) {
    return this.setup().fromObject(object2);
  };
  Type.prototype.toObject = function toObject2(message2, options) {
    return this.setup().toObject(message2, options);
  };
  Type.d = function decorateType(typeName) {
    return function typeDecorator(target) {
      util2.decorateType(target, typeName);
    };
  };
  return type;
}
var root;
var hasRequiredRoot;
function requireRoot() {
  if (hasRequiredRoot) return root;
  hasRequiredRoot = 1;
  root = Root;
  var Namespace = requireNamespace();
  ((Root.prototype = Object.create(Namespace.prototype)).constructor = Root).className = "Root";
  var Field = requireField(), Enum = require_enum(), OneOf = requireOneof(), util2 = requireUtil();
  var Type, parse, common;
  function Root(options) {
    Namespace.call(this, "", options);
    this.deferred = [];
    this.files = [];
  }
  Root.fromJSON = function fromJSON(json, root2) {
    if (!root2)
      root2 = new Root();
    if (json.options)
      root2.setOptions(json.options);
    return root2.addJSON(json.nested);
  };
  Root.prototype.resolvePath = util2.path.resolve;
  Root.prototype.fetch = util2.fetch;
  function SYNC() {
  }
  Root.prototype.load = function load2(filename, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = void 0;
    }
    var self2 = this;
    if (!callback)
      return util2.asPromise(load2, self2, filename, options);
    var sync = callback === SYNC;
    function finish2(err, root2) {
      if (!callback)
        return;
      if (sync)
        throw err;
      var cb = callback;
      callback = null;
      cb(err, root2);
    }
    function getBundledFileName(filename2) {
      var idx = filename2.lastIndexOf("google/protobuf/");
      if (idx > -1) {
        var altname = filename2.substring(idx);
        if (altname in common) return altname;
      }
      return null;
    }
    function process2(filename2, source) {
      try {
        if (util2.isString(source) && source.charAt(0) === "{")
          source = JSON.parse(source);
        if (!util2.isString(source))
          self2.setOptions(source.options).addJSON(source.nested);
        else {
          parse.filename = filename2;
          var parsed = parse(source, self2, options), resolved2, i3 = 0;
          if (parsed.imports) {
            for (; i3 < parsed.imports.length; ++i3)
              if (resolved2 = getBundledFileName(parsed.imports[i3]) || self2.resolvePath(filename2, parsed.imports[i3]))
                fetch2(resolved2);
          }
          if (parsed.weakImports) {
            for (i3 = 0; i3 < parsed.weakImports.length; ++i3)
              if (resolved2 = getBundledFileName(parsed.weakImports[i3]) || self2.resolvePath(filename2, parsed.weakImports[i3]))
                fetch2(resolved2, true);
          }
        }
      } catch (err) {
        finish2(err);
      }
      if (!sync && !queued)
        finish2(null, self2);
    }
    function fetch2(filename2, weak) {
      filename2 = getBundledFileName(filename2) || filename2;
      if (self2.files.indexOf(filename2) > -1)
        return;
      self2.files.push(filename2);
      if (filename2 in common) {
        if (sync)
          process2(filename2, common[filename2]);
        else {
          ++queued;
          setTimeout(function() {
            --queued;
            process2(filename2, common[filename2]);
          });
        }
        return;
      }
      if (sync) {
        var source;
        try {
          source = util2.fs.readFileSync(filename2).toString("utf8");
        } catch (err) {
          if (!weak)
            finish2(err);
          return;
        }
        process2(filename2, source);
      } else {
        ++queued;
        self2.fetch(filename2, function(err, source2) {
          --queued;
          if (!callback)
            return;
          if (err) {
            if (!weak)
              finish2(err);
            else if (!queued)
              finish2(null, self2);
            return;
          }
          process2(filename2, source2);
        });
      }
    }
    var queued = 0;
    if (util2.isString(filename))
      filename = [filename];
    for (var i2 = 0, resolved; i2 < filename.length; ++i2)
      if (resolved = self2.resolvePath("", filename[i2]))
        fetch2(resolved);
    if (sync)
      return self2;
    if (!queued)
      finish2(null, self2);
    return void 0;
  };
  Root.prototype.loadSync = function loadSync2(filename, options) {
    if (!util2.isNode)
      throw Error("not supported");
    return this.load(filename, options, SYNC);
  };
  Root.prototype.resolveAll = function resolveAll() {
    if (this.deferred.length)
      throw Error("unresolvable extensions: " + this.deferred.map(function(field2) {
        return "'extend " + field2.extend + "' in " + field2.parent.fullName;
      }).join(", "));
    return Namespace.prototype.resolveAll.call(this);
  };
  var exposeRe = /^[A-Z]/;
  function tryHandleExtension(root2, field2) {
    var extendedType = field2.parent.lookup(field2.extend);
    if (extendedType) {
      var sisterField = new Field(field2.fullName, field2.id, field2.type, field2.rule, void 0, field2.options);
      if (extendedType.get(sisterField.name)) {
        return true;
      }
      sisterField.declaringField = field2;
      field2.extensionField = sisterField;
      extendedType.add(sisterField);
      return true;
    }
    return false;
  }
  Root.prototype._handleAdd = function _handleAdd(object2) {
    if (object2 instanceof Field) {
      if (
        /* an extension field (implies not part of a oneof) */
        object2.extend !== void 0 && /* not already handled */
        !object2.extensionField
      ) {
        if (!tryHandleExtension(this, object2))
          this.deferred.push(object2);
      }
    } else if (object2 instanceof Enum) {
      if (exposeRe.test(object2.name))
        object2.parent[object2.name] = object2.values;
    } else if (!(object2 instanceof OneOf)) {
      if (object2 instanceof Type)
        for (var i2 = 0; i2 < this.deferred.length; )
          if (tryHandleExtension(this, this.deferred[i2]))
            this.deferred.splice(i2, 1);
          else
            ++i2;
      for (var j2 = 0; j2 < /* initializes */
      object2.nestedArray.length; ++j2)
        this._handleAdd(object2._nestedArray[j2]);
      if (exposeRe.test(object2.name))
        object2.parent[object2.name] = object2;
    }
  };
  Root.prototype._handleRemove = function _handleRemove(object2) {
    if (object2 instanceof Field) {
      if (
        /* an extension field */
        object2.extend !== void 0
      ) {
        if (
          /* already handled */
          object2.extensionField
        ) {
          object2.extensionField.parent.remove(object2.extensionField);
          object2.extensionField = null;
        } else {
          var index = this.deferred.indexOf(object2);
          if (index > -1)
            this.deferred.splice(index, 1);
        }
      }
    } else if (object2 instanceof Enum) {
      if (exposeRe.test(object2.name))
        delete object2.parent[object2.name];
    } else if (object2 instanceof Namespace) {
      for (var i2 = 0; i2 < /* initializes */
      object2.nestedArray.length; ++i2)
        this._handleRemove(object2._nestedArray[i2]);
      if (exposeRe.test(object2.name))
        delete object2.parent[object2.name];
    }
  };
  Root._configure = function(Type_, parse_, common_) {
    Type = Type_;
    parse = parse_;
    common = common_;
  };
  return root;
}
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util$1.exports;
  hasRequiredUtil = 1;
  var util2 = util$1.exports = requireMinimal();
  var roots$1 = roots;
  var Type, Enum;
  util2.codegen = codegen_1;
  util2.fetch = fetch_1;
  util2.path = path;
  util2.fs = util2.inquire("fs");
  util2.toArray = function toArray2(object2) {
    if (object2) {
      var keys = Object.keys(object2), array = new Array(keys.length), index = 0;
      while (index < keys.length)
        array[index] = object2[keys[index++]];
      return array;
    }
    return [];
  };
  util2.toObject = function toObject2(array) {
    var object2 = {}, index = 0;
    while (index < array.length) {
      var key = array[index++], val = array[index++];
      if (val !== void 0)
        object2[key] = val;
    }
    return object2;
  };
  var safePropBackslashRe = /\\/g, safePropQuoteRe = /"/g;
  util2.isReserved = function isReserved(name) {
    return /^(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$/.test(name);
  };
  util2.safeProp = function safeProp(prop) {
    if (!/^[$\w_]+$/.test(prop) || util2.isReserved(prop))
      return '["' + prop.replace(safePropBackslashRe, "\\\\").replace(safePropQuoteRe, '\\"') + '"]';
    return "." + prop;
  };
  util2.ucFirst = function ucFirst(str) {
    return str.charAt(0).toUpperCase() + str.substring(1);
  };
  var camelCaseRe = /_([a-z])/g;
  util2.camelCase = function camelCase(str) {
    return str.substring(0, 1) + str.substring(1).replace(camelCaseRe, function($0, $1) {
      return $1.toUpperCase();
    });
  };
  util2.compareFieldsById = function compareFieldsById(a2, b2) {
    return a2.id - b2.id;
  };
  util2.decorateType = function decorateType(ctor, typeName) {
    if (ctor.$type) {
      if (typeName && ctor.$type.name !== typeName) {
        util2.decorateRoot.remove(ctor.$type);
        ctor.$type.name = typeName;
        util2.decorateRoot.add(ctor.$type);
      }
      return ctor.$type;
    }
    if (!Type)
      Type = requireType();
    var type2 = new Type(typeName || ctor.name);
    util2.decorateRoot.add(type2);
    type2.ctor = ctor;
    Object.defineProperty(ctor, "$type", { value: type2, enumerable: false });
    Object.defineProperty(ctor.prototype, "$type", { value: type2, enumerable: false });
    return type2;
  };
  var decorateEnumIndex = 0;
  util2.decorateEnum = function decorateEnum(object2) {
    if (object2.$type)
      return object2.$type;
    if (!Enum)
      Enum = require_enum();
    var enm = new Enum("Enum" + decorateEnumIndex++, object2);
    util2.decorateRoot.add(enm);
    Object.defineProperty(object2, "$type", { value: enm, enumerable: false });
    return enm;
  };
  util2.setProperty = function setProperty(dst, path2, value) {
    function setProp(dst2, path3, value2) {
      var part = path3.shift();
      if (part === "__proto__" || part === "prototype") {
        return dst2;
      }
      if (path3.length > 0) {
        dst2[part] = setProp(dst2[part] || {}, path3, value2);
      } else {
        var prevValue = dst2[part];
        if (prevValue)
          value2 = [].concat(prevValue).concat(value2);
        dst2[part] = value2;
      }
      return dst2;
    }
    if (typeof dst !== "object")
      throw TypeError("dst must be an object");
    if (!path2)
      throw TypeError("path must be specified");
    path2 = path2.split(".");
    return setProp(dst, path2, value);
  };
  Object.defineProperty(util2, "decorateRoot", {
    get: function() {
      return roots$1["decorated"] || (roots$1["decorated"] = new (requireRoot())());
    }
  });
  return util$1.exports;
}
var object;
var hasRequiredObject;
function requireObject() {
  if (hasRequiredObject) return object;
  hasRequiredObject = 1;
  object = ReflectionObject;
  ReflectionObject.className = "ReflectionObject";
  var util2 = requireUtil();
  var Root;
  function ReflectionObject(name, options) {
    if (!util2.isString(name))
      throw TypeError("name must be a string");
    if (options && !util2.isObject(options))
      throw TypeError("options must be an object");
    this.options = options;
    this.parsedOptions = null;
    this.name = name;
    this.parent = null;
    this.resolved = false;
    this.comment = null;
    this.filename = null;
  }
  Object.defineProperties(ReflectionObject.prototype, {
    /**
     * Reference to the root namespace.
     * @name ReflectionObject#root
     * @type {Root}
     * @readonly
     */
    root: {
      get: function() {
        var ptr = this;
        while (ptr.parent !== null)
          ptr = ptr.parent;
        return ptr;
      }
    },
    /**
     * Full name including leading dot.
     * @name ReflectionObject#fullName
     * @type {string}
     * @readonly
     */
    fullName: {
      get: function() {
        var path2 = [this.name], ptr = this.parent;
        while (ptr) {
          path2.unshift(ptr.name);
          ptr = ptr.parent;
        }
        return path2.join(".");
      }
    }
  });
  ReflectionObject.prototype.toJSON = /* istanbul ignore next */
  function toJSON3() {
    throw Error();
  };
  ReflectionObject.prototype.onAdd = function onAdd(parent) {
    if (this.parent && this.parent !== parent)
      this.parent.remove(this);
    this.parent = parent;
    this.resolved = false;
    var root2 = parent.root;
    if (root2 instanceof Root)
      root2._handleAdd(this);
  };
  ReflectionObject.prototype.onRemove = function onRemove(parent) {
    var root2 = parent.root;
    if (root2 instanceof Root)
      root2._handleRemove(this);
    this.parent = null;
    this.resolved = false;
  };
  ReflectionObject.prototype.resolve = function resolve2() {
    if (this.resolved)
      return this;
    if (this.root instanceof Root)
      this.resolved = true;
    return this;
  };
  ReflectionObject.prototype.getOption = function getOption(name) {
    if (this.options)
      return this.options[name];
    return void 0;
  };
  ReflectionObject.prototype.setOption = function setOption(name, value, ifNotSet) {
    if (!ifNotSet || !this.options || this.options[name] === void 0)
      (this.options || (this.options = {}))[name] = value;
    return this;
  };
  ReflectionObject.prototype.setParsedOption = function setParsedOption(name, value, propName) {
    if (!this.parsedOptions) {
      this.parsedOptions = [];
    }
    var parsedOptions = this.parsedOptions;
    if (propName) {
      var opt = parsedOptions.find(function(opt2) {
        return Object.prototype.hasOwnProperty.call(opt2, name);
      });
      if (opt) {
        var newValue = opt[name];
        util2.setProperty(newValue, propName, value);
      } else {
        opt = {};
        opt[name] = util2.setProperty({}, propName, value);
        parsedOptions.push(opt);
      }
    } else {
      var newOpt = {};
      newOpt[name] = value;
      parsedOptions.push(newOpt);
    }
    return this;
  };
  ReflectionObject.prototype.setOptions = function setOptions(options, ifNotSet) {
    if (options)
      for (var keys = Object.keys(options), i2 = 0; i2 < keys.length; ++i2)
        this.setOption(keys[i2], options[keys[i2]], ifNotSet);
    return this;
  };
  ReflectionObject.prototype.toString = function toString3() {
    var className = this.constructor.className, fullName = this.fullName;
    if (fullName.length)
      return className + " " + fullName;
    return className;
  };
  ReflectionObject._configure = function(Root_) {
    Root = Root_;
  };
  return object;
}
var _enum;
var hasRequired_enum;
function require_enum() {
  if (hasRequired_enum) return _enum;
  hasRequired_enum = 1;
  _enum = Enum;
  var ReflectionObject = requireObject();
  ((Enum.prototype = Object.create(ReflectionObject.prototype)).constructor = Enum).className = "Enum";
  var Namespace = requireNamespace(), util2 = requireUtil();
  function Enum(name, values, options, comment, comments, valuesOptions) {
    ReflectionObject.call(this, name, options);
    if (values && typeof values !== "object")
      throw TypeError("values must be an object");
    this.valuesById = {};
    this.values = Object.create(this.valuesById);
    this.comment = comment;
    this.comments = comments || {};
    this.valuesOptions = valuesOptions;
    this.reserved = void 0;
    if (values) {
      for (var keys = Object.keys(values), i2 = 0; i2 < keys.length; ++i2)
        if (typeof values[keys[i2]] === "number")
          this.valuesById[this.values[keys[i2]] = values[keys[i2]]] = keys[i2];
    }
  }
  Enum.fromJSON = function fromJSON(name, json) {
    var enm = new Enum(name, json.values, json.options, json.comment, json.comments);
    enm.reserved = json.reserved;
    return enm;
  };
  Enum.prototype.toJSON = function toJSON3(toJSONOptions) {
    var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
    return util2.toObject([
      "options",
      this.options,
      "valuesOptions",
      this.valuesOptions,
      "values",
      this.values,
      "reserved",
      this.reserved && this.reserved.length ? this.reserved : void 0,
      "comment",
      keepComments ? this.comment : void 0,
      "comments",
      keepComments ? this.comments : void 0
    ]);
  };
  Enum.prototype.add = function add(name, id, comment, options) {
    if (!util2.isString(name))
      throw TypeError("name must be a string");
    if (!util2.isInteger(id))
      throw TypeError("id must be an integer");
    if (this.values[name] !== void 0)
      throw Error("duplicate name '" + name + "' in " + this);
    if (this.isReservedId(id))
      throw Error("id " + id + " is reserved in " + this);
    if (this.isReservedName(name))
      throw Error("name '" + name + "' is reserved in " + this);
    if (this.valuesById[id] !== void 0) {
      if (!(this.options && this.options.allow_alias))
        throw Error("duplicate id " + id + " in " + this);
      this.values[name] = id;
    } else
      this.valuesById[this.values[name] = id] = name;
    if (options) {
      if (this.valuesOptions === void 0)
        this.valuesOptions = {};
      this.valuesOptions[name] = options || null;
    }
    this.comments[name] = comment || null;
    return this;
  };
  Enum.prototype.remove = function remove2(name) {
    if (!util2.isString(name))
      throw TypeError("name must be a string");
    var val = this.values[name];
    if (val == null)
      throw Error("name '" + name + "' does not exist in " + this);
    delete this.valuesById[val];
    delete this.values[name];
    delete this.comments[name];
    if (this.valuesOptions)
      delete this.valuesOptions[name];
    return this;
  };
  Enum.prototype.isReservedId = function isReservedId(id) {
    return Namespace.isReservedId(this.reserved, id);
  };
  Enum.prototype.isReservedName = function isReservedName(name) {
    return Namespace.isReservedName(this.reserved, name);
  };
  return _enum;
}
var encoder_1;
var hasRequiredEncoder;
function requireEncoder() {
  if (hasRequiredEncoder) return encoder_1;
  hasRequiredEncoder = 1;
  encoder_1 = encoder;
  var Enum = require_enum(), types2 = requireTypes(), util2 = requireUtil();
  function genTypePartial(gen, field2, fieldIndex, ref2) {
    return field2.resolvedType.group ? gen("types[%i].encode(%s,w.uint32(%i)).uint32(%i)", fieldIndex, ref2, (field2.id << 3 | 3) >>> 0, (field2.id << 3 | 4) >>> 0) : gen("types[%i].encode(%s,w.uint32(%i).fork()).ldelim()", fieldIndex, ref2, (field2.id << 3 | 2) >>> 0);
  }
  function encoder(mtype) {
    var gen = util2.codegen(["m", "w"], mtype.name + "$encode")("if(!w)")("w=Writer.create()");
    var i2, ref2;
    var fields = (
      /* initializes */
      mtype.fieldsArray.slice().sort(util2.compareFieldsById)
    );
    for (var i2 = 0; i2 < fields.length; ++i2) {
      var field2 = fields[i2].resolve(), index = mtype._fieldsArray.indexOf(field2), type2 = field2.resolvedType instanceof Enum ? "int32" : field2.type, wireType = types2.basic[type2];
      ref2 = "m" + util2.safeProp(field2.name);
      if (field2.map) {
        gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j)){", ref2, field2.name)("for(var ks=Object.keys(%s),i=0;i<ks.length;++i){", ref2)("w.uint32(%i).fork().uint32(%i).%s(ks[i])", (field2.id << 3 | 2) >>> 0, 8 | types2.mapKey[field2.keyType], field2.keyType);
        if (wireType === void 0) gen("types[%i].encode(%s[ks[i]],w.uint32(18).fork()).ldelim().ldelim()", index, ref2);
        else gen(".uint32(%i).%s(%s[ks[i]]).ldelim()", 16 | wireType, type2, ref2);
        gen("}")("}");
      } else if (field2.repeated) {
        gen("if(%s!=null&&%s.length){", ref2, ref2);
        if (field2.packed && types2.packed[type2] !== void 0) {
          gen("w.uint32(%i).fork()", (field2.id << 3 | 2) >>> 0)("for(var i=0;i<%s.length;++i)", ref2)("w.%s(%s[i])", type2, ref2)("w.ldelim()");
        } else {
          gen("for(var i=0;i<%s.length;++i)", ref2);
          if (wireType === void 0)
            genTypePartial(gen, field2, index, ref2 + "[i]");
          else gen("w.uint32(%i).%s(%s[i])", (field2.id << 3 | wireType) >>> 0, type2, ref2);
        }
        gen("}");
      } else {
        if (field2.optional) gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j))", ref2, field2.name);
        if (wireType === void 0)
          genTypePartial(gen, field2, index, ref2);
        else gen("w.uint32(%i).%s(%s)", (field2.id << 3 | wireType) >>> 0, type2, ref2);
      }
    }
    return gen("return w");
  }
  return encoder_1;
}
var protobuf$1 = indexLight.exports = indexMinimal;
protobuf$1.build = "light";
function load(filename, root2, callback) {
  if (typeof root2 === "function") {
    callback = root2;
    root2 = new protobuf$1.Root();
  } else if (!root2)
    root2 = new protobuf$1.Root();
  return root2.load(filename, callback);
}
protobuf$1.load = load;
function loadSync(filename, root2) {
  if (!root2)
    root2 = new protobuf$1.Root();
  return root2.loadSync(filename);
}
protobuf$1.loadSync = loadSync;
protobuf$1.encoder = requireEncoder();
protobuf$1.decoder = requireDecoder();
protobuf$1.verifier = requireVerifier();
protobuf$1.converter = requireConverter();
protobuf$1.ReflectionObject = requireObject();
protobuf$1.Namespace = requireNamespace();
protobuf$1.Root = requireRoot();
protobuf$1.Enum = require_enum();
protobuf$1.Type = requireType();
protobuf$1.Field = requireField();
protobuf$1.OneOf = requireOneof();
protobuf$1.MapField = requireMapfield();
protobuf$1.Service = requireService();
protobuf$1.Method = requireMethod();
protobuf$1.Message = message;
protobuf$1.wrappers = wrappers;
protobuf$1.types = requireTypes();
protobuf$1.util = requireUtil();
protobuf$1.ReflectionObject._configure(protobuf$1.Root);
protobuf$1.Namespace._configure(protobuf$1.Type, protobuf$1.Service, protobuf$1.Enum);
protobuf$1.Root._configure(protobuf$1.Type);
protobuf$1.Field._configure(protobuf$1.Type);
var indexLightExports = indexLight.exports;
var light = indexLightExports;
const protobuf = /* @__PURE__ */ getDefaultExportFromCjs(light);
function bind(fn, thisArg) {
  return function wrap() {
    return fn.apply(thisArg, arguments);
  };
}
const { toString } = Object.prototype;
const { getPrototypeOf } = Object;
const kindOf = /* @__PURE__ */ ((cache) => (thing) => {
  const str = toString.call(thing);
  return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
})(/* @__PURE__ */ Object.create(null));
const kindOfTest = (type2) => {
  type2 = type2.toLowerCase();
  return (thing) => kindOf(thing) === type2;
};
const typeOfTest = (type2) => (thing) => typeof thing === type2;
const { isArray } = Array;
const isUndefined = typeOfTest("undefined");
function isBuffer(val) {
  return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && isFunction(val.constructor.isBuffer) && val.constructor.isBuffer(val);
}
const isArrayBuffer = kindOfTest("ArrayBuffer");
function isArrayBufferView(val) {
  let result;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) {
    result = ArrayBuffer.isView(val);
  } else {
    result = val && val.buffer && isArrayBuffer(val.buffer);
  }
  return result;
}
const isString = typeOfTest("string");
const isFunction = typeOfTest("function");
const isNumber = typeOfTest("number");
const isObject = (thing) => thing !== null && typeof thing === "object";
const isBoolean = (thing) => thing === true || thing === false;
const isPlainObject$1 = (val) => {
  if (kindOf(val) !== "object") {
    return false;
  }
  const prototype2 = getPrototypeOf(val);
  return (prototype2 === null || prototype2 === Object.prototype || Object.getPrototypeOf(prototype2) === null) && !(Symbol.toStringTag in val) && !(Symbol.iterator in val);
};
const isDate = kindOfTest("Date");
const isFile = kindOfTest("File");
const isBlob = kindOfTest("Blob");
const isFileList = kindOfTest("FileList");
const isStream = (val) => isObject(val) && isFunction(val.pipe);
const isFormData = (thing) => {
  let kind;
  return thing && (typeof FormData === "function" && thing instanceof FormData || isFunction(thing.append) && ((kind = kindOf(thing)) === "formdata" || // detect form-data instance
  kind === "object" && isFunction(thing.toString) && thing.toString() === "[object FormData]"));
};
const isURLSearchParams = kindOfTest("URLSearchParams");
const [isReadableStream, isRequest, isResponse, isHeaders] = ["ReadableStream", "Request", "Response", "Headers"].map(kindOfTest);
const trim = (str) => str.trim ? str.trim() : str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
function forEach(obj, fn, { allOwnKeys = false } = {}) {
  if (obj === null || typeof obj === "undefined") {
    return;
  }
  let i2;
  let l2;
  if (typeof obj !== "object") {
    obj = [obj];
  }
  if (isArray(obj)) {
    for (i2 = 0, l2 = obj.length; i2 < l2; i2++) {
      fn.call(null, obj[i2], i2, obj);
    }
  } else {
    const keys = allOwnKeys ? Object.getOwnPropertyNames(obj) : Object.keys(obj);
    const len = keys.length;
    let key;
    for (i2 = 0; i2 < len; i2++) {
      key = keys[i2];
      fn.call(null, obj[key], key, obj);
    }
  }
}
function findKey(obj, key) {
  key = key.toLowerCase();
  const keys = Object.keys(obj);
  let i2 = keys.length;
  let _key;
  while (i2-- > 0) {
    _key = keys[i2];
    if (key === _key.toLowerCase()) {
      return _key;
    }
  }
  return null;
}
const _global = (() => {
  if (typeof globalThis !== "undefined") return globalThis;
  return typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : global;
})();
const isContextDefined = (context) => !isUndefined(context) && context !== _global;
function merge() {
  const { caseless } = isContextDefined(this) && this || {};
  const result = {};
  const assignValue = (val, key) => {
    const targetKey = caseless && findKey(result, key) || key;
    if (isPlainObject$1(result[targetKey]) && isPlainObject$1(val)) {
      result[targetKey] = merge(result[targetKey], val);
    } else if (isPlainObject$1(val)) {
      result[targetKey] = merge({}, val);
    } else if (isArray(val)) {
      result[targetKey] = val.slice();
    } else {
      result[targetKey] = val;
    }
  };
  for (let i2 = 0, l2 = arguments.length; i2 < l2; i2++) {
    arguments[i2] && forEach(arguments[i2], assignValue);
  }
  return result;
}
const extend = (a2, b2, thisArg, { allOwnKeys } = {}) => {
  forEach(b2, (val, key) => {
    if (thisArg && isFunction(val)) {
      a2[key] = bind(val, thisArg);
    } else {
      a2[key] = val;
    }
  }, { allOwnKeys });
  return a2;
};
const stripBOM = (content) => {
  if (content.charCodeAt(0) === 65279) {
    content = content.slice(1);
  }
  return content;
};
const inherits = (constructor, superConstructor, props, descriptors2) => {
  constructor.prototype = Object.create(superConstructor.prototype, descriptors2);
  constructor.prototype.constructor = constructor;
  Object.defineProperty(constructor, "super", {
    value: superConstructor.prototype
  });
  props && Object.assign(constructor.prototype, props);
};
const toFlatObject = (sourceObj, destObj, filter2, propFilter) => {
  let props;
  let i2;
  let prop;
  const merged = {};
  destObj = destObj || {};
  if (sourceObj == null) return destObj;
  do {
    props = Object.getOwnPropertyNames(sourceObj);
    i2 = props.length;
    while (i2-- > 0) {
      prop = props[i2];
      if ((!propFilter || propFilter(prop, sourceObj, destObj)) && !merged[prop]) {
        destObj[prop] = sourceObj[prop];
        merged[prop] = true;
      }
    }
    sourceObj = filter2 !== false && getPrototypeOf(sourceObj);
  } while (sourceObj && (!filter2 || filter2(sourceObj, destObj)) && sourceObj !== Object.prototype);
  return destObj;
};
const endsWith = (str, searchString, position) => {
  str = String(str);
  if (position === void 0 || position > str.length) {
    position = str.length;
  }
  position -= searchString.length;
  const lastIndex = str.indexOf(searchString, position);
  return lastIndex !== -1 && lastIndex === position;
};
const toArray = (thing) => {
  if (!thing) return null;
  if (isArray(thing)) return thing;
  let i2 = thing.length;
  if (!isNumber(i2)) return null;
  const arr = new Array(i2);
  while (i2-- > 0) {
    arr[i2] = thing[i2];
  }
  return arr;
};
const isTypedArray = /* @__PURE__ */ ((TypedArray) => {
  return (thing) => {
    return TypedArray && thing instanceof TypedArray;
  };
})(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array));
const forEachEntry = (obj, fn) => {
  const generator = obj && obj[Symbol.iterator];
  const iterator2 = generator.call(obj);
  let result;
  while ((result = iterator2.next()) && !result.done) {
    const pair = result.value;
    fn.call(obj, pair[0], pair[1]);
  }
};
const matchAll = (regExp, str) => {
  let matches;
  const arr = [];
  while ((matches = regExp.exec(str)) !== null) {
    arr.push(matches);
  }
  return arr;
};
const isHTMLForm = kindOfTest("HTMLFormElement");
const toCamelCase = (str) => {
  return str.toLowerCase().replace(
    /[-_\s]([a-z\d])(\w*)/g,
    function replacer2(m2, p1, p2) {
      return p1.toUpperCase() + p2;
    }
  );
};
const hasOwnProperty = (({ hasOwnProperty: hasOwnProperty2 }) => (obj, prop) => hasOwnProperty2.call(obj, prop))(Object.prototype);
const isRegExp = kindOfTest("RegExp");
const reduceDescriptors = (obj, reducer) => {
  const descriptors2 = Object.getOwnPropertyDescriptors(obj);
  const reducedDescriptors = {};
  forEach(descriptors2, (descriptor, name) => {
    let ret;
    if ((ret = reducer(descriptor, name, obj)) !== false) {
      reducedDescriptors[name] = ret || descriptor;
    }
  });
  Object.defineProperties(obj, reducedDescriptors);
};
const freezeMethods = (obj) => {
  reduceDescriptors(obj, (descriptor, name) => {
    if (isFunction(obj) && ["arguments", "caller", "callee"].indexOf(name) !== -1) {
      return false;
    }
    const value = obj[name];
    if (!isFunction(value)) return;
    descriptor.enumerable = false;
    if ("writable" in descriptor) {
      descriptor.writable = false;
      return;
    }
    if (!descriptor.set) {
      descriptor.set = () => {
        throw Error("Can not rewrite read-only method '" + name + "'");
      };
    }
  });
};
const toObjectSet = (arrayOrString, delimiter) => {
  const obj = {};
  const define = (arr) => {
    arr.forEach((value) => {
      obj[value] = true;
    });
  };
  isArray(arrayOrString) ? define(arrayOrString) : define(String(arrayOrString).split(delimiter));
  return obj;
};
const noop$1 = () => {
};
const toFiniteNumber = (value, defaultValue) => {
  return value != null && Number.isFinite(value = +value) ? value : defaultValue;
};
function isSpecCompliantForm(thing) {
  return !!(thing && isFunction(thing.append) && thing[Symbol.toStringTag] === "FormData" && thing[Symbol.iterator]);
}
const toJSONObject = (obj) => {
  const stack2 = new Array(10);
  const visit = (source, i2) => {
    if (isObject(source)) {
      if (stack2.indexOf(source) >= 0) {
        return;
      }
      if (!("toJSON" in source)) {
        stack2[i2] = source;
        const target = isArray(source) ? [] : {};
        forEach(source, (value, key) => {
          const reducedValue = visit(value, i2 + 1);
          !isUndefined(reducedValue) && (target[key] = reducedValue);
        });
        stack2[i2] = void 0;
        return target;
      }
    }
    return source;
  };
  return visit(obj, 0);
};
const isAsyncFn = kindOfTest("AsyncFunction");
const isThenable = (thing) => thing && (isObject(thing) || isFunction(thing)) && isFunction(thing.then) && isFunction(thing.catch);
const _setImmediate = ((setImmediateSupported, postMessageSupported) => {
  if (setImmediateSupported) {
    return setImmediate;
  }
  return postMessageSupported ? ((token, callbacks) => {
    _global.addEventListener("message", ({ source, data }) => {
      if (source === _global && data === token) {
        callbacks.length && callbacks.shift()();
      }
    }, false);
    return (cb) => {
      callbacks.push(cb);
      _global.postMessage(token, "*");
    };
  })(`axios@${Math.random()}`, []) : (cb) => setTimeout(cb);
})(
  typeof setImmediate === "function",
  isFunction(_global.postMessage)
);
const asap = typeof queueMicrotask !== "undefined" ? queueMicrotask.bind(_global) : typeof process !== "undefined" && process.nextTick || _setImmediate;
const utils$1 = {
  isArray,
  isArrayBuffer,
  isBuffer,
  isFormData,
  isArrayBufferView,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isPlainObject: isPlainObject$1,
  isReadableStream,
  isRequest,
  isResponse,
  isHeaders,
  isUndefined,
  isDate,
  isFile,
  isBlob,
  isRegExp,
  isFunction,
  isStream,
  isURLSearchParams,
  isTypedArray,
  isFileList,
  forEach,
  merge,
  extend,
  trim,
  stripBOM,
  inherits,
  toFlatObject,
  kindOf,
  kindOfTest,
  endsWith,
  toArray,
  forEachEntry,
  matchAll,
  isHTMLForm,
  hasOwnProperty,
  hasOwnProp: hasOwnProperty,
  // an alias to avoid ESLint no-prototype-builtins detection
  reduceDescriptors,
  freezeMethods,
  toObjectSet,
  toCamelCase,
  noop: noop$1,
  toFiniteNumber,
  findKey,
  global: _global,
  isContextDefined,
  isSpecCompliantForm,
  toJSONObject,
  isAsyncFn,
  isThenable,
  setImmediate: _setImmediate,
  asap
};
function AxiosError$1(message2, code, config, request2, response) {
  Error.call(this);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack;
  }
  this.message = message2;
  this.name = "AxiosError";
  code && (this.code = code);
  config && (this.config = config);
  request2 && (this.request = request2);
  if (response) {
    this.response = response;
    this.status = response.status ? response.status : null;
  }
}
utils$1.inherits(AxiosError$1, Error, {
  toJSON: function toJSON2() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: utils$1.toJSONObject(this.config),
      code: this.code,
      status: this.status
    };
  }
});
const prototype$1 = AxiosError$1.prototype;
const descriptors = {};
[
  "ERR_BAD_OPTION_VALUE",
  "ERR_BAD_OPTION",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ERR_NETWORK",
  "ERR_FR_TOO_MANY_REDIRECTS",
  "ERR_DEPRECATED",
  "ERR_BAD_RESPONSE",
  "ERR_BAD_REQUEST",
  "ERR_CANCELED",
  "ERR_NOT_SUPPORT",
  "ERR_INVALID_URL"
  // eslint-disable-next-line func-names
].forEach((code) => {
  descriptors[code] = { value: code };
});
Object.defineProperties(AxiosError$1, descriptors);
Object.defineProperty(prototype$1, "isAxiosError", { value: true });
AxiosError$1.from = (error, code, config, request2, response, customProps) => {
  const axiosError = Object.create(prototype$1);
  utils$1.toFlatObject(error, axiosError, function filter2(obj) {
    return obj !== Error.prototype;
  }, (prop) => {
    return prop !== "isAxiosError";
  });
  AxiosError$1.call(axiosError, error.message, code, config, request2, response);
  axiosError.cause = error;
  axiosError.name = error.name;
  customProps && Object.assign(axiosError, customProps);
  return axiosError;
};
const httpAdapter = null;
function isVisitable(thing) {
  return utils$1.isPlainObject(thing) || utils$1.isArray(thing);
}
function removeBrackets(key) {
  return utils$1.endsWith(key, "[]") ? key.slice(0, -2) : key;
}
function renderKey(path2, key, dots) {
  if (!path2) return key;
  return path2.concat(key).map(function each(token, i2) {
    token = removeBrackets(token);
    return !dots && i2 ? "[" + token + "]" : token;
  }).join(dots ? "." : "");
}
function isFlatArray(arr) {
  return utils$1.isArray(arr) && !arr.some(isVisitable);
}
const predicates = utils$1.toFlatObject(utils$1, {}, null, function filter(prop) {
  return /^is[A-Z]/.test(prop);
});
function toFormData$1(obj, formData, options) {
  if (!utils$1.isObject(obj)) {
    throw new TypeError("target must be an object");
  }
  formData = formData || new FormData();
  options = utils$1.toFlatObject(options, {
    metaTokens: true,
    dots: false,
    indexes: false
  }, false, function defined(option, source) {
    return !utils$1.isUndefined(source[option]);
  });
  const metaTokens = options.metaTokens;
  const visitor = options.visitor || defaultVisitor;
  const dots = options.dots;
  const indexes = options.indexes;
  const _Blob = options.Blob || typeof Blob !== "undefined" && Blob;
  const useBlob = _Blob && utils$1.isSpecCompliantForm(formData);
  if (!utils$1.isFunction(visitor)) {
    throw new TypeError("visitor must be a function");
  }
  function convertValue(value) {
    if (value === null) return "";
    if (utils$1.isDate(value)) {
      return value.toISOString();
    }
    if (!useBlob && utils$1.isBlob(value)) {
      throw new AxiosError$1("Blob is not supported. Use a Buffer instead.");
    }
    if (utils$1.isArrayBuffer(value) || utils$1.isTypedArray(value)) {
      return useBlob && typeof Blob === "function" ? new Blob([value]) : Buffer.from(value);
    }
    return value;
  }
  function defaultVisitor(value, key, path2) {
    let arr = value;
    if (value && !path2 && typeof value === "object") {
      if (utils$1.endsWith(key, "{}")) {
        key = metaTokens ? key : key.slice(0, -2);
        value = JSON.stringify(value);
      } else if (utils$1.isArray(value) && isFlatArray(value) || (utils$1.isFileList(value) || utils$1.endsWith(key, "[]")) && (arr = utils$1.toArray(value))) {
        key = removeBrackets(key);
        arr.forEach(function each(el, index) {
          !(utils$1.isUndefined(el) || el === null) && formData.append(
            // eslint-disable-next-line no-nested-ternary
            indexes === true ? renderKey([key], index, dots) : indexes === null ? key : key + "[]",
            convertValue(el)
          );
        });
        return false;
      }
    }
    if (isVisitable(value)) {
      return true;
    }
    formData.append(renderKey(path2, key, dots), convertValue(value));
    return false;
  }
  const stack2 = [];
  const exposedHelpers = Object.assign(predicates, {
    defaultVisitor,
    convertValue,
    isVisitable
  });
  function build(value, path2) {
    if (utils$1.isUndefined(value)) return;
    if (stack2.indexOf(value) !== -1) {
      throw Error("Circular reference detected in " + path2.join("."));
    }
    stack2.push(value);
    utils$1.forEach(value, function each(el, key) {
      const result = !(utils$1.isUndefined(el) || el === null) && visitor.call(
        formData,
        el,
        utils$1.isString(key) ? key.trim() : key,
        path2,
        exposedHelpers
      );
      if (result === true) {
        build(el, path2 ? path2.concat(key) : [key]);
      }
    });
    stack2.pop();
  }
  if (!utils$1.isObject(obj)) {
    throw new TypeError("data must be an object");
  }
  build(obj);
  return formData;
}
function encode$1(str) {
  const charMap = {
    "!": "%21",
    "'": "%27",
    "(": "%28",
    ")": "%29",
    "~": "%7E",
    "%20": "+",
    "%00": "\0"
  };
  return encodeURIComponent(str).replace(/[!'()~]|%20|%00/g, function replacer2(match) {
    return charMap[match];
  });
}
function AxiosURLSearchParams(params, options) {
  this._pairs = [];
  params && toFormData$1(params, this, options);
}
const prototype = AxiosURLSearchParams.prototype;
prototype.append = function append(name, value) {
  this._pairs.push([name, value]);
};
prototype.toString = function toString2(encoder) {
  const _encode = encoder ? function(value) {
    return encoder.call(this, value, encode$1);
  } : encode$1;
  return this._pairs.map(function each(pair) {
    return _encode(pair[0]) + "=" + _encode(pair[1]);
  }, "").join("&");
};
function encode(val) {
  return encodeURIComponent(val).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+").replace(/%5B/gi, "[").replace(/%5D/gi, "]");
}
function buildURL(url, params, options) {
  if (!params) {
    return url;
  }
  const _encode = options && options.encode || encode;
  if (utils$1.isFunction(options)) {
    options = {
      serialize: options
    };
  }
  const serializeFn = options && options.serialize;
  let serializedParams;
  if (serializeFn) {
    serializedParams = serializeFn(params, options);
  } else {
    serializedParams = utils$1.isURLSearchParams(params) ? params.toString() : new AxiosURLSearchParams(params, options).toString(_encode);
  }
  if (serializedParams) {
    const hashmarkIndex = url.indexOf("#");
    if (hashmarkIndex !== -1) {
      url = url.slice(0, hashmarkIndex);
    }
    url += (url.indexOf("?") === -1 ? "?" : "&") + serializedParams;
  }
  return url;
}
class InterceptorManager {
  constructor() {
    this.handlers = [];
  }
  /**
   * Add a new interceptor to the stack
   *
   * @param {Function} fulfilled The function to handle `then` for a `Promise`
   * @param {Function} rejected The function to handle `reject` for a `Promise`
   *
   * @return {Number} An ID used to remove interceptor later
   */
  use(fulfilled, rejected, options) {
    this.handlers.push({
      fulfilled,
      rejected,
      synchronous: options ? options.synchronous : false,
      runWhen: options ? options.runWhen : null
    });
    return this.handlers.length - 1;
  }
  /**
   * Remove an interceptor from the stack
   *
   * @param {Number} id The ID that was returned by `use`
   *
   * @returns {Boolean} `true` if the interceptor was removed, `false` otherwise
   */
  eject(id) {
    if (this.handlers[id]) {
      this.handlers[id] = null;
    }
  }
  /**
   * Clear all interceptors from the stack
   *
   * @returns {void}
   */
  clear() {
    if (this.handlers) {
      this.handlers = [];
    }
  }
  /**
   * Iterate over all the registered interceptors
   *
   * This method is particularly useful for skipping over any
   * interceptors that may have become `null` calling `eject`.
   *
   * @param {Function} fn The function to call for each interceptor
   *
   * @returns {void}
   */
  forEach(fn) {
    utils$1.forEach(this.handlers, function forEachHandler(h2) {
      if (h2 !== null) {
        fn(h2);
      }
    });
  }
}
const transitionalDefaults = {
  silentJSONParsing: true,
  forcedJSONParsing: true,
  clarifyTimeoutError: false
};
const URLSearchParams$1 = typeof URLSearchParams !== "undefined" ? URLSearchParams : AxiosURLSearchParams;
const FormData$1 = typeof FormData !== "undefined" ? FormData : null;
const Blob$1 = typeof Blob !== "undefined" ? Blob : null;
const platform$1 = {
  isBrowser: true,
  classes: {
    URLSearchParams: URLSearchParams$1,
    FormData: FormData$1,
    Blob: Blob$1
  },
  protocols: ["http", "https", "file", "blob", "url", "data"]
};
const hasBrowserEnv = typeof window !== "undefined" && typeof document !== "undefined";
const _navigator = typeof navigator === "object" && navigator || void 0;
const hasStandardBrowserEnv = hasBrowserEnv && (!_navigator || ["ReactNative", "NativeScript", "NS"].indexOf(_navigator.product) < 0);
const hasStandardBrowserWebWorkerEnv = (() => {
  return typeof WorkerGlobalScope !== "undefined" && // eslint-disable-next-line no-undef
  self instanceof WorkerGlobalScope && typeof self.importScripts === "function";
})();
const origin = hasBrowserEnv && window.location.href || "http://localhost";
const utils = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  hasBrowserEnv,
  hasStandardBrowserEnv,
  hasStandardBrowserWebWorkerEnv,
  navigator: _navigator,
  origin
}, Symbol.toStringTag, { value: "Module" }));
const platform = {
  ...utils,
  ...platform$1
};
function toURLEncodedForm(data, options) {
  return toFormData$1(data, new platform.classes.URLSearchParams(), Object.assign({
    visitor: function(value, key, path2, helpers) {
      if (platform.isNode && utils$1.isBuffer(value)) {
        this.append(key, value.toString("base64"));
        return false;
      }
      return helpers.defaultVisitor.apply(this, arguments);
    }
  }, options));
}
function parsePropPath(name) {
  return utils$1.matchAll(/\w+|\[(\w*)]/g, name).map((match) => {
    return match[0] === "[]" ? "" : match[1] || match[0];
  });
}
function arrayToObject(arr) {
  const obj = {};
  const keys = Object.keys(arr);
  let i2;
  const len = keys.length;
  let key;
  for (i2 = 0; i2 < len; i2++) {
    key = keys[i2];
    obj[key] = arr[key];
  }
  return obj;
}
function formDataToJSON(formData) {
  function buildPath(path2, value, target, index) {
    let name = path2[index++];
    if (name === "__proto__") return true;
    const isNumericKey = Number.isFinite(+name);
    const isLast = index >= path2.length;
    name = !name && utils$1.isArray(target) ? target.length : name;
    if (isLast) {
      if (utils$1.hasOwnProp(target, name)) {
        target[name] = [target[name], value];
      } else {
        target[name] = value;
      }
      return !isNumericKey;
    }
    if (!target[name] || !utils$1.isObject(target[name])) {
      target[name] = [];
    }
    const result = buildPath(path2, value, target[name], index);
    if (result && utils$1.isArray(target[name])) {
      target[name] = arrayToObject(target[name]);
    }
    return !isNumericKey;
  }
  if (utils$1.isFormData(formData) && utils$1.isFunction(formData.entries)) {
    const obj = {};
    utils$1.forEachEntry(formData, (name, value) => {
      buildPath(parsePropPath(name), value, obj, 0);
    });
    return obj;
  }
  return null;
}
function stringifySafely(rawValue, parser, encoder) {
  if (utils$1.isString(rawValue)) {
    try {
      (parser || JSON.parse)(rawValue);
      return utils$1.trim(rawValue);
    } catch (e2) {
      if (e2.name !== "SyntaxError") {
        throw e2;
      }
    }
  }
  return (encoder || JSON.stringify)(rawValue);
}
const defaults = {
  transitional: transitionalDefaults,
  adapter: ["xhr", "http", "fetch"],
  transformRequest: [function transformRequest(data, headers) {
    const contentType = headers.getContentType() || "";
    const hasJSONContentType = contentType.indexOf("application/json") > -1;
    const isObjectPayload = utils$1.isObject(data);
    if (isObjectPayload && utils$1.isHTMLForm(data)) {
      data = new FormData(data);
    }
    const isFormData2 = utils$1.isFormData(data);
    if (isFormData2) {
      return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;
    }
    if (utils$1.isArrayBuffer(data) || utils$1.isBuffer(data) || utils$1.isStream(data) || utils$1.isFile(data) || utils$1.isBlob(data) || utils$1.isReadableStream(data)) {
      return data;
    }
    if (utils$1.isArrayBufferView(data)) {
      return data.buffer;
    }
    if (utils$1.isURLSearchParams(data)) {
      headers.setContentType("application/x-www-form-urlencoded;charset=utf-8", false);
      return data.toString();
    }
    let isFileList2;
    if (isObjectPayload) {
      if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
        return toURLEncodedForm(data, this.formSerializer).toString();
      }
      if ((isFileList2 = utils$1.isFileList(data)) || contentType.indexOf("multipart/form-data") > -1) {
        const _FormData = this.env && this.env.FormData;
        return toFormData$1(
          isFileList2 ? { "files[]": data } : data,
          _FormData && new _FormData(),
          this.formSerializer
        );
      }
    }
    if (isObjectPayload || hasJSONContentType) {
      headers.setContentType("application/json", false);
      return stringifySafely(data);
    }
    return data;
  }],
  transformResponse: [function transformResponse(data) {
    const transitional2 = this.transitional || defaults.transitional;
    const forcedJSONParsing = transitional2 && transitional2.forcedJSONParsing;
    const JSONRequested = this.responseType === "json";
    if (utils$1.isResponse(data) || utils$1.isReadableStream(data)) {
      return data;
    }
    if (data && utils$1.isString(data) && (forcedJSONParsing && !this.responseType || JSONRequested)) {
      const silentJSONParsing = transitional2 && transitional2.silentJSONParsing;
      const strictJSONParsing = !silentJSONParsing && JSONRequested;
      try {
        return JSON.parse(data);
      } catch (e2) {
        if (strictJSONParsing) {
          if (e2.name === "SyntaxError") {
            throw AxiosError$1.from(e2, AxiosError$1.ERR_BAD_RESPONSE, this, null, this.response);
          }
          throw e2;
        }
      }
    }
    return data;
  }],
  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  maxContentLength: -1,
  maxBodyLength: -1,
  env: {
    FormData: platform.classes.FormData,
    Blob: platform.classes.Blob
  },
  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  },
  headers: {
    common: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": void 0
    }
  }
};
utils$1.forEach(["delete", "get", "head", "post", "put", "patch"], (method2) => {
  defaults.headers[method2] = {};
});
const ignoreDuplicateOf = utils$1.toObjectSet([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "user-agent"
]);
const parseHeaders = (rawHeaders) => {
  const parsed = {};
  let key;
  let val;
  let i2;
  rawHeaders && rawHeaders.split("\n").forEach(function parser(line) {
    i2 = line.indexOf(":");
    key = line.substring(0, i2).trim().toLowerCase();
    val = line.substring(i2 + 1).trim();
    if (!key || parsed[key] && ignoreDuplicateOf[key]) {
      return;
    }
    if (key === "set-cookie") {
      if (parsed[key]) {
        parsed[key].push(val);
      } else {
        parsed[key] = [val];
      }
    } else {
      parsed[key] = parsed[key] ? parsed[key] + ", " + val : val;
    }
  });
  return parsed;
};
const $internals = Symbol("internals");
function normalizeHeader(header) {
  return header && String(header).trim().toLowerCase();
}
function normalizeValue(value) {
  if (value === false || value == null) {
    return value;
  }
  return utils$1.isArray(value) ? value.map(normalizeValue) : String(value);
}
function parseTokens(str) {
  const tokens = /* @__PURE__ */ Object.create(null);
  const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let match;
  while (match = tokensRE.exec(str)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}
const isValidHeaderName = (str) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());
function matchHeaderValue(context, value, header, filter2, isHeaderNameFilter) {
  if (utils$1.isFunction(filter2)) {
    return filter2.call(this, value, header);
  }
  if (isHeaderNameFilter) {
    value = header;
  }
  if (!utils$1.isString(value)) return;
  if (utils$1.isString(filter2)) {
    return value.indexOf(filter2) !== -1;
  }
  if (utils$1.isRegExp(filter2)) {
    return filter2.test(value);
  }
}
function formatHeader(header) {
  return header.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (w2, char, str) => {
    return char.toUpperCase() + str;
  });
}
function buildAccessors(obj, header) {
  const accessorName = utils$1.toCamelCase(" " + header);
  ["get", "set", "has"].forEach((methodName) => {
    Object.defineProperty(obj, methodName + accessorName, {
      value: function(arg1, arg2, arg3) {
        return this[methodName].call(this, header, arg1, arg2, arg3);
      },
      configurable: true
    });
  });
}
let AxiosHeaders$1 = class AxiosHeaders2 {
  constructor(headers) {
    headers && this.set(headers);
  }
  set(header, valueOrRewrite, rewrite) {
    const self2 = this;
    function setHeader(_value, _header, _rewrite) {
      const lHeader = normalizeHeader(_header);
      if (!lHeader) {
        throw new Error("header name must be a non-empty string");
      }
      const key = utils$1.findKey(self2, lHeader);
      if (!key || self2[key] === void 0 || _rewrite === true || _rewrite === void 0 && self2[key] !== false) {
        self2[key || _header] = normalizeValue(_value);
      }
    }
    const setHeaders = (headers, _rewrite) => utils$1.forEach(headers, (_value, _header) => setHeader(_value, _header, _rewrite));
    if (utils$1.isPlainObject(header) || header instanceof this.constructor) {
      setHeaders(header, valueOrRewrite);
    } else if (utils$1.isString(header) && (header = header.trim()) && !isValidHeaderName(header)) {
      setHeaders(parseHeaders(header), valueOrRewrite);
    } else if (utils$1.isHeaders(header)) {
      for (const [key, value] of header.entries()) {
        setHeader(value, key, rewrite);
      }
    } else {
      header != null && setHeader(valueOrRewrite, header, rewrite);
    }
    return this;
  }
  get(header, parser) {
    header = normalizeHeader(header);
    if (header) {
      const key = utils$1.findKey(this, header);
      if (key) {
        const value = this[key];
        if (!parser) {
          return value;
        }
        if (parser === true) {
          return parseTokens(value);
        }
        if (utils$1.isFunction(parser)) {
          return parser.call(this, value, key);
        }
        if (utils$1.isRegExp(parser)) {
          return parser.exec(value);
        }
        throw new TypeError("parser must be boolean|regexp|function");
      }
    }
  }
  has(header, matcher) {
    header = normalizeHeader(header);
    if (header) {
      const key = utils$1.findKey(this, header);
      return !!(key && this[key] !== void 0 && (!matcher || matchHeaderValue(this, this[key], key, matcher)));
    }
    return false;
  }
  delete(header, matcher) {
    const self2 = this;
    let deleted = false;
    function deleteHeader(_header) {
      _header = normalizeHeader(_header);
      if (_header) {
        const key = utils$1.findKey(self2, _header);
        if (key && (!matcher || matchHeaderValue(self2, self2[key], key, matcher))) {
          delete self2[key];
          deleted = true;
        }
      }
    }
    if (utils$1.isArray(header)) {
      header.forEach(deleteHeader);
    } else {
      deleteHeader(header);
    }
    return deleted;
  }
  clear(matcher) {
    const keys = Object.keys(this);
    let i2 = keys.length;
    let deleted = false;
    while (i2--) {
      const key = keys[i2];
      if (!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
        delete this[key];
        deleted = true;
      }
    }
    return deleted;
  }
  normalize(format) {
    const self2 = this;
    const headers = {};
    utils$1.forEach(this, (value, header) => {
      const key = utils$1.findKey(headers, header);
      if (key) {
        self2[key] = normalizeValue(value);
        delete self2[header];
        return;
      }
      const normalized = format ? formatHeader(header) : String(header).trim();
      if (normalized !== header) {
        delete self2[header];
      }
      self2[normalized] = normalizeValue(value);
      headers[normalized] = true;
    });
    return this;
  }
  concat(...targets) {
    return this.constructor.concat(this, ...targets);
  }
  toJSON(asStrings) {
    const obj = /* @__PURE__ */ Object.create(null);
    utils$1.forEach(this, (value, header) => {
      value != null && value !== false && (obj[header] = asStrings && utils$1.isArray(value) ? value.join(", ") : value);
    });
    return obj;
  }
  [Symbol.iterator]() {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }
  toString() {
    return Object.entries(this.toJSON()).map(([header, value]) => header + ": " + value).join("\n");
  }
  get [Symbol.toStringTag]() {
    return "AxiosHeaders";
  }
  static from(thing) {
    return thing instanceof this ? thing : new this(thing);
  }
  static concat(first, ...targets) {
    const computed2 = new this(first);
    targets.forEach((target) => computed2.set(target));
    return computed2;
  }
  static accessor(header) {
    const internals = this[$internals] = this[$internals] = {
      accessors: {}
    };
    const accessors = internals.accessors;
    const prototype2 = this.prototype;
    function defineAccessor(_header) {
      const lHeader = normalizeHeader(_header);
      if (!accessors[lHeader]) {
        buildAccessors(prototype2, _header);
        accessors[lHeader] = true;
      }
    }
    utils$1.isArray(header) ? header.forEach(defineAccessor) : defineAccessor(header);
    return this;
  }
};
AxiosHeaders$1.accessor(["Content-Type", "Content-Length", "Accept", "Accept-Encoding", "User-Agent", "Authorization"]);
utils$1.reduceDescriptors(AxiosHeaders$1.prototype, ({ value }, key) => {
  let mapped = key[0].toUpperCase() + key.slice(1);
  return {
    get: () => value,
    set(headerValue) {
      this[mapped] = headerValue;
    }
  };
});
utils$1.freezeMethods(AxiosHeaders$1);
function transformData(fns, response) {
  const config = this || defaults;
  const context = response || config;
  const headers = AxiosHeaders$1.from(context.headers);
  let data = context.data;
  utils$1.forEach(fns, function transform(fn) {
    data = fn.call(config, data, headers.normalize(), response ? response.status : void 0);
  });
  headers.normalize();
  return data;
}
function isCancel$1(value) {
  return !!(value && value.__CANCEL__);
}
function CanceledError$1(message2, config, request2) {
  AxiosError$1.call(this, message2 == null ? "canceled" : message2, AxiosError$1.ERR_CANCELED, config, request2);
  this.name = "CanceledError";
}
utils$1.inherits(CanceledError$1, AxiosError$1, {
  __CANCEL__: true
});
function settle(resolve2, reject, response) {
  const validateStatus2 = response.config.validateStatus;
  if (!response.status || !validateStatus2 || validateStatus2(response.status)) {
    resolve2(response);
  } else {
    reject(new AxiosError$1(
      "Request failed with status code " + response.status,
      [AxiosError$1.ERR_BAD_REQUEST, AxiosError$1.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4],
      response.config,
      response.request,
      response
    ));
  }
}
function parseProtocol(url) {
  const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
  return match && match[1] || "";
}
function speedometer(samplesCount, min) {
  samplesCount = samplesCount || 10;
  const bytes = new Array(samplesCount);
  const timestamps = new Array(samplesCount);
  let head = 0;
  let tail = 0;
  let firstSampleTS;
  min = min !== void 0 ? min : 1e3;
  return function push2(chunkLength) {
    const now = Date.now();
    const startedAt = timestamps[tail];
    if (!firstSampleTS) {
      firstSampleTS = now;
    }
    bytes[head] = chunkLength;
    timestamps[head] = now;
    let i2 = tail;
    let bytesCount = 0;
    while (i2 !== head) {
      bytesCount += bytes[i2++];
      i2 = i2 % samplesCount;
    }
    head = (head + 1) % samplesCount;
    if (head === tail) {
      tail = (tail + 1) % samplesCount;
    }
    if (now - firstSampleTS < min) {
      return;
    }
    const passed = startedAt && now - startedAt;
    return passed ? Math.round(bytesCount * 1e3 / passed) : void 0;
  };
}
function throttle(fn, freq) {
  let timestamp = 0;
  let threshold = 1e3 / freq;
  let lastArgs;
  let timer;
  const invoke = (args, now = Date.now()) => {
    timestamp = now;
    lastArgs = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn.apply(null, args);
  };
  const throttled = (...args) => {
    const now = Date.now();
    const passed = now - timestamp;
    if (passed >= threshold) {
      invoke(args, now);
    } else {
      lastArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          invoke(lastArgs);
        }, threshold - passed);
      }
    }
  };
  const flush = () => lastArgs && invoke(lastArgs);
  return [throttled, flush];
}
const progressEventReducer = (listener, isDownloadStream, freq = 3) => {
  let bytesNotified = 0;
  const _speedometer = speedometer(50, 250);
  return throttle((e2) => {
    const loaded = e2.loaded;
    const total = e2.lengthComputable ? e2.total : void 0;
    const progressBytes = loaded - bytesNotified;
    const rate = _speedometer(progressBytes);
    const inRange = loaded <= total;
    bytesNotified = loaded;
    const data = {
      loaded,
      total,
      progress: total ? loaded / total : void 0,
      bytes: progressBytes,
      rate: rate ? rate : void 0,
      estimated: rate && total && inRange ? (total - loaded) / rate : void 0,
      event: e2,
      lengthComputable: total != null,
      [isDownloadStream ? "download" : "upload"]: true
    };
    listener(data);
  }, freq);
};
const progressEventDecorator = (total, throttled) => {
  const lengthComputable = total != null;
  return [(loaded) => throttled[0]({
    lengthComputable,
    total,
    loaded
  }), throttled[1]];
};
const asyncDecorator = (fn) => (...args) => utils$1.asap(() => fn(...args));
const isURLSameOrigin = platform.hasStandardBrowserEnv ? /* @__PURE__ */ ((origin2, isMSIE) => (url) => {
  url = new URL(url, platform.origin);
  return origin2.protocol === url.protocol && origin2.host === url.host && (isMSIE || origin2.port === url.port);
})(
  new URL(platform.origin),
  platform.navigator && /(msie|trident)/i.test(platform.navigator.userAgent)
) : () => true;
const cookies = platform.hasStandardBrowserEnv ? (
  // Standard browser envs support document.cookie
  {
    write(name, value, expires, path2, domain, secure) {
      const cookie = [name + "=" + encodeURIComponent(value)];
      utils$1.isNumber(expires) && cookie.push("expires=" + new Date(expires).toGMTString());
      utils$1.isString(path2) && cookie.push("path=" + path2);
      utils$1.isString(domain) && cookie.push("domain=" + domain);
      secure === true && cookie.push("secure");
      document.cookie = cookie.join("; ");
    },
    read(name) {
      const match = document.cookie.match(new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"));
      return match ? decodeURIComponent(match[3]) : null;
    },
    remove(name) {
      this.write(name, "", Date.now() - 864e5);
    }
  }
) : (
  // Non-standard browser env (web workers, react-native) lack needed support.
  {
    write() {
    },
    read() {
      return null;
    },
    remove() {
    }
  }
);
function isAbsoluteURL(url) {
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}
function combineURLs(baseURL, relativeURL) {
  return relativeURL ? baseURL.replace(/\/?\/$/, "") + "/" + relativeURL.replace(/^\/+/, "") : baseURL;
}
function buildFullPath(baseURL, requestedURL, allowAbsoluteUrls) {
  let isRelativeUrl = !isAbsoluteURL(requestedURL);
  if (baseURL && (isRelativeUrl || allowAbsoluteUrls == false)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
}
const headersToObject = (thing) => thing instanceof AxiosHeaders$1 ? { ...thing } : thing;
function mergeConfig$1(config1, config2) {
  config2 = config2 || {};
  const config = {};
  function getMergedValue(target, source, prop, caseless) {
    if (utils$1.isPlainObject(target) && utils$1.isPlainObject(source)) {
      return utils$1.merge.call({ caseless }, target, source);
    } else if (utils$1.isPlainObject(source)) {
      return utils$1.merge({}, source);
    } else if (utils$1.isArray(source)) {
      return source.slice();
    }
    return source;
  }
  function mergeDeepProperties(a2, b2, prop, caseless) {
    if (!utils$1.isUndefined(b2)) {
      return getMergedValue(a2, b2, prop, caseless);
    } else if (!utils$1.isUndefined(a2)) {
      return getMergedValue(void 0, a2, prop, caseless);
    }
  }
  function valueFromConfig2(a2, b2) {
    if (!utils$1.isUndefined(b2)) {
      return getMergedValue(void 0, b2);
    }
  }
  function defaultToConfig2(a2, b2) {
    if (!utils$1.isUndefined(b2)) {
      return getMergedValue(void 0, b2);
    } else if (!utils$1.isUndefined(a2)) {
      return getMergedValue(void 0, a2);
    }
  }
  function mergeDirectKeys(a2, b2, prop) {
    if (prop in config2) {
      return getMergedValue(a2, b2);
    } else if (prop in config1) {
      return getMergedValue(void 0, a2);
    }
  }
  const mergeMap = {
    url: valueFromConfig2,
    method: valueFromConfig2,
    data: valueFromConfig2,
    baseURL: defaultToConfig2,
    transformRequest: defaultToConfig2,
    transformResponse: defaultToConfig2,
    paramsSerializer: defaultToConfig2,
    timeout: defaultToConfig2,
    timeoutMessage: defaultToConfig2,
    withCredentials: defaultToConfig2,
    withXSRFToken: defaultToConfig2,
    adapter: defaultToConfig2,
    responseType: defaultToConfig2,
    xsrfCookieName: defaultToConfig2,
    xsrfHeaderName: defaultToConfig2,
    onUploadProgress: defaultToConfig2,
    onDownloadProgress: defaultToConfig2,
    decompress: defaultToConfig2,
    maxContentLength: defaultToConfig2,
    maxBodyLength: defaultToConfig2,
    beforeRedirect: defaultToConfig2,
    transport: defaultToConfig2,
    httpAgent: defaultToConfig2,
    httpsAgent: defaultToConfig2,
    cancelToken: defaultToConfig2,
    socketPath: defaultToConfig2,
    responseEncoding: defaultToConfig2,
    validateStatus: mergeDirectKeys,
    headers: (a2, b2, prop) => mergeDeepProperties(headersToObject(a2), headersToObject(b2), prop, true)
  };
  utils$1.forEach(Object.keys(Object.assign({}, config1, config2)), function computeConfigValue(prop) {
    const merge2 = mergeMap[prop] || mergeDeepProperties;
    const configValue = merge2(config1[prop], config2[prop], prop);
    utils$1.isUndefined(configValue) && merge2 !== mergeDirectKeys || (config[prop] = configValue);
  });
  return config;
}
const resolveConfig = (config) => {
  const newConfig = mergeConfig$1({}, config);
  let { data, withXSRFToken, xsrfHeaderName, xsrfCookieName, headers, auth } = newConfig;
  newConfig.headers = headers = AxiosHeaders$1.from(headers);
  newConfig.url = buildURL(buildFullPath(newConfig.baseURL, newConfig.url, newConfig.allowAbsoluteUrls), config.params, config.paramsSerializer);
  if (auth) {
    headers.set(
      "Authorization",
      "Basic " + btoa((auth.username || "") + ":" + (auth.password ? unescape(encodeURIComponent(auth.password)) : ""))
    );
  }
  let contentType;
  if (utils$1.isFormData(data)) {
    if (platform.hasStandardBrowserEnv || platform.hasStandardBrowserWebWorkerEnv) {
      headers.setContentType(void 0);
    } else if ((contentType = headers.getContentType()) !== false) {
      const [type2, ...tokens] = contentType ? contentType.split(";").map((token) => token.trim()).filter(Boolean) : [];
      headers.setContentType([type2 || "multipart/form-data", ...tokens].join("; "));
    }
  }
  if (platform.hasStandardBrowserEnv) {
    withXSRFToken && utils$1.isFunction(withXSRFToken) && (withXSRFToken = withXSRFToken(newConfig));
    if (withXSRFToken || withXSRFToken !== false && isURLSameOrigin(newConfig.url)) {
      const xsrfValue = xsrfHeaderName && xsrfCookieName && cookies.read(xsrfCookieName);
      if (xsrfValue) {
        headers.set(xsrfHeaderName, xsrfValue);
      }
    }
  }
  return newConfig;
};
const isXHRAdapterSupported = typeof XMLHttpRequest !== "undefined";
const xhrAdapter = isXHRAdapterSupported && function(config) {
  return new Promise(function dispatchXhrRequest(resolve2, reject) {
    const _config = resolveConfig(config);
    let requestData = _config.data;
    const requestHeaders = AxiosHeaders$1.from(_config.headers).normalize();
    let { responseType, onUploadProgress, onDownloadProgress } = _config;
    let onCanceled;
    let uploadThrottled, downloadThrottled;
    let flushUpload, flushDownload;
    function done() {
      flushUpload && flushUpload();
      flushDownload && flushDownload();
      _config.cancelToken && _config.cancelToken.unsubscribe(onCanceled);
      _config.signal && _config.signal.removeEventListener("abort", onCanceled);
    }
    let request2 = new XMLHttpRequest();
    request2.open(_config.method.toUpperCase(), _config.url, true);
    request2.timeout = _config.timeout;
    function onloadend() {
      if (!request2) {
        return;
      }
      const responseHeaders = AxiosHeaders$1.from(
        "getAllResponseHeaders" in request2 && request2.getAllResponseHeaders()
      );
      const responseData = !responseType || responseType === "text" || responseType === "json" ? request2.responseText : request2.response;
      const response = {
        data: responseData,
        status: request2.status,
        statusText: request2.statusText,
        headers: responseHeaders,
        config,
        request: request2
      };
      settle(function _resolve(value) {
        resolve2(value);
        done();
      }, function _reject(err) {
        reject(err);
        done();
      }, response);
      request2 = null;
    }
    if ("onloadend" in request2) {
      request2.onloadend = onloadend;
    } else {
      request2.onreadystatechange = function handleLoad() {
        if (!request2 || request2.readyState !== 4) {
          return;
        }
        if (request2.status === 0 && !(request2.responseURL && request2.responseURL.indexOf("file:") === 0)) {
          return;
        }
        setTimeout(onloadend);
      };
    }
    request2.onabort = function handleAbort() {
      if (!request2) {
        return;
      }
      reject(new AxiosError$1("Request aborted", AxiosError$1.ECONNABORTED, config, request2));
      request2 = null;
    };
    request2.onerror = function handleError2() {
      reject(new AxiosError$1("Network Error", AxiosError$1.ERR_NETWORK, config, request2));
      request2 = null;
    };
    request2.ontimeout = function handleTimeout() {
      let timeoutErrorMessage = _config.timeout ? "timeout of " + _config.timeout + "ms exceeded" : "timeout exceeded";
      const transitional2 = _config.transitional || transitionalDefaults;
      if (_config.timeoutErrorMessage) {
        timeoutErrorMessage = _config.timeoutErrorMessage;
      }
      reject(new AxiosError$1(
        timeoutErrorMessage,
        transitional2.clarifyTimeoutError ? AxiosError$1.ETIMEDOUT : AxiosError$1.ECONNABORTED,
        config,
        request2
      ));
      request2 = null;
    };
    requestData === void 0 && requestHeaders.setContentType(null);
    if ("setRequestHeader" in request2) {
      utils$1.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
        request2.setRequestHeader(key, val);
      });
    }
    if (!utils$1.isUndefined(_config.withCredentials)) {
      request2.withCredentials = !!_config.withCredentials;
    }
    if (responseType && responseType !== "json") {
      request2.responseType = _config.responseType;
    }
    if (onDownloadProgress) {
      [downloadThrottled, flushDownload] = progressEventReducer(onDownloadProgress, true);
      request2.addEventListener("progress", downloadThrottled);
    }
    if (onUploadProgress && request2.upload) {
      [uploadThrottled, flushUpload] = progressEventReducer(onUploadProgress);
      request2.upload.addEventListener("progress", uploadThrottled);
      request2.upload.addEventListener("loadend", flushUpload);
    }
    if (_config.cancelToken || _config.signal) {
      onCanceled = (cancel) => {
        if (!request2) {
          return;
        }
        reject(!cancel || cancel.type ? new CanceledError$1(null, config, request2) : cancel);
        request2.abort();
        request2 = null;
      };
      _config.cancelToken && _config.cancelToken.subscribe(onCanceled);
      if (_config.signal) {
        _config.signal.aborted ? onCanceled() : _config.signal.addEventListener("abort", onCanceled);
      }
    }
    const protocol = parseProtocol(_config.url);
    if (protocol && platform.protocols.indexOf(protocol) === -1) {
      reject(new AxiosError$1("Unsupported protocol " + protocol + ":", AxiosError$1.ERR_BAD_REQUEST, config));
      return;
    }
    request2.send(requestData || null);
  });
};
const composeSignals = (signals, timeout) => {
  const { length } = signals = signals ? signals.filter(Boolean) : [];
  if (timeout || length) {
    let controller = new AbortController();
    let aborted;
    const onabort = function(reason) {
      if (!aborted) {
        aborted = true;
        unsubscribe();
        const err = reason instanceof Error ? reason : this.reason;
        controller.abort(err instanceof AxiosError$1 ? err : new CanceledError$1(err instanceof Error ? err.message : err));
      }
    };
    let timer = timeout && setTimeout(() => {
      timer = null;
      onabort(new AxiosError$1(`timeout ${timeout} of ms exceeded`, AxiosError$1.ETIMEDOUT));
    }, timeout);
    const unsubscribe = () => {
      if (signals) {
        timer && clearTimeout(timer);
        timer = null;
        signals.forEach((signal2) => {
          signal2.unsubscribe ? signal2.unsubscribe(onabort) : signal2.removeEventListener("abort", onabort);
        });
        signals = null;
      }
    };
    signals.forEach((signal2) => signal2.addEventListener("abort", onabort));
    const { signal } = controller;
    signal.unsubscribe = () => utils$1.asap(unsubscribe);
    return signal;
  }
};
const streamChunk = function* (chunk, chunkSize) {
  let len = chunk.byteLength;
  if (len < chunkSize) {
    yield chunk;
    return;
  }
  let pos = 0;
  let end2;
  while (pos < len) {
    end2 = pos + chunkSize;
    yield chunk.slice(pos, end2);
    pos = end2;
  }
};
const readBytes = async function* (iterable, chunkSize) {
  for await (const chunk of readStream(iterable)) {
    yield* streamChunk(chunk, chunkSize);
  }
};
const readStream = async function* (stream) {
  if (stream[Symbol.asyncIterator]) {
    yield* stream;
    return;
  }
  const reader2 = stream.getReader();
  try {
    for (; ; ) {
      const { done, value } = await reader2.read();
      if (done) {
        break;
      }
      yield value;
    }
  } finally {
    await reader2.cancel();
  }
};
const trackStream = (stream, chunkSize, onProgress, onFinish) => {
  const iterator2 = readBytes(stream, chunkSize);
  let bytes = 0;
  let done;
  let _onFinish = (e2) => {
    if (!done) {
      done = true;
      onFinish && onFinish(e2);
    }
  };
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done: done2, value } = await iterator2.next();
        if (done2) {
          _onFinish();
          controller.close();
          return;
        }
        let len = value.byteLength;
        if (onProgress) {
          let loadedBytes = bytes += len;
          onProgress(loadedBytes);
        }
        controller.enqueue(new Uint8Array(value));
      } catch (err) {
        _onFinish(err);
        throw err;
      }
    },
    cancel(reason) {
      _onFinish(reason);
      return iterator2.return();
    }
  }, {
    highWaterMark: 2
  });
};
const isFetchSupported = typeof fetch === "function" && typeof Request === "function" && typeof Response === "function";
const isReadableStreamSupported = isFetchSupported && typeof ReadableStream === "function";
const encodeText = isFetchSupported && (typeof TextEncoder === "function" ? /* @__PURE__ */ ((encoder) => (str) => encoder.encode(str))(new TextEncoder()) : async (str) => new Uint8Array(await new Response(str).arrayBuffer()));
const test = (fn, ...args) => {
  try {
    return !!fn(...args);
  } catch (e2) {
    return false;
  }
};
const supportsRequestStream = isReadableStreamSupported && test(() => {
  let duplexAccessed = false;
  const hasContentType = new Request(platform.origin, {
    body: new ReadableStream(),
    method: "POST",
    get duplex() {
      duplexAccessed = true;
      return "half";
    }
  }).headers.has("Content-Type");
  return duplexAccessed && !hasContentType;
});
const DEFAULT_CHUNK_SIZE = 64 * 1024;
const supportsResponseStream = isReadableStreamSupported && test(() => utils$1.isReadableStream(new Response("").body));
const resolvers = {
  stream: supportsResponseStream && ((res) => res.body)
};
isFetchSupported && ((res) => {
  ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((type2) => {
    !resolvers[type2] && (resolvers[type2] = utils$1.isFunction(res[type2]) ? (res2) => res2[type2]() : (_2, config) => {
      throw new AxiosError$1(`Response type '${type2}' is not supported`, AxiosError$1.ERR_NOT_SUPPORT, config);
    });
  });
})(new Response());
const getBodyLength = async (body) => {
  if (body == null) {
    return 0;
  }
  if (utils$1.isBlob(body)) {
    return body.size;
  }
  if (utils$1.isSpecCompliantForm(body)) {
    const _request = new Request(platform.origin, {
      method: "POST",
      body
    });
    return (await _request.arrayBuffer()).byteLength;
  }
  if (utils$1.isArrayBufferView(body) || utils$1.isArrayBuffer(body)) {
    return body.byteLength;
  }
  if (utils$1.isURLSearchParams(body)) {
    body = body + "";
  }
  if (utils$1.isString(body)) {
    return (await encodeText(body)).byteLength;
  }
};
const resolveBodyLength = async (headers, body) => {
  const length = utils$1.toFiniteNumber(headers.getContentLength());
  return length == null ? getBodyLength(body) : length;
};
const fetchAdapter = isFetchSupported && (async (config) => {
  let {
    url,
    method: method2,
    data,
    signal,
    cancelToken,
    timeout,
    onDownloadProgress,
    onUploadProgress,
    responseType,
    headers,
    withCredentials = "same-origin",
    fetchOptions
  } = resolveConfig(config);
  responseType = responseType ? (responseType + "").toLowerCase() : "text";
  let composedSignal = composeSignals([signal, cancelToken && cancelToken.toAbortSignal()], timeout);
  let request2;
  const unsubscribe = composedSignal && composedSignal.unsubscribe && (() => {
    composedSignal.unsubscribe();
  });
  let requestContentLength;
  try {
    if (onUploadProgress && supportsRequestStream && method2 !== "get" && method2 !== "head" && (requestContentLength = await resolveBodyLength(headers, data)) !== 0) {
      let _request = new Request(url, {
        method: "POST",
        body: data,
        duplex: "half"
      });
      let contentTypeHeader;
      if (utils$1.isFormData(data) && (contentTypeHeader = _request.headers.get("content-type"))) {
        headers.setContentType(contentTypeHeader);
      }
      if (_request.body) {
        const [onProgress, flush] = progressEventDecorator(
          requestContentLength,
          progressEventReducer(asyncDecorator(onUploadProgress))
        );
        data = trackStream(_request.body, DEFAULT_CHUNK_SIZE, onProgress, flush);
      }
    }
    if (!utils$1.isString(withCredentials)) {
      withCredentials = withCredentials ? "include" : "omit";
    }
    const isCredentialsSupported = "credentials" in Request.prototype;
    request2 = new Request(url, {
      ...fetchOptions,
      signal: composedSignal,
      method: method2.toUpperCase(),
      headers: headers.normalize().toJSON(),
      body: data,
      duplex: "half",
      credentials: isCredentialsSupported ? withCredentials : void 0
    });
    let response = await fetch(request2);
    const isStreamResponse = supportsResponseStream && (responseType === "stream" || responseType === "response");
    if (supportsResponseStream && (onDownloadProgress || isStreamResponse && unsubscribe)) {
      const options = {};
      ["status", "statusText", "headers"].forEach((prop) => {
        options[prop] = response[prop];
      });
      const responseContentLength = utils$1.toFiniteNumber(response.headers.get("content-length"));
      const [onProgress, flush] = onDownloadProgress && progressEventDecorator(
        responseContentLength,
        progressEventReducer(asyncDecorator(onDownloadProgress), true)
      ) || [];
      response = new Response(
        trackStream(response.body, DEFAULT_CHUNK_SIZE, onProgress, () => {
          flush && flush();
          unsubscribe && unsubscribe();
        }),
        options
      );
    }
    responseType = responseType || "text";
    let responseData = await resolvers[utils$1.findKey(resolvers, responseType) || "text"](response, config);
    !isStreamResponse && unsubscribe && unsubscribe();
    return await new Promise((resolve2, reject) => {
      settle(resolve2, reject, {
        data: responseData,
        headers: AxiosHeaders$1.from(response.headers),
        status: response.status,
        statusText: response.statusText,
        config,
        request: request2
      });
    });
  } catch (err) {
    unsubscribe && unsubscribe();
    if (err && err.name === "TypeError" && /fetch/i.test(err.message)) {
      throw Object.assign(
        new AxiosError$1("Network Error", AxiosError$1.ERR_NETWORK, config, request2),
        {
          cause: err.cause || err
        }
      );
    }
    throw AxiosError$1.from(err, err && err.code, config, request2);
  }
});
const knownAdapters = {
  http: httpAdapter,
  xhr: xhrAdapter,
  fetch: fetchAdapter
};
utils$1.forEach(knownAdapters, (fn, value) => {
  if (fn) {
    try {
      Object.defineProperty(fn, "name", { value });
    } catch (e2) {
    }
    Object.defineProperty(fn, "adapterName", { value });
  }
});
const renderReason = (reason) => `- ${reason}`;
const isResolvedHandle = (adapter) => utils$1.isFunction(adapter) || adapter === null || adapter === false;
const adapters = {
  getAdapter: (adapters2) => {
    adapters2 = utils$1.isArray(adapters2) ? adapters2 : [adapters2];
    const { length } = adapters2;
    let nameOrAdapter;
    let adapter;
    const rejectedReasons = {};
    for (let i2 = 0; i2 < length; i2++) {
      nameOrAdapter = adapters2[i2];
      let id;
      adapter = nameOrAdapter;
      if (!isResolvedHandle(nameOrAdapter)) {
        adapter = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];
        if (adapter === void 0) {
          throw new AxiosError$1(`Unknown adapter '${id}'`);
        }
      }
      if (adapter) {
        break;
      }
      rejectedReasons[id || "#" + i2] = adapter;
    }
    if (!adapter) {
      const reasons = Object.entries(rejectedReasons).map(
        ([id, state]) => `adapter ${id} ` + (state === false ? "is not supported by the environment" : "is not available in the build")
      );
      let s2 = length ? reasons.length > 1 ? "since :\n" + reasons.map(renderReason).join("\n") : " " + renderReason(reasons[0]) : "as no adapter specified";
      throw new AxiosError$1(
        `There is no suitable adapter to dispatch the request ` + s2,
        "ERR_NOT_SUPPORT"
      );
    }
    return adapter;
  },
  adapters: knownAdapters
};
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
  if (config.signal && config.signal.aborted) {
    throw new CanceledError$1(null, config);
  }
}
function dispatchRequest(config) {
  throwIfCancellationRequested(config);
  config.headers = AxiosHeaders$1.from(config.headers);
  config.data = transformData.call(
    config,
    config.transformRequest
  );
  if (["post", "put", "patch"].indexOf(config.method) !== -1) {
    config.headers.setContentType("application/x-www-form-urlencoded", false);
  }
  const adapter = adapters.getAdapter(config.adapter || defaults.adapter);
  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);
    response.data = transformData.call(
      config,
      config.transformResponse,
      response
    );
    response.headers = AxiosHeaders$1.from(response.headers);
    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel$1(reason)) {
      throwIfCancellationRequested(config);
      if (reason && reason.response) {
        reason.response.data = transformData.call(
          config,
          config.transformResponse,
          reason.response
        );
        reason.response.headers = AxiosHeaders$1.from(reason.response.headers);
      }
    }
    return Promise.reject(reason);
  });
}
const VERSION$1 = "1.8.4";
const validators$1 = {};
["object", "boolean", "number", "function", "string", "symbol"].forEach((type2, i2) => {
  validators$1[type2] = function validator2(thing) {
    return typeof thing === type2 || "a" + (i2 < 1 ? "n " : " ") + type2;
  };
});
const deprecatedWarnings = {};
validators$1.transitional = function transitional(validator2, version2, message2) {
  function formatMessage(opt, desc) {
    return "[Axios v" + VERSION$1 + "] Transitional option '" + opt + "'" + desc + (message2 ? ". " + message2 : "");
  }
  return (value, opt, opts) => {
    if (validator2 === false) {
      throw new AxiosError$1(
        formatMessage(opt, " has been removed" + (version2 ? " in " + version2 : "")),
        AxiosError$1.ERR_DEPRECATED
      );
    }
    if (version2 && !deprecatedWarnings[opt]) {
      deprecatedWarnings[opt] = true;
      console.warn(
        formatMessage(
          opt,
          " has been deprecated since v" + version2 + " and will be removed in the near future"
        )
      );
    }
    return validator2 ? validator2(value, opt, opts) : true;
  };
};
validators$1.spelling = function spelling(correctSpelling) {
  return (value, opt) => {
    console.warn(`${opt} is likely a misspelling of ${correctSpelling}`);
    return true;
  };
};
function assertOptions(options, schema, allowUnknown) {
  if (typeof options !== "object") {
    throw new AxiosError$1("options must be an object", AxiosError$1.ERR_BAD_OPTION_VALUE);
  }
  const keys = Object.keys(options);
  let i2 = keys.length;
  while (i2-- > 0) {
    const opt = keys[i2];
    const validator2 = schema[opt];
    if (validator2) {
      const value = options[opt];
      const result = value === void 0 || validator2(value, opt, options);
      if (result !== true) {
        throw new AxiosError$1("option " + opt + " must be " + result, AxiosError$1.ERR_BAD_OPTION_VALUE);
      }
      continue;
    }
    if (allowUnknown !== true) {
      throw new AxiosError$1("Unknown option " + opt, AxiosError$1.ERR_BAD_OPTION);
    }
  }
}
const validator = {
  assertOptions,
  validators: validators$1
};
const validators = validator.validators;
let Axios$2 = class Axios2 {
  constructor(instanceConfig) {
    this.defaults = instanceConfig;
    this.interceptors = {
      request: new InterceptorManager(),
      response: new InterceptorManager()
    };
  }
  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  async request(configOrUrl, config) {
    try {
      return await this._request(configOrUrl, config);
    } catch (err) {
      if (err instanceof Error) {
        let dummy = {};
        Error.captureStackTrace ? Error.captureStackTrace(dummy) : dummy = new Error();
        const stack2 = dummy.stack ? dummy.stack.replace(/^.+\n/, "") : "";
        try {
          if (!err.stack) {
            err.stack = stack2;
          } else if (stack2 && !String(err.stack).endsWith(stack2.replace(/^.+\n.+\n/, ""))) {
            err.stack += "\n" + stack2;
          }
        } catch (e2) {
        }
      }
      throw err;
    }
  }
  _request(configOrUrl, config) {
    if (typeof configOrUrl === "string") {
      config = config || {};
      config.url = configOrUrl;
    } else {
      config = configOrUrl || {};
    }
    config = mergeConfig$1(this.defaults, config);
    const { transitional: transitional2, paramsSerializer, headers } = config;
    if (transitional2 !== void 0) {
      validator.assertOptions(transitional2, {
        silentJSONParsing: validators.transitional(validators.boolean),
        forcedJSONParsing: validators.transitional(validators.boolean),
        clarifyTimeoutError: validators.transitional(validators.boolean)
      }, false);
    }
    if (paramsSerializer != null) {
      if (utils$1.isFunction(paramsSerializer)) {
        config.paramsSerializer = {
          serialize: paramsSerializer
        };
      } else {
        validator.assertOptions(paramsSerializer, {
          encode: validators.function,
          serialize: validators.function
        }, true);
      }
    }
    if (config.allowAbsoluteUrls !== void 0) ;
    else if (this.defaults.allowAbsoluteUrls !== void 0) {
      config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls;
    } else {
      config.allowAbsoluteUrls = true;
    }
    validator.assertOptions(config, {
      baseUrl: validators.spelling("baseURL"),
      withXsrfToken: validators.spelling("withXSRFToken")
    }, true);
    config.method = (config.method || this.defaults.method || "get").toLowerCase();
    let contextHeaders = headers && utils$1.merge(
      headers.common,
      headers[config.method]
    );
    headers && utils$1.forEach(
      ["delete", "get", "head", "post", "put", "patch", "common"],
      (method2) => {
        delete headers[method2];
      }
    );
    config.headers = AxiosHeaders$1.concat(contextHeaders, headers);
    const requestInterceptorChain = [];
    let synchronousRequestInterceptors = true;
    this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
      if (typeof interceptor.runWhen === "function" && interceptor.runWhen(config) === false) {
        return;
      }
      synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
      requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
    });
    const responseInterceptorChain = [];
    this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
      responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
    });
    let promise;
    let i2 = 0;
    let len;
    if (!synchronousRequestInterceptors) {
      const chain = [dispatchRequest.bind(this), void 0];
      chain.unshift.apply(chain, requestInterceptorChain);
      chain.push.apply(chain, responseInterceptorChain);
      len = chain.length;
      promise = Promise.resolve(config);
      while (i2 < len) {
        promise = promise.then(chain[i2++], chain[i2++]);
      }
      return promise;
    }
    len = requestInterceptorChain.length;
    let newConfig = config;
    i2 = 0;
    while (i2 < len) {
      const onFulfilled = requestInterceptorChain[i2++];
      const onRejected = requestInterceptorChain[i2++];
      try {
        newConfig = onFulfilled(newConfig);
      } catch (error) {
        onRejected.call(this, error);
        break;
      }
    }
    try {
      promise = dispatchRequest.call(this, newConfig);
    } catch (error) {
      return Promise.reject(error);
    }
    i2 = 0;
    len = responseInterceptorChain.length;
    while (i2 < len) {
      promise = promise.then(responseInterceptorChain[i2++], responseInterceptorChain[i2++]);
    }
    return promise;
  }
  getUri(config) {
    config = mergeConfig$1(this.defaults, config);
    const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);
    return buildURL(fullPath, config.params, config.paramsSerializer);
  }
};
utils$1.forEach(["delete", "get", "head", "options"], function forEachMethodNoData(method2) {
  Axios$2.prototype[method2] = function(url, config) {
    return this.request(mergeConfig$1(config || {}, {
      method: method2,
      url,
      data: (config || {}).data
    }));
  };
});
utils$1.forEach(["post", "put", "patch"], function forEachMethodWithData(method2) {
  function generateHTTPMethod(isForm) {
    return function httpMethod(url, data, config) {
      return this.request(mergeConfig$1(config || {}, {
        method: method2,
        headers: isForm ? {
          "Content-Type": "multipart/form-data"
        } : {},
        url,
        data
      }));
    };
  }
  Axios$2.prototype[method2] = generateHTTPMethod();
  Axios$2.prototype[method2 + "Form"] = generateHTTPMethod(true);
});
let CancelToken$1 = class CancelToken2 {
  constructor(executor) {
    if (typeof executor !== "function") {
      throw new TypeError("executor must be a function.");
    }
    let resolvePromise;
    this.promise = new Promise(function promiseExecutor(resolve2) {
      resolvePromise = resolve2;
    });
    const token = this;
    this.promise.then((cancel) => {
      if (!token._listeners) return;
      let i2 = token._listeners.length;
      while (i2-- > 0) {
        token._listeners[i2](cancel);
      }
      token._listeners = null;
    });
    this.promise.then = (onfulfilled) => {
      let _resolve;
      const promise = new Promise((resolve2) => {
        token.subscribe(resolve2);
        _resolve = resolve2;
      }).then(onfulfilled);
      promise.cancel = function reject() {
        token.unsubscribe(_resolve);
      };
      return promise;
    };
    executor(function cancel(message2, config, request2) {
      if (token.reason) {
        return;
      }
      token.reason = new CanceledError$1(message2, config, request2);
      resolvePromise(token.reason);
    });
  }
  /**
   * Throws a `CanceledError` if cancellation has been requested.
   */
  throwIfRequested() {
    if (this.reason) {
      throw this.reason;
    }
  }
  /**
   * Subscribe to the cancel signal
   */
  subscribe(listener) {
    if (this.reason) {
      listener(this.reason);
      return;
    }
    if (this._listeners) {
      this._listeners.push(listener);
    } else {
      this._listeners = [listener];
    }
  }
  /**
   * Unsubscribe from the cancel signal
   */
  unsubscribe(listener) {
    if (!this._listeners) {
      return;
    }
    const index = this._listeners.indexOf(listener);
    if (index !== -1) {
      this._listeners.splice(index, 1);
    }
  }
  toAbortSignal() {
    const controller = new AbortController();
    const abort = (err) => {
      controller.abort(err);
    };
    this.subscribe(abort);
    controller.signal.unsubscribe = () => this.unsubscribe(abort);
    return controller.signal;
  }
  /**
   * Returns an object that contains a new `CancelToken` and a function that, when called,
   * cancels the `CancelToken`.
   */
  static source() {
    let cancel;
    const token = new CancelToken2(function executor(c2) {
      cancel = c2;
    });
    return {
      token,
      cancel
    };
  }
};
function spread$1(callback) {
  return function wrap(arr) {
    return callback.apply(null, arr);
  };
}
function isAxiosError$1(payload) {
  return utils$1.isObject(payload) && payload.isAxiosError === true;
}
const HttpStatusCode$1 = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  Ok: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  ImUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  Unused: 306,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  UriTooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HttpVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511
};
Object.entries(HttpStatusCode$1).forEach(([key, value]) => {
  HttpStatusCode$1[value] = key;
});
function createInstance(defaultConfig) {
  const context = new Axios$2(defaultConfig);
  const instance = bind(Axios$2.prototype.request, context);
  utils$1.extend(instance, Axios$2.prototype, context, { allOwnKeys: true });
  utils$1.extend(instance, context, null, { allOwnKeys: true });
  instance.create = function create5(instanceConfig) {
    return createInstance(mergeConfig$1(defaultConfig, instanceConfig));
  };
  return instance;
}
const axios = createInstance(defaults);
axios.Axios = Axios$2;
axios.CanceledError = CanceledError$1;
axios.CancelToken = CancelToken$1;
axios.isCancel = isCancel$1;
axios.VERSION = VERSION$1;
axios.toFormData = toFormData$1;
axios.AxiosError = AxiosError$1;
axios.Cancel = axios.CanceledError;
axios.all = function all2(promises) {
  return Promise.all(promises);
};
axios.spread = spread$1;
axios.isAxiosError = isAxiosError$1;
axios.mergeConfig = mergeConfig$1;
axios.AxiosHeaders = AxiosHeaders$1;
axios.formToJSON = (thing) => formDataToJSON(utils$1.isHTMLForm(thing) ? new FormData(thing) : thing);
axios.getAdapter = adapters.getAdapter;
axios.HttpStatusCode = HttpStatusCode$1;
axios.default = axios;
const {
  Axios: Axios$1,
  AxiosError,
  CanceledError,
  isCancel,
  CancelToken,
  VERSION,
  all,
  Cancel,
  isAxiosError,
  spread,
  toFormData,
  AxiosHeaders,
  HttpStatusCode,
  formToJSON,
  getAdapter,
  mergeConfig
} = axios;
let loadingInstance = null;
let loadingCount = 0;
function start() {
  loadingCount++;
  loadingInstance = ElLoading.service({
    lock: true,
    text: "Loading",
    spinner: "el-icon-loading",
    background: "rgba(0, 0, 0, 0.7)"
  });
}
function close() {
  if (!loadingInstance) {
    loadingCount = 0;
    return;
  }
  loadingCount--;
  if (loadingCount <= 0) {
    loadingInstance.close();
  }
}
const loading = {
  start,
  close
};
/*!
 * pinia v2.3.1
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
let activePinia;
const setActivePinia = (pinia) => activePinia = pinia;
const piniaSymbol = (
  /* istanbul ignore next */
  Symbol()
);
function isPlainObject(o2) {
  return o2 && typeof o2 === "object" && Object.prototype.toString.call(o2) === "[object Object]" && typeof o2.toJSON !== "function";
}
var MutationType;
(function(MutationType2) {
  MutationType2["direct"] = "direct";
  MutationType2["patchObject"] = "patch object";
  MutationType2["patchFunction"] = "patch function";
})(MutationType || (MutationType = {}));
const IS_CLIENT = typeof window !== "undefined";
const noop = () => {
};
function addSubscription(subscriptions, callback, detached, onCleanup = noop) {
  subscriptions.push(callback);
  const removeSubscription = () => {
    const idx = subscriptions.indexOf(callback);
    if (idx > -1) {
      subscriptions.splice(idx, 1);
      onCleanup();
    }
  };
  if (!detached && getCurrentScope()) {
    onScopeDispose(removeSubscription);
  }
  return removeSubscription;
}
function triggerSubscriptions(subscriptions, ...args) {
  subscriptions.slice().forEach((callback) => {
    callback(...args);
  });
}
const fallbackRunWithContext = (fn) => fn();
const ACTION_MARKER = Symbol();
const ACTION_NAME = Symbol();
function mergeReactiveObjects(target, patchToApply) {
  if (target instanceof Map && patchToApply instanceof Map) {
    patchToApply.forEach((value, key) => target.set(key, value));
  } else if (target instanceof Set && patchToApply instanceof Set) {
    patchToApply.forEach(target.add, target);
  }
  for (const key in patchToApply) {
    if (!patchToApply.hasOwnProperty(key))
      continue;
    const subPatch = patchToApply[key];
    const targetValue = target[key];
    if (isPlainObject(targetValue) && isPlainObject(subPatch) && target.hasOwnProperty(key) && !isRef(subPatch) && !isReactive(subPatch)) {
      target[key] = mergeReactiveObjects(targetValue, subPatch);
    } else {
      target[key] = subPatch;
    }
  }
  return target;
}
const skipHydrateSymbol = (
  /* istanbul ignore next */
  Symbol()
);
function shouldHydrate(obj) {
  return !isPlainObject(obj) || !obj.hasOwnProperty(skipHydrateSymbol);
}
const { assign } = Object;
function isComputed(o2) {
  return !!(isRef(o2) && o2.effect);
}
function createOptionsStore(id, options, pinia, hot) {
  const { state, actions, getters } = options;
  const initialState = pinia.state.value[id];
  let store;
  function setup() {
    if (!initialState && true) {
      {
        pinia.state.value[id] = state ? state() : {};
      }
    }
    const localState = toRefs(pinia.state.value[id]);
    return assign(localState, actions, Object.keys(getters || {}).reduce((computedGetters, name) => {
      computedGetters[name] = markRaw(computed(() => {
        setActivePinia(pinia);
        const store2 = pinia._s.get(id);
        return getters[name].call(store2, store2);
      }));
      return computedGetters;
    }, {}));
  }
  store = createSetupStore(id, setup, options, pinia, hot, true);
  return store;
}
function createSetupStore($id, setup, options = {}, pinia, hot, isOptionsStore) {
  let scope;
  const optionsForPlugin = assign({ actions: {} }, options);
  const $subscribeOptions = { deep: true };
  let isListening;
  let isSyncListening;
  let subscriptions = [];
  let actionSubscriptions = [];
  let debuggerEvents;
  const initialState = pinia.state.value[$id];
  if (!isOptionsStore && !initialState && true) {
    {
      pinia.state.value[$id] = {};
    }
  }
  const hotState = ref({});
  let activeListener;
  function $patch(partialStateOrMutator) {
    let subscriptionMutation;
    isListening = isSyncListening = false;
    if (typeof partialStateOrMutator === "function") {
      partialStateOrMutator(pinia.state.value[$id]);
      subscriptionMutation = {
        type: MutationType.patchFunction,
        storeId: $id,
        events: debuggerEvents
      };
    } else {
      mergeReactiveObjects(pinia.state.value[$id], partialStateOrMutator);
      subscriptionMutation = {
        type: MutationType.patchObject,
        payload: partialStateOrMutator,
        storeId: $id,
        events: debuggerEvents
      };
    }
    const myListenerId = activeListener = Symbol();
    nextTick().then(() => {
      if (activeListener === myListenerId) {
        isListening = true;
      }
    });
    isSyncListening = true;
    triggerSubscriptions(subscriptions, subscriptionMutation, pinia.state.value[$id]);
  }
  const $reset = isOptionsStore ? function $reset2() {
    const { state } = options;
    const newState = state ? state() : {};
    this.$patch(($state) => {
      assign($state, newState);
    });
  } : (
    /* istanbul ignore next */
    noop
  );
  function $dispose() {
    scope.stop();
    subscriptions = [];
    actionSubscriptions = [];
    pinia._s.delete($id);
  }
  const action = (fn, name = "") => {
    if (ACTION_MARKER in fn) {
      fn[ACTION_NAME] = name;
      return fn;
    }
    const wrappedAction = function() {
      setActivePinia(pinia);
      const args = Array.from(arguments);
      const afterCallbackList = [];
      const onErrorCallbackList = [];
      function after(callback) {
        afterCallbackList.push(callback);
      }
      function onError(callback) {
        onErrorCallbackList.push(callback);
      }
      triggerSubscriptions(actionSubscriptions, {
        args,
        name: wrappedAction[ACTION_NAME],
        store,
        after,
        onError
      });
      let ret;
      try {
        ret = fn.apply(this && this.$id === $id ? this : store, args);
      } catch (error) {
        triggerSubscriptions(onErrorCallbackList, error);
        throw error;
      }
      if (ret instanceof Promise) {
        return ret.then((value) => {
          triggerSubscriptions(afterCallbackList, value);
          return value;
        }).catch((error) => {
          triggerSubscriptions(onErrorCallbackList, error);
          return Promise.reject(error);
        });
      }
      triggerSubscriptions(afterCallbackList, ret);
      return ret;
    };
    wrappedAction[ACTION_MARKER] = true;
    wrappedAction[ACTION_NAME] = name;
    return wrappedAction;
  };
  const _hmrPayload = /* @__PURE__ */ markRaw({
    actions: {},
    getters: {},
    state: [],
    hotState
  });
  const partialStore = {
    _p: pinia,
    // _s: scope,
    $id,
    $onAction: addSubscription.bind(null, actionSubscriptions),
    $patch,
    $reset,
    $subscribe(callback, options2 = {}) {
      const removeSubscription = addSubscription(subscriptions, callback, options2.detached, () => stopWatcher());
      const stopWatcher = scope.run(() => watch(() => pinia.state.value[$id], (state) => {
        if (options2.flush === "sync" ? isSyncListening : isListening) {
          callback({
            storeId: $id,
            type: MutationType.direct,
            events: debuggerEvents
          }, state);
        }
      }, assign({}, $subscribeOptions, options2)));
      return removeSubscription;
    },
    $dispose
  };
  const store = reactive(typeof __VUE_PROD_DEVTOOLS__ !== "undefined" && __VUE_PROD_DEVTOOLS__ && true && IS_CLIENT ? assign(
    {
      _hmrPayload,
      _customProperties: markRaw(/* @__PURE__ */ new Set())
      // devtools custom properties
    },
    partialStore
    // must be added later
    // setupStore
  ) : partialStore);
  pinia._s.set($id, store);
  const runWithContext = pinia._a && pinia._a.runWithContext || fallbackRunWithContext;
  const setupStore = runWithContext(() => pinia._e.run(() => (scope = effectScope()).run(() => setup({ action }))));
  for (const key in setupStore) {
    const prop = setupStore[key];
    if (isRef(prop) && !isComputed(prop) || isReactive(prop)) {
      if (!isOptionsStore) {
        if (initialState && shouldHydrate(prop)) {
          if (isRef(prop)) {
            prop.value = initialState[key];
          } else {
            mergeReactiveObjects(prop, initialState[key]);
          }
        }
        {
          pinia.state.value[$id][key] = prop;
        }
      }
    } else if (typeof prop === "function") {
      const actionValue = action(prop, key);
      {
        setupStore[key] = actionValue;
      }
      optionsForPlugin.actions[key] = prop;
    } else ;
  }
  {
    assign(store, setupStore);
    assign(toRaw(store), setupStore);
  }
  Object.defineProperty(store, "$state", {
    get: () => pinia.state.value[$id],
    set: (state) => {
      $patch(($state) => {
        assign($state, state);
      });
    }
  });
  if (typeof __VUE_PROD_DEVTOOLS__ !== "undefined" && __VUE_PROD_DEVTOOLS__ && true && IS_CLIENT) {
    const nonEnumerable = {
      writable: true,
      configurable: true,
      // avoid warning on devtools trying to display this property
      enumerable: false
    };
    ["_p", "_hmrPayload", "_getters", "_customProperties"].forEach((p2) => {
      Object.defineProperty(store, p2, assign({ value: store[p2] }, nonEnumerable));
    });
  }
  pinia._p.forEach((extender) => {
    if (typeof __VUE_PROD_DEVTOOLS__ !== "undefined" && __VUE_PROD_DEVTOOLS__ && true && IS_CLIENT) {
      const extensions = scope.run(() => extender({
        store,
        app: pinia._a,
        pinia,
        options: optionsForPlugin
      }));
      Object.keys(extensions || {}).forEach((key) => store._customProperties.add(key));
      assign(store, extensions);
    } else {
      assign(store, scope.run(() => extender({
        store,
        app: pinia._a,
        pinia,
        options: optionsForPlugin
      })));
    }
  });
  if (initialState && isOptionsStore && options.hydrate) {
    options.hydrate(store.$state, initialState);
  }
  isListening = true;
  isSyncListening = true;
  return store;
}
/*! #__NO_SIDE_EFFECTS__ */
// @__NO_SIDE_EFFECTS__
function defineStore(idOrOptions, setup, setupOptions) {
  let id;
  let options;
  const isSetupStore = typeof setup === "function";
  if (typeof idOrOptions === "string") {
    id = idOrOptions;
    options = isSetupStore ? setupOptions : setup;
  } else {
    options = idOrOptions;
    id = idOrOptions.id;
  }
  function useStore(pinia, hot) {
    const hasContext = hasInjectionContext();
    pinia = // in test mode, ignore the argument provided as we can always retrieve a
    // pinia instance with getActivePinia()
    pinia || (hasContext ? inject(piniaSymbol, null) : null);
    if (pinia)
      setActivePinia(pinia);
    pinia = activePinia;
    if (!pinia._s.has(id)) {
      if (isSetupStore) {
        createSetupStore(id, setup, options, pinia);
      } else {
        createOptionsStore(id, options, pinia);
      }
    }
    const store = pinia._s.get(id);
    return store;
  }
  useStore.$id = id;
  return useStore;
}
function storeToRefs(store) {
  {
    const rawStore = toRaw(store);
    const refs = {};
    for (const key in rawStore) {
      const value = rawStore[key];
      if (value.effect) {
        refs[key] = // ...
        computed({
          get: () => store[key],
          set(value2) {
            store[key] = value2;
          }
        });
      } else if (isRef(value) || isReactive(value)) {
        refs[key] = // ---
        toRef(store, key);
      }
    }
    return refs;
  }
}
function getQuery(val) {
  const w2 = location.hash.indexOf("?");
  const query = location.hash.substring(w2 + 1);
  const vars = query.split("&");
  for (let i2 = 0; i2 < vars.length; i2++) {
    const pair = vars[i2].split("=");
    if (pair[0] === val) {
      return pair[1];
    }
  }
  return false;
}
function getAbsolutePath() {
  const path2 = location.pathname;
  return path2.substring(0, path2.lastIndexOf("/") + 1);
}
function getBaseUrl() {
  if (!window.baseURL) {
    let baseUrl = new URL(window.location.href).origin;
    baseUrl += getAbsolutePath();
    window.baseURL = baseUrl;
  }
  return window.baseURL;
}
const useGameLineStore = /* @__PURE__ */ defineStore(
  "GameLine",
  () => {
    const lines = ref([]);
    const curLine = ref(null);
    const needReset = ref(0);
    const baseUrl = computed(() => {
      if (curLine.value) {
        return curLine.value.value;
      }
      return getBaseUrl();
    });
    function init(list) {
      lines.value = list;
      if (list.length <= 0) {
        curLine.value = null;
        return;
      }
      let domain = getQuery("domain");
      const origin2 = window.location.origin;
      if (domain !== false) {
        domain = removeTrailingSlash(domain);
      }
      if (!domain) {
        const match = list.find((item) => removeTrailingSlash(item.value) === origin2);
        if (match !== void 0 && match !== null) {
          domain = match.value;
        } else {
          domain = curLine.value?.value;
        }
      }
      if (domain) {
        curLine.value = list.find((item) => item.value === domain);
        if (!curLine.value) {
          curLine.value = { value: domain, name: "" };
        }
      } else {
        curLine.value = list[0];
      }
    }
    function changeCurLine(value) {
      curLine.value = value;
    }
    return { lines, curLine, init, changeCurLine, baseUrl, needReset };
  },
  {
    persist: {
      key: "game-line-store",
      paths: ["curLine"]
    }
  }
);
async function getSsoConfig() {
  return axiosJSON.post("/center/ssoConfig", void 0, {
    optionalOn404: true
  });
}
async function ssoLogin(ssoToken) {
  return axiosJSON.post("/center/ssoLogin", {
    token: ssoToken
  });
}
async function ssoCheckSession(token) {
  return axiosJSON.request({
    method: "get",
    url: "/center/ssoCheckSession",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}
async function ssoLogout(token) {
  return axiosJSON.request({
    method: "post",
    url: "/center/ssoLogout",
    data: {},
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}
const SSO_SERVER = "https://account.xmpaoyou.com";
const SSO_LOGIN_PATH = "/sso";
const useAuthStore = /* @__PURE__ */ defineStore(
  "auth",
  () => {
    const token = ref(null);
    const userInfo = ref(null);
    const isChecking = ref(false);
    const ssoEnabled = ref(null);
    const isGameLine = ref(false);
    const ssoAdmins = ref([]);
    const configLoaded = ref(false);
    const isAuthenticated = computed(() => {
      if (ssoEnabled.value === false) {
        return true;
      }
      return !!token.value && !!userInfo.value;
    });
    const userName = computed(() => {
      return userInfo.value?.name || userInfo.value?.account || "";
    });
    const userAvatar = computed(() => {
      return userInfo.value?.avatar || "";
    });
    const userRole = computed(() => {
      if (ssoEnabled.value === false) {
        return "readwrite";
      }
      return userInfo.value?.role || "readonly";
    });
    const isReadonly2 = computed(() => {
      return userRole.value === "readonly";
    });
    const canWrite = computed(() => {
      return userRole.value === "readwrite";
    });
    const isAdmin = computed(() => {
      if (!isGameLine.value) {
        return false;
      }
      const currentUserName = userName.value;
      if (!currentUserName || !ssoAdmins.value || ssoAdmins.value.length === 0) {
        return false;
      }
      return ssoAdmins.value.includes(currentUserName);
    });
    function getSsoLoginUrl(redirectPath = "/") {
      const callbackUrl = `${window.location.origin + window.location.pathname}#/sso/callback?redirect=${encodeURIComponent(redirectPath)}`;
      return `${SSO_SERVER}${SSO_LOGIN_PATH}?url=${encodeURIComponent(callbackUrl)}`;
    }
    async function login(ssoToken) {
      try {
        const response = await ssoLogin(ssoToken);
        if (response.data.s === 0) {
          token.value = response.data.token;
          userInfo.value = response.data.userInfo;
          return true;
        }
        return false;
      } catch (error) {
        console.error("SSO 登录失败:", error);
        return false;
      }
    }
    async function checkAuth() {
      if (ssoEnabled.value === false) {
        return true;
      }
      if (!token.value) {
        return false;
      }
      if (isChecking.value) {
        return isAuthenticated.value;
      }
      isChecking.value = true;
      try {
        const response = await ssoCheckSession(token.value);
        if (response.data.s === 0 && response.data.valid) {
          userInfo.value = response.data.userInfo;
          return true;
        }
        clearAuth();
        return false;
      } catch (error) {
        console.error("检查 session 失败:", error);
        return isAuthenticated.value;
      } finally {
        isChecking.value = false;
      }
    }
    async function logout() {
      try {
        if (token.value) {
          await ssoLogout(token.value);
        }
      } catch (error) {
        console.error("登出请求失败:", error);
      } finally {
        clearAuth();
      }
    }
    function clearAuth() {
      token.value = null;
      userInfo.value = null;
    }
    function redirectToSsoLogin(redirectPath = "/") {
      window.location.href = getSsoLoginUrl(redirectPath);
    }
    async function fetchConfig() {
      if (configLoaded.value) {
        return ssoEnabled.value;
      }
      try {
        const response = await getSsoConfig();
        if (response.data.s === 0) {
          ssoEnabled.value = response.data.ssoEnabled ?? false;
          isGameLine.value = response.data.isGameLine ?? false;
          ssoAdmins.value = response.data.ssoAdmins ?? [];
        } else {
          ssoEnabled.value = false;
          isGameLine.value = false;
          ssoAdmins.value = [];
        }
      } catch (error) {
        console.error("获取 SSO 配置失败:", error);
        ssoEnabled.value = false;
        isGameLine.value = false;
        ssoAdmins.value = [];
      }
      configLoaded.value = true;
      return ssoEnabled.value;
    }
    function toggleRole(newRole) {
      if (!isAdmin.value) {
        return false;
      }
      if (userInfo.value) {
        userInfo.value.role = newRole;
        return true;
      }
      return false;
    }
    return {
      // 状态
      token,
      userInfo,
      isChecking,
      ssoEnabled,
      isGameLine,
      ssoAdmins,
      configLoaded,
      // 计算属性
      isAuthenticated,
      userName,
      userAvatar,
      userRole,
      isReadonly: isReadonly2,
      canWrite,
      isAdmin,
      // 方法
      getSsoLoginUrl,
      login,
      checkAuth,
      logout,
      clearAuth,
      redirectToSsoLogin,
      fetchConfig,
      toggleRole
    };
  },
  {
    persist: {
      key: "auth-store",
      paths: ["token", "userInfo"]
    }
  }
);
const inWorker = typeof window === "undefined";
const Axios = axios.create({
  timeout: 9e4,
  headers: {
    "Content-Type": "application/json;charse=UTF-8",
    "Accept-Language": "zh-CN"
  }
});
function shouldSuppressErrorMessage(err) {
  const config = err?.config || err?.response?.config;
  if (!config) {
    return false;
  }
  if (config.suppressErrorMessage === true) {
    return true;
  }
  if (config.optionalOn404 === true && err?.response?.status === 404) {
    return true;
  }
  return false;
}
Axios.interceptors.request.use(
  (config) => {
    config.baseURL = inWorker ? self.baseURL : useGameLineStore().baseUrl;
    const token = inWorker ? self.authToken : useAuthStore().token;
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    if (!inWorker) {
      loading.close();
    }
    return Promise.reject(error);
  }
);
Axios.interceptors.response.use(
  (response) => {
    if (!inWorker) {
      loading.close();
    }
    if (response.headers["content-disposition"]) {
      return response;
    }
    if (response.data.s !== void 0) {
      response.data.status = response.data.s;
    }
    const errorCode = response.data.status !== void 0 ? response.data.status : response.data.code;
    if (errorCode !== 0) {
      if (response.data.__proto__.constructor === Blob) {
        const reader2 = new FileReader();
        reader2.readAsText(response.data, "utf-8");
        reader2.onload = (e2) => {
          const result = JSON.parse(e2.target.result);
          if (!inWorker) {
            ElMessage.error({
              message: result.msg
            });
          }
        };
      } else if (response.data.doc) {
        return response;
      } else {
        if (response.data && errorCode !== 0) {
          console.log(response.data);
          if (!inWorker) {
            ElMessage.error({
              message: "tag:请求失败:" + response.data.msg,
              showClose: true,
              duration: 3e4
            });
          }
          response.message = response.data.msg;
        }
      }
      return Promise.reject(response);
    }
    const successCode = response.data.status !== void 0 ? response.data.status : response.data.code;
    if (successCode === 0) {
      if (response.data.notification) {
        if (!inWorker) {
          ElNotification.success({
            title: "通知信息",
            message: '<label style="padding: 5px;word-break: break-all">' + response.data.notification + "</label>",
            duration: 0,
            dangerouslyUseHTMLString: true
          });
        }
      }
    }
    return response;
  },
  (err) => {
    console.error(err);
    if (!inWorker) {
      loading.close();
    }
    if (err?.response?.status === 401) {
      if (!inWorker) {
        const authStore = useAuthStore();
        authStore.clearAuth();
        ElMessage.error("登录已过期，请重新登录");
        setTimeout(() => {
          authStore.redirectToSsoLogin(window.location.hash.slice(1) || "/");
        }, 1e3);
      }
      return Promise.reject(err);
    }
    if (err && err?.response?.status) {
      const reg = new RegExp(`
`, "g");
      let serverOutSerialize = JSON.stringify(err.response.data, null, 2);
      serverOutSerialize = serverOutSerialize.replaceAll(reg, "</br>");
      err.message = `连接错误${err.response.status} ${serverOutSerialize}`;
    } else {
      err.message = `连接到服务器失败`;
    }
    if (!inWorker && !shouldSuppressErrorMessage(err)) {
      ElMessage.error({
        showClose: true,
        message: err.message,
        duration: 1e4,
        dangerouslyUseHTMLString: true
      });
    }
    return Promise.reject(err);
  }
);
const request = Axios.request;
const axiosJSON = {
  // get请求
  get(url, param, config = {}) {
    return Axios.get(url, {
      method: "get",
      params: param,
      ...config
    });
  },
  // post请求
  post(url, param, config = {}) {
    return Axios.post(url, param, config);
  },
  request
};
async function adjustProtoAPI(data) {
  const resp = await axiosJSON.get("/adjust/downloadProto", data);
  return resp.data;
}
if (typeof window !== "undefined") {
  window.protobuf = protobuf;
}
if (typeof self !== "undefined") {
  self.protobuf = protobuf;
}
const namespace = "pb";
const PROTO_TYPES = [
  "double",
  "float",
  "int32",
  "int64",
  "uint32",
  "uint64",
  "sint32",
  "sint64",
  "fixed32",
  "fixed64",
  "sfixed32",
  "sfixed64",
  "bool",
  "string",
  "bytes"
];
class ProtoMsg {
  routes = [];
  routeMap = /* @__PURE__ */ new Map();
  docs = {};
  protoRoot = null;
  paramAndRout = [];
  protoJson = "";
  //缓存用于worker传递
  routeLoadingPromise = null;
  // constructor() {
  //
  // }
  getProtoDocTree(rootName, isRoute) {
    rootName = rootName.replace("pb.", "");
    if (!this.docs.message[rootName]) {
      return false;
    }
    const protoDoc = this.docs.message[rootName];
    const node = JSON.parse(
      JSON.stringify(
        Object.assign(
          {
            isRoute,
            id: v4()
          },
          protoDoc
        )
      )
    );
    node.fields.forEach((field2) => {
      field2.id = v4();
      if (PROTO_TYPES.indexOf(field2.type) >= 0) {
        return;
      }
      field2.hasFields = true;
    });
    return node;
  }
  isBuiltDataType(type2) {
    return PROTO_TYPES.indexOf(type2) >= 0;
  }
  async initRoute(showLoading = true) {
    if (this.protoRoot && this.routes.length > 0) {
      return true;
    }
    if (this.routeLoadingPromise) {
      return this.routeLoadingPromise;
    }
    this.routeLoadingPromise = (async () => {
      if (showLoading) {
        loading.start();
      }
      try {
        const response = await adjustProtoAPI({});
        if (!response.doc || !response.proto) {
          return false;
        }
        this.initByProtoJson(response);
        console.log(this.routes);
        console.log(this.protoRoot);
        return true;
      } catch (e2) {
        console.error(e2);
        return false;
      } finally {
        if (showLoading) {
          loading.close();
        }
        this.routeLoadingPromise = null;
      }
    })();
    return this.routeLoadingPromise;
  }
  initByProtoJson(response) {
    this.protoJson = response;
    this.routes = [];
    this.docs = response.doc;
    for (const routeIndex in response.doc.route) {
      this.routes.push(response.doc.route[routeIndex]);
    }
    const pbJson = response.proto.nested;
    this.protoRoot = (protobuf.roots["default"] = new protobuf.Root()).addJSON(pbJson);
  }
  getFields(msgId) {
    const pb = this.getPbObject(msgId);
    const params = [];
    for (const index in pb.fields) {
      params.push(index + "=");
    }
    return params.join("&");
  }
  getPbNameByMsgId(msgId, neddNamespace) {
    if (!this.protoRoot) {
      return neddNamespace ? namespace + ".EmptyMsg" : "EmptyMsg";
    }
    let pbName = "";
    const PBRouteMap = this.protoRoot.lookup("pb.RouteMap");
    if (PBRouteMap.valuesById[msgId] === void 0) {
      pbName = msgId % 2 > 0 ? "EmptyMsg" : "ResponseMessage";
    } else {
      pbName = PBRouteMap.valuesById[msgId];
      pbName = pbName.slice(pbName.indexOf("_") + 1);
    }
    return neddNamespace ? namespace + "." + pbName : pbName;
  }
  getPbObject(msgId) {
    if (!this.protoRoot) {
      return null;
    }
    const pbName = this.getPbNameByMsgId(msgId, true);
    let pb = this.protoRoot.lookup(pbName);
    if (!pb) {
      const pbName2 = msgId % 2 > 0 ? "EmptyMsg" : "ResponseMessage";
      pb = this.protoRoot.lookup(pbName2);
    }
    return pb;
  }
  getReqPbName(msgId) {
    let reqId = msgId - 1;
    let reqPb = this.getPbObject(reqId);
    return reqPb.name ?? "";
  }
  getRouteByPbName(pbFullName) {
    let pbName = pbFullName.replace("Controller", "");
    let routeNames = pbName.split("_"), group = "";
    if (routeNames.length > 2) {
      group = routeNames[0] + "_" + routeNames[1];
    } else {
      group = routeNames[0];
    }
    const routeGroup = this.routes.find((item) => item.id === group);
    if (!routeGroup) {
      return null;
    }
    return routeGroup.children.find((item) => item.p === `CS_${pbFullName}`);
  }
  encode(msgId, data, reqId) {
    let paramList = this.formatParams(data);
    this.paramAndRout[reqId] = paramList;
    const buff = this.getPbObject(msgId).encode(paramList ?? {}).finish();
    const buffer2 = new ArrayBuffer(buff.length + 16);
    const dv = new DataView(buffer2);
    dv.setUint32(0, buff.length + 16, false);
    dv.setUint32(4, msgId, false);
    dv.setUint32(8, reqId, false);
    dv.setUint32(12, 123321, false);
    for (let i2 = 0; i2 < buff.length; i2++) {
      dv.setInt8(16 + i2, buff[i2]);
    }
    return buffer2;
  }
  decode(buff) {
    const length = buff.byteLength;
    const dv = new DataView(buff);
    const msgId = dv.getUint32(4, false);
    const reqId = dv.getUint32(8, false);
    const err = dv.getInt8(12, false);
    let pbObject;
    if (err > 0) {
      pbObject = this.getPbObject(2);
    } else {
      pbObject = this.getPbObject(msgId);
    }
    const newBuf = new Uint8Array(buff, 13);
    const data = pbObject.decode(newBuf);
    if (data.c && data.c.length > 0) {
      for (let i2 = 0; i2 < data.c.length; i2++) {
        data.c[i2]["change"] = JSON.parse(data.c[i2]["change"]);
      }
    }
    if (err > 0 && data.reqMsg) {
      data.reqMsg = JSON.parse(data.reqMsg);
    }
    const params = this.paramAndRout[reqId] ?? [];
    const time = dateFormat("YYYY-mm-dd HH:MM:SS", /* @__PURE__ */ new Date());
    const reqPbName = this.getReqPbName(msgId);
    return {
      json: data.toJSON(),
      time,
      title: time + " --> " + reqPbName + ": " + reqId + "；msgId：" + msgId + "；errId：" + err,
      msgId,
      param: params,
      reqName: reqPbName,
      reqId,
      errId: err,
      length
    };
  }
  formatParams(data) {
    let paramList;
    if (typeof data === "object") {
      paramList = data;
    } else if (data.indexOf("[") === 0 && data.indexOf("]") > 0 || data.indexOf("{") === 0 && data.indexOf("}") > 0) {
      paramList = JSON.parse(data);
    } else {
      const arr = data.split("&");
      paramList = {};
      for (const item of arr) {
        const index = item.indexOf("=");
        if (index < 0) {
          continue;
        }
        const name = item.slice(0, index);
        const value = item.slice(index + 1);
        if (value.length <= 0) {
          continue;
        }
        if (value.indexOf("[") === 0 && value.indexOf("]") > 0 || value.indexOf("{") === 0 || value.indexOf("}") > 0) {
          paramList[name] = JSON.parse(value);
        } else {
          paramList[name] = value;
        }
      }
    }
    return paramList;
  }
}
const protoMsg = new ProtoMsg();
if (typeof window !== "undefined") {
  window.protoMsg = protoMsg;
}
if (typeof self !== "undefined") {
  self.protoMsg = protoMsg;
}
const EventType = {
  connected: "connected",
  recv: "recv",
  disconnected: "disconnected",
  send: "send",
  routeInit: "routeInit",
  loadHash: "loadHash",
  error: "error"
};
async function loadHash(uId) {
  const resp = await axiosJSON.get(`/adjust/wstool/getHash?uId=${uId}`);
  return resp.data;
}
class NetworkUpdater {
  //   _boardcast
  //    _before
  constructor() {
  }
  isArray(key) {
    return Array.isArray(key);
  }
  isObject(obj) {
    return typeof obj === "object" && obj !== null;
  }
  isNumeric(v2) {
    return !isNaN(parseFloat(v2)) && isFinite(v2);
  }
  isNormal(key) {
    const isAt = key.indexOf("@") > -1;
    const isDot = key.indexOf(".") > -1;
    const isUnderline = key.indexOf("_") > -1;
    return !isAt && !isDot && !isUnderline;
  }
  isAddToArray(key) {
    return key === "@a";
  }
  isRemoveToArray(key) {
    const arr = key.split("_");
    return arr.length <= 3 && arr[0] === "@d";
  }
  isFilter(key) {
    const arr = key.split("_");
    return arr[0] === "@f";
  }
  _updateObject(name, value, data) {
    const cacheData = data;
    const arr = name.split(".");
    if (arr[0] === "@a" || arr[0] === "@s") {
      if (Array.isArray(cacheData)) {
        const idx = parseInt(arr[1], 10);
        if (Array.isArray(value) && Array.isArray(cacheData[idx])) {
          cacheData[idx] = value.slice();
        } else {
          cacheData[idx] = value;
        }
      } else {
        if (Array.isArray(value) && Array.isArray(cacheData[arr[1]])) {
          cacheData[arr[1]] = value.slice();
        } else {
          cacheData[arr[1]] = value;
        }
      }
    } else if (arr[0] === "@d") {
      delete cacheData[arr[1]];
    }
  }
  _getFilterObject(filter2, cacheData) {
    if (cacheData) {
      const arr = filter2.split("_");
      if (arr.length === 2 && arr[0] === "@f" && Array.isArray(cacheData)) {
        const idx = parseInt(arr[1], 10);
        return cacheData[idx];
      }
      if (arr.length === 3 && arr[0] === "@f" && Array.isArray(cacheData)) {
        const key = arr[1];
        let value = arr[2];
        for (let i2 = 0; i2 < cacheData.length; i2 += 1) {
          const v2 = cacheData[i2];
          if (arr.length === 3 && typeof v2 === "object") {
            const cacheValue = v2[key];
            if (cacheValue != null && cacheValue !== void 0) {
              if (value[0] === "@") {
                value = value.replace("@", "");
              }
              if (value === cacheValue.toString()) {
                return v2;
              }
            }
          }
        }
      }
    }
    return null;
  }
  _addObjectToArray(cacheData, changeValue) {
    if (Array.isArray(changeValue)) {
      for (let i2 = 0; i2 < changeValue.length; i2 += 1) {
        cacheData.push(changeValue[i2]);
      }
    } else {
      cacheData.push(changeValue);
    }
  }
  _sliceCaceData(cacheData, idx) {
    cacheData.splice(idx, 1);
  }
  _removeObjectFromArray(cacheData, key, changeValue) {
    const arr = key.split("_");
    if (arr.length <= 3 && arr[0] === "@d") {
      if (Array.isArray(cacheData)) {
        const count = cacheData.length;
        for (let i2 = count - 1; i2 >= 0; i2 -= 1) {
          const cacheDataItem = cacheData[i2];
          if (arr.length === 3) {
            if (cacheDataItem.hasOwnProperty(arr[1])) {
              let val = arr[2];
              if (val[0] === "@") {
                val = val.replace("@", "");
              }
              if (val === cacheDataItem[arr[1]].toString()) {
                this._sliceCaceData(cacheData, i2);
              }
            }
          } else if (arr.length === 2 && cacheDataItem.hasOwnProperty(arr[1])) {
            if (changeValue === cacheDataItem[arr[1]]) {
              this._sliceCaceData(cacheData, i2);
            }
          } else if (arr.length === 1) {
            if (changeValue === cacheDataItem) {
              this._sliceCaceData(cacheData, i2);
            }
          }
        }
      }
    }
  }
  update(updateData, dataCache) {
    const keys = Object.keys(updateData);
    keys.forEach((k1) => {
      const v1 = updateData[k1];
      const arr = k1.split(".");
      const pmod = arr[0];
      const pdo = arr[1];
      let data = null;
      if (Object.prototype.hasOwnProperty.call(dataCache, pmod)) {
        data = dataCache[pmod];
      }
      if (data && pdo && Object.prototype.hasOwnProperty.call(data, pdo)) {
        data = data[pdo];
      }
      if (data) {
        this._update(data, v1);
      }
    });
  }
  _update(originData, changeData) {
    const cacheData = originData;
    if (cacheData && changeData && this.isObject(changeData)) {
      const keys = Object.keys(changeData);
      keys.forEach((k2) => {
        const v2 = changeData[k2];
        if (this.isNormal(k2) && this.isObject(v2)) {
          if (cacheData.hasOwnProperty(k2)) {
            this._update(cacheData[k2], v2);
          }
        } else if (this.isNormal(k2) && this.isNumeric(v2)) {
          const cv = cacheData[k2];
          cacheData[k2] = cv + v2;
        } else if (this.isNormal(k2)) {
          cacheData[k2] = v2;
        } else if (this.isAddToArray(k2)) {
          this._addObjectToArray(cacheData, v2);
        } else if (this.isRemoveToArray(k2)) {
          this._removeObjectFromArray(cacheData, k2, v2);
        } else if (this.isFilter(k2)) {
          const subCacheData = this._getFilterObject(k2, cacheData);
          if (subCacheData) {
            this._update(subCacheData, v2);
          }
        } else {
          this._updateObject(k2, v2, cacheData);
        }
      });
    }
  }
}
class WsPromise {
  // 静态属性，用于存储多个实例，以 userInfo 的 uId 作为 key
  static instances = /* @__PURE__ */ new Map();
  constructor(userInfo) {
    this.ws = null;
    this.url = null;
    this.connectPromise = null;
    this.closePromise = null;
    this.closePromiseResolve = null;
    this.closePromiseReject = null;
    this.reqId = 0;
    this.pendingMessages = /* @__PURE__ */ new Map();
    this.eventContainer = new EventEmitter$1();
    this.userInfo = Object.assign(
      {
        hash: "",
        sId: "",
        uId: "",
        isMock: true
      },
      userInfo
    );
    this.MSG = protoMsg;
    this.USER_CACHE = {};
  }
  async reConnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      await this.close();
    }
    await this.connect();
  }
  // 连接 WebSocket
  async connect(timeout = 3e4) {
    if (this.connectPromise) return this.connectPromise;
    this.ws = new WebSocket(this.url);
    this.reqId = 0;
    this.USER_CACHE = {};
    this.connectPromise = new Promise((resolve2, reject) => {
      const timer = setTimeout(() => {
        this.eventContainer.emit(EventType.connected, new Error("连接超时"));
        reject(new Error("连接超时"));
        this._cleanup();
      }, timeout);
      this.ws.addEventListener("open", async () => {
        clearTimeout(timer);
        this.eventContainer.emit(EventType.connected, null);
        await this.send({
          params: {
            hash: this.userInfo.hash,
            sId: this.userInfo.sId,
            reqId: this.reqId,
            ver: "1.0.3",
            deviceId: "1",
            isMock: this.userInfo.isMock
          },
          route: 1001
        });
        await this.send({
          params: {},
          route: 1009
        });
        resolve2();
      });
      this.ws.addEventListener("error", (error) => {
        let wsError = error;
        if (this.connectPromise) {
          if (this.ws.readyState === WebSocket.CLOSED) {
            if (!error.message) {
              wsError = new Error("网络连接已经断开: " + error.target.url);
            }
          }
          this.eventContainer.emit(EventType.connected, wsError);
          clearTimeout(timer);
          reject(wsError);
          this._cleanup();
        } else if (this.getReadyState() !== WebSocket.OPEN) {
          this.eventContainer.emit(EventType.disconnected);
          this._cleanup();
          if (this.closePromise) {
            this.closePromise.resolve(event);
          }
        } else {
          this.eventContainer.emit(EventType.error, wsError);
        }
        console.error(wsError);
      });
      this.ws.addEventListener("close", (event2) => {
        this.eventContainer.emit(EventType.disconnected);
        if (this.closePromise) {
          this.closePromiseResolve(event2);
        }
        this._cleanup();
      });
      const net = new NetworkUpdater();
      this.ws.addEventListener("message", async (event2) => {
        try {
          const arrayBuffer = await toArrayBuffer(event2.data);
          const text = protoMsg.decode(arrayBuffer);
          this._updateCache(text, net);
          const { reqId } = text;
          const pendingMessage = reqId ? this.pendingMessages.get(reqId) : null;
          if (pendingMessage?.startTime) {
            text.responseDelayMs = Date.now() - pendingMessage.startTime;
          }
          this.eventContainer.emit(EventType.recv, text);
          if (pendingMessage) {
            const { resolve: resolve3, timer: timer2 } = pendingMessage;
            clearTimeout(timer2);
            this.pendingMessages.delete(reqId);
            resolve3(text);
          }
        } catch (e2) {
          console.error("Message parsing failed:", e2);
        }
      });
    });
    return this.connectPromise;
  }
  // 发送消息（等待服务端响应）
  send(params, timeout = 3e4) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket 未连接"));
    }
    return new Promise((resolve2, reject) => {
      const reqId = ++this.reqId;
      const timer = setTimeout(() => {
        if (!this.pendingMessages.get(reqId)) {
          return;
        }
        this.pendingMessages.delete(reqId);
        reject(new Error("请求未收到响应消息"));
      }, timeout);
      this.pendingMessages.set(reqId, { resolve: resolve2, reject, params, timer, startTime: Date.now() });
      try {
        const blob = protoMsg.encode(params.route, params.params, reqId);
        this.eventContainer.emit(EventType.send, { ...params, length: blob.byteLength, reqId });
        this.ws.send(blob);
      } catch (error) {
        clearTimeout(timer);
        this.pendingMessages.delete(reqId);
        reject(error);
      }
    });
  }
  // 关闭连接
  close(code = 1e3, reason = "Normal closure") {
    if (!this.ws) return Promise.resolve();
    if (this.closePromise) return this.closePromise;
    this.closePromise = new Promise((resolve2, reject) => {
      this.closePromiseResolve = resolve2;
      this.closePromiseReject = reject;
      try {
        this.ws.close(code, reason);
      } catch (error) {
        this.eventContainer.emit(EventType.disconnected);
        this._cleanup();
        resolve2(error);
      }
    });
    return this.closePromise;
  }
  async reloadHash() {
    const data = await loadHash(this.userInfo.uId);
    this.userInfo.hash = data.hash;
    this.url = data.ws;
  }
  getReadyState() {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED;
  }
  heart() {
  }
  /**
   * websocket是否已连接
   * @returns {null|boolean}
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
  getReadyStateTxt() {
    if (!this.ws) {
      return "未创建WebSocket连接";
    }
    const txt = ["正在连接", "已经链接并且可以通讯", "连接正在关闭", "连接已关闭或者没有链接成功"];
    return txt[this.ws.readyState] ? txt[this.ws.readyState] : "未知";
  }
  /**
   * 监听服务端推送消息（仅按 msgId 过滤）
   * @param {number} msgId - 要监听的消息 ID
   * @param {function} listener - 回调 (message) => void
   * @returns {function} 取消监听函数
   */
  onPush(msgId, listener) {
    if (typeof msgId !== "number") {
      throw new Error("onPush 需要提供数字类型的 msgId");
    }
    if (typeof listener !== "function") {
      throw new Error("onPush 需要提供回调函数");
    }
    const handler = (message2) => {
      if (message2 && message2.msgId === msgId) {
        listener(message2);
      }
    };
    this.eventContainer.on(EventType.recv, handler);
    return () => this.eventContainer.off(EventType.recv, handler);
  }
  /**
   * 根据 userInfo 获取或创建 WsPromise 实例
   * @param {Object} userInfo - 用户信息对象，必须包含 uId 属性
   * @returns {WsPromise} 对应的 WsPromise 实例
   */
  static getInstance(userInfo) {
    if (!userInfo) {
      throw new Error("userInfo 必须包含 uId 属性");
    }
    if (!userInfo.uId) {
      return new WsPromise(userInfo);
    }
    const key = `${userInfo.uId}_${!!userInfo.isMock}`;
    if (!WsPromise.instances.has(key)) {
      const instance = new WsPromise(userInfo);
      WsPromise.instances.set(key, instance);
    }
    return WsPromise.instances.get(key);
  }
  /**
   * 获取所有已创建的实例
   * @returns {Map} 包含所有实例的 Map
   */
  static getAllInstances() {
    return WsPromise.instances;
  }
  /**
   * 根据 hash 移除指定实例
   * @param {string} hash - 用户 hash
   */
  static removeInstance(hash) {
    if (WsPromise.instances.has(hash)) {
      const instance = WsPromise.instances.get(hash);
      if (instance.isConnected()) {
        instance.close();
      }
      WsPromise.instances.delete(hash);
    }
  }
  /**
   * 获取当前实例信息
   * @returns {Object} 包含实例状态信息的对象
   */
  getInstanceInfo() {
    return {
      isConnected: this.isConnected(),
      readyState: this.getReadyState(),
      readyStateText: this.getReadyStateTxt(),
      url: this.url,
      userInfo: this.userInfo,
      pendingMessagesCount: this.pendingMessages.size,
      hasConnectPromise: !!this.connectPromise,
      hasClosePromise: !!this.closePromise
    };
  }
  // 清理资源
  _cleanup() {
    this.connectPromise = null;
    this.closePromise = null;
    this.closePromiseResolve = null;
    this.closePromiseReject = null;
    this.pendingMessages.forEach(({ reject }) => {
      reject(new Error("WebSocket connection closed"));
    });
    this.pendingMessages.clear();
    this.ws = null;
  }
  _updateCache(message2, net) {
    if (message2.msgId === 1010 && message2.json.mod) {
      this.USER_CACHE = { ...this.USER_CACHE, ...message2.json.mod };
    }
    if (!message2.json.c) {
      return;
    }
    for (const item of message2.json.c) {
      net.update({ [item.modDo]: item.change }, this.USER_CACHE);
    }
  }
}
const toArrayBuffer = (data) => {
  if (data instanceof ArrayBuffer) {
    return Promise.resolve(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  if (data?.arrayBuffer) {
    return data.arrayBuffer();
  }
  if (typeof data === "string") {
    return Promise.resolve(new TextEncoder().encode(data).buffer);
  }
  return new Promise((resolve2, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("不支持的WebSocket消息类型"));
      return;
    }
    const reader2 = new FileReader();
    reader2.readAsArrayBuffer(data);
    reader2.onload = () => resolve2(reader2.result);
    reader2.onerror = reject;
  });
};
class WsHandler {
  constructor(uId, sId, console2) {
    this.uId = uId;
    this.sId = sId;
    this._ws = WsPromise.getInstance({ uId, sId });
    this._eventListeners = [];
    for (const route of protoMsg.routes) {
      if (!this[route.id]) {
        this[route.id] = {};
      }
      for (const routeSub of route.children) {
        this[route.id][routeSub.method] = async (params) => {
          const logTitle = ` ${route.id}.${routeSub.method}  [${route.label}-${routeSub.label}]`;
          params = params[0] ?? {};
          try {
            console2.info("执行" + logTitle, { route: routeSub.id, params });
            const rs = await this._ws.send({
              route: routeSub.id,
              params
            });
            return rs.json ?? null;
          } catch (e2) {
            console2.error("WS FAIL" + logTitle, {
              req: {
                route: routeSub.id,
                params
              },
              e: {
                message: e2.message,
                stack: e2.stack
              }
            });
            throw e2;
          }
        };
      }
    }
    const sendHandler = (message2) => {
      const route = protoMsg.docs.enum.RouteMap[message2.route];
      console2.info(`WS Send ${route.number}-${route.description}-${route.name}`, message2);
    };
    this._ws.eventContainer.on(EventType.send, sendHandler);
    this._eventListeners.push({ type: EventType.send, handler: sendHandler });
    const errorHandler = (e2) => {
      console2.error("WS Error", { e: e2 });
    };
    this._ws.eventContainer.on(EventType.error, errorHandler);
    this._eventListeners.push({ type: EventType.error, handler: errorHandler });
    const connectedHandler = () => {
      console2.info("WS Connected", event);
    };
    this._ws.eventContainer.on(EventType.connected, connectedHandler);
    this._eventListeners.push({ type: EventType.connected, handler: connectedHandler });
    const disconnectedHandler = () => {
      console2.info("WS Disconnected");
    };
    this._ws.eventContainer.on(EventType.disconnected, disconnectedHandler);
    this._eventListeners.push({ type: EventType.disconnected, handler: disconnectedHandler });
    const recvHandler = (message2) => {
      let route = protoMsg.docs.enum.RouteMap[message2.msgId];
      if (!route) {
        const reqRoute = protoMsg.docs.enum.RouteMap[message2.msgId - 1];
        route = {
          number: message2.msgId,
          description: reqRoute.description + "响应",
          name: ""
        };
      }
      if (message2.errId) {
        console2.error(
          `WS ${message2.reqId ? "Response Error" : "Receive"} ${route.description}-${route.number}-${route.name}`,
          message2
        );
      } else {
        console2.info(
          `WS ${message2.reqId ? "Response" : "Receive"} ${route.description}-${route.number}-${route.name}`,
          message2
        );
      }
    };
    this._ws.eventContainer.on(EventType.recv, recvHandler);
    this._eventListeners.push({ type: EventType.recv, handler: recvHandler });
    const routeEnum = protoMsg.protoRoot.lookup("pb.RouteMap");
    const values = routeEnum && routeEnum.values ? routeEnum.values : protoMsg.protoRoot.nested.pb.RouteMap;
    for (const routeName in values) {
      if (!routeName || !routeName.startsWith("PUSH")) continue;
      const id = values[routeName];
      const scPbName = routeName.replace(/^PUSH\d*_?/, "");
      const methodName = "PUSH_" + scPbName;
      if (this[methodName]) continue;
      this[methodName] = (listener) => {
        if (typeof listener !== "function") {
          throw new Error(methodName + " 需要提供回调函数");
        }
        return this._ws.onPush(id, (message2) => listener(message2.json));
      };
    }
  }
  async connect() {
    await this._ws.reloadHash();
    await this._ws.connect();
  }
  async run(route, content) {
    if (typeof content === "string") {
      content = JSON.parse(content);
    }
    return this._ws.send({ route, params: content });
  }
  close() {
    if (this._eventListeners && this._eventListeners.length > 0) {
      for (const { type: type2, handler } of this._eventListeners) {
        try {
          this._ws.eventContainer.off(type2, handler);
        } catch (e2) {
        }
      }
      this._eventListeners = [];
    }
    return this._ws.close();
  }
  destroy() {
    this.close();
    for (const route of protoMsg.routes) {
      if (this[route.id]) {
        delete this[route.id];
      }
    }
  }
  /**
   * @param {function(message)} callback
   */
  onRecv(callback) {
    this._ws.eventContainer.on(EventType.recv, callback);
  }
  /**
   * 转化为编辑器自动提示需要的格式
   * @returns {{$meta: {documentationCN: string, documentation: string, detail: string}}}
   */
  toEditorTips() {
    let wsSuggestion = {
      $meta: {
        documentation: "WS模拟客户端请求",
        documentationCN: "WS模拟客户端请求",
        detail: "WS模拟客户端请求"
      }
    };
    protoMsg.routes.forEach((route) => {
      let routeSuggestion = {
        $meta: {
          documentation: route.label,
          documentationCN: route.label,
          detail: route.label
        }
      };
      route.children.forEach((child) => {
        let cs = child.p.replace("CS_", "");
        let fields = protoMsg.docs.message[cs]?.fields ?? [];
        let tips = [];
        let tipsDescs = [];
        fields.forEach((field2) => {
          tips.push(field2.name);
          field2.description;
          field2.type;
          tipsDescs.push(field2.name + "(" + field2.type + "): " + field2.description);
        });
        routeSuggestion[child.method] = {
          $meta: {
            documentation: tipsDescs.join("\n"),
            documentationCN: child.label,
            detail: child.label,
            insertText: child.method + "(" + tips.join(", ") + ")"
          }
        };
      });
      wsSuggestion[route.id] = routeSuggestion;
    });
    return wsSuggestion;
  }
  toWsAndPbTyping() {
    const allPb = protoMsg.protoRoot.nested.pb.nested;
    const csId2csName = {};
    const resPbName = {};
    for (const csName in protoMsg.protoRoot.nested.pb.RouteMap) {
      const id = protoMsg.protoRoot.nested.pb.RouteMap[csName];
      csId2csName[id] = csName;
    }
    let text = `
    /** WS模拟客户端请求，默认使用当前用户 */
    const WS = new class {
`;
    protoMsg.routes.forEach((route) => {
      text += `
      /** ${route.label} */
      ${route.id}: {
      `;
      route.children.forEach((child) => {
        let csPbName = child.p.replace("CS_", "");
        let id = parseInt(child.id);
        if (!Number.isInteger(id)) {
          throw new Error("route id无法转数字");
        }
        let fields = protoMsg.protoRoot.nested.pb[csPbName]?.fields ?? [];
        let doc2 = "";
        for (const fieldKey in fields) {
          const field2 = fields[fieldKey];
          doc2 += field2.name + " " + field2.comment + "\n\n";
        }
        let reqText = "";
        if (protoMsg.protoRoot.nested.pb[csPbName]) {
          const _type = "pb." + csPbName;
          reqText = "req: " + _type + "|Partial<" + _type + ">";
        }
        let resText = "pb.ResponseMessage";
        if (csId2csName[id + 1]) {
          let scPbName = csId2csName[id + 1].replace(/SC\d*_/, "");
          if (protoMsg.protoRoot.nested.pb[scPbName]) {
            resText = "pb." + scPbName;
            resPbName[scPbName] = true;
          }
        }
        text += `
        /** 
        ${child.label}


        ${doc2}
         */
        public ${child.method}(${reqText}): ${resText}
`;
      });
      text += `}
`;
    });
    text += `
      /** 服务端推送监听 */
    `;
    for (const routeName in protoMsg.protoRoot.nested.pb.RouteMap) {
      if (!routeName.startsWith("PUSH")) continue;
      const id = protoMsg.protoRoot.nested.pb.RouteMap[routeName];
      const scPbName = routeName.replace(/^PUSH\d*_?/, "");
      const hasType = !!protoMsg.protoRoot.nested.pb[scPbName];
      const resText = hasType ? "pb." + scPbName : "pb.ResponseMessage";
      text += `
      /** 监听 ${routeName} (${id}) 推送 */
      public PUSH_${scPbName}(listener: (msg: ${resText}) => void): () => void
      `;
    }
    text += `
}();`;
    text += "type int64 = number;\n";
    text += "type int32 = number;\n";
    text += "type bool = boolean; \n";
    text += `namespace pb{
`;
    for (const textKey in allPb) {
      const pbInfo = allPb[textKey];
      let pbClassOrEnum = `
      /** ${pbInfo.comment ?? ""} */
`;
      if (pbInfo.fields === void 0) {
        pbClassOrEnum += `enum ${textKey}{
`;
        for (const pbInfoKey in pbInfo.values) {
          pbClassOrEnum += `${pbInfoKey} = ${pbInfo.values[pbInfoKey]},
`;
        }
      } else {
        pbClassOrEnum += `class ${textKey}{
`;
        for (const fieldsKey in pbInfo.fields) {
          pbClassOrEnum += `/** ${pbInfo.fields[fieldsKey].comment} */
`;
          let repeatedSuffix = "";
          let defaultValueSuffix = "";
          if (pbInfo.fields[fieldsKey].defaultValue === null) {
            if (pbInfo.name === "PbModDo" || pbInfo.name.startsWith("Mod")) {
              defaultValueSuffix = "";
            } else if (resPbName[pbInfo.name]) {
              defaultValueSuffix = "";
            } else {
              defaultValueSuffix = "|undefined";
            }
          }
          if (pbInfo.fields[fieldsKey].rule === "repeated") {
            repeatedSuffix = "[]";
          }
          pbClassOrEnum += `${fieldsKey}: ${pbInfo.fields[fieldsKey].type}${repeatedSuffix}${defaultValueSuffix}

`;
        }
      }
      pbClassOrEnum += "}\n\n";
      text += pbClassOrEnum;
    }
    text += `}

`;
    return text;
  }
  toConfTips(conf) {
    if (!conf.param) {
      conf.param = "接口config/all未下发全局表, $data['param'] = get_class_vars(ParamConf::class)";
    }
    let funcSuggestion = {
      $meta: {
        documentation: "配置表数据（不含导刷）",
        documentationCN: "配置表数据（不含导刷）",
        detail: "配置表数据（不含导刷）"
      }
    };
    let walk = (parent, item) => {
      if (Object.prototype.toString.call(item) === "[object Object]") {
        for (const itemKey in item) {
          if (Object.prototype.toString.call(item[itemKey]) === "[object Object]") {
            parent[itemKey] = {
              $meta: {
                documentation: `${itemKey}`,
                documentationCN: `${itemKey}`,
                detail: `${itemKey}`,
                insertText: isNaN(parseInt(itemKey)) ? `${itemKey}` : `[${itemKey}]`
              }
            };
            walk(parent[itemKey], item[itemKey]);
          } else {
            parent[itemKey] = {
              $meta: {
                documentation: `${item[itemKey]}`,
                documentationCN: `${item[itemKey]}`,
                detail: `${item[itemKey]}`,
                insertText: `${itemKey}`
              }
            };
          }
        }
      }
    };
    walk(funcSuggestion, conf);
    return funcSuggestion;
  }
  static toEnvVarPb() {
    const pb = {};
    for (const nestedKey in protoMsg.protoRoot.nested.pb.nested) {
      if (protoMsg.protoRoot.nested.pb.nested[nestedKey].ctor) {
        pb[nestedKey] = protoMsg.protoRoot.nested.pb.nested[nestedKey].ctor.prototype.constructor;
      } else {
        const enumClass = new class {
        }();
        for (const valuesKey in protoMsg.protoRoot.nested.pb.nested[nestedKey].values) {
          enumClass[valuesKey] = protoMsg.protoRoot.nested.pb.nested[nestedKey].values[valuesKey];
        }
        pb[nestedKey] = enumClass;
      }
    }
    return pb;
  }
}
const useUserStore = /* @__PURE__ */ defineStore(
  "User",
  () => {
    const lastAllUsers = ref({});
    const lastUsers = ref([]);
    const id = computed(() => {
      return info.value?.id ?? 0;
    });
    const sId = computed(() => {
      return info.value?.sId ?? 0;
    });
    const info = ref(null);
    function init(site) {
      lastUsers.value = lastAllUsers.value[site] ?? [];
      if (lastUsers.value.length <= 0) {
        info.value = null;
        return;
      }
      info.value = lastUsers.value[0];
    }
    function getLastUsers(site) {
      return lastAllUsers.value[site] ?? [];
    }
    function addUser(line, uInfo) {
      const list = lastAllUsers.value[line] ?? [];
      for (const index in list) {
        if (list[index].id === uInfo.id) {
          list.splice(index, 1);
        }
      }
      if (list.length > 10) {
        list.pop();
      }
      info.value = { id: uInfo.id, name: uInfo.name, sId: uInfo.sId };
      list.unshift(info.value);
      lastUsers.value = list;
      lastAllUsers.value[line] = list;
    }
    return {
      lastUsers,
      lastAllUsers,
      info,
      sId,
      id,
      addUser,
      init,
      getLastUsers
    };
  },
  {
    persist: {
      key: "user-store",
      paths: ["lastAllUsers", "getLastUsers"]
    }
  }
);
async function getTree(uId) {
  const resp = await axiosJSON.get("/adjust/customFunc/get?uId=" + uId);
  return {
    list: resp.data.data.list,
    openCheck: resp.data.data.openCheck
  };
}
async function postCommit(uId, route, flag, data, injectArr = [], secret = "") {
  const requestData = {
    route,
    flag,
    data,
    injectArr
  };
  if (secret) {
    requestData.secret = secret;
  }
  const resp = await axiosJSON.post("/adjust/customFunc/commit?uId=" + uId, requestData);
  return resp.data;
}
const useCustomFunc = /* @__PURE__ */ defineStore("useCustomFunc", () => {
  const list = ref([]);
  const openCheck = ref(false);
  const loaded = ref(false);
  const map = /* @__PURE__ */ new Map();
  const { id } = storeToRefs(useUserStore());
  const load2 = async (force = false) => {
    if (loaded.value && force === false) {
      return list.value;
    }
    const { list: treeList, openCheck: treeOpenCheck } = await getTree(id.value);
    list.value = treeList;
    openCheck.value = treeOpenCheck;
    loaded.value = true;
    map.clear();
    for (const item of list.value) {
      for (const node of item.children) {
        node.parent = item;
        node.flag = node.flag || "api";
        if (!node.uniq) {
          node.uniq = `${node.flag}-${node.route}`;
        }
        map.set(node.uniq, node);
      }
    }
    return list.value;
  };
  const get2 = (unique) => {
    return map.get(unique);
  };
  const getByRoute = (route, flag) => {
    return map.get(`${flag}-${route}`);
  };
  const getMap = () => {
    return map;
  };
  return {
    load: load2,
    list,
    openCheck,
    get: get2,
    getByRoute,
    getMap
  };
});
class FuncHandler {
  static async load(console2, uId) {
    const handler = new FuncHandler();
    const customFunc = useCustomFunc();
    try {
      await customFunc.load();
    } catch (error) {
      console2.error("自定义功能列表加载失败", error);
      throw error;
    }
    customFunc.getMap().forEach((item) => {
      handler[item.route] = async (...args) => {
        const logTitle = `${item.route} [${item.parent.desc}-${item.desc}]`;
        const params = [];
        item.fields.forEach(({ name }, index) => {
          params.push({ name, value: args[0][index] });
        });
        const req = { uId, flag: item.flag, route: item.route, params };
        try {
          console2.info("FUNC Request " + logTitle, { req });
          const resp = await postCommit(uId, item.route, item.flag, params);
          console2.info("FUNC Response " + logTitle, {
            req,
            resp
          });
          return resp;
        } catch (e2) {
          console2.error("FUNC Fail" + logTitle, { req, e: e2 });
          throw e2;
        }
      };
    });
    return handler;
  }
  static async run(uId, content) {
    if (typeof content === "string") {
      content = JSON.parse(content);
    }
    return postCommit(uId, content.route, content.flag, content.params);
  }
  /**
   * 转化为编辑器自动提示需要的格式
   * @returns {{$meta: {documentationCN: string, documentation: string, detail: string}}}
   */
  toEditorTips() {
    let funcSuggestion = {
      $meta: {
        documentation: "自定义工具方法",
        documentationCN: "自定义工具方法",
        detail: "自定义工具方法"
      }
    };
    useCustomFunc().getMap().forEach((map) => {
      console.log(map.fields);
      console.log(map.desc);
      let tipsDescs = [];
      let tips = [];
      map.fields.forEach((field2) => {
        const name = field2.name.replace("$", "");
        tips.push(name);
        field2.description;
        field2.type;
        tipsDescs.push(name + "(" + field2.dataType + "): " + field2.label);
      });
      funcSuggestion[map.route] = {
        $meta: {
          documentation: tipsDescs.join("\n"),
          documentationCN: map.desc,
          detail: map.desc,
          insertText: map.route + "(" + tips.join(", ") + ")"
        }
      };
    });
    return funcSuggestion;
  }
  toFuncTyping() {
    let text = `/** 自定义工具方法，默认使用当前用户 */
    const FUNC = new class {
`;
    useCustomFunc().getMap().forEach((map) => {
      let reqText = "";
      let doc2 = "";
      map.fields.forEach((field2) => {
        const name = field2.name.replace("$", "");
        doc2 += name + " " + field2.label + "\n\n";
        reqText += `${name}: ${field2.dataType},`;
      });
      text += `/** ${doc2} */
      ${map.route}(${reqText}):void
`;
    });
    text += "}\n";
    return text;
  }
}
var t = { 763: () => {
} }, e = {};
function n(s2) {
  var i2 = e[s2];
  if (void 0 !== i2) return i2.exports;
  var r2 = e[s2] = { exports: {} };
  return t[s2](r2, r2.exports, n), r2.exports;
}
n.d = (t2, e2) => {
  for (var s2 in e2) n.o(e2, s2) && !n.o(t2, s2) && Object.defineProperty(t2, s2, { enumerable: true, get: e2[s2] });
}, n.o = (t2, e2) => Object.prototype.hasOwnProperty.call(t2, e2);
var s = {};
n.d(s, { MG: () => $, fr: () => Lt, sR: () => Ae, Zo: () => ke, iH: () => Re, rt: () => Pt, jB: () => be, M8: () => le, $t: () => Ce, aq: () => me, pG: () => Ot, eP: () => Te, KU: () => xe, zW: () => Ie, IX: () => E, mY: () => _, a7: () => j, JG: () => Ut, ay: () => Xt, X2: () => ee, WU: () => de, Uw: () => ge, gw: () => pe, iX: () => Fe, re: () => se, Pg: () => Be, tD: () => ie, R$: () => te, Dj: () => Ft, m7: () => U, NZ: () => P, xo: () => b, ou: () => i, qC: () => ze, mD: () => d, Ay: () => Ye });
class i {
  constructor() {
    this.source = null, this.type = null, this.channel = null, this.start = null, this.stop = null, this.tokenIndex = null, this.line = null, this.column = null, this._text = null;
  }
  getTokenSource() {
    return this.source[0];
  }
  getInputStream() {
    return this.source[1];
  }
  get text() {
    return this._text;
  }
  set text(t2) {
    this._text = t2;
  }
}
function r(t2, e2) {
  if (!Array.isArray(t2) || !Array.isArray(e2)) return false;
  if (t2 === e2) return true;
  if (t2.length !== e2.length) return false;
  for (let n2 = 0; n2 < t2.length; n2++) if (!(t2[n2] === e2[n2] || t2[n2].equals && t2[n2].equals(e2[n2]))) return false;
  return true;
}
i.INVALID_TYPE = 0, i.EPSILON = -2, i.MIN_USER_TOKEN_TYPE = 1, i.EOF = -1, i.DEFAULT_CHANNEL = 0, i.HIDDEN_CHANNEL = 1;
const o = Math.round(Math.random() * Math.pow(2, 32));
function a(t2) {
  if (!t2) return 0;
  const e2 = typeof t2, n2 = "string" === e2 ? t2 : !("object" !== e2 || !t2.toString) && t2.toString();
  if (!n2) return 0;
  let s2, i2;
  const r2 = 3 & n2.length, a2 = n2.length - r2;
  let l2 = o;
  const h2 = 3432918353, c2 = 461845907;
  let u2 = 0;
  for (; u2 < a2; ) i2 = 255 & n2.charCodeAt(u2) | (255 & n2.charCodeAt(++u2)) << 8 | (255 & n2.charCodeAt(++u2)) << 16 | (255 & n2.charCodeAt(++u2)) << 24, ++u2, i2 = (65535 & i2) * h2 + (((i2 >>> 16) * h2 & 65535) << 16) & 4294967295, i2 = i2 << 15 | i2 >>> 17, i2 = (65535 & i2) * c2 + (((i2 >>> 16) * c2 & 65535) << 16) & 4294967295, l2 ^= i2, l2 = l2 << 13 | l2 >>> 19, s2 = 5 * (65535 & l2) + ((5 * (l2 >>> 16) & 65535) << 16) & 4294967295, l2 = 27492 + (65535 & s2) + ((58964 + (s2 >>> 16) & 65535) << 16);
  switch (i2 = 0, r2) {
    case 3:
      i2 ^= (255 & n2.charCodeAt(u2 + 2)) << 16;
    case 2:
      i2 ^= (255 & n2.charCodeAt(u2 + 1)) << 8;
    case 1:
      i2 ^= 255 & n2.charCodeAt(u2), i2 = (65535 & i2) * h2 + (((i2 >>> 16) * h2 & 65535) << 16) & 4294967295, i2 = i2 << 15 | i2 >>> 17, i2 = (65535 & i2) * c2 + (((i2 >>> 16) * c2 & 65535) << 16) & 4294967295, l2 ^= i2;
  }
  return l2 ^= n2.length, l2 ^= l2 >>> 16, l2 = 2246822507 * (65535 & l2) + ((2246822507 * (l2 >>> 16) & 65535) << 16) & 4294967295, l2 ^= l2 >>> 13, l2 = 3266489909 * (65535 & l2) + ((3266489909 * (l2 >>> 16) & 65535) << 16) & 4294967295, l2 ^= l2 >>> 16, l2 >>> 0;
}
class l {
  constructor() {
    this.count = 0, this.hash = 0;
  }
  update() {
    for (let t2 = 0; t2 < arguments.length; t2++) {
      const e2 = arguments[t2];
      if (null != e2) if (Array.isArray(e2)) this.update.apply(this, e2);
      else {
        let t3 = 0;
        switch (typeof e2) {
          case "undefined":
          case "function":
            continue;
          case "number":
          case "boolean":
            t3 = e2;
            break;
          case "string":
            t3 = a(e2);
            break;
          default:
            e2.updateHashCode ? e2.updateHashCode(this) : console.log("No updateHashCode for " + e2.toString());
            continue;
        }
        t3 *= 3432918353, t3 = t3 << 15 | t3 >>> 17, t3 *= 461845907, this.count = this.count + 1;
        let n2 = this.hash ^ t3;
        n2 = n2 << 13 | n2 >>> 19, n2 = 5 * n2 + 3864292196, this.hash = n2;
      }
    }
  }
  finish() {
    let t2 = this.hash ^ 4 * this.count;
    return t2 ^= t2 >>> 16, t2 *= 2246822507, t2 ^= t2 >>> 13, t2 *= 3266489909, t2 ^= t2 >>> 16, t2;
  }
  static hashStuff() {
    const t2 = new l();
    return t2.update.apply(t2, arguments), t2.finish();
  }
}
function h(t2) {
  return t2 ? "string" == typeof t2 ? a(t2) : t2.hashCode() : -1;
}
function c(t2, e2) {
  return t2 && t2.equals ? t2.equals(e2) : t2 === e2;
}
function u(t2) {
  return null === t2 ? "null" : t2;
}
function d(t2) {
  return Array.isArray(t2) ? "[" + t2.map(u).join(", ") + "]" : "null";
}
class g {
  constructor(t2, e2) {
    this.buckets = new Array(16), this.threshold = Math.floor(12), this.itemCount = 0, this.hashFunction = t2 || h, this.equalsFunction = e2 || c;
  }
  get(t2) {
    if (null == t2) return t2;
    const e2 = this._getBucket(t2);
    if (!e2) return null;
    for (const n2 of e2) if (this.equalsFunction(n2, t2)) return n2;
    return null;
  }
  add(t2) {
    return this.getOrAdd(t2) === t2;
  }
  getOrAdd(t2) {
    this._expand();
    const e2 = this._getSlot(t2);
    let n2 = this.buckets[e2];
    if (!n2) return n2 = [t2], this.buckets[e2] = n2, this.itemCount++, t2;
    for (const e3 of n2) if (this.equalsFunction(e3, t2)) return e3;
    return n2.push(t2), this.itemCount++, t2;
  }
  has(t2) {
    return null != this.get(t2);
  }
  values() {
    return this.buckets.filter((t2) => null != t2).flat(1);
  }
  toString() {
    return d(this.values());
  }
  get length() {
    return this.itemCount;
  }
  _getSlot(t2) {
    return this.hashFunction(t2) & this.buckets.length - 1;
  }
  _getBucket(t2) {
    return this.buckets[this._getSlot(t2)];
  }
  _expand() {
    if (this.itemCount <= this.threshold) return;
    const t2 = this.buckets, e2 = 2 * this.buckets.length;
    this.buckets = new Array(e2), this.threshold = Math.floor(0.75 * e2);
    for (const e3 of t2) if (e3) for (const t3 of e3) {
      const e4 = this._getSlot(t3);
      let n2 = this.buckets[e4];
      n2 || (n2 = [], this.buckets[e4] = n2), n2.push(t3);
    }
  }
}
class p {
  hashCode() {
    const t2 = new l();
    return this.updateHashCode(t2), t2.finish();
  }
  evaluate(t2, e2) {
  }
  evalPrecedence(t2, e2) {
    return this;
  }
  static andContext(t2, e2) {
    if (null === t2 || t2 === p.NONE) return e2;
    if (null === e2 || e2 === p.NONE) return t2;
    const n2 = new f(t2, e2);
    return 1 === n2.opnds.length ? n2.opnds[0] : n2;
  }
  static orContext(t2, e2) {
    if (null === t2) return e2;
    if (null === e2) return t2;
    if (t2 === p.NONE || e2 === p.NONE) return p.NONE;
    const n2 = new x(t2, e2);
    return 1 === n2.opnds.length ? n2.opnds[0] : n2;
  }
}
class f extends p {
  constructor(t2, e2) {
    super();
    const n2 = new g();
    t2 instanceof f ? t2.opnds.map(function(t3) {
      n2.add(t3);
    }) : n2.add(t2), e2 instanceof f ? e2.opnds.map(function(t3) {
      n2.add(t3);
    }) : n2.add(e2);
    const s2 = T(n2);
    if (s2.length > 0) {
      let t3 = null;
      s2.map(function(e3) {
        (null === t3 || e3.precedence < t3.precedence) && (t3 = e3);
      }), n2.add(t3);
    }
    this.opnds = Array.from(n2.values());
  }
  equals(t2) {
    return this === t2 || t2 instanceof f && r(this.opnds, t2.opnds);
  }
  updateHashCode(t2) {
    t2.update(this.opnds, "AND");
  }
  evaluate(t2, e2) {
    for (let n2 = 0; n2 < this.opnds.length; n2++) if (!this.opnds[n2].evaluate(t2, e2)) return false;
    return true;
  }
  evalPrecedence(t2, e2) {
    let n2 = false;
    const s2 = [];
    for (let i3 = 0; i3 < this.opnds.length; i3++) {
      const r2 = this.opnds[i3], o2 = r2.evalPrecedence(t2, e2);
      if (n2 |= o2 !== r2, null === o2) return null;
      o2 !== p.NONE && s2.push(o2);
    }
    if (!n2) return this;
    if (0 === s2.length) return p.NONE;
    let i2 = null;
    return s2.map(function(t3) {
      i2 = null === i2 ? t3 : p.andContext(i2, t3);
    }), i2;
  }
  toString() {
    const t2 = this.opnds.map((t3) => t3.toString());
    return (t2.length > 3 ? t2.slice(3) : t2).join("&&");
  }
}
class x extends p {
  constructor(t2, e2) {
    super();
    const n2 = new g();
    t2 instanceof x ? t2.opnds.map(function(t3) {
      n2.add(t3);
    }) : n2.add(t2), e2 instanceof x ? e2.opnds.map(function(t3) {
      n2.add(t3);
    }) : n2.add(e2);
    const s2 = T(n2);
    if (s2.length > 0) {
      const t3 = s2.sort(function(t4, e4) {
        return t4.compareTo(e4);
      }), e3 = t3[t3.length - 1];
      n2.add(e3);
    }
    this.opnds = Array.from(n2.values());
  }
  equals(t2) {
    return this === t2 || t2 instanceof x && r(this.opnds, t2.opnds);
  }
  updateHashCode(t2) {
    t2.update(this.opnds, "OR");
  }
  evaluate(t2, e2) {
    for (let n2 = 0; n2 < this.opnds.length; n2++) if (this.opnds[n2].evaluate(t2, e2)) return true;
    return false;
  }
  evalPrecedence(t2, e2) {
    let n2 = false;
    const s2 = [];
    for (let i2 = 0; i2 < this.opnds.length; i2++) {
      const r2 = this.opnds[i2], o2 = r2.evalPrecedence(t2, e2);
      if (n2 |= o2 !== r2, o2 === p.NONE) return p.NONE;
      null !== o2 && s2.push(o2);
    }
    if (!n2) return this;
    if (0 === s2.length) return null;
    return null;
  }
  toString() {
    const t2 = this.opnds.map((t3) => t3.toString());
    return (t2.length > 3 ? t2.slice(3) : t2).join("||");
  }
}
function T(t2) {
  const e2 = [];
  return t2.values().map(function(t3) {
    t3 instanceof p.PrecedencePredicate && e2.push(t3);
  }), e2;
}
function S(t2, e2) {
  if (null === t2) {
    const t3 = { state: null, alt: null, context: null, semanticContext: null };
    return e2 && (t3.reachesIntoOuterContext = 0), t3;
  }
  {
    const n2 = {};
    return n2.state = t2.state || null, n2.alt = void 0 === t2.alt ? null : t2.alt, n2.context = t2.context || null, n2.semanticContext = t2.semanticContext || null, e2 && (n2.reachesIntoOuterContext = t2.reachesIntoOuterContext || 0, n2.precedenceFilterSuppressed = t2.precedenceFilterSuppressed || false), n2;
  }
}
class m {
  constructor(t2, e2) {
    this.checkContext(t2, e2), t2 = S(t2), e2 = S(e2, true), this.state = null !== t2.state ? t2.state : e2.state, this.alt = null !== t2.alt ? t2.alt : e2.alt, this.context = null !== t2.context ? t2.context : e2.context, this.semanticContext = null !== t2.semanticContext ? t2.semanticContext : null !== e2.semanticContext ? e2.semanticContext : p.NONE, this.reachesIntoOuterContext = e2.reachesIntoOuterContext, this.precedenceFilterSuppressed = e2.precedenceFilterSuppressed;
  }
  checkContext(t2, e2) {
    null !== t2.context && void 0 !== t2.context || null !== e2 && null !== e2.context && void 0 !== e2.context || (this.context = null);
  }
  hashCode() {
    const t2 = new l();
    return this.updateHashCode(t2), t2.finish();
  }
  updateHashCode(t2) {
    t2.update(this.state.stateNumber, this.alt, this.context, this.semanticContext);
  }
  equals(t2) {
    return this === t2 || t2 instanceof m && this.state.stateNumber === t2.state.stateNumber && this.alt === t2.alt && (null === this.context ? null === t2.context : this.context.equals(t2.context)) && this.semanticContext.equals(t2.semanticContext) && this.precedenceFilterSuppressed === t2.precedenceFilterSuppressed;
  }
  hashCodeForConfigSet() {
    const t2 = new l();
    return t2.update(this.state.stateNumber, this.alt, this.semanticContext), t2.finish();
  }
  equalsForConfigSet(t2) {
    return this === t2 || t2 instanceof m && this.state.stateNumber === t2.state.stateNumber && this.alt === t2.alt && this.semanticContext.equals(t2.semanticContext);
  }
  toString() {
    return "(" + this.state + "," + this.alt + (null !== this.context ? ",[" + this.context.toString() + "]" : "") + (this.semanticContext !== p.NONE ? "," + this.semanticContext.toString() : "") + (this.reachesIntoOuterContext > 0 ? ",up=" + this.reachesIntoOuterContext : "") + ")";
  }
}
class E {
  constructor(t2, e2) {
    this.start = t2, this.stop = e2;
  }
  clone() {
    return new E(this.start, this.stop);
  }
  contains(t2) {
    return t2 >= this.start && t2 < this.stop;
  }
  toString() {
    return this.start === this.stop - 1 ? this.start.toString() : this.start.toString() + ".." + (this.stop - 1).toString();
  }
  get length() {
    return this.stop - this.start;
  }
}
E.INVALID_INTERVAL = new E(-1, -2);
class _ {
  constructor() {
    this.intervals = null, this.readOnly = false;
  }
  first(t2) {
    return null === this.intervals || 0 === this.intervals.length ? i.INVALID_TYPE : this.intervals[0].start;
  }
  addOne(t2) {
    this.addInterval(new E(t2, t2 + 1));
  }
  addRange(t2, e2) {
    this.addInterval(new E(t2, e2 + 1));
  }
  addInterval(t2) {
    if (null === this.intervals) this.intervals = [], this.intervals.push(t2.clone());
    else {
      for (let e2 = 0; e2 < this.intervals.length; e2++) {
        const n2 = this.intervals[e2];
        if (t2.stop < n2.start) return void this.intervals.splice(e2, 0, t2);
        if (t2.stop === n2.start) return void (this.intervals[e2] = new E(t2.start, n2.stop));
        if (t2.start <= n2.stop) return this.intervals[e2] = new E(Math.min(n2.start, t2.start), Math.max(n2.stop, t2.stop)), void this.reduce(e2);
      }
      this.intervals.push(t2.clone());
    }
  }
  addSet(t2) {
    return null !== t2.intervals && t2.intervals.forEach((t3) => this.addInterval(t3), this), this;
  }
  reduce(t2) {
    if (t2 < this.intervals.length - 1) {
      const e2 = this.intervals[t2], n2 = this.intervals[t2 + 1];
      e2.stop >= n2.stop ? (this.intervals.splice(t2 + 1, 1), this.reduce(t2)) : e2.stop >= n2.start && (this.intervals[t2] = new E(e2.start, n2.stop), this.intervals.splice(t2 + 1, 1));
    }
  }
  complement(t2, e2) {
    const n2 = new _();
    return n2.addInterval(new E(t2, e2 + 1)), null !== this.intervals && this.intervals.forEach((t3) => n2.removeRange(t3)), n2;
  }
  contains(t2) {
    if (null === this.intervals) return false;
    for (let e2 = 0; e2 < this.intervals.length; e2++) if (this.intervals[e2].contains(t2)) return true;
    return false;
  }
  removeRange(t2) {
    if (t2.start === t2.stop - 1) this.removeOne(t2.start);
    else if (null !== this.intervals) {
      let e2 = 0;
      for (let n2 = 0; n2 < this.intervals.length; n2++) {
        const n3 = this.intervals[e2];
        if (t2.stop <= n3.start) return;
        if (t2.start > n3.start && t2.stop < n3.stop) {
          this.intervals[e2] = new E(n3.start, t2.start);
          const s2 = new E(t2.stop, n3.stop);
          return void this.intervals.splice(e2, 0, s2);
        }
        t2.start <= n3.start && t2.stop >= n3.stop ? (this.intervals.splice(e2, 1), e2 -= 1) : t2.start < n3.stop ? this.intervals[e2] = new E(n3.start, t2.start) : t2.stop < n3.stop && (this.intervals[e2] = new E(t2.stop, n3.stop)), e2 += 1;
      }
    }
  }
  removeOne(t2) {
    if (null !== this.intervals) for (let e2 = 0; e2 < this.intervals.length; e2++) {
      const n2 = this.intervals[e2];
      if (t2 < n2.start) return;
      if (t2 === n2.start && t2 === n2.stop - 1) return void this.intervals.splice(e2, 1);
      if (t2 === n2.start) return void (this.intervals[e2] = new E(n2.start + 1, n2.stop));
      if (t2 === n2.stop - 1) return void (this.intervals[e2] = new E(n2.start, n2.stop - 1));
      if (t2 < n2.stop - 1) {
        const s2 = new E(n2.start, t2);
        return n2.start = t2 + 1, void this.intervals.splice(e2, 0, s2);
      }
    }
  }
  toString(t2, e2, n2) {
    return t2 = t2 || null, e2 = e2 || null, n2 = n2 || false, null === this.intervals ? "{}" : null !== t2 || null !== e2 ? this.toTokenString(t2, e2) : n2 ? this.toCharString() : this.toIndexString();
  }
  toCharString() {
    const t2 = [];
    for (let e2 = 0; e2 < this.intervals.length; e2++) {
      const n2 = this.intervals[e2];
      n2.stop === n2.start + 1 ? n2.start === i.EOF ? t2.push("<EOF>") : t2.push("'" + String.fromCharCode(n2.start) + "'") : t2.push("'" + String.fromCharCode(n2.start) + "'..'" + String.fromCharCode(n2.stop - 1) + "'");
    }
    return t2.length > 1 ? "{" + t2.join(", ") + "}" : t2[0];
  }
  toIndexString() {
    const t2 = [];
    for (let e2 = 0; e2 < this.intervals.length; e2++) {
      const n2 = this.intervals[e2];
      n2.stop === n2.start + 1 ? n2.start === i.EOF ? t2.push("<EOF>") : t2.push(n2.start.toString()) : t2.push(n2.start.toString() + ".." + (n2.stop - 1).toString());
    }
    return t2.length > 1 ? "{" + t2.join(", ") + "}" : t2[0];
  }
  toTokenString(t2, e2) {
    const n2 = [];
    for (let s2 = 0; s2 < this.intervals.length; s2++) {
      const i2 = this.intervals[s2];
      for (let s3 = i2.start; s3 < i2.stop; s3++) n2.push(this.elementName(t2, e2, s3));
    }
    return n2.length > 1 ? "{" + n2.join(", ") + "}" : n2[0];
  }
  elementName(t2, e2, n2) {
    return n2 === i.EOF ? "<EOF>" : n2 === i.EPSILON ? "<EPSILON>" : t2[n2] || e2[n2];
  }
  get length() {
    return this.intervals.map((t2) => t2.length).reduce((t2, e2) => t2 + e2);
  }
}
class C {
  constructor() {
    this.atn = null, this.stateNumber = C.INVALID_STATE_NUMBER, this.stateType = null, this.ruleIndex = 0, this.epsilonOnlyTransitions = false, this.transitions = [], this.nextTokenWithinRule = null;
  }
  toString() {
    return this.stateNumber;
  }
  equals(t2) {
    return t2 instanceof C && this.stateNumber === t2.stateNumber;
  }
  isNonGreedyExitState() {
    return false;
  }
  addTransition(t2, e2) {
    void 0 === e2 && (e2 = -1), 0 === this.transitions.length ? this.epsilonOnlyTransitions = t2.isEpsilon : this.epsilonOnlyTransitions !== t2.isEpsilon && (this.epsilonOnlyTransitions = false), -1 === e2 ? this.transitions.push(t2) : this.transitions.splice(e2, 1, t2);
  }
}
C.INVALID_TYPE = 0, C.BASIC = 1, C.RULE_START = 2, C.BLOCK_START = 3, C.PLUS_BLOCK_START = 4, C.STAR_BLOCK_START = 5, C.TOKEN_START = 6, C.RULE_STOP = 7, C.BLOCK_END = 8, C.STAR_LOOP_BACK = 9, C.STAR_LOOP_ENTRY = 10, C.PLUS_LOOP_BACK = 11, C.LOOP_END = 12, C.serializationNames = ["INVALID", "BASIC", "RULE_START", "BLOCK_START", "PLUS_BLOCK_START", "STAR_BLOCK_START", "TOKEN_START", "RULE_STOP", "BLOCK_END", "STAR_LOOP_BACK", "STAR_LOOP_ENTRY", "PLUS_LOOP_BACK", "LOOP_END"], C.INVALID_STATE_NUMBER = -1;
class A extends C {
  constructor() {
    return super(), this.stateType = C.RULE_STOP, this;
  }
}
class N {
  constructor(t2) {
    if (null == t2) throw "target cannot be null.";
    this.target = t2, this.isEpsilon = false, this.label = null;
  }
}
N.EPSILON = 1, N.RANGE = 2, N.RULE = 3, N.PREDICATE = 4, N.ATOM = 5, N.ACTION = 6, N.SET = 7, N.NOT_SET = 8, N.WILDCARD = 9, N.PRECEDENCE = 10, N.serializationNames = ["INVALID", "EPSILON", "RANGE", "RULE", "PREDICATE", "ATOM", "ACTION", "SET", "NOT_SET", "WILDCARD", "PRECEDENCE"], N.serializationTypes = { EpsilonTransition: N.EPSILON, RangeTransition: N.RANGE, RuleTransition: N.RULE, PredicateTransition: N.PREDICATE, AtomTransition: N.ATOM, ActionTransition: N.ACTION, SetTransition: N.SET, NotSetTransition: N.NOT_SET, WildcardTransition: N.WILDCARD, PrecedencePredicateTransition: N.PRECEDENCE };
class k extends N {
  constructor(t2, e2, n2, s2) {
    super(t2), this.ruleIndex = e2, this.precedence = n2, this.followState = s2, this.serializationType = N.RULE, this.isEpsilon = true;
  }
  matches(t2, e2, n2) {
    return false;
  }
}
class I extends N {
  constructor(t2, e2) {
    super(t2), this.serializationType = N.SET, null != e2 ? this.label = e2 : (this.label = new _(), this.label.addOne(i.INVALID_TYPE));
  }
  matches(t2, e2, n2) {
    return this.label.contains(t2);
  }
  toString() {
    return this.label.toString();
  }
}
class y extends I {
  constructor(t2, e2) {
    super(t2, e2), this.serializationType = N.NOT_SET;
  }
  matches(t2, e2, n2) {
    return t2 >= e2 && t2 <= n2 && !super.matches(t2, e2, n2);
  }
  toString() {
    return "~" + super.toString();
  }
}
class L extends N {
  constructor(t2) {
    super(t2), this.serializationType = N.WILDCARD;
  }
  matches(t2, e2, n2) {
    return t2 >= e2 && t2 <= n2;
  }
  toString() {
    return ".";
  }
}
class O extends N {
  constructor(t2) {
    super(t2);
  }
}
class R {
}
class w extends R {
}
class v extends w {
}
class P extends v {
  get ruleContext() {
    throw new Error("missing interface implementation");
  }
}
class b extends v {
}
class D extends b {
}
const F = { toStringTree: function(t2, e2, n2) {
  e2 = e2 || null, null !== (n2 = n2 || null) && (e2 = n2.ruleNames);
  let s2 = F.getNodeText(t2, e2);
  s2 = function(t3) {
    return t3 = t3.replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
  }(s2);
  const i2 = t2.getChildCount();
  if (0 === i2) return s2;
  let r2 = "(" + s2 + " ";
  i2 > 0 && (s2 = F.toStringTree(t2.getChild(0), e2), r2 = r2.concat(s2));
  for (let n3 = 1; n3 < i2; n3++) s2 = F.toStringTree(t2.getChild(n3), e2), r2 = r2.concat(" " + s2);
  return r2 = r2.concat(")"), r2;
}, getNodeText: function(t2, e2, n2) {
  if (e2 = e2 || null, null !== (n2 = n2 || null) && (e2 = n2.ruleNames), null !== e2) {
    if (t2 instanceof P) {
      const n3 = t2.ruleContext.getAltNumber();
      return 0 != n3 ? e2[t2.ruleIndex] + ":" + n3 : e2[t2.ruleIndex];
    }
    if (t2 instanceof D) return t2.toString();
    if (t2 instanceof b && null !== t2.symbol) return t2.symbol.text;
  }
  const s2 = t2.getPayload();
  return s2 instanceof i ? s2.text : t2.getPayload().toString();
}, getChildren: function(t2) {
  const e2 = [];
  for (let n2 = 0; n2 < t2.getChildCount(); n2++) e2.push(t2.getChild(n2));
  return e2;
}, getAncestors: function(t2) {
  let e2 = [];
  for (t2 = t2.getParent(); null !== t2; ) e2 = [t2].concat(e2), t2 = t2.getParent();
  return e2;
}, findAllTokenNodes: function(t2, e2) {
  return F.findAllNodes(t2, e2, true);
}, findAllRuleNodes: function(t2, e2) {
  return F.findAllNodes(t2, e2, false);
}, findAllNodes: function(t2, e2, n2) {
  const s2 = [];
  return F._findAllNodes(t2, e2, n2, s2), s2;
}, _findAllNodes: function(t2, e2, n2, s2) {
  n2 && t2 instanceof b ? t2.symbol.type === e2 && s2.push(t2) : !n2 && t2 instanceof P && t2.ruleIndex === e2 && s2.push(t2);
  for (let i2 = 0; i2 < t2.getChildCount(); i2++) F._findAllNodes(t2.getChild(i2), e2, n2, s2);
}, descendants: function(t2) {
  let e2 = [t2];
  for (let n2 = 0; n2 < t2.getChildCount(); n2++) e2 = e2.concat(F.descendants(t2.getChild(n2)));
  return e2;
} }, M = F;
class U extends P {
  constructor(t2, e2) {
    super(), this.parentCtx = t2 || null, this.invokingState = e2 || -1;
  }
  depth() {
    let t2 = 0, e2 = this;
    for (; null !== e2; ) e2 = e2.parentCtx, t2 += 1;
    return t2;
  }
  isEmpty() {
    return -1 === this.invokingState;
  }
  getSourceInterval() {
    return E.INVALID_INTERVAL;
  }
  get ruleContext() {
    return this;
  }
  getPayload() {
    return this;
  }
  getText() {
    return 0 === this.getChildCount() ? "" : this.children.map(function(t2) {
      return t2.getText();
    }).join("");
  }
  getAltNumber() {
    return 0;
  }
  setAltNumber(t2) {
  }
  getChild(t2) {
    return null;
  }
  getChildCount() {
    return 0;
  }
  accept(t2) {
    return t2.visitChildren(this);
  }
  toStringTree(t2, e2) {
    return M.toStringTree(this, t2, e2);
  }
  toString(t2, e2) {
    t2 = t2 || null, e2 = e2 || null;
    let n2 = this, s2 = "[";
    for (; null !== n2 && n2 !== e2; ) {
      if (null === t2) n2.isEmpty() || (s2 += n2.invokingState);
      else {
        const e3 = n2.ruleIndex;
        s2 += e3 >= 0 && e3 < t2.length ? t2[e3] : "" + e3;
      }
      null === n2.parentCtx || null === t2 && n2.parentCtx.isEmpty() || (s2 += " "), n2 = n2.parentCtx;
    }
    return s2 += "]", s2;
  }
}
class B {
  constructor(t2) {
    this.cachedHashCode = t2;
  }
  isEmpty() {
    return this === B.EMPTY;
  }
  hasEmptyPath() {
    return this.getReturnState(this.length - 1) === B.EMPTY_RETURN_STATE;
  }
  hashCode() {
    return this.cachedHashCode;
  }
  updateHashCode(t2) {
    t2.update(this.cachedHashCode);
  }
}
B.EMPTY = null, B.EMPTY_RETURN_STATE = 2147483647, B.globalNodeCount = 1, B.id = B.globalNodeCount, B.trace_atn_sim = false;
class z extends B {
  constructor(t2, e2) {
    const n2 = new l();
    return n2.update(t2, e2), super(n2.finish()), this.parents = t2, this.returnStates = e2, this;
  }
  isEmpty() {
    return this.returnStates[0] === B.EMPTY_RETURN_STATE;
  }
  getParent(t2) {
    return this.parents[t2];
  }
  getReturnState(t2) {
    return this.returnStates[t2];
  }
  equals(t2) {
    return this === t2 || t2 instanceof z && this.hashCode() === t2.hashCode() && r(this.returnStates, t2.returnStates) && r(this.parents, t2.parents);
  }
  toString() {
    if (this.isEmpty()) return "[]";
    {
      let t2 = "[";
      for (let e2 = 0; e2 < this.returnStates.length; e2++) e2 > 0 && (t2 += ", "), this.returnStates[e2] !== B.EMPTY_RETURN_STATE ? (t2 += this.returnStates[e2], null !== this.parents[e2] ? t2 = t2 + " " + this.parents[e2] : t2 += "null") : t2 += "$";
      return t2 + "]";
    }
  }
  get length() {
    return this.returnStates.length;
  }
}
class V extends B {
  constructor(t2, e2) {
    let n2 = 0;
    const s2 = new l();
    null !== t2 ? s2.update(t2, e2) : s2.update(1), n2 = s2.finish(), super(n2), this.parentCtx = t2, this.returnState = e2;
  }
  getParent(t2) {
    return this.parentCtx;
  }
  getReturnState(t2) {
    return this.returnState;
  }
  equals(t2) {
    return this === t2 || t2 instanceof V && this.hashCode() === t2.hashCode() && this.returnState === t2.returnState && (null == this.parentCtx ? null == t2.parentCtx : this.parentCtx.equals(t2.parentCtx));
  }
  toString() {
    const t2 = null === this.parentCtx ? "" : this.parentCtx.toString();
    return 0 === t2.length ? this.returnState === B.EMPTY_RETURN_STATE ? "$" : "" + this.returnState : this.returnState + " " + t2;
  }
  get length() {
    return 1;
  }
  static create(t2, e2) {
    return e2 === B.EMPTY_RETURN_STATE && null === t2 ? B.EMPTY : new V(t2, e2);
  }
}
class q extends V {
  constructor() {
    super(null, B.EMPTY_RETURN_STATE);
  }
  isEmpty() {
    return true;
  }
  getParent(t2) {
    return null;
  }
  getReturnState(t2) {
    return this.returnState;
  }
  equals(t2) {
    return this === t2;
  }
  toString() {
    return "$";
  }
}
B.EMPTY = new q();
class H {
  constructor(t2, e2) {
    this.buckets = new Array(16), this.threshold = Math.floor(12), this.itemCount = 0, this.hashFunction = t2 || h, this.equalsFunction = e2 || c;
  }
  set(t2, e2) {
    this._expand();
    const n2 = this._getSlot(t2);
    let s2 = this.buckets[n2];
    if (!s2) return s2 = [[t2, e2]], this.buckets[n2] = s2, this.itemCount++, e2;
    const i2 = s2.find((e3) => this.equalsFunction(e3[0], t2), this);
    if (i2) {
      const t3 = i2[1];
      return i2[1] = e2, t3;
    }
    return s2.push([t2, e2]), this.itemCount++, e2;
  }
  containsKey(t2) {
    const e2 = this._getBucket(t2);
    return !!e2 && !!e2.find((e3) => this.equalsFunction(e3[0], t2), this);
  }
  get(t2) {
    const e2 = this._getBucket(t2);
    if (!e2) return null;
    const n2 = e2.find((e3) => this.equalsFunction(e3[0], t2), this);
    return n2 ? n2[1] : null;
  }
  entries() {
    return this.buckets.filter((t2) => null != t2).flat(1);
  }
  getKeys() {
    return this.entries().map((t2) => t2[0]);
  }
  getValues() {
    return this.entries().map((t2) => t2[1]);
  }
  toString() {
    return "[" + this.entries().map((t2) => "{" + t2[0] + ":" + t2[1] + "}").join(", ") + "]";
  }
  get length() {
    return this.itemCount;
  }
  _getSlot(t2) {
    return this.hashFunction(t2) & this.buckets.length - 1;
  }
  _getBucket(t2) {
    return this.buckets[this._getSlot(t2)];
  }
  _expand() {
    if (this.itemCount <= this.threshold) return;
    const t2 = this.buckets, e2 = 2 * this.buckets.length;
    this.buckets = new Array(e2), this.threshold = Math.floor(0.75 * e2);
    for (const e3 of t2) if (e3) for (const t3 of e3) {
      const e4 = this._getSlot(t3[0]);
      let n2 = this.buckets[e4];
      n2 || (n2 = [], this.buckets[e4] = n2), n2.push(t3);
    }
  }
}
function K(t2, e2) {
  if (null == e2 && (e2 = U.EMPTY), null === e2.parentCtx || e2 === U.EMPTY) return B.EMPTY;
  const n2 = K(t2, e2.parentCtx), s2 = t2.states[e2.invokingState].transitions[0];
  return V.create(n2, s2.followState.stateNumber);
}
function Y(t2, e2, n2) {
  if (t2.isEmpty()) return t2;
  let s2 = n2.get(t2) || null;
  if (null !== s2) return s2;
  if (s2 = e2.get(t2), null !== s2) return n2.set(t2, s2), s2;
  let i2 = false, r2 = [];
  for (let s3 = 0; s3 < r2.length; s3++) {
    const o3 = Y(t2.getParent(s3), e2, n2);
    if (i2 || o3 !== t2.getParent(s3)) {
      if (!i2) {
        r2 = [];
        for (let e3 = 0; e3 < t2.length; e3++) r2[e3] = t2.getParent(e3);
        i2 = true;
      }
      r2[s3] = o3;
    }
  }
  if (!i2) return e2.add(t2), n2.set(t2, t2), t2;
  let o2 = null;
  return o2 = 0 === r2.length ? B.EMPTY : 1 === r2.length ? V.create(r2[0], t2.getReturnState(0)) : new z(r2, t2.returnStates), e2.add(o2), n2.set(o2, o2), n2.set(t2, o2), o2;
}
function G(t2, e2, n2, s2) {
  if (t2 === e2) return t2;
  if (t2 instanceof V && e2 instanceof V) return function(t3, e3, n3, s3) {
    if (null !== s3) {
      let n4 = s3.get(t3, e3);
      if (null !== n4) return n4;
      if (n4 = s3.get(e3, t3), null !== n4) return n4;
    }
    const i2 = function(t4, e4, n4) {
      if (n4) {
        if (t4 === B.EMPTY) return B.EMPTY;
        if (e4 === B.EMPTY) return B.EMPTY;
      } else {
        if (t4 === B.EMPTY && e4 === B.EMPTY) return B.EMPTY;
        if (t4 === B.EMPTY) {
          const t5 = [e4.returnState, B.EMPTY_RETURN_STATE], n5 = [e4.parentCtx, null];
          return new z(n5, t5);
        }
        if (e4 === B.EMPTY) {
          const e5 = [t4.returnState, B.EMPTY_RETURN_STATE], n5 = [t4.parentCtx, null];
          return new z(n5, e5);
        }
      }
      return null;
    }(t3, e3, n3);
    if (null !== i2) return null !== s3 && s3.set(t3, e3, i2), i2;
    if (t3.returnState === e3.returnState) {
      const i3 = G(t3.parentCtx, e3.parentCtx, n3, s3);
      if (i3 === t3.parentCtx) return t3;
      if (i3 === e3.parentCtx) return e3;
      const r2 = V.create(i3, t3.returnState);
      return null !== s3 && s3.set(t3, e3, r2), r2;
    }
    {
      let n4 = null;
      if ((t3 === e3 || null !== t3.parentCtx && t3.parentCtx === e3.parentCtx) && (n4 = t3.parentCtx), null !== n4) {
        const i4 = [t3.returnState, e3.returnState];
        t3.returnState > e3.returnState && (i4[0] = e3.returnState, i4[1] = t3.returnState);
        const r3 = new z([n4, n4], i4);
        return null !== s3 && s3.set(t3, e3, r3), r3;
      }
      const i3 = [t3.returnState, e3.returnState];
      let r2 = [t3.parentCtx, e3.parentCtx];
      t3.returnState > e3.returnState && (i3[0] = e3.returnState, i3[1] = t3.returnState, r2 = [e3.parentCtx, t3.parentCtx]);
      const o2 = new z(r2, i3);
      return null !== s3 && s3.set(t3, e3, o2), o2;
    }
  }(t2, e2, n2, s2);
  if (n2) {
    if (t2 instanceof q) return t2;
    if (e2 instanceof q) return e2;
  }
  return t2 instanceof V && (t2 = new z([t2.getParent()], [t2.returnState])), e2 instanceof V && (e2 = new z([e2.getParent()], [e2.returnState])), function(t3, e3, n3, s3) {
    if (null !== s3) {
      let n4 = s3.get(t3, e3);
      if (null !== n4) return B.trace_atn_sim && console.log("mergeArrays a=" + t3 + ",b=" + e3 + " -> previous"), n4;
      if (n4 = s3.get(e3, t3), null !== n4) return B.trace_atn_sim && console.log("mergeArrays a=" + t3 + ",b=" + e3 + " -> previous"), n4;
    }
    let i2 = 0, r2 = 0, o2 = 0, a2 = new Array(t3.returnStates.length + e3.returnStates.length).fill(0), l2 = new Array(t3.returnStates.length + e3.returnStates.length).fill(null);
    for (; i2 < t3.returnStates.length && r2 < e3.returnStates.length; ) {
      const h3 = t3.parents[i2], c2 = e3.parents[r2];
      if (t3.returnStates[i2] === e3.returnStates[r2]) {
        const e4 = t3.returnStates[i2];
        e4 === B.EMPTY_RETURN_STATE && null === h3 && null === c2 || null !== h3 && null !== c2 && h3 === c2 ? (l2[o2] = h3, a2[o2] = e4) : (l2[o2] = G(h3, c2, n3, s3), a2[o2] = e4), i2 += 1, r2 += 1;
      } else t3.returnStates[i2] < e3.returnStates[r2] ? (l2[o2] = h3, a2[o2] = t3.returnStates[i2], i2 += 1) : (l2[o2] = c2, a2[o2] = e3.returnStates[r2], r2 += 1);
      o2 += 1;
    }
    if (i2 < t3.returnStates.length) for (let e4 = i2; e4 < t3.returnStates.length; e4++) l2[o2] = t3.parents[e4], a2[o2] = t3.returnStates[e4], o2 += 1;
    else for (let t4 = r2; t4 < e3.returnStates.length; t4++) l2[o2] = e3.parents[t4], a2[o2] = e3.returnStates[t4], o2 += 1;
    if (o2 < l2.length) {
      if (1 === o2) {
        const n4 = V.create(l2[0], a2[0]);
        return null !== s3 && s3.set(t3, e3, n4), n4;
      }
      l2 = l2.slice(0, o2), a2 = a2.slice(0, o2);
    }
    const h2 = new z(l2, a2);
    return h2.equals(t3) ? (null !== s3 && s3.set(t3, e3, t3), B.trace_atn_sim && console.log("mergeArrays a=" + t3 + ",b=" + e3 + " -> a"), t3) : h2.equals(e3) ? (null !== s3 && s3.set(t3, e3, e3), B.trace_atn_sim && console.log("mergeArrays a=" + t3 + ",b=" + e3 + " -> b"), e3) : (function(t4) {
      const e4 = new H();
      for (let n4 = 0; n4 < t4.length; n4++) {
        const s4 = t4[n4];
        e4.containsKey(s4) || e4.set(s4, s4);
      }
      for (let n4 = 0; n4 < t4.length; n4++) t4[n4] = e4.get(t4[n4]);
    }(l2), null !== s3 && s3.set(t3, e3, h2), B.trace_atn_sim && console.log("mergeArrays a=" + t3 + ",b=" + e3 + " -> " + h2), h2);
  }(t2, e2, n2, s2);
}
class W {
  constructor() {
    this.data = new Uint32Array(1);
  }
  set(t2) {
    W._checkIndex(t2), this._resize(t2), this.data[t2 >>> 5] |= 1 << t2 % 32;
  }
  get(t2) {
    W._checkIndex(t2);
    const e2 = t2 >>> 5;
    return !(e2 >= this.data.length || !(this.data[e2] & 1 << t2 % 32));
  }
  clear(t2) {
    W._checkIndex(t2);
    const e2 = t2 >>> 5;
    e2 < this.data.length && (this.data[e2] &= ~(1 << t2));
  }
  or(t2) {
    const e2 = Math.min(this.data.length, t2.data.length);
    for (let n2 = 0; n2 < e2; ++n2) this.data[n2] |= t2.data[n2];
    if (this.data.length < t2.data.length) {
      this._resize((t2.data.length << 5) - 1);
      const n2 = t2.data.length;
      for (let s2 = e2; s2 < n2; ++s2) this.data[s2] = t2.data[s2];
    }
  }
  values() {
    const t2 = new Array(this.length);
    let e2 = 0;
    const n2 = this.data.length;
    for (let s2 = 0; s2 < n2; ++s2) {
      let n3 = this.data[s2];
      for (; 0 !== n3; ) {
        const i2 = n3 & -n3;
        t2[e2++] = (s2 << 5) + W._bitCount(i2 - 1), n3 ^= i2;
      }
    }
    return t2;
  }
  minValue() {
    for (let t2 = 0; t2 < this.data.length; ++t2) {
      let e2 = this.data[t2];
      if (0 !== e2) {
        let n2 = 0;
        for (; !(1 & e2); ) n2++, e2 >>= 1;
        return n2 + 32 * t2;
      }
    }
    return 0;
  }
  hashCode() {
    return l.hashStuff(this.values());
  }
  equals(t2) {
    return t2 instanceof W && r(this.data, t2.data);
  }
  toString() {
    return "{" + this.values().join(", ") + "}";
  }
  get length() {
    return this.data.map((t2) => W._bitCount(t2)).reduce((t2, e2) => t2 + e2, 0);
  }
  _resize(t2) {
    const e2 = t2 + 32 >>> 5;
    if (e2 <= this.data.length) return;
    const n2 = new Uint32Array(e2);
    n2.set(this.data), n2.fill(0, this.data.length), this.data = n2;
  }
  static _checkIndex(t2) {
    if (t2 < 0) throw new RangeError("index cannot be negative");
  }
  static _bitCount(t2) {
    return t2 = (t2 = (858993459 & (t2 -= t2 >> 1 & 1431655765)) + (t2 >> 2 & 858993459)) + (t2 >> 4) & 252645135, t2 += t2 >> 8, 0 + (t2 += t2 >> 16) & 63;
  }
}
class j {
  constructor(t2) {
    this.atn = t2;
  }
  getDecisionLookahead(t2) {
    if (null === t2) return null;
    const e2 = t2.transitions.length, n2 = [];
    for (let s2 = 0; s2 < e2; s2++) {
      n2[s2] = new _();
      const e3 = new g(), i2 = false;
      this._LOOK(t2.transition(s2).target, null, B.EMPTY, n2[s2], e3, new W(), i2, false), (0 === n2[s2].length || n2[s2].contains(j.HIT_PRED)) && (n2[s2] = null);
    }
    return n2;
  }
  LOOK(t2, e2, n2) {
    const s2 = new _(), i2 = null !== (n2 = n2 || null) ? K(t2.atn, n2) : null;
    return this._LOOK(t2, e2, i2, s2, new g(), new W(), true, true), s2;
  }
  _LOOK(t2, e2, n2, s2, r2, o2, a2, l2) {
    const h2 = new m({ state: t2, alt: 0, context: n2 }, null);
    if (!r2.has(h2)) {
      if (r2.add(h2), t2 === e2) {
        if (null === n2) return void s2.addOne(i.EPSILON);
        if (n2.isEmpty() && l2) return void s2.addOne(i.EOF);
      }
      if (t2 instanceof A) {
        if (null === n2) return void s2.addOne(i.EPSILON);
        if (n2.isEmpty() && l2) return void s2.addOne(i.EOF);
        if (n2 !== B.EMPTY) {
          const i2 = o2.get(t2.ruleIndex);
          try {
            o2.clear(t2.ruleIndex);
            for (let t3 = 0; t3 < n2.length; t3++) {
              const i3 = this.atn.states[n2.getReturnState(t3)];
              this._LOOK(i3, e2, n2.getParent(t3), s2, r2, o2, a2, l2);
            }
          } finally {
            i2 && o2.set(t2.ruleIndex);
          }
          return;
        }
      }
      for (let h3 = 0; h3 < t2.transitions.length; h3++) {
        const c2 = t2.transitions[h3];
        if (c2.constructor === k) {
          if (o2.get(c2.target.ruleIndex)) continue;
          const t3 = V.create(n2, c2.followState.stateNumber);
          try {
            o2.set(c2.target.ruleIndex), this._LOOK(c2.target, e2, t3, s2, r2, o2, a2, l2);
          } finally {
            o2.clear(c2.target.ruleIndex);
          }
        } else if (c2 instanceof O) a2 ? this._LOOK(c2.target, e2, n2, s2, r2, o2, a2, l2) : s2.addOne(j.HIT_PRED);
        else if (c2.isEpsilon) this._LOOK(c2.target, e2, n2, s2, r2, o2, a2, l2);
        else if (c2.constructor === L) s2.addRange(i.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType);
        else {
          let t3 = c2.label;
          null !== t3 && (c2 instanceof y && (t3 = t3.complement(i.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType)), s2.addSet(t3));
        }
      }
    }
  }
}
j.HIT_PRED = i.INVALID_TYPE;
class $ {
  constructor(t2, e2) {
    this.grammarType = t2, this.maxTokenType = e2, this.states = [], this.decisionToState = [], this.ruleToStartState = [], this.ruleToStopState = null, this.modeNameToStartState = {}, this.ruleToTokenType = null, this.lexerActions = null, this.modeToStartState = [];
  }
  nextTokensInContext(t2, e2) {
    return new j(this).LOOK(t2, null, e2);
  }
  nextTokensNoContext(t2) {
    return null !== t2.nextTokenWithinRule || (t2.nextTokenWithinRule = this.nextTokensInContext(t2, null), t2.nextTokenWithinRule.readOnly = true), t2.nextTokenWithinRule;
  }
  nextTokens(t2, e2) {
    return void 0 === e2 ? this.nextTokensNoContext(t2) : this.nextTokensInContext(t2, e2);
  }
  addState(t2) {
    null !== t2 && (t2.atn = this, t2.stateNumber = this.states.length), this.states.push(t2);
  }
  removeState(t2) {
    this.states[t2.stateNumber] = null;
  }
  defineDecisionState(t2) {
    return this.decisionToState.push(t2), t2.decision = this.decisionToState.length - 1, t2.decision;
  }
  getDecisionState(t2) {
    return 0 === this.decisionToState.length ? null : this.decisionToState[t2];
  }
  getExpectedTokens(t2, e2) {
    if (t2 < 0 || t2 >= this.states.length) throw "Invalid state number.";
    const n2 = this.states[t2];
    let s2 = this.nextTokens(n2);
    if (!s2.contains(i.EPSILON)) return s2;
    const r2 = new _();
    for (r2.addSet(s2), r2.removeOne(i.EPSILON); null !== e2 && e2.invokingState >= 0 && s2.contains(i.EPSILON); ) {
      const t3 = this.states[e2.invokingState].transitions[0];
      s2 = this.nextTokens(t3.followState), r2.addSet(s2), r2.removeOne(i.EPSILON), e2 = e2.parentCtx;
    }
    return s2.contains(i.EPSILON) && r2.addOne(i.EOF), r2;
  }
}
$.INVALID_ALT_NUMBER = 0;
class X extends C {
  constructor() {
    super(), this.stateType = C.BASIC;
  }
}
class J extends C {
  constructor() {
    return super(), this.decision = -1, this.nonGreedy = false, this;
  }
}
class Z extends J {
  constructor() {
    return super(), this.endState = null, this;
  }
}
class Q extends C {
  constructor() {
    return super(), this.stateType = C.BLOCK_END, this.startState = null, this;
  }
}
class tt extends C {
  constructor() {
    return super(), this.stateType = C.LOOP_END, this.loopBackState = null, this;
  }
}
class et extends C {
  constructor() {
    return super(), this.stateType = C.RULE_START, this.stopState = null, this.isPrecedenceRule = false, this;
  }
}
class nt extends J {
  constructor() {
    return super(), this.stateType = C.TOKEN_START, this;
  }
}
class st extends J {
  constructor() {
    return super(), this.stateType = C.PLUS_LOOP_BACK, this;
  }
}
class it extends C {
  constructor() {
    return super(), this.stateType = C.STAR_LOOP_BACK, this;
  }
}
class rt extends J {
  constructor() {
    return super(), this.stateType = C.STAR_LOOP_ENTRY, this.loopBackState = null, this.isPrecedenceDecision = null, this;
  }
}
class ot extends Z {
  constructor() {
    return super(), this.stateType = C.PLUS_BLOCK_START, this.loopBackState = null, this;
  }
}
class at extends Z {
  constructor() {
    return super(), this.stateType = C.STAR_BLOCK_START, this;
  }
}
class lt extends Z {
  constructor() {
    return super(), this.stateType = C.BLOCK_START, this;
  }
}
class ht extends N {
  constructor(t2, e2) {
    super(t2), this.label_ = e2, this.label = this.makeLabel(), this.serializationType = N.ATOM;
  }
  makeLabel() {
    const t2 = new _();
    return t2.addOne(this.label_), t2;
  }
  matches(t2, e2, n2) {
    return this.label_ === t2;
  }
  toString() {
    return this.label_;
  }
}
class ct extends N {
  constructor(t2, e2, n2) {
    super(t2), this.serializationType = N.RANGE, this.start = e2, this.stop = n2, this.label = this.makeLabel();
  }
  makeLabel() {
    const t2 = new _();
    return t2.addRange(this.start, this.stop), t2;
  }
  matches(t2, e2, n2) {
    return t2 >= this.start && t2 <= this.stop;
  }
  toString() {
    return "'" + String.fromCharCode(this.start) + "'..'" + String.fromCharCode(this.stop) + "'";
  }
}
class ut extends N {
  constructor(t2, e2, n2, s2) {
    super(t2), this.serializationType = N.ACTION, this.ruleIndex = e2, this.actionIndex = void 0 === n2 ? -1 : n2, this.isCtxDependent = void 0 !== s2 && s2, this.isEpsilon = true;
  }
  matches(t2, e2, n2) {
    return false;
  }
  toString() {
    return "action_" + this.ruleIndex + ":" + this.actionIndex;
  }
}
class dt extends N {
  constructor(t2, e2) {
    super(t2), this.serializationType = N.EPSILON, this.isEpsilon = true, this.outermostPrecedenceReturn = e2;
  }
  matches(t2, e2, n2) {
    return false;
  }
  toString() {
    return "epsilon";
  }
}
class gt extends p {
  constructor(t2, e2, n2) {
    super(), this.ruleIndex = void 0 === t2 ? -1 : t2, this.predIndex = void 0 === e2 ? -1 : e2, this.isCtxDependent = void 0 !== n2 && n2;
  }
  evaluate(t2, e2) {
    const n2 = this.isCtxDependent ? e2 : null;
    return t2.sempred(n2, this.ruleIndex, this.predIndex);
  }
  updateHashCode(t2) {
    t2.update(this.ruleIndex, this.predIndex, this.isCtxDependent);
  }
  equals(t2) {
    return this === t2 || t2 instanceof gt && this.ruleIndex === t2.ruleIndex && this.predIndex === t2.predIndex && this.isCtxDependent === t2.isCtxDependent;
  }
  toString() {
    return "{" + this.ruleIndex + ":" + this.predIndex + "}?";
  }
}
p.NONE = new gt();
class pt extends O {
  constructor(t2, e2, n2, s2) {
    super(t2), this.serializationType = N.PREDICATE, this.ruleIndex = e2, this.predIndex = n2, this.isCtxDependent = s2, this.isEpsilon = true;
  }
  matches(t2, e2, n2) {
    return false;
  }
  getPredicate() {
    return new gt(this.ruleIndex, this.predIndex, this.isCtxDependent);
  }
  toString() {
    return "pred_" + this.ruleIndex + ":" + this.predIndex;
  }
}
class ft extends p {
  constructor(t2) {
    super(), this.precedence = void 0 === t2 ? 0 : t2;
  }
  evaluate(t2, e2) {
    return t2.precpred(e2, this.precedence);
  }
  evalPrecedence(t2, e2) {
    return t2.precpred(e2, this.precedence) ? p.NONE : null;
  }
  compareTo(t2) {
    return this.precedence - t2.precedence;
  }
  updateHashCode(t2) {
    t2.update(this.precedence);
  }
  equals(t2) {
    return this === t2 || t2 instanceof ft && this.precedence === t2.precedence;
  }
  toString() {
    return "{" + this.precedence + ">=prec}?";
  }
}
p.PrecedencePredicate = ft;
class xt extends O {
  constructor(t2, e2) {
    super(t2), this.serializationType = N.PRECEDENCE, this.precedence = e2, this.isEpsilon = true;
  }
  matches(t2, e2, n2) {
    return false;
  }
  getPredicate() {
    return new ft(this.precedence);
  }
  toString() {
    return this.precedence + " >= _p";
  }
}
class Tt {
  constructor(t2) {
    void 0 === t2 && (t2 = null), this.readOnly = false, this.verifyATN = null === t2 || t2.verifyATN, this.generateRuleBypassTransitions = null !== t2 && t2.generateRuleBypassTransitions;
  }
}
Tt.defaultOptions = new Tt(), Tt.defaultOptions.readOnly = true;
class St {
  constructor(t2) {
    this.actionType = t2, this.isPositionDependent = false;
  }
  hashCode() {
    const t2 = new l();
    return this.updateHashCode(t2), t2.finish();
  }
  updateHashCode(t2) {
    t2.update(this.actionType);
  }
  equals(t2) {
    return this === t2;
  }
}
class mt extends St {
  constructor() {
    super(6);
  }
  execute(t2) {
    t2.skip();
  }
  toString() {
    return "skip";
  }
}
mt.INSTANCE = new mt();
class Et extends St {
  constructor(t2) {
    super(0), this.channel = t2;
  }
  execute(t2) {
    t2._channel = this.channel;
  }
  updateHashCode(t2) {
    t2.update(this.actionType, this.channel);
  }
  equals(t2) {
    return this === t2 || t2 instanceof Et && this.channel === t2.channel;
  }
  toString() {
    return "channel(" + this.channel + ")";
  }
}
class _t extends St {
  constructor(t2, e2) {
    super(1), this.ruleIndex = t2, this.actionIndex = e2, this.isPositionDependent = true;
  }
  execute(t2) {
    t2.action(null, this.ruleIndex, this.actionIndex);
  }
  updateHashCode(t2) {
    t2.update(this.actionType, this.ruleIndex, this.actionIndex);
  }
  equals(t2) {
    return this === t2 || t2 instanceof _t && this.ruleIndex === t2.ruleIndex && this.actionIndex === t2.actionIndex;
  }
}
class Ct extends St {
  constructor() {
    super(3);
  }
  execute(t2) {
    t2.more();
  }
  toString() {
    return "more";
  }
}
Ct.INSTANCE = new Ct();
class At extends St {
  constructor(t2) {
    super(7), this.type = t2;
  }
  execute(t2) {
    t2.type = this.type;
  }
  updateHashCode(t2) {
    t2.update(this.actionType, this.type);
  }
  equals(t2) {
    return this === t2 || t2 instanceof At && this.type === t2.type;
  }
  toString() {
    return "type(" + this.type + ")";
  }
}
class Nt extends St {
  constructor(t2) {
    super(5), this.mode = t2;
  }
  execute(t2) {
    t2.pushMode(this.mode);
  }
  updateHashCode(t2) {
    t2.update(this.actionType, this.mode);
  }
  equals(t2) {
    return this === t2 || t2 instanceof Nt && this.mode === t2.mode;
  }
  toString() {
    return "pushMode(" + this.mode + ")";
  }
}
class kt extends St {
  constructor() {
    super(4);
  }
  execute(t2) {
    t2.popMode();
  }
  toString() {
    return "popMode";
  }
}
kt.INSTANCE = new kt();
class It extends St {
  constructor(t2) {
    super(2), this.mode = t2;
  }
  execute(t2) {
    t2.setMode(this.mode);
  }
  updateHashCode(t2) {
    t2.update(this.actionType, this.mode);
  }
  equals(t2) {
    return this === t2 || t2 instanceof It && this.mode === t2.mode;
  }
  toString() {
    return "mode(" + this.mode + ")";
  }
}
function yt(t2, e2) {
  const n2 = [];
  return n2[t2 - 1] = e2, n2.map(function(t3) {
    return e2;
  });
}
class Lt {
  constructor(t2) {
    null == t2 && (t2 = Tt.defaultOptions), this.deserializationOptions = t2, this.stateFactories = null, this.actionFactories = null;
  }
  deserialize(t2) {
    const e2 = this.reset(t2);
    this.checkVersion(e2), e2 && this.skipUUID();
    const n2 = this.readATN();
    this.readStates(n2, e2), this.readRules(n2, e2), this.readModes(n2);
    const s2 = [];
    return this.readSets(n2, s2, this.readInt.bind(this)), e2 && this.readSets(n2, s2, this.readInt32.bind(this)), this.readEdges(n2, s2), this.readDecisions(n2), this.readLexerActions(n2, e2), this.markPrecedenceDecisions(n2), this.verifyATN(n2), this.deserializationOptions.generateRuleBypassTransitions && 1 === n2.grammarType && (this.generateRuleBypassTransitions(n2), this.verifyATN(n2)), n2;
  }
  reset(t2) {
    if (3 === (t2.charCodeAt ? t2.charCodeAt(0) : t2[0])) {
      const e2 = function(t3) {
        const e3 = t3.charCodeAt(0);
        return e3 > 1 ? e3 - 2 : e3 + 65534;
      }, n2 = t2.split("").map(e2);
      return n2[0] = t2.charCodeAt(0), this.data = n2, this.pos = 0, true;
    }
    return this.data = t2, this.pos = 0, false;
  }
  skipUUID() {
    let t2 = 0;
    for (; t2++ < 8; ) this.readInt();
  }
  checkVersion(t2) {
    const e2 = this.readInt();
    if (!t2 && 4 !== e2) throw "Could not deserialize ATN with version " + e2 + " (expected 4).";
  }
  readATN() {
    const t2 = this.readInt(), e2 = this.readInt();
    return new $(t2, e2);
  }
  readStates(t2, e2) {
    let n2, s2, i2;
    const r2 = [], o2 = [], a2 = this.readInt();
    for (let n3 = 0; n3 < a2; n3++) {
      const n4 = this.readInt();
      if (n4 === C.INVALID_TYPE) {
        t2.addState(null);
        continue;
      }
      let s3 = this.readInt();
      e2 && 65535 === s3 && (s3 = -1);
      const i3 = this.stateFactory(n4, s3);
      if (n4 === C.LOOP_END) {
        const t3 = this.readInt();
        r2.push([i3, t3]);
      } else if (i3 instanceof Z) {
        const t3 = this.readInt();
        o2.push([i3, t3]);
      }
      t2.addState(i3);
    }
    for (n2 = 0; n2 < r2.length; n2++) s2 = r2[n2], s2[0].loopBackState = t2.states[s2[1]];
    for (n2 = 0; n2 < o2.length; n2++) s2 = o2[n2], s2[0].endState = t2.states[s2[1]];
    let l2 = this.readInt();
    for (n2 = 0; n2 < l2; n2++) i2 = this.readInt(), t2.states[i2].nonGreedy = true;
    let h2 = this.readInt();
    for (n2 = 0; n2 < h2; n2++) i2 = this.readInt(), t2.states[i2].isPrecedenceRule = true;
  }
  readRules(t2, e2) {
    let n2;
    const s2 = this.readInt();
    for (0 === t2.grammarType && (t2.ruleToTokenType = yt(s2, 0)), t2.ruleToStartState = yt(s2, 0), n2 = 0; n2 < s2; n2++) {
      const s3 = this.readInt();
      if (t2.ruleToStartState[n2] = t2.states[s3], 0 === t2.grammarType) {
        let s4 = this.readInt();
        e2 && 65535 === s4 && (s4 = i.EOF), t2.ruleToTokenType[n2] = s4;
      }
    }
    for (t2.ruleToStopState = yt(s2, 0), n2 = 0; n2 < t2.states.length; n2++) {
      const e3 = t2.states[n2];
      e3 instanceof A && (t2.ruleToStopState[e3.ruleIndex] = e3, t2.ruleToStartState[e3.ruleIndex].stopState = e3);
    }
  }
  readModes(t2) {
    const e2 = this.readInt();
    for (let n2 = 0; n2 < e2; n2++) {
      let e3 = this.readInt();
      t2.modeToStartState.push(t2.states[e3]);
    }
  }
  readSets(t2, e2, n2) {
    const s2 = this.readInt();
    for (let t3 = 0; t3 < s2; t3++) {
      const t4 = new _();
      e2.push(t4);
      const s3 = this.readInt();
      0 !== this.readInt() && t4.addOne(-1);
      for (let e3 = 0; e3 < s3; e3++) {
        const e4 = n2(), s4 = n2();
        t4.addRange(e4, s4);
      }
    }
  }
  readEdges(t2, e2) {
    let n2, s2, i2, r2, o2;
    const a2 = this.readInt();
    for (n2 = 0; n2 < a2; n2++) {
      const n3 = this.readInt(), s3 = this.readInt(), i3 = this.readInt(), o3 = this.readInt(), a3 = this.readInt(), l2 = this.readInt();
      r2 = this.edgeFactory(t2, i3, n3, s3, o3, a3, l2, e2), t2.states[n3].addTransition(r2);
    }
    for (n2 = 0; n2 < t2.states.length; n2++) for (i2 = t2.states[n2], s2 = 0; s2 < i2.transitions.length; s2++) {
      const e3 = i2.transitions[s2];
      if (!(e3 instanceof k)) continue;
      let n3 = -1;
      t2.ruleToStartState[e3.target.ruleIndex].isPrecedenceRule && 0 === e3.precedence && (n3 = e3.target.ruleIndex), r2 = new dt(e3.followState, n3), t2.ruleToStopState[e3.target.ruleIndex].addTransition(r2);
    }
    for (n2 = 0; n2 < t2.states.length; n2++) {
      if (i2 = t2.states[n2], i2 instanceof Z) {
        if (null === i2.endState) throw "IllegalState";
        if (null !== i2.endState.startState) throw "IllegalState";
        i2.endState.startState = i2;
      }
      if (i2 instanceof st) for (s2 = 0; s2 < i2.transitions.length; s2++) o2 = i2.transitions[s2].target, o2 instanceof ot && (o2.loopBackState = i2);
      else if (i2 instanceof it) for (s2 = 0; s2 < i2.transitions.length; s2++) o2 = i2.transitions[s2].target, o2 instanceof rt && (o2.loopBackState = i2);
    }
  }
  readDecisions(t2) {
    const e2 = this.readInt();
    for (let n2 = 0; n2 < e2; n2++) {
      const e3 = this.readInt(), s2 = t2.states[e3];
      t2.decisionToState.push(s2), s2.decision = n2;
    }
  }
  readLexerActions(t2, e2) {
    if (0 === t2.grammarType) {
      const n2 = this.readInt();
      t2.lexerActions = yt(n2, null);
      for (let s2 = 0; s2 < n2; s2++) {
        const n3 = this.readInt();
        let i2 = this.readInt();
        e2 && 65535 === i2 && (i2 = -1);
        let r2 = this.readInt();
        e2 && 65535 === r2 && (r2 = -1), t2.lexerActions[s2] = this.lexerActionFactory(n3, i2, r2);
      }
    }
  }
  generateRuleBypassTransitions(t2) {
    let e2;
    const n2 = t2.ruleToStartState.length;
    for (e2 = 0; e2 < n2; e2++) t2.ruleToTokenType[e2] = t2.maxTokenType + e2 + 1;
    for (e2 = 0; e2 < n2; e2++) this.generateRuleBypassTransition(t2, e2);
  }
  generateRuleBypassTransition(t2, e2) {
    let n2, s2;
    const i2 = new lt();
    i2.ruleIndex = e2, t2.addState(i2);
    const r2 = new Q();
    r2.ruleIndex = e2, t2.addState(r2), i2.endState = r2, t2.defineDecisionState(i2), r2.startState = i2;
    let o2 = null, a2 = null;
    if (t2.ruleToStartState[e2].isPrecedenceRule) {
      for (a2 = null, n2 = 0; n2 < t2.states.length; n2++) if (s2 = t2.states[n2], this.stateIsEndStateFor(s2, e2)) {
        a2 = s2, o2 = s2.loopBackState.transitions[0];
        break;
      }
      if (null === o2) throw "Couldn't identify final state of the precedence rule prefix section.";
    } else a2 = t2.ruleToStopState[e2];
    for (n2 = 0; n2 < t2.states.length; n2++) {
      s2 = t2.states[n2];
      for (let t3 = 0; t3 < s2.transitions.length; t3++) {
        const e3 = s2.transitions[t3];
        e3 !== o2 && e3.target === a2 && (e3.target = r2);
      }
    }
    const l2 = t2.ruleToStartState[e2], h2 = l2.transitions.length;
    for (; h2 > 0; ) i2.addTransition(l2.transitions[h2 - 1]), l2.transitions = l2.transitions.slice(-1);
    t2.ruleToStartState[e2].addTransition(new dt(i2)), r2.addTransition(new dt(a2));
    const c2 = new X();
    t2.addState(c2), c2.addTransition(new ht(r2, t2.ruleToTokenType[e2])), i2.addTransition(new dt(c2));
  }
  stateIsEndStateFor(t2, e2) {
    if (t2.ruleIndex !== e2) return null;
    if (!(t2 instanceof rt)) return null;
    const n2 = t2.transitions[t2.transitions.length - 1].target;
    return n2 instanceof tt && n2.epsilonOnlyTransitions && n2.transitions[0].target instanceof A ? t2 : null;
  }
  markPrecedenceDecisions(t2) {
    for (let e2 = 0; e2 < t2.states.length; e2++) {
      const n2 = t2.states[e2];
      if (n2 instanceof rt && t2.ruleToStartState[n2.ruleIndex].isPrecedenceRule) {
        const t3 = n2.transitions[n2.transitions.length - 1].target;
        t3 instanceof tt && t3.epsilonOnlyTransitions && t3.transitions[0].target instanceof A && (n2.isPrecedenceDecision = true);
      }
    }
  }
  verifyATN(t2) {
    if (this.deserializationOptions.verifyATN) for (let e2 = 0; e2 < t2.states.length; e2++) {
      const n2 = t2.states[e2];
      if (null !== n2) if (this.checkCondition(n2.epsilonOnlyTransitions || n2.transitions.length <= 1), n2 instanceof ot) this.checkCondition(null !== n2.loopBackState);
      else if (n2 instanceof rt) if (this.checkCondition(null !== n2.loopBackState), this.checkCondition(2 === n2.transitions.length), n2.transitions[0].target instanceof at) this.checkCondition(n2.transitions[1].target instanceof tt), this.checkCondition(!n2.nonGreedy);
      else {
        if (!(n2.transitions[0].target instanceof tt)) throw "IllegalState";
        this.checkCondition(n2.transitions[1].target instanceof at), this.checkCondition(n2.nonGreedy);
      }
      else n2 instanceof it ? (this.checkCondition(1 === n2.transitions.length), this.checkCondition(n2.transitions[0].target instanceof rt)) : n2 instanceof tt ? this.checkCondition(null !== n2.loopBackState) : n2 instanceof et ? this.checkCondition(null !== n2.stopState) : n2 instanceof Z ? this.checkCondition(null !== n2.endState) : n2 instanceof Q ? this.checkCondition(null !== n2.startState) : n2 instanceof J ? this.checkCondition(n2.transitions.length <= 1 || n2.decision >= 0) : this.checkCondition(n2.transitions.length <= 1 || n2 instanceof A);
    }
  }
  checkCondition(t2, e2) {
    if (!t2) throw null == e2 && (e2 = "IllegalState"), e2;
  }
  readInt() {
    return this.data[this.pos++];
  }
  readInt32() {
    return this.readInt() | this.readInt() << 16;
  }
  edgeFactory(t2, e2, n2, s2, r2, o2, a2, l2) {
    const h2 = t2.states[s2];
    switch (e2) {
      case N.EPSILON:
        return new dt(h2);
      case N.RANGE:
        return new ct(h2, 0 !== a2 ? i.EOF : r2, o2);
      case N.RULE:
        return new k(t2.states[r2], o2, a2, h2);
      case N.PREDICATE:
        return new pt(h2, r2, o2, 0 !== a2);
      case N.PRECEDENCE:
        return new xt(h2, r2);
      case N.ATOM:
        return new ht(h2, 0 !== a2 ? i.EOF : r2);
      case N.ACTION:
        return new ut(h2, r2, o2, 0 !== a2);
      case N.SET:
        return new I(h2, l2[r2]);
      case N.NOT_SET:
        return new y(h2, l2[r2]);
      case N.WILDCARD:
        return new L(h2);
      default:
        throw "The specified transition type: " + e2 + " is not valid.";
    }
  }
  stateFactory(t2, e2) {
    if (null === this.stateFactories) {
      const t3 = [];
      t3[C.INVALID_TYPE] = null, t3[C.BASIC] = () => new X(), t3[C.RULE_START] = () => new et(), t3[C.BLOCK_START] = () => new lt(), t3[C.PLUS_BLOCK_START] = () => new ot(), t3[C.STAR_BLOCK_START] = () => new at(), t3[C.TOKEN_START] = () => new nt(), t3[C.RULE_STOP] = () => new A(), t3[C.BLOCK_END] = () => new Q(), t3[C.STAR_LOOP_BACK] = () => new it(), t3[C.STAR_LOOP_ENTRY] = () => new rt(), t3[C.PLUS_LOOP_BACK] = () => new st(), t3[C.LOOP_END] = () => new tt(), this.stateFactories = t3;
    }
    if (t2 > this.stateFactories.length || null === this.stateFactories[t2]) throw "The specified state type " + t2 + " is not valid.";
    {
      const n2 = this.stateFactories[t2]();
      if (null !== n2) return n2.ruleIndex = e2, n2;
    }
  }
  lexerActionFactory(t2, e2, n2) {
    if (null === this.actionFactories) {
      const t3 = [];
      t3[0] = (t4, e3) => new Et(t4), t3[1] = (t4, e3) => new _t(t4, e3), t3[2] = (t4, e3) => new It(t4), t3[3] = (t4, e3) => Ct.INSTANCE, t3[4] = (t4, e3) => kt.INSTANCE, t3[5] = (t4, e3) => new Nt(t4), t3[6] = (t4, e3) => mt.INSTANCE, t3[7] = (t4, e3) => new At(t4), this.actionFactories = t3;
    }
    if (t2 > this.actionFactories.length || null === this.actionFactories[t2]) throw "The specified lexer action type " + t2 + " is not valid.";
    return this.actionFactories[t2](e2, n2);
  }
}
class Ot {
  syntaxError(t2, e2, n2, s2, i2, r2) {
  }
  reportAmbiguity(t2, e2, n2, s2, i2, r2, o2) {
  }
  reportAttemptingFullContext(t2, e2, n2, s2, i2, r2) {
  }
  reportContextSensitivity(t2, e2, n2, s2, i2, r2) {
  }
}
class Rt extends Ot {
  constructor() {
    super();
  }
  syntaxError(t2, e2, n2, s2, i2, r2) {
    console.error("line " + n2 + ":" + s2 + " " + i2);
  }
}
Rt.INSTANCE = new Rt();
class wt extends Ot {
  constructor(t2) {
    if (super(), null === t2) throw "delegates";
    return this.delegates = t2, this;
  }
  syntaxError(t2, e2, n2, s2, i2, r2) {
    this.delegates.map((o2) => o2.syntaxError(t2, e2, n2, s2, i2, r2));
  }
  reportAmbiguity(t2, e2, n2, s2, i2, r2, o2) {
    this.delegates.map((a2) => a2.reportAmbiguity(t2, e2, n2, s2, i2, r2, o2));
  }
  reportAttemptingFullContext(t2, e2, n2, s2, i2, r2) {
    this.delegates.map((o2) => o2.reportAttemptingFullContext(t2, e2, n2, s2, i2, r2));
  }
  reportContextSensitivity(t2, e2, n2, s2, i2, r2) {
    this.delegates.map((o2) => o2.reportContextSensitivity(t2, e2, n2, s2, i2, r2));
  }
}
class vt {
  constructor() {
    this._listeners = [Rt.INSTANCE], this._interp = null, this._stateNumber = -1;
  }
  checkVersion(t2) {
    const e2 = "4.13.2";
    e2 !== t2 && console.log("ANTLR runtime and generated code versions disagree: " + e2 + "!=" + t2);
  }
  addErrorListener(t2) {
    this._listeners.push(t2);
  }
  removeErrorListeners() {
    this._listeners = [];
  }
  getLiteralNames() {
    return Object.getPrototypeOf(this).constructor.literalNames || [];
  }
  getSymbolicNames() {
    return Object.getPrototypeOf(this).constructor.symbolicNames || [];
  }
  getTokenNames() {
    if (!this.tokenNames) {
      const t2 = this.getLiteralNames(), e2 = this.getSymbolicNames(), n2 = t2.length > e2.length ? t2.length : e2.length;
      this.tokenNames = [];
      for (let s2 = 0; s2 < n2; s2++) this.tokenNames[s2] = t2[s2] || e2[s2] || "<INVALID";
    }
    return this.tokenNames;
  }
  getTokenTypeMap() {
    const t2 = this.getTokenNames();
    if (null === t2) throw "The current recognizer does not provide a list of token names.";
    let e2 = this.tokenTypeMapCache[t2];
    return void 0 === e2 && (e2 = t2.reduce(function(t3, e3, n2) {
      t3[e3] = n2;
    }), e2.EOF = i.EOF, this.tokenTypeMapCache[t2] = e2), e2;
  }
  getRuleIndexMap() {
    const t2 = this.ruleNames;
    if (null === t2) throw "The current recognizer does not provide a list of rule names.";
    let e2 = this.ruleIndexMapCache[t2];
    return void 0 === e2 && (e2 = t2.reduce(function(t3, e3, n2) {
      t3[e3] = n2;
    }), this.ruleIndexMapCache[t2] = e2), e2;
  }
  getTokenType(t2) {
    const e2 = this.getTokenTypeMap()[t2];
    return void 0 !== e2 ? e2 : i.INVALID_TYPE;
  }
  getErrorHeader(t2) {
    return "line " + t2.getOffendingToken().line + ":" + t2.getOffendingToken().column;
  }
  getTokenErrorDisplay(t2) {
    if (null === t2) return "<no token>";
    let e2 = t2.text;
    return null === e2 && (e2 = t2.type === i.EOF ? "<EOF>" : "<" + t2.type + ">"), e2 = e2.replace("\n", "\\n").replace("\r", "\\r").replace("	", "\\t"), "'" + e2 + "'";
  }
  getErrorListenerDispatch() {
    return console.warn("Calling deprecated method in Recognizer class: getErrorListenerDispatch()"), this.getErrorListener();
  }
  getErrorListener() {
    return new wt(this._listeners);
  }
  sempred(t2, e2, n2) {
    return true;
  }
  precpred(t2, e2) {
    return true;
  }
  get atn() {
    return this._interp.atn;
  }
  get state() {
    return this._stateNumber;
  }
  set state(t2) {
    this._stateNumber = t2;
  }
}
vt.tokenTypeMapCache = {}, vt.ruleIndexMapCache = {};
class Pt extends i {
  constructor(t2, e2, n2, s2, r2) {
    super(), this.source = void 0 !== t2 ? t2 : Pt.EMPTY_SOURCE, this.type = void 0 !== e2 ? e2 : null, this.channel = void 0 !== n2 ? n2 : i.DEFAULT_CHANNEL, this.start = void 0 !== s2 ? s2 : -1, this.stop = void 0 !== r2 ? r2 : -1, this.tokenIndex = -1, null !== this.source[0] ? (this.line = t2[0].line, this.column = t2[0].column) : this.column = -1;
  }
  clone() {
    const t2 = new Pt(this.source, this.type, this.channel, this.start, this.stop);
    return t2.tokenIndex = this.tokenIndex, t2.line = this.line, t2.column = this.column, t2.text = this.text, t2;
  }
  cloneWithType(t2) {
    const e2 = new Pt(this.source, t2, this.channel, this.start, this.stop);
    return e2.tokenIndex = this.tokenIndex, e2.line = this.line, e2.column = this.column, t2 === i.EOF && (e2.text = ""), e2;
  }
  toString() {
    let t2 = this.text;
    return t2 = null !== t2 ? t2.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") : "<no text>", "[@" + this.tokenIndex + "," + this.start + ":" + this.stop + "='" + t2 + "',<" + this.type + ">" + (this.channel > 0 ? ",channel=" + this.channel : "") + "," + this.line + ":" + this.column + "]";
  }
  get text() {
    if (null !== this._text) return this._text;
    const t2 = this.getInputStream();
    if (null === t2) return null;
    const e2 = t2.size;
    return this.start < e2 && this.stop < e2 ? t2.getText(this.start, this.stop) : "<EOF>";
  }
  set text(t2) {
    this._text = t2;
  }
}
Pt.EMPTY_SOURCE = [null, null];
class bt {
}
class Dt extends bt {
  constructor(t2) {
    super(), this.copyText = void 0 !== t2 && t2;
  }
  create(t2, e2, n2, s2, i2, r2, o2, a2) {
    const l2 = new Pt(t2, e2, s2, i2, r2);
    return l2.line = o2, l2.column = a2, null !== n2 ? l2.text = n2 : this.copyText && null !== t2[1] && (l2.text = t2[1].getText(i2, r2)), l2;
  }
  createThin(t2, e2) {
    const n2 = new Pt(null, t2);
    return n2.text = e2, n2;
  }
}
Dt.DEFAULT = new Dt();
class Ft extends Error {
  constructor(t2) {
    super(t2.message), Error.captureStackTrace && Error.captureStackTrace(this, Ft), this.message = t2.message, this.recognizer = t2.recognizer, this.input = t2.input, this.ctx = t2.ctx, this.offendingToken = null, this.offendingState = -1, null !== this.recognizer && (this.offendingState = this.recognizer.state);
  }
  getExpectedTokens() {
    return null !== this.recognizer ? this.recognizer.atn.getExpectedTokens(this.offendingState, this.ctx) : null;
  }
  toString() {
    return this.message;
  }
}
class Mt extends Ft {
  constructor(t2, e2, n2, s2) {
    super({ message: "", recognizer: t2, input: e2, ctx: null }), this.startIndex = n2, this.deadEndConfigs = s2;
  }
  toString() {
    let t2 = "";
    return this.startIndex >= 0 && this.startIndex < this.input.size && (t2 = this.input.getText(new E(this.startIndex, this.startIndex))), "LexerNoViableAltException" + t2;
  }
}
class Ut extends vt {
  constructor(t2) {
    super(), this._input = t2, this._factory = Dt.DEFAULT, this._tokenFactorySourcePair = [this, t2], this._interp = null, this._token = null, this._tokenStartCharIndex = -1, this._tokenStartLine = -1, this._tokenStartColumn = -1, this._hitEOF = false, this._channel = i.DEFAULT_CHANNEL, this._type = i.INVALID_TYPE, this._modeStack = [], this._mode = Ut.DEFAULT_MODE, this._text = null;
  }
  reset() {
    null !== this._input && this._input.seek(0), this._token = null, this._type = i.INVALID_TYPE, this._channel = i.DEFAULT_CHANNEL, this._tokenStartCharIndex = -1, this._tokenStartColumn = -1, this._tokenStartLine = -1, this._text = null, this._hitEOF = false, this._mode = Ut.DEFAULT_MODE, this._modeStack = [], this._interp.reset();
  }
  nextToken() {
    if (null === this._input) throw "nextToken requires a non-null input stream.";
    const t2 = this._input.mark();
    try {
      for (; ; ) {
        if (this._hitEOF) return this.emitEOF(), this._token;
        this._token = null, this._channel = i.DEFAULT_CHANNEL, this._tokenStartCharIndex = this._input.index, this._tokenStartColumn = this._interp.column, this._tokenStartLine = this._interp.line, this._text = null;
        let t3 = false;
        for (; ; ) {
          this._type = i.INVALID_TYPE;
          let e2 = Ut.SKIP;
          try {
            e2 = this._interp.match(this._input, this._mode);
          } catch (t4) {
            if (!(t4 instanceof Ft)) throw console.log(t4.stack), t4;
            this.notifyListeners(t4), this.recover(t4);
          }
          if (this._input.LA(1) === i.EOF && (this._hitEOF = true), this._type === i.INVALID_TYPE && (this._type = e2), this._type === Ut.SKIP) {
            t3 = true;
            break;
          }
          if (this._type !== Ut.MORE) break;
        }
        if (!t3) return null === this._token && this.emit(), this._token;
      }
    } finally {
      this._input.release(t2);
    }
  }
  skip() {
    this._type = Ut.SKIP;
  }
  more() {
    this._type = Ut.MORE;
  }
  mode(t2) {
    console.warn("Calling deprecated method in Lexer class: mode(...)"), this.setMode(t2);
  }
  setMode(t2) {
    this._mode = t2;
  }
  getMode() {
    return this._mode;
  }
  getModeStack() {
    return this._modeStack;
  }
  pushMode(t2) {
    this._interp.debug && console.log("pushMode " + t2), this._modeStack.push(this._mode), this.setMode(t2);
  }
  popMode() {
    if (0 === this._modeStack.length) throw "Empty Stack";
    return this._interp.debug && console.log("popMode back to " + this._modeStack.slice(0, -1)), this.setMode(this._modeStack.pop()), this._mode;
  }
  emitToken(t2) {
    this._token = t2;
  }
  emit() {
    const t2 = this._factory.create(this._tokenFactorySourcePair, this._type, this._text, this._channel, this._tokenStartCharIndex, this.getCharIndex() - 1, this._tokenStartLine, this._tokenStartColumn);
    return this.emitToken(t2), t2;
  }
  emitEOF() {
    const t2 = this.column, e2 = this.line, n2 = this._factory.create(this._tokenFactorySourcePair, i.EOF, null, i.DEFAULT_CHANNEL, this._input.index, this._input.index - 1, e2, t2);
    return this.emitToken(n2), n2;
  }
  getCharIndex() {
    return this._input.index;
  }
  getAllTokens() {
    const t2 = [];
    let e2 = this.nextToken();
    for (; e2.type !== i.EOF; ) t2.push(e2), e2 = this.nextToken();
    return t2;
  }
  notifyListeners(t2) {
    const e2 = this._tokenStartCharIndex, n2 = this._input.index, s2 = this._input.getText(e2, n2), i2 = "token recognition error at: '" + this.getErrorDisplay(s2) + "'";
    this.getErrorListener().syntaxError(this, null, this._tokenStartLine, this._tokenStartColumn, i2, t2);
  }
  getErrorDisplay(t2) {
    const e2 = [];
    for (let n2 = 0; n2 < t2.length; n2++) e2.push(t2[n2]);
    return e2.join("");
  }
  getErrorDisplayForChar(t2) {
    return t2.charCodeAt(0) === i.EOF ? "<EOF>" : "\n" === t2 ? "\\n" : "	" === t2 ? "\\t" : "\r" === t2 ? "\\r" : t2;
  }
  getCharErrorDisplay(t2) {
    return "'" + this.getErrorDisplayForChar(t2) + "'";
  }
  recover(t2) {
    this._input.LA(1) !== i.EOF && (t2 instanceof Mt ? this._interp.consume(this._input) : this._input.consume());
  }
  get inputStream() {
    return this._input;
  }
  set inputStream(t2) {
    this._input = null, this._tokenFactorySourcePair = [this, this._input], this.reset(), this._input = t2, this._tokenFactorySourcePair = [this, this._input];
  }
  get sourceName() {
    return this._input.sourceName;
  }
  get type() {
    return this._type;
  }
  set type(t2) {
    this._type = t2;
  }
  get line() {
    return this._interp.line;
  }
  set line(t2) {
    this._interp.line = t2;
  }
  get column() {
    return this._interp.column;
  }
  set column(t2) {
    this._interp.column = t2;
  }
  get text() {
    return null !== this._text ? this._text : this._interp.getText(this._input);
  }
  set text(t2) {
    this._text = t2;
  }
}
function Bt(t2) {
  return t2.hashCodeForConfigSet();
}
function zt(t2, e2) {
  return t2 === e2 || null !== t2 && null !== e2 && t2.equalsForConfigSet(e2);
}
Ut.DEFAULT_MODE = 0, Ut.MORE = -2, Ut.SKIP = -3, Ut.DEFAULT_TOKEN_CHANNEL = i.DEFAULT_CHANNEL, Ut.HIDDEN = i.HIDDEN_CHANNEL, Ut.MIN_CHAR_VALUE = 0, Ut.MAX_CHAR_VALUE = 1114111;
class Vt {
  constructor(t2) {
    this.configLookup = new g(Bt, zt), this.fullCtx = void 0 === t2 || t2, this.readOnly = false, this.configs = [], this.uniqueAlt = 0, this.conflictingAlts = null, this.hasSemanticContext = false, this.dipsIntoOuterContext = false, this.cachedHashCode = -1;
  }
  add(t2, e2) {
    if (void 0 === e2 && (e2 = null), this.readOnly) throw "This set is readonly";
    t2.semanticContext !== p.NONE && (this.hasSemanticContext = true), t2.reachesIntoOuterContext > 0 && (this.dipsIntoOuterContext = true);
    const n2 = this.configLookup.getOrAdd(t2);
    if (n2 === t2) return this.cachedHashCode = -1, this.configs.push(t2), true;
    const s2 = !this.fullCtx, i2 = G(n2.context, t2.context, s2, e2);
    return n2.reachesIntoOuterContext = Math.max(n2.reachesIntoOuterContext, t2.reachesIntoOuterContext), t2.precedenceFilterSuppressed && (n2.precedenceFilterSuppressed = true), n2.context = i2, true;
  }
  getStates() {
    const t2 = new g();
    for (let e2 = 0; e2 < this.configs.length; e2++) t2.add(this.configs[e2].state);
    return t2;
  }
  getPredicates() {
    const t2 = [];
    for (let e2 = 0; e2 < this.configs.length; e2++) {
      const n2 = this.configs[e2].semanticContext;
      n2 !== p.NONE && t2.push(n2.semanticContext);
    }
    return t2;
  }
  optimizeConfigs(t2) {
    if (this.readOnly) throw "This set is readonly";
    if (0 !== this.configLookup.length) for (let e2 = 0; e2 < this.configs.length; e2++) {
      const n2 = this.configs[e2];
      n2.context = t2.getCachedContext(n2.context);
    }
  }
  addAll(t2) {
    for (let e2 = 0; e2 < t2.length; e2++) this.add(t2[e2]);
    return false;
  }
  equals(t2) {
    return this === t2 || t2 instanceof Vt && r(this.configs, t2.configs) && this.fullCtx === t2.fullCtx && this.uniqueAlt === t2.uniqueAlt && this.conflictingAlts === t2.conflictingAlts && this.hasSemanticContext === t2.hasSemanticContext && this.dipsIntoOuterContext === t2.dipsIntoOuterContext;
  }
  hashCode() {
    const t2 = new l();
    return t2.update(this.configs), t2.finish();
  }
  updateHashCode(t2) {
    this.readOnly ? (-1 === this.cachedHashCode && (this.cachedHashCode = this.hashCode()), t2.update(this.cachedHashCode)) : t2.update(this.hashCode());
  }
  isEmpty() {
    return 0 === this.configs.length;
  }
  contains(t2) {
    if (null === this.configLookup) throw "This method is not implemented for readonly sets.";
    return this.configLookup.contains(t2);
  }
  containsFast(t2) {
    if (null === this.configLookup) throw "This method is not implemented for readonly sets.";
    return this.configLookup.containsFast(t2);
  }
  clear() {
    if (this.readOnly) throw "This set is readonly";
    this.configs = [], this.cachedHashCode = -1, this.configLookup = new g();
  }
  setReadonly(t2) {
    this.readOnly = t2, t2 && (this.configLookup = null);
  }
  toString() {
    return d(this.configs) + (this.hasSemanticContext ? ",hasSemanticContext=" + this.hasSemanticContext : "") + (this.uniqueAlt !== $.INVALID_ALT_NUMBER ? ",uniqueAlt=" + this.uniqueAlt : "") + (null !== this.conflictingAlts ? ",conflictingAlts=" + this.conflictingAlts : "") + (this.dipsIntoOuterContext ? ",dipsIntoOuterContext" : "");
  }
  get items() {
    return this.configs;
  }
  get length() {
    return this.configs.length;
  }
}
class qt {
  constructor(t2, e2) {
    return null === t2 && (t2 = -1), null === e2 && (e2 = new Vt()), this.stateNumber = t2, this.configs = e2, this.edges = null, this.isAcceptState = false, this.prediction = 0, this.lexerActionExecutor = null, this.requiresFullContext = false, this.predicates = null, this;
  }
  getAltSet() {
    const t2 = new g();
    if (null !== this.configs) for (let e2 = 0; e2 < this.configs.length; e2++) {
      const n2 = this.configs[e2];
      t2.add(n2.alt);
    }
    return 0 === t2.length ? null : t2;
  }
  equals(t2) {
    return this === t2 || t2 instanceof qt && this.configs.equals(t2.configs);
  }
  toString() {
    let t2 = this.stateNumber + ":" + this.configs;
    return this.isAcceptState && (t2 += "=>", null !== this.predicates ? t2 += this.predicates : t2 += this.prediction), t2;
  }
  hashCode() {
    const t2 = new l();
    return t2.update(this.configs), t2.finish();
  }
}
class Ht {
  constructor(t2, e2) {
    return this.atn = t2, this.sharedContextCache = e2, this;
  }
  getCachedContext(t2) {
    if (null === this.sharedContextCache) return t2;
    const e2 = new H();
    return Y(t2, this.sharedContextCache, e2);
  }
}
Ht.ERROR = new qt(2147483647, new Vt());
class Kt extends Vt {
  constructor() {
    super(), this.configLookup = new g();
  }
}
class Yt extends m {
  constructor(t2, e2) {
    super(t2, e2);
    const n2 = t2.lexerActionExecutor || null;
    return this.lexerActionExecutor = n2 || (null !== e2 ? e2.lexerActionExecutor : null), this.passedThroughNonGreedyDecision = null !== e2 && this.checkNonGreedyDecision(e2, this.state), this.hashCodeForConfigSet = Yt.prototype.hashCode, this.equalsForConfigSet = Yt.prototype.equals, this;
  }
  updateHashCode(t2) {
    t2.update(this.state.stateNumber, this.alt, this.context, this.semanticContext, this.passedThroughNonGreedyDecision, this.lexerActionExecutor);
  }
  equals(t2) {
    return this === t2 || t2 instanceof Yt && this.passedThroughNonGreedyDecision === t2.passedThroughNonGreedyDecision && (this.lexerActionExecutor ? this.lexerActionExecutor.equals(t2.lexerActionExecutor) : !t2.lexerActionExecutor) && super.equals(t2);
  }
  checkNonGreedyDecision(t2, e2) {
    return t2.passedThroughNonGreedyDecision || e2 instanceof J && e2.nonGreedy;
  }
}
class Gt extends St {
  constructor(t2, e2) {
    super(e2.actionType), this.offset = t2, this.action = e2, this.isPositionDependent = true;
  }
  execute(t2) {
    this.action.execute(t2);
  }
  updateHashCode(t2) {
    t2.update(this.actionType, this.offset, this.action);
  }
  equals(t2) {
    return this === t2 || t2 instanceof Gt && this.offset === t2.offset && this.action === t2.action;
  }
}
class Wt {
  constructor(t2) {
    return this.lexerActions = null === t2 ? [] : t2, this.cachedHashCode = l.hashStuff(t2), this;
  }
  fixOffsetBeforeMatch(t2) {
    let e2 = null;
    for (let n2 = 0; n2 < this.lexerActions.length; n2++) !this.lexerActions[n2].isPositionDependent || this.lexerActions[n2] instanceof Gt || (null === e2 && (e2 = this.lexerActions.concat([])), e2[n2] = new Gt(t2, this.lexerActions[n2]));
    return null === e2 ? this : new Wt(e2);
  }
  execute(t2, e2, n2) {
    let s2 = false;
    const i2 = e2.index;
    try {
      for (let r2 = 0; r2 < this.lexerActions.length; r2++) {
        let o2 = this.lexerActions[r2];
        if (o2 instanceof Gt) {
          const t3 = o2.offset;
          e2.seek(n2 + t3), o2 = o2.action, s2 = n2 + t3 !== i2;
        } else o2.isPositionDependent && (e2.seek(i2), s2 = false);
        o2.execute(t2);
      }
    } finally {
      s2 && e2.seek(i2);
    }
  }
  hashCode() {
    return this.cachedHashCode;
  }
  updateHashCode(t2) {
    t2.update(this.cachedHashCode);
  }
  equals(t2) {
    if (this === t2) return true;
    if (t2 instanceof Wt) {
      if (this.cachedHashCode != t2.cachedHashCode) return false;
      if (this.lexerActions.length != t2.lexerActions.length) return false;
      {
        const e2 = this.lexerActions.length;
        for (let n2 = 0; n2 < e2; ++n2) if (!this.lexerActions[n2].equals(t2.lexerActions[n2])) return false;
        return true;
      }
    }
    return false;
  }
  static append(t2, e2) {
    if (null === t2) return new Wt([e2]);
    const n2 = t2.lexerActions.concat([e2]);
    return new Wt(n2);
  }
}
function jt(t2) {
  t2.index = -1, t2.line = 0, t2.column = -1, t2.dfaState = null;
}
class $t {
  constructor() {
    jt(this);
  }
  reset() {
    jt(this);
  }
}
class Xt extends Ht {
  constructor(t2, e2, n2, s2) {
    super(e2, s2), this.decisionToDFA = n2, this.recog = t2, this.startIndex = -1, this.line = 1, this.column = 0, this.mode = Ut.DEFAULT_MODE, this.prevAccept = new $t();
  }
  copyState(t2) {
    this.column = t2.column, this.line = t2.line, this.mode = t2.mode, this.startIndex = t2.startIndex;
  }
  match(t2, e2) {
    this.mode = e2;
    const n2 = t2.mark();
    try {
      this.startIndex = t2.index, this.prevAccept.reset();
      const n3 = this.decisionToDFA[e2];
      return null === n3.s0 ? this.matchATN(t2) : this.execATN(t2, n3.s0);
    } finally {
      t2.release(n2);
    }
  }
  reset() {
    this.prevAccept.reset(), this.startIndex = -1, this.line = 1, this.column = 0, this.mode = Ut.DEFAULT_MODE;
  }
  matchATN(t2) {
    const e2 = this.atn.modeToStartState[this.mode];
    Xt.debug && console.log("matchATN mode " + this.mode + " start: " + e2);
    const n2 = this.mode, s2 = this.computeStartState(t2, e2), i2 = s2.hasSemanticContext;
    s2.hasSemanticContext = false;
    const r2 = this.addDFAState(s2);
    i2 || (this.decisionToDFA[this.mode].s0 = r2);
    const o2 = this.execATN(t2, r2);
    return Xt.debug && console.log("DFA after matchATN: " + this.decisionToDFA[n2].toLexerString()), o2;
  }
  execATN(t2, e2) {
    Xt.debug && console.log("start state closure=" + e2.configs), e2.isAcceptState && this.captureSimState(this.prevAccept, t2, e2);
    let n2 = t2.LA(1), s2 = e2;
    for (; ; ) {
      Xt.debug && console.log("execATN loop starting closure: " + s2.configs);
      let e3 = this.getExistingTargetState(s2, n2);
      if (null === e3 && (e3 = this.computeTargetState(t2, s2, n2)), e3 === Ht.ERROR) break;
      if (n2 !== i.EOF && this.consume(t2), e3.isAcceptState && (this.captureSimState(this.prevAccept, t2, e3), n2 === i.EOF)) break;
      n2 = t2.LA(1), s2 = e3;
    }
    return this.failOrAccept(this.prevAccept, t2, s2.configs, n2);
  }
  getExistingTargetState(t2, e2) {
    if (null === t2.edges || e2 < Xt.MIN_DFA_EDGE || e2 > Xt.MAX_DFA_EDGE) return null;
    let n2 = t2.edges[e2 - Xt.MIN_DFA_EDGE];
    return void 0 === n2 && (n2 = null), Xt.debug && null !== n2 && console.log("reuse state " + t2.stateNumber + " edge to " + n2.stateNumber), n2;
  }
  computeTargetState(t2, e2, n2) {
    const s2 = new Kt();
    return this.getReachableConfigSet(t2, e2.configs, s2, n2), 0 === s2.items.length ? (s2.hasSemanticContext || this.addDFAEdge(e2, n2, Ht.ERROR), Ht.ERROR) : this.addDFAEdge(e2, n2, null, s2);
  }
  failOrAccept(t2, e2, n2, s2) {
    if (null !== this.prevAccept.dfaState) {
      const n3 = t2.dfaState.lexerActionExecutor;
      return this.accept(e2, n3, this.startIndex, t2.index, t2.line, t2.column), t2.dfaState.prediction;
    }
    if (s2 === i.EOF && e2.index === this.startIndex) return i.EOF;
    throw new Mt(this.recog, e2, this.startIndex, n2);
  }
  getReachableConfigSet(t2, e2, n2, s2) {
    let r2 = $.INVALID_ALT_NUMBER;
    for (let o2 = 0; o2 < e2.items.length; o2++) {
      const a2 = e2.items[o2], l2 = a2.alt === r2;
      if (!l2 || !a2.passedThroughNonGreedyDecision) {
        Xt.debug && console.log("testing %s at %s\n", this.getTokenName(s2), a2.toString(this.recog, true));
        for (let e3 = 0; e3 < a2.state.transitions.length; e3++) {
          const o3 = a2.state.transitions[e3], h2 = this.getReachableTarget(o3, s2);
          if (null !== h2) {
            let e4 = a2.lexerActionExecutor;
            null !== e4 && (e4 = e4.fixOffsetBeforeMatch(t2.index - this.startIndex));
            const o4 = s2 === i.EOF, c2 = new Yt({ state: h2, lexerActionExecutor: e4 }, a2);
            this.closure(t2, c2, n2, l2, true, o4) && (r2 = a2.alt);
          }
        }
      }
    }
  }
  accept(t2, e2, n2, s2, i2, r2) {
    Xt.debug && console.log("ACTION %s\n", e2), t2.seek(s2), this.line = i2, this.column = r2, null !== e2 && null !== this.recog && e2.execute(this.recog, t2, n2);
  }
  getReachableTarget(t2, e2) {
    return t2.matches(e2, 0, Ut.MAX_CHAR_VALUE) ? t2.target : null;
  }
  computeStartState(t2, e2) {
    const n2 = B.EMPTY, s2 = new Kt();
    for (let i2 = 0; i2 < e2.transitions.length; i2++) {
      const r2 = e2.transitions[i2].target, o2 = new Yt({ state: r2, alt: i2 + 1, context: n2 }, null);
      this.closure(t2, o2, s2, false, false, false);
    }
    return s2;
  }
  closure(t2, e2, n2, s2, i2, r2) {
    let o2 = null;
    if (Xt.debug && console.log("closure(" + e2.toString(this.recog, true) + ")"), e2.state instanceof A) {
      if (Xt.debug && (null !== this.recog ? console.log("closure at %s rule stop %s\n", this.recog.ruleNames[e2.state.ruleIndex], e2) : console.log("closure at rule stop %s\n", e2)), null === e2.context || e2.context.hasEmptyPath()) {
        if (null === e2.context || e2.context.isEmpty()) return n2.add(e2), true;
        n2.add(new Yt({ state: e2.state, context: B.EMPTY }, e2)), s2 = true;
      }
      if (null !== e2.context && !e2.context.isEmpty()) {
        for (let a2 = 0; a2 < e2.context.length; a2++) if (e2.context.getReturnState(a2) !== B.EMPTY_RETURN_STATE) {
          const l2 = e2.context.getParent(a2), h2 = this.atn.states[e2.context.getReturnState(a2)];
          o2 = new Yt({ state: h2, context: l2 }, e2), s2 = this.closure(t2, o2, n2, s2, i2, r2);
        }
      }
      return s2;
    }
    e2.state.epsilonOnlyTransitions || s2 && e2.passedThroughNonGreedyDecision || n2.add(e2);
    for (let a2 = 0; a2 < e2.state.transitions.length; a2++) {
      const l2 = e2.state.transitions[a2];
      o2 = this.getEpsilonTarget(t2, e2, l2, n2, i2, r2), null !== o2 && (s2 = this.closure(t2, o2, n2, s2, i2, r2));
    }
    return s2;
  }
  getEpsilonTarget(t2, e2, n2, s2, r2, o2) {
    let a2 = null;
    if (n2.serializationType === N.RULE) {
      const t3 = V.create(e2.context, n2.followState.stateNumber);
      a2 = new Yt({ state: n2.target, context: t3 }, e2);
    } else {
      if (n2.serializationType === N.PRECEDENCE) throw "Precedence predicates are not supported in lexers.";
      if (n2.serializationType === N.PREDICATE) Xt.debug && console.log("EVAL rule " + n2.ruleIndex + ":" + n2.predIndex), s2.hasSemanticContext = true, this.evaluatePredicate(t2, n2.ruleIndex, n2.predIndex, r2) && (a2 = new Yt({ state: n2.target }, e2));
      else if (n2.serializationType === N.ACTION) if (null === e2.context || e2.context.hasEmptyPath()) {
        const t3 = Wt.append(e2.lexerActionExecutor, this.atn.lexerActions[n2.actionIndex]);
        a2 = new Yt({ state: n2.target, lexerActionExecutor: t3 }, e2);
      } else a2 = new Yt({ state: n2.target }, e2);
      else n2.serializationType === N.EPSILON ? a2 = new Yt({ state: n2.target }, e2) : n2.serializationType !== N.ATOM && n2.serializationType !== N.RANGE && n2.serializationType !== N.SET || o2 && n2.matches(i.EOF, 0, Ut.MAX_CHAR_VALUE) && (a2 = new Yt({ state: n2.target }, e2));
    }
    return a2;
  }
  evaluatePredicate(t2, e2, n2, s2) {
    if (null === this.recog) return true;
    if (!s2) return this.recog.sempred(null, e2, n2);
    const i2 = this.column, r2 = this.line, o2 = t2.index, a2 = t2.mark();
    try {
      return this.consume(t2), this.recog.sempred(null, e2, n2);
    } finally {
      this.column = i2, this.line = r2, t2.seek(o2), t2.release(a2);
    }
  }
  captureSimState(t2, e2, n2) {
    t2.index = e2.index, t2.line = this.line, t2.column = this.column, t2.dfaState = n2;
  }
  addDFAEdge(t2, e2, n2, s2) {
    if (void 0 === n2 && (n2 = null), void 0 === s2 && (s2 = null), null === n2 && null !== s2) {
      const t3 = s2.hasSemanticContext;
      if (s2.hasSemanticContext = false, n2 = this.addDFAState(s2), t3) return n2;
    }
    return e2 < Xt.MIN_DFA_EDGE || e2 > Xt.MAX_DFA_EDGE || (Xt.debug && console.log("EDGE " + t2 + " -> " + n2 + " upon " + e2), null === t2.edges && (t2.edges = []), t2.edges[e2 - Xt.MIN_DFA_EDGE] = n2), n2;
  }
  addDFAState(t2) {
    const e2 = new qt(null, t2);
    let n2 = null;
    for (let e3 = 0; e3 < t2.items.length; e3++) {
      const s3 = t2.items[e3];
      if (s3.state instanceof A) {
        n2 = s3;
        break;
      }
    }
    null !== n2 && (e2.isAcceptState = true, e2.lexerActionExecutor = n2.lexerActionExecutor, e2.prediction = this.atn.ruleToTokenType[n2.state.ruleIndex]);
    const s2 = this.decisionToDFA[this.mode], i2 = s2.states.get(e2);
    if (null !== i2) return i2;
    const r2 = e2;
    return r2.stateNumber = s2.states.length, t2.setReadonly(true), r2.configs = t2, s2.states.add(r2), r2;
  }
  getDFA(t2) {
    return this.decisionToDFA[t2];
  }
  getText(t2) {
    return t2.getText(this.startIndex, t2.index - 1);
  }
  consume(t2) {
    t2.LA(1) === "\n".charCodeAt(0) ? (this.line += 1, this.column = 0) : this.column += 1, t2.consume();
  }
  getTokenName(t2) {
    return -1 === t2 ? "EOF" : "'" + String.fromCharCode(t2) + "'";
  }
}
Xt.debug = false, Xt.dfa_debug = false, Xt.MIN_DFA_EDGE = 0, Xt.MAX_DFA_EDGE = 127;
class Jt {
  constructor(t2, e2) {
    this.alt = e2, this.pred = t2;
  }
  toString() {
    return "(" + this.pred + ", " + this.alt + ")";
  }
}
class Zt {
  constructor() {
    this.data = {};
  }
  get(t2) {
    return this.data["k-" + t2] || null;
  }
  set(t2, e2) {
    this.data["k-" + t2] = e2;
  }
  values() {
    return Object.keys(this.data).filter((t2) => t2.startsWith("k-")).map((t2) => this.data[t2], this);
  }
}
const Qt = { SLL: 0, LL: 1, LL_EXACT_AMBIG_DETECTION: 2, hasSLLConflictTerminatingPrediction: function(t2, e2) {
  if (Qt.allConfigsInRuleStopStates(e2)) return true;
  if (t2 === Qt.SLL && e2.hasSemanticContext) {
    const t3 = new Vt();
    for (let n3 = 0; n3 < e2.items.length; n3++) {
      let s2 = e2.items[n3];
      s2 = new m({ semanticContext: p.NONE }, s2), t3.add(s2);
    }
    e2 = t3;
  }
  const n2 = Qt.getConflictingAltSubsets(e2);
  return Qt.hasConflictingAltSet(n2) && !Qt.hasStateAssociatedWithOneAlt(e2);
}, hasConfigInRuleStopState: function(t2) {
  for (let e2 = 0; e2 < t2.items.length; e2++) if (t2.items[e2].state instanceof A) return true;
  return false;
}, allConfigsInRuleStopStates: function(t2) {
  for (let e2 = 0; e2 < t2.items.length; e2++) if (!(t2.items[e2].state instanceof A)) return false;
  return true;
}, resolvesToJustOneViableAlt: function(t2) {
  return Qt.getSingleViableAlt(t2);
}, allSubsetsConflict: function(t2) {
  return !Qt.hasNonConflictingAltSet(t2);
}, hasNonConflictingAltSet: function(t2) {
  for (let e2 = 0; e2 < t2.length; e2++) if (1 === t2[e2].length) return true;
  return false;
}, hasConflictingAltSet: function(t2) {
  for (let e2 = 0; e2 < t2.length; e2++) if (t2[e2].length > 1) return true;
  return false;
}, allSubsetsEqual: function(t2) {
  let e2 = null;
  for (let n2 = 0; n2 < t2.length; n2++) {
    const s2 = t2[n2];
    if (null === e2) e2 = s2;
    else if (s2 !== e2) return false;
  }
  return true;
}, getUniqueAlt: function(t2) {
  const e2 = Qt.getAlts(t2);
  return 1 === e2.length ? e2.minValue() : $.INVALID_ALT_NUMBER;
}, getAlts: function(t2) {
  const e2 = new W();
  return t2.map(function(t3) {
    e2.or(t3);
  }), e2;
}, getConflictingAltSubsets: function(t2) {
  const e2 = new H();
  return e2.hashFunction = function(t3) {
    l.hashStuff(t3.state.stateNumber, t3.context);
  }, e2.equalsFunction = function(t3, e3) {
    return t3.state.stateNumber === e3.state.stateNumber && t3.context.equals(e3.context);
  }, t2.items.map(function(t3) {
    let n2 = e2.get(t3);
    null === n2 && (n2 = new W(), e2.set(t3, n2)), n2.set(t3.alt);
  }), e2.getValues();
}, getStateToAltMap: function(t2) {
  const e2 = new Zt();
  return t2.items.map(function(t3) {
    let n2 = e2.get(t3.state);
    null === n2 && (n2 = new W(), e2.set(t3.state, n2)), n2.set(t3.alt);
  }), e2;
}, hasStateAssociatedWithOneAlt: function(t2) {
  const e2 = Qt.getStateToAltMap(t2).values();
  for (let t3 = 0; t3 < e2.length; t3++) if (1 === e2[t3].length) return true;
  return false;
}, getSingleViableAlt: function(t2) {
  let e2 = null;
  for (let n2 = 0; n2 < t2.length; n2++) {
    const s2 = t2[n2].minValue();
    if (null === e2) e2 = s2;
    else if (e2 !== s2) return $.INVALID_ALT_NUMBER;
  }
  return e2;
} }, te = Qt;
class ee extends Ft {
  constructor(t2, e2, n2, s2, i2, r2) {
    r2 = r2 || t2._ctx, s2 = s2 || t2.getCurrentToken(), n2 = n2 || t2.getCurrentToken(), e2 = e2 || t2.getInputStream(), super({ message: "", recognizer: t2, input: e2, ctx: r2 }), this.deadEndConfigs = i2, this.startToken = n2, this.offendingToken = s2;
  }
}
class ne {
  constructor(t2) {
    this.defaultMapCtor = t2 || H, this.cacheMap = new this.defaultMapCtor();
  }
  get(t2, e2) {
    const n2 = this.cacheMap.get(t2) || null;
    return null === n2 ? null : n2.get(e2) || null;
  }
  set(t2, e2, n2) {
    let s2 = this.cacheMap.get(t2) || null;
    null === s2 && (s2 = new this.defaultMapCtor(), this.cacheMap.set(t2, s2)), s2.set(e2, n2);
  }
}
class se extends Ht {
  constructor(t2, e2, n2, s2) {
    super(e2, s2), this.parser = t2, this.decisionToDFA = n2, this.predictionMode = te.LL, this._input = null, this._startIndex = 0, this._outerContext = null, this._dfa = null, this.mergeCache = null, this.debug = false, this.debug_closure = false, this.debug_add = false, this.trace_atn_sim = false, this.dfa_debug = false, this.retry_debug = false;
  }
  reset() {
  }
  adaptivePredict(t2, e2, n2) {
    (this.debug || this.trace_atn_sim) && console.log("adaptivePredict decision " + e2 + " exec LA(1)==" + this.getLookaheadName(t2) + " line " + t2.LT(1).line + ":" + t2.LT(1).column), this._input = t2, this._startIndex = t2.index, this._outerContext = n2;
    const s2 = this.decisionToDFA[e2];
    this._dfa = s2;
    const i2 = t2.mark(), r2 = t2.index;
    try {
      let e3;
      if (e3 = s2.precedenceDfa ? s2.getPrecedenceStartState(this.parser.getPrecedence()) : s2.s0, null === e3) {
        null === n2 && (n2 = U.EMPTY), this.debug && console.log("predictATN decision " + s2.decision + " exec LA(1)==" + this.getLookaheadName(t2) + ", outerContext=" + n2.toString(this.parser.ruleNames));
        const i4 = false;
        let r3 = this.computeStartState(s2.atnStartState, U.EMPTY, i4);
        s2.precedenceDfa ? (s2.s0.configs = r3, r3 = this.applyPrecedenceFilter(r3), e3 = this.addDFAState(s2, new qt(null, r3)), s2.setPrecedenceStartState(this.parser.getPrecedence(), e3)) : (e3 = this.addDFAState(s2, new qt(null, r3)), s2.s0 = e3);
      }
      const i3 = this.execATN(s2, e3, t2, r2, n2);
      return this.debug && console.log("DFA after predictATN: " + s2.toString(this.parser.literalNames, this.parser.symbolicNames)), i3;
    } finally {
      this._dfa = null, this.mergeCache = null, t2.seek(r2), t2.release(i2);
    }
  }
  execATN(t2, e2, n2, s2, r2) {
    let o2;
    (this.debug || this.trace_atn_sim) && console.log("execATN decision " + t2.decision + ", DFA state " + e2 + ", LA(1)==" + this.getLookaheadName(n2) + " line " + n2.LT(1).line + ":" + n2.LT(1).column);
    let a2 = e2;
    this.debug && console.log("s0 = " + e2);
    let l2 = n2.LA(1);
    for (; ; ) {
      let e3 = this.getExistingTargetState(a2, l2);
      if (null === e3 && (e3 = this.computeTargetState(t2, a2, l2)), e3 === Ht.ERROR) {
        const t3 = this.noViableAlt(n2, r2, a2.configs, s2);
        if (n2.seek(s2), o2 = this.getSynValidOrSemInvalidAltThatFinishedDecisionEntryRule(a2.configs, r2), o2 !== $.INVALID_ALT_NUMBER) return o2;
        throw t3;
      }
      if (e3.requiresFullContext && this.predictionMode !== te.SLL) {
        let i2 = null;
        if (null !== e3.predicates) {
          this.debug && console.log("DFA state has preds in DFA sim LL failover");
          const t3 = n2.index;
          if (t3 !== s2 && n2.seek(s2), i2 = this.evalSemanticContext(e3.predicates, r2, true), 1 === i2.length) return this.debug && console.log("Full LL avoided"), i2.minValue();
          t3 !== s2 && n2.seek(t3);
        }
        this.dfa_debug && console.log("ctx sensitive state " + r2 + " in " + e3);
        const a3 = true, l3 = this.computeStartState(t2.atnStartState, r2, a3);
        return this.reportAttemptingFullContext(t2, i2, e3.configs, s2, n2.index), o2 = this.execATNWithFullContext(t2, e3, l3, n2, s2, r2), o2;
      }
      if (e3.isAcceptState) {
        if (null === e3.predicates) return e3.prediction;
        const i2 = n2.index;
        n2.seek(s2);
        const o3 = this.evalSemanticContext(e3.predicates, r2, true);
        if (0 === o3.length) throw this.noViableAlt(n2, r2, e3.configs, s2);
        return 1 === o3.length || this.reportAmbiguity(t2, e3, s2, i2, false, o3, e3.configs), o3.minValue();
      }
      a2 = e3, l2 !== i.EOF && (n2.consume(), l2 = n2.LA(1));
    }
  }
  getExistingTargetState(t2, e2) {
    const n2 = t2.edges;
    return null === n2 ? null : n2[e2 + 1] || null;
  }
  computeTargetState(t2, e2, n2) {
    const s2 = this.computeReachSet(e2.configs, n2, false);
    if (null === s2) return this.addDFAEdge(t2, e2, n2, Ht.ERROR), Ht.ERROR;
    let i2 = new qt(null, s2);
    const r2 = this.getUniqueAlt(s2);
    if (this.debug) {
      const t3 = te.getConflictingAltSubsets(s2);
      console.log("SLL altSubSets=" + d(t3) + ", configs=" + s2 + ", predict=" + r2 + ", allSubsetsConflict=" + te.allSubsetsConflict(t3) + ", conflictingAlts=" + this.getConflictingAlts(s2));
    }
    return r2 !== $.INVALID_ALT_NUMBER ? (i2.isAcceptState = true, i2.configs.uniqueAlt = r2, i2.prediction = r2) : te.hasSLLConflictTerminatingPrediction(this.predictionMode, s2) && (i2.configs.conflictingAlts = this.getConflictingAlts(s2), i2.requiresFullContext = true, i2.isAcceptState = true, i2.prediction = i2.configs.conflictingAlts.minValue()), i2.isAcceptState && i2.configs.hasSemanticContext && (this.predicateDFAState(i2, this.atn.getDecisionState(t2.decision)), null !== i2.predicates && (i2.prediction = $.INVALID_ALT_NUMBER)), i2 = this.addDFAEdge(t2, e2, n2, i2), i2;
  }
  predicateDFAState(t2, e2) {
    const n2 = e2.transitions.length, s2 = this.getConflictingAltsOrUniqueAlt(t2.configs), i2 = this.getPredsForAmbigAlts(s2, t2.configs, n2);
    null !== i2 ? (t2.predicates = this.getPredicatePredictions(s2, i2), t2.prediction = $.INVALID_ALT_NUMBER) : t2.prediction = s2.minValue();
  }
  execATNWithFullContext(t2, e2, n2, s2, r2, o2) {
    (this.debug || this.trace_atn_sim) && console.log("execATNWithFullContext " + n2);
    let a2, l2 = false, h2 = n2;
    s2.seek(r2);
    let c2 = s2.LA(1), u2 = -1;
    for (; ; ) {
      if (a2 = this.computeReachSet(h2, c2, true), null === a2) {
        const t4 = this.noViableAlt(s2, o2, h2, r2);
        s2.seek(r2);
        const e3 = this.getSynValidOrSemInvalidAltThatFinishedDecisionEntryRule(h2, o2);
        if (e3 !== $.INVALID_ALT_NUMBER) return e3;
        throw t4;
      }
      const t3 = te.getConflictingAltSubsets(a2);
      if (this.debug && console.log("LL altSubSets=" + t3 + ", predict=" + te.getUniqueAlt(t3) + ", resolvesToJustOneViableAlt=" + te.resolvesToJustOneViableAlt(t3)), a2.uniqueAlt = this.getUniqueAlt(a2), a2.uniqueAlt !== $.INVALID_ALT_NUMBER) {
        u2 = a2.uniqueAlt;
        break;
      }
      if (this.predictionMode !== te.LL_EXACT_AMBIG_DETECTION) {
        if (u2 = te.resolvesToJustOneViableAlt(t3), u2 !== $.INVALID_ALT_NUMBER) break;
      } else if (te.allSubsetsConflict(t3) && te.allSubsetsEqual(t3)) {
        l2 = true, u2 = te.getSingleViableAlt(t3);
        break;
      }
      h2 = a2, c2 !== i.EOF && (s2.consume(), c2 = s2.LA(1));
    }
    return a2.uniqueAlt !== $.INVALID_ALT_NUMBER ? (this.reportContextSensitivity(t2, u2, a2, r2, s2.index), u2) : (this.reportAmbiguity(t2, e2, r2, s2.index, l2, null, a2), u2);
  }
  computeReachSet(t2, e2, n2) {
    this.debug && console.log("in computeReachSet, starting closure: " + t2), null === this.mergeCache && (this.mergeCache = new ne());
    const s2 = new Vt(n2);
    let r2 = null;
    for (let o3 = 0; o3 < t2.items.length; o3++) {
      const a2 = t2.items[o3];
      if (this.debug && console.log("testing " + this.getTokenName(e2) + " at " + a2), a2.state instanceof A) (n2 || e2 === i.EOF) && (null === r2 && (r2 = []), r2.push(a2), this.debug_add && console.log("added " + a2 + " to skippedStopStates"));
      else for (let t3 = 0; t3 < a2.state.transitions.length; t3++) {
        const n3 = a2.state.transitions[t3], i2 = this.getReachableTarget(n3, e2);
        if (null !== i2) {
          const t4 = new m({ state: i2 }, a2);
          s2.add(t4, this.mergeCache), this.debug_add && console.log("added " + t4 + " to intermediate");
        }
      }
    }
    let o2 = null;
    if (null === r2 && e2 !== i.EOF && (1 === s2.items.length || this.getUniqueAlt(s2) !== $.INVALID_ALT_NUMBER) && (o2 = s2), null === o2) {
      o2 = new Vt(n2);
      const t3 = new g(), r3 = e2 === i.EOF;
      for (let e3 = 0; e3 < s2.items.length; e3++) this.closure(s2.items[e3], o2, t3, false, n2, r3);
    }
    if (e2 === i.EOF && (o2 = this.removeAllConfigsNotInRuleStopState(o2, o2 === s2)), !(null === r2 || n2 && te.hasConfigInRuleStopState(o2))) for (let t3 = 0; t3 < r2.length; t3++) o2.add(r2[t3], this.mergeCache);
    return this.trace_atn_sim && console.log("computeReachSet " + t2 + " -> " + o2), 0 === o2.items.length ? null : o2;
  }
  removeAllConfigsNotInRuleStopState(t2, e2) {
    if (te.allConfigsInRuleStopStates(t2)) return t2;
    const n2 = new Vt(t2.fullCtx);
    for (let s2 = 0; s2 < t2.items.length; s2++) {
      const r2 = t2.items[s2];
      if (r2.state instanceof A) n2.add(r2, this.mergeCache);
      else if (e2 && r2.state.epsilonOnlyTransitions && this.atn.nextTokens(r2.state).contains(i.EPSILON)) {
        const t3 = this.atn.ruleToStopState[r2.state.ruleIndex];
        n2.add(new m({ state: t3 }, r2), this.mergeCache);
      }
    }
    return n2;
  }
  computeStartState(t2, e2, n2) {
    const s2 = K(this.atn, e2), i2 = new Vt(n2);
    this.trace_atn_sim && console.log("computeStartState from ATN state " + t2 + " initialContext=" + s2.toString(this.parser));
    for (let e3 = 0; e3 < t2.transitions.length; e3++) {
      const r2 = t2.transitions[e3].target, o2 = new m({ state: r2, alt: e3 + 1, context: s2 }, null), a2 = new g();
      this.closure(o2, i2, a2, true, n2, false);
    }
    return i2;
  }
  applyPrecedenceFilter(t2) {
    let e2;
    const n2 = [], s2 = new Vt(t2.fullCtx);
    for (let i2 = 0; i2 < t2.items.length; i2++) {
      if (e2 = t2.items[i2], 1 !== e2.alt) continue;
      const r2 = e2.semanticContext.evalPrecedence(this.parser, this._outerContext);
      null !== r2 && (n2[e2.state.stateNumber] = e2.context, r2 !== e2.semanticContext ? s2.add(new m({ semanticContext: r2 }, e2), this.mergeCache) : s2.add(e2, this.mergeCache));
    }
    for (let i2 = 0; i2 < t2.items.length; i2++) if (e2 = t2.items[i2], 1 !== e2.alt) {
      if (!e2.precedenceFilterSuppressed) {
        const t3 = n2[e2.state.stateNumber] || null;
        if (null !== t3 && t3.equals(e2.context)) continue;
      }
      s2.add(e2, this.mergeCache);
    }
    return s2;
  }
  getReachableTarget(t2, e2) {
    return t2.matches(e2, 0, this.atn.maxTokenType) ? t2.target : null;
  }
  getPredsForAmbigAlts(t2, e2, n2) {
    let s2 = [];
    for (let n3 = 0; n3 < e2.items.length; n3++) {
      const i3 = e2.items[n3];
      t2.get(i3.alt) && (s2[i3.alt] = p.orContext(s2[i3.alt] || null, i3.semanticContext));
    }
    let i2 = 0;
    for (let t3 = 1; t3 < n2 + 1; t3++) {
      const e3 = s2[t3] || null;
      null === e3 ? s2[t3] = p.NONE : e3 !== p.NONE && (i2 += 1);
    }
    return 0 === i2 && (s2 = null), this.debug && console.log("getPredsForAmbigAlts result " + d(s2)), s2;
  }
  getPredicatePredictions(t2, e2) {
    const n2 = [];
    let s2 = false;
    for (let i2 = 1; i2 < e2.length; i2++) {
      const r2 = e2[i2];
      null !== t2 && t2.get(i2) && n2.push(new Jt(r2, i2)), r2 !== p.NONE && (s2 = true);
    }
    return s2 ? n2 : null;
  }
  getSynValidOrSemInvalidAltThatFinishedDecisionEntryRule(t2, e2) {
    const n2 = this.splitAccordingToSemanticValidity(t2, e2), s2 = n2[0], i2 = n2[1];
    let r2 = this.getAltThatFinishedDecisionEntryRule(s2);
    return r2 !== $.INVALID_ALT_NUMBER || i2.items.length > 0 && (r2 = this.getAltThatFinishedDecisionEntryRule(i2), r2 !== $.INVALID_ALT_NUMBER) ? r2 : $.INVALID_ALT_NUMBER;
  }
  getAltThatFinishedDecisionEntryRule(t2) {
    const e2 = [];
    for (let n2 = 0; n2 < t2.items.length; n2++) {
      const s2 = t2.items[n2];
      (s2.reachesIntoOuterContext > 0 || s2.state instanceof A && s2.context.hasEmptyPath()) && e2.indexOf(s2.alt) < 0 && e2.push(s2.alt);
    }
    return 0 === e2.length ? $.INVALID_ALT_NUMBER : Math.min.apply(null, e2);
  }
  splitAccordingToSemanticValidity(t2, e2) {
    const n2 = new Vt(t2.fullCtx), s2 = new Vt(t2.fullCtx);
    for (let i2 = 0; i2 < t2.items.length; i2++) {
      const r2 = t2.items[i2];
      r2.semanticContext !== p.NONE ? r2.semanticContext.evaluate(this.parser, e2) ? n2.add(r2) : s2.add(r2) : n2.add(r2);
    }
    return [n2, s2];
  }
  evalSemanticContext(t2, e2, n2) {
    const s2 = new W();
    for (let i2 = 0; i2 < t2.length; i2++) {
      const r2 = t2[i2];
      if (r2.pred === p.NONE) {
        if (s2.set(r2.alt), !n2) break;
        continue;
      }
      const o2 = r2.pred.evaluate(this.parser, e2);
      if ((this.debug || this.dfa_debug) && console.log("eval pred " + r2 + "=" + o2), o2 && ((this.debug || this.dfa_debug) && console.log("PREDICT " + r2.alt), s2.set(r2.alt), !n2)) break;
    }
    return s2;
  }
  closure(t2, e2, n2, s2, i2, r2) {
    this.closureCheckingStopState(t2, e2, n2, s2, i2, 0, r2);
  }
  closureCheckingStopState(t2, e2, n2, s2, i2, r2, o2) {
    if ((this.trace_atn_sim || this.debug_closure) && console.log("closure(" + t2.toString(this.parser, true) + ")"), t2.state instanceof A) {
      if (!t2.context.isEmpty()) {
        for (let a2 = 0; a2 < t2.context.length; a2++) {
          if (t2.context.getReturnState(a2) === B.EMPTY_RETURN_STATE) {
            if (i2) {
              e2.add(new m({ state: t2.state, context: B.EMPTY }, t2), this.mergeCache);
              continue;
            }
            this.debug && console.log("FALLING off rule " + this.getRuleName(t2.state.ruleIndex)), this.closure_(t2, e2, n2, s2, i2, r2, o2);
            continue;
          }
          const l2 = this.atn.states[t2.context.getReturnState(a2)], h2 = t2.context.getParent(a2), c2 = { state: l2, alt: t2.alt, context: h2, semanticContext: t2.semanticContext }, u2 = new m(c2, null);
          u2.reachesIntoOuterContext = t2.reachesIntoOuterContext, this.closureCheckingStopState(u2, e2, n2, s2, i2, r2 - 1, o2);
        }
        return;
      }
      if (i2) return void e2.add(t2, this.mergeCache);
      this.debug && console.log("FALLING off rule " + this.getRuleName(t2.state.ruleIndex));
    }
    this.closure_(t2, e2, n2, s2, i2, r2, o2);
  }
  closure_(t2, e2, n2, s2, i2, r2, o2) {
    const a2 = t2.state;
    a2.epsilonOnlyTransitions || e2.add(t2, this.mergeCache);
    for (let l2 = 0; l2 < a2.transitions.length; l2++) {
      if (0 === l2 && this.canDropLoopEntryEdgeInLeftRecursiveRule(t2)) continue;
      const h2 = a2.transitions[l2], c2 = s2 && !(h2 instanceof ut), u2 = this.getEpsilonTarget(t2, h2, c2, 0 === r2, i2, o2);
      if (null !== u2) {
        let s3 = r2;
        if (t2.state instanceof A) {
          if (null !== this._dfa && this._dfa.precedenceDfa && h2.outermostPrecedenceReturn === this._dfa.atnStartState.ruleIndex && (u2.precedenceFilterSuppressed = true), u2.reachesIntoOuterContext += 1, n2.getOrAdd(u2) !== u2) continue;
          e2.dipsIntoOuterContext = true, s3 -= 1, this.debug && console.log("dips into outer ctx: " + u2);
        } else {
          if (!h2.isEpsilon && n2.getOrAdd(u2) !== u2) continue;
          h2 instanceof k && s3 >= 0 && (s3 += 1);
        }
        this.closureCheckingStopState(u2, e2, n2, c2, i2, s3, o2);
      }
    }
  }
  canDropLoopEntryEdgeInLeftRecursiveRule(t2) {
    const e2 = t2.state;
    if (e2.stateType !== C.STAR_LOOP_ENTRY) return false;
    if (e2.stateType !== C.STAR_LOOP_ENTRY || !e2.isPrecedenceDecision || t2.context.isEmpty() || t2.context.hasEmptyPath()) return false;
    const n2 = t2.context.length;
    for (let s3 = 0; s3 < n2; s3++) if (this.atn.states[t2.context.getReturnState(s3)].ruleIndex !== e2.ruleIndex) return false;
    const s2 = e2.transitions[0].target.endState.stateNumber, i2 = this.atn.states[s2];
    for (let s3 = 0; s3 < n2; s3++) {
      const n3 = t2.context.getReturnState(s3), r2 = this.atn.states[n3];
      if (1 !== r2.transitions.length || !r2.transitions[0].isEpsilon) return false;
      const o2 = r2.transitions[0].target;
      if (!(r2.stateType === C.BLOCK_END && o2 === e2 || r2 === i2 || o2 === i2 || o2.stateType === C.BLOCK_END && 1 === o2.transitions.length && o2.transitions[0].isEpsilon && o2.transitions[0].target === e2)) return false;
    }
    return true;
  }
  getRuleName(t2) {
    return null !== this.parser && t2 >= 0 ? this.parser.ruleNames[t2] : "<rule " + t2 + ">";
  }
  getEpsilonTarget(t2, e2, n2, s2, r2, o2) {
    switch (e2.serializationType) {
      case N.RULE:
        return this.ruleTransition(t2, e2);
      case N.PRECEDENCE:
        return this.precedenceTransition(t2, e2, n2, s2, r2);
      case N.PREDICATE:
        return this.predTransition(t2, e2, n2, s2, r2);
      case N.ACTION:
        return this.actionTransition(t2, e2);
      case N.EPSILON:
        return new m({ state: e2.target }, t2);
      case N.ATOM:
      case N.RANGE:
      case N.SET:
        return o2 && e2.matches(i.EOF, 0, 1) ? new m({ state: e2.target }, t2) : null;
      default:
        return null;
    }
  }
  actionTransition(t2, e2) {
    if (this.debug) {
      const t3 = -1 === e2.actionIndex ? 65535 : e2.actionIndex;
      console.log("ACTION edge " + e2.ruleIndex + ":" + t3);
    }
    return new m({ state: e2.target }, t2);
  }
  precedenceTransition(t2, e2, n2, s2, i2) {
    this.debug && (console.log("PRED (collectPredicates=" + n2 + ") " + e2.precedence + ">=_p, ctx dependent=true"), null !== this.parser && console.log("context surrounding pred is " + d(this.parser.getRuleInvocationStack())));
    let r2 = null;
    if (n2 && s2) if (i2) {
      const n3 = this._input.index;
      this._input.seek(this._startIndex);
      const s3 = e2.getPredicate().evaluate(this.parser, this._outerContext);
      this._input.seek(n3), s3 && (r2 = new m({ state: e2.target }, t2));
    } else {
      const n3 = p.andContext(t2.semanticContext, e2.getPredicate());
      r2 = new m({ state: e2.target, semanticContext: n3 }, t2);
    }
    else r2 = new m({ state: e2.target }, t2);
    return this.debug && console.log("config from pred transition=" + r2), r2;
  }
  predTransition(t2, e2, n2, s2, i2) {
    this.debug && (console.log("PRED (collectPredicates=" + n2 + ") " + e2.ruleIndex + ":" + e2.predIndex + ", ctx dependent=" + e2.isCtxDependent), null !== this.parser && console.log("context surrounding pred is " + d(this.parser.getRuleInvocationStack())));
    let r2 = null;
    if (n2 && (e2.isCtxDependent && s2 || !e2.isCtxDependent)) if (i2) {
      const n3 = this._input.index;
      this._input.seek(this._startIndex);
      const s3 = e2.getPredicate().evaluate(this.parser, this._outerContext);
      this._input.seek(n3), s3 && (r2 = new m({ state: e2.target }, t2));
    } else {
      const n3 = p.andContext(t2.semanticContext, e2.getPredicate());
      r2 = new m({ state: e2.target, semanticContext: n3 }, t2);
    }
    else r2 = new m({ state: e2.target }, t2);
    return this.debug && console.log("config from pred transition=" + r2), r2;
  }
  ruleTransition(t2, e2) {
    this.debug && console.log("CALL rule " + this.getRuleName(e2.target.ruleIndex) + ", ctx=" + t2.context);
    const n2 = e2.followState, s2 = V.create(t2.context, n2.stateNumber);
    return new m({ state: e2.target, context: s2 }, t2);
  }
  getConflictingAlts(t2) {
    const e2 = te.getConflictingAltSubsets(t2);
    return te.getAlts(e2);
  }
  getConflictingAltsOrUniqueAlt(t2) {
    let e2 = null;
    return t2.uniqueAlt !== $.INVALID_ALT_NUMBER ? (e2 = new W(), e2.set(t2.uniqueAlt)) : e2 = t2.conflictingAlts, e2;
  }
  getTokenName(t2) {
    if (t2 === i.EOF) return "EOF";
    if (null !== this.parser && null !== this.parser.literalNames) {
      if (!(t2 >= this.parser.literalNames.length && t2 >= this.parser.symbolicNames.length)) return (this.parser.literalNames[t2] || this.parser.symbolicNames[t2]) + "<" + t2 + ">";
      console.log(t2 + " ttype out of range: " + this.parser.literalNames), console.log("" + this.parser.getInputStream().getTokens());
    }
    return "" + t2;
  }
  getLookaheadName(t2) {
    return this.getTokenName(t2.LA(1));
  }
  dumpDeadEndConfigs(t2) {
    console.log("dead end configs: ");
    const e2 = t2.getDeadEndConfigs();
    for (let t3 = 0; t3 < e2.length; t3++) {
      const n2 = e2[t3];
      let s2 = "no edges";
      if (n2.state.transitions.length > 0) {
        const t4 = n2.state.transitions[0];
        t4 instanceof ht ? s2 = "Atom " + this.getTokenName(t4.label) : t4 instanceof I && (s2 = (t4 instanceof y ? "~" : "") + "Set " + t4.set);
      }
      console.error(n2.toString(this.parser, true) + ":" + s2);
    }
  }
  noViableAlt(t2, e2, n2, s2) {
    return new ee(this.parser, t2, t2.get(s2), t2.LT(1), n2, e2);
  }
  getUniqueAlt(t2) {
    let e2 = $.INVALID_ALT_NUMBER;
    for (let n2 = 0; n2 < t2.items.length; n2++) {
      const s2 = t2.items[n2];
      if (e2 === $.INVALID_ALT_NUMBER) e2 = s2.alt;
      else if (s2.alt !== e2) return $.INVALID_ALT_NUMBER;
    }
    return e2;
  }
  addDFAEdge(t2, e2, n2, s2) {
    if (this.debug && console.log("EDGE " + e2 + " -> " + s2 + " upon " + this.getTokenName(n2)), null === s2) return null;
    if (s2 = this.addDFAState(t2, s2), null === e2 || n2 < -1 || n2 > this.atn.maxTokenType) return s2;
    if (null === e2.edges && (e2.edges = []), e2.edges[n2 + 1] = s2, this.debug) {
      const e3 = null === this.parser ? null : this.parser.literalNames, n3 = null === this.parser ? null : this.parser.symbolicNames;
      console.log("DFA=\n" + t2.toString(e3, n3));
    }
    return s2;
  }
  addDFAState(t2, e2) {
    if (e2 === Ht.ERROR) return e2;
    const n2 = t2.states.get(e2);
    return null !== n2 ? (this.trace_atn_sim && console.log("addDFAState " + e2 + " exists"), n2) : (e2.stateNumber = t2.states.length, e2.configs.readOnly || (e2.configs.optimizeConfigs(this), e2.configs.setReadonly(true)), this.trace_atn_sim && console.log("addDFAState new " + e2), t2.states.add(e2), this.debug && console.log("adding new DFA state: " + e2), e2);
  }
  reportAttemptingFullContext(t2, e2, n2, s2, i2) {
    if (this.debug || this.retry_debug) {
      const e3 = new E(s2, i2 + 1);
      console.log("reportAttemptingFullContext decision=" + t2.decision + ":" + n2 + ", input=" + this.parser.getTokenStream().getText(e3));
    }
    null !== this.parser && this.parser.getErrorListener().reportAttemptingFullContext(this.parser, t2, s2, i2, e2, n2);
  }
  reportContextSensitivity(t2, e2, n2, s2, i2) {
    if (this.debug || this.retry_debug) {
      const e3 = new E(s2, i2 + 1);
      console.log("reportContextSensitivity decision=" + t2.decision + ":" + n2 + ", input=" + this.parser.getTokenStream().getText(e3));
    }
    null !== this.parser && this.parser.getErrorListener().reportContextSensitivity(this.parser, t2, s2, i2, e2, n2);
  }
  reportAmbiguity(t2, e2, n2, s2, i2, r2, o2) {
    if (this.debug || this.retry_debug) {
      const t3 = new E(n2, s2 + 1);
      console.log("reportAmbiguity " + r2 + ":" + o2 + ", input=" + this.parser.getTokenStream().getText(t3));
    }
    null !== this.parser && this.parser.getErrorListener().reportAmbiguity(this.parser, t2, n2, s2, i2, r2, o2);
  }
}
class ie {
  constructor() {
    this.cache = new H();
  }
  add(t2) {
    if (t2 === B.EMPTY) return B.EMPTY;
    const e2 = this.cache.get(t2) || null;
    return null !== e2 ? e2 : (this.cache.set(t2, t2), t2);
  }
  get(t2) {
    return this.cache.get(t2) || null;
  }
  get length() {
    return this.cache.length;
  }
}
const re = { ATN: $, ATNDeserializer: Lt, LexerATNSimulator: Xt, ParserATNSimulator: se, PredictionMode: te, PredictionContextCache: ie };
class oe {
  constructor(t2, e2, n2) {
    this.dfa = t2, this.literalNames = e2 || [], this.symbolicNames = n2 || [];
  }
  toString() {
    if (null === this.dfa.s0) return null;
    let t2 = "";
    const e2 = this.dfa.sortedStates();
    for (let n2 = 0; n2 < e2.length; n2++) {
      const s2 = e2[n2];
      if (null !== s2.edges) {
        const e3 = s2.edges.length;
        for (let n3 = 0; n3 < e3; n3++) {
          const e4 = s2.edges[n3] || null;
          null !== e4 && 2147483647 !== e4.stateNumber && (t2 = t2.concat(this.getStateString(s2)), t2 = t2.concat("-"), t2 = t2.concat(this.getEdgeLabel(n3)), t2 = t2.concat("->"), t2 = t2.concat(this.getStateString(e4)), t2 = t2.concat("\n"));
        }
      }
    }
    return 0 === t2.length ? null : t2;
  }
  getEdgeLabel(t2) {
    return 0 === t2 ? "EOF" : null !== this.literalNames || null !== this.symbolicNames ? this.literalNames[t2 - 1] || this.symbolicNames[t2 - 1] : String.fromCharCode(t2 - 1);
  }
  getStateString(t2) {
    const e2 = (t2.isAcceptState ? ":" : "") + "s" + t2.stateNumber + (t2.requiresFullContext ? "^" : "");
    return t2.isAcceptState ? null !== t2.predicates ? e2 + "=>" + d(t2.predicates) : e2 + "=>" + t2.prediction.toString() : e2;
  }
}
class ae extends oe {
  constructor(t2) {
    super(t2, null);
  }
  getEdgeLabel(t2) {
    return "'" + String.fromCharCode(t2) + "'";
  }
}
class le {
  constructor(t2, e2) {
    if (void 0 === e2 && (e2 = 0), this.atnStartState = t2, this.decision = e2, this._states = new g(), this.s0 = null, this.precedenceDfa = false, t2 instanceof rt && t2.isPrecedenceDecision) {
      this.precedenceDfa = true;
      const t3 = new qt(null, new Vt());
      t3.edges = [], t3.isAcceptState = false, t3.requiresFullContext = false, this.s0 = t3;
    }
  }
  getPrecedenceStartState(t2) {
    if (!this.precedenceDfa) throw "Only precedence DFAs may contain a precedence start state.";
    return t2 < 0 || t2 >= this.s0.edges.length ? null : this.s0.edges[t2] || null;
  }
  setPrecedenceStartState(t2, e2) {
    if (!this.precedenceDfa) throw "Only precedence DFAs may contain a precedence start state.";
    t2 < 0 || (this.s0.edges[t2] = e2);
  }
  setPrecedenceDfa(t2) {
    if (this.precedenceDfa !== t2) {
      if (this._states = new g(), t2) {
        const t3 = new qt(null, new Vt());
        t3.edges = [], t3.isAcceptState = false, t3.requiresFullContext = false, this.s0 = t3;
      } else this.s0 = null;
      this.precedenceDfa = t2;
    }
  }
  sortedStates() {
    return this._states.values().sort(function(t2, e2) {
      return t2.stateNumber - e2.stateNumber;
    });
  }
  toString(t2, e2) {
    return t2 = t2 || null, e2 = e2 || null, null === this.s0 ? "" : new oe(this, t2, e2).toString();
  }
  toLexerString() {
    return null === this.s0 ? "" : new ae(this).toString();
  }
  get states() {
    return this._states;
  }
}
const he = { DFA: le, DFASerializer: oe, LexerDFASerializer: ae, PredPrediction: Jt }, ce = { PredictionContext: B }, ue = { Interval: E, IntervalSet: _ };
class de {
  visitTerminal(t2) {
  }
  visitErrorNode(t2) {
  }
  enterEveryRule(t2) {
  }
  exitEveryRule(t2) {
  }
}
class ge {
  visit(t2) {
    return Array.isArray(t2) ? t2.map(function(t3) {
      return t3.accept(this);
    }, this) : t2.accept(this);
  }
  visitChildren(t2) {
    return t2.children ? this.visit(t2.children) : null;
  }
  visitTerminal(t2) {
  }
  visitErrorNode(t2) {
  }
}
class pe {
  walk(t2, e2) {
    if (e2 instanceof D || void 0 !== e2.isErrorNode && e2.isErrorNode()) t2.visitErrorNode(e2);
    else if (e2 instanceof b) t2.visitTerminal(e2);
    else {
      this.enterRule(t2, e2);
      for (let n2 = 0; n2 < e2.getChildCount(); n2++) {
        const s2 = e2.getChild(n2);
        this.walk(t2, s2);
      }
      this.exitRule(t2, e2);
    }
  }
  enterRule(t2, e2) {
    const n2 = e2.ruleContext;
    t2.enterEveryRule(n2), n2.enterRule(t2);
  }
  exitRule(t2, e2) {
    const n2 = e2.ruleContext;
    n2.exitRule(t2), t2.exitEveryRule(n2);
  }
}
pe.DEFAULT = new pe();
const fe = { Trees: M, RuleNode: P, ErrorNode: D, TerminalNode: b, ParseTreeListener: de, ParseTreeVisitor: ge, ParseTreeWalker: pe };
class xe extends Ft {
  constructor(t2) {
    super({ message: "", recognizer: t2, input: t2.getInputStream(), ctx: t2._ctx }), this.offendingToken = t2.getCurrentToken();
  }
}
class Te extends Ft {
  constructor(t2, e2, n2) {
    super({ message: Se(e2, n2 || null), recognizer: t2, input: t2.getInputStream(), ctx: t2._ctx });
    const s2 = t2._interp.atn.states[t2.state].transitions[0];
    s2 instanceof pt ? (this.ruleIndex = s2.ruleIndex, this.predicateIndex = s2.predIndex) : (this.ruleIndex = 0, this.predicateIndex = 0), this.predicate = e2, this.offendingToken = t2.getCurrentToken();
  }
}
function Se(t2, e2) {
  return null !== e2 ? e2 : "failed predicate: {" + t2 + "}?";
}
class me extends Ot {
  constructor(t2) {
    super(), t2 = t2 || true, this.exactOnly = t2;
  }
  reportAmbiguity(t2, e2, n2, s2, i2, r2, o2) {
    if (this.exactOnly && !i2) return;
    const a2 = "reportAmbiguity d=" + this.getDecisionDescription(t2, e2) + ": ambigAlts=" + this.getConflictingAlts(r2, o2) + ", input='" + t2.getTokenStream().getText(new E(n2, s2)) + "'";
    t2.notifyErrorListeners(a2);
  }
  reportAttemptingFullContext(t2, e2, n2, s2, i2, r2) {
    const o2 = "reportAttemptingFullContext d=" + this.getDecisionDescription(t2, e2) + ", input='" + t2.getTokenStream().getText(new E(n2, s2)) + "'";
    t2.notifyErrorListeners(o2);
  }
  reportContextSensitivity(t2, e2, n2, s2, i2, r2) {
    const o2 = "reportContextSensitivity d=" + this.getDecisionDescription(t2, e2) + ", input='" + t2.getTokenStream().getText(new E(n2, s2)) + "'";
    t2.notifyErrorListeners(o2);
  }
  getDecisionDescription(t2, e2) {
    const n2 = e2.decision, s2 = e2.atnStartState.ruleIndex, i2 = t2.ruleNames;
    if (s2 < 0 || s2 >= i2.length) return "" + n2;
    const r2 = i2[s2] || null;
    return null === r2 || 0 === r2.length ? "" + n2 : `${n2} (${r2})`;
  }
  getConflictingAlts(t2, e2) {
    if (null !== t2) return t2;
    const n2 = new W();
    for (let t3 = 0; t3 < e2.items.length; t3++) n2.set(e2.items[t3].alt);
    return `{${n2.values().join(", ")}}`;
  }
}
class Ee extends Error {
  constructor() {
    super(), Error.captureStackTrace(this, Ee);
  }
}
class _e {
  reset(t2) {
  }
  recoverInline(t2) {
  }
  recover(t2, e2) {
  }
  sync(t2) {
  }
  inErrorRecoveryMode(t2) {
  }
  reportError(t2) {
  }
}
class Ce extends _e {
  constructor() {
    super(), this.errorRecoveryMode = false, this.lastErrorIndex = -1, this.lastErrorStates = null, this.nextTokensContext = null, this.nextTokenState = 0;
  }
  reset(t2) {
    this.endErrorCondition(t2);
  }
  beginErrorCondition(t2) {
    this.errorRecoveryMode = true;
  }
  inErrorRecoveryMode(t2) {
    return this.errorRecoveryMode;
  }
  endErrorCondition(t2) {
    this.errorRecoveryMode = false, this.lastErrorStates = null, this.lastErrorIndex = -1;
  }
  reportMatch(t2) {
    this.endErrorCondition(t2);
  }
  reportError(t2, e2) {
    this.inErrorRecoveryMode(t2) || (this.beginErrorCondition(t2), e2 instanceof ee ? this.reportNoViableAlternative(t2, e2) : e2 instanceof xe ? this.reportInputMismatch(t2, e2) : e2 instanceof Te ? this.reportFailedPredicate(t2, e2) : (console.log("unknown recognition error type: " + e2.constructor.name), console.log(e2.stack), t2.notifyErrorListeners(e2.getOffendingToken(), e2.getMessage(), e2)));
  }
  recover(t2, e2) {
    this.lastErrorIndex === t2.getInputStream().index && null !== this.lastErrorStates && this.lastErrorStates.indexOf(t2.state) >= 0 && t2.consume(), this.lastErrorIndex = t2._input.index, null === this.lastErrorStates && (this.lastErrorStates = []), this.lastErrorStates.push(t2.state);
    const n2 = this.getErrorRecoverySet(t2);
    this.consumeUntil(t2, n2);
  }
  sync(t2) {
    if (this.inErrorRecoveryMode(t2)) return;
    const e2 = t2._interp.atn.states[t2.state], n2 = t2.getTokenStream().LA(1), s2 = t2.atn.nextTokens(e2);
    if (s2.contains(n2)) return this.nextTokensContext = null, void (this.nextTokenState = C.INVALID_STATE_NUMBER);
    if (s2.contains(i.EPSILON)) null === this.nextTokensContext && (this.nextTokensContext = t2._ctx, this.nextTokensState = t2._stateNumber);
    else switch (e2.stateType) {
      case C.BLOCK_START:
      case C.STAR_BLOCK_START:
      case C.PLUS_BLOCK_START:
      case C.STAR_LOOP_ENTRY:
        if (null !== this.singleTokenDeletion(t2)) return;
        throw new xe(t2);
      case C.PLUS_LOOP_BACK:
      case C.STAR_LOOP_BACK: {
        this.reportUnwantedToken(t2);
        const e3 = new _();
        e3.addSet(t2.getExpectedTokens());
        const n3 = e3.addSet(this.getErrorRecoverySet(t2));
        this.consumeUntil(t2, n3);
      }
    }
  }
  reportNoViableAlternative(t2, e2) {
    const n2 = t2.getTokenStream();
    let s2;
    s2 = null !== n2 ? e2.startToken.type === i.EOF ? "<EOF>" : n2.getText(new E(e2.startToken.tokenIndex, e2.offendingToken.tokenIndex)) : "<unknown input>";
    const r2 = "no viable alternative at input " + this.escapeWSAndQuote(s2);
    t2.notifyErrorListeners(r2, e2.offendingToken, e2);
  }
  reportInputMismatch(t2, e2) {
    const n2 = "mismatched input " + this.getTokenErrorDisplay(e2.offendingToken) + " expecting " + e2.getExpectedTokens().toString(t2.literalNames, t2.symbolicNames);
    t2.notifyErrorListeners(n2, e2.offendingToken, e2);
  }
  reportFailedPredicate(t2, e2) {
    const n2 = "rule " + t2.ruleNames[t2._ctx.ruleIndex] + " " + e2.message;
    t2.notifyErrorListeners(n2, e2.offendingToken, e2);
  }
  reportUnwantedToken(t2) {
    if (this.inErrorRecoveryMode(t2)) return;
    this.beginErrorCondition(t2);
    const e2 = t2.getCurrentToken(), n2 = "extraneous input " + this.getTokenErrorDisplay(e2) + " expecting " + this.getExpectedTokens(t2).toString(t2.literalNames, t2.symbolicNames);
    t2.notifyErrorListeners(n2, e2, null);
  }
  reportMissingToken(t2) {
    if (this.inErrorRecoveryMode(t2)) return;
    this.beginErrorCondition(t2);
    const e2 = t2.getCurrentToken(), n2 = "missing " + this.getExpectedTokens(t2).toString(t2.literalNames, t2.symbolicNames) + " at " + this.getTokenErrorDisplay(e2);
    t2.notifyErrorListeners(n2, e2, null);
  }
  recoverInline(t2) {
    const e2 = this.singleTokenDeletion(t2);
    if (null !== e2) return t2.consume(), e2;
    if (this.singleTokenInsertion(t2)) return this.getMissingSymbol(t2);
    throw new xe(t2);
  }
  singleTokenInsertion(t2) {
    const e2 = t2.getTokenStream().LA(1), n2 = t2._interp.atn, s2 = n2.states[t2.state].transitions[0].target;
    return !!n2.nextTokens(s2, t2._ctx).contains(e2) && (this.reportMissingToken(t2), true);
  }
  singleTokenDeletion(t2) {
    const e2 = t2.getTokenStream().LA(2);
    if (this.getExpectedTokens(t2).contains(e2)) {
      this.reportUnwantedToken(t2), t2.consume();
      const e3 = t2.getCurrentToken();
      return this.reportMatch(t2), e3;
    }
    return null;
  }
  getMissingSymbol(t2) {
    const e2 = t2.getCurrentToken(), n2 = this.getExpectedTokens(t2).first();
    let s2;
    s2 = n2 === i.EOF ? "<missing EOF>" : "<missing " + t2.literalNames[n2] + ">";
    let r2 = e2;
    const o2 = t2.getTokenStream().LT(-1);
    return r2.type === i.EOF && null !== o2 && (r2 = o2), t2.getTokenFactory().create(r2.source, n2, s2, i.DEFAULT_CHANNEL, -1, -1, r2.line, r2.column);
  }
  getExpectedTokens(t2) {
    return t2.getExpectedTokens();
  }
  getTokenErrorDisplay(t2) {
    if (null === t2) return "<no token>";
    let e2 = t2.text;
    return null === e2 && (e2 = t2.type === i.EOF ? "<EOF>" : "<" + t2.type + ">"), this.escapeWSAndQuote(e2);
  }
  escapeWSAndQuote(t2) {
    return "'" + (t2 = (t2 = (t2 = t2.replace(/\n/g, "\\n")).replace(/\r/g, "\\r")).replace(/\t/g, "\\t")) + "'";
  }
  getErrorRecoverySet(t2) {
    const e2 = t2._interp.atn;
    let n2 = t2._ctx;
    const s2 = new _();
    for (; null !== n2 && n2.invokingState >= 0; ) {
      const t3 = e2.states[n2.invokingState].transitions[0], i2 = e2.nextTokens(t3.followState);
      s2.addSet(i2), n2 = n2.parentCtx;
    }
    return s2.removeOne(i.EPSILON), s2;
  }
  consumeUntil(t2, e2) {
    let n2 = t2.getTokenStream().LA(1);
    for (; n2 !== i.EOF && !e2.contains(n2); ) t2.consume(), n2 = t2.getTokenStream().LA(1);
  }
}
class Ae extends Ce {
  constructor() {
    super();
  }
  recover(t2, e2) {
    let n2 = t2._ctx;
    for (; null !== n2; ) n2.exception = e2, n2 = n2.parentCtx;
    throw new Ee(e2);
  }
  recoverInline(t2) {
    this.recover(t2, new xe(t2));
  }
  sync(t2) {
  }
}
const Ne = { RecognitionException: Ft, NoViableAltException: ee, LexerNoViableAltException: Mt, InputMismatchException: xe, FailedPredicateException: Te, DiagnosticErrorListener: me, BailErrorStrategy: Ae, DefaultErrorStrategy: Ce, ErrorListener: Ot };
class ke {
  constructor(t2, e2) {
    if (this.name = "<empty>", this.strdata = t2, this.decodeToUnicodeCodePoints = e2 || false, this._index = 0, this.data = [], this.decodeToUnicodeCodePoints) for (let t3 = 0; t3 < this.strdata.length; ) {
      const e3 = this.strdata.codePointAt(t3);
      this.data.push(e3), t3 += e3 <= 65535 ? 1 : 2;
    }
    else {
      this.data = new Array(this.strdata.length);
      for (let t3 = 0; t3 < this.strdata.length; t3++) this.data[t3] = this.strdata.charCodeAt(t3);
    }
    this._size = this.data.length;
  }
  reset() {
    this._index = 0;
  }
  consume() {
    if (this._index >= this._size) throw "cannot consume EOF";
    this._index += 1;
  }
  LA(t2) {
    if (0 === t2) return 0;
    t2 < 0 && (t2 += 1);
    const e2 = this._index + t2 - 1;
    return e2 < 0 || e2 >= this._size ? i.EOF : this.data[e2];
  }
  LT(t2) {
    return this.LA(t2);
  }
  mark() {
    return -1;
  }
  release(t2) {
  }
  seek(t2) {
    t2 <= this._index ? this._index = t2 : this._index = Math.min(t2, this._size);
  }
  getText(t2, e2) {
    if (e2 >= this._size && (e2 = this._size - 1), t2 >= this._size) return "";
    if (this.decodeToUnicodeCodePoints) {
      let n2 = "";
      for (let s2 = t2; s2 <= e2; s2++) n2 += String.fromCodePoint(this.data[s2]);
      return n2;
    }
    return this.strdata.slice(t2, e2 + 1);
  }
  toString() {
    return this.strdata;
  }
  get index() {
    return this._index;
  }
  get size() {
    return this._size;
  }
}
class Ie extends ke {
  constructor(t2, e2) {
    super(t2, e2);
  }
}
var ye = n(763);
const Le = "undefined" != typeof process && null != process.versions && null != process.versions.node;
class Oe extends Ie {
  static fromPath(t2, e2, n2) {
    if (!Le) throw new Error("FileStream is only available when running in Node!");
    ye.readFile(t2, e2, function(t3, e3) {
      let s2 = null;
      null !== e3 && (s2 = new ke(e3, true)), n2(t3, s2);
    });
  }
  constructor(t2, e2, n2) {
    if (!Le) throw new Error("FileStream is only available when running in Node!");
    super(ye.readFileSync(t2, e2 || "utf-8"), n2), this.fileName = t2;
  }
}
const Re = { fromString: function(t2) {
  return new ke(t2, true);
}, fromBlob: function(t2, e2, n2, s2) {
  const i2 = new window.FileReader();
  i2.onload = function(t3) {
    const e3 = new ke(t3.target.result, true);
    n2(e3);
  }, i2.onerror = s2, i2.readAsText(t2, e2);
}, fromBuffer: function(t2, e2) {
  return new ke(t2.toString(e2), true);
}, fromPath: function(t2, e2, n2) {
  Oe.fromPath(t2, e2, n2);
}, fromPathSync: function(t2, e2) {
  return new Oe(t2, e2);
} }, we = { arrayToString: d, stringToCharArray: function(t2) {
  let e2 = new Uint16Array(t2.length);
  for (let n2 = 0; n2 < t2.length; n2++) e2[n2] = t2.charCodeAt(n2);
  return e2;
} };
class ve {
}
class Pe extends ve {
  constructor(t2) {
    super(), this.tokenSource = t2, this.tokens = [], this.index = -1, this.fetchedEOF = false;
  }
  mark() {
    return 0;
  }
  release(t2) {
  }
  reset() {
    this.seek(0);
  }
  seek(t2) {
    this.lazyInit(), this.index = this.adjustSeekIndex(t2);
  }
  get size() {
    return this.tokens.length;
  }
  get(t2) {
    return this.lazyInit(), this.tokens[t2];
  }
  consume() {
    let t2 = false;
    if (t2 = this.index >= 0 && (this.fetchedEOF ? this.index < this.tokens.length - 1 : this.index < this.tokens.length), !t2 && this.LA(1) === i.EOF) throw "cannot consume EOF";
    this.sync(this.index + 1) && (this.index = this.adjustSeekIndex(this.index + 1));
  }
  sync(t2) {
    const e2 = t2 - this.tokens.length + 1;
    return !(e2 > 0) || this.fetch(e2) >= e2;
  }
  fetch(t2) {
    if (this.fetchedEOF) return 0;
    for (let e2 = 0; e2 < t2; e2++) {
      const t3 = this.tokenSource.nextToken();
      if (t3.tokenIndex = this.tokens.length, this.tokens.push(t3), t3.type === i.EOF) return this.fetchedEOF = true, e2 + 1;
    }
    return t2;
  }
  getTokens(t2, e2, n2) {
    if (void 0 === n2 && (n2 = null), t2 < 0 || e2 < 0) return null;
    this.lazyInit();
    const s2 = [];
    e2 >= this.tokens.length && (e2 = this.tokens.length - 1);
    for (let r2 = t2; r2 < e2; r2++) {
      const t3 = this.tokens[r2];
      if (t3.type === i.EOF) break;
      (null === n2 || n2.contains(t3.type)) && s2.push(t3);
    }
    return s2;
  }
  LA(t2) {
    return this.LT(t2).type;
  }
  LB(t2) {
    return this.index - t2 < 0 ? null : this.tokens[this.index - t2];
  }
  LT(t2) {
    if (this.lazyInit(), 0 === t2) return null;
    if (t2 < 0) return this.LB(-t2);
    const e2 = this.index + t2 - 1;
    return this.sync(e2), e2 >= this.tokens.length ? this.tokens[this.tokens.length - 1] : this.tokens[e2];
  }
  adjustSeekIndex(t2) {
    return t2;
  }
  lazyInit() {
    -1 === this.index && this.setup();
  }
  setup() {
    this.sync(0), this.index = this.adjustSeekIndex(0);
  }
  setTokenSource(t2) {
    this.tokenSource = t2, this.tokens = [], this.index = -1, this.fetchedEOF = false;
  }
  nextTokenOnChannel(t2, e2) {
    if (this.sync(t2), t2 >= this.tokens.length) return -1;
    let n2 = this.tokens[t2];
    for (; n2.channel !== e2; ) {
      if (n2.type === i.EOF) return -1;
      t2 += 1, this.sync(t2), n2 = this.tokens[t2];
    }
    return t2;
  }
  previousTokenOnChannel(t2, e2) {
    for (; t2 >= 0 && this.tokens[t2].channel !== e2; ) t2 -= 1;
    return t2;
  }
  getHiddenTokensToRight(t2, e2) {
    if (void 0 === e2 && (e2 = -1), this.lazyInit(), t2 < 0 || t2 >= this.tokens.length) throw t2 + " not in 0.." + this.tokens.length - 1;
    const n2 = this.nextTokenOnChannel(t2 + 1, Ut.DEFAULT_TOKEN_CHANNEL), s2 = t2 + 1, i2 = -1 === n2 ? this.tokens.length - 1 : n2;
    return this.filterForChannel(s2, i2, e2);
  }
  getHiddenTokensToLeft(t2, e2) {
    if (void 0 === e2 && (e2 = -1), this.lazyInit(), t2 < 0 || t2 >= this.tokens.length) throw t2 + " not in 0.." + this.tokens.length - 1;
    const n2 = this.previousTokenOnChannel(t2 - 1, Ut.DEFAULT_TOKEN_CHANNEL);
    if (n2 === t2 - 1) return null;
    const s2 = n2 + 1, i2 = t2 - 1;
    return this.filterForChannel(s2, i2, e2);
  }
  filterForChannel(t2, e2, n2) {
    const s2 = [];
    for (let i2 = t2; i2 < e2 + 1; i2++) {
      const t3 = this.tokens[i2];
      -1 === n2 ? t3.channel !== Ut.DEFAULT_TOKEN_CHANNEL && s2.push(t3) : t3.channel === n2 && s2.push(t3);
    }
    return 0 === s2.length ? null : s2;
  }
  getSourceName() {
    return this.tokenSource.getSourceName();
  }
  getText(t2) {
    this.lazyInit(), this.fill(), t2 || (t2 = new E(0, this.tokens.length - 1));
    let e2 = t2.start;
    e2 instanceof i && (e2 = e2.tokenIndex);
    let n2 = t2.stop;
    if (n2 instanceof i && (n2 = n2.tokenIndex), null === e2 || null === n2 || e2 < 0 || n2 < 0) return "";
    n2 >= this.tokens.length && (n2 = this.tokens.length - 1);
    let s2 = "";
    for (let t3 = e2; t3 < n2 + 1; t3++) {
      const e3 = this.tokens[t3];
      if (e3.type === i.EOF) break;
      s2 += e3.text;
    }
    return s2;
  }
  fill() {
    for (this.lazyInit(); 1e3 === this.fetch(1e3); ) ;
  }
}
Object.defineProperty(Pe, "size", { get: function() {
  return this.tokens.length;
} });
class be extends Pe {
  constructor(t2, e2) {
    super(t2), this.channel = void 0 === e2 ? i.DEFAULT_CHANNEL : e2;
  }
  adjustSeekIndex(t2) {
    return this.nextTokenOnChannel(t2, this.channel);
  }
  LB(t2) {
    if (0 === t2 || this.index - t2 < 0) return null;
    let e2 = this.index, n2 = 1;
    for (; n2 <= t2; ) e2 = this.previousTokenOnChannel(e2 - 1, this.channel), n2 += 1;
    return e2 < 0 ? null : this.tokens[e2];
  }
  LT(t2) {
    if (this.lazyInit(), 0 === t2) return null;
    if (t2 < 0) return this.LB(-t2);
    let e2 = this.index, n2 = 1;
    for (; n2 < t2; ) this.sync(e2 + 1) && (e2 = this.nextTokenOnChannel(e2 + 1, this.channel)), n2 += 1;
    return this.tokens[e2];
  }
  getNumberOfOnChannelTokens() {
    let t2 = 0;
    this.fill();
    for (let e2 = 0; e2 < this.tokens.length; e2++) {
      const n2 = this.tokens[e2];
      if (n2.channel === this.channel && (t2 += 1), n2.type === i.EOF) break;
    }
    return t2;
  }
}
class De extends de {
  constructor(t2) {
    super(), this.parser = t2;
  }
  enterEveryRule(t2) {
    console.log("enter   " + this.parser.ruleNames[t2.ruleIndex] + ", LT(1)=" + this.parser._input.LT(1).text);
  }
  visitTerminal(t2) {
    console.log("consume " + t2.symbol + " rule " + this.parser.ruleNames[this.parser._ctx.ruleIndex]);
  }
  exitEveryRule(t2) {
    console.log("exit    " + this.parser.ruleNames[t2.ruleIndex] + ", LT(1)=" + this.parser._input.LT(1).text);
  }
}
class Fe extends vt {
  constructor(t2) {
    super(), this._input = null, this._errHandler = new Ce(), this._precedenceStack = [], this._precedenceStack.push(0), this._ctx = null, this.buildParseTrees = true, this._tracer = null, this._parseListeners = null, this._syntaxErrors = 0, this.setInputStream(t2);
  }
  reset() {
    null !== this._input && this._input.seek(0), this._errHandler.reset(this), this._ctx = null, this._syntaxErrors = 0, this.setTrace(false), this._precedenceStack = [], this._precedenceStack.push(0), null !== this._interp && this._interp.reset();
  }
  match(t2) {
    let e2 = this.getCurrentToken();
    return e2.type === t2 ? (this._errHandler.reportMatch(this), this.consume()) : (e2 = this._errHandler.recoverInline(this), this.buildParseTrees && -1 === e2.tokenIndex && this._ctx.addErrorNode(e2)), e2;
  }
  matchWildcard() {
    let t2 = this.getCurrentToken();
    return t2.type > 0 ? (this._errHandler.reportMatch(this), this.consume()) : (t2 = this._errHandler.recoverInline(this), this.buildParseTrees && -1 === t2.tokenIndex && this._ctx.addErrorNode(t2)), t2;
  }
  getParseListeners() {
    return this._parseListeners || [];
  }
  addParseListener(t2) {
    if (null === t2) throw "listener";
    null === this._parseListeners && (this._parseListeners = []), this._parseListeners.push(t2);
  }
  removeParseListener(t2) {
    if (null !== this._parseListeners) {
      const e2 = this._parseListeners.indexOf(t2);
      e2 >= 0 && this._parseListeners.splice(e2, 1), 0 === this._parseListeners.length && (this._parseListeners = null);
    }
  }
  removeParseListeners() {
    this._parseListeners = null;
  }
  triggerEnterRuleEvent() {
    if (null !== this._parseListeners) {
      const t2 = this._ctx;
      this._parseListeners.forEach(function(e2) {
        e2.enterEveryRule(t2), t2.enterRule(e2);
      });
    }
  }
  triggerExitRuleEvent() {
    if (null !== this._parseListeners) {
      const t2 = this._ctx;
      this._parseListeners.slice(0).reverse().forEach(function(e2) {
        t2.exitRule(e2), e2.exitEveryRule(t2);
      });
    }
  }
  getTokenFactory() {
    return this._input.tokenSource._factory;
  }
  setTokenFactory(t2) {
    this._input.tokenSource._factory = t2;
  }
  getATNWithBypassAlts() {
    const t2 = this.getSerializedATN();
    if (null === t2) throw "The current parser does not support an ATN with bypass alternatives.";
    let e2 = this.bypassAltsAtnCache[t2];
    if (null === e2) {
      const n2 = new Tt();
      n2.generateRuleBypassTransitions = true, e2 = new Lt(n2).deserialize(t2), this.bypassAltsAtnCache[t2] = e2;
    }
    return e2;
  }
  getInputStream() {
    return this.getTokenStream();
  }
  setInputStream(t2) {
    this.setTokenStream(t2);
  }
  getTokenStream() {
    return this._input;
  }
  setTokenStream(t2) {
    this._input = null, this.reset(), this._input = t2;
  }
  get syntaxErrorsCount() {
    return this._syntaxErrors;
  }
  getCurrentToken() {
    return this._input.LT(1);
  }
  notifyErrorListeners(t2, e2, n2) {
    n2 = n2 || null, null === (e2 = e2 || null) && (e2 = this.getCurrentToken()), this._syntaxErrors += 1;
    const s2 = e2.line, i2 = e2.column;
    this.getErrorListener().syntaxError(this, e2, s2, i2, t2, n2);
  }
  consume() {
    const t2 = this.getCurrentToken();
    t2.type !== i.EOF && this.getInputStream().consume();
    const e2 = null !== this._parseListeners && this._parseListeners.length > 0;
    if (this.buildParseTrees || e2) {
      let n2;
      n2 = this._errHandler.inErrorRecoveryMode(this) ? this._ctx.addErrorNode(t2) : this._ctx.addTokenNode(t2), n2.invokingState = this.state, e2 && this._parseListeners.forEach(function(t3) {
        n2 instanceof D || void 0 !== n2.isErrorNode && n2.isErrorNode() ? t3.visitErrorNode(n2) : n2 instanceof b && t3.visitTerminal(n2);
      });
    }
    return t2;
  }
  addContextToParseTree() {
    null !== this._ctx.parentCtx && this._ctx.parentCtx.addChild(this._ctx);
  }
  enterRule(t2, e2, n2) {
    this.state = e2, this._ctx = t2, this._ctx.start = this._input.LT(1), this.buildParseTrees && this.addContextToParseTree(), this.triggerEnterRuleEvent();
  }
  exitRule() {
    this._ctx.stop = this._input.LT(-1), this.triggerExitRuleEvent(), this.state = this._ctx.invokingState, this._ctx = this._ctx.parentCtx;
  }
  enterOuterAlt(t2, e2) {
    t2.setAltNumber(e2), this.buildParseTrees && this._ctx !== t2 && null !== this._ctx.parentCtx && (this._ctx.parentCtx.removeLastChild(), this._ctx.parentCtx.addChild(t2)), this._ctx = t2;
  }
  getPrecedence() {
    return 0 === this._precedenceStack.length ? -1 : this._precedenceStack[this._precedenceStack.length - 1];
  }
  enterRecursionRule(t2, e2, n2, s2) {
    this.state = e2, this._precedenceStack.push(s2), this._ctx = t2, this._ctx.start = this._input.LT(1), this.triggerEnterRuleEvent();
  }
  pushNewRecursionContext(t2, e2, n2) {
    const s2 = this._ctx;
    s2.parentCtx = t2, s2.invokingState = e2, s2.stop = this._input.LT(-1), this._ctx = t2, this._ctx.start = s2.start, this.buildParseTrees && this._ctx.addChild(s2), this.triggerEnterRuleEvent();
  }
  unrollRecursionContexts(t2) {
    this._precedenceStack.pop(), this._ctx.stop = this._input.LT(-1);
    const e2 = this._ctx, n2 = this.getParseListeners();
    if (null !== n2 && n2.length > 0) for (; this._ctx !== t2; ) this.triggerExitRuleEvent(), this._ctx = this._ctx.parentCtx;
    else this._ctx = t2;
    e2.parentCtx = t2, this.buildParseTrees && null !== t2 && t2.addChild(e2);
  }
  getInvokingContext(t2) {
    let e2 = this._ctx;
    for (; null !== e2; ) {
      if (e2.ruleIndex === t2) return e2;
      e2 = e2.parentCtx;
    }
    return null;
  }
  precpred(t2, e2) {
    return e2 >= this._precedenceStack[this._precedenceStack.length - 1];
  }
  inContext(t2) {
    return false;
  }
  isExpectedToken(t2) {
    const e2 = this._interp.atn;
    let n2 = this._ctx;
    const s2 = e2.states[this.state];
    let r2 = e2.nextTokens(s2);
    if (r2.contains(t2)) return true;
    if (!r2.contains(i.EPSILON)) return false;
    for (; null !== n2 && n2.invokingState >= 0 && r2.contains(i.EPSILON); ) {
      const s3 = e2.states[n2.invokingState].transitions[0];
      if (r2 = e2.nextTokens(s3.followState), r2.contains(t2)) return true;
      n2 = n2.parentCtx;
    }
    return !(!r2.contains(i.EPSILON) || t2 !== i.EOF);
  }
  getExpectedTokens() {
    return this._interp.atn.getExpectedTokens(this.state, this._ctx);
  }
  getExpectedTokensWithinCurrentRule() {
    const t2 = this._interp.atn, e2 = t2.states[this.state];
    return t2.nextTokens(e2);
  }
  getRuleIndex(t2) {
    const e2 = this.getRuleIndexMap()[t2];
    return null !== e2 ? e2 : -1;
  }
  getRuleInvocationStack(t2) {
    null === (t2 = t2 || null) && (t2 = this._ctx);
    const e2 = [];
    for (; null !== t2; ) {
      const n2 = t2.ruleIndex;
      n2 < 0 ? e2.push("n/a") : e2.push(this.ruleNames[n2]), t2 = t2.parentCtx;
    }
    return e2;
  }
  getDFAStrings() {
    return this._interp.decisionToDFA.toString();
  }
  dumpDFA() {
    let t2 = false;
    for (let e2 = 0; e2 < this._interp.decisionToDFA.length; e2++) {
      const n2 = this._interp.decisionToDFA[e2];
      n2.states.length > 0 && (t2 && console.log(), this.printer.println("Decision " + n2.decision + ":"), this.printer.print(n2.toString(this.literalNames, this.symbolicNames)), t2 = true);
    }
  }
  getSourceName() {
    return this._input.getSourceName();
  }
  setTrace(t2) {
    t2 ? (null !== this._tracer && this.removeParseListener(this._tracer), this._tracer = new De(this), this.addParseListener(this._tracer)) : (this.removeParseListener(this._tracer), this._tracer = null);
  }
}
Fe.bypassAltsAtnCache = {};
class Me extends b {
  constructor(t2) {
    super(), this.parentCtx = null, this.symbol = t2;
  }
  getChild(t2) {
    return null;
  }
  getSymbol() {
    return this.symbol;
  }
  getParent() {
    return this.parentCtx;
  }
  getPayload() {
    return this.symbol;
  }
  getSourceInterval() {
    if (null === this.symbol) return E.INVALID_INTERVAL;
    const t2 = this.symbol.tokenIndex;
    return new E(t2, t2);
  }
  getChildCount() {
    return 0;
  }
  accept(t2) {
    return t2.visitTerminal(this);
  }
  getText() {
    return this.symbol.text;
  }
  toString() {
    return this.symbol.type === i.EOF ? "<EOF>" : this.symbol.text;
  }
}
class Ue extends Me {
  constructor(t2) {
    super(t2);
  }
  isErrorNode() {
    return true;
  }
  accept(t2) {
    return t2.visitErrorNode(this);
  }
}
class Be extends U {
  constructor(t2, e2) {
    super(t2, e2), this.children = null, this.start = null, this.stop = null, this.exception = null;
  }
  copyFrom(t2) {
    this.parentCtx = t2.parentCtx, this.invokingState = t2.invokingState, this.children = null, this.start = t2.start, this.stop = t2.stop, t2.children && (this.children = [], t2.children.map(function(t3) {
      t3 instanceof Ue && (this.children.push(t3), t3.parentCtx = this);
    }, this));
  }
  enterRule(t2) {
  }
  exitRule(t2) {
  }
  addChild(t2) {
    return null === this.children && (this.children = []), this.children.push(t2), t2;
  }
  removeLastChild() {
    null !== this.children && this.children.pop();
  }
  addTokenNode(t2) {
    const e2 = new Me(t2);
    return this.addChild(e2), e2.parentCtx = this, e2;
  }
  addErrorNode(t2) {
    const e2 = new Ue(t2);
    return this.addChild(e2), e2.parentCtx = this, e2;
  }
  getChild(t2, e2) {
    if (e2 = e2 || null, null === this.children || t2 < 0 || t2 >= this.children.length) return null;
    if (null === e2) return this.children[t2];
    for (let n2 = 0; n2 < this.children.length; n2++) {
      const s2 = this.children[n2];
      if (s2 instanceof e2) {
        if (0 === t2) return s2;
        t2 -= 1;
      }
    }
    return null;
  }
  getToken(t2, e2) {
    if (null === this.children || e2 < 0 || e2 >= this.children.length) return null;
    for (let n2 = 0; n2 < this.children.length; n2++) {
      const s2 = this.children[n2];
      if (s2 instanceof b && s2.symbol.type === t2) {
        if (0 === e2) return s2;
        e2 -= 1;
      }
    }
    return null;
  }
  getTokens(t2) {
    if (null === this.children) return [];
    {
      const e2 = [];
      for (let n2 = 0; n2 < this.children.length; n2++) {
        const s2 = this.children[n2];
        s2 instanceof b && s2.symbol.type === t2 && e2.push(s2);
      }
      return e2;
    }
  }
  getTypedRuleContext(t2, e2) {
    return this.getChild(e2, t2);
  }
  getTypedRuleContexts(t2) {
    if (null === this.children) return [];
    {
      const e2 = [];
      for (let n2 = 0; n2 < this.children.length; n2++) {
        const s2 = this.children[n2];
        s2 instanceof t2 && e2.push(s2);
      }
      return e2;
    }
  }
  getChildCount() {
    return null === this.children ? 0 : this.children.length;
  }
  getSourceInterval() {
    return null === this.start || null === this.stop ? E.INVALID_INTERVAL : new E(this.start.tokenIndex, this.stop.tokenIndex);
  }
}
U.EMPTY = new Be();
class ze {
  static DEFAULT_PROGRAM_NAME = "default";
  constructor(t2) {
    this.tokens = t2, this.programs = /* @__PURE__ */ new Map();
  }
  getTokenStream() {
    return this.tokens;
  }
  insertAfter(t2, e2) {
    let n2, s2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : ze.DEFAULT_PROGRAM_NAME;
    n2 = "number" == typeof t2 ? t2 : t2.tokenIndex;
    let i2 = this.getProgram(s2), r2 = new He(this.tokens, n2, i2.length, e2);
    i2.push(r2);
  }
  insertBefore(t2, e2) {
    let n2, s2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : ze.DEFAULT_PROGRAM_NAME;
    n2 = "number" == typeof t2 ? t2 : t2.tokenIndex;
    const i2 = this.getProgram(s2), r2 = new qe(this.tokens, n2, i2.length, e2);
    i2.push(r2);
  }
  replaceSingle(t2, e2) {
    let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : ze.DEFAULT_PROGRAM_NAME;
    this.replace(t2, t2, e2, n2);
  }
  replace(t2, e2, n2) {
    let s2 = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : ze.DEFAULT_PROGRAM_NAME;
    if ("number" != typeof t2 && (t2 = t2.tokenIndex), "number" != typeof e2 && (e2 = e2.tokenIndex), t2 > e2 || t2 < 0 || e2 < 0 || e2 >= this.tokens.size) throw new RangeError(`replace: range invalid: ${t2}..${e2}(size=${this.tokens.size})`);
    let i2 = this.getProgram(s2), r2 = new Ke(this.tokens, t2, e2, i2.length, n2);
    i2.push(r2);
  }
  delete(t2, e2) {
    let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : ze.DEFAULT_PROGRAM_NAME;
    void 0 === e2 && (e2 = t2), this.replace(t2, e2, null, n2);
  }
  getProgram(t2) {
    let e2 = this.programs.get(t2);
    return null == e2 && (e2 = this.initializeProgram(t2)), e2;
  }
  initializeProgram(t2) {
    const e2 = [];
    return this.programs.set(t2, e2), e2;
  }
  getText(t2) {
    let e2, n2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : ze.DEFAULT_PROGRAM_NAME;
    e2 = t2 instanceof E ? t2 : new E(0, this.tokens.size - 1), "string" == typeof t2 && (n2 = t2);
    const s2 = this.programs.get(n2);
    let r2 = e2.start, o2 = e2.stop;
    if (o2 > this.tokens.size - 1 && (o2 = this.tokens.size - 1), r2 < 0 && (r2 = 0), null == s2 || 0 === s2.length) return this.tokens.getText(new E(r2, o2));
    let a2 = [], l2 = this.reduceToSingleOperationPerIndex(s2), h2 = r2;
    for (; h2 <= o2 && h2 < this.tokens.size; ) {
      let t3 = l2.get(h2);
      l2.delete(h2);
      let e3 = this.tokens.get(h2);
      null == t3 ? (e3.type !== i.EOF && a2.push(String(e3.text)), h2++) : h2 = t3.execute(a2);
    }
    if (o2 === this.tokens.size - 1) for (const t3 of l2.values()) t3.index >= this.tokens.size - 1 && a2.push(t3.text.toString());
    return a2.join("");
  }
  reduceToSingleOperationPerIndex(t2) {
    for (let e3 = 0; e3 < t2.length; e3++) {
      let n2 = t2[e3];
      if (null == n2) continue;
      if (!(n2 instanceof Ke)) continue;
      let s2 = n2, i2 = this.getKindOfOps(t2, qe, e3);
      for (let e4 of i2) e4.index === s2.index ? (t2[e4.instructionIndex] = void 0, s2.text = e4.text.toString() + (null != s2.text ? s2.text.toString() : "")) : e4.index > s2.index && e4.index <= s2.lastIndex && (t2[e4.instructionIndex] = void 0);
      let r2 = this.getKindOfOps(t2, Ke, e3);
      for (let e4 of r2) {
        if (e4.index >= s2.index && e4.lastIndex <= s2.lastIndex) {
          t2[e4.instructionIndex] = void 0;
          continue;
        }
        let n3 = e4.lastIndex < s2.index || e4.index > s2.lastIndex;
        if (null != e4.text || null != s2.text || n3) {
          if (!n3) throw new Error(`replace op boundaries of ${s2} overlap with previous ${e4}`);
        } else t2[e4.instructionIndex] = void 0, s2.index = Math.min(e4.index, s2.index), s2.lastIndex = Math.max(e4.lastIndex, s2.lastIndex);
      }
    }
    for (let e3 = 0; e3 < t2.length; e3++) {
      let n2 = t2[e3];
      if (null == n2) continue;
      if (!(n2 instanceof qe)) continue;
      let s2 = n2, i2 = this.getKindOfOps(t2, qe, e3);
      for (let e4 of i2) e4.index === s2.index && (e4 instanceof He ? (s2.text = this.catOpText(e4.text, s2.text), t2[e4.instructionIndex] = void 0) : e4 instanceof qe && (s2.text = this.catOpText(s2.text, e4.text), t2[e4.instructionIndex] = void 0));
      let r2 = this.getKindOfOps(t2, Ke, e3);
      for (let n3 of r2) if (s2.index !== n3.index) {
        if (s2.index >= n3.index && s2.index <= n3.lastIndex) throw new Error(`insert op ${s2} within boundaries of previous ${n3}`);
      } else n3.text = this.catOpText(s2.text, n3.text), t2[e3] = void 0;
    }
    let e2 = /* @__PURE__ */ new Map();
    for (let n2 of t2) if (null != n2) {
      if (null != e2.get(n2.index)) throw new Error("should only be one op per index");
      e2.set(n2.index, n2);
    }
    return e2;
  }
  catOpText(t2, e2) {
    let n2 = "", s2 = "";
    return null != t2 && (n2 = t2.toString()), null != e2 && (s2 = e2.toString()), n2 + s2;
  }
  getKindOfOps(t2, e2, n2) {
    return t2.slice(0, n2).filter((t3) => t3 && t3 instanceof e2);
  }
}
class Ve {
  constructor(t2, e2, n2, s2) {
    this.tokens = t2, this.instructionIndex = n2, this.index = e2, this.text = void 0 === s2 ? "" : s2;
  }
  toString() {
    let t2 = this.constructor.name;
    const e2 = t2.indexOf("$");
    return t2 = t2.substring(e2 + 1, t2.length), "<" + t2 + "@" + this.tokens.get(this.index) + ':"' + this.text + '">';
  }
}
class qe extends Ve {
  constructor(t2, e2, n2, s2) {
    super(t2, e2, n2, s2);
  }
  execute(t2) {
    return this.text && t2.push(this.text.toString()), this.tokens.get(this.index).type !== i.EOF && t2.push(String(this.tokens.get(this.index).text)), this.index + 1;
  }
}
class He extends qe {
  constructor(t2, e2, n2, s2) {
    super(t2, e2 + 1, n2, s2);
  }
}
class Ke extends Ve {
  constructor(t2, e2, n2, s2, i2) {
    super(t2, e2, s2, i2), this.lastIndex = n2;
  }
  execute(t2) {
    return this.text && t2.push(this.text.toString()), this.lastIndex + 1;
  }
  toString() {
    return null == this.text ? "<DeleteOp@" + this.tokens.get(this.index) + ".." + this.tokens.get(this.lastIndex) + ">" : "<ReplaceOp@" + this.tokens.get(this.index) + ".." + this.tokens.get(this.lastIndex) + ':"' + this.text + '">';
  }
}
const Ye = { atn: re, dfa: he, context: ce, misc: ue, tree: fe, error: Ne, Token: i, CommonToken: Pt, CharStreams: Re, CharStream: ke, InputStream: Ie, CommonTokenStream: be, Lexer: Ut, Parser: Fe, ParserRuleContext: Be, Interval: E, IntervalSet: _, LL1Analyzer: j, Utils: we, TokenStreamRewriter: ze };
s.MG;
s.fr;
s.sR;
s.Zo;
s.iH;
s.rt;
s.jB;
s.M8;
s.$t;
s.aq;
s.pG;
s.eP;
s.KU;
s.zW;
s.IX;
s.mY;
s.a7;
s.JG;
s.ay;
s.X2;
s.WU;
s.Uw;
s.gw;
s.iX;
s.re;
s.Pg;
s.tD;
s.R$;
s.Dj;
s.m7;
s.NZ;
s.xo;
s.ou;
s.qC;
s.mD;
var Ln = s.Ay;
const serializedATN$5 = [
  4,
  0,
  8,
  40,
  6,
  -1,
  2,
  0,
  7,
  0,
  2,
  1,
  7,
  1,
  2,
  2,
  7,
  2,
  2,
  3,
  7,
  3,
  2,
  4,
  7,
  4,
  2,
  5,
  7,
  5,
  2,
  6,
  7,
  6,
  2,
  7,
  7,
  7,
  1,
  0,
  1,
  0,
  1,
  1,
  1,
  1,
  1,
  2,
  1,
  2,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  4,
  1,
  4,
  1,
  4,
  1,
  5,
  1,
  5,
  1,
  5,
  1,
  6,
  1,
  6,
  1,
  6,
  1,
  7,
  4,
  7,
  37,
  8,
  7,
  11,
  7,
  12,
  7,
  38,
  0,
  0,
  8,
  1,
  1,
  3,
  2,
  5,
  3,
  7,
  4,
  9,
  5,
  11,
  6,
  13,
  7,
  15,
  8,
  1,
  0,
  1,
  4,
  0,
  48,
  57,
  65,
  90,
  95,
  95,
  97,
  122,
  40,
  0,
  1,
  1,
  0,
  0,
  0,
  0,
  3,
  1,
  0,
  0,
  0,
  0,
  5,
  1,
  0,
  0,
  0,
  0,
  7,
  1,
  0,
  0,
  0,
  0,
  9,
  1,
  0,
  0,
  0,
  0,
  11,
  1,
  0,
  0,
  0,
  0,
  13,
  1,
  0,
  0,
  0,
  0,
  15,
  1,
  0,
  0,
  0,
  1,
  17,
  1,
  0,
  0,
  0,
  3,
  19,
  1,
  0,
  0,
  0,
  5,
  21,
  1,
  0,
  0,
  0,
  7,
  23,
  1,
  0,
  0,
  0,
  9,
  26,
  1,
  0,
  0,
  0,
  11,
  29,
  1,
  0,
  0,
  0,
  13,
  32,
  1,
  0,
  0,
  0,
  15,
  36,
  1,
  0,
  0,
  0,
  17,
  18,
  5,
  46,
  0,
  0,
  18,
  2,
  1,
  0,
  0,
  0,
  19,
  20,
  5,
  91,
  0,
  0,
  20,
  4,
  1,
  0,
  0,
  0,
  21,
  22,
  5,
  93,
  0,
  0,
  22,
  6,
  1,
  0,
  0,
  0,
  23,
  24,
  5,
  91,
  0,
  0,
  24,
  25,
  5,
  39,
  0,
  0,
  25,
  8,
  1,
  0,
  0,
  0,
  26,
  27,
  5,
  39,
  0,
  0,
  27,
  28,
  5,
  93,
  0,
  0,
  28,
  10,
  1,
  0,
  0,
  0,
  29,
  30,
  5,
  91,
  0,
  0,
  30,
  31,
  5,
  34,
  0,
  0,
  31,
  12,
  1,
  0,
  0,
  0,
  32,
  33,
  5,
  34,
  0,
  0,
  33,
  34,
  5,
  93,
  0,
  0,
  34,
  14,
  1,
  0,
  0,
  0,
  35,
  37,
  7,
  0,
  0,
  0,
  36,
  35,
  1,
  0,
  0,
  0,
  37,
  38,
  1,
  0,
  0,
  0,
  38,
  36,
  1,
  0,
  0,
  0,
  38,
  39,
  1,
  0,
  0,
  0,
  39,
  16,
  1,
  0,
  0,
  0,
  2,
  0,
  38,
  0
];
const atn$5 = new Ln.atn.ATNDeserializer().deserialize(serializedATN$5);
const decisionsToDFA$5 = atn$5.decisionToState.map((ds, index) => new Ln.dfa.DFA(ds, index));
class PropExprLexer extends Ln.Lexer {
  static grammarFileName = "PropExpr.g4";
  static channelNames = ["DEFAULT_TOKEN_CHANNEL", "HIDDEN"];
  static modeNames = ["DEFAULT_MODE"];
  static literalNames = [
    null,
    "'.'",
    "'['",
    "']'",
    "'[''",
    "'']'",
    `'["'`,
    `'"]'`
  ];
  static symbolicNames = [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "WORD"
  ];
  static ruleNames = [
    "T__0",
    "T__1",
    "T__2",
    "T__3",
    "T__4",
    "T__5",
    "T__6",
    "WORD"
  ];
  constructor(input) {
    super(input);
    this._interp = new Ln.atn.LexerATNSimulator(this, atn$5, decisionsToDFA$5, new Ln.atn.PredictionContextCache());
  }
}
PropExprLexer.EOF = Ln.Token.EOF;
PropExprLexer.T__0 = 1;
PropExprLexer.T__1 = 2;
PropExprLexer.T__2 = 3;
PropExprLexer.T__3 = 4;
PropExprLexer.T__4 = 5;
PropExprLexer.T__5 = 6;
PropExprLexer.T__6 = 7;
PropExprLexer.WORD = 8;
class PropExprListener extends Ln.tree.ParseTreeListener {
  // Enter a parse tree produced by PropExprParser#prop.
  enterProp(ctx) {
  }
  // Exit a parse tree produced by PropExprParser#prop.
  exitProp(ctx) {
  }
  // Enter a parse tree produced by PropExprParser#expr.
  enterExpr(ctx) {
  }
  // Exit a parse tree produced by PropExprParser#expr.
  exitExpr(ctx) {
  }
  // Enter a parse tree produced by PropExprParser#expr1.
  enterExpr1(ctx) {
  }
  // Exit a parse tree produced by PropExprParser#expr1.
  exitExpr1(ctx) {
  }
  // Enter a parse tree produced by PropExprParser#expr2.
  enterExpr2(ctx) {
  }
  // Exit a parse tree produced by PropExprParser#expr2.
  exitExpr2(ctx) {
  }
}
const serializedATN$4 = [
  4,
  1,
  8,
  52,
  2,
  0,
  7,
  0,
  2,
  1,
  7,
  1,
  2,
  2,
  7,
  2,
  2,
  3,
  7,
  3,
  1,
  0,
  4,
  0,
  10,
  8,
  0,
  11,
  0,
  12,
  0,
  11,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  3,
  1,
  27,
  8,
  1,
  1,
  1,
  1,
  1,
  5,
  1,
  31,
  8,
  1,
  10,
  1,
  12,
  1,
  34,
  9,
  1,
  1,
  2,
  1,
  2,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  3,
  3,
  3,
  50,
  8,
  3,
  1,
  3,
  0,
  1,
  2,
  4,
  0,
  2,
  4,
  6,
  0,
  0,
  54,
  0,
  9,
  1,
  0,
  0,
  0,
  2,
  26,
  1,
  0,
  0,
  0,
  4,
  35,
  1,
  0,
  0,
  0,
  6,
  49,
  1,
  0,
  0,
  0,
  8,
  10,
  3,
  2,
  1,
  0,
  9,
  8,
  1,
  0,
  0,
  0,
  10,
  11,
  1,
  0,
  0,
  0,
  11,
  9,
  1,
  0,
  0,
  0,
  11,
  12,
  1,
  0,
  0,
  0,
  12,
  1,
  1,
  0,
  0,
  0,
  13,
  14,
  6,
  1,
  -1,
  0,
  14,
  27,
  3,
  4,
  2,
  0,
  15,
  16,
  3,
  4,
  2,
  0,
  16,
  17,
  5,
  1,
  0,
  0,
  17,
  27,
  1,
  0,
  0,
  0,
  18,
  19,
  3,
  4,
  2,
  0,
  19,
  20,
  5,
  1,
  0,
  0,
  20,
  21,
  3,
  4,
  2,
  0,
  21,
  27,
  1,
  0,
  0,
  0,
  22,
  23,
  3,
  4,
  2,
  0,
  23,
  24,
  3,
  6,
  3,
  0,
  24,
  25,
  5,
  1,
  0,
  0,
  25,
  27,
  1,
  0,
  0,
  0,
  26,
  13,
  1,
  0,
  0,
  0,
  26,
  15,
  1,
  0,
  0,
  0,
  26,
  18,
  1,
  0,
  0,
  0,
  26,
  22,
  1,
  0,
  0,
  0,
  27,
  32,
  1,
  0,
  0,
  0,
  28,
  29,
  10,
  1,
  0,
  0,
  29,
  31,
  3,
  2,
  1,
  2,
  30,
  28,
  1,
  0,
  0,
  0,
  31,
  34,
  1,
  0,
  0,
  0,
  32,
  30,
  1,
  0,
  0,
  0,
  32,
  33,
  1,
  0,
  0,
  0,
  33,
  3,
  1,
  0,
  0,
  0,
  34,
  32,
  1,
  0,
  0,
  0,
  35,
  36,
  5,
  8,
  0,
  0,
  36,
  5,
  1,
  0,
  0,
  0,
  37,
  38,
  5,
  2,
  0,
  0,
  38,
  39,
  3,
  4,
  2,
  0,
  39,
  40,
  5,
  3,
  0,
  0,
  40,
  50,
  1,
  0,
  0,
  0,
  41,
  42,
  5,
  4,
  0,
  0,
  42,
  43,
  3,
  4,
  2,
  0,
  43,
  44,
  5,
  5,
  0,
  0,
  44,
  50,
  1,
  0,
  0,
  0,
  45,
  46,
  5,
  6,
  0,
  0,
  46,
  47,
  3,
  4,
  2,
  0,
  47,
  48,
  5,
  7,
  0,
  0,
  48,
  50,
  1,
  0,
  0,
  0,
  49,
  37,
  1,
  0,
  0,
  0,
  49,
  41,
  1,
  0,
  0,
  0,
  49,
  45,
  1,
  0,
  0,
  0,
  50,
  7,
  1,
  0,
  0,
  0,
  4,
  11,
  26,
  32,
  49
];
const atn$4 = new Ln.atn.ATNDeserializer().deserialize(serializedATN$4);
const decisionsToDFA$4 = atn$4.decisionToState.map((ds, index) => new Ln.dfa.DFA(ds, index));
const sharedContextCache$2 = new Ln.atn.PredictionContextCache();
class PropExprParser extends Ln.Parser {
  static grammarFileName = "PropExpr.g4";
  static literalNames = [
    null,
    "'.'",
    "'['",
    "']'",
    "'[''",
    "'']'",
    `'["'`,
    `'"]'`
  ];
  static symbolicNames = [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "WORD"
  ];
  static ruleNames = ["prop", "expr", "expr1", "expr2"];
  constructor(input) {
    super(input);
    this._interp = new Ln.atn.ParserATNSimulator(this, atn$4, decisionsToDFA$4, sharedContextCache$2);
    this.ruleNames = PropExprParser.ruleNames;
    this.literalNames = PropExprParser.literalNames;
    this.symbolicNames = PropExprParser.symbolicNames;
  }
  sempred(localctx, ruleIndex, predIndex) {
    switch (ruleIndex) {
      case 1:
        return this.expr_sempred(localctx, predIndex);
      default:
        throw "No predicate with index:" + ruleIndex;
    }
  }
  expr_sempred(localctx, predIndex) {
    switch (predIndex) {
      case 0:
        return this.precpred(this._ctx, 1);
      default:
        throw "No predicate with index:" + predIndex;
    }
  }
  prop() {
    let localctx = new PropContext(this, this._ctx, this.state);
    this.enterRule(localctx, 0, PropExprParser.RULE_prop);
    var _la = 0;
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 9;
      this._errHandler.sync(this);
      _la = this._input.LA(1);
      do {
        this.state = 8;
        this.expr(0);
        this.state = 11;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
      } while (_la === 8);
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  expr(_p) {
    if (_p === void 0) {
      _p = 0;
    }
    const _parentctx = this._ctx;
    const _parentState = this.state;
    let localctx = new ExprContext$1(this, this._ctx, _parentState);
    let _prevctx = localctx;
    const _startState = 2;
    this.enterRecursionRule(localctx, 2, PropExprParser.RULE_expr, _p);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 26;
      this._errHandler.sync(this);
      var la_ = this._interp.adaptivePredict(this._input, 1, this._ctx);
      switch (la_) {
        case 1:
          this.state = 14;
          this.expr1();
          break;
        case 2:
          this.state = 15;
          this.expr1();
          this.state = 16;
          this.match(PropExprParser.T__0);
          break;
        case 3:
          this.state = 18;
          this.expr1();
          this.state = 19;
          this.match(PropExprParser.T__0);
          this.state = 20;
          this.expr1();
          break;
        case 4:
          this.state = 22;
          this.expr1();
          this.state = 23;
          this.expr2();
          this.state = 24;
          this.match(PropExprParser.T__0);
          break;
      }
      this._ctx.stop = this._input.LT(-1);
      this.state = 32;
      this._errHandler.sync(this);
      var _alt = this._interp.adaptivePredict(this._input, 2, this._ctx);
      while (_alt != 2 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER) {
        if (_alt === 1) {
          if (this._parseListeners !== null) {
            this.triggerExitRuleEvent();
          }
          _prevctx = localctx;
          localctx = new ExprContext$1(this, _parentctx, _parentState);
          this.pushNewRecursionContext(localctx, _startState, PropExprParser.RULE_expr);
          this.state = 28;
          if (!this.precpred(this._ctx, 1)) {
            throw new Ln.error.FailedPredicateException(this, "this.precpred(this._ctx, 1)");
          }
          this.state = 29;
          this.expr(2);
        }
        this.state = 34;
        this._errHandler.sync(this);
        _alt = this._interp.adaptivePredict(this._input, 2, this._ctx);
      }
    } catch (error) {
      if (error instanceof Ln.error.RecognitionException) {
        localctx.exception = error;
        this._errHandler.reportError(this, error);
        this._errHandler.recover(this, error);
      } else {
        throw error;
      }
    } finally {
      this.unrollRecursionContexts(_parentctx);
    }
    return localctx;
  }
  expr1() {
    let localctx = new Expr1Context$1(this, this._ctx, this.state);
    this.enterRule(localctx, 4, PropExprParser.RULE_expr1);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 35;
      this.match(PropExprParser.WORD);
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  expr2() {
    let localctx = new Expr2Context$1(this, this._ctx, this.state);
    this.enterRule(localctx, 6, PropExprParser.RULE_expr2);
    try {
      this.state = 49;
      this._errHandler.sync(this);
      switch (this._input.LA(1)) {
        case 2:
          this.enterOuterAlt(localctx, 1);
          this.state = 37;
          this.match(PropExprParser.T__1);
          this.state = 38;
          this.expr1();
          this.state = 39;
          this.match(PropExprParser.T__2);
          break;
        case 4:
          this.enterOuterAlt(localctx, 2);
          this.state = 41;
          this.match(PropExprParser.T__3);
          this.state = 42;
          this.expr1();
          this.state = 43;
          this.match(PropExprParser.T__4);
          break;
        case 6:
          this.enterOuterAlt(localctx, 3);
          this.state = 45;
          this.match(PropExprParser.T__5);
          this.state = 46;
          this.expr1();
          this.state = 47;
          this.match(PropExprParser.T__6);
          break;
        default:
          throw new Ln.error.NoViableAltException(this);
      }
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
}
PropExprParser.EOF = Ln.Token.EOF;
PropExprParser.T__0 = 1;
PropExprParser.T__1 = 2;
PropExprParser.T__2 = 3;
PropExprParser.T__3 = 4;
PropExprParser.T__4 = 5;
PropExprParser.T__5 = 6;
PropExprParser.T__6 = 7;
PropExprParser.WORD = 8;
PropExprParser.RULE_prop = 0;
PropExprParser.RULE_expr = 1;
PropExprParser.RULE_expr1 = 2;
PropExprParser.RULE_expr2 = 3;
class PropContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = PropExprParser.RULE_prop;
  }
  expr = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(ExprContext$1);
    } else {
      return this.getTypedRuleContext(ExprContext$1, i2);
    }
  };
  enterRule(listener) {
    if (listener instanceof PropExprListener) {
      listener.enterProp(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof PropExprListener) {
      listener.exitProp(this);
    }
  }
}
let ExprContext$1 = class ExprContext2 extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = PropExprParser.RULE_expr;
  }
  expr1 = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(Expr1Context$1);
    } else {
      return this.getTypedRuleContext(Expr1Context$1, i2);
    }
  };
  expr2() {
    return this.getTypedRuleContext(Expr2Context$1, 0);
  }
  expr = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(ExprContext2);
    } else {
      return this.getTypedRuleContext(ExprContext2, i2);
    }
  };
  enterRule(listener) {
    if (listener instanceof PropExprListener) {
      listener.enterExpr(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof PropExprListener) {
      listener.exitExpr(this);
    }
  }
};
let Expr1Context$1 = class Expr1Context2 extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = PropExprParser.RULE_expr1;
  }
  WORD() {
    return this.getToken(PropExprParser.WORD, 0);
  }
  enterRule(listener) {
    if (listener instanceof PropExprListener) {
      listener.enterExpr1(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof PropExprListener) {
      listener.exitExpr1(this);
    }
  }
};
let Expr2Context$1 = class Expr2Context2 extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = PropExprParser.RULE_expr2;
  }
  expr1() {
    return this.getTypedRuleContext(Expr1Context$1, 0);
  }
  enterRule(listener) {
    if (listener instanceof PropExprListener) {
      listener.enterExpr2(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof PropExprListener) {
      listener.exitExpr2(this);
    }
  }
};
PropExprParser.PropContext = PropContext;
PropExprParser.ExprContext = ExprContext$1;
PropExprParser.Expr1Context = Expr1Context$1;
PropExprParser.Expr2Context = Expr2Context$1;
const serializedATN$3 = [
  4,
  0,
  24,
  135,
  6,
  -1,
  2,
  0,
  7,
  0,
  2,
  1,
  7,
  1,
  2,
  2,
  7,
  2,
  2,
  3,
  7,
  3,
  2,
  4,
  7,
  4,
  2,
  5,
  7,
  5,
  2,
  6,
  7,
  6,
  2,
  7,
  7,
  7,
  2,
  8,
  7,
  8,
  2,
  9,
  7,
  9,
  2,
  10,
  7,
  10,
  2,
  11,
  7,
  11,
  2,
  12,
  7,
  12,
  2,
  13,
  7,
  13,
  2,
  14,
  7,
  14,
  2,
  15,
  7,
  15,
  2,
  16,
  7,
  16,
  2,
  17,
  7,
  17,
  2,
  18,
  7,
  18,
  2,
  19,
  7,
  19,
  2,
  20,
  7,
  20,
  2,
  21,
  7,
  21,
  2,
  22,
  7,
  22,
  2,
  23,
  7,
  23,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  1,
  1,
  1,
  1,
  2,
  1,
  2,
  1,
  2,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  4,
  1,
  4,
  1,
  5,
  1,
  5,
  1,
  6,
  1,
  6,
  1,
  6,
  1,
  6,
  1,
  6,
  1,
  6,
  1,
  7,
  1,
  7,
  1,
  7,
  1,
  7,
  1,
  7,
  1,
  7,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  9,
  1,
  9,
  1,
  10,
  1,
  10,
  1,
  10,
  1,
  11,
  1,
  11,
  1,
  11,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  13,
  1,
  13,
  1,
  13,
  1,
  14,
  1,
  14,
  1,
  15,
  1,
  15,
  1,
  16,
  1,
  16,
  1,
  16,
  1,
  17,
  1,
  17,
  1,
  17,
  1,
  18,
  1,
  18,
  1,
  18,
  1,
  19,
  1,
  19,
  1,
  19,
  1,
  20,
  4,
  20,
  114,
  8,
  20,
  11,
  20,
  12,
  20,
  115,
  1,
  21,
  4,
  21,
  119,
  8,
  21,
  11,
  21,
  12,
  21,
  120,
  1,
  21,
  1,
  21,
  4,
  21,
  125,
  8,
  21,
  11,
  21,
  12,
  21,
  126,
  1,
  22,
  4,
  22,
  130,
  8,
  22,
  11,
  22,
  12,
  22,
  131,
  1,
  23,
  1,
  23,
  0,
  0,
  24,
  1,
  1,
  3,
  2,
  5,
  3,
  7,
  4,
  9,
  5,
  11,
  6,
  13,
  7,
  15,
  8,
  17,
  9,
  19,
  10,
  21,
  11,
  23,
  12,
  25,
  13,
  27,
  14,
  29,
  15,
  31,
  16,
  33,
  17,
  35,
  18,
  37,
  19,
  39,
  20,
  41,
  21,
  43,
  22,
  45,
  23,
  47,
  24,
  1,
  0,
  2,
  1,
  0,
  48,
  57,
  4,
  0,
  48,
  57,
  65,
  90,
  95,
  95,
  97,
  122,
  138,
  0,
  1,
  1,
  0,
  0,
  0,
  0,
  3,
  1,
  0,
  0,
  0,
  0,
  5,
  1,
  0,
  0,
  0,
  0,
  7,
  1,
  0,
  0,
  0,
  0,
  9,
  1,
  0,
  0,
  0,
  0,
  11,
  1,
  0,
  0,
  0,
  0,
  13,
  1,
  0,
  0,
  0,
  0,
  15,
  1,
  0,
  0,
  0,
  0,
  17,
  1,
  0,
  0,
  0,
  0,
  19,
  1,
  0,
  0,
  0,
  0,
  21,
  1,
  0,
  0,
  0,
  0,
  23,
  1,
  0,
  0,
  0,
  0,
  25,
  1,
  0,
  0,
  0,
  0,
  27,
  1,
  0,
  0,
  0,
  0,
  29,
  1,
  0,
  0,
  0,
  0,
  31,
  1,
  0,
  0,
  0,
  0,
  33,
  1,
  0,
  0,
  0,
  0,
  35,
  1,
  0,
  0,
  0,
  0,
  37,
  1,
  0,
  0,
  0,
  0,
  39,
  1,
  0,
  0,
  0,
  0,
  41,
  1,
  0,
  0,
  0,
  0,
  43,
  1,
  0,
  0,
  0,
  0,
  45,
  1,
  0,
  0,
  0,
  0,
  47,
  1,
  0,
  0,
  0,
  1,
  49,
  1,
  0,
  0,
  0,
  3,
  52,
  1,
  0,
  0,
  0,
  5,
  54,
  1,
  0,
  0,
  0,
  7,
  57,
  1,
  0,
  0,
  0,
  9,
  60,
  1,
  0,
  0,
  0,
  11,
  62,
  1,
  0,
  0,
  0,
  13,
  64,
  1,
  0,
  0,
  0,
  15,
  70,
  1,
  0,
  0,
  0,
  17,
  76,
  1,
  0,
  0,
  0,
  19,
  80,
  1,
  0,
  0,
  0,
  21,
  82,
  1,
  0,
  0,
  0,
  23,
  85,
  1,
  0,
  0,
  0,
  25,
  88,
  1,
  0,
  0,
  0,
  27,
  93,
  1,
  0,
  0,
  0,
  29,
  96,
  1,
  0,
  0,
  0,
  31,
  98,
  1,
  0,
  0,
  0,
  33,
  100,
  1,
  0,
  0,
  0,
  35,
  103,
  1,
  0,
  0,
  0,
  37,
  106,
  1,
  0,
  0,
  0,
  39,
  109,
  1,
  0,
  0,
  0,
  41,
  113,
  1,
  0,
  0,
  0,
  43,
  118,
  1,
  0,
  0,
  0,
  45,
  129,
  1,
  0,
  0,
  0,
  47,
  133,
  1,
  0,
  0,
  0,
  49,
  50,
  5,
  47,
  0,
  0,
  50,
  51,
  5,
  47,
  0,
  0,
  51,
  2,
  1,
  0,
  0,
  0,
  52,
  53,
  5,
  10,
  0,
  0,
  53,
  4,
  1,
  0,
  0,
  0,
  54,
  55,
  5,
  47,
  0,
  0,
  55,
  56,
  5,
  42,
  0,
  0,
  56,
  6,
  1,
  0,
  0,
  0,
  57,
  58,
  5,
  42,
  0,
  0,
  58,
  59,
  5,
  47,
  0,
  0,
  59,
  8,
  1,
  0,
  0,
  0,
  60,
  61,
  5,
  40,
  0,
  0,
  61,
  10,
  1,
  0,
  0,
  0,
  62,
  63,
  5,
  41,
  0,
  0,
  63,
  12,
  1,
  0,
  0,
  0,
  64,
  65,
  5,
  70,
  0,
  0,
  65,
  66,
  5,
  85,
  0,
  0,
  66,
  67,
  5,
  78,
  0,
  0,
  67,
  68,
  5,
  67,
  0,
  0,
  68,
  69,
  5,
  46,
  0,
  0,
  69,
  14,
  1,
  0,
  0,
  0,
  70,
  71,
  5,
  83,
  0,
  0,
  71,
  72,
  5,
  108,
  0,
  0,
  72,
  73,
  5,
  101,
  0,
  0,
  73,
  74,
  5,
  101,
  0,
  0,
  74,
  75,
  5,
  112,
  0,
  0,
  75,
  16,
  1,
  0,
  0,
  0,
  76,
  77,
  5,
  87,
  0,
  0,
  77,
  78,
  5,
  83,
  0,
  0,
  78,
  79,
  5,
  46,
  0,
  0,
  79,
  18,
  1,
  0,
  0,
  0,
  80,
  81,
  5,
  46,
  0,
  0,
  81,
  20,
  1,
  0,
  0,
  0,
  82,
  83,
  5,
  85,
  0,
  0,
  83,
  84,
  5,
  46,
  0,
  0,
  84,
  22,
  1,
  0,
  0,
  0,
  85,
  86,
  5,
  63,
  0,
  0,
  86,
  87,
  5,
  46,
  0,
  0,
  87,
  24,
  1,
  0,
  0,
  0,
  88,
  89,
  5,
  84,
  0,
  0,
  89,
  90,
  5,
  65,
  0,
  0,
  90,
  91,
  5,
  83,
  0,
  0,
  91,
  92,
  5,
  75,
  0,
  0,
  92,
  26,
  1,
  0,
  0,
  0,
  93,
  94,
  5,
  71,
  0,
  0,
  94,
  95,
  5,
  79,
  0,
  0,
  95,
  28,
  1,
  0,
  0,
  0,
  96,
  97,
  5,
  91,
  0,
  0,
  97,
  30,
  1,
  0,
  0,
  0,
  98,
  99,
  5,
  93,
  0,
  0,
  99,
  32,
  1,
  0,
  0,
  0,
  100,
  101,
  5,
  91,
  0,
  0,
  101,
  102,
  5,
  39,
  0,
  0,
  102,
  34,
  1,
  0,
  0,
  0,
  103,
  104,
  5,
  39,
  0,
  0,
  104,
  105,
  5,
  93,
  0,
  0,
  105,
  36,
  1,
  0,
  0,
  0,
  106,
  107,
  5,
  91,
  0,
  0,
  107,
  108,
  5,
  34,
  0,
  0,
  108,
  38,
  1,
  0,
  0,
  0,
  109,
  110,
  5,
  34,
  0,
  0,
  110,
  111,
  5,
  93,
  0,
  0,
  111,
  40,
  1,
  0,
  0,
  0,
  112,
  114,
  7,
  0,
  0,
  0,
  113,
  112,
  1,
  0,
  0,
  0,
  114,
  115,
  1,
  0,
  0,
  0,
  115,
  113,
  1,
  0,
  0,
  0,
  115,
  116,
  1,
  0,
  0,
  0,
  116,
  42,
  1,
  0,
  0,
  0,
  117,
  119,
  7,
  0,
  0,
  0,
  118,
  117,
  1,
  0,
  0,
  0,
  119,
  120,
  1,
  0,
  0,
  0,
  120,
  118,
  1,
  0,
  0,
  0,
  120,
  121,
  1,
  0,
  0,
  0,
  121,
  122,
  1,
  0,
  0,
  0,
  122,
  124,
  5,
  46,
  0,
  0,
  123,
  125,
  7,
  0,
  0,
  0,
  124,
  123,
  1,
  0,
  0,
  0,
  125,
  126,
  1,
  0,
  0,
  0,
  126,
  124,
  1,
  0,
  0,
  0,
  126,
  127,
  1,
  0,
  0,
  0,
  127,
  44,
  1,
  0,
  0,
  0,
  128,
  130,
  7,
  1,
  0,
  0,
  129,
  128,
  1,
  0,
  0,
  0,
  130,
  131,
  1,
  0,
  0,
  0,
  131,
  129,
  1,
  0,
  0,
  0,
  131,
  132,
  1,
  0,
  0,
  0,
  132,
  46,
  1,
  0,
  0,
  0,
  133,
  134,
  9,
  0,
  0,
  0,
  134,
  48,
  1,
  0,
  0,
  0,
  5,
  0,
  115,
  120,
  126,
  131,
  0
];
const atn$3 = new Ln.atn.ATNDeserializer().deserialize(serializedATN$3);
const decisionsToDFA$3 = atn$3.decisionToState.map((ds, index) => new Ln.dfa.DFA(ds, index));
class CustomCompileExprLexer extends Ln.Lexer {
  static grammarFileName = "CustomCompileExpr.g4";
  static channelNames = ["DEFAULT_TOKEN_CHANNEL", "HIDDEN"];
  static modeNames = ["DEFAULT_MODE"];
  static literalNames = [
    null,
    "'//'",
    "'\\n'",
    "'/*'",
    "'*/'",
    "'('",
    "')'",
    "'FUNC.'",
    "'Sleep'",
    "'WS.'",
    "'.'",
    "'U.'",
    "'?.'",
    "'TASK'",
    "'GO'",
    "'['",
    "']'",
    "'[''",
    "'']'",
    `'["'`,
    `'"]'`
  ];
  static symbolicNames = [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "INTEGER",
    "DECIMAL",
    "VAR",
    "UNKONW"
  ];
  static ruleNames = [
    "T__0",
    "T__1",
    "T__2",
    "T__3",
    "T__4",
    "T__5",
    "T__6",
    "T__7",
    "T__8",
    "T__9",
    "T__10",
    "T__11",
    "T__12",
    "T__13",
    "T__14",
    "T__15",
    "T__16",
    "T__17",
    "T__18",
    "T__19",
    "INTEGER",
    "DECIMAL",
    "VAR",
    "UNKONW"
  ];
  constructor(input) {
    super(input);
    this._interp = new Ln.atn.LexerATNSimulator(this, atn$3, decisionsToDFA$3, new Ln.atn.PredictionContextCache());
  }
}
CustomCompileExprLexer.EOF = Ln.Token.EOF;
CustomCompileExprLexer.T__0 = 1;
CustomCompileExprLexer.T__1 = 2;
CustomCompileExprLexer.T__2 = 3;
CustomCompileExprLexer.T__3 = 4;
CustomCompileExprLexer.T__4 = 5;
CustomCompileExprLexer.T__5 = 6;
CustomCompileExprLexer.T__6 = 7;
CustomCompileExprLexer.T__7 = 8;
CustomCompileExprLexer.T__8 = 9;
CustomCompileExprLexer.T__9 = 10;
CustomCompileExprLexer.T__10 = 11;
CustomCompileExprLexer.T__11 = 12;
CustomCompileExprLexer.T__12 = 13;
CustomCompileExprLexer.T__13 = 14;
CustomCompileExprLexer.T__14 = 15;
CustomCompileExprLexer.T__15 = 16;
CustomCompileExprLexer.T__16 = 17;
CustomCompileExprLexer.T__17 = 18;
CustomCompileExprLexer.T__18 = 19;
CustomCompileExprLexer.T__19 = 20;
CustomCompileExprLexer.INTEGER = 21;
CustomCompileExprLexer.DECIMAL = 22;
CustomCompileExprLexer.VAR = 23;
CustomCompileExprLexer.UNKONW = 24;
class CustomCompileExprListener extends Ln.tree.ParseTreeListener {
  // Enter a parse tree produced by CustomCompileExprParser#allExpr.
  enterAllExpr(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#allExpr.
  exitAllExpr(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#expr.
  enterExpr(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#expr.
  exitExpr(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#comment.
  enterComment(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#comment.
  exitComment(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#bracketExpr.
  enterBracketExpr(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#bracketExpr.
  exitBracketExpr(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#varFUNC.
  enterVarFUNC(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#varFUNC.
  exitVarFUNC(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#sleepFunc.
  enterSleepFunc(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#sleepFunc.
  exitSleepFunc(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#varWS.
  enterVarWS(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#varWS.
  exitVarWS(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#uProp.
  enterUProp(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#uProp.
  exitUProp(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#propExpr.
  enterPropExpr(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#propExpr.
  exitPropExpr(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#taskRun.
  enterTaskRun(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#taskRun.
  exitTaskRun(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#goRun.
  enterGoRun(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#goRun.
  exitGoRun(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#expr1.
  enterExpr1(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#expr1.
  exitExpr1(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#expr2.
  enterExpr2(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#expr2.
  exitExpr2(ctx) {
  }
  // Enter a parse tree produced by CustomCompileExprParser#number.
  enterNumber(ctx) {
  }
  // Exit a parse tree produced by CustomCompileExprParser#number.
  exitNumber(ctx) {
  }
}
const serializedATN$2 = [
  4,
  1,
  24,
  158,
  2,
  0,
  7,
  0,
  2,
  1,
  7,
  1,
  2,
  2,
  7,
  2,
  2,
  3,
  7,
  3,
  2,
  4,
  7,
  4,
  2,
  5,
  7,
  5,
  2,
  6,
  7,
  6,
  2,
  7,
  7,
  7,
  2,
  8,
  7,
  8,
  2,
  9,
  7,
  9,
  2,
  10,
  7,
  10,
  2,
  11,
  7,
  11,
  2,
  12,
  7,
  12,
  2,
  13,
  7,
  13,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  4,
  0,
  38,
  8,
  0,
  11,
  0,
  12,
  0,
  39,
  5,
  0,
  42,
  8,
  0,
  10,
  0,
  12,
  0,
  45,
  9,
  0,
  1,
  0,
  1,
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  3,
  1,
  56,
  8,
  1,
  1,
  2,
  1,
  2,
  5,
  2,
  60,
  8,
  2,
  10,
  2,
  12,
  2,
  63,
  9,
  2,
  1,
  2,
  1,
  2,
  1,
  2,
  5,
  2,
  68,
  8,
  2,
  10,
  2,
  12,
  2,
  71,
  9,
  2,
  1,
  2,
  1,
  2,
  1,
  2,
  5,
  2,
  76,
  8,
  2,
  10,
  2,
  12,
  2,
  79,
  9,
  2,
  1,
  2,
  3,
  2,
  82,
  8,
  2,
  1,
  3,
  1,
  3,
  1,
  3,
  5,
  3,
  87,
  8,
  3,
  10,
  3,
  12,
  3,
  90,
  9,
  3,
  1,
  3,
  1,
  3,
  1,
  4,
  1,
  4,
  1,
  4,
  1,
  4,
  1,
  5,
  1,
  5,
  1,
  5,
  1,
  6,
  1,
  6,
  1,
  6,
  1,
  6,
  1,
  6,
  1,
  6,
  1,
  7,
  1,
  7,
  4,
  7,
  109,
  8,
  7,
  11,
  7,
  12,
  7,
  110,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  1,
  8,
  5,
  8,
  127,
  8,
  8,
  10,
  8,
  12,
  8,
  130,
  9,
  8,
  1,
  9,
  1,
  9,
  1,
  9,
  1,
  10,
  1,
  10,
  1,
  10,
  1,
  10,
  1,
  10,
  1,
  11,
  1,
  11,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  1,
  12,
  3,
  12,
  154,
  8,
  12,
  1,
  13,
  1,
  13,
  1,
  13,
  5,
  39,
  61,
  69,
  77,
  88,
  1,
  16,
  14,
  0,
  2,
  4,
  6,
  8,
  10,
  12,
  14,
  16,
  18,
  20,
  22,
  24,
  26,
  0,
  2,
  1,
  0,
  5,
  5,
  1,
  0,
  21,
  22,
  173,
  0,
  43,
  1,
  0,
  0,
  0,
  2,
  55,
  1,
  0,
  0,
  0,
  4,
  81,
  1,
  0,
  0,
  0,
  6,
  83,
  1,
  0,
  0,
  0,
  8,
  93,
  1,
  0,
  0,
  0,
  10,
  97,
  1,
  0,
  0,
  0,
  12,
  100,
  1,
  0,
  0,
  0,
  14,
  106,
  1,
  0,
  0,
  0,
  16,
  112,
  1,
  0,
  0,
  0,
  18,
  131,
  1,
  0,
  0,
  0,
  20,
  134,
  1,
  0,
  0,
  0,
  22,
  139,
  1,
  0,
  0,
  0,
  24,
  153,
  1,
  0,
  0,
  0,
  26,
  155,
  1,
  0,
  0,
  0,
  28,
  42,
  3,
  4,
  2,
  0,
  29,
  42,
  3,
  6,
  3,
  0,
  30,
  42,
  3,
  14,
  7,
  0,
  31,
  42,
  3,
  12,
  6,
  0,
  32,
  42,
  3,
  8,
  4,
  0,
  33,
  42,
  3,
  10,
  5,
  0,
  34,
  42,
  3,
  20,
  10,
  0,
  35,
  42,
  3,
  18,
  9,
  0,
  36,
  38,
  9,
  0,
  0,
  0,
  37,
  36,
  1,
  0,
  0,
  0,
  38,
  39,
  1,
  0,
  0,
  0,
  39,
  40,
  1,
  0,
  0,
  0,
  39,
  37,
  1,
  0,
  0,
  0,
  40,
  42,
  1,
  0,
  0,
  0,
  41,
  28,
  1,
  0,
  0,
  0,
  41,
  29,
  1,
  0,
  0,
  0,
  41,
  30,
  1,
  0,
  0,
  0,
  41,
  31,
  1,
  0,
  0,
  0,
  41,
  32,
  1,
  0,
  0,
  0,
  41,
  33,
  1,
  0,
  0,
  0,
  41,
  34,
  1,
  0,
  0,
  0,
  41,
  35,
  1,
  0,
  0,
  0,
  41,
  37,
  1,
  0,
  0,
  0,
  42,
  45,
  1,
  0,
  0,
  0,
  43,
  41,
  1,
  0,
  0,
  0,
  43,
  44,
  1,
  0,
  0,
  0,
  44,
  46,
  1,
  0,
  0,
  0,
  45,
  43,
  1,
  0,
  0,
  0,
  46,
  47,
  5,
  0,
  0,
  1,
  47,
  1,
  1,
  0,
  0,
  0,
  48,
  56,
  3,
  6,
  3,
  0,
  49,
  56,
  3,
  14,
  7,
  0,
  50,
  56,
  3,
  12,
  6,
  0,
  51,
  56,
  3,
  8,
  4,
  0,
  52,
  56,
  3,
  10,
  5,
  0,
  53,
  56,
  3,
  20,
  10,
  0,
  54,
  56,
  3,
  18,
  9,
  0,
  55,
  48,
  1,
  0,
  0,
  0,
  55,
  49,
  1,
  0,
  0,
  0,
  55,
  50,
  1,
  0,
  0,
  0,
  55,
  51,
  1,
  0,
  0,
  0,
  55,
  52,
  1,
  0,
  0,
  0,
  55,
  53,
  1,
  0,
  0,
  0,
  55,
  54,
  1,
  0,
  0,
  0,
  56,
  3,
  1,
  0,
  0,
  0,
  57,
  61,
  5,
  1,
  0,
  0,
  58,
  60,
  9,
  0,
  0,
  0,
  59,
  58,
  1,
  0,
  0,
  0,
  60,
  63,
  1,
  0,
  0,
  0,
  61,
  62,
  1,
  0,
  0,
  0,
  61,
  59,
  1,
  0,
  0,
  0,
  62,
  64,
  1,
  0,
  0,
  0,
  63,
  61,
  1,
  0,
  0,
  0,
  64,
  82,
  5,
  2,
  0,
  0,
  65,
  69,
  5,
  1,
  0,
  0,
  66,
  68,
  9,
  0,
  0,
  0,
  67,
  66,
  1,
  0,
  0,
  0,
  68,
  71,
  1,
  0,
  0,
  0,
  69,
  70,
  1,
  0,
  0,
  0,
  69,
  67,
  1,
  0,
  0,
  0,
  70,
  72,
  1,
  0,
  0,
  0,
  71,
  69,
  1,
  0,
  0,
  0,
  72,
  82,
  5,
  0,
  0,
  1,
  73,
  77,
  5,
  3,
  0,
  0,
  74,
  76,
  9,
  0,
  0,
  0,
  75,
  74,
  1,
  0,
  0,
  0,
  76,
  79,
  1,
  0,
  0,
  0,
  77,
  78,
  1,
  0,
  0,
  0,
  77,
  75,
  1,
  0,
  0,
  0,
  78,
  80,
  1,
  0,
  0,
  0,
  79,
  77,
  1,
  0,
  0,
  0,
  80,
  82,
  5,
  4,
  0,
  0,
  81,
  57,
  1,
  0,
  0,
  0,
  81,
  65,
  1,
  0,
  0,
  0,
  81,
  73,
  1,
  0,
  0,
  0,
  82,
  5,
  1,
  0,
  0,
  0,
  83,
  88,
  5,
  5,
  0,
  0,
  84,
  87,
  3,
  2,
  1,
  0,
  85,
  87,
  8,
  0,
  0,
  0,
  86,
  84,
  1,
  0,
  0,
  0,
  86,
  85,
  1,
  0,
  0,
  0,
  87,
  90,
  1,
  0,
  0,
  0,
  88,
  89,
  1,
  0,
  0,
  0,
  88,
  86,
  1,
  0,
  0,
  0,
  89,
  91,
  1,
  0,
  0,
  0,
  90,
  88,
  1,
  0,
  0,
  0,
  91,
  92,
  5,
  6,
  0,
  0,
  92,
  7,
  1,
  0,
  0,
  0,
  93,
  94,
  5,
  7,
  0,
  0,
  94,
  95,
  5,
  23,
  0,
  0,
  95,
  96,
  3,
  6,
  3,
  0,
  96,
  9,
  1,
  0,
  0,
  0,
  97,
  98,
  5,
  8,
  0,
  0,
  98,
  99,
  3,
  6,
  3,
  0,
  99,
  11,
  1,
  0,
  0,
  0,
  100,
  101,
  5,
  9,
  0,
  0,
  101,
  102,
  5,
  23,
  0,
  0,
  102,
  103,
  5,
  10,
  0,
  0,
  103,
  104,
  5,
  23,
  0,
  0,
  104,
  105,
  3,
  6,
  3,
  0,
  105,
  13,
  1,
  0,
  0,
  0,
  106,
  108,
  5,
  11,
  0,
  0,
  107,
  109,
  3,
  16,
  8,
  0,
  108,
  107,
  1,
  0,
  0,
  0,
  109,
  110,
  1,
  0,
  0,
  0,
  110,
  108,
  1,
  0,
  0,
  0,
  110,
  111,
  1,
  0,
  0,
  0,
  111,
  15,
  1,
  0,
  0,
  0,
  112,
  113,
  6,
  8,
  -1,
  0,
  113,
  114,
  3,
  22,
  11,
  0,
  114,
  128,
  1,
  0,
  0,
  0,
  115,
  116,
  10,
  4,
  0,
  0,
  116,
  117,
  5,
  10,
  0,
  0,
  117,
  127,
  3,
  22,
  11,
  0,
  118,
  119,
  10,
  3,
  0,
  0,
  119,
  120,
  5,
  12,
  0,
  0,
  120,
  127,
  3,
  22,
  11,
  0,
  121,
  122,
  10,
  2,
  0,
  0,
  122,
  127,
  3,
  24,
  12,
  0,
  123,
  124,
  10,
  1,
  0,
  0,
  124,
  125,
  5,
  12,
  0,
  0,
  125,
  127,
  3,
  24,
  12,
  0,
  126,
  115,
  1,
  0,
  0,
  0,
  126,
  118,
  1,
  0,
  0,
  0,
  126,
  121,
  1,
  0,
  0,
  0,
  126,
  123,
  1,
  0,
  0,
  0,
  127,
  130,
  1,
  0,
  0,
  0,
  128,
  126,
  1,
  0,
  0,
  0,
  128,
  129,
  1,
  0,
  0,
  0,
  129,
  17,
  1,
  0,
  0,
  0,
  130,
  128,
  1,
  0,
  0,
  0,
  131,
  132,
  5,
  13,
  0,
  0,
  132,
  133,
  3,
  6,
  3,
  0,
  133,
  19,
  1,
  0,
  0,
  0,
  134,
  135,
  5,
  14,
  0,
  0,
  135,
  136,
  3,
  6,
  3,
  0,
  136,
  137,
  5,
  10,
  0,
  0,
  137,
  138,
  3,
  18,
  9,
  0,
  138,
  21,
  1,
  0,
  0,
  0,
  139,
  140,
  5,
  23,
  0,
  0,
  140,
  23,
  1,
  0,
  0,
  0,
  141,
  142,
  5,
  15,
  0,
  0,
  142,
  143,
  3,
  22,
  11,
  0,
  143,
  144,
  5,
  16,
  0,
  0,
  144,
  154,
  1,
  0,
  0,
  0,
  145,
  146,
  5,
  17,
  0,
  0,
  146,
  147,
  3,
  22,
  11,
  0,
  147,
  148,
  5,
  18,
  0,
  0,
  148,
  154,
  1,
  0,
  0,
  0,
  149,
  150,
  5,
  19,
  0,
  0,
  150,
  151,
  3,
  22,
  11,
  0,
  151,
  152,
  5,
  20,
  0,
  0,
  152,
  154,
  1,
  0,
  0,
  0,
  153,
  141,
  1,
  0,
  0,
  0,
  153,
  145,
  1,
  0,
  0,
  0,
  153,
  149,
  1,
  0,
  0,
  0,
  154,
  25,
  1,
  0,
  0,
  0,
  155,
  156,
  7,
  1,
  0,
  0,
  156,
  27,
  1,
  0,
  0,
  0,
  14,
  39,
  41,
  43,
  55,
  61,
  69,
  77,
  81,
  86,
  88,
  110,
  126,
  128,
  153
];
const atn$2 = new Ln.atn.ATNDeserializer().deserialize(serializedATN$2);
const decisionsToDFA$2 = atn$2.decisionToState.map((ds, index) => new Ln.dfa.DFA(ds, index));
const sharedContextCache$1 = new Ln.atn.PredictionContextCache();
class CustomCompileExprParser extends Ln.Parser {
  static grammarFileName = "CustomCompileExpr.g4";
  static literalNames = [
    null,
    "'//'",
    "'\\n'",
    "'/*'",
    "'*/'",
    "'('",
    "')'",
    "'FUNC.'",
    "'Sleep'",
    "'WS.'",
    "'.'",
    "'U.'",
    "'?.'",
    "'TASK'",
    "'GO'",
    "'['",
    "']'",
    "'[''",
    "'']'",
    `'["'`,
    `'"]'`
  ];
  static symbolicNames = [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "INTEGER",
    "DECIMAL",
    "VAR",
    "UNKONW"
  ];
  static ruleNames = [
    "allExpr",
    "expr",
    "comment",
    "bracketExpr",
    "varFUNC",
    "sleepFunc",
    "varWS",
    "uProp",
    "propExpr",
    "taskRun",
    "goRun",
    "expr1",
    "expr2",
    "number"
  ];
  constructor(input) {
    super(input);
    this._interp = new Ln.atn.ParserATNSimulator(this, atn$2, decisionsToDFA$2, sharedContextCache$1);
    this.ruleNames = CustomCompileExprParser.ruleNames;
    this.literalNames = CustomCompileExprParser.literalNames;
    this.symbolicNames = CustomCompileExprParser.symbolicNames;
  }
  sempred(localctx, ruleIndex, predIndex) {
    switch (ruleIndex) {
      case 8:
        return this.propExpr_sempred(localctx, predIndex);
      default:
        throw "No predicate with index:" + ruleIndex;
    }
  }
  propExpr_sempred(localctx, predIndex) {
    switch (predIndex) {
      case 0:
        return this.precpred(this._ctx, 4);
      case 1:
        return this.precpred(this._ctx, 3);
      case 2:
        return this.precpred(this._ctx, 2);
      case 3:
        return this.precpred(this._ctx, 1);
      default:
        throw "No predicate with index:" + predIndex;
    }
  }
  allExpr() {
    let localctx = new AllExprContext$1(this, this._ctx, this.state);
    this.enterRule(localctx, 0, CustomCompileExprParser.RULE_allExpr);
    var _la = 0;
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 43;
      this._errHandler.sync(this);
      _la = this._input.LA(1);
      while ((_la & ~31) === 0 && (1 << _la & 33554430) !== 0) {
        this.state = 41;
        this._errHandler.sync(this);
        var la_ = this._interp.adaptivePredict(this._input, 1, this._ctx);
        switch (la_) {
          case 1:
            this.state = 28;
            this.comment();
            break;
          case 2:
            this.state = 29;
            this.bracketExpr();
            break;
          case 3:
            this.state = 30;
            this.uProp();
            break;
          case 4:
            this.state = 31;
            this.varWS();
            break;
          case 5:
            this.state = 32;
            this.varFUNC();
            break;
          case 6:
            this.state = 33;
            this.sleepFunc();
            break;
          case 7:
            this.state = 34;
            this.goRun();
            break;
          case 8:
            this.state = 35;
            this.taskRun();
            break;
          case 9:
            this.state = 37;
            this._errHandler.sync(this);
            var _alt = 1 + 1;
            do {
              switch (_alt) {
                case 1 + 1:
                  this.state = 36;
                  this.matchWildcard();
                  break;
                default:
                  throw new Ln.error.NoViableAltException(this);
              }
              this.state = 39;
              this._errHandler.sync(this);
              _alt = this._interp.adaptivePredict(this._input, 0, this._ctx);
            } while (_alt != 1 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER);
            break;
        }
        this.state = 45;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
      }
      this.state = 46;
      this.match(CustomCompileExprParser.EOF);
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  expr() {
    let localctx = new ExprContext(this, this._ctx, this.state);
    this.enterRule(localctx, 2, CustomCompileExprParser.RULE_expr);
    try {
      this.state = 55;
      this._errHandler.sync(this);
      switch (this._input.LA(1)) {
        case 5:
          this.enterOuterAlt(localctx, 1);
          this.state = 48;
          this.bracketExpr();
          break;
        case 11:
          this.enterOuterAlt(localctx, 2);
          this.state = 49;
          this.uProp();
          break;
        case 9:
          this.enterOuterAlt(localctx, 3);
          this.state = 50;
          this.varWS();
          break;
        case 7:
          this.enterOuterAlt(localctx, 4);
          this.state = 51;
          this.varFUNC();
          break;
        case 8:
          this.enterOuterAlt(localctx, 5);
          this.state = 52;
          this.sleepFunc();
          break;
        case 14:
          this.enterOuterAlt(localctx, 6);
          this.state = 53;
          this.goRun();
          break;
        case 13:
          this.enterOuterAlt(localctx, 7);
          this.state = 54;
          this.taskRun();
          break;
        default:
          throw new Ln.error.NoViableAltException(this);
      }
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  comment() {
    let localctx = new CommentContext$1(this, this._ctx, this.state);
    this.enterRule(localctx, 4, CustomCompileExprParser.RULE_comment);
    try {
      this.state = 81;
      this._errHandler.sync(this);
      var la_ = this._interp.adaptivePredict(this._input, 7, this._ctx);
      switch (la_) {
        case 1:
          this.enterOuterAlt(localctx, 1);
          this.state = 57;
          this.match(CustomCompileExprParser.T__0);
          this.state = 61;
          this._errHandler.sync(this);
          var _alt = this._interp.adaptivePredict(this._input, 4, this._ctx);
          while (_alt != 1 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER) {
            if (_alt === 1 + 1) {
              this.state = 58;
              this.matchWildcard();
            }
            this.state = 63;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input, 4, this._ctx);
          }
          this.state = 64;
          this.match(CustomCompileExprParser.T__1);
          break;
        case 2:
          this.enterOuterAlt(localctx, 2);
          this.state = 65;
          this.match(CustomCompileExprParser.T__0);
          this.state = 69;
          this._errHandler.sync(this);
          var _alt = this._interp.adaptivePredict(this._input, 5, this._ctx);
          while (_alt != 1 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER) {
            if (_alt === 1 + 1) {
              this.state = 66;
              this.matchWildcard();
            }
            this.state = 71;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input, 5, this._ctx);
          }
          this.state = 72;
          this.match(CustomCompileExprParser.EOF);
          break;
        case 3:
          this.enterOuterAlt(localctx, 3);
          this.state = 73;
          this.match(CustomCompileExprParser.T__2);
          this.state = 77;
          this._errHandler.sync(this);
          var _alt = this._interp.adaptivePredict(this._input, 6, this._ctx);
          while (_alt != 1 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER) {
            if (_alt === 1 + 1) {
              this.state = 74;
              this.matchWildcard();
            }
            this.state = 79;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input, 6, this._ctx);
          }
          this.state = 80;
          this.match(CustomCompileExprParser.T__3);
          break;
      }
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  bracketExpr() {
    let localctx = new BracketExprContext(this, this._ctx, this.state);
    this.enterRule(localctx, 6, CustomCompileExprParser.RULE_bracketExpr);
    var _la = 0;
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 83;
      this.match(CustomCompileExprParser.T__4);
      this.state = 88;
      this._errHandler.sync(this);
      var _alt = this._interp.adaptivePredict(this._input, 9, this._ctx);
      while (_alt != 1 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER) {
        if (_alt === 1 + 1) {
          this.state = 86;
          this._errHandler.sync(this);
          var la_ = this._interp.adaptivePredict(this._input, 8, this._ctx);
          switch (la_) {
            case 1:
              this.state = 84;
              this.expr();
              break;
            case 2:
              this.state = 85;
              _la = this._input.LA(1);
              if (_la <= 0 || _la === 5) {
                this._errHandler.recoverInline(this);
              } else {
                this._errHandler.reportMatch(this);
                this.consume();
              }
              break;
          }
        }
        this.state = 90;
        this._errHandler.sync(this);
        _alt = this._interp.adaptivePredict(this._input, 9, this._ctx);
      }
      this.state = 91;
      this.match(CustomCompileExprParser.T__5);
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  varFUNC() {
    let localctx = new VarFUNCContext(this, this._ctx, this.state);
    this.enterRule(localctx, 8, CustomCompileExprParser.RULE_varFUNC);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 93;
      this.match(CustomCompileExprParser.T__6);
      this.state = 94;
      this.match(CustomCompileExprParser.VAR);
      this.state = 95;
      this.bracketExpr();
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  sleepFunc() {
    let localctx = new SleepFuncContext(this, this._ctx, this.state);
    this.enterRule(localctx, 10, CustomCompileExprParser.RULE_sleepFunc);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 97;
      this.match(CustomCompileExprParser.T__7);
      this.state = 98;
      this.bracketExpr();
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  varWS() {
    let localctx = new VarWSContext(this, this._ctx, this.state);
    this.enterRule(localctx, 12, CustomCompileExprParser.RULE_varWS);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 100;
      this.match(CustomCompileExprParser.T__8);
      this.state = 101;
      this.match(CustomCompileExprParser.VAR);
      this.state = 102;
      this.match(CustomCompileExprParser.T__9);
      this.state = 103;
      this.match(CustomCompileExprParser.VAR);
      this.state = 104;
      this.bracketExpr();
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  uProp() {
    let localctx = new UPropContext(this, this._ctx, this.state);
    this.enterRule(localctx, 14, CustomCompileExprParser.RULE_uProp);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 106;
      this.match(CustomCompileExprParser.T__10);
      this.state = 108;
      this._errHandler.sync(this);
      var _alt = 1;
      do {
        switch (_alt) {
          case 1:
            this.state = 107;
            this.propExpr(0);
            break;
          default:
            throw new Ln.error.NoViableAltException(this);
        }
        this.state = 110;
        this._errHandler.sync(this);
        _alt = this._interp.adaptivePredict(this._input, 10, this._ctx);
      } while (_alt != 2 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER);
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  propExpr(_p) {
    if (_p === void 0) {
      _p = 0;
    }
    const _parentctx = this._ctx;
    const _parentState = this.state;
    let localctx = new PropExprContext(this, this._ctx, _parentState);
    let _prevctx = localctx;
    const _startState = 16;
    this.enterRecursionRule(localctx, 16, CustomCompileExprParser.RULE_propExpr, _p);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 113;
      this.expr1();
      this._ctx.stop = this._input.LT(-1);
      this.state = 128;
      this._errHandler.sync(this);
      var _alt = this._interp.adaptivePredict(this._input, 12, this._ctx);
      while (_alt != 2 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER) {
        if (_alt === 1) {
          if (this._parseListeners !== null) {
            this.triggerExitRuleEvent();
          }
          _prevctx = localctx;
          this.state = 126;
          this._errHandler.sync(this);
          var la_ = this._interp.adaptivePredict(this._input, 11, this._ctx);
          switch (la_) {
            case 1:
              localctx = new PropExprContext(this, _parentctx, _parentState);
              this.pushNewRecursionContext(localctx, _startState, CustomCompileExprParser.RULE_propExpr);
              this.state = 115;
              if (!this.precpred(this._ctx, 4)) {
                throw new Ln.error.FailedPredicateException(this, "this.precpred(this._ctx, 4)");
              }
              this.state = 116;
              this.match(CustomCompileExprParser.T__9);
              this.state = 117;
              this.expr1();
              break;
            case 2:
              localctx = new PropExprContext(this, _parentctx, _parentState);
              this.pushNewRecursionContext(localctx, _startState, CustomCompileExprParser.RULE_propExpr);
              this.state = 118;
              if (!this.precpred(this._ctx, 3)) {
                throw new Ln.error.FailedPredicateException(this, "this.precpred(this._ctx, 3)");
              }
              this.state = 119;
              this.match(CustomCompileExprParser.T__11);
              this.state = 120;
              this.expr1();
              break;
            case 3:
              localctx = new PropExprContext(this, _parentctx, _parentState);
              this.pushNewRecursionContext(localctx, _startState, CustomCompileExprParser.RULE_propExpr);
              this.state = 121;
              if (!this.precpred(this._ctx, 2)) {
                throw new Ln.error.FailedPredicateException(this, "this.precpred(this._ctx, 2)");
              }
              this.state = 122;
              this.expr2();
              break;
            case 4:
              localctx = new PropExprContext(this, _parentctx, _parentState);
              this.pushNewRecursionContext(localctx, _startState, CustomCompileExprParser.RULE_propExpr);
              this.state = 123;
              if (!this.precpred(this._ctx, 1)) {
                throw new Ln.error.FailedPredicateException(this, "this.precpred(this._ctx, 1)");
              }
              this.state = 124;
              this.match(CustomCompileExprParser.T__11);
              this.state = 125;
              this.expr2();
              break;
          }
        }
        this.state = 130;
        this._errHandler.sync(this);
        _alt = this._interp.adaptivePredict(this._input, 12, this._ctx);
      }
    } catch (error) {
      if (error instanceof Ln.error.RecognitionException) {
        localctx.exception = error;
        this._errHandler.reportError(this, error);
        this._errHandler.recover(this, error);
      } else {
        throw error;
      }
    } finally {
      this.unrollRecursionContexts(_parentctx);
    }
    return localctx;
  }
  taskRun() {
    let localctx = new TaskRunContext(this, this._ctx, this.state);
    this.enterRule(localctx, 18, CustomCompileExprParser.RULE_taskRun);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 131;
      this.match(CustomCompileExprParser.T__12);
      this.state = 132;
      this.bracketExpr();
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  goRun() {
    let localctx = new GoRunContext(this, this._ctx, this.state);
    this.enterRule(localctx, 20, CustomCompileExprParser.RULE_goRun);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 134;
      this.match(CustomCompileExprParser.T__13);
      this.state = 135;
      this.bracketExpr();
      this.state = 136;
      this.match(CustomCompileExprParser.T__9);
      this.state = 137;
      this.taskRun();
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  expr1() {
    let localctx = new Expr1Context(this, this._ctx, this.state);
    this.enterRule(localctx, 22, CustomCompileExprParser.RULE_expr1);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 139;
      this.match(CustomCompileExprParser.VAR);
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  expr2() {
    let localctx = new Expr2Context(this, this._ctx, this.state);
    this.enterRule(localctx, 24, CustomCompileExprParser.RULE_expr2);
    try {
      this.state = 153;
      this._errHandler.sync(this);
      switch (this._input.LA(1)) {
        case 15:
          this.enterOuterAlt(localctx, 1);
          this.state = 141;
          this.match(CustomCompileExprParser.T__14);
          this.state = 142;
          this.expr1();
          this.state = 143;
          this.match(CustomCompileExprParser.T__15);
          break;
        case 17:
          this.enterOuterAlt(localctx, 2);
          this.state = 145;
          this.match(CustomCompileExprParser.T__16);
          this.state = 146;
          this.expr1();
          this.state = 147;
          this.match(CustomCompileExprParser.T__17);
          break;
        case 19:
          this.enterOuterAlt(localctx, 3);
          this.state = 149;
          this.match(CustomCompileExprParser.T__18);
          this.state = 150;
          this.expr1();
          this.state = 151;
          this.match(CustomCompileExprParser.T__19);
          break;
        default:
          throw new Ln.error.NoViableAltException(this);
      }
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  number() {
    let localctx = new NumberContext$1(this, this._ctx, this.state);
    this.enterRule(localctx, 26, CustomCompileExprParser.RULE_number);
    var _la = 0;
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 155;
      _la = this._input.LA(1);
      if (!(_la === 21 || _la === 22)) {
        this._errHandler.recoverInline(this);
      } else {
        this._errHandler.reportMatch(this);
        this.consume();
      }
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
}
CustomCompileExprParser.EOF = Ln.Token.EOF;
CustomCompileExprParser.T__0 = 1;
CustomCompileExprParser.T__1 = 2;
CustomCompileExprParser.T__2 = 3;
CustomCompileExprParser.T__3 = 4;
CustomCompileExprParser.T__4 = 5;
CustomCompileExprParser.T__5 = 6;
CustomCompileExprParser.T__6 = 7;
CustomCompileExprParser.T__7 = 8;
CustomCompileExprParser.T__8 = 9;
CustomCompileExprParser.T__9 = 10;
CustomCompileExprParser.T__10 = 11;
CustomCompileExprParser.T__11 = 12;
CustomCompileExprParser.T__12 = 13;
CustomCompileExprParser.T__13 = 14;
CustomCompileExprParser.T__14 = 15;
CustomCompileExprParser.T__15 = 16;
CustomCompileExprParser.T__16 = 17;
CustomCompileExprParser.T__17 = 18;
CustomCompileExprParser.T__18 = 19;
CustomCompileExprParser.T__19 = 20;
CustomCompileExprParser.INTEGER = 21;
CustomCompileExprParser.DECIMAL = 22;
CustomCompileExprParser.VAR = 23;
CustomCompileExprParser.UNKONW = 24;
CustomCompileExprParser.RULE_allExpr = 0;
CustomCompileExprParser.RULE_expr = 1;
CustomCompileExprParser.RULE_comment = 2;
CustomCompileExprParser.RULE_bracketExpr = 3;
CustomCompileExprParser.RULE_varFUNC = 4;
CustomCompileExprParser.RULE_sleepFunc = 5;
CustomCompileExprParser.RULE_varWS = 6;
CustomCompileExprParser.RULE_uProp = 7;
CustomCompileExprParser.RULE_propExpr = 8;
CustomCompileExprParser.RULE_taskRun = 9;
CustomCompileExprParser.RULE_goRun = 10;
CustomCompileExprParser.RULE_expr1 = 11;
CustomCompileExprParser.RULE_expr2 = 12;
CustomCompileExprParser.RULE_number = 13;
let AllExprContext$1 = class AllExprContext2 extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_allExpr;
  }
  EOF() {
    return this.getToken(CustomCompileExprParser.EOF, 0);
  }
  comment = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(CommentContext$1);
    } else {
      return this.getTypedRuleContext(CommentContext$1, i2);
    }
  };
  bracketExpr = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(BracketExprContext);
    } else {
      return this.getTypedRuleContext(BracketExprContext, i2);
    }
  };
  uProp = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(UPropContext);
    } else {
      return this.getTypedRuleContext(UPropContext, i2);
    }
  };
  varWS = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(VarWSContext);
    } else {
      return this.getTypedRuleContext(VarWSContext, i2);
    }
  };
  varFUNC = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(VarFUNCContext);
    } else {
      return this.getTypedRuleContext(VarFUNCContext, i2);
    }
  };
  sleepFunc = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(SleepFuncContext);
    } else {
      return this.getTypedRuleContext(SleepFuncContext, i2);
    }
  };
  goRun = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(GoRunContext);
    } else {
      return this.getTypedRuleContext(GoRunContext, i2);
    }
  };
  taskRun = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(TaskRunContext);
    } else {
      return this.getTypedRuleContext(TaskRunContext, i2);
    }
  };
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterAllExpr(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitAllExpr(this);
    }
  }
};
class ExprContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_expr;
  }
  bracketExpr() {
    return this.getTypedRuleContext(BracketExprContext, 0);
  }
  uProp() {
    return this.getTypedRuleContext(UPropContext, 0);
  }
  varWS() {
    return this.getTypedRuleContext(VarWSContext, 0);
  }
  varFUNC() {
    return this.getTypedRuleContext(VarFUNCContext, 0);
  }
  sleepFunc() {
    return this.getTypedRuleContext(SleepFuncContext, 0);
  }
  goRun() {
    return this.getTypedRuleContext(GoRunContext, 0);
  }
  taskRun() {
    return this.getTypedRuleContext(TaskRunContext, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterExpr(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitExpr(this);
    }
  }
}
let CommentContext$1 = class CommentContext2 extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_comment;
  }
  EOF() {
    return this.getToken(CustomCompileExprParser.EOF, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterComment(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitComment(this);
    }
  }
};
class BracketExprContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_bracketExpr;
  }
  expr = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(ExprContext);
    } else {
      return this.getTypedRuleContext(ExprContext, i2);
    }
  };
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterBracketExpr(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitBracketExpr(this);
    }
  }
}
class VarFUNCContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_varFUNC;
  }
  VAR() {
    return this.getToken(CustomCompileExprParser.VAR, 0);
  }
  bracketExpr() {
    return this.getTypedRuleContext(BracketExprContext, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterVarFUNC(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitVarFUNC(this);
    }
  }
}
class SleepFuncContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_sleepFunc;
  }
  bracketExpr() {
    return this.getTypedRuleContext(BracketExprContext, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterSleepFunc(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitSleepFunc(this);
    }
  }
}
class VarWSContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_varWS;
  }
  VAR = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTokens(CustomCompileExprParser.VAR);
    } else {
      return this.getToken(CustomCompileExprParser.VAR, i2);
    }
  };
  bracketExpr() {
    return this.getTypedRuleContext(BracketExprContext, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterVarWS(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitVarWS(this);
    }
  }
}
class UPropContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_uProp;
  }
  propExpr = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(PropExprContext);
    } else {
      return this.getTypedRuleContext(PropExprContext, i2);
    }
  };
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterUProp(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitUProp(this);
    }
  }
}
class PropExprContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_propExpr;
  }
  expr1() {
    return this.getTypedRuleContext(Expr1Context, 0);
  }
  propExpr() {
    return this.getTypedRuleContext(PropExprContext, 0);
  }
  expr2() {
    return this.getTypedRuleContext(Expr2Context, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterPropExpr(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitPropExpr(this);
    }
  }
}
class TaskRunContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_taskRun;
  }
  bracketExpr() {
    return this.getTypedRuleContext(BracketExprContext, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterTaskRun(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitTaskRun(this);
    }
  }
}
class GoRunContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_goRun;
  }
  bracketExpr() {
    return this.getTypedRuleContext(BracketExprContext, 0);
  }
  taskRun() {
    return this.getTypedRuleContext(TaskRunContext, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterGoRun(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitGoRun(this);
    }
  }
}
class Expr1Context extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_expr1;
  }
  VAR() {
    return this.getToken(CustomCompileExprParser.VAR, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterExpr1(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitExpr1(this);
    }
  }
}
class Expr2Context extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_expr2;
  }
  expr1() {
    return this.getTypedRuleContext(Expr1Context, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterExpr2(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitExpr2(this);
    }
  }
}
let NumberContext$1 = class NumberContext2 extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = CustomCompileExprParser.RULE_number;
  }
  INTEGER() {
    return this.getToken(CustomCompileExprParser.INTEGER, 0);
  }
  DECIMAL() {
    return this.getToken(CustomCompileExprParser.DECIMAL, 0);
  }
  enterRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.enterNumber(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof CustomCompileExprListener) {
      listener.exitNumber(this);
    }
  }
};
CustomCompileExprParser.AllExprContext = AllExprContext$1;
CustomCompileExprParser.ExprContext = ExprContext;
CustomCompileExprParser.CommentContext = CommentContext$1;
CustomCompileExprParser.BracketExprContext = BracketExprContext;
CustomCompileExprParser.VarFUNCContext = VarFUNCContext;
CustomCompileExprParser.SleepFuncContext = SleepFuncContext;
CustomCompileExprParser.VarWSContext = VarWSContext;
CustomCompileExprParser.UPropContext = UPropContext;
CustomCompileExprParser.PropExprContext = PropExprContext;
CustomCompileExprParser.TaskRunContext = TaskRunContext;
CustomCompileExprParser.GoRunContext = GoRunContext;
CustomCompileExprParser.Expr1Context = Expr1Context;
CustomCompileExprParser.Expr2Context = Expr2Context;
CustomCompileExprParser.NumberContext = NumberContext$1;
const serializedATN$1 = [
  4,
  0,
  13,
  76,
  6,
  -1,
  2,
  0,
  7,
  0,
  2,
  1,
  7,
  1,
  2,
  2,
  7,
  2,
  2,
  3,
  7,
  3,
  2,
  4,
  7,
  4,
  2,
  5,
  7,
  5,
  2,
  6,
  7,
  6,
  2,
  7,
  7,
  7,
  2,
  8,
  7,
  8,
  2,
  9,
  7,
  9,
  2,
  10,
  7,
  10,
  2,
  11,
  7,
  11,
  2,
  12,
  7,
  12,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  1,
  1,
  1,
  1,
  2,
  1,
  2,
  1,
  2,
  1,
  3,
  1,
  3,
  1,
  3,
  1,
  4,
  1,
  4,
  1,
  5,
  1,
  5,
  1,
  6,
  4,
  6,
  44,
  8,
  6,
  11,
  6,
  12,
  6,
  45,
  1,
  7,
  4,
  7,
  49,
  8,
  7,
  11,
  7,
  12,
  7,
  50,
  1,
  7,
  1,
  7,
  4,
  7,
  55,
  8,
  7,
  11,
  7,
  12,
  7,
  56,
  1,
  8,
  4,
  8,
  60,
  8,
  8,
  11,
  8,
  12,
  8,
  61,
  1,
  9,
  1,
  9,
  1,
  9,
  1,
  10,
  1,
  10,
  1,
  10,
  1,
  10,
  1,
  10,
  1,
  11,
  1,
  11,
  1,
  11,
  1,
  12,
  1,
  12,
  0,
  0,
  13,
  1,
  1,
  3,
  2,
  5,
  3,
  7,
  4,
  9,
  5,
  11,
  6,
  13,
  7,
  15,
  8,
  17,
  9,
  19,
  10,
  21,
  11,
  23,
  12,
  25,
  13,
  1,
  0,
  2,
  1,
  0,
  48,
  57,
  4,
  0,
  48,
  57,
  65,
  90,
  95,
  95,
  97,
  122,
  79,
  0,
  1,
  1,
  0,
  0,
  0,
  0,
  3,
  1,
  0,
  0,
  0,
  0,
  5,
  1,
  0,
  0,
  0,
  0,
  7,
  1,
  0,
  0,
  0,
  0,
  9,
  1,
  0,
  0,
  0,
  0,
  11,
  1,
  0,
  0,
  0,
  0,
  13,
  1,
  0,
  0,
  0,
  0,
  15,
  1,
  0,
  0,
  0,
  0,
  17,
  1,
  0,
  0,
  0,
  0,
  19,
  1,
  0,
  0,
  0,
  0,
  21,
  1,
  0,
  0,
  0,
  0,
  23,
  1,
  0,
  0,
  0,
  0,
  25,
  1,
  0,
  0,
  0,
  1,
  27,
  1,
  0,
  0,
  0,
  3,
  30,
  1,
  0,
  0,
  0,
  5,
  32,
  1,
  0,
  0,
  0,
  7,
  35,
  1,
  0,
  0,
  0,
  9,
  38,
  1,
  0,
  0,
  0,
  11,
  40,
  1,
  0,
  0,
  0,
  13,
  43,
  1,
  0,
  0,
  0,
  15,
  48,
  1,
  0,
  0,
  0,
  17,
  59,
  1,
  0,
  0,
  0,
  19,
  63,
  1,
  0,
  0,
  0,
  21,
  66,
  1,
  0,
  0,
  0,
  23,
  71,
  1,
  0,
  0,
  0,
  25,
  74,
  1,
  0,
  0,
  0,
  27,
  28,
  5,
  47,
  0,
  0,
  28,
  29,
  5,
  47,
  0,
  0,
  29,
  2,
  1,
  0,
  0,
  0,
  30,
  31,
  5,
  10,
  0,
  0,
  31,
  4,
  1,
  0,
  0,
  0,
  32,
  33,
  5,
  47,
  0,
  0,
  33,
  34,
  5,
  42,
  0,
  0,
  34,
  6,
  1,
  0,
  0,
  0,
  35,
  36,
  5,
  42,
  0,
  0,
  36,
  37,
  5,
  47,
  0,
  0,
  37,
  8,
  1,
  0,
  0,
  0,
  38,
  39,
  5,
  32,
  0,
  0,
  39,
  10,
  1,
  0,
  0,
  0,
  40,
  41,
  5,
  59,
  0,
  0,
  41,
  12,
  1,
  0,
  0,
  0,
  42,
  44,
  7,
  0,
  0,
  0,
  43,
  42,
  1,
  0,
  0,
  0,
  44,
  45,
  1,
  0,
  0,
  0,
  45,
  43,
  1,
  0,
  0,
  0,
  45,
  46,
  1,
  0,
  0,
  0,
  46,
  14,
  1,
  0,
  0,
  0,
  47,
  49,
  7,
  0,
  0,
  0,
  48,
  47,
  1,
  0,
  0,
  0,
  49,
  50,
  1,
  0,
  0,
  0,
  50,
  48,
  1,
  0,
  0,
  0,
  50,
  51,
  1,
  0,
  0,
  0,
  51,
  52,
  1,
  0,
  0,
  0,
  52,
  54,
  5,
  46,
  0,
  0,
  53,
  55,
  7,
  0,
  0,
  0,
  54,
  53,
  1,
  0,
  0,
  0,
  55,
  56,
  1,
  0,
  0,
  0,
  56,
  54,
  1,
  0,
  0,
  0,
  56,
  57,
  1,
  0,
  0,
  0,
  57,
  16,
  1,
  0,
  0,
  0,
  58,
  60,
  7,
  1,
  0,
  0,
  59,
  58,
  1,
  0,
  0,
  0,
  60,
  61,
  1,
  0,
  0,
  0,
  61,
  59,
  1,
  0,
  0,
  0,
  61,
  62,
  1,
  0,
  0,
  0,
  62,
  18,
  1,
  0,
  0,
  0,
  63,
  64,
  5,
  33719,
  0,
  0,
  64,
  65,
  5,
  21462,
  0,
  0,
  65,
  20,
  1,
  0,
  0,
  0,
  66,
  67,
  5,
  25152,
  0,
  0,
  67,
  68,
  5,
  26377,
  0,
  0,
  68,
  69,
  5,
  23383,
  0,
  0,
  69,
  70,
  5,
  27573,
  0,
  0,
  70,
  22,
  1,
  0,
  0,
  0,
  71,
  72,
  5,
  20174,
  0,
  0,
  72,
  73,
  5,
  34920,
  0,
  0,
  73,
  24,
  1,
  0,
  0,
  0,
  74,
  75,
  9,
  0,
  0,
  0,
  75,
  26,
  1,
  0,
  0,
  0,
  5,
  0,
  45,
  50,
  56,
  61,
  0
];
const atn$1 = new Ln.atn.ATNDeserializer().deserialize(serializedATN$1);
const decisionsToDFA$1 = atn$1.decisionToState.map((ds, index) => new Ln.dfa.DFA(ds, index));
class DebugExprLexer extends Ln.Lexer {
  static grammarFileName = "DebugExpr.g4";
  static channelNames = ["DEFAULT_TOKEN_CHANNEL", "HIDDEN"];
  static modeNames = ["DEFAULT_MODE"];
  static literalNames = [
    null,
    "'//'",
    "'\\n'",
    "'/*'",
    "'*/'",
    "' '",
    "';'",
    null,
    null,
    null,
    "'\\u83B7\\u53D6'",
    "'\\u6240\\u6709\\u5B57\\u6BB5'",
    "'\\u4ECE\\u8868'"
  ];
  static symbolicNames = [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "INTEGER",
    "DECIMAL",
    "WORD",
    "K1",
    "K2",
    "K3",
    "UNKONW"
  ];
  static ruleNames = [
    "T__0",
    "T__1",
    "T__2",
    "T__3",
    "T__4",
    "T__5",
    "INTEGER",
    "DECIMAL",
    "WORD",
    "K1",
    "K2",
    "K3",
    "UNKONW"
  ];
  constructor(input) {
    super(input);
    this._interp = new Ln.atn.LexerATNSimulator(this, atn$1, decisionsToDFA$1, new Ln.atn.PredictionContextCache());
  }
}
DebugExprLexer.EOF = Ln.Token.EOF;
DebugExprLexer.T__0 = 1;
DebugExprLexer.T__1 = 2;
DebugExprLexer.T__2 = 3;
DebugExprLexer.T__3 = 4;
DebugExprLexer.T__4 = 5;
DebugExprLexer.T__5 = 6;
DebugExprLexer.INTEGER = 7;
DebugExprLexer.DECIMAL = 8;
DebugExprLexer.WORD = 9;
DebugExprLexer.K1 = 10;
DebugExprLexer.K2 = 11;
DebugExprLexer.K3 = 12;
DebugExprLexer.UNKONW = 13;
class DebugExprListener extends Ln.tree.ParseTreeListener {
  // Enter a parse tree produced by DebugExprParser#allExpr.
  enterAllExpr(ctx) {
  }
  // Exit a parse tree produced by DebugExprParser#allExpr.
  exitAllExpr(ctx) {
  }
  // Enter a parse tree produced by DebugExprParser#comment.
  enterComment(ctx) {
  }
  // Exit a parse tree produced by DebugExprParser#comment.
  exitComment(ctx) {
  }
  // Enter a parse tree produced by DebugExprParser#select.
  enterSelect(ctx) {
  }
  // Exit a parse tree produced by DebugExprParser#select.
  exitSelect(ctx) {
  }
  // Enter a parse tree produced by DebugExprParser#number.
  enterNumber(ctx) {
  }
  // Exit a parse tree produced by DebugExprParser#number.
  exitNumber(ctx) {
  }
}
const serializedATN = [
  4,
  1,
  13,
  63,
  2,
  0,
  7,
  0,
  2,
  1,
  7,
  1,
  2,
  2,
  7,
  2,
  2,
  3,
  7,
  3,
  1,
  0,
  1,
  0,
  4,
  0,
  11,
  8,
  0,
  11,
  0,
  12,
  0,
  12,
  5,
  0,
  15,
  8,
  0,
  10,
  0,
  12,
  0,
  18,
  9,
  0,
  1,
  0,
  1,
  0,
  1,
  1,
  1,
  1,
  5,
  1,
  24,
  8,
  1,
  10,
  1,
  12,
  1,
  27,
  9,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  5,
  1,
  32,
  8,
  1,
  10,
  1,
  12,
  1,
  35,
  9,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  5,
  1,
  40,
  8,
  1,
  10,
  1,
  12,
  1,
  43,
  9,
  1,
  1,
  1,
  3,
  1,
  46,
  8,
  1,
  1,
  2,
  1,
  2,
  1,
  2,
  1,
  2,
  1,
  2,
  1,
  2,
  1,
  2,
  4,
  2,
  55,
  8,
  2,
  11,
  2,
  12,
  2,
  56,
  1,
  2,
  1,
  2,
  1,
  3,
  1,
  3,
  1,
  3,
  5,
  12,
  25,
  33,
  41,
  56,
  0,
  4,
  0,
  2,
  4,
  6,
  0,
  1,
  1,
  0,
  7,
  8,
  67,
  0,
  16,
  1,
  0,
  0,
  0,
  2,
  45,
  1,
  0,
  0,
  0,
  4,
  47,
  1,
  0,
  0,
  0,
  6,
  60,
  1,
  0,
  0,
  0,
  8,
  15,
  3,
  4,
  2,
  0,
  9,
  11,
  9,
  0,
  0,
  0,
  10,
  9,
  1,
  0,
  0,
  0,
  11,
  12,
  1,
  0,
  0,
  0,
  12,
  13,
  1,
  0,
  0,
  0,
  12,
  10,
  1,
  0,
  0,
  0,
  13,
  15,
  1,
  0,
  0,
  0,
  14,
  8,
  1,
  0,
  0,
  0,
  14,
  10,
  1,
  0,
  0,
  0,
  15,
  18,
  1,
  0,
  0,
  0,
  16,
  14,
  1,
  0,
  0,
  0,
  16,
  17,
  1,
  0,
  0,
  0,
  17,
  19,
  1,
  0,
  0,
  0,
  18,
  16,
  1,
  0,
  0,
  0,
  19,
  20,
  5,
  0,
  0,
  1,
  20,
  1,
  1,
  0,
  0,
  0,
  21,
  25,
  5,
  1,
  0,
  0,
  22,
  24,
  9,
  0,
  0,
  0,
  23,
  22,
  1,
  0,
  0,
  0,
  24,
  27,
  1,
  0,
  0,
  0,
  25,
  26,
  1,
  0,
  0,
  0,
  25,
  23,
  1,
  0,
  0,
  0,
  26,
  28,
  1,
  0,
  0,
  0,
  27,
  25,
  1,
  0,
  0,
  0,
  28,
  46,
  5,
  2,
  0,
  0,
  29,
  33,
  5,
  1,
  0,
  0,
  30,
  32,
  9,
  0,
  0,
  0,
  31,
  30,
  1,
  0,
  0,
  0,
  32,
  35,
  1,
  0,
  0,
  0,
  33,
  34,
  1,
  0,
  0,
  0,
  33,
  31,
  1,
  0,
  0,
  0,
  34,
  36,
  1,
  0,
  0,
  0,
  35,
  33,
  1,
  0,
  0,
  0,
  36,
  46,
  5,
  0,
  0,
  1,
  37,
  41,
  5,
  3,
  0,
  0,
  38,
  40,
  9,
  0,
  0,
  0,
  39,
  38,
  1,
  0,
  0,
  0,
  40,
  43,
  1,
  0,
  0,
  0,
  41,
  42,
  1,
  0,
  0,
  0,
  41,
  39,
  1,
  0,
  0,
  0,
  42,
  44,
  1,
  0,
  0,
  0,
  43,
  41,
  1,
  0,
  0,
  0,
  44,
  46,
  5,
  4,
  0,
  0,
  45,
  21,
  1,
  0,
  0,
  0,
  45,
  29,
  1,
  0,
  0,
  0,
  45,
  37,
  1,
  0,
  0,
  0,
  46,
  3,
  1,
  0,
  0,
  0,
  47,
  48,
  5,
  10,
  0,
  0,
  48,
  49,
  5,
  5,
  0,
  0,
  49,
  50,
  5,
  11,
  0,
  0,
  50,
  51,
  5,
  5,
  0,
  0,
  51,
  52,
  5,
  12,
  0,
  0,
  52,
  54,
  5,
  5,
  0,
  0,
  53,
  55,
  9,
  0,
  0,
  0,
  54,
  53,
  1,
  0,
  0,
  0,
  55,
  56,
  1,
  0,
  0,
  0,
  56,
  57,
  1,
  0,
  0,
  0,
  56,
  54,
  1,
  0,
  0,
  0,
  57,
  58,
  1,
  0,
  0,
  0,
  58,
  59,
  5,
  6,
  0,
  0,
  59,
  5,
  1,
  0,
  0,
  0,
  60,
  61,
  7,
  0,
  0,
  0,
  61,
  7,
  1,
  0,
  0,
  0,
  8,
  12,
  14,
  16,
  25,
  33,
  41,
  45,
  56
];
const atn = new Ln.atn.ATNDeserializer().deserialize(serializedATN);
const decisionsToDFA = atn.decisionToState.map((ds, index) => new Ln.dfa.DFA(ds, index));
const sharedContextCache = new Ln.atn.PredictionContextCache();
class DebugExprParser extends Ln.Parser {
  static grammarFileName = "DebugExpr.g4";
  static literalNames = [
    null,
    "'//'",
    "'\\n'",
    "'/*'",
    "'*/'",
    "' '",
    "';'",
    null,
    null,
    null,
    "'\\u83B7\\u53D6'",
    "'\\u6240\\u6709\\u5B57\\u6BB5'",
    "'\\u4ECE\\u8868'"
  ];
  static symbolicNames = [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "INTEGER",
    "DECIMAL",
    "WORD",
    "K1",
    "K2",
    "K3",
    "UNKONW"
  ];
  static ruleNames = ["allExpr", "comment", "select", "number"];
  constructor(input) {
    super(input);
    this._interp = new Ln.atn.ParserATNSimulator(this, atn, decisionsToDFA, sharedContextCache);
    this.ruleNames = DebugExprParser.ruleNames;
    this.literalNames = DebugExprParser.literalNames;
    this.symbolicNames = DebugExprParser.symbolicNames;
  }
  allExpr() {
    let localctx = new AllExprContext(this, this._ctx, this.state);
    this.enterRule(localctx, 0, DebugExprParser.RULE_allExpr);
    var _la = 0;
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 16;
      this._errHandler.sync(this);
      _la = this._input.LA(1);
      while ((_la & ~31) === 0 && (1 << _la & 16382) !== 0) {
        this.state = 14;
        this._errHandler.sync(this);
        var la_ = this._interp.adaptivePredict(this._input, 1, this._ctx);
        switch (la_) {
          case 1:
            this.state = 8;
            this.select();
            break;
          case 2:
            this.state = 10;
            this._errHandler.sync(this);
            var _alt = 1 + 1;
            do {
              switch (_alt) {
                case 1 + 1:
                  this.state = 9;
                  this.matchWildcard();
                  break;
                default:
                  throw new Ln.error.NoViableAltException(this);
              }
              this.state = 12;
              this._errHandler.sync(this);
              _alt = this._interp.adaptivePredict(this._input, 0, this._ctx);
            } while (_alt != 1 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER);
            break;
        }
        this.state = 18;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
      }
      this.state = 19;
      this.match(DebugExprParser.EOF);
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  comment() {
    let localctx = new CommentContext(this, this._ctx, this.state);
    this.enterRule(localctx, 2, DebugExprParser.RULE_comment);
    try {
      this.state = 45;
      this._errHandler.sync(this);
      var la_ = this._interp.adaptivePredict(this._input, 6, this._ctx);
      switch (la_) {
        case 1:
          this.enterOuterAlt(localctx, 1);
          this.state = 21;
          this.match(DebugExprParser.T__0);
          this.state = 25;
          this._errHandler.sync(this);
          var _alt = this._interp.adaptivePredict(this._input, 3, this._ctx);
          while (_alt != 1 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER) {
            if (_alt === 1 + 1) {
              this.state = 22;
              this.matchWildcard();
            }
            this.state = 27;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input, 3, this._ctx);
          }
          this.state = 28;
          this.match(DebugExprParser.T__1);
          break;
        case 2:
          this.enterOuterAlt(localctx, 2);
          this.state = 29;
          this.match(DebugExprParser.T__0);
          this.state = 33;
          this._errHandler.sync(this);
          var _alt = this._interp.adaptivePredict(this._input, 4, this._ctx);
          while (_alt != 1 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER) {
            if (_alt === 1 + 1) {
              this.state = 30;
              this.matchWildcard();
            }
            this.state = 35;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input, 4, this._ctx);
          }
          this.state = 36;
          this.match(DebugExprParser.EOF);
          break;
        case 3:
          this.enterOuterAlt(localctx, 3);
          this.state = 37;
          this.match(DebugExprParser.T__2);
          this.state = 41;
          this._errHandler.sync(this);
          var _alt = this._interp.adaptivePredict(this._input, 5, this._ctx);
          while (_alt != 1 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER) {
            if (_alt === 1 + 1) {
              this.state = 38;
              this.matchWildcard();
            }
            this.state = 43;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input, 5, this._ctx);
          }
          this.state = 44;
          this.match(DebugExprParser.T__3);
          break;
      }
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  select() {
    let localctx = new SelectContext(this, this._ctx, this.state);
    this.enterRule(localctx, 4, DebugExprParser.RULE_select);
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 47;
      this.match(DebugExprParser.K1);
      this.state = 48;
      this.match(DebugExprParser.T__4);
      this.state = 49;
      this.match(DebugExprParser.K2);
      this.state = 50;
      this.match(DebugExprParser.T__4);
      this.state = 51;
      this.match(DebugExprParser.K3);
      this.state = 52;
      this.match(DebugExprParser.T__4);
      this.state = 54;
      this._errHandler.sync(this);
      var _alt = 1 + 1;
      do {
        switch (_alt) {
          case 1 + 1:
            this.state = 53;
            this.matchWildcard();
            break;
          default:
            throw new Ln.error.NoViableAltException(this);
        }
        this.state = 56;
        this._errHandler.sync(this);
        _alt = this._interp.adaptivePredict(this._input, 7, this._ctx);
      } while (_alt != 1 && _alt != Ln.atn.ATN.INVALID_ALT_NUMBER);
      this.state = 58;
      this.match(DebugExprParser.T__5);
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
  number() {
    let localctx = new NumberContext(this, this._ctx, this.state);
    this.enterRule(localctx, 6, DebugExprParser.RULE_number);
    var _la = 0;
    try {
      this.enterOuterAlt(localctx, 1);
      this.state = 60;
      _la = this._input.LA(1);
      if (!(_la === 7 || _la === 8)) {
        this._errHandler.recoverInline(this);
      } else {
        this._errHandler.reportMatch(this);
        this.consume();
      }
    } catch (re2) {
      if (re2 instanceof Ln.error.RecognitionException) {
        localctx.exception = re2;
        this._errHandler.reportError(this, re2);
        this._errHandler.recover(this, re2);
      } else {
        throw re2;
      }
    } finally {
      this.exitRule();
    }
    return localctx;
  }
}
DebugExprParser.EOF = Ln.Token.EOF;
DebugExprParser.T__0 = 1;
DebugExprParser.T__1 = 2;
DebugExprParser.T__2 = 3;
DebugExprParser.T__3 = 4;
DebugExprParser.T__4 = 5;
DebugExprParser.T__5 = 6;
DebugExprParser.INTEGER = 7;
DebugExprParser.DECIMAL = 8;
DebugExprParser.WORD = 9;
DebugExprParser.K1 = 10;
DebugExprParser.K2 = 11;
DebugExprParser.K3 = 12;
DebugExprParser.UNKONW = 13;
DebugExprParser.RULE_allExpr = 0;
DebugExprParser.RULE_comment = 1;
DebugExprParser.RULE_select = 2;
DebugExprParser.RULE_number = 3;
class AllExprContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = DebugExprParser.RULE_allExpr;
  }
  EOF() {
    return this.getToken(DebugExprParser.EOF, 0);
  }
  select = function(i2) {
    if (i2 === void 0) {
      i2 = null;
    }
    if (i2 === null) {
      return this.getTypedRuleContexts(SelectContext);
    } else {
      return this.getTypedRuleContext(SelectContext, i2);
    }
  };
  enterRule(listener) {
    if (listener instanceof DebugExprListener) {
      listener.enterAllExpr(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof DebugExprListener) {
      listener.exitAllExpr(this);
    }
  }
}
class CommentContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = DebugExprParser.RULE_comment;
  }
  EOF() {
    return this.getToken(DebugExprParser.EOF, 0);
  }
  enterRule(listener) {
    if (listener instanceof DebugExprListener) {
      listener.enterComment(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof DebugExprListener) {
      listener.exitComment(this);
    }
  }
}
class SelectContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = DebugExprParser.RULE_select;
  }
  K1() {
    return this.getToken(DebugExprParser.K1, 0);
  }
  K2() {
    return this.getToken(DebugExprParser.K2, 0);
  }
  K3() {
    return this.getToken(DebugExprParser.K3, 0);
  }
  enterRule(listener) {
    if (listener instanceof DebugExprListener) {
      listener.enterSelect(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof DebugExprListener) {
      listener.exitSelect(this);
    }
  }
}
class NumberContext extends Ln.ParserRuleContext {
  constructor(parser, parent, invokingState) {
    if (parent === void 0) {
      parent = null;
    }
    if (invokingState === void 0 || invokingState === null) {
      invokingState = -1;
    }
    super(parent, invokingState);
    this.parser = parser;
    this.ruleIndex = DebugExprParser.RULE_number;
  }
  INTEGER() {
    return this.getToken(DebugExprParser.INTEGER, 0);
  }
  DECIMAL() {
    return this.getToken(DebugExprParser.DECIMAL, 0);
  }
  enterRule(listener) {
    if (listener instanceof DebugExprListener) {
      listener.enterNumber(this);
    }
  }
  exitRule(listener) {
    if (listener instanceof DebugExprListener) {
      listener.exitNumber(this);
    }
  }
}
DebugExprParser.AllExprContext = AllExprContext;
DebugExprParser.CommentContext = CommentContext;
DebugExprParser.SelectContext = SelectContext;
DebugExprParser.NumberContext = NumberContext;
class JsAntlr4 {
  // g4 语法文件编译命令  java -jar ../../../bin/antlr-4.13.2-complete.jar -Dlanguage=JavaScript PropExpr.g4 -o propExpr
  // g4 语法文件编译命令  java -jar ../../../bin/antlr-4.13.2-complete.jar -Dlanguage=JavaScript CustomCompileExpr.g4 -o customCompileExpr
  static getPropPathList(input) {
    try {
      const chars = new Ln.InputStream(input);
      const lexer = new PropExprLexer(chars);
      const tokens = new Ln.CommonTokenStream(lexer);
      const parser = new PropExprParser(tokens);
      const tree = parser.prop();
      const walker = new Ln.tree.ParseTreeWalker();
      const ret = [];
      const listener = new class extends PropExprListener {
        enterExpr1(ctx) {
          for (let i2 = 0; i2 < ctx.children.length; i2++) {
            const item = ctx.children[i2];
            ret.push(item.symbol.text);
          }
        }
      }();
      walker.walk(listener, tree);
      return ret;
    } catch (e2) {
      return [];
    }
  }
  /**
   * 编译过程 GO(xxxxx).TASK('xxx') =>  new Promise(resolve => async function(){ TASK('xxx'); resolve(); })
   * 编译过程 TASK('11') => await __TASK_11()
   * 编译过程 U.User[1].name => (await getProxyValueU("U.User[1].name"))
   * @param input
   * @param curCasaInfo
   * @param allCaseName2InfoMap
   * @returns {string}
   */
  static codeCustomCompile(input, curCasaInfo, allCaseName2InfoMap) {
    const headerContent = `
    /** 用于等待go异步调用完成 */
    const __ALL_GO_PROMISE = [];
`;
    const endContent = "\nwhile(__ALL_GO_PROMISE.length > 0){ await __ALL_GO_PROMISE.shift(); }\n";
    const ctx = new JsAntlr4CustomCompileCtx();
    ctx.input = input;
    ctx.recursivePathList = [curCasaInfo.name];
    ctx._globalCompiledSet = /* @__PURE__ */ new Set();
    JsAntlr4._codeCustomCompile(ctx, allCaseName2InfoMap);
    return [headerContent, ctx.extraInputTextList.join("\n"), ctx.output, endContent].join("\n");
  }
  /**
   * task 和 go逻辑文本替换 (使用正则表达式，替代ANTLR4以提升性能)
   * @param {JsAntlr4CustomCompileCtx} inputCtx
   * @param allCaseName2InfoMap
   * @returns {JsAntlr4CustomCompileCtx}
   */
  static _codeCustomCompile(inputCtx, allCaseName2InfoMap) {
    let input = inputCtx.input;
    if (Object.prototype.toString.call(input) !== "[object String]") {
      debugger;
    }
    const findMatchingParen = (str, startIdx) => {
      let depth = 1;
      let i2 = startIdx;
      while (i2 < str.length && depth > 0) {
        if (str[i2] === "(") depth++;
        else if (str[i2] === ")") depth--;
        i2++;
      }
      return depth === 0 ? i2 - 1 : -1;
    };
    const isInStringOrComment = (str, pos) => {
      let inSingleQuote = false;
      let inDoubleQuote = false;
      let inTemplate = false;
      let inLineComment = false;
      let inBlockComment = false;
      for (let i2 = 0; i2 < pos; i2++) {
        const char = str[i2];
        const nextChar = str[i2 + 1];
        const prevChar = i2 > 0 ? str[i2 - 1] : "";
        if (inLineComment) {
          if (char === "\n") inLineComment = false;
          continue;
        }
        if (inBlockComment) {
          if (char === "*" && nextChar === "/") {
            inBlockComment = false;
            i2++;
          }
          continue;
        }
        if (!inSingleQuote && !inDoubleQuote && !inTemplate) {
          if (char === "/" && nextChar === "/") {
            inLineComment = true;
            i2++;
            continue;
          }
          if (char === "/" && nextChar === "*") {
            inBlockComment = true;
            i2++;
            continue;
          }
        }
        if (char === "'" && prevChar !== "\\" && !inDoubleQuote && !inTemplate) {
          inSingleQuote = !inSingleQuote;
        } else if (char === '"' && prevChar !== "\\" && !inSingleQuote && !inTemplate) {
          inDoubleQuote = !inDoubleQuote;
        } else if (char === "`" && prevChar !== "\\" && !inSingleQuote && !inDoubleQuote) {
          inTemplate = !inTemplate;
        }
      }
      return inSingleQuote || inDoubleQuote || inTemplate || inLineComment || inBlockComment;
    };
    let goPattern = /GO\s*\(/g;
    let match;
    let result = input;
    let offset = 0;
    while ((match = goPattern.exec(input)) !== null) {
      if (isInStringOrComment(input, match.index)) continue;
      const goStart = match.index;
      const parenStart = goStart + match[0].length - 1;
      const parenEnd = findMatchingParen(input, parenStart + 1);
      if (parenEnd === -1) continue;
      const afterGo = input.slice(parenEnd + 1);
      const taskMatch = afterGo.match(/^\s*\.\s*TASK\s*\(/);
      if (!taskMatch) continue;
      const taskParenStart = parenEnd + 1 + taskMatch[0].length - 1;
      const taskParenEnd = findMatchingParen(input, taskParenStart + 1);
      if (taskParenEnd === -1) continue;
      const goParams = input.slice(parenStart + 1, parenEnd);
      const goParamList = goParams.split(",").map((p2) => p2.trim());
      if (goParamList.length !== 3) {
        throw new Error("GO 执行参数数量不正确当前为:" + goParamList.join(",") + " 正确数量为3");
      }
      const taskContent = input.slice(taskParenStart + 1, taskParenEnd);
      const taskNameMatch = taskContent.match(/["']([^"']+)["']/);
      if (!taskNameMatch) continue;
      const caseName = taskNameMatch[1];
      if (inputCtx.recursivePathList.includes(caseName)) {
        throw new Error("存在递归调用子任务，请检查, " + [...inputCtx.recursivePathList, caseName].join(" => "));
      }
      if (!allCaseName2InfoMap[caseName]) {
        throw new Error("找不到子TASK , " + caseName);
      }
      if (!inputCtx._globalCompiledSet.has(caseName)) {
        inputCtx._globalCompiledSet.add(caseName);
        const caseInfo = allCaseName2InfoMap[caseName];
        const newCompileCtx = new JsAntlr4CustomCompileCtx();
        newCompileCtx.input = caseInfo.content;
        newCompileCtx.recursivePathList = [...inputCtx.recursivePathList, caseInfo.name];
        newCompileCtx._globalCompiledSet = inputCtx._globalCompiledSet;
        const outCtx = JsAntlr4._codeCustomCompile(newCompileCtx, allCaseName2InfoMap);
        inputCtx.extraInputTextList.push("\n\nasync function __TASK_" + caseName + "(){\n" + outCtx.output + "\n}\n");
        inputCtx.extraInputTextList = inputCtx.extraInputTextList.concat(outCtx.extraInputTextList);
      }
      const [delay, count, interval] = goParamList;
      const replacement = `__ALL_GO_PROMISE.push(GO(${delay}, ${count}, ${interval}, async()=> (await __TASK_${caseName}())))`;
      const fullMatch = input.slice(goStart, taskParenEnd + 1);
      result = result.slice(0, goStart + offset) + replacement + result.slice(taskParenEnd + 1 + offset);
      offset += replacement.length - fullMatch.length;
    }
    input = result;
    const taskPattern = /(?<!\.)\bTASK\s*\(/g;
    result = input;
    offset = 0;
    while ((match = taskPattern.exec(input)) !== null) {
      if (isInStringOrComment(input, match.index)) continue;
      const taskStart = match.index;
      const parenStart = taskStart + match[0].length - 1;
      const parenEnd = findMatchingParen(input, parenStart + 1);
      if (parenEnd === -1) continue;
      const taskContent = input.slice(parenStart + 1, parenEnd);
      const taskNameMatch = taskContent.match(/["']([^"']+)["']/);
      if (!taskNameMatch) continue;
      const caseName = taskNameMatch[1];
      if (inputCtx.recursivePathList.includes(caseName)) {
        throw new Error("存在递归调用子任务，请检查, " + [...inputCtx.recursivePathList, caseName].join(" => "));
      }
      if (!allCaseName2InfoMap[caseName]) {
        throw new Error("找不到子TASK , " + caseName);
      }
      if (!inputCtx._globalCompiledSet.has(caseName)) {
        inputCtx._globalCompiledSet.add(caseName);
        const caseInfo = allCaseName2InfoMap[caseName];
        const newCompileCtx = new JsAntlr4CustomCompileCtx();
        newCompileCtx.input = caseInfo.content;
        newCompileCtx.recursivePathList = [...inputCtx.recursivePathList, caseInfo.name];
        newCompileCtx._globalCompiledSet = inputCtx._globalCompiledSet;
        const outCtx = JsAntlr4._codeCustomCompile(newCompileCtx, allCaseName2InfoMap);
        inputCtx.extraInputTextList.push("\n\nasync function __TASK_" + caseName + "(){\n" + outCtx.output + "\n}\n");
        inputCtx.extraInputTextList = inputCtx.extraInputTextList.concat(outCtx.extraInputTextList);
      }
      const replacement = `(await __TASK_${caseName}())`;
      const fullMatch = input.slice(taskStart, parenEnd + 1);
      result = result.slice(0, taskStart + offset) + replacement + result.slice(parenEnd + 1 + offset);
      offset += replacement.length - fullMatch.length;
    }
    input = result;
    const wsPattern = /WS\.([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    result = input;
    offset = 0;
    while ((match = wsPattern.exec(input)) !== null) {
      if (isInStringOrComment(input, match.index)) continue;
      const wsStart = match.index;
      const parenStart = wsStart + match[0].length - 1;
      const parenEnd = findMatchingParen(input, parenStart + 1);
      if (parenEnd === -1) continue;
      const fullMatch = input.slice(wsStart, parenEnd + 1);
      const replacement = `(await ${fullMatch})`;
      result = result.slice(0, wsStart + offset) + replacement + result.slice(parenEnd + 1 + offset);
      offset += replacement.length - fullMatch.length;
    }
    input = result;
    const funcPattern = /FUNC\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    result = input;
    offset = 0;
    while ((match = funcPattern.exec(input)) !== null) {
      if (isInStringOrComment(input, match.index)) continue;
      const funcStart = match.index;
      const parenStart = funcStart + match[0].length - 1;
      const parenEnd = findMatchingParen(input, parenStart + 1);
      if (parenEnd === -1) continue;
      const fullMatch = input.slice(funcStart, parenEnd + 1);
      const replacement = `await ${fullMatch}`;
      result = result.slice(0, funcStart + offset) + replacement + result.slice(parenEnd + 1 + offset);
      offset += replacement.length - fullMatch.length;
    }
    input = result;
    const sleepPattern = /\bSleep\s*\(/g;
    result = input;
    offset = 0;
    while ((match = sleepPattern.exec(input)) !== null) {
      if (isInStringOrComment(input, match.index)) continue;
      const sleepStart = match.index;
      const parenStart = sleepStart + match[0].length - 1;
      const parenEnd = findMatchingParen(input, parenStart + 1);
      if (parenEnd === -1) continue;
      const fullMatch = input.slice(sleepStart, parenEnd + 1);
      const replacement = `await ${fullMatch}`;
      result = result.slice(0, sleepStart + offset) + replacement + result.slice(parenEnd + 1 + offset);
      offset += replacement.length - fullMatch.length;
    }
    input = result;
    const uPattern = /U\.([a-zA-Z_][a-zA-Z0-9_]*)((?:\s*\??\.?\s*[a-zA-Z_][a-zA-Z0-9_]*|\s*\??\.\s*\[[^\]]+\]|\s*\[[^\]]+\])*)/g;
    result = input;
    offset = 0;
    while ((match = uPattern.exec(input)) !== null) {
      if (isInStringOrComment(input, match.index)) continue;
      const uStart = match.index;
      const fullMatch = match[0];
      const pathList = ["U"];
      const propChain = match[1] + (match[2] || "");
      const parts = propChain.split(/(?:\.|\.|\?\.)/).filter((p2) => p2);
      for (const part of parts) {
        const bracketMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)?(?:\[['"]?([^\]'"]+)['"]?\])?$/);
        if (bracketMatch) {
          if (bracketMatch[1]) pathList.push(bracketMatch[1]);
          if (bracketMatch[2]) pathList.push(bracketMatch[2]);
        } else {
          pathList.push(part.replace(/\[.*\]/, ""));
        }
      }
      const replacement = `(await getProxyValueU(${JSON.stringify(pathList)}))`;
      result = result.slice(0, uStart + offset) + replacement + result.slice(uStart + fullMatch.length + offset);
      offset += replacement.length - fullMatch.length;
    }
    inputCtx.output = result;
    return inputCtx;
  }
  static debug(input) {
    const chars = new Ln.InputStream(input);
    const lexer = new DebugExprLexer(chars);
    const tokens = new Ln.CommonTokenStream(lexer);
    const parser = new DebugExprParser(tokens);
    const tree = parser.allExpr();
    const walker = new Ln.tree.ParseTreeWalker();
    const rewriter = new Ln.TokenStreamRewriter(tokens);
    const listener = new class extends DebugExprListener {
      enterComment(ctx) {
        rewriter.replace(ctx.start, ctx.stop, "//我是注释\n");
      }
      enterSelect(ctx) {
        ctx.children.forEach((el) => {
          if (el.symbol.text == "获取") {
            rewriter.replaceSingle(el.symbol, "select");
          } else if (el.symbol.text == "所有字段") {
            rewriter.replaceSingle(el.symbol, "*");
          } else if (el.symbol.text == "从表") {
            rewriter.replaceSingle(el.symbol, "from");
          }
        });
      }
    }();
    walker.walk(listener, tree);
    return rewriter.getText();
  }
}
class JsAntlr4CustomCompileCtx {
  constructor() {
    this.input = "";
    this.output = "";
    this.extraInputTextList = [];
    this.recursivePathList = [];
  }
}
async function getGlobalVariables(params = {}) {
  const resp = await axiosJSON.post("/adjust/env/index", params);
  return resp.data;
}
class GlobalVariableManager {
  constructor() {
    this.variables = /* @__PURE__ */ new Map();
    this.initialized = false;
  }
  /**
   * 初始化全局变量管理器
   */
  async init() {
    if (this.initialized) {
      return;
    }
    try {
      const response = await getGlobalVariables();
      const variables = response.data || [];
      this.variables.clear();
      variables.forEach((variable) => {
        this.variables.set(variable.name, {
          id: variable.id,
          default_value: variable.default_value,
          localValue: variable.localValue,
          type: variable.type,
          description: variable.description
        });
      });
      this.initialized = true;
      console.log("全局变量管理器初始化完成，加载了", variables.length, "个变量");
    } catch (error) {
      console.error("初始化全局变量管理器失败:", error);
      this.initialized = true;
    }
  }
  /**
   * 获取变量值
   * 检查勾选状态，如果启用本地值则返回本地值，否则返回默认值
   * @param {string} variableName 变量名
   * @returns {any} 变量值，如果变量不存在返回undefined
   */
  getVariable(variableName) {
    if (!this.initialized) {
      console.warn("全局变量管理器尚未初始化");
      return void 0;
    }
    const variable = this.variables.get(variableName);
    if (!variable) {
      return void 0;
    }
    if ("useLocalValue" in variable) {
      if (variable.useLocalValue && variable.localValue !== null) {
        return variable.localValue;
      } else {
        return variable.default_value;
      }
    }
    try {
      const storageKey = `globalVariable_${variable.id}`;
      const storedData = localStorage.getItem(storageKey);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        const useLocalValue = parsed.useLocalValue || false;
        const localValue = parsed.localValue || null;
        if (useLocalValue && localValue !== null) {
          return localValue;
        }
      }
    } catch (error) {
      console.warn("从localStorage读取勾选状态失败:", error);
    }
    return variable.default_value;
  }
  /**
   * 获取变量信息
   * @param {string} variableName 变量名
   * @returns {Object|undefined} 变量信息对象
   */
  getVariableInfo(variableName) {
    if (!this.initialized) {
      return void 0;
    }
    return this.variables.get(variableName);
  }
  /**
   * 检查变量是否存在
   * @param {string} variableName 变量名
   * @returns {boolean} 变量是否存在
   */
  hasVariable(variableName) {
    if (!this.initialized) {
      return false;
    }
    return this.variables.has(variableName);
  }
  /**
   * 获取所有变量名
   * @returns {string[]} 变量名数组
   */
  getAllVariableNames() {
    if (!this.initialized) {
      return [];
    }
    return Array.from(this.variables.keys());
  }
  /**
   * 刷新变量数据
   */
  async refresh() {
    this.initialized = false;
    await this.init();
  }
  /**
   * 设置变量数据（用于worker初始化）
   * @param {Map} variables 变量数据Map
   */
  setVariables(variables) {
    if (variables && variables.size > 0) {
      this.variables = new Map(variables);
      this.initialized = true;
      console.log("全局变量管理器通过setVariables初始化，加载了", variables.size, "个变量");
      const firstFew = Array.from(variables.entries()).slice(0, 3);
      console.log("前几个变量:", firstFew);
    } else {
      console.warn("setVariables: 无效的变量数据", { variables });
    }
  }
  /**
   * 创建ENV代理对象
   * 用于在TASK用例中通过ENV.变量名访问全局变量
   * @returns {Proxy} ENV代理对象
   */
  createEnvProxy() {
    const self2 = this;
    return new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (typeof prop === "string") {
            return self2.getVariable(prop);
          }
          return void 0;
        },
        has: (_target, prop) => {
          if (typeof prop === "string") {
            return self2.hasVariable(prop);
          }
          return false;
        },
        ownKeys: (_target) => {
          return self2.getAllVariableNames();
        },
        getOwnPropertyDescriptor: (_target, prop) => {
          if (typeof prop === "string" && self2.hasVariable(prop)) {
            const value = self2.getVariable(prop);
            return {
              value,
              writable: false,
              enumerable: true,
              configurable: true
              // 改为true，允许属性被删除和重新定义
            };
          }
          return void 0;
        }
      }
    );
  }
}
const globalVariableManager = new GlobalVariableManager();
const buildWsLogTitle = (route, child) => {
  if (typeof route === "number") {
    const routeName = protoMsg.protoRoot?.lookup("pb.RouteMap")?.valuesById?.[route];
    if (routeName) {
      const routeDoc = protoMsg.docs?.enum?.RouteMap?.[route];
      if (routeDoc?.description) {
        return `${routeName} [${routeDoc.description}]`;
      }
      return `${routeName} [msgId：${route}]`;
    }
    return `msgId：${route}`;
  }
  return `${route.id}.${child.method} [${route.label}-${child.label}]`;
};
const workerBatchLogin = async (accounts) => {
  const response = await fetch("https://account.xmpaoyou.com/api/game-account/batch-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      accounts,
      device_id: "robot_batch_worker"
    })
  });
  const resp = await response.json();
  if (resp.code !== 0) {
    throw new Error("批量登录失败: " + (resp.msg || resp.message || "未知错误"));
  }
  return {
    successResults: resp.data.success_results || [],
    failResults: resp.data.fail_results || []
  };
};
const RESPONSE_PREVIEW_MAX_LENGTH = 300;
const workerCenterLogin = async (token, username, baseURL) => {
  const deviceId = "worker_" + Math.random().toString(36).substring(2, 15);
  const params = new URLSearchParams({
    token,
    username,
    loginType: "bearjoy_new",
    deviceId,
    resVer: "1.0.513"
  });
  const centerLoginUrl = `${baseURL || ""}/center/login?${params.toString()}`;
  const response = await fetch(centerLoginUrl, {
    method: "GET"
  });
  const responseText = await response.text();
  let resp;
  try {
    resp = JSON.parse(responseText);
  } catch (error) {
    const responsePreview = responseText.replace(/\s+/g, " ").slice(0, RESPONSE_PREVIEW_MAX_LENGTH);
    throw new Error(
      `Center登录响应不是JSON: status=${response.status}, contentType=${response.headers.get("content-type") || "-"}, url=${baseURL || ""}/center/login, body=${responsePreview}, jsonError=${error.message}`
    );
  }
  if (!response.ok) {
    const responsePreview = responseText.replace(/\s+/g, " ").slice(0, RESPONSE_PREVIEW_MAX_LENGTH);
    throw new Error(
      `Center登录HTTP失败: status=${response.status}, contentType=${response.headers.get("content-type") || "-"}, url=${baseURL || ""}/center/login, body=${responsePreview}`
    );
  }
  if (resp.s !== 0) {
    throw new Error("Center登录失败: " + (resp.msg || "未知错误"));
  }
  return { al: resp.al, h: resp.h };
};
const workerLoadHash = async (uId) => {
  const baseURL = (self.baseURL || "").replace(/\/$/, "");
  const response = await fetch(`${baseURL}/adjust/wstool/getHash?uId=${encodeURIComponent(uId)}`, {
    method: "GET",
    headers: self.ssoEnabled && self.authToken ? {
      Authorization: `Bearer ${self.authToken}`
    } : void 0
  });
  const resp = await response.json();
  if (!resp?.hash || !resp?.ws) {
    throw new Error("加载Hash失败");
  }
  return resp;
};
const userMap = /* @__PURE__ */ new Map();
const userWsMap = /* @__PURE__ */ new Map();
const userTaskStopSet = /* @__PURE__ */ new Set();
const userTaskPauseSet = /* @__PURE__ */ new Set();
const runningTaskUserIdSet = /* @__PURE__ */ new Set();
const userOnlineStopSet = /* @__PURE__ */ new Set();
const workerCommandState = {
  onlineCommandRunning: false,
  taskCommandRunning: false
};
let skipUserLogCount = 0;
const WORKER_SYNC_INTERVAL_MS = 1e3;
const BATCH_LOGIN_SIZE = 50;
const HASH_LOAD_CONCURRENCY = 50;
const CENTER_LOGIN_CONCURRENCY = 10;
const WS_CONNECT_CONCURRENCY = 10;
const LOGIN_RETRY_COUNT = 50;
const LOGIN_RETRY_INTERVAL_SECOND = 10;
const ERROR_LOG_MAX_SIZE = 5;
let workerSyncTimerId = 0;
const userSyncMap = /* @__PURE__ */ new Map();
const errorLogCountMap = /* @__PURE__ */ new Map();
const statisticSummary = {
  sendNum: 0,
  recvNum: 0,
  responseNum: 0,
  responseErrorNum: 0,
  sendBytes: 0,
  recvBytes: 0,
  responseDelayTotalMs: 0,
  responseDelayCount: 0,
  robotLoginNum: 0,
  robotExitNum: 0
};
const workerDebugLog = (...args) => {
  console.log("[batch-task-worker]", (/* @__PURE__ */ new Date()).toISOString(), ...args);
};
const toLogPayload = (value) => {
  if (value === void 0) {
    return "";
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return String(value);
  }
};
const findWsRouteMeta = (routerName) => {
  const byPbName = protoMsg.getRouteByPbName?.(routerName);
  if (byPbName) {
    const route = (protoMsg.routes || []).find(
      (item) => item.children?.some((child) => child.id === byPbName.id)
    );
    if (route) {
      return { route, child: byPbName };
    }
  }
  for (const route of protoMsg.routes || []) {
    const child = route.children?.find((item) => item.method === routerName);
    if (child) {
      return { route, child };
    }
  }
  return null;
};
async function runWsWithLog(logger, ws, route, child, params) {
  const logTitle = buildWsLogTitle(route, child);
  const req = {
    route: child.id,
    params
  };
  logger.info("执行 " + logTitle, req);
  try {
    const rs = await ws.send({ route: child.id, params });
    if (rs?.errId) {
      logger.error("响应错误 " + logTitle, {
        req,
        errId: rs.errId,
        response: rs.json ?? null
      });
    } else {
      logger.info("响应 " + logTitle, {
        req,
        response: rs?.json ?? null
      });
    }
    return rs?.json ?? null;
  } catch (error) {
    logger.error("WS FAIL " + logTitle, {
      req,
      error: toLogPayload(error)
    });
    throw error;
  }
}
async function runFuncWithLog(logger, uId, funcInfo, args) {
  const params = (funcInfo.fields || []).map(({ name }, index) => ({
    name,
    value: args[index]
  }));
  const req = {
    uId,
    flag: funcInfo.flag,
    route: funcInfo.route,
    params
  };
  const logTitle = `${funcInfo.route} [FUNC]`;
  logger.info("FUNC Request " + logTitle, { req });
  try {
    const resp = await FuncHandler.run(uId, req);
    logger.info("FUNC Response " + logTitle, { req, resp });
    return resp;
  } catch (error) {
    logger.error("FUNC Fail " + logTitle, {
      req,
      error: toLogPayload(error)
    });
    throw error;
  }
}
const BatchStatisticType = {
  // 汇报 send/recv/响应耗时和机器人登录退出增量。
  summary: "summary",
  // 汇报本地执行器子进程存活数和总进程数。
  processState: "processState",
  // 汇报当前 Worker 是否正在处理任务命令。
  taskCommandState: "taskCommandState",
  // 汇报当前 Worker 是否正在处理上下线命令。
  onlineCommandState: "onlineCommandState"
};
const BatchEventType = {
  toWorker: {
    run: "run",
    startProcess: "startProcess",
    stopProcess: "stopProcess",
    login: "login",
    logout: "logout",
    updateUserTask: "updateUserTask",
    runTask: "runTask",
    stopTask: "stopTask",
    pauseTask: "pauseTask",
    resumeTask: "resumeTask",
    watchUserLogs: "watchUserLogs"
  },
  toMain: {
    syncUser: "syncUser",
    statistic: "statistic",
    stop: "stop",
    log: "log",
    userLog: "userLog"
  }
};
const handleBatchTaskWorkerMessage = async function(e2) {
  const { event: event2 } = e2.data;
  switch (event2) {
    case BatchEventType.toWorker.stopProcess: {
      workerDebugLog("receive stop message", { userMapSize: userMap.size });
      userTaskPauseSet.clear();
      userTaskStopSet.clear();
      await logoutUsers(Array.from(userMap.values()));
      userMap.clear();
      flushWorkerSync();
      stopWorkerSyncTimer();
      self.postMessage({ event: BatchEventType.toMain.stop });
      self.close();
      break;
    }
    case BatchEventType.toWorker.watchUserLogs: {
      self.watchedUserLogIdSet = new Set(e2.data.userIds || []);
      break;
    }
    case BatchEventType.toWorker.startProcess: {
      initWorkerContext(e2.data);
      startWorkerSyncTimer();
      break;
    }
    case BatchEventType.toWorker.login: {
      const users = e2.data.users || [];
      for (const user of users) {
        userOnlineStopSet.delete(user.id);
      }
      initWorkerContext(e2.data);
      startWorkerSyncTimer();
      syncOnlineCommandStatistic(true);
      try {
        await ensureUsersOnline(users);
      } finally {
        flushWorkerSync();
      }
      break;
    }
    case BatchEventType.toWorker.logout: {
      syncOnlineCommandStatistic(false);
      syncTaskCommandStatistic(false);
      try {
        await logoutUsers(e2.data.users || []);
      } finally {
        flushWorkerSync();
      }
      break;
    }
    case BatchEventType.toWorker.updateUserTask: {
      initWorkerContext(e2.data);
      updateUserTasks(e2.data.users || []);
      flushWorkerSync();
      break;
    }
    case BatchEventType.toWorker.runTask: {
      const users = e2.data.users || [];
      if (workerCommandState.taskCommandRunning) {
        break;
      }
      const usersToRun = [];
      for (const user of users) {
        const workerUser = userMap.get(user.id) || user;
        userTaskPauseSet.delete(workerUser.id);
        userTaskStopSet.delete(workerUser.id);
        userOnlineStopSet.delete(workerUser.id);
        resetUserTaskRuntime(workerUser);
        usersToRun.push(workerUser);
      }
      if (usersToRun.length <= 0) {
        break;
      }
      syncOnlineCommandStatistic(true);
      syncTaskCommandStatistic(true);
      startWorkerSyncTimer();
      try {
        await ensureUsersOnline(usersToRun);
        await runUsersTask(usersToRun);
      } catch (error) {
        workerDebugLog("run task error", { message: error.message, stack: error.stack });
        self.postMessage({
          event: BatchEventType.toMain.log,
          log: { type: "error", title: "执行任务失败", content: error.message }
        });
      } finally {
        flushWorkerSync();
      }
      break;
    }
    case BatchEventType.toWorker.stopTask: {
      const users = e2.data.users || [];
      if (users.length <= 0) {
        for (const userId of userMap.keys()) {
          userTaskPauseSet.delete(userId);
          userTaskStopSet.add(userId);
        }
        syncTaskCommandStatistic(false);
        break;
      }
      for (const user of users) {
        userTaskPauseSet.delete(user.id);
        userTaskStopSet.add(user.id);
      }
      break;
    }
    case BatchEventType.toWorker.pauseTask: {
      const users = e2.data.users || [];
      const ids = users.length > 0 ? users.map((user) => user.id) : Array.from(userMap.keys());
      for (const id of ids) {
        userTaskPauseSet.add(id);
        const user = userMap.get(id);
        if (user && runningTaskUserIdSet.has(id)) syncUserTaskState(user, "taskPaused", "任务已暂停");
      }
      flushWorkerSync();
      break;
    }
    case BatchEventType.toWorker.resumeTask: {
      const users = e2.data.users || [];
      const ids = users.length > 0 ? users.map((user) => user.id) : Array.from(userMap.keys());
      for (const id of ids) {
        userTaskPauseSet.delete(id);
        const user = userMap.get(id);
        if (user && runningTaskUserIdSet.has(id)) syncUserTaskState(user, "taskExec", "执行任务中");
      }
      flushWorkerSync();
      break;
    }
    case BatchEventType.toWorker.run: {
      const { users, sId } = e2.data;
      workerDebugLog("run start", { users: users?.length || 0, sId, enableUserLog: e2.data.enableUserLog });
      initWorkerContext(e2.data);
      updateUserTasks(users);
      for (const user of users) {
        userTaskStopSet.delete(user.id);
        userTaskPauseSet.delete(user.id);
        userOnlineStopSet.delete(user.id);
      }
      startWorkerSyncTimer();
      await ensureUsersOnline(users);
      workerDebugLog("before execute tasks", {
        total: users.length,
        executableUsers: users.filter((user) => user.wsInfo && user.onlineState?.type !== "error").length,
        errorUsers: users.filter((user) => user.onlineState?.type === "error").length
      });
      await runUsersTask(users);
      workerDebugLog("all execute promises resolved", { userMapSize: userMap.size });
      flushWorkerSync();
      break;
    }
  }
};
function syncTaskCommandStatistic(hasRunningCommand) {
  syncWorkerCommandStatistic("taskCommandRunning", BatchStatisticType.taskCommandState, hasRunningCommand);
}
function syncOnlineCommandStatistic(hasRunningCommand) {
  syncWorkerCommandStatistic("onlineCommandRunning", BatchStatisticType.onlineCommandState, hasRunningCommand);
}
function finishUserTaskRunning(user) {
  const oldSize = runningTaskUserIdSet.size;
  runningTaskUserIdSet.delete(user.id);
  if (oldSize > 0 && runningTaskUserIdSet.size <= 0) {
    syncTaskCommandStatistic(false);
  }
}
function syncWorkerCommandStatistic(commandStateKey, statisticType, hasRunningCommand) {
  if (workerCommandState[commandStateKey] === hasRunningCommand) {
    return;
  }
  workerCommandState[commandStateKey] = hasRunningCommand;
  self.postMessage({
    event: BatchEventType.toMain.statistic,
    statistic: {
      type: statisticType,
      workerId: self.workerId,
      hasRunningCommand
    }
  });
}
if (typeof self !== "undefined" && typeof window === "undefined") {
  self.onmessage = handleBatchTaskWorkerMessage;
}
function initWorkerContext(data) {
  const { users = [], sId, baseURL, authToken, ssoEnabled, protoJson, globalVariables, CONF, allCaseName2InfoMap, customFuncMap } = data;
  skipUserLogCount = 0;
  errorLogCountMap.clear();
  self.baseURL = baseURL;
  self.authToken = authToken || "";
  self.ssoEnabled = !!ssoEnabled;
  self.enableUserLog = data.enableUserLog !== false;
  self.workerId = data.workerId ?? self.workerId ?? 0;
  self.watchedUserLogIdSet = new Set(data.watchUserLogIds || []);
  if (protoJson) {
    try {
      const parsed = typeof protoJson === "string" ? JSON.parse(protoJson) : protoJson;
      protoMsg.initByProtoJson(parsed);
    } catch (error) {
      workerDebugLog("protoJson init error", { message: error.message });
    }
  }
  if (globalVariables && globalVariables.length > 0) {
    const variablesMap = /* @__PURE__ */ new Map();
    globalVariables.forEach((variable) => {
      variablesMap.set(variable.name, variable);
    });
    globalVariableManager.setVariables(variablesMap);
  }
  self.CONF = CONF;
  self.allCaseName2InfoMap = allCaseName2InfoMap || {};
  self.customFuncMap = customFuncMap || {};
  self.sId = sId;
  for (const user of users) {
    const workerUser = userMap.get(user.id);
    if (workerUser) {
      workerUser.username = user.username || workerUser.username;
      workerUser.password = user.password || workerUser.password;
      workerUser.uid = user.uid || workerUser.uid;
      workerUser.loginType = user.loginType || workerUser.loginType;
      syncUser(workerUser);
      continue;
    }
    user.logger = createLogger(user);
    userMap.set(user.id, user);
    syncUserOnlineState(user, "ready", "准备中");
  }
}
function resetUserTaskRuntime(user) {
  user.taskState = null;
  user.curTask = null;
  user.error = null;
  syncUser(user);
}
function updateUserTasks(users) {
  for (const user of users) {
    const workerUser = userMap.get(user.id);
    if (!workerUser) {
      continue;
    }
    workerUser.tasks = user.tasks || [];
    syncUser(workerUser);
  }
}
function syncUser(user) {
  const syncData = {
    id: user.id,
    username: user.username,
    uid: user.uid,
    onlineState: user.onlineState,
    taskState: user.taskState,
    isOnline: user.isOnline === true,
    roleInfo: user.roleInfo,
    curTask: user.curTask ? {
      taskInfo: { name: user.curTask.taskInfo?.name },
      surplus: user.curTask.surplus,
      execCount: user.curTask.execCount,
      delayState: user.curTask.delayState,
      execState: user.curTask.execState
    } : null,
    error: user.error,
    logCount: user.logger?.length || 0
  };
  userSyncMap.set(syncData.id, syncData);
}
function flushUserSync() {
  const hasUserSyncData = userSyncMap.size > 0;
  if (!hasUserSyncData) {
    return;
  }
  self.postMessage({
    event: BatchEventType.toMain.syncUser,
    userList: Array.from(userSyncMap.values())
  });
  userSyncMap.clear();
}
function flushWorkerSync() {
  flushUserSync();
  flushStatistic();
}
function startWorkerSyncTimer() {
  if (!workerSyncTimerId) {
    workerSyncTimerId = setInterval(flushWorkerSync, WORKER_SYNC_INTERVAL_MS);
  }
}
function stopWorkerSyncTimer() {
  if (workerSyncTimerId) {
    clearInterval(workerSyncTimerId);
    workerSyncTimerId = 0;
  }
}
function syncStatistic(type2, payload = {}) {
  switch (type2) {
    case "wsSend":
      statisticSummary.sendNum++;
      statisticSummary.sendBytes += payload.length || 0;
      break;
    case "wsRecv":
      statisticSummary.recvNum++;
      statisticSummary.recvBytes += payload.length || 0;
      if (payload.reqId) {
        statisticSummary.responseNum++;
        if (payload.errId) {
          statisticSummary.responseErrorNum++;
        }
        if (payload.responseDelayMs >= 0) {
          statisticSummary.responseDelayTotalMs += payload.responseDelayMs;
          statisticSummary.responseDelayCount++;
        }
      }
      break;
    case "robotLogin":
      statisticSummary.robotLoginNum++;
      break;
    case "robotExit":
      statisticSummary.robotExitNum++;
      break;
  }
}
function flushStatistic() {
  const hasStatistic = Object.values(statisticSummary).some((item) => item > 0);
  if (!hasStatistic) {
    return;
  }
  self.postMessage({
    event: BatchEventType.toMain.statistic,
    statistic: {
      type: BatchStatisticType.summary,
      ...statisticSummary
    }
  });
  Object.keys(statisticSummary).forEach((key) => {
    statisticSummary[key] = 0;
  });
}
async function initUsersLoginInfo(users) {
  const accountUsers = users.filter((user) => !user.uid && !user.wsInfo);
  const uidUsers = users.filter((user) => !!user.uid && !user.wsInfo);
  workerDebugLog("user split", {
    total: users.length,
    accountUsers: accountUsers.length,
    uidUsers: uidUsers.length
  });
  if (accountUsers.length > 0) {
    self.postMessage({
      event: BatchEventType.toMain.log,
      log: {
        type: "info",
        title: "批量登录",
        content: `开始批量登录 ${accountUsers.length} 个账号`
      }
    });
    try {
      for (let i2 = 0; i2 < accountUsers.length; i2 += BATCH_LOGIN_SIZE) {
        const batchUsers = accountUsers.slice(i2, i2 + BATCH_LOGIN_SIZE).filter((user) => !shouldStopUserOnline(user));
        if (batchUsers.length <= 0) {
          continue;
        }
        const batch2 = batchUsers.map((user) => ({
          account: user.username,
          password: user.password
        }));
        batchUsers.forEach((user) => {
          syncUserOnlineState(user, "sdkLogin", "SDK登录中");
        });
        const loginResult = await retryNetworkRequest(
          "SDK批量登录",
          () => workerBatchLogin(batch2),
          () => batchUsers.every((user) => shouldStopUserOnline(user))
        );
        if (!loginResult) {
          continue;
        }
        for (const result of loginResult.successResults) {
          const user = accountUsers.find((u2) => u2.username === result.account);
          if (user && !shouldStopUserOnline(user)) {
            user.token = result.token;
            syncUserOnlineState(user, "sdkLoginSuccess", "SDK登录成功");
          }
        }
        for (const result of loginResult.failResults) {
          const user = accountUsers.find((u2) => u2.username === result.account);
          if (user && !shouldStopUserOnline(user)) {
            finishFailedUserOnline(user, "SDK登录失败", result.error || "账号或密码错误");
          }
        }
      }
      self.postMessage({
        event: BatchEventType.toMain.log,
        log: { type: "info", title: "批量登录", content: "批量SDK登录完成" }
      });
    } catch (e2) {
      self.postMessage({
        event: BatchEventType.toMain.log,
        log: { type: "error", title: "批量登录失败", content: e2.message }
      });
      accountUsers.forEach((user) => {
        if (!user.token && !shouldStopUserOnline(user)) {
          finishFailedUserOnline(user, "批量登录失败", e2.message);
        }
      });
    }
  }
  if (uidUsers.length > 0) {
    await asyncPool(HASH_LOAD_CONCURRENCY, uidUsers, async (user) => {
      if (shouldStopUserOnline(user)) {
        return;
      }
      try {
        syncUserOnlineState(user, "hashLoading", "加载Hash中");
        const hashData = await workerLoadHash(user.uid);
        if (shouldStopUserOnline(user)) {
          return;
        }
        user.hash = hashData.hash;
        user.wsInfo = { wsUrl: hashData.ws };
        syncUserOnlineState(user, "loginSuccess", "UID初始化成功");
      } catch (e2) {
        if (shouldStopUserOnline(user)) {
          return;
        }
        finishFailedUserOnline(user, "UID初始化失败", e2.message);
      }
    });
  }
  const usersWithToken = accountUsers.filter((user) => user.token && user.onlineState?.type !== "error");
  await asyncPool(CENTER_LOGIN_CONCURRENCY, usersWithToken, async (user) => {
    if (shouldStopUserOnline(user)) {
      return;
    }
    try {
      await initUserCenterLogin(user, self.sId);
    } catch (e2) {
      if (shouldStopUserOnline(user)) {
        return;
      }
      finishFailedUserOnline(user, "Center登录失败", e2.message);
    }
  });
}
async function connectUserWs(user) {
  if (shouldStopUserOnline(user) || !user.wsInfo) {
    skipUserExecute(user);
    return null;
  }
  const oldWs = userWsMap.get(user.id);
  if (oldWs?.isConnected()) {
    user.isOnline = true;
    if (user.onlineState?.val !== "wsLoginSuccess") {
      syncUserOnlineState(user, "wsLoginSuccess", "已上线");
    }
    return oldWs;
  }
  if (!user.logger) {
    user.logger = createLogger(user);
  }
  const routeMap = protoMsg.protoRoot?.lookup("pb.RouteMap");
  user.error = null;
  syncUserOnlineState(user, "wsConnect", "WS连接中");
  const ws = new WsPromise({ hash: user.hash, sId: self.sId, uId: user.uid || "" });
  ws.url = user.wsInfo.wsUrl;
  ws.eventContainer.on("send", (message2) => {
    syncStatistic("wsSend", { length: message2?.length || 0 });
  });
  ws.eventContainer.on("recv", (message2) => {
    const reqId = message2?.reqId || 0;
    syncStatistic("wsRecv", {
      length: message2?.length || 0,
      reqId: typeof message2?.responseDelayMs === "number" ? reqId : 0,
      errId: message2?.errId || 0,
      responseDelayMs: message2?.responseDelayMs
    });
    if (routeMap?.valuesById?.[message2?.msgId]?.startsWith("PUSH")) {
      user.logger?.info("推送 " + buildWsLogTitle(message2.msgId), toLogPayload(message2.json ?? null));
    }
  });
  ws.eventContainer.on("disconnected", () => {
    user.logger?.warn("WS连接断开", "可能是被顶号、账号被挤下线或网络异常");
    if (userWsMap.get(user.id) === ws) {
      userWsMap.delete(user.id);
      user.isOnline = false;
      syncUser(user);
      syncStatistic("robotExit");
    }
  });
  await ws.connect();
  if (shouldStopUserOnline(user)) {
    await ws.close();
    return null;
  }
  userWsMap.set(user.id, ws);
  syncStatistic("robotLogin");
  user.roleInfo = {
    id: ws.USER_CACHE?.User?.id || user.uid || "",
    name: ws.USER_CACHE?.User?.name
  };
  user.isOnline = true;
  syncUserOnlineState(user, "wsLoginSuccess", "已上线");
  return ws;
}
async function ensureUsersOnline(users) {
  const workerUsers = users.map((user) => userMap.get(user.id)).filter(Boolean);
  await initUsersLoginInfo(workerUsers);
  await asyncPool(
    WS_CONNECT_CONCURRENCY,
    workerUsers,
    async (user) => {
      if (shouldStopUserOnline(user)) {
        return;
      }
      try {
        await retryNetworkRequest("WS连接", () => connectUserWs(user), () => shouldStopUserOnline(user));
      } catch (e2) {
        if (shouldStopUserOnline(user)) {
          return;
        }
        finishFailedUserOnline(user, "WS连接失败", e2.message);
      }
    }
  );
}
function syncUserOnlineState(user, stateVal, stateDesc, stateType) {
  user.onlineState = { val: stateVal, desc: stateDesc };
  if (stateType) {
    user.onlineState.type = stateType;
  }
  syncUser(user);
}
function finishFailedUserOnline(user, stateDesc, errorMessage) {
  user.error = errorMessage;
  user.logger?.error(stateDesc, user.error);
  syncUserOnlineState(user, "loginFail", stateDesc, "error");
}
async function logoutUsers(users) {
  const usersToLogout = users.length > 0 ? users : Array.from(userMap.values());
  for (const userData of usersToLogout) {
    const user = userMap.get(userData.id) || userData;
    userOnlineStopSet.add(user.id);
    userTaskStopSet.add(user.id);
    userTaskPauseSet.delete(user.id);
    const ws = userWsMap.get(user.id);
    if (ws) {
      try {
        await ws.close();
      } catch (e2) {
        user.logger?.error("WS关闭失败", e2.message);
      }
      userWsMap.delete(user.id);
    }
    user.curTask = null;
    user.taskState = null;
    user.isOnline = false;
    syncUserOnlineState(user, "offline", "已下线");
  }
}
async function runUsersTask(users) {
  await Promise.all(users.map((userData) => executeUserTasks(userMap.get(userData.id) || userData)));
}
function skipUserExecute(user) {
  if (skipUserLogCount < 10) {
    workerDebugLog("skip user execute", {
      id: user.id,
      username: user.username,
      uid: user.uid,
      hasWsInfo: !!user.wsInfo,
      onlineState: user.onlineState,
      taskState: user.taskState,
      error: user.error
    });
  } else if (skipUserLogCount === 10) {
    workerDebugLog("skip user execute omitted");
  }
  skipUserLogCount++;
}
async function initUserCenterLogin(user, sId) {
  if (shouldStopUserOnline(user)) {
    return;
  }
  syncUserOnlineState(user, "centerLogin", "Center登录中");
  const loginData = await retryNetworkRequest(
    "Center登录",
    () => workerCenterLogin(user.token, user.username, self.baseURL),
    () => shouldStopUserOnline(user)
  );
  if (!loginData || shouldStopUserOnline(user)) {
    return;
  }
  user.hash = loginData.h;
  user.wsInfo = (loginData.al || []).find((item) => item.sId === sId);
  if (!user.wsInfo || !user.wsInfo.wsUrl) {
    throw new Error("未找到服务器地址");
  }
  syncUserOnlineState(user, "loginSuccess", "登录成功");
}
async function executeUserTasks(user) {
  if (shouldStopUserTask(user)) {
    finishStoppedUserTask(user);
    return;
  }
  runningTaskUserIdSet.add(user.id);
  try {
    await doExecuteUserTasks(user);
  } finally {
    finishUserTaskRunning(user);
  }
}
async function doExecuteUserTasks(user) {
  let ws = await connectUserWs(user);
  if (!ws) {
    finishStoppedUserTask(user);
    return;
  }
  let hasExecuteError = false;
  for (const task of user.tasks || []) {
    await waitWhileUserTaskPaused(user);
    if (shouldStopUserTask(user)) {
      break;
    }
    user.curTask = {
      taskInfo: task.taskInfo,
      delayState: 0,
      execState: 0,
      surplus: task.execCount,
      execCount: task.execCount
    };
    syncUser(user);
    user.logger.info(`[${task.taskInfo.name}] 准备执行`);
    if (task.execDelay > 0) {
      user.logger.info(`[${task.taskInfo.name}] 延迟等待 ${task.execDelay}s`);
      await Sleep(task.execDelay);
    }
    user.curTask.delayState = 1;
    await waitWhileUserTaskPaused(user);
    for (let i2 = 0; i2 < task.execCount; i2++) {
      await waitWhileUserTaskPaused(user);
      if (shouldStopUserTask(user)) break;
      user.logger.info(`[${task.taskInfo.name}] 第${i2 + 1}/${task.execCount}次执行`);
      if (i2 > 0 && task.execInterval >= 1) {
        user.curTask.execState = 1;
        syncUser(user);
        await Sleep(task.execInterval);
        await waitWhileUserTaskPaused(user);
        if (shouldStopUserTask(user)) break;
      }
      user.curTask.execState = 2;
      syncUser(user);
      try {
        ws = await connectUserWs(user);
        if (!ws) {
          finishStoppedUserTask(user);
          return;
        }
        if (shouldStopUserTask(user)) break;
        if (user.taskState?.val !== "taskExec") {
          syncUserTaskState(user, "taskExec", "执行任务中");
        }
        user.roleInfo = {
          id: ws.USER_CACHE?.User?.id || user.uid || "",
          name: ws.USER_CACHE?.User?.name
        };
        syncUser(user);
        await waitWhileUserTaskPaused(user);
        if (shouldStopUserTask(user)) break;
        await executeTask(user, task, ws);
        user.logger.info(`[${task.taskInfo.name}] 第${i2 + 1}/${task.execCount}次执行成功`);
      } catch (e2) {
        hasExecuteError = true;
        user.logger.error(`[${task.taskInfo.name}] 执行失败`, e2.message);
        user.curTask.execState = 999;
        user.error = e2.message;
        syncUser(user);
      }
      user.curTask.surplus--;
      syncUser(user);
    }
    user.curTask.execState = 3;
    syncUser(user);
  }
  if (hasExecuteError) {
    user.curTask = null;
    userTaskStopSet.delete(user.id);
    userTaskPauseSet.delete(user.id);
    user.logger.info("所有任务执行完毕");
    syncUserTaskState(user, "taskFail", "任务失败", "error");
    return;
  }
  if (userTaskStopSet.has(user.id)) {
    finishStoppedUserTask(user);
    return;
  }
  user.curTask = null;
  userTaskStopSet.delete(user.id);
  userTaskPauseSet.delete(user.id);
  user.logger.info("所有任务执行完毕");
  syncUserTaskState(user, "taskFinish", "任务完成");
}
function syncUserTaskState(user, stateVal, stateDesc, stateType) {
  user.taskState = { val: stateVal, desc: stateDesc };
  if (stateType) {
    user.taskState.type = stateType;
  }
  syncUser(user);
}
function finishStoppedUserTask(user) {
  user.curTask = null;
  user.taskState = null;
  userTaskStopSet.delete(user.id);
  userTaskPauseSet.delete(user.id);
  if (user.isOnline) {
    syncUserOnlineState(user, "wsLoginSuccess", "已上线");
    return;
  }
  syncUser(user);
}
async function waitWhileUserTaskPaused(user) {
  while (userTaskPauseSet.has(user.id) && !shouldStopUserTask(user)) {
    if (user.taskState?.val !== "taskPaused") syncUserTaskState(user, "taskPaused", "任务已暂停");
    await Sleep(0.2);
  }
}
function shouldStopUserTask(user) {
  return !userMap.has(user.id) || userTaskStopSet.has(user.id);
}
function shouldStopUserOnline(user) {
  return !userMap.has(user.id) || userOnlineStopSet.has(user.id);
}
async function retryNetworkRequest(requestName, requestFn, shouldStopRequest = () => false) {
  let lastError = null;
  for (let retryIndex = 0; retryIndex < LOGIN_RETRY_COUNT; retryIndex++) {
    if (shouldStopRequest()) {
      return null;
    }
    try {
      return await requestFn();
    } catch (error) {
      if (shouldStopRequest()) {
        return null;
      }
      lastError = error;
      workerDebugLog(`${requestName}失败，准备重试 ${retryIndex + 1}/${LOGIN_RETRY_COUNT}`, {
        error: error.message
      });
      if (retryIndex < LOGIN_RETRY_COUNT - 1) {
        await Sleep(LOGIN_RETRY_INTERVAL_SECOND);
      }
    }
  }
  throw lastError;
}
async function executeTask(user, task, ws) {
  const taskInfo = task.taskInfo;
  switch (taskInfo.type) {
    case 1:
      {
        const content = typeof taskInfo.content === "string" ? JSON.parse(taskInfo.content) : taskInfo.content;
        const logTitle = `${content.route || taskInfo.name || "unknown"} [FUNC]`;
        user.logger.info("FUNC Request " + logTitle, { req: content });
        try {
          const resp = await FuncHandler.run(user.roleInfo.id || user.uid, content);
          user.logger.info("FUNC Response " + logTitle, {
            req: content,
            resp
          });
        } catch (error) {
          user.logger.error("FUNC Fail " + logTitle, {
            req: content,
            error: toLogPayload(error)
          });
          throw error;
        }
      }
      break;
    case 2:
      {
        const routeMeta = findWsRouteMeta(taskInfo.router);
        if (!routeMeta) {
          throw new Error(`未找到路由: ${taskInfo.router}`);
        }
        const params = typeof taskInfo.content === "string" ? JSON.parse(taskInfo.content) : taskInfo.content;
        await runWsWithLog(user.logger, ws, routeMeta.route, routeMeta.child, params);
      }
      break;
    case 3:
      await executeScript(user, task, ws);
      break;
    default:
      throw new Error(`未知任务类型: ${taskInfo.type}`);
  }
}
async function executeScript(user, task, ws) {
  const taskInfo = task.taskInfo;
  let code = taskInfo.ext;
  if (!code) {
    code = JsAntlr4.codeCustomCompile(taskInfo.content, taskInfo, self.allCaseName2InfoMap || {});
    code = `return (async () => {
${code}
})();`;
  }
  const WS = createWsProxy(ws, user.logger);
  const ENV = createEnvProxy(task.caseVariables || []);
  const dynamicFunction = new Function(
    "WS",
    "FUNC",
    "CONF",
    "ENV",
    "getProxyValueU",
    "pb",
    "LOG",
    "Time",
    "Sleep",
    "GO",
    code
  );
  let pb = {};
  try {
    pb = WsHandler.toEnvVarPb();
  } catch (e2) {
  }
  await dynamicFunction(
    WS,
    createFuncProxy(user.roleInfo.id || user.uid, user.logger),
    self.CONF,
    ENV,
    (propList) => getProxyValueU(ws, propList),
    pb,
    (title, content) => user.logger.log(title, content),
    Time,
    Sleep,
    createGoFunction(user.logger)
  );
}
function getProxyValueU(ws, propList) {
  if (!ws || !ws.USER_CACHE) {
    return void 0;
  }
  let target = ws.USER_CACHE;
  for (let i2 = 1; i2 < propList.length; i2++) {
    const key = propList[i2];
    target = target?.[key];
    if (target === void 0 || target === null) {
      break;
    }
  }
  return target;
}
function createLogger(user) {
  if (!self.enableUserLog) {
    return {
      log: () => {
      },
      info: () => {
      },
      warn: () => {
      },
      error: () => {
      }
    };
  }
  const addLog = (type2, title, content) => {
    const shouldFullLog = self.watchedUserLogIdSet?.has(user.id);
    const shouldErrorLog = type2 === "error" || type2 === "warning";
    if (shouldErrorLog) {
      errorLogCountMap.set(user.id, (errorLogCountMap.get(user.id) || 0) + 1);
    }
    if (!shouldFullLog) {
      if (!shouldErrorLog) {
        return;
      }
      if ((errorLogCountMap.get(user.id) || 0) > ERROR_LOG_MAX_SIZE) {
        return;
      }
    }
    self.postMessage({
      event: BatchEventType.toMain.userLog,
      userId: user.id,
      log: { type: type2, title, content: toLogPayload(content), time: (/* @__PURE__ */ new Date()).toISOString() }
    });
  };
  return {
    log: (title, content) => addLog("log", title, content),
    info: (title, content) => addLog("info", title, content),
    warn: (title, content) => addLog("warning", title, content),
    error: (title, content) => addLog("error", title, content)
  };
}
function createWsProxy(ws, logger) {
  const routes = protoMsg.routes || [];
  const routeMethods = {};
  for (const route of routes) {
    routeMethods[route.id] = {};
    for (const child of route.children) {
      routeMethods[route.id][child.method] = async (params) => {
        params = params || {};
        return runWsWithLog(logger, ws, route, child, params);
      };
    }
  }
  return new Proxy(routeMethods, {
    get(target, prop) {
      return target[prop] || new Proxy(
        {},
        {
          get() {
            return async () => {
              throw new Error(`未找到路由: ${prop}`);
            };
          }
        }
      );
    }
  });
}
function createFuncProxy(uId, logger) {
  return new Proxy(
    {},
    {
      get(target, prop) {
        return async (...args) => {
          const funcInfo = self.customFuncMap?.[prop];
          if (!funcInfo) {
            throw new Error(`未找到自定义函数: ${String(prop)}`);
          }
          return runFuncWithLog(
            logger,
            uId,
            {
              route: funcInfo.route,
              flag: funcInfo.flag,
              fields: funcInfo.fields || []
            },
            args
          );
        };
      }
    }
  );
}
function createEnvProxy(caseVariables = []) {
  return new Proxy(
    {},
    {
      get(target, prop) {
        if (typeof prop === "string") {
          const caseVar = caseVariables.find((v2) => v2.name === prop);
          if (caseVar) {
            const value = caseVar.useLocalValue && caseVar.localValue !== null ? caseVar.localValue : caseVar.default_value;
            return parseValue(value, caseVar.type);
          }
          if (globalVariableManager.initialized) {
            return globalVariableManager.getVariable(prop);
          }
        }
        return void 0;
      }
    }
  );
}
function parseValue(value, type2) {
  switch (type2) {
    case "number":
      return Number(value);
    case "boolean":
      return value === "true" || value === "1";
    case "json":
    case "array":
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}
function createGoFunction() {
  return async (delay, count, interval, func) => {
    await Sleep(delay);
    for (let i2 = 0; i2 < count; i2++) {
      await func();
      await Sleep(interval);
    }
  };
}
async function asyncPool(poolLimit, inputList, promiseWrapFn) {
  const ret = [];
  const executing = [];
  for (const item of inputList) {
    const p2 = Promise.resolve().then(() => promiseWrapFn(item));
    ret.push(p2);
    if (poolLimit <= inputList.length) {
      const e2 = p2.then(() => executing.splice(executing.indexOf(e2), 1));
      executing.push(e2);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}
const PORT = Number(process.env.ROBOT_RUNNER_PORT || 51730);
const HOST = process.env.ROBOT_RUNNER_HOST || "127.0.0.1";
const RUNNER_FILE = node_url.fileURLToPath(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("robot-nodejs-runner-download.js", document.baseURI).href);
const NODEJS_RUNNER_PROTOCOL_VERSION = "v0.23";
let activeChildList = [];
let activeChildTotalCount = 0;
let hasWrappedNodejsWebSocketAsyncEvent = false;
const runnerLog = (...args) => {
  console.log("[robot-runner]", (/* @__PURE__ */ new Date()).toISOString(), ...args);
};
const wrapNodejsWebSocketAsyncEvent = () => {
  if (hasWrappedNodejsWebSocketAsyncEvent || typeof WebSocket === "undefined") {
    return;
  }
  const originAddEventListener = WebSocket.prototype.addEventListener;
  WebSocket.prototype.addEventListener = function(type2, listener, options) {
    if (typeof listener !== "function") {
      return originAddEventListener.call(this, type2, listener, options);
    }
    const wrappedListener = function(event2) {
      const dispatchError = (error) => {
        runnerLog("websocket event listener error", {
          type: type2,
          message: error?.message || String(error)
        });
        if (type2 === "error") {
          return;
        }
        this.dispatchEvent(
          new ErrorEvent("error", {
            error,
            message: error?.message || String(error)
          })
        );
      };
      try {
        const result = listener.call(this, event2);
        if (result?.catch) {
          result.catch(dispatchError);
        }
      } catch (error) {
        dispatchError(error);
      }
    };
    return originAddEventListener.call(this, type2, wrappedListener, options);
  };
  hasWrappedNodejsWebSocketAsyncEvent = true;
};
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain;charset=utf-8" });
  res.end("robot runner is running\n");
});
const sendJson = (socket, data) => {
  if (socket?.type === "ipc") {
    process.send?.(data);
    return;
  }
  if (!socket || socket.destroyed || socket.writableEnded) {
    return;
  }
  const payload = Buffer.from(JSON.stringify(data));
  const header = [];
  header.push(129);
  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 65536) {
    header.push(126, payload.length >> 8 & 255, payload.length & 255);
  } else {
    const lengthBuffer = Buffer.alloc(8);
    lengthBuffer.writeBigUInt64BE(BigInt(payload.length));
    header.push(127, ...lengthBuffer);
  }
  try {
    socket.write(Buffer.concat([Buffer.from(header), payload]));
  } catch (error) {
    runnerLog("send websocket message error", { message: error.message });
  }
};
const getRunUserCount = (message2) => {
  let userCount = 0;
  for (const childUsers of message2.runnerUserGroupList || []) {
    userCount += childUsers.length;
  }
  return userCount;
};
const readFrameTexts = (socket, chunk) => {
  socket.runnerBuffer = socket.runnerBuffer ? Buffer.concat([socket.runnerBuffer, chunk]) : chunk;
  const texts = [];
  while (socket.runnerBuffer.length >= 2) {
    const firstByte = socket.runnerBuffer[0];
    const secondByte = socket.runnerBuffer[1];
    const isFin = (firstByte & 128) !== 0;
    const opcode = firstByte & 15;
    let offset = 2;
    let length = secondByte & 127;
    if (length === 126) {
      if (socket.runnerBuffer.length < offset + 2) {
        break;
      }
      length = socket.runnerBuffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (socket.runnerBuffer.length < offset + 8) {
        break;
      }
      length = Number(socket.runnerBuffer.readBigUInt64BE(offset));
      offset += 8;
    }
    const totalLength = offset + 4 + length;
    if (socket.runnerBuffer.length < totalLength) {
      break;
    }
    const mask = socket.runnerBuffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = socket.runnerBuffer.subarray(offset, offset + length);
    socket.runnerBuffer = socket.runnerBuffer.subarray(totalLength);
    if (opcode === 8) {
      socket.end();
      continue;
    }
    const decoded = Buffer.alloc(payload.length);
    for (let i2 = 0; i2 < payload.length; i2++) {
      decoded[i2] = payload[i2] ^ mask[i2 % 4];
    }
    if (!socket.runnerFramePayloadList) {
      socket.runnerFramePayloadList = [];
    }
    if (opcode === 1 || opcode === 0) {
      socket.runnerFramePayloadList.push(decoded);
    }
    if (isFin) {
      texts.push(Buffer.concat(socket.runnerFramePayloadList).toString("utf8"));
      socket.runnerFramePayloadList = [];
    }
  }
  return texts;
};
const sendProcessStatistic = (socket) => {
  sendJson(socket, {
    event: BatchEventType.toMain.statistic,
    statistic: {
      type: BatchStatisticType.processState,
      processAliveNum: activeChildList.length,
      processTotalNum: activeChildTotalCount
    }
  });
};
const sendChildCommandStatistic = (socket, statisticType, childStateKey) => {
  sendJson(socket, {
    event: BatchEventType.toMain.statistic,
    statistic: {
      type: statisticType,
      hasRunningCommand: activeChildList.some((child) => child[childStateKey])
    }
  });
};
const startChildRun = (socket, message2, keepAlive = false) => {
  if (activeChildList.length > 0) {
    runnerLog("kill previous child before new run", {
      pids: activeChildList.map((child) => child.pid)
    });
    activeChildList.forEach((child) => {
      child.runnerIgnoreExitStop = true;
      child.kill("SIGTERM");
    });
    activeChildList = [];
    activeChildTotalCount = 0;
  }
  const childMessage = { ...message2 };
  delete childMessage.runnerUserGroupList;
  const runnerUserGroupList = message2.runnerUserGroupList || [];
  activeChildTotalCount = runnerUserGroupList.length;
  runnerLog("start child run", {
    users: getRunUserCount(message2),
    childCount: runnerUserGroupList.length,
    enableUserLog: message2.enableUserLog
  });
  runnerUserGroupList.forEach((users, index) => {
    const child = node_child_process.fork(RUNNER_FILE, ["--runner-child"], {
      stdio: ["ignore", "inherit", "inherit", "ipc"]
    });
    child.runnerStopSent = false;
    child.runnerWorkerId = index;
    child.runnerOnlineCommandRunning = false;
    child.runnerTaskCommandRunning = false;
    activeChildList.push(child);
    sendProcessStatistic(socket);
    child.on("message", (data) => {
      if (data.event === "stop") {
        child.runnerStopSent = true;
        runnerLog("child send stop", { pid: child.pid });
      }
      if (data.event === "error") {
        runnerLog("child send error", { pid: child.pid, message: data.message });
      }
      if (data.event === BatchEventType.toMain.statistic && data.statistic?.type === BatchStatisticType.onlineCommandState) {
        child.runnerOnlineCommandRunning = data.statistic.hasRunningCommand === true;
        sendChildCommandStatistic(socket, BatchStatisticType.onlineCommandState, "runnerOnlineCommandRunning");
        return;
      }
      if (data.event === BatchEventType.toMain.statistic && data.statistic?.type === BatchStatisticType.taskCommandState) {
        child.runnerTaskCommandRunning = data.statistic.hasRunningCommand === true;
        sendChildCommandStatistic(socket, BatchStatisticType.taskCommandState, "runnerTaskCommandRunning");
        return;
      }
      if (data.event !== "stop") {
        sendJson(socket, data);
      }
    });
    child.on("error", (error) => {
      runnerLog("child process error", { pid: child.pid, message: error.message });
      sendJson(socket, { event: "error", message: error.message });
    });
    child.on("exit", (code, signal) => {
      runnerLog("child exit", {
        pid: child.pid,
        code,
        signal,
        childStopSent: child.runnerStopSent
      });
      const index2 = activeChildList.indexOf(child);
      if (index2 >= 0) {
        activeChildList.splice(index2, 1);
        sendProcessStatistic(socket);
        sendChildCommandStatistic(socket, BatchStatisticType.onlineCommandState, "runnerOnlineCommandRunning");
        sendChildCommandStatistic(socket, BatchStatisticType.taskCommandState, "runnerTaskCommandRunning");
      }
      if (!keepAlive && activeChildList.length <= 0 && !child.runnerIgnoreExitStop) {
        sendJson(socket, { event: "stop" });
        activeChildTotalCount = 0;
      }
    });
    child.send({
      ...childMessage,
      workerId: child.runnerWorkerId,
      users
    });
    runnerLog("child started", { pid: child.pid, index, users: users.length });
  });
  if (!keepAlive && runnerUserGroupList.length <= 0) {
    sendJson(socket, { event: "stop" });
    activeChildTotalCount = 0;
  }
};
const postChildRunMessage = (message2) => {
  const runnerUserGroupList = message2.runnerUserGroupList || [];
  activeChildList.forEach((child, index) => {
    if (!child.connected) {
      return;
    }
    const childMessage = {
      ...message2,
      workerId: child.runnerWorkerId,
      users: runnerUserGroupList[index] || []
    };
    delete childMessage.runnerUserGroupList;
    child.send(childMessage);
  });
};
const postChildCommandMessage = (message2) => {
  const hasCommandUsers = (message2.runnerUserGroupList || []).some((users) => users.length > 0);
  if (hasCommandUsers) {
    postChildRunMessage(message2);
    return;
  }
  activeChildList.forEach((child) => {
    if (child.connected) {
      child.send({ ...message2, workerId: child.runnerWorkerId, users: [] });
    }
  });
};
const stopChildRun = (socket, reason = "") => {
  runnerLog("stop child run", {
    reason,
    childCount: activeChildList.length,
    pids: activeChildList.map((child) => child.pid)
  });
  if (activeChildList.length > 0) {
    activeChildList.forEach((child) => {
      child.runnerIgnoreExitStop = true;
      child.kill("SIGTERM");
    });
    activeChildList = [];
    activeChildTotalCount = 0;
  }
  if (reason !== "websocket close" && reason !== "websocket error") {
    sendProcessStatistic(socket);
    sendJson(socket, { event: "stop" });
  }
};
const handleMessage = (socket, message2) => {
  if (message2.event === "ping") {
    sendJson(socket, { event: "pong", time: Date.now() });
    return;
  }
  if (message2.event === BatchEventType.toWorker.stopProcess) {
    stopChildRun(socket, "web message stop");
    return;
  }
  if (message2.event === BatchEventType.toWorker.stopTask) {
    postChildCommandMessage(message2);
    return;
  }
  if (message2.event === BatchEventType.toWorker.logout) {
  if (message2.event === BatchEventType.toWorker.pauseTask || message2.event === BatchEventType.toWorker.resumeTask) {
    postChildCommandMessage(message2);
    return;
  }
    postChildCommandMessage(message2);
    return;
  }
  if (message2.event === BatchEventType.toWorker.watchUserLogs) {
    activeChildList.forEach((child) => {
      if (child.connected) {
        child.send({ ...message2, workerId: child.runnerWorkerId });
      }
    });
    return;
  }
  if (message2.event === "run") {
    runnerLog("receive web run message", {
      event: message2.event,
      users: getRunUserCount(message2)
    });
    startChildRun(socket, message2);
    return;
  }
  if (message2.event === BatchEventType.toWorker.startProcess || message2.event === BatchEventType.toWorker.login || message2.event === BatchEventType.toWorker.logout || message2.event === BatchEventType.toWorker.updateUserTask || message2.event === BatchEventType.toWorker.runTask) {
    runnerLog("receive web run message", {
      event: message2.event,
      users: getRunUserCount(message2)
    });
    if (activeChildList.length <= 0) {
      startChildRun(socket, message2, true);
      return;
    }
    postChildRunMessage(message2);
  }
};
const createWorkerSelf = () => {
  let hasStopped = false;
  const workerSelf = {
    postMessage(data) {
      if (data?.event === "stop" || data?.event === "error") {
        runnerLog("worker post message", { event: data.event, message: data.message });
      }
      sendJson({ type: "ipc" }, data);
      if (data?.event === "stop" && !hasStopped) {
        hasStopped = true;
        setTimeout(() => process.exit(0), 100);
      }
    },
    close() {
      runnerLog("worker self close");
      process.exit(0);
    }
  };
  globalThis.self = workerSelf;
  globalThis.postMessage = workerSelf.postMessage;
  globalThis.close = workerSelf.close;
  return workerSelf;
};
const startRunnerChild = () => {
  const workerSelf = createWorkerSelf();
  wrapNodejsWebSocketAsyncEvent();
  process.on("message", (message2) => {
    if (message2.event === BatchEventType.toWorker.stopProcess) {
      runnerLog("child receive stop message");
      process.exit(0);
      return;
    }
    if (message2.event !== "run" && message2.event !== BatchEventType.toWorker.startProcess && message2.event !== BatchEventType.toWorker.stopProcess && message2.event !== BatchEventType.toWorker.login && message2.event !== BatchEventType.toWorker.logout && message2.event !== BatchEventType.toWorker.updateUserTask && message2.event !== BatchEventType.toWorker.runTask && message2.event !== BatchEventType.toWorker.stopTask && message2.event !== BatchEventType.toWorker.pauseTask && message2.event !== BatchEventType.toWorker.resumeTask && message2.event !== BatchEventType.toWorker.watchUserLogs) {
      return;
    }
    try {
      if (message2.event !== BatchEventType.toWorker.watchUserLogs) {
        runnerLog("child receive run message", {
          event: message2.event,
          users: message2.users?.length || 0
        });
      }
      const handleWorkerMessage = handleBatchTaskWorkerMessage || workerSelf.onmessage;
      if (typeof handleWorkerMessage !== "function") {
        throw new Error("BatchTaskWorker初始化失败");
      }
      const result = handleWorkerMessage({ data: message2 });
      if (result?.catch) {
        result.catch((error) => {
          runnerLog("child run catch error", { message: error.message, stack: error.stack });
          sendJson({ type: "ipc" }, { event: "error", message: error.message });
          sendJson({ type: "ipc" }, { event: "stop" });
          setTimeout(() => process.exit(1), 100);
        });
      }
    } catch (error) {
      runnerLog("child run catch error", { message: error.message, stack: error.stack });
      sendJson({ type: "ipc" }, { event: "error", message: error.message });
      sendJson({ type: "ipc" }, { event: "stop" });
      setTimeout(() => process.exit(1), 100);
    }
  });
};
server.on("upgrade", (req, socket) => {
  runnerLog("websocket connected", { url: req.url });
  const key = req.headers["sec-websocket-key"];
  const acceptKey = crypto$1.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      ""
    ].join("\r\n")
  );
  sendJson(socket, { event: "runnerReady", version: NODEJS_RUNNER_PROTOCOL_VERSION });
  socket.on("data", (buffer2) => {
    try {
      readFrameTexts(socket, buffer2).forEach((text) => {
        handleMessage(socket, JSON.parse(text));
      });
    } catch (error) {
      sendJson(socket, { event: "error", message: error.message });
    }
  });
  socket.on("close", () => stopChildRun(socket, "websocket close"));
  socket.on("error", (error) => {
    runnerLog("websocket error", { message: error.message });
    stopChildRun(socket, "websocket error");
  });
});
if (process.argv.includes("--runner-child")) {
  startRunnerChild();
} else {
  server.listen(PORT, HOST, () => {
    console.log(`robot runner listening on ws://${HOST}:${PORT}`);
  });
}
