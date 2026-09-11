import {
  deferredComponent,
  eagerComponent,
  isHotUIDefinition
} from "./chunk-GNEHQ6P7.js";
import {
  releaseComponentResources,
  retainPreparedComponent
} from "./chunk-VVXXKJHP.js";
import {
  promiseFinally
} from "./chunk-2T32RA5W.js";

// frontend/packages/core/dist/navigation/semantic-z-index.js
var semanticZIndexOrder = Object.freeze({
  screen: 0,
  hud: 1,
  window: 2,
  feedback: 3
});

// frontend/packages/core/dist/navigation/navigator.js
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
var _ExclusiveScopeGroup_branches;
var _ExclusiveScopeGroup_activeKey;
var _ExclusiveScopeGroup_destroyed;
var DEFAULT_PRESENTATION = Object.freeze({
  coverage: "opaque",
  backdrop: "none",
  blockInputBelow: true,
  transition: "fade"
});
var systemClock = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  }
};
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
var NavigationCancelledError = class extends Error {
  constructor(reason) {
    super(`Navigation was cancelled: ${reason}`);
    this.reason = reason;
    this.name = "NavigationCancelledError";
  }
};
var NavigationCancellation = class {
  constructor() {
    this.aborted = false;
    this.listeners = /* @__PURE__ */ new Set();
  }
  subscribe(listener) {
    if (this.aborted)
      listener();
    else
      this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  abort(reason) {
    if (this.aborted)
      return;
    this.aborted = true;
    this.reason = reason;
    for (const listener of [...this.listeners])
      listener();
    this.listeners.clear();
  }
};
var StackNavigator = class {
  /** @internal */
  constructor(kernel, id, parentGroup) {
    this.kernel = kernel;
    this.id = id;
    this.parentGroup = parentGroup;
    this.entries = [];
    this.pending = /* @__PURE__ */ new Set();
  }
  open(route, params, options = {}) {
    return this.kernel.open(this, route, params, options);
  }
  goto(route, params) {
    return this.kernel.open(this, route, params, { action: "goto" });
  }
  back() {
    const entry = this.entries[this.entries.length - 1];
    return entry ? this.kernel.closeEntry(entry, "back") : Promise.resolve(false);
  }
  close(instanceId) {
    const entry = this.kernel.findInScope(this, instanceId);
    return entry ? this.kernel.closeEntry(entry, "closed") : Promise.resolve(false);
  }
  popTo(instanceId) {
    return this.kernel.popTo(this, instanceId);
  }
  evict(instanceId) {
    const entry = this.kernel.findInScope(this, instanceId);
    return entry ? this.kernel.closeEntry(entry, "evicted") : Promise.resolve(false);
  }
};
var ExclusiveScopeGroup = class {
  /** @internal */
  constructor(kernel, id, anchorId) {
    this.kernel = kernel;
    this.id = id;
    this.anchorId = anchorId;
    _ExclusiveScopeGroup_branches.set(this, /* @__PURE__ */ new Map());
    _ExclusiveScopeGroup_activeKey.set(this, void 0);
    _ExclusiveScopeGroup_destroyed.set(this, false);
  }
  get activeKey() {
    return __classPrivateFieldGet(this, _ExclusiveScopeGroup_activeKey, "f");
  }
  scope(key, options = {}) {
    if (__classPrivateFieldGet(this, _ExclusiveScopeGroup_destroyed, "f"))
      throw new Error(`Scope group has been destroyed: ${this.id}`);
    if (!key)
      throw new Error("Scope key must not be empty.");
    let branch = __classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").get(key);
    if (!branch) {
      const navigator = this.kernel.createChildScope(`${this.id}:${key}`, this);
      branch = { key, navigator, ttlMs: options.inactiveTtlMs };
      __classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").set(key, branch);
      if (__classPrivateFieldGet(this, _ExclusiveScopeGroup_activeKey, "f") === void 0)
        __classPrivateFieldSet(this, _ExclusiveScopeGroup_activeKey, key, "f");
    }
    return branch.navigator;
  }
  async activate(key) {
    await this.kernel.perform(async () => {
      var _a;
      const next = __classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").get(key);
      if (!next)
        throw new Error(`Unknown scope branch: ${this.id}/${key}`);
      if (__classPrivateFieldGet(this, _ExclusiveScopeGroup_activeKey, "f") === key)
        return;
      const previous = __classPrivateFieldGet(this, _ExclusiveScopeGroup_activeKey, "f") ? __classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").get(__classPrivateFieldGet(this, _ExclusiveScopeGroup_activeKey, "f")) : void 0;
      if (previous)
        this.park(previous);
      (_a = next.cancelEviction) === null || _a === void 0 ? void 0 : _a.call(next);
      next.cancelEviction = void 0;
      next.inactiveSince = void 0;
      __classPrivateFieldSet(this, _ExclusiveScopeGroup_activeKey, key, "f");
      await this.kernel.refreshPresentation();
      this.kernel.notify();
    });
  }
  async evict(key) {
    return this.kernel.perform(async () => {
      const branch = __classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").get(key);
      if (!branch || __classPrivateFieldGet(this, _ExclusiveScopeGroup_activeKey, "f") === key)
        return false;
      await this.kernel.clearScope(branch.navigator, "evicted");
      return true;
    });
  }
  /** @internal */
  activeBranch() {
    return __classPrivateFieldGet(this, _ExclusiveScopeGroup_activeKey, "f") ? __classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").get(__classPrivateFieldGet(this, _ExclusiveScopeGroup_activeKey, "f")) : void 0;
  }
  /** @internal */
  branches() {
    return [...__classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").values()];
  }
  /** @internal */
  async destroy(reason) {
    var _a;
    if (__classPrivateFieldGet(this, _ExclusiveScopeGroup_destroyed, "f"))
      return;
    __classPrivateFieldSet(this, _ExclusiveScopeGroup_destroyed, true, "f");
    for (const branch of __classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").values()) {
      (_a = branch.cancelEviction) === null || _a === void 0 ? void 0 : _a.call(branch);
      await this.kernel.clearScope(branch.navigator, reason, false);
    }
    __classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").clear();
    __classPrivateFieldSet(this, _ExclusiveScopeGroup_activeKey, void 0, "f");
    this.kernel.removeGroup(this);
  }
  /** @internal */
  disposeNow() {
    var _a;
    if (__classPrivateFieldGet(this, _ExclusiveScopeGroup_destroyed, "f"))
      return;
    __classPrivateFieldSet(this, _ExclusiveScopeGroup_destroyed, true, "f");
    for (const branch of __classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").values())
      (_a = branch.cancelEviction) === null || _a === void 0 ? void 0 : _a.call(branch);
    __classPrivateFieldGet(this, _ExclusiveScopeGroup_branches, "f").clear();
    __classPrivateFieldSet(this, _ExclusiveScopeGroup_activeKey, void 0, "f");
  }
  park(branch) {
    var _a;
    branch.inactiveSince = this.kernel.clock.now();
    (_a = branch.cancelEviction) === null || _a === void 0 ? void 0 : _a.call(branch);
    if (branch.ttlMs === void 0)
      return;
    branch.cancelEviction = this.kernel.clock.schedule(() => {
      branch.cancelEviction = void 0;
      if (__classPrivateFieldGet(this, _ExclusiveScopeGroup_destroyed, "f") || __classPrivateFieldGet(this, _ExclusiveScopeGroup_activeKey, "f") === branch.key)
        return;
      void this.kernel.perform(() => this.kernel.clearScope(branch.navigator, "timeout"));
    }, branch.ttlMs);
  }
};
_ExclusiveScopeGroup_branches = /* @__PURE__ */ new WeakMap(), _ExclusiveScopeGroup_activeKey = /* @__PURE__ */ new WeakMap(), _ExclusiveScopeGroup_destroyed = /* @__PURE__ */ new WeakMap();
var Navigator = class extends StackNavigator {
  constructor(kernel) {
    super(kernel, "root");
    kernel.attachRoot(this);
  }
  createExclusiveScopeGroup(id, anchor) {
    return this.kernel.createGroup(id, anchor.id);
  }
  back() {
    return this.kernel.back();
  }
  getSnapshot() {
    return this.kernel.snapshot();
  }
  subscribe(listener) {
    return this.kernel.subscribe(listener);
  }
  /** Explicit count budget; protected parked instances may remain above it. */
  trimParked(maxInstances) {
    return this.kernel.trimParked(maxInstances);
  }
  /** @internal Attaches one retained semantic Layer without exposing provider ordering. */
  attachLayer(layer) {
    return this.kernel.attachLayer(layer);
  }
  /** @internal Destroys retained targets after their navigation-owned group is no longer active. */
  clearNavigationGroup(groupId, canClear = () => true) {
    return this.kernel.clearNavigationGroup(groupId, canClear);
  }
  /** @internal Supersedes uncommitted targets without touching retained group entries. */
  cancelPendingNavigationGroup(groupId, exceptRoute) {
    this.kernel.cancelPendingNavigationGroup(groupId, exceptRoute);
  }
  destroy() {
    this.kernel.destroy();
  }
};
var NavigationKernel = class {
  constructor(provider, registry, options) {
    var _a;
    this.provider = provider;
    this.registry = registry;
    this.options = options;
    this.scopes = /* @__PURE__ */ new Set();
    this.groups = /* @__PURE__ */ new Map();
    this.groupsByAnchor = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Set();
    this.layers = /* @__PURE__ */ new Map();
    this.sequence = 0;
    this.destroyed = false;
    this.operation = Promise.resolve();
    this.clock = (_a = options.clock) !== null && _a !== void 0 ? _a : systemClock;
  }
  attachRoot(root) {
    if (this.root)
      throw new Error("Navigator root is already attached.");
    this.root = root;
    this.scopes.add(root);
  }
  createChildScope(id, parentGroup) {
    const scope = new StackNavigator(this, id, parentGroup);
    this.scopes.add(scope);
    return scope;
  }
  createGroup(id, anchorId) {
    if (this.destroyed)
      throw new Error("Navigator has been destroyed.");
    if (this.groups.has(id))
      throw new Error(`Duplicate scope group: ${id}`);
    const anchor = this.find(anchorId);
    if (!anchor || anchor.state !== "mounted")
      throw new Error(`Scope group anchor is not mounted: ${anchorId}`);
    const group = new ExclusiveScopeGroup(this, id, anchorId);
    this.groups.set(id, group);
    let groups = this.groupsByAnchor.get(anchorId);
    if (!groups)
      this.groupsByAnchor.set(anchorId, groups = /* @__PURE__ */ new Set());
    groups.add(group);
    return group;
  }
  removeGroup(group) {
    this.groups.delete(group.id);
    const groups = this.groupsByAnchor.get(group.anchorId);
    groups === null || groups === void 0 ? void 0 : groups.delete(group);
    if (!(groups === null || groups === void 0 ? void 0 : groups.size))
      this.groupsByAnchor.delete(group.anchorId);
  }
  attachLayer(layer) {
    if (this.destroyed)
      throw new Error("Navigator has been destroyed.");
    if (this.layers.has(layer.id))
      throw new Error(`Duplicate semantic Layer: ${layer.id}`);
    if ([...this.layers.values()].some((candidate) => candidate.zIndex === layer.zIndex))
      throw new Error(`Only one ${layer.zIndex} Layer may be attached.`);
    this.layers.set(layer.id, layer);
    return async () => {
      if (this.layers.get(layer.id) !== layer)
        return;
      this.layers.delete(layer.id);
      await this.refreshPresentation();
    };
  }
  open(scope, route, params, options) {
    var _a;
    var _b, _c, _d, _e;
    if (this.destroyed)
      throw new Error("Navigator has been destroyed.");
    const raw = this.registry[route];
    if (!raw)
      throw new Error(`Unknown route: ${route}`);
    const definition = raw;
    const key = (_b = (_a = definition.instanceKey) === null || _a === void 0 ? void 0 : _a.call(definition, params)) !== null && _b !== void 0 ? _b : route;
    const action = (_c = options.action) !== null && _c !== void 0 ? _c : "push";
    const existing = action === "push" || action === "goto" ? this.findLaunchMatch(scope, route, key, (_d = definition.launchMode) !== null && _d !== void 0 ? _d : "singleTop") : void 0;
    if (existing) {
      if (action === "goto" && existing.state === "preparing")
        existing.action = "goto";
      else if (action === "goto")
        return this.refWithActivation(existing, this.protectActivation(existing, () => this.gotoExisting(existing)));
      else if (existing.state === "mounted" && ((_e = definition.launchMode) !== null && _e !== void 0 ? _e : "singleTop") === "singleInstance")
        return this.refWithActivation(existing, this.protectActivation(existing, () => this.focus(existing)));
      return existing.ref;
    }
    const id = `${String(route)}:${++this.sequence}`;
    const ready = deferred();
    const closed = deferred();
    const abort = new NavigationCancellation();
    const entry = {
      id,
      route,
      params,
      key,
      definition,
      scope,
      abort,
      ready,
      closed,
      action,
      state: "preparing",
      activity: "parked",
      transitionState: "entering",
      activationRequests: 0
    };
    const ref = {
      id,
      route,
      ready: ready.promise,
      closed: closed.promise,
      close: (...value) => this.closeEntry(entry, "closed", value[0], true)
    };
    entry.ref = ref;
    scope.pending.add(entry);
    ready.promise.catch(() => {
    });
    this.notify();
    const context = {
      navigator: this.root,
      scope,
      id,
      route,
      params,
      signal: abort,
      back: () => {
        void this.closeEntry(entry, "back");
      },
      complete: (value) => {
        void this.closeEntry(entry, "closed", value, true);
      }
    };
    try {
      const created = raw.create(context);
      if (isPromiseLike(created))
        void Promise.resolve(created).then((mount) => this.enqueue(() => this.commitOpen(entry, mount, entry.action))).catch((error) => this.failOpen(entry, error));
      else
        void this.enqueue(() => this.commitOpen(entry, created, entry.action)).catch((error) => this.failOpen(entry, error));
    } catch (error) {
      this.failOpen(entry, error);
    }
    return ref;
  }
  findLaunchMatch(scope, route, key, mode) {
    var _a;
    if (mode === "multiple")
      return void 0;
    const matches = (entry) => entry.route === route && entry.key === key;
    if (mode === "singleTop") {
      const top = scope.entries[scope.entries.length - 1];
      if (top && matches(top))
        return top;
      return [...scope.pending].reverse().find(matches);
    }
    for (const candidate of this.scopes) {
      const entry = (_a = candidate.entries.find(matches)) !== null && _a !== void 0 ? _a : [...candidate.pending].find(matches);
      if (entry)
        return entry;
    }
    return void 0;
  }
  protectActivation(entry, activate) {
    entry.activationRequests++;
    let released = false;
    const release = () => {
      if (released)
        return;
      released = true;
      entry.activationRequests--;
    };
    try {
      return promiseFinally(activate(), release);
    } catch (error) {
      release();
      throw error;
    }
  }
  async focus(entry) {
    const group = entry.scope.parentGroup;
    if (group) {
      const branch = group.branches().find((value) => value.navigator === entry.scope);
      if (branch)
        await group.activate(branch.key);
    }
    await this.enqueue(async () => {
      var _a, _b;
      const entries = entry.scope.entries;
      const index = entries.indexOf(entry);
      if (index < 0)
        return;
      const previous = [...entries];
      if (index !== entries.length - 1) {
        entries.splice(index, 1);
        entries.push(entry);
      }
      try {
        await ((_b = (_a = this.options).beforePresent) === null || _b === void 0 ? void 0 : _b.call(_a, entry.route, "push"));
        await this.refreshPresentation();
      } catch (error) {
        entries.splice(0, entries.length, ...previous);
        await this.refreshPresentation().catch(() => {
        });
        throw error;
      }
      this.notify();
    });
  }
  async gotoExisting(entry) {
    await this.enqueue(async () => {
      var _a, _b;
      var _c;
      const scope = entry.scope;
      const previous = [...scope.entries];
      const zIndex = (_c = entry.definition.zIndex) !== null && _c !== void 0 ? _c : "screen";
      const removed = scope.entries.filter((candidate) => {
        var _a2;
        return zIndex === "screen" ? candidate !== entry && !this.isGroupSibling(candidate, entry) : candidate !== entry && ((_a2 = candidate.definition.zIndex) !== null && _a2 !== void 0 ? _a2 : "screen") === "window";
      });
      const retained = scope.entries.filter((candidate) => candidate !== entry && !removed.includes(candidate));
      scope.entries.splice(0, scope.entries.length, ...retained, entry);
      try {
        await ((_b = (_a = this.options).beforePresent) === null || _b === void 0 ? void 0 : _b.call(_a, entry.route, "goto"));
        await this.refreshPresentation();
      } catch (error) {
        scope.entries.splice(0, scope.entries.length, ...previous);
        await this.refreshPresentation().catch(() => {
        });
        throw error;
      }
      for (const old of removed)
        await this.destroyEntry(old, "replaced", false);
      this.notify();
    });
  }
  refWithActivation(entry, activation) {
    const original = entry.ref;
    const ready = Promise.all([original.ready, activation]).then(() => {
    });
    ready.catch(() => {
    });
    return {
      id: original.id,
      route: original.route,
      ready,
      closed: original.closed,
      close: (...value) => this.closeEntry(entry, "closed", value[0], true)
    };
  }
  async commitOpen(entry, mount, action) {
    var _a, _b, _c;
    var _d, _e, _f;
    entry.mount = mount;
    if (this.destroyed || entry.cancelled || entry.abort.aborted) {
      mount.destroy();
      this.finishCancelled(entry, (_d = entry.cancelled) !== null && _d !== void 0 ? _d : "destroyed");
      return;
    }
    const scope = entry.scope;
    const previous = [...scope.entries];
    let next;
    let removed;
    if (action === "goto") {
      const zIndex = (_e = entry.definition.zIndex) !== null && _e !== void 0 ? _e : "screen";
      removed = previous.filter((candidate) => {
        var _a2;
        return zIndex === "screen" ? !this.isGroupSibling(candidate, entry) : ((_a2 = candidate.definition.zIndex) !== null && _a2 !== void 0 ? _a2 : "screen") === "window";
      });
      next = [...previous.filter((candidate) => !removed.includes(candidate)), entry];
    } else if (action === "reset") {
      next = [entry];
      removed = previous;
    } else if (action === "replace") {
      next = previous.length ? [...previous.slice(0, -1), entry] : [entry];
      removed = previous.length ? [previous[previous.length - 1]] : [];
    } else {
      next = [...previous, entry];
      const covered = previous[previous.length - 1];
      removed = ((_a = covered === null || covered === void 0 ? void 0 : covered.definition.retention) === null || _a === void 0 ? void 0 : _a.covered) === "destroy" ? [covered] : [];
      if (removed.length)
        next = next.filter((candidate) => candidate !== covered);
    }
    const outgoing = action === "replace" || action === "reset" ? previous[previous.length - 1] : action === "goto" ? removed[removed.length - 1] : void 0;
    if (outgoing) {
      try {
        await this.animateExit(outgoing);
      } catch (error) {
        mount.destroy();
        entry.mount = void 0;
        scope.pending.delete(entry);
        entry.state = "closing";
        entry.ready.reject(error);
        entry.closed.resolve({ status: "cancelled", reason: "failed" });
        this.notify();
        return;
      }
      if (this.destroyed || entry.cancelled || entry.abort.aborted) {
        mount.destroy();
        this.finishCancelled(entry, (_f = entry.cancelled) !== null && _f !== void 0 ? _f : "destroyed");
        return;
      }
    }
    scope.pending.delete(entry);
    entry.state = "mounted";
    scope.entries.splice(0, scope.entries.length, ...next);
    try {
      await ((_c = (_b = this.options).beforePresent) === null || _c === void 0 ? void 0 : _c.call(_b, entry.route, action));
      await this.refreshPresentation();
      entry.transitionState = "steady";
      await this.refreshPresentation();
    } catch (error) {
      scope.entries.splice(0, scope.entries.length, ...previous);
      if (outgoing)
        outgoing.transitionState = "steady";
      entry.state = "closing";
      mount.destroy();
      entry.ready.reject(error);
      entry.closed.resolve({ status: "cancelled", reason: "failed" });
      await this.refreshPresentation().catch(() => {
      });
      this.notify();
      return;
    }
    for (const old of removed)
      await this.destroyEntry(old, action === "reset" ? "reset" : "replaced", false);
    entry.ready.resolve();
    this.notify();
  }
  failOpen(entry, error) {
    var _a;
    entry.scope.pending.delete(entry);
    if (entry.cancelled || entry.abort.aborted) {
      this.finishCancelled(entry, (_a = entry.cancelled) !== null && _a !== void 0 ? _a : "closed");
      return;
    }
    entry.state = "closing";
    entry.ready.reject(error);
    entry.closed.resolve({ status: "cancelled", reason: "failed" });
    this.notify();
  }
  closeEntry(entry, reason, value, completed = false, canClose) {
    if (canClose && !canClose())
      return Promise.resolve(false);
    if (entry.state === "closing" || entry.transitionState === "exiting")
      return Promise.resolve(false);
    if (entry.state === "preparing") {
      entry.cancelled = reason;
      entry.state = "closing";
      entry.abort.abort(reason);
      entry.scope.pending.delete(entry);
      entry.ready.reject(new NavigationCancelledError(reason));
      entry.closed.resolve(completed ? { status: "completed", value } : { status: "cancelled", reason });
      this.notify();
      return Promise.resolve(true);
    }
    return this.enqueue(async () => {
      const index = entry.scope.entries.indexOf(entry);
      if (index < 0 || entry.state === "closing" || canClose && !canClose())
        return false;
      const previous = [...entry.scope.entries];
      try {
        await this.animateExit(entry);
        if (this.destroyed)
          return canClose === void 0;
        if (canClose && !canClose())
          return false;
        const currentIndex = entry.scope.entries.indexOf(entry);
        if (currentIndex < 0)
          return canClose === void 0;
        entry.scope.entries.splice(currentIndex, 1);
        await this.refreshPresentation();
      } catch (error) {
        entry.scope.entries.splice(0, entry.scope.entries.length, ...previous);
        entry.transitionState = "steady";
        await this.refreshPresentation().catch(() => {
        });
        throw error;
      }
      entry.transitionState = "steady";
      await this.destroyEntry(entry, reason, false, value, completed);
      this.notify();
      return true;
    });
  }
  popTo(scope, instanceId) {
    return this.enqueue(async () => {
      const index = scope.entries.findIndex((entry) => entry.id === instanceId);
      if (index < 0 || index === scope.entries.length - 1)
        return false;
      const previous = [...scope.entries];
      const removed = scope.entries.slice(index + 1);
      try {
        await this.animateExit(removed[removed.length - 1]);
        if (this.destroyed)
          return true;
        scope.entries.splice(index + 1);
        await this.refreshPresentation();
      } catch (error) {
        scope.entries.splice(0, scope.entries.length, ...previous);
        removed[removed.length - 1].transitionState = "steady";
        await this.refreshPresentation().catch(() => {
        });
        throw error;
      }
      for (const entry of removed)
        entry.transitionState = "steady";
      for (const entry of removed)
        await this.destroyEntry(entry, "popTo", false);
      this.notify();
      return true;
    });
  }
  async clearScope(scope, reason, refresh = true) {
    for (const pending of [...scope.pending]) {
      pending.cancelled = reason;
      pending.abort.abort(reason);
      pending.ready.reject(new NavigationCancelledError(reason));
      pending.closed.resolve({ status: "cancelled", reason });
      scope.pending.delete(pending);
    }
    const removed = scope.entries.splice(0);
    if (refresh)
      await this.refreshPresentation();
    for (const entry of removed)
      await this.destroyEntry(entry, reason, false);
    this.notify();
  }
  clearNavigationGroup(groupId, canClear) {
    return this.enqueue(async () => {
      var _a, _b, _c;
      if (!canClear())
        return false;
      const activeGroup = (_b = (_a = this.activeScreen()) === null || _a === void 0 ? void 0 : _a.definition.navigationGroup) === null || _b === void 0 ? void 0 : _b.id;
      if (activeGroup === groupId)
        return false;
      const removed = [];
      let changed = false;
      for (const scope of this.scopes) {
        for (const pending of [...scope.pending]) {
          if (((_c = pending.definition.navigationGroup) === null || _c === void 0 ? void 0 : _c.id) !== groupId)
            continue;
          pending.cancelled = "replaced";
          pending.state = "closing";
          pending.abort.abort("replaced");
          pending.ready.reject(new NavigationCancelledError("replaced"));
          pending.closed.resolve({ status: "cancelled", reason: "replaced" });
          scope.pending.delete(pending);
          changed = true;
        }
        const retained = scope.entries.filter((entry) => {
          var _a2;
          if (((_a2 = entry.definition.navigationGroup) === null || _a2 === void 0 ? void 0 : _a2.id) !== groupId)
            return true;
          removed.push(entry);
          return false;
        });
        if (retained.length !== scope.entries.length) {
          scope.entries.splice(0, scope.entries.length, ...retained);
          changed = true;
        }
      }
      if (!changed)
        return false;
      await this.refreshPresentation();
      for (const entry of removed)
        await this.destroyEntry(entry, "replaced", false);
      this.notify();
      return true;
    });
  }
  cancelPendingNavigationGroup(groupId, exceptRoute) {
    var _a;
    let changed = false;
    for (const scope of this.scopes) {
      for (const pending of [...scope.pending]) {
        if (((_a = pending.definition.navigationGroup) === null || _a === void 0 ? void 0 : _a.id) !== groupId || pending.route === exceptRoute)
          continue;
        pending.cancelled = "replaced";
        pending.state = "closing";
        pending.abort.abort("replaced");
        pending.ready.reject(new NavigationCancelledError("replaced"));
        pending.closed.resolve({ status: "cancelled", reason: "replaced" });
        scope.pending.delete(pending);
        changed = true;
      }
    }
    if (changed)
      this.notify();
  }
  async destroyEntry(entry, reason, refresh, value, completed = false) {
    var _a, _b, _c, _d;
    var _e;
    if (entry.state === "closing")
      return;
    entry.state = "closing";
    entry.abort.abort(reason);
    (_a = entry.cancelEviction) === null || _a === void 0 ? void 0 : _a.call(entry);
    entry.cancelEviction = void 0;
    const groups = [...(_e = this.groupsByAnchor.get(entry.id)) !== null && _e !== void 0 ? _e : []];
    for (const group of groups)
      await group.destroy(reason);
    (_c = (_b = entry.mount) === null || _b === void 0 ? void 0 : _b.setActivity) === null || _c === void 0 ? void 0 : _c.call(_b, "parked");
    (_d = entry.mount) === null || _d === void 0 ? void 0 : _d.destroy();
    if (completed)
      entry.closed.resolve({ status: "completed", value });
    else
      entry.closed.resolve({ status: "cancelled", reason });
    if (refresh)
      await this.refreshPresentation();
  }
  finishCancelled(entry, reason) {
    entry.scope.pending.delete(entry);
    if (entry.state !== "closing")
      entry.state = "closing";
    entry.closed.resolve({ status: "cancelled", reason });
    this.notify();
  }
  findInScope(scope, id) {
    var _a;
    return (_a = scope.entries.find((entry) => entry.id === id)) !== null && _a !== void 0 ? _a : [...scope.pending].find((entry) => entry.id === id);
  }
  find(id) {
    for (const scope of this.scopes) {
      const entry = this.findInScope(scope, id);
      if (entry)
        return entry;
    }
    return void 0;
  }
  async animateExit(entry) {
    if (entry.activity !== "active" || entry.transitionState === "exiting" || this.presentation(entry).transition === "none")
      return;
    entry.transitionState = "exiting";
    this.notify();
    try {
      await this.refreshPresentation();
    } catch (error) {
      entry.transitionState = "steady";
      await this.refreshPresentation().catch(() => {
      });
      throw error;
    }
  }
  async refreshPresentation() {
    var _a, _b;
    var _c;
    if (this.destroyed)
      return;
    const flattened = this.flatten(this.root);
    const entries = flattened.map((entry, index) => ({ entry, index })).sort((left, right) => {
      var _a2, _b2;
      return semanticZIndexOrder[(_a2 = left.entry.definition.zIndex) !== null && _a2 !== void 0 ? _a2 : "screen"] - semanticZIndexOrder[(_b2 = right.entry.definition.zIndex) !== null && _b2 !== void 0 ? _b2 : "screen"] || left.index - right.index;
    }).map(({ entry }) => entry);
    const visible = new Set(flattened);
    const parked = [];
    for (const scope of this.scopes)
      for (const entry of scope.entries)
        if (entry.mount && !visible.has(entry))
          parked.push(entry);
    let opaqueAbove = false;
    const routeLayers = new Array(entries.length);
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index];
      const activity = index === entries.length - 1 ? "active" : opaqueAbove ? "parked" : "covered";
      const presentation = this.presentation(entry);
      routeLayers[index] = {
        surface: entry.mount.surface,
        activity,
        zIndex: (_c = entry.definition.zIndex) !== null && _c !== void 0 ? _c : "screen",
        presentation,
        transitionState: entry.transitionState
      };
      if (presentation.coverage === "opaque" && entry.transitionState === "steady")
        opaqueAbove = true;
    }
    const activeScreen = [...entries].reverse().find((entry) => {
      var _a2;
      return ((_a2 = entry.definition.zIndex) !== null && _a2 !== void 0 ? _a2 : "screen") === "screen";
    });
    const activeGroup = activeScreen === null || activeScreen === void 0 ? void 0 : activeScreen.definition.navigationGroup;
    const topWindow = [...entries].reverse().find((entry) => {
      var _a2;
      return ((_a2 = entry.definition.zIndex) !== null && _a2 !== void 0 ? _a2 : "screen") === "window";
    });
    const semanticLayers = [...this.layers.values()].map((layer) => {
      const enabled = !layer.ownerGroup || layer.ownerGroup === (activeGroup === null || activeGroup === void 0 ? void 0 : activeGroup.id);
      let activity = enabled ? "active" : "parked";
      if (enabled && layer.zIndex === "hud" && topWindow) {
        const presentation = this.presentation(topWindow);
        activity = presentation.coverage === "opaque" && topWindow.transitionState === "steady" ? "parked" : "covered";
      }
      return {
        surface: layer.mount.surface,
        activity,
        zIndex: layer.zIndex,
        presentation: {
          coverage: "translucent",
          backdrop: "none",
          blockInputBelow: false,
          transition: "none"
        },
        transitionState: "steady"
      };
    });
    const layers = [
      ...parked.map((entry) => {
        var _a2;
        return {
          surface: entry.mount.surface,
          activity: "parked",
          zIndex: (_a2 = entry.definition.zIndex) !== null && _a2 !== void 0 ? _a2 : "screen",
          presentation: this.presentation(entry),
          transitionState: entry.transitionState
        };
      }),
      ...[...routeLayers, ...semanticLayers].sort((left, right) => semanticZIndexOrder[left.zIndex] - semanticZIndexOrder[right.zIndex])
    ];
    await this.provider.compositor.present(layers);
    for (const entry of [...parked, ...entries]) {
      const layer = layers.find((candidate) => candidate.surface.id === entry.mount.surface.id);
      if (entry.activity !== layer.activity) {
        entry.activity = layer.activity;
        (_b = (_a = entry.mount) === null || _a === void 0 ? void 0 : _a.setActivity) === null || _b === void 0 ? void 0 : _b.call(_a, layer.activity);
      }
      this.updateEntryEviction(entry);
    }
  }
  flatten(scope) {
    var _a;
    const output = [];
    for (const entry of scope.entries) {
      if (!entry.mount)
        continue;
      output.push(entry);
      for (const group of (_a = this.groupsByAnchor.get(entry.id)) !== null && _a !== void 0 ? _a : []) {
        const active = group.activeBranch();
        if (active)
          output.push(...this.flatten(active.navigator));
      }
    }
    return output;
  }
  presentation(entry) {
    return Object.assign(Object.assign({}, DEFAULT_PRESENTATION), entry.definition.presentation);
  }
  isGroupSibling(candidate, target) {
    var _a, _b;
    var _c;
    const groupId = (_a = target.definition.navigationGroup) === null || _a === void 0 ? void 0 : _a.id;
    return groupId !== void 0 && ((_c = candidate.definition.zIndex) !== null && _c !== void 0 ? _c : "screen") === "screen" && ((_b = candidate.definition.navigationGroup) === null || _b === void 0 ? void 0 : _b.id) === groupId;
  }
  activeScreen() {
    return [...this.flatten(this.root)].reverse().find((entry) => {
      var _a;
      return ((_a = entry.definition.zIndex) !== null && _a !== void 0 ? _a : "screen") === "screen";
    });
  }
  async trimParked(maxInstances) {
    if (!Number.isSafeInteger(maxInstances) || maxInstances < 0)
      throw new Error("Parked instance budget must be a non-negative integer.");
    const candidates = await this.enqueue(() => this.parkedEntries().filter((entry) => this.canTrimParked(entry)).sort((a, b) => {
      var _a, _b;
      return ((_a = a.inactiveSince) !== null && _a !== void 0 ? _a : 0) - ((_b = b.inactiveSince) !== null && _b !== void 0 ? _b : 0);
    }));
    const evicted = [];
    for (const entry of candidates) {
      const removed = await this.closeEntry(entry, "evicted", void 0, false, () => this.parkedEntries().length > maxInstances && this.canTrimParked(entry));
      if (removed)
        evicted.push(entry.id);
    }
    return Object.freeze(evicted);
  }
  parkedEntries() {
    const entries = [];
    for (const scope of this.scopes)
      for (const entry of scope.entries)
        if (entry.activity === "parked")
          entries.push(entry);
    return entries;
  }
  canTrimParked(entry) {
    var _a;
    return !this.destroyed && entry.state === "mounted" && entry.mount !== void 0 && entry.activity === "parked" && entry.transitionState === "steady" && entry.activationRequests === 0 && entry.scope.entries.includes(entry) && !((_a = this.groupsByAnchor.get(entry.id)) === null || _a === void 0 ? void 0 : _a.size) && // Preparation can reset or replace another scope's presentation.
    // Without an explicit dependency graph, retain all parked owners.
    ![...this.scopes].some((scope) => scope.pending.size > 0);
  }
  updateEntryEviction(entry) {
    var _a, _b;
    var _c;
    if (entry.activity === "active") {
      (_a = entry.cancelEviction) === null || _a === void 0 ? void 0 : _a.call(entry);
      entry.cancelEviction = void 0;
      entry.inactiveSince = void 0;
      return;
    }
    (_c = entry.inactiveSince) !== null && _c !== void 0 ? _c : entry.inactiveSince = this.clock.now();
    const ttlMs = (_b = entry.definition.retention) === null || _b === void 0 ? void 0 : _b.inactiveTtlMs;
    if (ttlMs === void 0 || entry.cancelEviction)
      return;
    entry.cancelEviction = this.clock.schedule(() => {
      entry.cancelEviction = void 0;
      if (this.destroyed || entry.activity === "active" || entry.state !== "mounted")
        return;
      void this.closeEntry(entry, "timeout");
    }, ttlMs);
  }
  async back() {
    var _a, _b;
    const entry = this.backEntry(this.root);
    if (entry)
      return this.closeEntry(entry, "back");
    (_b = (_a = this.options).onRootBack) === null || _b === void 0 ? void 0 : _b.call(_a);
    return false;
  }
  backEntry(scope) {
    var _a, _b;
    const top = scope.entries[scope.entries.length - 1];
    if (top) {
      for (const group of (_a = this.groupsByAnchor.get(top.id)) !== null && _a !== void 0 ? _a : []) {
        const active = group.activeBranch();
        if (active && active.navigator.entries.length > 1)
          return (_b = this.backEntry(active.navigator)) !== null && _b !== void 0 ? _b : active.navigator.entries[active.navigator.entries.length - 1];
      }
    }
    if (scope === this.root) {
      const window = [...scope.entries].reverse().find((entry) => {
        var _a2;
        return ((_a2 = entry.definition.zIndex) !== null && _a2 !== void 0 ? _a2 : "screen") === "window";
      });
      if (window)
        return window;
      const screens = scope.entries.filter((entry) => {
        var _a2;
        return ((_a2 = entry.definition.zIndex) !== null && _a2 !== void 0 ? _a2 : "screen") === "screen";
      });
      const screen = screens[screens.length - 1];
      if (screen === null || screen === void 0 ? void 0 : screen.definition.navigationGroup)
        return void 0;
      return screens.length > 1 ? screen : void 0;
    }
    if (!top)
      return void 0;
    return scope.entries.length > 1 ? top : void 0;
  }
  snapshot() {
    const entries = [];
    for (const scope of this.scopes) {
      for (const entry of [...scope.entries, ...scope.pending])
        entries.push({
          id: entry.id,
          route: entry.route,
          scope: scope.id,
          state: entry.state,
          activity: entry.activity,
          transitionState: entry.transitionState
        });
    }
    const activeScreen = this.activeScreen();
    const tabGroup = activeScreen === null || activeScreen === void 0 ? void 0 : activeScreen.definition.navigationGroup;
    const activeGroups = {};
    for (const [id, group] of this.groups)
      Object.defineProperty(activeGroups, id, {
        value: group.activeKey,
        enumerable: true,
        configurable: true,
        writable: true
      });
    if (tabGroup)
      Object.defineProperty(activeGroups, tabGroup.id, {
        value: tabGroup.key,
        enumerable: true,
        configurable: true,
        writable: true
      });
    return { entries, activeGroups };
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify() {
    for (const listener of [...this.listeners])
      listener();
  }
  destroy() {
    var _a, _b, _c, _d;
    if (this.destroyed)
      return;
    this.destroyed = true;
    for (const group of this.groups.values())
      group.disposeNow();
    for (const scope of this.scopes) {
      for (const pending of [...scope.pending]) {
        pending.cancelled = "destroyed";
        pending.abort.abort("destroyed");
        pending.ready.reject(new NavigationCancelledError("destroyed"));
        pending.closed.resolve({ status: "cancelled", reason: "destroyed" });
      }
      scope.pending.clear();
      for (const entry of scope.entries.splice(0)) {
        entry.state = "closing";
        entry.abort.abort("destroyed");
        (_a = entry.cancelEviction) === null || _a === void 0 ? void 0 : _a.call(entry);
        entry.ready.reject(new NavigationCancelledError("destroyed"));
        (_c = (_b = entry.mount) === null || _b === void 0 ? void 0 : _b.setActivity) === null || _c === void 0 ? void 0 : _c.call(_b, "parked");
        (_d = entry.mount) === null || _d === void 0 ? void 0 : _d.destroy();
        entry.closed.resolve({ status: "cancelled", reason: "destroyed" });
      }
    }
    this.groups.clear();
    this.groupsByAnchor.clear();
    this.layers.clear();
    this.scopes.clear();
    this.listeners.clear();
    void this.provider.compositor.present([]).catch(() => {
    });
  }
  perform(operation) {
    return this.enqueue(operation);
  }
  enqueue(operation) {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(() => {
    }, () => {
    });
    return result;
  }
};
function createNavigator(provider, registry, options = {}) {
  return new Navigator(new NavigationKernel(provider, registry, options));
}
function isPromiseLike(value) {
  return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}

// frontend/packages/core/dist/navigation/surface-navigator.js
var SurfaceStackNavigator = class {
  /** @internal */
  constructor(owner, stack) {
    this.owner = owner;
    this.stack = stack;
  }
  open(ui, ...arguments_) {
    return this.owner.openOn(this.stack, ui, arguments_[0], "open");
  }
  goto(ui, ...arguments_) {
    return this.owner.openOn(this.stack, ui, arguments_[0], "goto");
  }
  back() {
    return this.stack.back();
  }
  close(instanceId) {
    return this.stack.close(instanceId);
  }
  popTo(instanceId) {
    return this.stack.popTo(instanceId);
  }
  evict(instanceId) {
    return this.stack.evict(instanceId);
  }
};
var SurfaceExclusiveScopeGroup = class {
  /** @internal */
  constructor(owner, group) {
    this.owner = owner;
    this.group = group;
    this.scopes = /* @__PURE__ */ new Map();
  }
  get activeKey() {
    return this.group.activeKey;
  }
  scope(key, options = {}) {
    let scope = this.scopes.get(key);
    if (!scope) {
      scope = new SurfaceStackNavigator(this.owner, this.group.scope(key, options));
      this.scopes.set(key, scope);
    }
    return scope;
  }
  activate(key) {
    return this.group.activate(key);
  }
  evict(key) {
    return this.group.evict(key);
  }
  destroy() {
    this.scopes.clear();
    return this.group.destroy("destroyed");
  }
};
var SurfaceNavigator = class extends SurfaceStackNavigator {
  /** @internal */
  constructor(provider, registry, options = {}) {
    var _a, _b;
    var _c, _d, _e;
    const owner = {};
    const bindings = /* @__PURE__ */ new Map();
    for (const erased of registry.bindings) {
      const binding = erased;
      bindings.set(binding.ui.id, binding);
    }
    const discovered = discoverTabGroups((_c = options.layers) !== null && _c !== void 0 ? _c : [], bindings);
    const routes = /* @__PURE__ */ Object.create(null);
    for (const binding of bindings.values()) {
      const ui = binding.ui;
      const membership = discovered.routeGroups.get(ui.id);
      routes[ui.id] = {
        create: (context) => owner.current.mountSurface(binding, context),
        zIndex: ui.options.zIndex,
        navigationGroup: membership ? { id: membership.group.id, key: membership.key } : void 0,
        presentation: ui.options.presentation,
        retention: ui.options.retention,
        launchMode: ui.options.launchMode,
        instanceKey: ui.options.instanceKey
      };
    }
    for (const group of discovered.groups.values()) {
      for (const [key, target] of group.targets) {
        if (target.target.kind !== "panel")
          continue;
        const componentId = target.target.component;
        routes[target.route] = {
          create: (context) => {
            const mount = (parent) => {
              var _a2;
              const component = (_a2 = parent.components) === null || _a2 === void 0 ? void 0 : _a2[componentId];
              if (!component)
                throw new Error(`Unknown Tab panel component: ${componentId}`);
              const prepared = retainPreparedComponent(parent, component);
              try {
                return owner.current.mountPanel(prepared, context);
              } finally {
                if (prepared !== component)
                  releaseComponentResources(prepared);
              }
            };
            return owner.current.withPrepared(group.layer, mount);
          },
          zIndex: "screen",
          navigationGroup: { id: group.id, key },
          launchMode: "singleInstance"
        };
      }
    }
    const runtimeOptions = Object.freeze({
      onActionError: options.onActionError,
      prepareModule: options.prepareModule,
      tabs: {
        reportsActivationErrors: true,
        activate: (component, hookId, key) => owner.current.activateTab(component, hookId, key),
        register: (component, hookId, binding) => owner.current.registerTabs(component, hookId, binding)
      }
    });
    const legacy = createNavigator(provider, routes, {
      clock: options.clock,
      onRootBack: options.onRootBack,
      beforePresent: (route, action) => owner.current.beforePresent(route, action)
    });
    super(void 0, legacy);
    this.provider = provider;
    this.bindings = /* @__PURE__ */ new Map();
    this.routeGroups = /* @__PURE__ */ new Map();
    this.tabGroups = /* @__PURE__ */ new Map();
    this.mountedLayers = /* @__PURE__ */ new Map();
    this.clearingGroups = /* @__PURE__ */ new Set();
    this.reportedErrors = /* @__PURE__ */ new WeakSet();
    this.screenIntentVersion = 0;
    this.destroyed = false;
    this.useSequence = 0;
    this.lastUse = /* @__PURE__ */ new Map();
    owner.current = this;
    this.owner = this;
    this.legacy = legacy;
    this.runtimeOptions = runtimeOptions;
    this.options = options;
    for (const [id, binding] of bindings)
      this.bindings.set(id, binding);
    for (const [id, group] of discovered.groups)
      this.tabGroups.set(id, group);
    for (const [route, membership] of discovered.routeGroups)
      this.routeGroups.set(route, membership);
    try {
      for (const layer of (_d = options.layers) !== null && _d !== void 0 ? _d : []) {
        const owned = [...this.tabGroups.values()].some((group) => group.layer === layer);
        if (!owned)
          this.mountLayer(layer);
      }
      this.unsubscribe = legacy.subscribe(() => this.navigationChanged());
    } catch (error) {
      legacy.destroy();
      for (const state of this.mountedLayers.values())
        state.mounted.destroy();
      for (const binding of bindings.values())
        (_a = binding.dispose) === null || _a === void 0 ? void 0 : _a.call(binding);
      for (const layer of (_e = options.layers) !== null && _e !== void 0 ? _e : [])
        (_b = layer.dispose) === null || _b === void 0 ? void 0 : _b.call(layer);
      throw error;
    }
  }
  async back() {
    var _a, _b;
    if (await ((_b = (_a = this.options).onBack) === null || _b === void 0 ? void 0 : _b.call(_a)))
      return true;
    return this.legacy.back();
  }
  createExclusiveScopeGroup(id, anchor) {
    return new SurfaceExclusiveScopeGroup(this, this.legacy.createExclusiveScopeGroup(id, anchor));
  }
  getSnapshot() {
    return this.legacy.getSnapshot();
  }
  subscribe(listener) {
    return this.legacy.subscribe(listener);
  }
  inspectRetention() {
    var _a, _b;
    const navigation = this.legacy.getSnapshot();
    return {
      instances: navigation.entries,
      layers: [...this.mountedLayers.keys()],
      templates: this.preparedBindings().map((binding) => {
        var _a2;
        var _b2;
        return Object.assign(Object.assign({ id: binding.id }, (_a2 = binding.inspectPrepared) === null || _a2 === void 0 ? void 0 : _a2.call(binding)), { lastUse: (_b2 = this.lastUse.get(binding)) !== null && _b2 !== void 0 ? _b2 : 0 });
      }),
      resources: (_b = (_a = this.provider.assets).inspectRetention) === null || _b === void 0 ? void 0 : _b.call(_a)
    };
  }
  /** Explicitly discard inactive instances; reopening reconstructs their local UI state. */
  trimParked(maxInstances) {
    return this.legacy.trimParked(maxInstances);
  }
  /** Explicit memory-pressure trim. Parked instances remain governed by navigation retention. */
  trim(budget) {
    var _a, _b, _c;
    var _d, _e;
    for (const count of [budget.maxIdleTemplates, (_d = budget.maxUnusedResourceContexts) !== null && _d !== void 0 ? _d : 0])
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error("UI retention budgets must be non-negative integers.");
    const liveRoutes = new Set(this.legacy.getSnapshot().entries.map((entry) => entry.route));
    const idle = this.preparedBindings().filter((binding) => {
      var _a2;
      const state = (_a2 = binding.inspectPrepared) === null || _a2 === void 0 ? void 0 : _a2.call(binding);
      if ((state === null || state === void 0 ? void 0 : state.state) !== "ready" || state.pins !== 0 || !binding.prepare)
        return false;
      if (this.mountedLayers.has(binding.id) || liveRoutes.has(binding.id))
        return false;
      for (const group of this.tabGroups.values()) {
        if (group.layer !== binding)
          continue;
        if (group.inFlight !== 0)
          return false;
        for (const target of group.targets.values())
          if (liveRoutes.has(target.route))
            return false;
      }
      return true;
    }).sort((a, b) => {
      var _a2, _b2;
      return ((_a2 = this.lastUse.get(b)) !== null && _a2 !== void 0 ? _a2 : 0) - ((_b2 = this.lastUse.get(a)) !== null && _b2 !== void 0 ? _b2 : 0);
    });
    const evictedTemplates = [];
    for (const binding of idle.slice(budget.maxIdleTemplates))
      if ((_a = binding.evictPrepared) === null || _a === void 0 ? void 0 : _a.call(binding))
        evictedTemplates.push(binding.id);
    (_c = (_b = this.provider.assets).trimUnused) === null || _c === void 0 ? void 0 : _c.call(_b, {
      maxContexts: (_e = budget.maxUnusedResourceContexts) !== null && _e !== void 0 ? _e : 0
    });
    return { evictedTemplates };
  }
  preparedBindings() {
    var _a;
    return [...this.bindings.values(), ...(_a = this.options.layers) !== null && _a !== void 0 ? _a : []];
  }
  withPrepared(binding, action) {
    this.lastUse.set(binding, ++this.useSequence);
    if (binding.prepare && binding.acquirePrepared)
      return binding.acquirePrepared().then(async (pin) => {
        try {
          return await action(pin.component);
        } finally {
          pin.release();
        }
      });
    return binding.prepare ? binding.prepare().then(() => action(binding.component)) : action(binding.component);
  }
  destroy() {
    var _a, _b, _c;
    var _d;
    if (this.destroyed)
      return;
    this.destroyed = true;
    (_a = this.unsubscribe) === null || _a === void 0 ? void 0 : _a.call(this);
    this.unsubscribe = void 0;
    try {
      this.legacy.destroy();
    } finally {
      try {
        for (const state of this.mountedLayers.values())
          state.mounted.destroy();
      } finally {
        this.mountedLayers.clear();
        for (const binding of this.bindings.values())
          (_b = binding.dispose) === null || _b === void 0 ? void 0 : _b.call(binding);
        for (const layer of (_d = this.options.layers) !== null && _d !== void 0 ? _d : [])
          (_c = layer.dispose) === null || _c === void 0 ? void 0 : _c.call(layer);
      }
    }
  }
  /** @internal */
  openOn(stack, ui, params, mode) {
    const binding = this.bindings.get(ui.id);
    if (!binding || binding.ui !== ui && !isHotUIDefinition(ui))
      throw new Error(`Unknown UI: ${ui.id}`);
    const membership = this.routeGroups.get(ui.id);
    if (binding.ui.options.zIndex === "screen") {
      this.screenIntentVersion++;
      this.screenIntentGroup = membership === null || membership === void 0 ? void 0 : membership.group.id;
    }
    const navigate = () => mode === "goto" ? stack.goto(ui.id, params) : stack.open(ui.id, params);
    return membership ? this.navigateGroup(membership.group, membership.key, ui.id, navigate) : navigate();
  }
  async beforePresent(route, action) {
    var _a, _b, _c;
    var _d;
    const membership = this.routeGroups.get(route);
    if (membership) {
      const intentVersion = this.screenIntentVersion;
      await this.withPrepared(membership.group.layer, (component) => {
        var _a2;
        if (this.destroyed || intentVersion !== this.screenIntentVersion)
          throw new NavigationCancelledError("replaced");
        if (membership.group.desiredKey !== membership.key)
          throw new NavigationCancelledError("replaced");
        membership.group.desiredKey = membership.key;
        this.mountLayer(membership.group.layer, membership.group.id, component);
        (_a2 = membership.group.binding) === null || _a2 === void 0 ? void 0 : _a2.sync(membership.key);
      });
    }
    if (action === "goto") {
      const zIndex = membership ? "screen" : (_d = (_a = this.bindings.get(route)) === null || _a === void 0 ? void 0 : _a.ui.options.zIndex) !== null && _d !== void 0 ? _d : "screen";
      await ((_c = (_b = this.options).onGoto) === null || _c === void 0 ? void 0 : _c.call(_b, zIndex));
    }
  }
  activateTab(component, hookId, key) {
    const group = this.tabGroups.get(tabGroupId(component, hookId));
    if (!group)
      return Promise.resolve();
    const target = group.targets.get(key);
    if (!target)
      return Promise.reject(new Error(`Unknown Tab target: ${group.id}/${key}`));
    return this.navigateGroup(group, key, target.route, () => this.legacy.open(target.route, void 0)).ready.catch(async (error) => {
      if (!(error instanceof NavigationCancelledError))
        await this.reportNavigationError(error);
      throw error;
    });
  }
  navigateGroup(group, key, route, navigate) {
    const version = ++group.intentVersion;
    group.inFlight++;
    group.desiredKey = key;
    this.legacy.cancelPendingNavigationGroup(group.id, route);
    let ref;
    try {
      ref = navigate();
    } catch (error) {
      this.finishGroupNavigation(group, version, false);
      throw error;
    }
    const ready = ref.ready.then(() => this.finishGroupNavigation(group, version, true), (error) => {
      this.finishGroupNavigation(group, version, false);
      throw error;
    });
    ready.catch(() => {
    });
    return Object.assign(Object.assign({}, ref), { ready });
  }
  finishGroupNavigation(group, version, succeeded) {
    var _a;
    group.inFlight--;
    if (succeeded || version !== group.intentVersion)
      return;
    const active = this.legacy.getSnapshot().activeGroups[group.id];
    group.desiredKey = active !== null && active !== void 0 ? active : group.initialKey;
    if (active)
      (_a = group.binding) === null || _a === void 0 ? void 0 : _a.sync(active);
  }
  registerTabs(component, hookId, binding) {
    const group = this.tabGroups.get(tabGroupId(component, hookId));
    if (!group)
      return void 0;
    if (group.binding && group.binding !== binding)
      throw new Error(`Duplicate mounted Tab controller: ${group.id}`);
    group.binding = binding;
    binding.sync(group.desiredKey);
    return () => {
      if (group.binding === binding)
        group.binding = void 0;
    };
  }
  navigationChanged() {
    var _a, _b;
    if (this.destroyed)
      return;
    const snapshot = this.legacy.getSnapshot();
    for (const group of this.tabGroups.values()) {
      const key = snapshot.activeGroups[group.id];
      if (key) {
        if (group.inFlight === 0)
          group.desiredKey = key;
        (_a = group.binding) === null || _a === void 0 ? void 0 : _a.sync(key);
        continue;
      }
      if (((_b = this.mountedLayers.get(group.layer.id)) === null || _b === void 0 ? void 0 : _b.ownerGroup) === group.id)
        void this.unmountLayer(group.layer.id).catch((error) => this.reportNavigationError(error));
      if (this.screenIntentGroup === group.id)
        continue;
      if (this.clearingGroups.has(group.id))
        continue;
      const hasTargets = snapshot.entries.some((entry) => {
        var _a2;
        return ((_a2 = this.routeGroups.get(entry.route)) === null || _a2 === void 0 ? void 0 : _a2.group) === group;
      });
      if (!hasTargets) {
        group.desiredKey = group.initialKey;
        continue;
      }
      this.clearingGroups.add(group.id);
      const intentVersion = this.screenIntentVersion;
      void this.legacy.clearNavigationGroup(group.id, () => intentVersion === this.screenIntentVersion || this.screenIntentGroup !== group.id).then((cleared) => {
        this.clearingGroups.delete(group.id);
        if (cleared && !this.destroyed)
          this.navigationChanged();
      }, (error) => {
        var _a2, _b2;
        this.clearingGroups.delete(group.id);
        void Promise.resolve((_b2 = (_a2 = this.runtimeOptions).onActionError) === null || _b2 === void 0 ? void 0 : _b2.call(_a2, error)).catch(() => {
        });
      });
    }
  }
  mountLayer(layer, ownerGroup, component = layer.component) {
    if (this.mountedLayers.has(layer.id))
      return;
    const current = {};
    const navigation = this.navigationContext(this.legacy);
    const context = Object.assign(Object.assign({}, navigation), { anchors: this.provider.anchors, get metrics() {
      var _a;
      return (_a = current.value) === null || _a === void 0 ? void 0 : _a.metrics;
    } });
    current.value = this.provider.mount(component, context, this.runtimeOptions);
    try {
      const detach = this.legacy.attachLayer({
        id: layer.id,
        mount: current.value,
        zIndex: layer.layer.options.zIndex,
        ownerGroup
      });
      this.mountedLayers.set(layer.id, { mounted: current.value, detach, ownerGroup });
    } catch (error) {
      current.value.destroy();
      throw error;
    }
  }
  async unmountLayer(id) {
    const state = this.mountedLayers.get(id);
    if (!state)
      return;
    this.mountedLayers.delete(id);
    try {
      await state.detach();
    } finally {
      state.mounted.destroy();
    }
  }
  mountSurface(binding, context) {
    const mount = (component) => {
      if (context.signal.aborted)
        throw context.signal.reason;
      return this.prepareAndMount(component, context, () => this.mountPreparedSurface(component, context));
    };
    const result = this.withPrepared(binding, mount);
    return isPromiseLike2(result) ? Promise.resolve(result).catch((error) => this.failPreparation(error, context)) : result;
  }
  mountPanel(component, context) {
    if (context.signal.aborted)
      throw context.signal.reason;
    return this.provider.mount(component, this.navigationContext(context.scope), this.scopedRuntime(context));
  }
  prepareAndMount(component, context, mount) {
    var _a;
    const info = (_a = component.plan) === null || _a === void 0 ? void 0 : _a.moduleInfo;
    if (!info)
      return mount();
    const prepare = this.runtimeOptions.prepareModule;
    if (!prepare)
      return this.failPreparation(new Error(`UI module preparer is missing for ${component.plan.name}`), context);
    try {
      const prepared = prepare(info, context.signal);
      if (isPromiseLike2(prepared))
        return Promise.resolve(prepared).then(() => {
          if (context.signal.aborted)
            throw context.signal.reason;
          return mount();
        }, (error) => this.failPreparation(error, context));
      if (context.signal.aborted)
        throw context.signal.reason;
      return mount();
    } catch (error) {
      return this.failPreparation(error, context);
    }
  }
  async failPreparation(error, context) {
    if (!context.signal.aborted)
      await this.reportNavigationError(error);
    throw error;
  }
  async reportNavigationError(error) {
    var _a, _b;
    const objectError = typeof error === "object" && error !== null || typeof error === "function" ? error : void 0;
    if (objectError && this.reportedErrors.has(objectError))
      return;
    if (objectError)
      this.reportedErrors.add(objectError);
    try {
      await ((_b = (_a = this.runtimeOptions).onActionError) === null || _b === void 0 ? void 0 : _b.call(_a, error));
    } catch (_c) {
    }
  }
  mountPreparedSurface(component, context) {
    const mounted = {};
    const navigation = this.navigationContext(context.scope);
    const renderContext = Object.assign(Object.assign({}, navigation), { params: context.params, signal: context.signal, get metrics() {
      var _a;
      return (_a = mounted.current) === null || _a === void 0 ? void 0 : _a.metrics;
    }, back: context.back, complete: context.complete });
    mounted.current = this.provider.mount(component, renderContext, this.scopedRuntime(context));
    return mounted.current;
  }
  scopedRuntime(context) {
    const prepare = this.runtimeOptions.prepareModule;
    return prepare ? Object.freeze(Object.assign(Object.assign({}, this.runtimeOptions), { prepareModule: (info) => prepare(info, context.signal) })) : this.runtimeOptions;
  }
  navigationContext(stack) {
    return {
      open: (target, ...arguments_) => this.openOn(stack, target, arguments_[0], "open"),
      goto: (target, ...arguments_) => this.openOn(stack, target, arguments_[0], "goto")
    };
  }
};
function discoverTabGroups(layers, bindings) {
  var _a, _b;
  const layerIds = /* @__PURE__ */ new Set();
  const zIndices = /* @__PURE__ */ new Map();
  const groups = /* @__PURE__ */ new Map();
  const routeGroups = /* @__PURE__ */ new Map();
  for (const layer of layers) {
    if (layerIds.has(layer.id))
      throw new Error(`Duplicate UI Layer: ${layer.id}`);
    layerIds.add(layer.id);
    const zIndex = layer.layer.options.zIndex;
    const prior = zIndices.get(zIndex);
    if (prior)
      throw new Error(`Only one ${zIndex} Layer is supported: ${prior}, ${layer.id}`);
    zIndices.set(zIndex, layer.id);
    const metadata = (_a = layer.navigation) !== null && _a !== void 0 ? _a : layer.component.plan;
    const plans = Object.entries((_b = metadata === null || metadata === void 0 ? void 0 : metadata.tabTargets) !== null && _b !== void 0 ? _b : {});
    if (plans.length > 1)
      throw new Error(`A Layer may own only one navigation TabGroup: ${layer.id}`);
    for (const [rawHookId, plan] of plans) {
      if (zIndex !== "hud")
        throw new Error(`Navigation TabGroup must be owned by a hud Layer: ${layer.id}`);
      const hookId = Number(rawHookId);
      const id = tabGroupId(metadata.name, hookId);
      const targets = /* @__PURE__ */ new Map();
      const group = {
        id,
        layer,
        component: metadata.name,
        hookId,
        initialKey: plan.initialKey,
        targets,
        desiredKey: plan.initialKey,
        intentVersion: 0,
        inFlight: 0
      };
      groups.set(id, group);
      for (const [key, target] of Object.entries(plan.targets)) {
        let route;
        if (target.kind === "view") {
          const binding = bindings.get(target.id);
          if (!binding)
            throw new Error(`Unknown Tab View target: ${target.id}`);
          if (binding.ui.options.zIndex !== "screen" || binding.ui.options.launchMode !== "singleInstance")
            throw new Error(`Tab View target must be a singleInstance screen: ${target.id}`);
          route = target.id;
        } else {
          route = `__tab:${layer.id}:${hookId}:${key}`;
        }
        if (routeGroups.has(route))
          throw new Error(`Tab target belongs to multiple groups: ${route}`);
        targets.set(key, { route, target });
        routeGroups.set(route, { group, key });
      }
    }
  }
  return { groups, routeGroups };
}
function tabGroupId(component, hookId) {
  return `${component}:${hookId}`;
}
function createSurfaceNavigator(provider, registry, options = {}) {
  return new SurfaceNavigator(provider, registry, options);
}
function isPromiseLike2(value) {
  return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}

// frontend/packages/core/dist/navigation/ui-layer.js
var runtimeBrand = Symbol("UniFlex.UILayerDefinition");
function defineUILayer(id, options) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(id))
    throw new Error(`Invalid UI layer id: ${id}`);
  if (options.zIndex !== "hud" && options.zIndex !== "feedback")
    throw new Error(`Unsupported Layer zIndex: ${String(options.zIndex)}`);
  return Object.freeze({
    id,
    options: Object.freeze(Object.assign({}, options)),
    [runtimeBrand]: true
  });
}
function bindUILayer(layer, component) {
  return Object.freeze(Object.assign({ id: layer.id, layer }, eagerComponent(component)));
}
function bindDeferredUILayer(layer, navigation, load) {
  const deferred2 = deferredComponent(load);
  return Object.freeze({
    id: layer.id,
    layer,
    navigation,
    prepare: deferred2.prepare,
    acquirePrepared: deferred2.acquirePrepared,
    evictPrepared: deferred2.evictPrepared,
    inspectPrepared: deferred2.inspectPrepared,
    dispose: deferred2.dispose,
    get component() {
      return deferred2.get();
    }
  });
}

// frontend/packages/core/dist/navigation/transient-services.js
function createLoadingService() {
  const counts = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    for (const listener of [...listeners])
      listener();
  };
  return {
    get active() {
      return counts.size > 0;
    },
    get keys() {
      return [...counts.keys()];
    },
    acquire(key) {
      var _a;
      if (!key)
        throw new Error("Loading key must not be empty.");
      counts.set(key, ((_a = counts.get(key)) !== null && _a !== void 0 ? _a : 0) + 1);
      emit();
      let released = false;
      return {
        release() {
          var _a2;
          if (released)
            return;
          released = true;
          const count = (_a2 = counts.get(key)) !== null && _a2 !== void 0 ? _a2 : 0;
          if (count <= 1)
            counts.delete(key);
          else
            counts.set(key, count - 1);
          emit();
        }
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export {
  semanticZIndexOrder,
  SurfaceStackNavigator,
  SurfaceExclusiveScopeGroup,
  SurfaceNavigator,
  createSurfaceNavigator,
  defineUILayer,
  bindUILayer,
  bindDeferredUILayer,
  createLoadingService
};
