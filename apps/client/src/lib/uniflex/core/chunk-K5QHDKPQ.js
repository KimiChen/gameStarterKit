// frontend/packages/core/dist/virtual/virtual-data-source.js
function flattenDataChange(change) {
  return change.type === "batch" ? change.changes : [change];
}
function mergeDataChanges(a, b) {
  if (!a)
    return b;
  const changes = [...flattenDataChange(a), ...flattenDataChange(b)];
  return changes.some((c) => c.type === "reset") ? { type: "reset" } : { type: "batch", changes };
}
var negativeZero = Symbol("negative-zero-key");
var mapKey = (key) => Object.is(key, -0) ? negativeZero : key;
var itemKey = (item, property) => {
  if (item === null || typeof item !== "object")
    throw new Error("Keyed For items must be objects.");
  const key = item[property];
  if (key === null || key === void 0)
    throw new Error(`Keyed For key ${property} must not be null or undefined.`);
  return key;
};
var VirtualKeyIndex = class {
  constructor() {
    this.properties = /* @__PURE__ */ new Map();
  }
  clear() {
    this.source = void 0;
    this.properties.clear();
  }
  find(source, key, property) {
    var _a;
    if (source.indexOfKey) {
      const index = source.indexOfKey(key, property);
      if (index === -1)
        return -1;
      if (!Number.isInteger(index) || index < 0 || index >= source.length || !Object.is(itemKey(source.get(index), property), key)) {
        throw new Error("Data source indexOfKey returned an invalid index");
      }
      return index;
    }
    if (this.source !== source) {
      this.clear();
      this.source = source;
    }
    let indices = this.properties.get(property);
    if (!indices) {
      indices = /* @__PURE__ */ new Map();
      for (let index = 0; index < source.length; index++) {
        const candidate = mapKey(itemKey(source.get(index), property));
        if (!indices.has(candidate))
          indices.set(candidate, index);
      }
      this.properties.set(property, indices);
    }
    return (_a = indices.get(mapKey(key))) !== null && _a !== void 0 ? _a : -1;
  }
};
var ArrayVirtualListDataSource = class {
  constructor(values = []) {
    this.listeners = /* @__PURE__ */ new Set();
    this.values = values.slice();
  }
  get length() {
    return this.values.length;
  }
  get(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.values.length) {
      throw new RangeError(`Virtual data index out of range: ${index}`);
    }
    return this.values[index];
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  reset(values) {
    this.values = values.slice();
    this.emit({ type: "reset" });
  }
  splice(index, deleteCount, ...inserted) {
    const start = clampInteger(index, 0, this.values.length);
    const count = clampInteger(deleteCount, 0, this.values.length - start);
    const removed = this.values.splice(start, count, ...inserted);
    if (count > 0 || inserted.length > 0) {
      this.emit({
        type: "splice",
        index: start,
        deleteCount: count,
        insertCount: inserted.length
      });
    }
    return removed;
  }
  update(index, value) {
    if (!Number.isInteger(index) || index < 0 || index >= this.values.length) {
      throw new RangeError(`Virtual data index out of range: ${index}`);
    }
    if (Object.is(this.values[index], value))
      return;
    this.values[index] = value;
    this.emit({ type: "update", index, count: 1 });
  }
  notify(index, count = 1) {
    const start = clampInteger(index, 0, this.values.length);
    const safeCount = clampInteger(count, 0, this.values.length - start);
    if (safeCount > 0)
      this.emit({ type: "update", index: start, count: safeCount });
  }
  snapshot() {
    return this.values.slice();
  }
  /** Releases subscribers and retained values owned by a disposed Store. */
  dispose() {
    this.listeners.clear();
    this.values = [];
  }
  emit(change) {
    for (const listener of [...this.listeners])
      listener(change);
  }
};
function clampInteger(value, min, max) {
  if (!Number.isFinite(value))
    return value < 0 ? min : max;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export {
  flattenDataChange,
  mergeDataChanges,
  VirtualKeyIndex,
  ArrayVirtualListDataSource
};
