import {
  canonicalJson,
  jsonHash
} from "./chunk-EAG4H2KJ.js";

// frontend/packages/core/dist/runtime/initial-render.js
function resolveInitialRender(value) {
  if (value === false)
    return false;
  if (value !== void 0 && (value === null || typeof value !== "object" || Array.isArray(value))) {
    throw new Error("initialRender must be false or an options object.");
  }
  const options = value !== null && value !== void 0 ? value : {};
  const result = {
    intervalMs: options.intervalMs === void 0 ? 32 : options.intervalMs,
    animation: options.animation === void 0 ? true : options.animation,
    durationMs: options.durationMs === void 0 ? 180 : options.durationMs,
    offset: options.offset === void 0 ? 8 : options.offset
  };
  for (const key of ["intervalMs", "durationMs", "offset"]) {
    const n = result[key];
    if (typeof n !== "number" || !Number.isFinite(n) || (key === "offset" ? n < 0 : n <= 0)) {
      throw new Error(`initialRender.${key} must be a ${key === "offset" ? "nonnegative" : "positive"} finite number.`);
    }
    result[key] = n;
  }
  if (typeof result.animation !== "boolean")
    throw new Error("initialRender.animation must be boolean.");
  return result;
}

// frontend/packages/core/dist/runtime/parse-host-plan.js
var removedHostProperties = /* @__PURE__ */ new Set([
  "normalSource",
  "pressedSource",
  "disabledSource",
  "pressScale",
  "pressOffset",
  "trackSource",
  "fillSource",
  "thumbSource",
  "anchorName",
  "cellSize",
  "estimatedCellSize",
  "mainGap"
]);
function parseHostPlan(value, contract) {
  canonicalJson(value);
  const record = (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new Error("Invalid HostPlan object.");
    return v;
  };
  const integer = (v, min = 0) => {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min)
      throw new Error("Invalid HostPlan integer.");
    return v;
  };
  const key = (v) => {
    if (typeof v !== "string" || !v || ["__proto__", "prototype", "constructor"].includes(v))
      throw new Error("Invalid HostPlan key.");
    return v;
  };
  const componentKey = (v) => {
    const value2 = key(v);
    if (value2.startsWith("__"))
      throw new Error("Invalid HostPlan component key.");
    return value2;
  };
  const stringList = (v) => {
    if (!Array.isArray(v))
      throw new Error("Invalid UI module string list.");
    const values = v.map(key);
    if (new Set(values).size !== values.length || values.some((value2, index) => index > 0 && values[index - 1] >= value2))
      throw new Error("UI module string lists must be unique and sorted.");
    return values;
  };
  const moduleInfo = (v) => {
    const info = record(v);
    if (info.feature !== null)
      key(info.feature);
    const features = stringList(info.features);
    stringList(info.configKeys);
    stringList(info.dataModules);
    stringList(info.services);
    if (info.feature !== null && !features.includes(info.feature))
      throw new Error("UI module feature must appear in features.");
  };
  const ids = /* @__PURE__ */ new Set(), repeats = {};
  const id = (v) => {
    const n = integer(v, 1);
    if (ids.has(n))
      throw new Error(`Duplicate HostPlan node: ${n}`);
    ids.add(n);
    return n;
  };
  const slot = (v, count2) => {
    if (integer(v) >= count2)
      throw new Error("HostPlan slot out of range.");
  };
  const node = (v, count2, version) => {
    const n = record(v), planId = id(n.planId), kind = String(n.kind);
    if (n.lazy !== void 0 && typeof n.lazy !== "boolean")
      throw new Error("Invalid HostPlan lazy flag.");
    if (n.moduleInfo !== void 0) {
      if (version !== 5 || n.lazy !== true)
        throw new Error("HostPlan node module info requires a v5 lazy boundary.");
      moduleInfo(n.moduleInfo);
    }
    if (n.props !== void 0 && "initialRender" in record(n.props))
      resolveInitialRender(record(n.props).initialRender);
    if (kind === "component") {
      componentKey(n.component);
      if (n.propsSlot !== void 0) {
        slot(n.propsSlot, count2);
        if (n.props !== void 0 || n.bindings !== void 0)
          throw new Error("Component propsSlot cannot be combined with props or bindings.");
      }
      if (n.props !== void 0)
        for (const prop of Object.keys(record(n.props)))
          key(prop);
      if (n.bindings !== void 0) {
        if (!Array.isArray(n.bindings))
          throw new Error("Invalid component bindings.");
        for (const binding of n.bindings) {
          const b = record(binding);
          key(b.property);
          slot(b.slot, count2);
        }
      }
      if (n.children !== void 0 || n.repeat !== void 0 || n.virtual !== void 0)
        throw new Error("Invalid component plan structure.");
      return;
    }
    if (!["view", "text", "input", "image", "scroll-view", "virtual-list"].includes(kind))
      throw new Error("Invalid HostPlan kind.");
    if (n.behavior !== void 0) {
      if (kind !== "view")
        throw new Error("Host behavior requires a view Host.");
      const behavior2 = record(n.behavior);
      if (Object.keys(behavior2).some((field) => !["interaction", "floating"].includes(field)))
        throw new Error("Invalid Host behavior field.");
      if (behavior2.interaction !== void 0 && behavior2.interaction !== "press" && behavior2.interaction !== "range")
        throw new Error("Invalid Host interaction.");
      if (behavior2.floating !== void 0) {
        const floating = record(behavior2.floating);
        if (Object.keys(floating).some((field) => !["anchor", "anchorIndex", "panelIndex"].includes(field)) || floating.anchor !== "child" && floating.anchor !== "rect")
          throw new Error("Invalid floating behavior.");
        const panelIndex = integer(floating.panelIndex);
        if (floating.anchor === "child") {
          if (integer(floating.anchorIndex) === panelIndex)
            throw new Error("Floating anchor and panel must be different children.");
        } else if (floating.anchorIndex !== void 0)
          throw new Error("External floating behavior cannot have anchorIndex.");
      }
    }
    const propertyNames = /* @__PURE__ */ new Set();
    if (n.props !== void 0) {
      const props = record(n.props);
      for (const prop of Object.keys(props)) {
        key(prop);
        propertyNames.add(prop);
        if (removedHostProperties.has(prop))
          throw new Error(`Removed HostPlan property: ${prop}`);
      }
      if (props.style !== void 0) {
        const style = record(props.style);
        for (const prop of ["pressScale", "pressOffset"])
          if (prop in style)
            throw new Error(`Removed HostPlan style property: ${prop}`);
      }
    }
    if (n.bindings !== void 0) {
      if (!Array.isArray(n.bindings))
        throw new Error("Invalid HostPlan bindings.");
      for (const binding of n.bindings) {
        const b = record(binding);
        const property = key(b.property);
        propertyNames.add(property);
        if (removedHostProperties.has(property))
          throw new Error(`Removed HostPlan property: ${property}`);
        slot(b.slot, count2);
      }
    }
    const behavior = n.behavior === void 0 ? void 0 : record(n.behavior);
    if (kind === "view" && ["open", "anchorRect", "placement", "align", "viewportPadding", "onOpenChange"].some((property) => propertyNames.has(property)) && (behavior === null || behavior === void 0 ? void 0 : behavior.floating) === void 0)
      throw new Error("Floating properties require floating Host behavior.");
    if (kind === "view" && ["value", "min", "max", "step", "onChange", "onCommit"].some((property) => propertyNames.has(property)) && (behavior === null || behavior === void 0 ? void 0 : behavior.interaction) !== "range")
      throw new Error("Range properties require range Host behavior.");
    if (kind === "view" && ["onClick", "onPressChange", "interactable", "accessibilityLabel"].some((property) => propertyNames.has(property)) && (behavior === null || behavior === void 0 ? void 0 : behavior.interaction) === void 0)
      throw new Error("Interaction properties require Host interaction behavior.");
    if (n.children !== void 0) {
      if (!Array.isArray(n.children))
        throw new Error("Invalid HostPlan children.");
      for (const child of n.children)
        node(child, count2, version);
    }
    if (kind === "scroll-view" && (!Array.isArray(n.children) || n.children.length !== 1))
      throw new Error("HostPlan scroll-view requires exactly one content root.");
    if (n.behavior !== void 0 && record(n.behavior).floating !== void 0) {
      const floating = record(record(n.behavior).floating);
      const expected = floating.anchor === "child" ? 2 : 1;
      if (!Array.isArray(n.children) || n.children.length !== expected)
        throw new Error(`Floating Host requires exactly ${expected} children.`);
      if (integer(floating.panelIndex) >= expected)
        throw new Error("Floating panel index is outside its children.");
      if (floating.anchor === "child" && integer(floating.anchorIndex) >= expected)
        throw new Error("Floating anchor index is outside its children.");
    }
    if (n.repeat !== void 0 && n.virtual !== void 0)
      throw new Error("Conflicting HostPlan templates.");
    if (n.repeat !== void 0) {
      const r = record(n.repeat);
      slot(r.collectionSlot, count2);
      key(r.key);
      repeats[planId] = integer(r.itemSlotCount);
      node(r.template, repeats[planId], version);
    }
    if (n.virtual !== void 0) {
      const r = record(n.virtual);
      if (!["list", "grid"].includes(String(r.layout)) || kind !== "virtual-list")
        throw new Error("Invalid HostPlan virtual layout.");
      slot(r.sourceSlot, count2);
      key(r.key);
      repeats[planId] = integer(r.itemSlotCount);
      node(r.template, repeats[planId], version);
      if (r.header !== void 0) {
        const h = record(r.header), headerId = id(h.planId);
        key(h.groupKey);
        repeats[headerId] = integer(h.itemSlotCount);
        node(h.template, repeats[headerId], version);
      }
    }
  };
  const plan = record(value);
  if (plan.version !== 5)
    throw new Error(`Unsupported HostPlan version: ${plan.version}`);
  key(plan.name);
  const count = integer(plan.slotCount);
  node(plan.root, count, plan.version);
  if (plan.moduleInfo !== void 0) {
    if (plan.version !== 5)
      throw new Error("HostPlan module info requires version 5.");
    moduleInfo(plan.moduleInfo);
  }
  if (plan.tabModules !== void 0) {
    if (plan.version !== 5)
      throw new Error("HostPlan tab modules require version 5.");
    const tabs = record(plan.tabModules);
    for (const [hook, entries] of Object.entries(tabs)) {
      if (!/^(0|[1-9]\d*)$/.test(hook))
        throw new Error("Invalid HostPlan tab hook id.");
      for (const [tab, info] of Object.entries(record(entries))) {
        key(tab);
        moduleInfo(info);
      }
    }
  }
  if (plan.tabTargets !== void 0) {
    if (plan.version !== 5)
      throw new Error("HostPlan tab targets require version 5.");
    const groups = record(plan.tabTargets);
    for (const [hook, rawGroup] of Object.entries(groups)) {
      if (!/^(0|[1-9]\d*)$/.test(hook))
        throw new Error("Invalid HostPlan tab hook id.");
      const group = record(rawGroup);
      if (Object.keys(group).some((field) => !["targetZIndex", "initialKey", "targets"].includes(field)))
        throw new Error("Invalid HostPlan tab target group field.");
      if (group.targetZIndex !== "screen")
        throw new Error("Invalid HostPlan tab target zIndex.");
      const initialKey = key(group.initialKey);
      const targets = record(group.targets);
      if (!(initialKey in targets))
        throw new Error("HostPlan tab targets must include the initial key.");
      for (const [tab, rawTarget] of Object.entries(targets)) {
        key(tab);
        const target = record(rawTarget);
        if (target.kind === "view") {
          if (Object.keys(target).some((field) => !["kind", "id"].includes(field)))
            throw new Error("Invalid HostPlan View tab target field.");
          key(target.id);
        } else if (target.kind === "panel") {
          if (Object.keys(target).some((field) => !["kind", "component"].includes(field)))
            throw new Error("Invalid HostPlan Panel tab target field.");
          componentKey(target.component);
        } else
          throw new Error("Invalid HostPlan tab target kind.");
      }
    }
  }
  if (plan.components !== void 0) {
    if (plan.version !== 5)
      throw new Error("HostPlan components require version 5.");
    const components = record(plan.components);
    for (const [name, component] of Object.entries(components)) {
      componentKey(name);
      if (parseHostPlan(component).name !== name)
        throw new Error(`HostPlan component name mismatch: ${name}`);
    }
  }
  if (plan.tabTargets !== void 0) {
    const components = plan.components && typeof plan.components === "object" ? plan.components : void 0;
    for (const rawGroup of Object.values(plan.tabTargets)) {
      for (const target of Object.values(rawGroup.targets)) {
        if (target.kind === "panel" && !(components === null || components === void 0 ? void 0 : components[target.component]))
          throw new Error(`Unknown HostPlan tab panel: ${target.component}`);
      }
    }
  }
  if (contract && (plan.name !== contract.name || count !== contract.slotCount || canonicalJson(repeats) !== canonicalJson(contract.repeatSlots) || jsonHash(value) !== contract.sha256))
    throw new Error("HostPlan/logic contract mismatch.");
  return value;
}

// frontend/packages/core/dist/runtime/host-frame-scheduler.js
var HostFrameScheduler = class {
  constructor(now, requestFrame) {
    this.now = now;
    this.requestFrame = requestFrame;
    this.tasks = /* @__PURE__ */ new Map();
    this.animations = /* @__PURE__ */ new Set();
    this.disposed = false;
  }
  delay(callback, delayMs) {
    if (this.disposed)
      return () => {
      };
    const task = () => callback();
    this.tasks.set(task, this.now() + delayMs);
    this.wake();
    return () => {
      this.tasks.delete(task);
      this.stopIfIdle();
    };
  }
  animate(durationMs, write, complete) {
    if (this.disposed)
      return () => {
      };
    const start = this.now();
    write(0);
    const tick = (time) => {
      const t = Math.min(1, Math.max(0, (time - start) / durationMs));
      write(1 - (1 - t) ** 3);
      if (t === 1) {
        this.animations.delete(tick);
        complete();
      }
    };
    this.animations.add(tick);
    this.wake();
    return () => {
      if (this.animations.delete(tick))
        write(1);
      this.stopIfIdle();
    };
  }
  get pending() {
    return this.tasks.size + this.animations.size;
  }
  dispose() {
    var _a;
    this.disposed = true;
    (_a = this.cancelFrame) === null || _a === void 0 ? void 0 : _a.call(this);
    this.cancelFrame = void 0;
    this.tasks.clear();
    this.animations.clear();
  }
  wake() {
    if (this.cancelFrame || this.disposed || !this.pending)
      return;
    this.cancelFrame = this.requestFrame(() => {
      this.cancelFrame = void 0;
      const time = this.now();
      for (const [task, deadline] of [...this.tasks]) {
        if (deadline <= time && this.tasks.delete(task))
          task();
      }
      for (const tick of [...this.animations])
        if (this.animations.has(tick))
          tick(time);
      this.wake();
    });
  }
  stopIfIdle() {
    var _a;
    if (this.pending)
      return;
    (_a = this.cancelFrame) === null || _a === void 0 ? void 0 : _a.call(this);
    this.cancelFrame = void 0;
  }
};

// frontend/packages/core/dist/runtime/host-plan.js
function normalizeRangeValue(value, min = 0, max = 100, step = 1) {
  const low = Number.isFinite(min) ? min : 0;
  const high = Number.isFinite(max) ? Math.max(low, max) : Math.max(low, 100);
  const interval = Number.isFinite(step) && step > 0 ? step : 1;
  const finite = Number.isFinite(value) ? value : low;
  const snapped = low + Math.round((Math.min(high, Math.max(low, finite)) - low) / interval) * interval;
  const precision = Math.min(12, Math.max(decimalPlaces(low), decimalPlaces(high), decimalPlaces(interval)));
  return Math.min(high, Math.max(low, Number(snapped.toFixed(precision))));
}
function placeFloating(anchor, panel, viewport, options = {}) {
  const padding = finiteNonNegative(options.viewportPadding, 16);
  const gap = finiteNonNegative(options.gap, 14);
  const placements = options.placement && options.placement !== "auto" ? [options.placement] : ["bottom", "top", "right", "left"];
  const aligns = options.align && options.align !== "auto" ? [options.align] : ["start", "center", "end"];
  const viewportLeft = padding;
  const viewportTop = padding;
  const viewportRight = Math.max(viewportLeft, viewport.width - padding);
  const viewportBottom = Math.max(viewportTop, viewport.height - padding);
  let best;
  for (const placement of placements) {
    for (const align of aligns) {
      const raw = floatingOrigin(anchor, panel, placement, align, gap);
      const visibleWidth = Math.max(0, Math.min(raw.x + panel.width, viewportRight) - Math.max(raw.x, viewportLeft));
      const visibleHeight = Math.max(0, Math.min(raw.y + panel.height, viewportBottom) - Math.max(raw.y, viewportTop));
      const overflow = Math.max(0, viewportLeft - raw.x) + Math.max(0, raw.x + panel.width - viewportRight) + Math.max(0, viewportTop - raw.y) + Math.max(0, raw.y + panel.height - viewportBottom);
      const candidate = {
        placement,
        align,
        x: raw.x,
        y: raw.y,
        visibleArea: visibleWidth * visibleHeight,
        overflow
      };
      if (!best || candidate.visibleArea > best.visibleArea || candidate.visibleArea === best.visibleArea && candidate.overflow < best.overflow)
        best = candidate;
    }
  }
  const chosen = best;
  const maximumX = Math.max(padding, viewport.width - padding - panel.width);
  const maximumY = Math.max(padding, viewport.height - padding - panel.height);
  return {
    x: Math.min(maximumX, Math.max(padding, chosen.x)),
    y: Math.min(maximumY, Math.max(padding, chosen.y)),
    width: panel.width,
    height: panel.height,
    placement: chosen.placement,
    align: chosen.align
  };
}
function floatingOrigin(anchor, panel, placement, align, gap) {
  const vertical = placement === "top" || placement === "bottom";
  const start = vertical ? anchor.x : anchor.y;
  const anchorCross = vertical ? anchor.width : anchor.height;
  const panelCross = vertical ? panel.width : panel.height;
  const cross = align === "start" ? start : align === "center" ? start + (anchorCross - panelCross) / 2 : start + anchorCross - panelCross;
  if (placement === "bottom")
    return { x: cross, y: anchor.y + anchor.height + gap };
  if (placement === "top")
    return { x: cross, y: anchor.y - panel.height - gap };
  if (placement === "right")
    return { x: anchor.x + anchor.width + gap, y: cross };
  return { x: anchor.x - panel.width - gap, y: cross };
}
function finiteNonNegative(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
function decimalPlaces(value) {
  const text = String(value).toLowerCase();
  if (text.includes("e-"))
    return Number(text.split("e-")[1]) || 0;
  return text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
}
var componentReferences = /* @__PURE__ */ new Map();
function componentRef(id) {
  if (!id || id.startsWith("__"))
    throw new Error(`Invalid component reference: ${id}`);
  let reference = componentReferences.get(id);
  if (!reference) {
    reference = Object.freeze({ id });
    componentReferences.set(id, reference);
  }
  return reference;
}

export {
  resolveInitialRender,
  parseHostPlan,
  HostFrameScheduler,
  normalizeRangeValue,
  placeFloating,
  componentRef
};
