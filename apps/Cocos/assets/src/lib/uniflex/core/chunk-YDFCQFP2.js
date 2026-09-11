import {
  VirtualKeyIndex,
  flattenDataChange,
  mergeDataChanges
} from "./chunk-K5QHDKPQ.js";
import {
  createState,
  trackComputation
} from "./chunk-VOFEJ6OI.js";
import {
  promiseFinally
} from "./chunk-2T32RA5W.js";
import {
  resolveInitialRender
} from "./chunk-EH6H4FZI.js";

// frontend/packages/core/dist/virtual/virtual-collection.js
var FenwickTree = class {
  constructor(length, initialValue = 0) {
    assertCount(length);
    this.values = new Array(length).fill(assertExtent(initialValue, true));
    this.tree = new Array(length + 1).fill(0);
    this.rebuild();
  }
  get length() {
    return this.values.length;
  }
  get total() {
    return this.prefix(this.values.length);
  }
  get(index) {
    var _a;
    return (_a = this.values[index]) !== null && _a !== void 0 ? _a : 0;
  }
  set(index, value) {
    if (!Number.isInteger(index) || index < 0 || index >= this.values.length)
      return false;
    const next = assertExtent(value, true);
    const delta = next - this.values[index];
    if (delta === 0)
      return false;
    this.values[index] = next;
    for (let cursor = index + 1; cursor < this.tree.length; cursor += cursor & -cursor)
      this.tree[cursor] += delta;
    return true;
  }
  resize(length, initialValue = 0) {
    assertCount(length);
    const fill = assertExtent(initialValue, true);
    if (length < this.values.length)
      this.values.length = length;
    else
      while (this.values.length < length)
        this.values.push(fill);
    this.tree = new Array(length + 1).fill(0);
    this.rebuild();
  }
  splice(index, deleteCount, insertCount, initialValue = 0) {
    assertCount(insertCount);
    const start = clamp(Math.trunc(index), 0, this.values.length);
    const removed = clamp(Math.trunc(deleteCount), 0, this.values.length - start);
    const inserted = new Array(insertCount).fill(assertExtent(initialValue, true));
    this.values.splice(start, removed, ...inserted);
    this.tree = new Array(this.values.length + 1).fill(0);
    this.rebuild();
  }
  replace(values) {
    this.values = values.map((value) => assertExtent(value, true));
    this.tree = new Array(this.values.length + 1).fill(0);
    this.rebuild();
  }
  /** Sum of [0, end). */
  prefix(end) {
    let cursor = Math.min(this.values.length, Math.max(0, Math.trunc(end)));
    let sum = 0;
    for (; cursor > 0; cursor -= cursor & -cursor)
      sum += this.tree[cursor];
    return sum;
  }
  /** First index whose item intersects offset. */
  indexAtOffset(offset) {
    if (this.values.length === 0)
      return 0;
    const target = Math.max(0, Math.min(this.total, Number.isFinite(offset) ? offset : this.total));
    let index = 0;
    let sum = 0;
    let bit = 1;
    while (bit << 1 <= this.values.length)
      bit <<= 1;
    for (; bit !== 0; bit >>= 1) {
      const next = index + bit;
      if (next <= this.values.length && sum + this.tree[next] <= target) {
        index = next;
        sum += this.tree[next];
      }
    }
    return Math.min(this.values.length - 1, index);
  }
  rebuild() {
    for (let index = 0; index < this.values.length; index++) {
      const cursor = index + 1;
      this.tree[cursor] += this.values[index];
      const parent = cursor + (cursor & -cursor);
      if (parent < this.tree.length)
        this.tree[parent] += this.tree[cursor];
    }
  }
};
var VirtualListModel = class {
  constructor(options) {
    var _a, _b, _c, _d;
    this.offset = 0;
    this.groupStarts = [];
    this.headerSize = 0;
    assertCount(options.itemCount);
    this.viewport = assertExtent(options.viewportSize);
    this.fixedSize = options.itemSize === void 0 ? void 0 : assertExtent(options.itemSize);
    this.estimate = (_a = this.fixedSize) !== null && _a !== void 0 ? _a : assertExtent((_b = options.estimatedItemSize) !== null && _b !== void 0 ? _b : 0);
    this.gap = assertExtent((_c = options.gap) !== null && _c !== void 0 ? _c : 0, true);
    this.overscan = Math.max(0, Math.trunc((_d = options.overscan) !== null && _d !== void 0 ? _d : 1));
    this.sizes = new FenwickTree(options.itemCount, this.estimate + this.gap);
  }
  get itemCount() {
    return this.sizes.length;
  }
  get scrollOffset() {
    return this.offset;
  }
  get viewportSize() {
    return this.viewport;
  }
  get contentSize() {
    return this.baseContentSize + this.groupStarts.length * this.headerSize;
  }
  get maxOffset() {
    return Math.max(0, this.contentSize - this.viewport);
  }
  get isFixed() {
    return this.fixedSize !== void 0;
  }
  setViewport(size) {
    const next = assertExtent(size);
    if (next === this.viewport)
      return false;
    this.viewport = next;
    this.offset = clamp(this.offset, 0, this.maxOffset);
    return true;
  }
  setItemCount(count) {
    assertCount(count);
    if (count === this.itemCount)
      return;
    this.sizes.resize(count, this.estimate + this.gap);
    this.groupStarts = normalizeGroupStarts(this.groupStarts, count);
    this.offset = clamp(this.offset, 0, this.maxOffset);
  }
  spliceItems(index, deleteCount, insertCount) {
    this.sizes.splice(index, deleteCount, insertCount, this.estimate + this.gap);
    this.groupStarts = normalizeGroupStarts(this.groupStarts, this.itemCount);
    this.offset = clamp(this.offset, 0, this.maxOffset);
  }
  setGroups(starts, headerSize) {
    const nextStarts = normalizeGroupStarts(starts, this.itemCount);
    const nextHeader = nextStarts.length > 0 ? assertExtent(headerSize) : 0;
    if (nextHeader === this.headerSize && equalNumbers(nextStarts, this.groupStarts))
      return false;
    this.groupStarts = nextStarts;
    this.headerSize = nextHeader;
    this.offset = clamp(this.offset, 0, this.maxOffset);
    return true;
  }
  updateSize(index, size) {
    if (this.fixedSize !== void 0)
      return false;
    const changed = this.sizes.set(index, assertExtent(size) + this.gap);
    if (changed)
      this.offset = clamp(this.offset, 0, this.maxOffset);
    return changed;
  }
  /** Replaces every variable extent in O(n), for data sources that expose exact sizes. */
  setSizes(sizes) {
    if (this.fixedSize !== void 0)
      return;
    if (sizes.length !== this.itemCount) {
      throw new RangeError(`item sizes length ${sizes.length} does not match itemCount ${this.itemCount}`);
    }
    this.sizes.replace(sizes.map((size) => assertExtent(size) + this.gap));
    this.offset = clamp(this.offset, 0, this.maxOffset);
  }
  resetSize(index) {
    if (this.fixedSize !== void 0)
      return;
    if (index === void 0) {
      this.sizes = new FenwickTree(this.itemCount, this.estimate + this.gap);
    } else {
      this.sizes.set(index, this.estimate + this.gap);
    }
  }
  sizeAt(index) {
    return Math.max(0, this.sizes.get(index) - this.gap);
  }
  offsetAt(index) {
    const safe = clamp(Math.trunc(index), 0, this.itemCount);
    if (safe === this.itemCount)
      return this.contentSize;
    return this.baseOffsetAt(safe) + (this.groupOrdinal(safe) + 1) * this.headerSize;
  }
  groupHeaders() {
    return this.groupStarts.map((firstIndex, ordinal) => ({
      firstIndex,
      mainOffset: this.baseOffsetAt(firstIndex) + ordinal * this.headerSize
    }));
  }
  headerOffsetForIndex(index) {
    const candidate = upperBoundNumber(this.groupStarts, index) - 1;
    const ordinal = this.groupStarts[candidate] === index ? candidate : -1;
    return ordinal >= 0 ? this.baseOffsetAt(index) + ordinal * this.headerSize : this.offsetAt(index);
  }
  indexAt(offset) {
    if (this.itemCount === 0)
      return 0;
    if (this.groupStarts.length === 0)
      return this.sizes.indexAtOffset(clamp(offset, 0, this.contentSize));
    const target = clamp(offset, 0, this.contentSize);
    let low = 0;
    let high = this.itemCount;
    while (low < high) {
      const middle = low + high >>> 1;
      if (this.offsetAt(middle) <= target)
        low = middle + 1;
      else
        high = middle;
    }
    const previous = Math.max(0, low - 1);
    if (low < this.itemCount && target >= this.offsetAt(previous) + this.sizeAt(previous))
      return low;
    return previous;
  }
  scrollTo(offset) {
    const next = clamp(Number.isFinite(offset) ? offset : this.maxOffset, 0, this.maxOffset);
    if (next === this.offset)
      return false;
    this.offset = next;
    return true;
  }
  offsetForIndex(index, align = "nearest") {
    if (this.itemCount === 0)
      return 0;
    const safe = clamp(Math.trunc(index), 0, this.itemCount - 1);
    const start = this.offsetAt(safe);
    const end = start + this.sizeAt(safe);
    if (align === "start")
      return clamp(start, 0, this.maxOffset);
    if (align === "center")
      return clamp(start - (this.viewport - this.sizeAt(safe)) / 2, 0, this.maxOffset);
    if (align === "end")
      return clamp(end - this.viewport, 0, this.maxOffset);
    if (start < this.offset)
      return clamp(start, 0, this.maxOffset);
    if (end > this.offset + this.viewport)
      return clamp(end - this.viewport, 0, this.maxOffset);
    return this.offset;
  }
  readRange() {
    if (this.itemCount === 0)
      return { start: 0, end: 0, firstVisible: 0, lastVisible: -1 };
    const firstVisible = this.indexAt(this.offset);
    const lastVisible = this.indexAt(Math.max(this.offset, this.offset + this.viewport - 1e-4));
    return {
      start: Math.max(0, firstVisible - this.overscan),
      end: Math.min(this.itemCount, lastVisible + this.overscan + 1),
      firstVisible,
      lastVisible
    };
  }
  get baseContentSize() {
    return Math.max(0, this.sizes.total - (this.itemCount > 0 ? this.gap : 0));
  }
  baseOffsetAt(index) {
    return this.sizes.prefix(clamp(Math.trunc(index), 0, this.itemCount));
  }
  groupOrdinal(index) {
    return Math.max(-1, upperBoundNumber(this.groupStarts, index) - 1);
  }
};
var VirtualGridModel = class _VirtualGridModel {
  constructor(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    this.placements = [];
    this.lanes = [];
    this.regularRows = null;
    this.headerPlacements = [];
    this.mainExtent = 0;
    assertCount(options.itemCount);
    this.count = options.itemCount;
    this.viewportMain = assertExtent(options.viewportMainSize);
    this.viewportCross = assertExtent(options.viewportCrossSize);
    this.laneCount = Math.max(1, Math.trunc(options.lanes));
    this.fixedSize = options.cellSize === void 0 ? void 0 : assertExtent(options.cellSize);
    this.estimate = (_a = this.fixedSize) !== null && _a !== void 0 ? _a : assertExtent((_b = options.estimatedCellSize) !== null && _b !== void 0 ? _b : 0);
    this.mainGap = assertExtent((_c = options.mainGap) !== null && _c !== void 0 ? _c : 0, true);
    this.crossGap = assertExtent((_d = options.crossGap) !== null && _d !== void 0 ? _d : 0, true);
    this.overscan = Math.max(0, Math.trunc((_e = options.overscan) !== null && _e !== void 0 ? _e : 1));
    this.mode = (_f = options.mode) !== null && _f !== void 0 ? _f : "regular";
    this.groupStarts = normalizeGroupStarts((_g = options.groupStarts) !== null && _g !== void 0 ? _g : [], this.count);
    this.headerSize = this.groupStarts.length > 0 ? assertExtent((_h = options.headerSize) !== null && _h !== void 0 ? _h : 0) : 0;
    this.measured = new Array(this.count).fill(this.estimate);
    this.rebuild();
  }
  /** Incremental append path used by masonry data sources. */
  appendItems(count) {
    var _a;
    assertCount(count);
    if (count === 0)
      return;
    if (this.mode !== "masonry" || this.groupStarts.length > 0) {
      this.setItemCount(this.count + count);
      return;
    }
    const previousCount = this.count;
    this.count += count;
    while (this.measured.length < this.count)
      this.measured.push(this.estimate);
    this.placements.length = this.count;
    const crossSize = this.crossSize();
    const laneEnds = this.lanes.map((lane) => {
      const last = lane[lane.length - 1];
      return last ? last.mainOffset + last.mainSize + this.mainGap : 0;
    });
    for (let index = previousCount; index < this.count; index++) {
      let lane = 0;
      for (let candidate = 1; candidate < laneEnds.length; candidate++) {
        if (laneEnds[candidate] < laneEnds[lane])
          lane = candidate;
      }
      const size = (_a = this.fixedSize) !== null && _a !== void 0 ? _a : this.measured[index];
      const placement = {
        index,
        lane,
        mainOffset: laneEnds[lane],
        crossOffset: lane * (crossSize + this.crossGap),
        mainSize: size,
        crossSize
      };
      this.placements[index] = placement;
      this.lanes[lane].push(placement);
      laneEnds[lane] += size + this.mainGap;
    }
    this.mainExtent = Math.max(0, ...laneEnds) - this.mainGap;
  }
  spliceItems(index, deleteCount, insertCount) {
    assertCount(insertCount);
    const start = clamp(Math.trunc(index), 0, this.count);
    const removed = clamp(Math.trunc(deleteCount), 0, this.count - start);
    if (removed === 0 && start === this.count && this.mode === "masonry" && this.groupStarts.length === 0) {
      this.appendItems(insertCount);
      return;
    }
    this.measured.splice(start, removed, ...new Array(insertCount).fill(this.estimate));
    this.count = this.count - removed + insertCount;
    this.groupStarts = normalizeGroupStarts(this.groupStarts, this.count);
    if (this.mode === "masonry" && this.groupStarts.length === 0) {
      const checkpoint = Math.floor(start / _VirtualGridModel.MASONRY_CHECKPOINT_INTERVAL) * _VirtualGridModel.MASONRY_CHECKPOINT_INTERVAL;
      this.rebuildMasonryFrom(checkpoint);
    } else {
      this.rebuild();
    }
  }
  get itemCount() {
    return this.count;
  }
  get contentSize() {
    return this.mainExtent;
  }
  get lanesCount() {
    return this.laneCount;
  }
  get placementCount() {
    return this.count;
  }
  groupHeaders() {
    return this.headerPlacements;
  }
  headerOffsetForIndex(index) {
    var _a, _b;
    var _c, _d;
    const candidate = upperBoundNumber(this.groupStarts, index) - 1;
    const ordinal = this.groupStarts[candidate] === index ? candidate : -1;
    return ordinal >= 0 ? (_c = (_a = this.headerPlacements[ordinal]) === null || _a === void 0 ? void 0 : _a.mainOffset) !== null && _c !== void 0 ? _c : 0 : (_d = (_b = this.placementAt(index)) === null || _b === void 0 ? void 0 : _b.mainOffset) !== null && _d !== void 0 ? _d : 0;
  }
  setViewport(main, cross, lanes = this.laneCount) {
    const nextMain = assertExtent(main);
    const nextCross = assertExtent(cross);
    const nextLanes = Math.max(1, Math.trunc(lanes));
    if (nextMain === this.viewportMain && nextCross === this.viewportCross && nextLanes === this.laneCount)
      return false;
    this.viewportMain = nextMain;
    this.viewportCross = nextCross;
    this.laneCount = nextLanes;
    this.rebuild();
    return true;
  }
  setItemCount(count) {
    assertCount(count);
    if (count === this.count)
      return;
    this.count = count;
    if (this.measured.length > count)
      this.measured.length = count;
    else
      while (this.measured.length < count)
        this.measured.push(this.estimate);
    this.groupStarts = normalizeGroupStarts(this.groupStarts, count);
    this.rebuild();
  }
  setGroups(starts, headerSize) {
    const nextStarts = normalizeGroupStarts(starts, this.count);
    const nextHeader = nextStarts.length > 0 ? assertExtent(headerSize) : 0;
    if (nextHeader === this.headerSize && equalNumbers(nextStarts, this.groupStarts))
      return false;
    this.groupStarts = nextStarts;
    this.headerSize = nextHeader;
    this.rebuild();
    return true;
  }
  updateSize(index, mainSize) {
    if (this.fixedSize !== void 0 || index < 0 || index >= this.count)
      return false;
    const next = assertExtent(mainSize);
    if (this.measured[index] === next)
      return false;
    this.measured[index] = next;
    if (this.mode === "regular" && this.regularRows && this.groupStarts.length === 0) {
      const row = Math.floor(index / this.laneCount);
      const rowStart = row * this.laneCount;
      let rowSize = 0;
      for (let cursor = rowStart; cursor < Math.min(this.count, rowStart + this.laneCount); cursor++) {
        rowSize = Math.max(rowSize, this.measured[cursor]);
      }
      this.regularRows.set(row, rowSize + this.mainGap);
      this.mainExtent = Math.max(0, this.regularRows.total - (this.count > 0 ? this.mainGap : 0));
    } else if (this.mode === "masonry" && this.groupStarts.length === 0) {
      const checkpoint = Math.floor(index / _VirtualGridModel.MASONRY_CHECKPOINT_INTERVAL) * _VirtualGridModel.MASONRY_CHECKPOINT_INTERVAL;
      this.rebuildMasonryFrom(checkpoint);
    } else {
      this.rebuild();
    }
    return true;
  }
  /** Apply exact source extents in one rebuild, independent of visited windows. */
  setSizes(sizes) {
    if (this.fixedSize !== void 0)
      throw new Error("Fixed-size grids cannot accept source sizes.");
    if (sizes.length !== this.count)
      throw new Error("Grid size count must match item count.");
    const next = sizes.map((size) => assertExtent(size));
    if (equalNumbers(next, this.measured))
      return;
    this.measured = next;
    this.rebuild();
  }
  placementAt(index) {
    if (index < 0 || index >= this.count)
      return void 0;
    return this.mode === "regular" && this.groupStarts.length === 0 ? this.regularPlacement(index) : this.placements[index];
  }
  visible(offset) {
    var _a;
    const start = Math.max(0, offset - this.overscan * (this.estimate + this.mainGap));
    const end = offset + this.viewportMain + this.overscan * (this.estimate + this.mainGap);
    if (this.mode === "regular" && this.groupStarts.length === 0) {
      if (this.count === 0)
        return [];
      const rowCount = Math.ceil(this.count / this.laneCount);
      const stride = ((_a = this.fixedSize) !== null && _a !== void 0 ? _a : 0) + this.mainGap;
      const firstVisibleRow = this.fixedSize !== void 0 ? Math.floor(Math.max(0, offset) / stride) : this.regularRows.indexAtOffset(Math.max(0, offset));
      const lastVisibleRow = this.fixedSize !== void 0 ? Math.floor(Math.max(0, offset + this.viewportMain - 1e-4) / stride) : this.regularRows.indexAtOffset(Math.max(0, offset + this.viewportMain - 1e-4));
      const firstRow = Math.max(0, firstVisibleRow - this.overscan);
      const lastRow = Math.min(rowCount - 1, lastVisibleRow + this.overscan);
      const result2 = [];
      for (let row = firstRow; row <= lastRow; row++) {
        const startIndex = row * this.laneCount;
        for (let lane = 0; lane < this.laneCount && startIndex + lane < this.count; lane++) {
          result2.push(this.regularPlacement(startIndex + lane));
        }
      }
      return result2;
    }
    const result = [];
    for (const lane of this.lanes) {
      let index = lowerBoundPlacement(lane, start);
      while (index < lane.length && lane[index].mainOffset <= end)
        result.push(lane[index++]);
    }
    result.sort((a, b) => a.index - b.index);
    return result;
  }
  rebuild() {
    var _a;
    this.placements = this.mode === "masonry" || this.groupStarts.length > 0 ? new Array(this.count) : [];
    this.lanes = Array.from({ length: this.laneCount }, () => []);
    this.regularRows = null;
    this.headerPlacements = [];
    const crossSize = this.crossSize();
    if (this.groupStarts.length > 0) {
      this.rebuildGrouped(crossSize);
      return;
    }
    if (this.mode === "masonry") {
      const laneEnds = new Array(this.laneCount).fill(0);
      for (let index = 0; index < this.count; index++) {
        let lane = 0;
        for (let candidate = 1; candidate < laneEnds.length; candidate++) {
          if (laneEnds[candidate] < laneEnds[lane])
            lane = candidate;
        }
        const size = (_a = this.fixedSize) !== null && _a !== void 0 ? _a : this.measured[index];
        const placement = {
          index,
          lane,
          mainOffset: laneEnds[lane],
          crossOffset: lane * (crossSize + this.crossGap),
          mainSize: size,
          crossSize
        };
        this.placements[index] = placement;
        this.lanes[lane].push(placement);
        laneEnds[lane] += size + this.mainGap;
      }
      this.mainExtent = Math.max(0, ...laneEnds) - (this.count > 0 ? this.mainGap : 0);
      return;
    }
    const rowCount = Math.ceil(this.count / this.laneCount);
    if (this.fixedSize !== void 0) {
      this.mainExtent = Math.max(0, rowCount * (this.fixedSize + this.mainGap) - (rowCount > 0 ? this.mainGap : 0));
      return;
    }
    this.regularRows = new FenwickTree(rowCount, 0);
    for (let rowStart = 0; rowStart < this.count; rowStart += this.laneCount) {
      let rowSize = 0;
      for (let lane = 0; lane < this.laneCount && rowStart + lane < this.count; lane++) {
        rowSize = Math.max(rowSize, this.measured[rowStart + lane]);
      }
      this.regularRows.set(Math.floor(rowStart / this.laneCount), rowSize + this.mainGap);
    }
    this.mainExtent = Math.max(0, this.regularRows.total - (this.count > 0 ? this.mainGap : 0));
  }
  regularPlacement(index) {
    var _a;
    const row = Math.floor(index / this.laneCount);
    const lane = index % this.laneCount;
    const crossSize = this.crossSize();
    const mainSize = (_a = this.fixedSize) !== null && _a !== void 0 ? _a : Math.max(0, this.regularRows.get(row) - this.mainGap);
    const mainOffset = this.fixedSize !== void 0 ? row * (this.fixedSize + this.mainGap) : this.regularRows.prefix(row);
    return {
      index,
      lane,
      mainOffset,
      crossOffset: lane * (crossSize + this.crossGap),
      mainSize,
      crossSize
    };
  }
  rebuildMasonryFrom(checkpoint) {
    var _a;
    const safeCheckpoint = clamp(Math.trunc(checkpoint), 0, this.count);
    const crossSize = this.crossSize();
    if (this.lanes.length !== this.laneCount || this.placements.length === 0) {
      this.rebuild();
      return;
    }
    this.placements.length = this.count;
    this.regularRows = null;
    this.headerPlacements = [];
    const laneEnds = this.lanes.map((lane) => {
      lane.length = lowerBoundPlacementIndex(lane, safeCheckpoint);
      const last = lane[lane.length - 1];
      return last ? last.mainOffset + last.mainSize + this.mainGap : 0;
    });
    for (let index = safeCheckpoint; index < this.count; index++) {
      let lane = 0;
      for (let candidate = 1; candidate < laneEnds.length; candidate++) {
        if (laneEnds[candidate] < laneEnds[lane])
          lane = candidate;
      }
      const size = (_a = this.fixedSize) !== null && _a !== void 0 ? _a : this.measured[index];
      const placement = this.placements[index];
      const next = placement !== null && placement !== void 0 ? placement : {
        index,
        lane,
        mainOffset: 0,
        crossOffset: 0,
        mainSize: size,
        crossSize
      };
      next.index = index;
      next.lane = lane;
      next.mainOffset = laneEnds[lane];
      next.crossOffset = lane * (crossSize + this.crossGap);
      next.mainSize = size;
      next.crossSize = crossSize;
      this.placements[index] = next;
      this.lanes[lane].push(next);
      laneEnds[lane] += size + this.mainGap;
    }
    this.mainExtent = Math.max(0, ...laneEnds) - (this.count > 0 ? this.mainGap : 0);
  }
  crossSize() {
    return Math.max(0, (this.viewportCross - this.crossGap * (this.laneCount - 1)) / this.laneCount);
  }
  rebuildGrouped(crossSize) {
    var _a, _b, _c;
    let baseline = 0;
    for (let ordinal = 0; ordinal < this.groupStarts.length; ordinal++) {
      const start = this.groupStarts[ordinal];
      const end = (_a = this.groupStarts[ordinal + 1]) !== null && _a !== void 0 ? _a : this.count;
      this.headerPlacements.push({ firstIndex: start, mainOffset: baseline });
      const itemBaseline = baseline + this.headerSize;
      if (this.mode === "masonry") {
        const laneEnds = new Array(this.laneCount).fill(itemBaseline);
        for (let index = start; index < end; index++) {
          let lane = 0;
          for (let candidate = 1; candidate < laneEnds.length; candidate++) {
            if (laneEnds[candidate] < laneEnds[lane])
              lane = candidate;
          }
          const size = (_b = this.fixedSize) !== null && _b !== void 0 ? _b : this.measured[index];
          const placement = {
            index,
            lane,
            mainOffset: laneEnds[lane],
            crossOffset: lane * (crossSize + this.crossGap),
            mainSize: size,
            crossSize
          };
          this.placements[index] = placement;
          this.lanes[lane].push(placement);
          laneEnds[lane] += size + this.mainGap;
        }
        baseline = Math.max(0, ...laneEnds) - (end > start ? this.mainGap : 0);
        continue;
      }
      let main = itemBaseline;
      for (let rowStart = start; rowStart < end; rowStart += this.laneCount) {
        let rowSize = 0;
        for (let lane = 0; lane < this.laneCount && rowStart + lane < end; lane++) {
          rowSize = Math.max(rowSize, (_c = this.fixedSize) !== null && _c !== void 0 ? _c : this.measured[rowStart + lane]);
        }
        for (let lane = 0; lane < this.laneCount && rowStart + lane < end; lane++) {
          const index = rowStart + lane;
          const placement = {
            index,
            lane,
            mainOffset: main,
            crossOffset: lane * (crossSize + this.crossGap),
            mainSize: rowSize,
            crossSize
          };
          this.placements[index] = placement;
          this.lanes[lane].push(placement);
        }
        main += rowSize + this.mainGap;
      }
      baseline = Math.max(itemBaseline, main - (end > start ? this.mainGap : 0));
    }
    this.mainExtent = baseline;
  }
};
VirtualGridModel.MASONRY_CHECKPOINT_INTERVAL = 64;
function computeStickyHeader(source, groupOf, itemOffset, scrollOffset, headerSize, groupStarts) {
  if (source.length === 0)
    return null;
  if (groupStarts === null || groupStarts === void 0 ? void 0 : groupStarts.length) {
    let low = 0, high = groupStarts.length;
    while (low < high) {
      const middle = low + high >>> 1;
      if (itemOffset(groupStarts[middle]) <= scrollOffset)
        low = middle + 1;
      else
        high = middle;
    }
    const ordinal = Math.max(0, low - 1), firstIndex = groupStarts[ordinal];
    const next = groupStarts[ordinal + 1];
    const nextOffset2 = next === void 0 ? Number.POSITIVE_INFINITY : itemOffset(next) - scrollOffset;
    return {
      group: groupOf(source.get(firstIndex)),
      firstIndex,
      offset: Math.min(0, nextOffset2 - assertExtent(headerSize))
    };
  }
  let active = 0;
  for (let index = 1; index < source.length; index++) {
    if (itemOffset(index) > scrollOffset)
      break;
    if (!Object.is(groupOf(source.get(index - 1)), groupOf(source.get(index))))
      active = index;
  }
  const group = groupOf(source.get(active));
  let nextOffset = Number.POSITIVE_INFINITY;
  for (let index = active + 1; index < source.length; index++) {
    if (!Object.is(group, groupOf(source.get(index)))) {
      nextOffset = itemOffset(index) - scrollOffset;
      break;
    }
  }
  return {
    group,
    firstIndex: active,
    offset: Math.min(0, nextOffset - assertExtent(headerSize))
  };
}
function lowerBoundPlacement(values, offset) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if (values[middle].mainOffset + values[middle].mainSize < offset)
      low = middle + 1;
    else
      high = middle;
  }
  return low;
}
function lowerBoundPlacementIndex(values, itemIndex) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if (values[middle].index < itemIndex)
      low = middle + 1;
    else
      high = middle;
  }
  return low;
}
function assertCount(value) {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError(`itemCount must be a non-negative integer: ${value}`);
}
function assertExtent(value, allowZero = false) {
  if (!Number.isFinite(value) || value < 0 || !allowZero && value === 0) {
    throw new RangeError(`extent must be ${allowZero ? "non-negative" : "positive"}: ${value}`);
  }
  return value;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function normalizeGroupStarts(starts, count) {
  if (count === 0 || starts.length === 0)
    return [];
  const result = [
    ...new Set(starts.filter((value) => Number.isInteger(value) && value >= 0 && value < count).map((value) => Math.trunc(value)))
  ].sort((a, b) => a - b);
  if (result[0] !== 0)
    result.unshift(0);
  return result;
}
function equalNumbers(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function upperBoundNumber(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if (values[middle] <= target)
      low = middle + 1;
    else
      high = middle;
  }
  return low;
}

// frontend/packages/core/dist/runtime/runtime.js
function queueRuntimeMicrotask(callback) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }
  void Promise.resolve().then(callback).catch((error) => {
    setTimeout(() => {
      throw error;
    }, 0);
  });
}
function resolveStyleValue(style, property) {
  if (Array.isArray(style)) {
    for (let index = style.length - 1; index >= 0; index--) {
      const value2 = resolveStyleValue(style[index], property);
      if (value2 !== void 0)
        return value2;
    }
    return void 0;
  }
  if (style === null || typeof style !== "object")
    return void 0;
  const value = style[property];
  return value === void 0 ? void 0 : value;
}
var activeInstance = null;
var activeHookId = -1;
var globalBatchDepth = 0;
var globallyBatched = /* @__PURE__ */ new Set();
var hotInstancesByFamily = /* @__PURE__ */ new Map();
var latestHotDefinitions = /* @__PURE__ */ new Map();
var latestHotRevision = 0;
var hotStagingDepth = 0;
var runtimeHotAdapter;
function enableComponentHMR() {
  runtimeHotAdapter !== null && runtimeHotAdapter !== void 0 ? runtimeHotAdapter : runtimeHotAdapter = {
    resolve: resolveLatestHotDefinition,
    register: registerHotInstance,
    unregister: unregisterHotInstance,
    applyPending: applyPendingHotDefinition,
    schedulePending: schedulePendingHotDefinition
  };
}
function defineCompiledComponent(plan, evaluate2, repeatEvaluators, components, hot) {
  if (plan.version !== 5)
    throw new Error(`Unsupported HostPlan version: ${plan.version}`);
  freezePlan(plan.root);
  if (plan.components)
    Object.freeze(plan.components);
  freezeModuleInfo(plan.moduleInfo);
  if (plan.tabModules) {
    for (const tabs of Object.values(plan.tabModules)) {
      for (const info of Object.values(tabs))
        freezeModuleInfo(info);
      Object.freeze(tabs);
    }
    Object.freeze(plan.tabModules);
  }
  if (plan.tabTargets) {
    for (const group of Object.values(plan.tabTargets)) {
      for (const target of Object.values(group.targets))
        Object.freeze(target);
      Object.freeze(group.targets);
      Object.freeze(group);
    }
    Object.freeze(plan.tabTargets);
  }
  Object.freeze(plan.sourceMap);
  Object.freeze(plan);
  if (repeatEvaluators)
    Object.freeze(repeatEvaluators);
  if (hot === null || hot === void 0 ? void 0 : hot.inlineFamilies)
    Object.freeze(hot.inlineFamilies);
  if (hot)
    Object.freeze(hot);
  return Object.freeze({ plan, evaluate: evaluate2, repeatEvaluators, components, hot });
}
function applyHotUpdate(update) {
  var _a;
  if (update.version !== 1)
    throw new Error(`Unsupported HotUpdate version: ${update.version}`);
  if (!Number.isSafeInteger(update.revision) || update.revision <= 0)
    throw new Error(`Invalid HotUpdate revision: ${update.revision}`);
  if (update.revision <= latestHotRevision) {
    return {
      revision: update.revision,
      ignored: true,
      patchedInstances: 0,
      remountedInstances: 0,
      deferredInstances: 0,
      createdNodes: 0,
      destroyedNodes: 0
    };
  }
  const definitions = /* @__PURE__ */ new Map();
  for (const component of update.components)
    collectHotDefinitions(component, definitions);
  const changedFamilies = new Set(update.changedFamilies);
  const previousDefinitions = /* @__PURE__ */ new Map();
  for (const [familyId, component] of definitions) {
    previousDefinitions.set(familyId, latestHotDefinitions.get(familyId));
    latestHotDefinitions.set(familyId, component);
  }
  const targets = /* @__PURE__ */ new Map();
  for (const instances of hotInstancesByFamily.values()) {
    for (const instance of instances) {
      if (instance.destroyed)
        continue;
      const metadata = instance.component.hot;
      if (!metadata)
        continue;
      const directlyChanged = changedFamilies.has(metadata.familyId);
      const inlinedChanged = (_a = metadata.inlineFamilies) === null || _a === void 0 ? void 0 : _a.some((familyId) => changedFamilies.has(familyId));
      if (!directlyChanged && !inlinedChanged)
        continue;
      const replacement = definitions.get(metadata.familyId);
      if (replacement)
        targets.set(instance, replacement);
    }
  }
  const deferred = [];
  const activeTargets = [];
  for (const [instance, replacement] of targets) {
    if (instance.suspended || instance.owner.suspended) {
      deferred.push({ instance, previous: instance.hotPending });
      instance.hotPending = replacement;
    } else
      activeTargets.push([instance, replacement]);
  }
  try {
    const result = applyHotTargets(activeTargets);
    latestHotRevision = update.revision;
    return {
      revision: update.revision,
      ignored: false,
      patchedInstances: result.patchedInstances,
      remountedInstances: result.remountedInstances,
      deferredInstances: deferred.length,
      createdNodes: result.createdNodes,
      destroyedNodes: result.destroyedNodes
    };
  } catch (error) {
    for (const { instance, previous } of deferred)
      instance.hotPending = previous;
    for (const [familyId, previous] of previousDefinitions) {
      if (previous)
        latestHotDefinitions.set(familyId, previous);
      else
        latestHotDefinitions.delete(familyId);
    }
    throw error;
  }
}
function resetHotDefinitionsForRootRestart() {
  const previous = new Map(latestHotDefinitions);
  latestHotDefinitions.clear();
  return () => {
    latestHotDefinitions.clear();
    for (const [family, component] of previous)
      latestHotDefinitions.set(family, component);
  };
}
function mountComponent(component, driver, props, runtimeOptions = {}) {
  var _a;
  component = resolveRuntimeHotDefinition(component);
  const slots = new Array(component.plan.slotCount);
  const rootScope = {
    path: component.plan.name,
    items: [],
    indices: [],
    slots,
    previousSlots: new Array(component.plan.slotCount),
    recordsByPlanId: /* @__PURE__ */ new Map(),
    repeats: /* @__PURE__ */ new Map(),
    virtuals: /* @__PURE__ */ new Map(),
    components: /* @__PURE__ */ new Map()
  };
  const instance = {
    component,
    driver,
    slots,
    previousSlots: rootScope.previousSlots,
    rootScope,
    hooks: /* @__PURE__ */ new Map(),
    commands: [],
    layoutEffects: [],
    effects: [],
    metrics: {
      commits: 0,
      commands: 0,
      nodesCreated: 0,
      nodesDestroyed: 0,
      componentUpdates: 0
    },
    props,
    root: void 0,
    scheduled: false,
    destroyed: false,
    batchDepth: 0,
    nextRecordId: 1,
    flushQueued: false,
    suspended: false,
    environment: /* @__PURE__ */ Object.create(null),
    dirtyScopes: /* @__PURE__ */ new Set(),
    runtimeOptions: Object.freeze(Object.assign({}, runtimeOptions)),
    preparedModuleKeys: /* @__PURE__ */ new Set(),
    owner: void 0,
    dirtyComponents: /* @__PURE__ */ new Set(),
    rootDirty: false
  };
  instance.owner = instance;
  try {
    evaluate(instance);
    instance.root = instantiatePlan(instance, component.plan.root, null, 0, rootScope);
    syncStructures(instance, component.plan.root, rootScope);
    copySlots(instance.slots, instance.previousSlots);
    commit(instance);
    registerRuntimeHotInstance(instance);
  } catch (error) {
    instance.destroyed = true;
    disposeScope(rootScope);
    for (const hook of instance.hooks.values()) {
      try {
        (_a = hook.cleanup) === null || _a === void 0 ? void 0 : _a.call(hook);
      } catch (_b) {
      }
    }
    throw error;
  }
  const handle = {
    get root() {
      return instance.root;
    },
    get metrics() {
      return instance.metrics;
    },
    update(nextProps) {
      if (nextProps !== void 0)
        instance.props = nextProps;
      requestUpdate(instance);
    },
    batch(action) {
      instance.batchDepth++;
      try {
        action();
      } finally {
        instance.batchDepth--;
        if (instance.batchDepth === 0 && instance.scheduled) {
          if (globalBatchDepth > 0)
            globallyBatched.add(instance);
          else
            schedule(instance);
        }
      }
    },
    flushNow() {
      flush(instance);
    },
    setSuspended(suspended) {
      if (instance.destroyed || instance.suspended === suspended)
        return;
      instance.suspended = suspended;
      if (suspended) {
        suspendVirtualSubtree(instance.root, false);
        return;
      }
      applyPendingRuntimeHotDefinition(instance);
      if (instance.scheduled)
        flush(instance);
    },
    destroy() {
      destroyInstance(instance);
    }
  };
  return handle;
}
function useState(hookId, initial) {
  const instance = requireInstance();
  assertHookId(hookId);
  let hook = readHook(instance, hookId, "state");
  if (!hook) {
    hook = {
      kind: "state",
      value: typeof initial === "function" ? initial() : initial
    };
    instance.hooks.set(hookId, hook);
  }
  if (!hook.setter) {
    hook.setter = (next) => {
      const previous = hook.value;
      const value = typeof next === "function" ? next(previous) : next;
      if (Object.is(previous, value))
        return;
      hook.value = value;
      requestUpdate(instance);
    };
  }
  return [hook.value, hook.setter];
}
function useTabs(hookId, initialKey, onSelectionChange) {
  var _a, _b;
  const instance = requireInstance();
  assertHookId(hookId);
  let hook = readHook(instance, hookId, "tabs");
  if (!hook) {
    if (!initialKey)
      throw new Error("Initial tab key must not be empty.");
    const record2 = {
      selection: createState({ selectedKey: initialKey }),
      onSelectionChange,
      controller: void 0,
      requestedKey: initialKey,
      pending: /* @__PURE__ */ new Map(),
      navigationBacked: false
    };
    const commit2 = (key) => {
      var _a2;
      if (instance.destroyed || Object.is(record2.selection.selectedKey, key))
        return;
      record2.selection.selectedKey = key;
      record2.requestedKey = key;
      requestUpdate(instance);
      (_a2 = record2.onSelectionChange) === null || _a2 === void 0 ? void 0 : _a2.call(record2, key);
    };
    record2.controller = Object.freeze({
      get selectedKey() {
        return record2.selection.selectedKey;
      },
      select(key) {
        var _a2, _b2;
        if (!key)
          return;
        record2.requestedKey = key;
        if (Object.is(record2.selection.selectedKey, key) && (!record2.navigationBacked || record2.pending.size === 0))
          return;
        const info = (_b2 = (_a2 = instance.component.plan.tabModules) === null || _a2 === void 0 ? void 0 : _a2[hookId]) === null || _b2 === void 0 ? void 0 : _b2[key];
        const prepared = !info || instance.owner.preparedModuleKeys.has(moduleInfoKey(info));
        if (prepared && !record2.navigationBacked) {
          commit2(key);
          return;
        }
        let selection = record2.pending.get(key);
        if (!selection) {
          let activationStarted = false;
          const prepare = prepared ? Promise.resolve() : invokeModulePreparer(instance, info);
          selection = promiseFinally(prepare.then(async () => {
            if (record2.requestedKey !== key || instance.destroyed)
              return;
            if (record2.navigationBacked) {
              activationStarted = true;
              await instance.runtimeOptions.tabs.activate(instance.component.plan.name, hookId, key);
            }
            if (record2.requestedKey !== key || instance.destroyed)
              return;
            commit2(key);
          }).catch(async (error) => {
            var _a3;
            if (!isNavigationCancellation(error) && (!activationStarted || !((_a3 = instance.runtimeOptions.tabs) === null || _a3 === void 0 ? void 0 : _a3.reportsActivationErrors)) && record2.requestedKey === key && !instance.destroyed)
              await reportRuntimeError(instance, error);
          }), () => {
            if (record2.pending.get(key) === selection)
              record2.pending.delete(key);
          });
          record2.pending.set(key, selection);
        }
        return selection;
      }
    });
    const unregister = (_b = (_a = instance.runtimeOptions.tabs) === null || _a === void 0 ? void 0 : _a.register) === null || _b === void 0 ? void 0 : _b.call(_a, instance.component.plan.name, hookId, {
      controller: record2.controller,
      sync: (key) => commit2(key)
    });
    if (typeof unregister === "function") {
      record2.navigationBacked = true;
      record2.unregister = unregister;
    }
    hook = { kind: "tabs", value: record2, cleanup: () => {
      var _a2;
      return (_a2 = record2.unregister) === null || _a2 === void 0 ? void 0 : _a2.call(record2);
    } };
    instance.hooks.set(hookId, hook);
  }
  const record = hook.value;
  record.onSelectionChange = onSelectionChange;
  return record.controller;
}
function invokeModulePreparer(instance, info) {
  const prepare = instance.runtimeOptions.prepareModule;
  if (!prepare)
    return Promise.reject(new Error(`UI module preparer is missing for ${instance.component.plan.name}`));
  try {
    return Promise.resolve(prepare(info)).then(() => {
      instance.owner.preparedModuleKeys.add(moduleInfoKey(info));
    });
  } catch (error) {
    return Promise.reject(error);
  }
}
async function reportRuntimeError(instance, error) {
  var _a, _b;
  try {
    await ((_b = (_a = instance.runtimeOptions).onActionError) === null || _b === void 0 ? void 0 : _b.call(_a, error));
  } catch (_c) {
  }
}
function isNavigationCancellation(error) {
  return error instanceof Error && error.name === "NavigationCancelledError";
}
function useSurfaceContext(hookId) {
  const instance = requireInstance();
  assertHookId(hookId);
  ensureMarkerHook(instance, hookId, "surface-context");
  const context = instance.owner.props;
  if (typeof context !== "object" || context === null || typeof context.open !== "function" || typeof context.goto !== "function" || typeof context.back !== "function" || typeof context.complete !== "function")
    throw new Error("useSurfaceContext requires a component mounted below defineView.");
  return context;
}
function useNavigationContext(hookId) {
  const instance = requireInstance();
  assertHookId(hookId);
  ensureMarkerHook(instance, hookId, "navigation-context");
  const context = instance.owner.props;
  if (typeof context !== "object" || context === null || typeof context.open !== "function" || typeof context.goto !== "function")
    throw new Error("useNavigationContext requires a component mounted below defineView or defineLayer.");
  return context;
}
function useRef(hookId, initial) {
  const instance = requireInstance();
  assertHookId(hookId);
  let hook = readHook(instance, hookId, "ref");
  if (!hook) {
    hook = { kind: "ref", value: { current: initial } };
    instance.hooks.set(hookId, hook);
  }
  return hook.value;
}
function useAction(hookId, execute, options = {}) {
  const instance = requireInstance();
  assertHookId(hookId);
  let hook = readHook(instance, hookId, "action");
  if (!hook) {
    const record2 = {
      execute,
      options,
      action: void 0,
      state: createState({
        status: "idle",
        result: void 0,
        error: void 0
      }),
      generation: 0,
      disposed: false
    };
    const action = ((...arguments_) => {
      if (record2.disposed || record2.state.status === "pending")
        return;
      const generation = ++record2.generation;
      const invocationOptions = record2.options;
      const invocationExecute = record2.execute;
      const input = arguments_[0];
      record2.state.status = "pending";
      record2.state.result = void 0;
      record2.state.error = void 0;
      requestUpdate(instance);
      let operation;
      try {
        operation = invocationExecute(...arguments_);
      } catch (error) {
        void settleActionError(instance, record2, generation, invocationOptions, input, error);
        return;
      }
      void Promise.resolve(operation).then((result) => settleActionSuccess(instance, record2, generation, invocationOptions, input, result), (error) => settleActionError(instance, record2, generation, invocationOptions, input, error));
    });
    Object.defineProperties(action, {
      status: { enumerable: true, get: () => record2.state.status },
      pending: { enumerable: true, get: () => record2.state.status === "pending" },
      result: { enumerable: true, get: () => record2.state.result },
      error: { enumerable: true, get: () => record2.state.error },
      reset: {
        enumerable: true,
        value: () => {
          if (record2.disposed || record2.state.status === "pending")
            return;
          if (record2.state.status === "idle" && record2.state.result === void 0 && record2.state.error === void 0)
            return;
          record2.state.status = "idle";
          record2.state.result = void 0;
          record2.state.error = void 0;
          requestUpdate(instance);
        }
      }
    });
    record2.action = Object.freeze(action);
    hook = {
      kind: "action",
      value: record2,
      cleanup: () => {
        record2.disposed = true;
        record2.generation++;
      }
    };
    instance.hooks.set(hookId, hook);
  }
  const record = hook.value;
  record.execute = execute;
  record.options = options;
  return record.action;
}
function useMemo(hookId, factory, deps) {
  const instance = requireInstance();
  assertHookId(hookId);
  let hook = readHook(instance, hookId, "memo");
  if (!hook || !sameDeps(hook.deps, deps)) {
    hook = { kind: "memo", value: factory(), deps: deps.slice() };
    instance.hooks.set(hookId, hook);
  }
  return hook.value;
}
function useEffect(hookId, effect, deps) {
  registerEffect(hookId, effect, deps, false);
}
function useLayoutEffect(hookId, effect, deps) {
  registerEffect(hookId, effect, deps, true);
}
function batch(action) {
  globalBatchDepth++;
  try {
    action();
  } finally {
    globalBatchDepth--;
    if (globalBatchDepth === 0) {
      for (const instance of globallyBatched)
        schedule(instance);
      globallyBatched.clear();
    }
  }
}
function Show(when, render, fallback) {
  if (when !== null && when !== void 0 && when !== false)
    render(when);
  else
    fallback === null || fallback === void 0 ? void 0 : fallback();
}
var KeyedFor = class {
  constructor() {
    this.entries = /* @__PURE__ */ new Map();
    this.order = [];
  }
  forEach(visit) {
    for (const entry of this.entries.values())
      visit(entry.record);
  }
  dispose(disposeRecord) {
    for (const entry of this.entries.values())
      disposeRecord(entry.record);
    this.entries.clear();
    this.order.length = 0;
  }
  reconcile(values, keyOf, create, update, destroy, recycleRemoved = false) {
    const nextOrder = values.map(keyOf);
    const seen = /* @__PURE__ */ new Set();
    for (const key of nextOrder) {
      if (seen.has(key))
        throw new Error(`Duplicate keyed For value: ${String(key)}`);
      seen.add(key);
    }
    const recyclable = recycleRemoved ? this.order.filter((key) => !seen.has(key)).map((key) => this.entries.get(key)).filter((entry) => entry !== void 0) : [];
    const output = [];
    for (let index = 0; index < values.length; index++) {
      const value = values[index];
      const key = nextOrder[index];
      let entry = this.entries.get(key);
      if (!entry) {
        const recycled = recyclable.shift();
        if (recycled) {
          this.entries.delete(recycled.key);
          entry = { key, value, record: recycled.record };
          update(entry.record, value, index);
        } else {
          entry = { key, value, record: create(value, index) };
        }
        this.entries.set(key, entry);
      } else {
        entry.value = value;
        update(entry.record, value, index);
      }
      output.push(entry);
    }
    for (const oldKey of this.order) {
      if (seen.has(oldKey))
        continue;
      const entry = this.entries.get(oldKey);
      if (entry)
        destroy(entry.record);
      this.entries.delete(oldKey);
    }
    this.order = nextOrder;
    return output;
  }
};
function instantiatePlan(instance, plan, parent, index, scope = instance.rootScope, allocation) {
  var _a, _b;
  var _c, _d, _e, _f;
  if (plan.kind === "component")
    return instantiateComponentPlan(instance, plan, parent, index, scope);
  if (!allocation)
    allocation = (_b = (_a = instance.driver).allocateTemplate) === null || _b === void 0 ? void 0 : _b.call(_a, instance.component.plan, plan);
  const slotValues = scope.slots;
  const recordMap = scope.recordsByPlanId;
  if (recordMap.has(plan.planId))
    throw new Error(`Duplicate planId ${plan.planId}`);
  const record = {
    recordId: instance.owner.nextRecordId++,
    planId: plan.planId,
    kind: plan.kind,
    behavior: plan.behavior,
    handle: allocation ? allocation.create(plan.planId) : instance.driver.create(plan.kind, plan.planId, plan.behavior),
    parent,
    children: [],
    props: Object.assign({}, (_c = plan.props) !== null && _c !== void 0 ? _c : {})
  };
  recordMap.set(plan.planId, record);
  instance.commands.push({ type: "create", record });
  instance.metrics.nodesCreated++;
  for (const binding of (_d = plan.bindings) !== null && _d !== void 0 ? _d : []) {
    record.props[binding.property] = slotValues[binding.slot];
  }
  for (const [property, value] of Object.entries(record.props)) {
    instance.commands.push({ type: "update", record, property, value });
  }
  instance.commands.push({ type: "insert", parent, child: record, index });
  if (plan.lazy) {
    const active = record.props.visible !== false;
    const prepared = plan.moduleInfo === void 0 || instance.owner.preparedModuleKeys.has(moduleInfoKey(plan.moduleInfo));
    const lazy = {
      materialized: active && prepared,
      active,
      prepared,
      attempted: false,
      generation: 0
    };
    ((_e = scope.lazyStates) !== null && _e !== void 0 ? _e : scope.lazyStates = /* @__PURE__ */ new Map()).set(plan.planId, lazy);
    queueRecordProperty(instance, record, "__lazy", true);
    if (active && !prepared)
      startLazyPreparation(instance, plan, lazy);
    if (!lazy.materialized)
      return record;
  }
  let childIndex = 0;
  for (const childPlan of (_f = plan.children) !== null && _f !== void 0 ? _f : []) {
    record.children.push(instantiatePlan(instance, childPlan, record, childIndex++, scope, allocation));
  }
  return record;
}
function instantiateComponentPlan(parentInstance, plan, parent, index, scope) {
  var _a;
  const declaredDefinition = (_a = parentInstance.component.components) === null || _a === void 0 ? void 0 : _a[plan.component];
  if (!declaredDefinition)
    throw new Error(`Unknown compiled component: ${plan.component}`);
  const definition = resolveRuntimeHotDefinition(declaredDefinition);
  if (scope.components.has(plan.planId))
    throw new Error(`Duplicate component planId ${plan.planId}`);
  const props = readComponentProps(plan, scope.slots);
  const owner = parentInstance.owner;
  const slots = new Array(definition.plan.slotCount);
  const rootScope = {
    path: `${scope.path}/${plan.component}:${plan.planId}`,
    items: scope.items,
    indices: scope.indices,
    slots,
    previousSlots: new Array(definition.plan.slotCount),
    recordsByPlanId: /* @__PURE__ */ new Map(),
    repeats: /* @__PURE__ */ new Map(),
    virtuals: /* @__PURE__ */ new Map(),
    components: /* @__PURE__ */ new Map()
  };
  const child = {
    component: definition,
    driver: owner.driver,
    slots,
    previousSlots: rootScope.previousSlots,
    rootScope,
    hooks: /* @__PURE__ */ new Map(),
    commands: owner.commands,
    layoutEffects: owner.layoutEffects,
    effects: owner.effects,
    metrics: owner.metrics,
    props,
    root: void 0,
    scheduled: false,
    destroyed: false,
    batchDepth: 0,
    nextRecordId: 0,
    flushQueued: false,
    suspended: owner.suspended,
    environment: /* @__PURE__ */ Object.create(null),
    dirtyScopes: /* @__PURE__ */ new Set(),
    runtimeOptions: owner.runtimeOptions,
    preparedModuleKeys: owner.preparedModuleKeys,
    owner,
    dirtyComponents: owner.dirtyComponents,
    rootDirty: false
  };
  try {
    evaluate(child);
    child.root = instantiatePlan(child, definition.plan.root, parent, index, rootScope);
    syncStructures(child, definition.plan.root, rootScope);
    copySlots(child.slots, child.previousSlots);
  } catch (error) {
    disposeComponentInstance(child);
    throw error;
  }
  scope.components.set(plan.planId, child);
  registerRuntimeHotInstance(child);
  return child.root;
}
function startLazyPreparation(instance, plan, state) {
  if (state.materialized || state.prepared || state.attempted || !state.active)
    return;
  const info = plan.moduleInfo;
  if (!info) {
    state.prepared = true;
    requestUpdate(instance);
    return;
  }
  state.attempted = true;
  const generation = ++state.generation;
  void invokeModulePreparer(instance, info).then(() => {
    if (instance.destroyed || !state.active || state.generation !== generation)
      return;
    state.prepared = true;
    requestUpdate(instance);
  }, async (error) => {
    if (instance.destroyed || !state.active || state.generation !== generation)
      return;
    await reportRuntimeError(instance, error);
  });
}
function moduleInfoKey(info) {
  return JSON.stringify([
    info.feature,
    info.features,
    info.configKeys,
    info.dataModules,
    info.services
  ]);
}
function readComponentProps(plan, slots) {
  var _a, _b;
  if (plan.propsSlot !== void 0) {
    const value = slots[plan.propsSlot];
    if (!isPlainRecord(value))
      throw new Error(`ComponentOutlet props slot ${plan.propsSlot} must be an object.`);
    return Object.assign({}, value);
  }
  const props = Object.assign({}, (_a = plan.props) !== null && _a !== void 0 ? _a : {});
  for (const binding of (_b = plan.bindings) !== null && _b !== void 0 ? _b : [])
    props[binding.property] = slots[binding.slot];
  return props;
}
function requestUpdate(instance, root = true) {
  if (instance.destroyed)
    return;
  instance.rootDirty || (instance.rootDirty = root);
  if (instance.suspended && instance !== instance.owner)
    return;
  const owner = instance.owner;
  owner.dirtyComponents.add(instance);
  owner.scheduled = true;
  if (globalBatchDepth > 0) {
    globallyBatched.add(owner);
  } else if (owner.batchDepth === 0) {
    schedule(owner);
  }
}
function schedule(instance) {
  const owner = instance.owner;
  if (owner.suspended || owner.flushQueued)
    return;
  owner.flushQueued = true;
  owner.driver.scheduleFlush(() => {
    owner.flushQueued = false;
    flush(owner);
  });
}
function flush(instance) {
  var _a;
  const owner = instance.owner;
  if (owner.destroyed || owner.suspended || !owner.scheduled)
    return;
  owner.scheduled = false;
  owner.layoutEffects.length = 0;
  owner.effects.length = 0;
  const processed = /* @__PURE__ */ new Set();
  while (owner.dirtyComponents.size > 0) {
    const dirty = [...owner.dirtyComponents].filter((target) => !processed.has(target));
    if (dirty.length === 0)
      break;
    for (const target of dirty) {
      owner.dirtyComponents.delete(target);
      processed.add(target);
    }
    for (const target of dirty) {
      if (target.destroyed || target.suspended)
        continue;
      owner.metrics.componentUpdates++;
      if (target.rootDirty) {
        target.rootDirty = false;
        evaluate(target);
        collectSlotUpdates(target, target.component.plan.root, target.rootScope);
        syncStructures(target, target.component.plan.root, target.rootScope);
        copySlots(target.slots, target.previousSlots);
      }
      for (const scope of [...target.dirtyScopes]) {
        target.dirtyScopes.delete(scope);
        if (!scope.computation || scope.disposed || !scope.template)
          continue;
        scope.computation.run();
        collectSlotUpdates(target, scope.template, scope);
        syncStructures(target, scope.template, scope);
        copySlots(scope.slots, scope.previousSlots);
        (_a = scope.afterUpdate) === null || _a === void 0 ? void 0 : _a.call(scope);
      }
    }
  }
  commit(owner);
  if (owner.dirtyComponents.size > 0) {
    owner.scheduled = true;
    schedule(owner);
  } else
    owner.scheduled = false;
}
function evaluate(instance) {
  var _a;
  var _b;
  (_a = (_b = instance.rootScope).computation) !== null && _a !== void 0 ? _a : _b.computation = trackComputation(() => evaluateRoot(instance), () => requestUpdate(instance));
  instance.rootScope.computation.run();
}
function evaluateRoot(instance) {
  const previous = activeInstance;
  activeInstance = instance;
  activeHookId = -1;
  try {
    instance.component.evaluate(instance.props, instance.slots, instance.environment);
    trackStructure(instance.component.plan.root, instance.slots);
  } finally {
    activeInstance = previous;
    activeHookId = -1;
  }
}
function trackStructure(plan, slots) {
  var _a;
  if (plan.kind === "component")
    return;
  if (plan.repeat) {
    const items = slots[plan.repeat.collectionSlot];
    if (Array.isArray(items))
      for (const item of items)
        readItemKey(item, plan.repeat.key);
  }
  for (const child of (_a = plan.children) !== null && _a !== void 0 ? _a : [])
    trackStructure(child, slots);
}
function evaluateScope(instance, scope, template, evaluator) {
  var _a;
  scope.template = template;
  scope.repeatEvaluator = evaluator;
  (_a = scope.computation) !== null && _a !== void 0 ? _a : scope.computation = trackComputation(() => {
    scope.repeatEvaluator(scope.items, scope.indices, scope.slots, instance.environment);
    trackStructure(scope.template, scope.slots);
  }, () => {
    if (scope.disposed)
      return;
    instance.dirtyScopes.add(scope);
    requestUpdate(instance, false);
  });
  instance.dirtyScopes.delete(scope);
  scope.computation.run();
}
function stopScopeTracking(scope) {
  var _a;
  (_a = scope.computation) === null || _a === void 0 ? void 0 : _a.stop();
  scope.computation = void 0;
  for (const component of scope.components.values())
    stopScopeTracking(component.rootScope);
  for (const repeat of scope.repeats.values())
    repeat.forEach((entry) => stopScopeTracking(entry.scope));
  for (const state of scope.virtuals.values()) {
    for (const row of [...state.pool, ...state.flowHeaders])
      stopScopeTracking(row.scope);
    if (state.header)
      stopScopeTracking(state.header.scope);
  }
}
function collectSlotUpdates(instance, plan, scope) {
  var _a, _b;
  var _c, _d;
  if (plan.kind === "component") {
    const child = scope.components.get(plan.planId);
    if (!child)
      throw new Error(`Missing component instance for planId ${plan.planId}`);
    const nextProps = readComponentProps(plan, scope.slots);
    if (!sameComponentProps(child.props, nextProps)) {
      child.props = nextProps;
      requestUpdate(child);
    }
    return;
  }
  const record = scope.recordsByPlanId.get(plan.planId);
  if (!record)
    throw new Error(`Missing HostRecord for planId ${plan.planId}`);
  for (const binding of (_c = plan.bindings) !== null && _c !== void 0 ? _c : []) {
    const next = scope.slots[binding.slot];
    if (sameBindingValue(binding.property, next, record.props[binding.property]))
      continue;
    record.props[binding.property] = next;
    instance.commands.push({ type: "update", record, property: binding.property, value: next });
  }
  if (plan.lazy && (record.props.visible === false || !((_b = (_a = scope.lazyStates) === null || _a === void 0 ? void 0 : _a.get(plan.planId)) === null || _b === void 0 ? void 0 : _b.materialized)))
    return;
  for (const child of (_d = plan.children) !== null && _d !== void 0 ? _d : [])
    collectSlotUpdates(instance, child, scope);
}
function syncStructures(instance, plan, scope, recycleRepeats = false, localVirtualRefresh = false, resetVirtualScroll = false) {
  var _a;
  var _b, _c;
  if (plan.kind === "component")
    return;
  const boundary = scope.recordsByPlanId.get(plan.planId);
  if (plan.lazy) {
    const lazy = scope.lazyStates.get(plan.planId);
    if (boundary.props.visible === false) {
      if (lazy.active) {
        lazy.active = false;
        lazy.attempted = false;
        lazy.generation++;
      }
      setBoundaryComponentsSuspended(scope, boundary, true);
      suspendVirtualSubtree(boundary, resetVirtualScroll);
      return;
    }
    lazy.active = true;
    if (!lazy.prepared && plan.moduleInfo && instance.owner.preparedModuleKeys.has(moduleInfoKey(plan.moduleInfo)))
      lazy.prepared = true;
    if (!lazy.materialized) {
      if (!lazy.prepared) {
        startLazyPreparation(instance, plan, lazy);
        return;
      }
      lazy.materialized = true;
      for (const child of (_b = plan.children) !== null && _b !== void 0 ? _b : []) {
        boundary.children.push(instantiatePlan(instance, child, boundary, boundary.children.length, scope));
      }
    }
    setBoundaryComponentsSuspended(scope, boundary, false);
  }
  if (plan.repeat) {
    const anchor = scope.recordsByPlanId.get(plan.planId);
    if (!anchor)
      throw new Error(`Missing repeat anchor ${plan.planId}`);
    const evaluator = (_a = instance.component.repeatEvaluators) === null || _a === void 0 ? void 0 : _a[plan.planId];
    if (!evaluator)
      throw new Error(`Missing AOT evaluator for keyed For anchor ${plan.planId}`);
    const values = scope.slots[plan.repeat.collectionSlot];
    if (!Array.isArray(values))
      throw new Error(`Keyed For slot ${plan.repeat.collectionSlot} must be an array.`);
    let keyed = scope.repeats.get(plan.planId);
    if (!keyed) {
      keyed = new KeyedFor();
      scope.repeats.set(plan.planId, keyed);
    }
    const entries = keyed.reconcile(values, (item) => {
      if (item === null || typeof item !== "object")
        throw new Error("Keyed For items must be objects.");
      return item[plan.repeat.key];
    }, (item, index) => {
      const slots = new Array(plan.repeat.itemSlotCount);
      const childScope = {
        path: `${scope.path}/${plan.planId}:${String(readItemKey(item, plan.repeat.key))}`,
        items: [...scope.items, item],
        indices: [...scope.indices, index],
        slots,
        previousSlots: new Array(plan.repeat.itemSlotCount),
        recordsByPlanId: /* @__PURE__ */ new Map(),
        repeats: /* @__PURE__ */ new Map(),
        virtuals: /* @__PURE__ */ new Map(),
        components: /* @__PURE__ */ new Map()
      };
      evaluateScope(instance, childScope, plan.repeat.template, evaluator);
      const root = instantiatePlan(instance, plan.repeat.template, anchor, index, childScope);
      anchor.children.splice(index, 0, root);
      syncStructures(instance, plan.repeat.template, childScope, recycleRepeats, localVirtualRefresh, resetVirtualScroll);
      copySlots(childScope.slots, childScope.previousSlots);
      return {
        root,
        scope: childScope,
        key: readItemKey(item, plan.repeat.key),
        bindVersion: 0
      };
    }, (entry, item, index) => {
      const key = readItemKey(item, plan.repeat.key);
      const changed = bindChildScope(entry.scope, scope, item, index);
      const nextPath = `${scope.path}/${plan.planId}:${String(key)}`;
      const identityChanged = !Object.is(entry.key, key) || entry.scope.path !== nextPath;
      if (recycleRepeats && !changed && !identityChanged && entry.scope.computation)
        return;
      entry.bindVersion++;
      entry.key = key;
      entry.scope.path = nextPath;
      evaluateScope(instance, entry.scope, plan.repeat.template, evaluator);
      collectSlotUpdates(instance, plan.repeat.template, entry.scope);
      syncStructures(instance, plan.repeat.template, entry.scope, recycleRepeats, localVirtualRefresh, resetVirtualScroll);
      copySlots(entry.scope.slots, entry.scope.previousSlots);
    }, (entry) => {
      const index = anchor.children.indexOf(entry.root);
      if (index >= 0)
        anchor.children.splice(index, 1);
      disposeScope(entry.scope);
      appendDestroy(instance, entry.root);
    }, recycleRepeats);
    for (let index = 0; index < entries.length; index++) {
      const record = entries[index].record.root;
      const previous = anchor.children.indexOf(record);
      if (previous === index)
        continue;
      if (previous >= 0)
        anchor.children.splice(previous, 1);
      anchor.children.splice(index, 0, record);
      instance.commands.push({ type: "move", parent: anchor, child: record, index });
    }
  }
  if (plan.virtual)
    syncVirtual(instance, plan, scope, localVirtualRefresh, resetVirtualScroll);
  for (const child of (_c = plan.children) !== null && _c !== void 0 ? _c : []) {
    syncStructures(instance, child, scope, recycleRepeats, localVirtualRefresh, resetVirtualScroll);
  }
}
function bindChildScope(child, parent, item, index) {
  let changed = false;
  for (let cursor = 0; cursor < parent.items.length; cursor++) {
    if (!Object.is(child.items[cursor], parent.items[cursor])) {
      child.items[cursor] = parent.items[cursor];
      changed = true;
    }
    if (!Object.is(child.indices[cursor], parent.indices[cursor])) {
      child.indices[cursor] = parent.indices[cursor];
      changed = true;
    }
  }
  const own = parent.items.length;
  if (!Object.is(child.items[own], item)) {
    child.items[own] = item;
    changed = true;
  }
  if (!Object.is(child.indices[own], index)) {
    child.indices[own] = index;
    changed = true;
  }
  return changed;
}
function syncVirtual(instance, plan, scope, localRefresh = false, resetFromAncestor = false) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
  var _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11;
  const layoutStart = monotonicNow();
  const virtual = plan.virtual;
  const anchor = scope.recordsByPlanId.get(plan.planId);
  if (!anchor)
    throw new Error(`Missing virtual anchor ${plan.planId}`);
  if (!recordIsVisible(anchor)) {
    suspendVirtualSubtree(anchor, resetFromAncestor);
    return;
  }
  const evaluator = (_a = instance.component.repeatEvaluators) === null || _a === void 0 ? void 0 : _a[plan.planId];
  if (!evaluator)
    throw new Error(`Missing AOT evaluator for virtual anchor ${plan.planId}`);
  const sourceValue = scope.slots[virtual.sourceSlot];
  if (!isVirtualSource(sourceValue))
    throw new Error(`Virtual source slot ${virtual.sourceSlot} must implement length/get/subscribe.`);
  let state = scope.virtuals.get(plan.planId);
  if (!state) {
    state = {
      keyIndex: new VirtualKeyIndex(),
      source: null,
      signature: "",
      pool: [],
      flowHeaders: [],
      groupStarts: [],
      groupsDirty: true,
      pendingSizes: /* @__PURE__ */ new Map(),
      metrics: {
        logicalItems: 0,
        physicalSlots: 0,
        visibleStart: 0,
        visibleEnd: 0,
        rebinds: 0,
        created: 0,
        destroyed: 0,
        layoutMs: 0,
        anchorKey: null
      },
      range: { start: 0, end: 0, firstVisible: 0, lastVisible: -1 },
      direction: "vertical",
      offset: 0,
      viewportMain: 1,
      refreshQueued: false,
      resetScroll: false,
      scrolling: false,
      initialPhase: "idle",
      initialPermit: false,
      pendingKeys: [],
      entrances: /* @__PURE__ */ new Map()
    };
    state.cancelInitial = (force = false) => {
      var _a2, _b2;
      if (state.initialPhase !== "idle" || force)
        state.initialPhase = "done";
      (_b2 = (_a2 = state).cancelDelay) === null || _b2 === void 0 ? void 0 : _b2.call(_a2);
      state.cancelDelay = void 0;
      state.initialPermit = false;
      state.pendingKeys = [];
      for (const cancel of state.entrances.values())
        cancel();
      state.entrances.clear();
    };
    queueRecordProperty(instance, anchor, "__virtualSuspend", (reset) => {
      var _a2, _b2;
      var _c2;
      state.cancelInitial();
      (_c2 = state).resetScroll || (_c2.resetScroll = reset);
      (_b2 = (_a2 = instance.driver).stopVirtualScroll) === null || _b2 === void 0 ? void 0 : _b2.call(_a2, anchor);
    });
    scope.virtuals.set(plan.planId, state);
  }
  if (state.source !== sourceValue) {
    if (state.source !== null)
      state.cancelInitial();
    state.resetScroll || (state.resetScroll = state.source !== null);
    (_b = state.unsubscribe) === null || _b === void 0 ? void 0 : _b.call(state);
    state.keyIndex.clear();
    state.source = sourceValue;
    state.signature = "";
    state.groupsDirty = true;
    state.pendingSizes.clear();
    state.pendingChange = { type: "reset" };
    state.unsubscribe = sourceValue.subscribe((change) => {
      var _a2;
      const mutations = flattenDataChange(change);
      const structuralFields = [
        virtual.key,
        anchor.props.sizeKey,
        (_a2 = virtual.header) === null || _a2 === void 0 ? void 0 : _a2.groupKey
      ].filter(Boolean);
      if (sourceValue.reactiveItems && mutations.every((mutation) => mutation.type === "update" && mutation.fields && !mutation.fields.some((field) => structuralFields.includes(field))))
        return;
      state.keyIndex.clear();
      if (mutations.some((mutation) => mutation.type === "reset")) {
        state.resetScroll = true;
        state.cancelInitial();
      } else if (!state.resetScroll)
        captureVirtualAnchor(state);
      state.pendingChange = state.pendingChange ? mergeDataChanges(state.pendingChange, change) : change;
      state.groupsDirty = true;
      state.pendingSizes.clear();
      if (recordIsVisible(anchor))
        requestUpdate(instance);
    });
  }
  const previousLogicalItems = state.metrics.logicalItems;
  const previousPhysicalSlots = state.metrics.physicalSlots;
  const previousVisibleStart = state.metrics.visibleStart;
  const previousVisibleEnd = state.metrics.visibleEnd;
  const previousRebinds = state.metrics.rebinds;
  const previousCreated = state.metrics.created;
  const previousDestroyed = state.metrics.destroyed;
  const previousAnchorKey = state.metrics.anchorKey;
  const shouldResetScroll = state.resetScroll || resetFromAncestor;
  state.resetScroll = false;
  const direction = anchor.props.direction === "horizontal" ? "horizontal" : "vertical";
  const style = isPlainRecord(anchor.props.style) ? anchor.props.style : {};
  const fallbackMain = readPositive(direction === "vertical" ? style.height : style.width, 1);
  const fallbackCross = readPositive(direction === "vertical" ? style.width : style.height, 1);
  const viewport = (_z = (_d = (_c = instance.driver).readVirtualViewport) === null || _d === void 0 ? void 0 : _d.call(_c, anchor, direction)) !== null && _z !== void 0 ? _z : {
    offset: readNonNegative(anchor.props.__virtualOffset, 0),
    mainSize: fallbackMain,
    crossSize: fallbackCross,
    scrolling: false
  };
  const viewportMain = readPositive(viewport.mainSize, fallbackMain);
  const viewportCross = readPositive(viewport.crossSize, fallbackCross);
  const scrolling = shouldResetScroll ? false : viewport.scrolling;
  let offset = shouldResetScroll ? 0 : readNonNegative(viewport.offset, 0);
  if (shouldResetScroll) {
    state.pendingAnchor = void 0;
    state.pendingScroll = void 0;
    state.metrics.anchorKey = null;
    (_f = (_e = instance.driver).stopVirtualScroll) === null || _f === void 0 ? void 0 : _f.call(_e, anchor);
    (_h = (_g = instance.driver).scrollVirtualTo) === null || _h === void 0 ? void 0 : _h.call(_g, anchor, direction, 0, 0);
  }
  if (shouldResetScroll || scrolling || Math.abs(offset - state.offset) > 0.01)
    state.cancelInitial();
  const initialOptions = resolveInitialRender(anchor.props.initialRender);
  if (initialOptions === false)
    state.cancelInitial(true);
  const validViewport = (viewport.mainSize > 0 || fallbackMain > 1) && (viewport.crossSize > 0 || fallbackCross > 1);
  if (state.initialPhase === "idle" && sourceValue.length > 0 && validViewport) {
    state.initialPhase = "running";
    state.initialPermit = true;
  }
  const overscan = readInteger(anchor.props.overscan, 1, 0);
  const headerSize = virtual.header ? readPositive((_0 = anchor.props.headerSize) !== null && _0 !== void 0 ? _0 : anchor.props.estimatedHeaderSize, 40) : 0;
  if (virtual.header && state.groupsDirty) {
    state.groupStarts = collectGroupStarts(sourceValue, virtual.header.groupKey);
    state.groupsDirty = false;
  } else if (!virtual.header) {
    state.groupStarts = [];
  }
  const placements = [];
  let contentMainSize;
  if (virtual.layout === "list") {
    const itemSize = readOptionalPositive(anchor.props.itemSize);
    const sizeKey = readSizeKey(anchor.props.sizeKey);
    if (itemSize !== void 0 && sizeKey !== void 0) {
      throw new Error("VirtualList itemSize and sizeKey are mutually exclusive.");
    }
    const estimated = (_2 = (_1 = readOptionalPositive(anchor.props.estimatedItemSize)) !== null && _1 !== void 0 ? _1 : itemSize) !== null && _2 !== void 0 ? _2 : 44;
    const gap = readNonNegative(anchor.props.gap, 0);
    const signature = `list:${itemSize !== null && itemSize !== void 0 ? itemSize : "auto"}:${estimated}:${sizeKey !== null && sizeKey !== void 0 ? sizeKey : "measured"}:${gap}:${overscan}`;
    const change = state.pendingChange;
    const mutations = change ? flattenDataChange(change) : [];
    let incrementalSplice = false;
    if (!state.listModel || state.signature !== signature) {
      state.listModel = new VirtualListModel({
        itemCount: sourceValue.length,
        viewportSize: viewportMain,
        itemSize,
        estimatedItemSize: itemSize === void 0 ? estimated : void 0,
        gap,
        overscan
      });
      if (sizeKey !== void 0)
        state.listModel.setSizes(readSourceSizes(sourceValue, sizeKey));
      state.gridModel = void 0;
      state.signature = signature;
    } else {
      const splices = mutations.filter((mutation) => mutation.type === "splice");
      if (splices.length && mutations.every((mutation) => mutation.type === "splice" || mutation.type === "update") && sourceValue.length === splices.reduce((count, mutation) => count - mutation.deleteCount + mutation.insertCount, state.listModel.itemCount)) {
        for (const mutation of splices)
          state.listModel.spliceItems(mutation.index, mutation.deleteCount, mutation.insertCount);
        incrementalSplice = true;
      } else {
        state.listModel.setItemCount(sourceValue.length);
        if (mutations.some((mutation) => mutation.type === "reset" || mutation.type === "reorder") && sizeKey === void 0)
          state.listModel.resetSize();
      }
      state.listModel.setViewport(viewportMain);
      if (sizeKey !== void 0 && change) {
        const mutations2 = flattenDataChange(change);
        if (mutations2.every((mutation) => mutation.type === "update")) {
          for (const mutation of mutations2)
            if (mutation.type === "update")
              updateSourceSizes(state.listModel, sourceValue, sizeKey, mutation.index, mutation.count);
        } else if (change.type === "splice" && incrementalSplice) {
          updateSourceSizes(state.listModel, sourceValue, sizeKey, change.index, change.insertCount);
        } else {
          state.listModel.setSizes(readSourceSizes(sourceValue, sizeKey));
        }
      }
    }
    state.listModel.setGroups(state.groupStarts, headerSize);
    state.pendingChange = void 0;
    if (sizeKey !== void 0) {
      state.pendingSizes.clear();
    } else if (!scrolling && state.pendingSizes.size > 0) {
      if (!state.pendingScroll)
        captureVirtualAnchor(state);
      for (const [index, size] of state.pendingSizes)
        state.listModel.updateSize(index, size);
      state.pendingSizes.clear();
    }
    if (state.pendingScroll && !scrolling) {
      const scrollIndex = resolveAnchorIndex(sourceValue, virtual.key, state.pendingScroll);
      state.listModel.scrollTo(state.listModel.offsetForIndex(scrollIndex, state.pendingScroll.align));
      offset = state.listModel.scrollOffset;
      (_k = (_j = instance.driver).scrollVirtualTo) === null || _k === void 0 ? void 0 : _k.call(_j, anchor, direction, offset, 0);
    } else if (state.pendingAnchor) {
      const anchorIndex = resolveAnchorIndex(sourceValue, virtual.key, state.pendingAnchor);
      state.listModel.scrollTo(state.listModel.offsetAt(anchorIndex) + state.pendingAnchor.offsetInside);
      offset = state.listModel.scrollOffset;
      state.pendingAnchor = void 0;
      (_m = (_l = instance.driver).scrollVirtualTo) === null || _m === void 0 ? void 0 : _m.call(_l, anchor, direction, offset, 0);
    } else {
      state.listModel.scrollTo(offset);
    }
    state.range = state.listModel.readRange();
    for (let index = state.range.start; index < state.range.end; index++) {
      placements.push({
        index,
        mainOffset: state.listModel.offsetAt(index),
        crossOffset: 0,
        mainSize: state.listModel.sizeAt(index),
        crossSize: viewportCross
      });
    }
    contentMainSize = state.listModel.contentSize;
  } else {
    const mainGap = readNonNegative(anchor.props.gap, 0);
    const crossGap = readNonNegative(anchor.props.crossGap, 0);
    const explicitLanes = readInteger(anchor.props.lanes, 0, 0);
    const minLaneSize = readOptionalPositive(anchor.props.minLaneSize);
    const lanes = explicitLanes > 0 ? explicitLanes : Math.max(1, minLaneSize ? Math.floor((viewportCross + crossGap) / (minLaneSize + crossGap)) : 1);
    const cellSize = readOptionalPositive(anchor.props.itemSize);
    const sizeKey = readSizeKey(anchor.props.sizeKey);
    if (cellSize !== void 0 && sizeKey !== void 0) {
      throw new Error("VirtualList itemSize and sizeKey are mutually exclusive.");
    }
    const estimated = (_4 = (_3 = readOptionalPositive(anchor.props.estimatedItemSize)) !== null && _3 !== void 0 ? _3 : cellSize) !== null && _4 !== void 0 ? _4 : 80;
    const mode = anchor.props.mode === "masonry" ? "masonry" : "regular";
    const signature = `grid:${mode}:${cellSize !== null && cellSize !== void 0 ? cellSize : "auto"}:${sizeKey !== null && sizeKey !== void 0 ? sizeKey : "measured"}:${estimated}:${mainGap}:${crossGap}:${overscan}`;
    if (!state.gridModel || state.signature !== signature) {
      state.gridModel = new VirtualGridModel({
        itemCount: sourceValue.length,
        viewportMainSize: viewportMain,
        viewportCrossSize: viewportCross,
        lanes,
        cellSize,
        estimatedCellSize: cellSize === void 0 ? estimated : void 0,
        mainGap,
        crossGap,
        overscan,
        mode,
        groupStarts: state.groupStarts,
        headerSize: headerSize || void 0
      });
      if (sizeKey !== void 0)
        state.gridModel.setSizes(readSourceSizes(sourceValue, sizeKey));
      state.listModel = void 0;
      state.signature = signature;
    } else {
      if (lanes !== state.gridModel.lanesCount)
        captureVirtualAnchor(state);
      const change = state.pendingChange;
      const mutations = change ? flattenDataChange(change) : [], splices = mutations.filter((mutation) => mutation.type === "splice");
      if (splices.length && mutations.every((mutation) => mutation.type === "splice" || mutation.type === "update") && sourceValue.length === splices.reduce((count, mutation) => count - mutation.deleteCount + mutation.insertCount, state.gridModel.itemCount)) {
        for (const mutation of splices)
          state.gridModel.spliceItems(mutation.index, mutation.deleteCount, mutation.insertCount);
      } else {
        state.gridModel.setItemCount(sourceValue.length);
      }
      state.gridModel.setViewport(viewportMain, viewportCross, lanes);
      if (sizeKey !== void 0 && change)
        state.gridModel.setSizes(readSourceSizes(sourceValue, sizeKey));
    }
    state.gridModel.setGroups(state.groupStarts, headerSize);
    state.pendingChange = void 0;
    if (sizeKey !== void 0) {
      state.pendingSizes.clear();
    } else if (!scrolling && state.pendingSizes.size > 0) {
      if (!state.pendingScroll)
        captureVirtualAnchor(state);
      for (const [index, size] of state.pendingSizes)
        state.gridModel.updateSize(index, size);
      state.pendingSizes.clear();
    }
    if (state.pendingScroll && !scrolling) {
      const scrollIndex = resolveAnchorIndex(sourceValue, virtual.key, state.pendingScroll);
      offset = gridOffsetForIndex(state.gridModel, scrollIndex, state.pendingScroll.align, offset, viewportMain);
      (_p = (_o = instance.driver).scrollVirtualTo) === null || _p === void 0 ? void 0 : _p.call(_o, anchor, direction, offset, 0);
    } else if (state.pendingAnchor) {
      const anchorIndex = resolveAnchorIndex(sourceValue, virtual.key, state.pendingAnchor);
      const placement = state.gridModel.placementAt(anchorIndex);
      offset = Math.max(0, Math.min(Math.max(0, state.gridModel.contentSize - viewportMain), ((_5 = placement === null || placement === void 0 ? void 0 : placement.mainOffset) !== null && _5 !== void 0 ? _5 : 0) + state.pendingAnchor.offsetInside));
      state.pendingAnchor = void 0;
      (_r = (_q = instance.driver).scrollVirtualTo) === null || _r === void 0 ? void 0 : _r.call(_q, anchor, direction, offset, 0);
    }
    placements.push(...state.gridModel.visible(offset));
    const first = (_6 = (_s = placements[0]) === null || _s === void 0 ? void 0 : _s.index) !== null && _6 !== void 0 ? _6 : 0;
    const last = (_7 = (_t = placements[placements.length - 1]) === null || _t === void 0 ? void 0 : _t.index) !== null && _7 !== void 0 ? _7 : -1;
    state.range = { start: first, end: last + 1, firstVisible: first, lastVisible: last };
    contentMainSize = state.gridModel.contentSize;
  }
  state.direction = direction;
  state.offset = offset;
  state.viewportMain = viewportMain;
  state.metrics.logicalItems = sourceValue.length;
  if (sourceValue.length === 0)
    state.metrics.anchorKey = null;
  state.metrics.visibleStart = state.range.firstVisible;
  state.metrics.visibleEnd = state.range.lastVisible < 0 ? 0 : state.range.lastVisible + 1;
  let measuredChanged = false;
  if (state.initialPhase === "running")
    placements.sort((a, b) => {
      const visible = (p) => p.mainOffset < offset + viewportMain && p.mainOffset + p.mainSize > offset;
      return Number(visible(b)) - Number(visible(a)) || a.index - b.index;
    });
  const bindings = placements.map((placement) => {
    const item = sourceValue.get(placement.index);
    const key = readItemKey(item, virtual.key);
    return { placement, item, key };
  });
  const desiredKeys = /* @__PURE__ */ new Set();
  for (const binding of bindings) {
    if (desiredKeys.has(binding.key))
      throw new Error(`Duplicate virtual collection key: ${String(binding.key)}`);
    desiredKeys.add(binding.key);
  }
  const poolByKey = new Map(state.pool.map((pooled) => [pooled.key, pooled]));
  const claimed = /* @__PURE__ */ new Set();
  state.pendingKeys = [];
  for (const { placement, item, key } of bindings) {
    const entering = !poolByKey.has(key) && state.initialPhase === "running";
    if (state.initialPhase === "idle" || entering && !state.initialPermit) {
      state.pendingKeys.push(key);
      continue;
    }
    if (entering)
      state.initialPermit = false;
    let pooled = poolByKey.get(key);
    if (pooled && claimed.has(pooled))
      pooled = void 0;
    pooled !== null && pooled !== void 0 ? pooled : pooled = state.pool.find((candidate) => !claimed.has(candidate) && !desiredKeys.has(candidate.key));
    if (!pooled) {
      const slots = new Array(virtual.itemSlotCount);
      const childScope = {
        path: `${scope.path}/${plan.planId}:${String(key)}`,
        items: [...scope.items, item],
        indices: [...scope.indices, placement.index],
        slots,
        previousSlots: new Array(virtual.itemSlotCount),
        recordsByPlanId: /* @__PURE__ */ new Map(),
        repeats: /* @__PURE__ */ new Map(),
        virtuals: /* @__PURE__ */ new Map(),
        components: /* @__PURE__ */ new Map()
      };
      evaluateScope(instance, childScope, virtual.template, evaluator);
      const root = instantiatePlan(instance, virtual.template, anchor, anchor.children.length, childScope);
      anchor.children.push(root);
      syncStructures(instance, virtual.template, childScope);
      copySlots(slots, childScope.previousSlots);
      pooled = { root, scope: childScope, key, index: placement.index, bindVersion: 0 };
      state.pool.push(pooled);
      state.metrics.created++;
    } else {
      queueRecordProperty(instance, pooled.root, "__virtualParked", false);
      const keyChanged = !Object.is(pooled.key, key);
      const bindingChanged = keyChanged || pooled.index !== placement.index;
      const scopeChanged = bindChildScope(pooled.scope, scope, item, placement.index);
      const nextPath = `${scope.path}/${plan.planId}:${String(key)}`;
      const pathChanged = pooled.scope.path !== nextPath;
      if (keyChanged || pathChanged)
        resetScopeComponents(pooled.scope);
      if (bindingChanged || pathChanged) {
        pooled.bindVersion++;
        pooled.key = key;
        pooled.index = placement.index;
        pooled.scope.path = nextPath;
        state.metrics.rebinds++;
      }
      if (!localRefresh || bindingChanged || scopeChanged || pathChanged || !pooled.scope.computation) {
        evaluateScope(instance, pooled.scope, virtual.template, evaluator);
        collectSlotUpdates(instance, virtual.template, pooled.scope);
        syncStructures(instance, virtual.template, pooled.scope, keyChanged, localRefresh, resetFromAncestor || shouldResetScroll || keyChanged || pathChanged);
        copySlots(pooled.scope.slots, pooled.scope.previousSlots);
      }
    }
    if (entering && initialOptions && initialOptions.animation) {
      const row = pooled.root;
      state.entrances.set(row, instance.driver.startEntrance(row, Object.assign({ direction }, initialOptions), () => state.entrances.delete(row)));
    }
    claimed.add(pooled);
    pooled.scope.afterUpdate = () => {
      var _a2, _b2;
      return (_b2 = (_a2 = state).refresh) === null || _b2 === void 0 ? void 0 : _b2.call(_a2);
    };
    queueRecordProperty(instance, pooled.root, "__virtualParked", false);
    queueRecordProperty(instance, pooled.root, "__virtualDirection", direction);
    queueRecordProperty(instance, pooled.root, "__virtualMainOffset", placement.mainOffset);
    queueRecordProperty(instance, pooled.root, "__virtualCrossOffset", placement.crossOffset);
    queueRecordProperty(instance, pooled.root, "__virtualMainSize", placement.mainSize);
    queueRecordProperty(instance, pooled.root, "__virtualCrossSize", placement.crossSize);
    queueRecordProperty(instance, pooled.root, "__virtualIndex", placement.index);
    queueRecordProperty(instance, pooled.root, "__virtualKey", key);
    const declaredSize = readSizeKey(anchor.props.sizeKey) !== void 0 ? void 0 : readDeclaredMainSize(pooled.root, direction);
    if (declaredSize !== void 0) {
      if (scrolling)
        state.pendingSizes.set(placement.index, declaredSize);
      else if (((_u = state.listModel) === null || _u === void 0 ? void 0 : _u.updateSize(placement.index, declaredSize)) || ((_v = state.gridModel) === null || _v === void 0 ? void 0 : _v.updateSize(placement.index, declaredSize)))
        measuredChanged = true;
    }
  }
  for (const pooled of state.pool) {
    if (!claimed.has(pooled)) {
      (_w = state.entrances.get(pooled.root)) === null || _w === void 0 ? void 0 : _w();
      state.entrances.delete(pooled.root);
      suspendVirtualSubtree(pooled.root, false);
      stopScopeTracking(pooled.scope);
      queueRecordProperty(instance, pooled.root, "__virtualParked", true);
    }
  }
  if (state.pendingScroll && !scrolling && !measuredChanged && state.pendingSizes.size === 0) {
    state.pendingScroll = void 0;
  }
  state.metrics.physicalSlots = state.pool.length;
  if (virtual.header) {
    syncFlowHeaders(instance, scope, anchor, virtual.header, state, viewportCross, headerSize, shouldResetScroll);
    syncStickyHeader(instance, scope, anchor, virtual.header, state, viewportCross, headerSize, shouldResetScroll);
  }
  queueRecordProperty(instance, anchor, "__virtualDirection", direction);
  queueRecordProperty(instance, anchor, "__virtualScopePath", `${scope.path}/${plan.planId}`);
  queueRecordProperty(instance, anchor, "__virtualContentMainSize", contentMainSize);
  (_8 = state.refresh) !== null && _8 !== void 0 ? _8 : state.refresh = () => {
    if (state.refreshQueued || instance.destroyed || instance.suspended)
      return;
    state.refreshQueued = true;
    instance.driver.scheduleFlush(() => {
      state.refreshQueued = false;
      if (instance.destroyed || instance.suspended || instance.scheduled || scope.virtuals.get(plan.planId) !== state || !recordIsVisible(anchor))
        return;
      syncVirtual(instance, plan, scope, true);
      commit(instance, anchor);
    });
  };
  queueRecordProperty(instance, anchor, "__virtualRefresh", state.refresh);
  (_9 = state.fillWindow) !== null && _9 !== void 0 ? _9 : state.fillWindow = () => {
    if (instance.destroyed || instance.suspended || !recordIsVisible(anchor))
      return;
    syncVirtual(instance, plan, scope, true);
    commit(instance, anchor);
  };
  (_10 = state.interrupt) !== null && _10 !== void 0 ? _10 : state.interrupt = () => {
    if (state.initialPhase === "done" && !state.entrances.size)
      return;
    state.cancelInitial(true);
    state.fillWindow();
  };
  queueRecordProperty(instance, anchor, "__virtualInteraction", state.interrupt);
  if (state.initialPhase === "running") {
    if (!state.pendingKeys.length) {
      state.initialPhase = "done";
      (_x = state.cancelDelay) === null || _x === void 0 ? void 0 : _x.call(state);
      state.cancelDelay = void 0;
    } else if (!state.cancelDelay && initialOptions) {
      state.cancelDelay = instance.driver.scheduleDelayed(() => {
        state.cancelDelay = void 0;
        if (instance.destroyed || instance.suspended || scope.virtuals.get(plan.planId) !== state || !recordIsVisible(anchor))
          return;
        state.initialPermit = true;
        if (instance.scheduled)
          flush(instance);
        else {
          syncVirtual(instance, plan, scope, true);
          commit(instance, anchor);
        }
      }, initialOptions.intervalMs);
    }
  }
  (_11 = state.controller) !== null && _11 !== void 0 ? _11 : state.controller = createVirtualController(instance, anchor, virtual.key, state);
  assignController(anchor.props.controller, state.controller);
  state.metrics.layoutMs = monotonicNow() - layoutStart;
  const metricsChanged = previousLogicalItems !== state.metrics.logicalItems || previousPhysicalSlots !== state.metrics.physicalSlots || previousVisibleStart !== state.metrics.visibleStart || previousVisibleEnd !== state.metrics.visibleEnd || previousRebinds !== state.metrics.rebinds || previousCreated !== state.metrics.created || previousDestroyed !== state.metrics.destroyed || previousAnchorKey !== state.metrics.anchorKey;
  state.scrolling = scrolling;
  if (localRefresh) {
    if (measuredChanged)
      (_y = state.refresh) === null || _y === void 0 ? void 0 : _y.call(state);
  } else if (!scrolling && (measuredChanged || metricsChanged)) {
    requestUpdate(instance);
  }
}
function syncFlowHeaders(instance, parentScope, anchor, headerPlan, state, viewportCross, headerSize, resetDescendantScroll) {
  var _a, _b, _c;
  var _d, _e;
  const source = state.source;
  const evaluator = (_a = instance.component.repeatEvaluators) === null || _a === void 0 ? void 0 : _a[headerPlan.planId];
  if (!source || !evaluator)
    return;
  const headers = (_e = (_d = (_b = state.listModel) === null || _b === void 0 ? void 0 : _b.groupHeaders()) !== null && _d !== void 0 ? _d : (_c = state.gridModel) === null || _c === void 0 ? void 0 : _c.groupHeaders()) !== null && _e !== void 0 ? _e : [];
  const visible = headers.filter((header) => header.mainOffset + headerSize >= state.offset - headerSize && header.mainOffset <= state.offset + state.viewportMain + headerSize);
  for (let slotIndex = 0; slotIndex < visible.length; slotIndex++) {
    const placement = visible[slotIndex];
    const firstItem = source.get(placement.firstIndex);
    const group = readItemKey(firstItem, headerPlan.groupKey);
    if (typeof group !== "string" && typeof group !== "number")
      throw new Error("Virtual group keys must be strings or numbers.");
    let pooled = state.flowHeaders[slotIndex];
    if (!pooled) {
      const slots = new Array(headerPlan.itemSlotCount);
      const childScope = {
        path: `${parentScope.path}/flow:${headerPlan.planId}:${String(group)}`,
        items: [...parentScope.items, group],
        indices: [...parentScope.indices, firstItem],
        slots,
        previousSlots: new Array(headerPlan.itemSlotCount),
        recordsByPlanId: /* @__PURE__ */ new Map(),
        repeats: /* @__PURE__ */ new Map(),
        virtuals: /* @__PURE__ */ new Map(),
        components: /* @__PURE__ */ new Map()
      };
      evaluateScope(instance, childScope, headerPlan.template, evaluator);
      const root = instantiatePlan(instance, headerPlan.template, anchor, anchor.children.length, childScope);
      anchor.children.push(root);
      syncStructures(instance, headerPlan.template, childScope);
      copySlots(slots, childScope.previousSlots);
      pooled = {
        root,
        scope: childScope,
        key: group,
        index: placement.firstIndex,
        bindVersion: 0
      };
      state.flowHeaders.push(pooled);
    } else {
      const nextPath = `${parentScope.path}/flow:${headerPlan.planId}:${String(group)}`;
      const identityChanged = !Object.is(pooled.key, group) || pooled.scope.path !== nextPath;
      if (identityChanged || pooled.index !== placement.firstIndex) {
        pooled.key = group;
        pooled.index = placement.firstIndex;
        pooled.bindVersion++;
        pooled.scope.path = nextPath;
      }
      pooled.scope.items[pooled.scope.items.length - 1] = group;
      pooled.scope.indices[pooled.scope.indices.length - 1] = firstItem;
      evaluateScope(instance, pooled.scope, headerPlan.template, evaluator);
      collectSlotUpdates(instance, headerPlan.template, pooled.scope);
      syncStructures(instance, headerPlan.template, pooled.scope, false, false, resetDescendantScroll || identityChanged);
      copySlots(pooled.scope.slots, pooled.scope.previousSlots);
    }
    queueRecordProperty(instance, pooled.root, "__virtualParked", false);
    queueRecordProperty(instance, pooled.root, "__virtualSticky", false);
    queueRecordProperty(instance, pooled.root, "__virtualKey", group);
    queueRecordProperty(instance, pooled.root, "__virtualDirection", state.direction);
    queueRecordProperty(instance, pooled.root, "__virtualMainOffset", placement.mainOffset);
    queueRecordProperty(instance, pooled.root, "__virtualCrossOffset", 0);
    queueRecordProperty(instance, pooled.root, "__virtualMainSize", headerSize);
    queueRecordProperty(instance, pooled.root, "__virtualCrossSize", viewportCross);
  }
  for (let slotIndex = visible.length; slotIndex < state.flowHeaders.length; slotIndex++) {
    stopScopeTracking(state.flowHeaders[slotIndex].scope);
    queueRecordProperty(instance, state.flowHeaders[slotIndex].root, "__virtualParked", true);
  }
}
function syncStickyHeader(instance, parentScope, anchor, headerPlan, state, viewportCross, headerSize, resetDescendantScroll) {
  var _a;
  const source = state.source;
  const evaluator = (_a = instance.component.repeatEvaluators) === null || _a === void 0 ? void 0 : _a[headerPlan.planId];
  if (!source || !evaluator)
    return;
  const itemOffset = (index) => {
    var _a2, _b;
    var _c, _d;
    return (_d = (_c = (_a2 = state.listModel) === null || _a2 === void 0 ? void 0 : _a2.headerOffsetForIndex(index)) !== null && _c !== void 0 ? _c : (_b = state.gridModel) === null || _b === void 0 ? void 0 : _b.headerOffsetForIndex(index)) !== null && _d !== void 0 ? _d : 0;
  };
  const sticky = computeStickyHeader(source, (item) => {
    const group = readItemKey(item, headerPlan.groupKey);
    if (typeof group !== "string" && typeof group !== "number")
      throw new Error("Virtual group keys must be strings or numbers.");
    return group;
  }, itemOffset, state.offset, headerSize, state.groupStarts);
  if (!sticky) {
    if (state.header) {
      stopScopeTracking(state.header.scope);
      queueRecordProperty(instance, state.header.root, "__virtualParked", true);
    }
    return;
  }
  const firstItem = source.get(sticky.firstIndex);
  let header = state.header;
  if (!header) {
    const slots = new Array(headerPlan.itemSlotCount);
    const childScope = {
      path: `${parentScope.path}/${headerPlan.planId}:${String(sticky.group)}`,
      items: [...parentScope.items, sticky.group],
      indices: [...parentScope.indices, firstItem],
      slots,
      previousSlots: new Array(headerPlan.itemSlotCount),
      recordsByPlanId: /* @__PURE__ */ new Map(),
      repeats: /* @__PURE__ */ new Map(),
      virtuals: /* @__PURE__ */ new Map(),
      components: /* @__PURE__ */ new Map()
    };
    evaluateScope(instance, childScope, headerPlan.template, evaluator);
    const root = instantiatePlan(instance, headerPlan.template, anchor, anchor.children.length, childScope);
    anchor.children.push(root);
    syncStructures(instance, headerPlan.template, childScope);
    copySlots(slots, childScope.previousSlots);
    header = {
      root,
      scope: childScope,
      key: sticky.group,
      index: sticky.firstIndex,
      bindVersion: 0
    };
    state.header = header;
  } else {
    const nextPath = `${parentScope.path}/${headerPlan.planId}:${String(sticky.group)}`;
    const identityChanged = !Object.is(header.key, sticky.group) || header.scope.path !== nextPath;
    if (identityChanged) {
      header.key = sticky.group;
      header.bindVersion++;
      header.scope.path = nextPath;
    }
    header.index = sticky.firstIndex;
    header.scope.items[header.scope.items.length - 1] = sticky.group;
    header.scope.indices[header.scope.indices.length - 1] = firstItem;
    evaluateScope(instance, header.scope, headerPlan.template, evaluator);
    collectSlotUpdates(instance, headerPlan.template, header.scope);
    syncStructures(instance, headerPlan.template, header.scope, false, false, resetDescendantScroll || identityChanged);
    copySlots(header.scope.slots, header.scope.previousSlots);
  }
  queueRecordProperty(instance, header.root, "__virtualParked", false);
  queueRecordProperty(instance, header.root, "__virtualKey", sticky.group);
  queueRecordProperty(instance, header.root, "__virtualSticky", true);
  queueRecordProperty(instance, header.root, "__virtualDirection", state.direction);
  queueRecordProperty(instance, header.root, "__virtualMainOffset", sticky.offset);
  queueRecordProperty(instance, header.root, "__virtualCrossOffset", 0);
  queueRecordProperty(instance, header.root, "__virtualMainSize", headerSize);
  queueRecordProperty(instance, header.root, "__virtualCrossSize", viewportCross);
}
function captureVirtualAnchor(state) {
  var _a, _b, _c;
  var _d;
  if (state.pendingAnchor || state.range.lastVisible < 0)
    return;
  const index = state.range.firstVisible;
  const pooled = state.pool.find((entry) => entry.index === index);
  if (!pooled)
    return;
  const mainOffset = (_d = (_a = state.listModel) === null || _a === void 0 ? void 0 : _a.offsetAt(index)) !== null && _d !== void 0 ? _d : (_c = (_b = state.gridModel) === null || _b === void 0 ? void 0 : _b.placementAt(index)) === null || _c === void 0 ? void 0 : _c.mainOffset;
  if (mainOffset === void 0)
    return;
  state.pendingAnchor = {
    key: pooled.key,
    index,
    offsetInside: state.offset - mainOffset
  };
  state.metrics.anchorKey = String(pooled.key);
}
function collectGroupStarts(source, keyProperty) {
  if (source.length === 0)
    return [];
  const starts = [0];
  let previous = readItemKey(source.get(0), keyProperty);
  for (let index = 1; index < source.length; index++) {
    const current = readItemKey(source.get(index), keyProperty);
    if (!Object.is(previous, current))
      starts.push(index);
    previous = current;
  }
  return starts;
}
function resolveAnchorIndex(source, keyProperty, anchor) {
  if (anchor.index >= 0 && anchor.index < source.length && Object.is(readItemKey(source.get(anchor.index), keyProperty), anchor.key))
    return anchor.index;
  for (let index = 0; index < source.length; index++) {
    if (Object.is(readItemKey(source.get(index), keyProperty), anchor.key))
      return index;
  }
  return Math.max(0, Math.min(Math.max(0, source.length - 1), anchor.index));
}
function createVirtualController(instance, anchor, keyProperty, state) {
  const scrollToIndex = (index, align = "nearest", duration = 0) => {
    var _a, _b, _c, _d;
    var _e;
    state.cancelInitial(true);
    const safe = Math.max(0, Math.min(Math.max(0, ((_e = (_a = state.source) === null || _a === void 0 ? void 0 : _a.length) !== null && _e !== void 0 ? _e : 1) - 1), Math.trunc(index)));
    let target;
    if (state.listModel)
      target = state.listModel.offsetForIndex(safe, align);
    else {
      target = state.gridModel ? gridOffsetForIndex(state.gridModel, safe, align, state.offset, state.viewportMain) : 0;
    }
    const source = state.source;
    state.pendingAnchor = void 0;
    state.pendingScroll = {
      key: source && source.length > 0 ? readItemKey(source.get(safe), keyProperty) : safe,
      index: safe,
      align
    };
    state.metrics.anchorKey = String(state.pendingScroll.key);
    (_c = (_b = instance.driver).scrollVirtualTo) === null || _c === void 0 ? void 0 : _c.call(_b, anchor, state.direction, Math.max(0, target), duration);
    (_d = state.fillWindow) === null || _d === void 0 ? void 0 : _d.call(state);
  };
  return {
    scrollToIndex,
    scrollToKey(key, align = "nearest", duration = 0) {
      if (!state.source)
        return;
      const index = state.keyIndex.find(state.source, key, keyProperty);
      if (index !== -1)
        scrollToIndex(index, align, duration);
    },
    getVisibleRange: () => Object.assign({}, state.range),
    getMetrics: () => Object.assign({}, state.metrics),
    invalidateSize(index) {
      var _a;
      if (readSizeKey(anchor.props.sizeKey) !== void 0) {
        state.pendingChange = index === void 0 ? { type: "reset" } : { type: "update", index, count: 1 };
      } else {
        (_a = state.listModel) === null || _a === void 0 ? void 0 : _a.resetSize(index);
      }
      if (state.gridModel)
        state.signature = "";
      requestUpdate(instance);
    },
    stopScroll: () => {
      var _a, _b;
      return (_b = (_a = instance.driver).stopVirtualScroll) === null || _b === void 0 ? void 0 : _b.call(_a, anchor);
    }
  };
}
function gridOffsetForIndex(model, index, align, currentOffset, viewportMain) {
  const placement = model.placementAt(index);
  if (!placement)
    return 0;
  let target = placement.mainOffset;
  if (align === "center")
    target -= (viewportMain - placement.mainSize) / 2;
  else if (align === "end")
    target += placement.mainSize - viewportMain;
  else if (align === "nearest") {
    const end = placement.mainOffset + placement.mainSize;
    if (placement.mainOffset >= currentOffset && end <= currentOffset + viewportMain)
      return currentOffset;
    if (end > currentOffset + viewportMain)
      target = end - viewportMain;
  }
  return Math.max(0, Math.min(Math.max(0, model.contentSize - viewportMain), target));
}
function monotonicNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
function queueRecordProperty(instance, record, property, value) {
  if (sameBindingValue(property, value, record.props[property]))
    return;
  record.props[property] = value;
  instance.commands.push({ type: "update", record, property, value });
}
function assignController(value, controller) {
  if (typeof value === "function")
    value(controller);
  else if (isPlainRecord(value) && "current" in value)
    value.current = controller;
}
function isVirtualSource(value) {
  return value !== null && typeof value === "object" && typeof value.length === "number" && typeof value.get === "function" && typeof value.subscribe === "function";
}
function readOptionalPositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : void 0;
}
function readPositive(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
function readNonNegative(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
function readInteger(value, fallback, minimum) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, Math.trunc(value)) : fallback;
}
function readSizeKey(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function readSourceSizes(source, sizeKey) {
  const sizes = new Array(source.length);
  for (let index = 0; index < source.length; index++) {
    const item = source.get(index);
    if (item === null || typeof item !== "object" && typeof item !== "function") {
      throw new Error(`VirtualList sizeKey requires object items; received ${typeof item} at index ${index}.`);
    }
    const size = readOptionalPositive(item[sizeKey]);
    if (size === void 0) {
      throw new Error(`VirtualList sizeKey="${sizeKey}" must resolve to a positive number at index ${index}.`);
    }
    sizes[index] = size;
  }
  return sizes;
}
function updateSourceSizes(model, source, sizeKey, start, count) {
  const end = Math.min(source.length, Math.max(0, start + count));
  for (let index = Math.max(0, start); index < end; index++) {
    const item = source.get(index);
    if (item === null || typeof item !== "object" && typeof item !== "function") {
      throw new Error(`VirtualList sizeKey requires object items; received ${typeof item} at index ${index}.`);
    }
    const size = readOptionalPositive(item[sizeKey]);
    if (size === void 0) {
      throw new Error(`VirtualList sizeKey="${sizeKey}" must resolve to a positive number at index ${index}.`);
    }
    model.updateSize(index, size);
  }
}
function readDeclaredMainSize(record, direction) {
  if (!isPlainRecord(record.props.style))
    return void 0;
  return readOptionalPositive(record.props.style[direction === "vertical" ? "height" : "width"]);
}
function commit(instance, virtualAnchor) {
  if (instance.commands.length > 0) {
    const requiresLayout = instance.commands.some(commandRequiresLayout);
    instance.driver.validate(instance.commands);
    instance.driver.commit(instance.commands);
    instance.metrics.commits++;
    instance.metrics.commands += instance.commands.length;
    instance.commands.length = 0;
    if (requiresLayout && virtualAnchor && instance.driver.flushVirtualLayout) {
      instance.driver.flushVirtualLayout(virtualAnchor);
    } else if (requiresLayout) {
      instance.driver.flushLayout();
    }
  }
  runEffects(instance.layoutEffects, instance);
  if (instance.effects.length > 0)
    queueRuntimeMicrotask(() => runEffects(instance.effects, instance));
}
var layoutIndependentProperties = /* @__PURE__ */ new Set([
  "backgroundColor",
  "opacity",
  "scale",
  "translateX",
  "translateY",
  "transformDurationMs",
  "color",
  "tint",
  "outlineColor",
  "outlineWidth",
  "horizontalAlign",
  "verticalAlign",
  "cacheMode",
  "sizeMode",
  "pressScale",
  "pressOffset",
  "normalSource",
  "pressedSource",
  "disabledSource",
  "interactable",
  "name"
]);
function commandRequiresLayout(command) {
  if (command.type !== "update")
    return true;
  if (command.property.startsWith("on"))
    return false;
  return !layoutIndependentProperties.has(command.property);
}
function runEffects(effects, instance) {
  if (instance.destroyed)
    return;
  for (const effect of effects)
    effect();
  effects.length = 0;
}
function destroyInstance(instance) {
  var _a;
  if (instance.destroyed)
    return;
  instance.destroyed = true;
  unregisterRuntimeHotInstance(instance);
  globallyBatched.delete(instance);
  let failure;
  for (const hook of instance.hooks.values()) {
    try {
      (_a = hook.cleanup) === null || _a === void 0 ? void 0 : _a.call(hook);
    } catch (error) {
      failure !== null && failure !== void 0 ? failure : failure = error;
    }
  }
  disposeScope(instance.rootScope);
  appendDestroy(instance, instance.root);
  commit(instance);
  instance.rootScope.recordsByPlanId.clear();
  instance.rootScope.repeats.clear();
  if (failure)
    throw failure;
}
function disposeScope(scope) {
  var _a, _b, _c;
  scope.disposed = true;
  (_a = scope.computation) === null || _a === void 0 ? void 0 : _a.stop();
  scope.computation = void 0;
  for (const component of scope.components.values())
    disposeComponentInstance(component);
  scope.components.clear();
  for (const state of scope.virtuals.values()) {
    (_b = state.cancelInitial) === null || _b === void 0 ? void 0 : _b.call(state);
    (_c = state.unsubscribe) === null || _c === void 0 ? void 0 : _c.call(state);
    state.keyIndex.clear();
    for (const row of state.pool)
      disposeScope(row.scope);
    for (const header of state.flowHeaders)
      disposeScope(header.scope);
    if (state.header)
      disposeScope(state.header.scope);
  }
  for (const repeat of scope.repeats.values())
    repeat.dispose((entry) => disposeScope(entry.scope));
  scope.virtuals.clear();
  scope.repeats.clear();
  scope.recordsByPlanId.clear();
}
function disposeComponentInstance(instance) {
  var _a;
  if (instance.destroyed)
    return;
  instance.destroyed = true;
  unregisterRuntimeHotInstance(instance);
  instance.owner.dirtyComponents.delete(instance);
  let failure;
  for (const hook of instance.hooks.values()) {
    try {
      (_a = hook.cleanup) === null || _a === void 0 ? void 0 : _a.call(hook);
    } catch (error) {
      failure !== null && failure !== void 0 ? failure : failure = error;
    }
  }
  disposeScope(instance.rootScope);
  if (failure)
    throw failure;
}
function resetScopeComponents(scope) {
  for (const component of scope.components.values())
    resetComponentInstance(component);
  for (const repeat of scope.repeats.values())
    repeat.forEach((entry) => resetScopeComponents(entry.scope));
  for (const state of scope.virtuals.values()) {
    for (const row of [...state.pool, ...state.flowHeaders])
      resetScopeComponents(row.scope);
    if (state.header)
      resetScopeComponents(state.header.scope);
  }
}
function setBoundaryComponentsSuspended(scope, boundary, suspended) {
  visitScopeComponents(scope, (component) => {
    if (!recordIsInside(component.root, boundary))
      return;
    if (component.destroyed || component.suspended === suspended)
      return;
    component.suspended = suspended;
    if (suspended) {
      component.owner.dirtyComponents.delete(component);
      return;
    }
    schedulePendingRuntimeHotDefinition(component);
    if (component.rootDirty || component.dirtyScopes.size > 0)
      requestUpdate(component);
  });
}
function visitScopeComponents(scope, visit) {
  for (const component of scope.components.values()) {
    visit(component);
    visitScopeComponents(component.rootScope, visit);
  }
  for (const repeat of scope.repeats.values())
    repeat.forEach((entry) => visitScopeComponents(entry.scope, visit));
  for (const state of scope.virtuals.values()) {
    for (const row of [...state.pool, ...state.flowHeaders])
      visitScopeComponents(row.scope, visit);
    if (state.header)
      visitScopeComponents(state.header.scope, visit);
  }
}
function recordIsInside(record, boundary) {
  for (let current = record; current; current = current.parent)
    if (current === boundary)
      return true;
  return false;
}
function resetComponentInstance(instance) {
  var _a;
  instance.owner.dirtyComponents.delete(instance);
  for (const hook of instance.hooks.values())
    (_a = hook.cleanup) === null || _a === void 0 ? void 0 : _a.call(hook);
  instance.hooks.clear();
  instance.dirtyScopes.clear();
  resetScopeComponents(instance.rootScope);
  stopScopeTracking(instance.rootScope);
  instance.rootDirty = true;
  requestUpdate(instance);
}
function recordIsVisible(record) {
  for (let current = record; current; current = current.parent) {
    if (current.props.visible === false || current.props.__virtualParked === true || isPlainRecord(current.props.style) && current.props.style.display === "none")
      return false;
  }
  return true;
}
function suspendVirtualSubtree(record, reset) {
  var _a, _b;
  (_b = (_a = record.props).__virtualSuspend) === null || _b === void 0 ? void 0 : _b.call(_a, reset);
  for (const child of record.children)
    suspendVirtualSubtree(child, reset);
}
function appendDestroy(instance, record) {
  for (const child of record.children)
    appendDestroy(instance, child);
  instance.commands.push({ type: "remove", parent: record.parent, child: record });
  instance.commands.push({ type: "destroy", record });
  instance.metrics.nodesDestroyed++;
}
function readItemKey(item, property) {
  if (item === null || typeof item !== "object")
    throw new Error("Keyed For items must be objects.");
  const key = item[property];
  if (key === void 0 || key === null)
    throw new Error(`Keyed For key ${property} must not be null or undefined.`);
  return key;
}
async function settleActionSuccess(instance, record, generation, options, input, result) {
  var _a;
  if (!actionIsCurrent(instance, record, generation))
    return;
  try {
    await ((_a = options.onSuccess) === null || _a === void 0 ? void 0 : _a.call(options, result, input));
  } catch (error) {
    await settleActionError(instance, record, generation, options, input, error);
    return;
  }
  if (!actionIsCurrent(instance, record, generation))
    return;
  record.state.status = "success";
  record.state.result = result;
  record.state.error = void 0;
  requestUpdate(instance);
}
async function settleActionError(instance, record, generation, options, input, error) {
  if (!actionIsCurrent(instance, record, generation))
    return;
  record.state.status = "error";
  record.state.result = void 0;
  record.state.error = error;
  requestUpdate(instance);
  try {
    if (options.onError)
      await options.onError(error, input);
    else if (instance.runtimeOptions.onActionError)
      await instance.runtimeOptions.onActionError(error);
    else
      reportUnhandledActionError(error);
  } catch (reportingError) {
    reportUnhandledActionError(reportingError);
  }
}
function actionIsCurrent(instance, record, generation) {
  return !instance.destroyed && !record.disposed && record.generation === generation;
}
function reportUnhandledActionError(error) {
  const reporter = globalThis.reportError;
  if (typeof reporter === "function") {
    reporter.call(globalThis, error);
    return;
  }
  queueRuntimeMicrotask(() => {
    throw error;
  });
}
function applyHotTargets(input) {
  var _a, _b, _c, _d, _e;
  var _f;
  if (input.length === 0) {
    return {
      patchedInstances: 0,
      remountedInstances: 0,
      createdNodes: 0,
      destroyedNodes: 0
    };
  }
  const decisions = /* @__PURE__ */ new Map();
  for (const [instance, replacement] of input) {
    decisions.set(instance, hotRequiresRemount(instance.component, replacement));
  }
  const targets = input.filter(([instance]) => {
    for (const [ancestor, remount] of decisions) {
      if (remount && ancestor !== instance && ancestor.owner === instance.owner && recordIsInside(instance.root, ancestor.root))
        return false;
    }
    return true;
  }).sort(([left], [right]) => hotRecordDepth(left.root) - hotRecordDepth(right.root));
  const byOwner = /* @__PURE__ */ new Map();
  for (const target of targets) {
    const list = (_f = byOwner.get(target[0].owner)) !== null && _f !== void 0 ? _f : [];
    list.push(target);
    byOwner.set(target[0].owner, list);
  }
  const transactions = [];
  try {
    for (const [owner, ownerTargets] of byOwner) {
      if (owner.scheduled && !owner.suspended)
        flush(owner);
      if (owner.effects.length > 0)
        runEffects(owner.effects, owner);
      const transaction = {
        owner,
        commandStart: owner.commands.length,
        layoutEffectStart: owner.layoutEffects.length,
        effectStart: owner.effects.length,
        metrics: Object.assign({}, owner.metrics),
        dirtyComponents: new Set(owner.dirtyComponents),
        scheduled: owner.scheduled,
        flushQueued: owner.flushQueued,
        stages: []
      };
      transactions.push(transaction);
      hotStagingDepth++;
      try {
        for (const [instance, replacement] of ownerTargets) {
          transaction.stages.push(stageHotInstance(instance, replacement));
        }
      } finally {
        hotStagingDepth--;
      }
    }
    for (const transaction of transactions) {
      transaction.owner.driver.validate(transaction.owner.commands.slice(transaction.commandStart));
    }
    for (const transaction of transactions) {
      transaction.prepared = (_b = (_a = transaction.owner.driver).prepareCommit) === null || _b === void 0 ? void 0 : _b.call(_a, transaction.owner.commands.slice(transaction.commandStart));
    }
  } catch (error) {
    for (const transaction of [...transactions].reverse())
      (_c = transaction.prepared) === null || _c === void 0 ? void 0 : _c.rollback();
    for (const transaction of transactions.reverse())
      rollbackHotTransaction(transaction);
    throw error;
  }
  try {
    for (const transaction of transactions) {
      for (const stage of transaction.stages)
        stage.prepareCommit();
      const { owner, commandStart } = transaction;
      const commands = owner.commands.slice(commandStart);
      if (commands.length > 0) {
        if (transaction.prepared)
          transaction.prepared.commit();
        else
          owner.driver.commit(commands);
        if (commands.some(commandRequiresLayout))
          owner.driver.flushLayout();
      }
    }
  } catch (error) {
    for (const transaction of [...transactions].reverse())
      (_d = transaction.prepared) === null || _d === void 0 ? void 0 : _d.rollback();
    for (const transaction of [...transactions].reverse())
      rollbackHotTransaction(transaction);
    throw error;
  }
  let patchedInstances = 0;
  let remountedInstances = 0;
  let createdNodes = 0;
  let destroyedNodes = 0;
  for (const transaction of transactions) {
    const beforeCreated = transaction.metrics.nodesCreated;
    const beforeDestroyed = transaction.metrics.nodesDestroyed;
    (_e = transaction.prepared) === null || _e === void 0 ? void 0 : _e.finalize();
    for (const stage of transaction.stages) {
      stage.complete();
      if (stage.remounted)
        remountedInstances++;
      else
        patchedInstances++;
    }
    createdNodes += transaction.owner.metrics.nodesCreated - beforeCreated;
    destroyedNodes += transaction.owner.metrics.nodesDestroyed - beforeDestroyed;
  }
  for (const transaction of transactions)
    commitPreparedHotTransaction(transaction);
  return { patchedInstances, remountedInstances, createdNodes, destroyedNodes };
}
function stageHotInstance(instance, replacement) {
  var _a, _b;
  const currentFamily = (_a = instance.component.hot) === null || _a === void 0 ? void 0 : _a.familyId;
  const nextFamily = (_b = replacement.hot) === null || _b === void 0 ? void 0 : _b.familyId;
  if (!currentFamily || !nextFamily || currentFamily !== nextFamily) {
    throw new Error(`HMR family mismatch: ${currentFamily !== null && currentFamily !== void 0 ? currentFamily : "<missing>"} -> ${nextFamily !== null && nextFamily !== void 0 ? nextFamily : "<missing>"}`);
  }
  return hotRequiresRemount(instance.component, replacement) ? stageHotRemount(instance, replacement) : stageHotInPlace(instance, replacement);
}
function hotRequiresRemount(current, replacement) {
  var _a, _b, _c, _d;
  return ((_a = current.hot) === null || _a === void 0 ? void 0 : _a.hookSignature) !== ((_b = replacement.hot) === null || _b === void 0 ? void 0 : _b.hookSignature) || ((_c = current.hot) === null || _c === void 0 ? void 0 : _c.structureHash) !== ((_d = replacement.hot) === null || _d === void 0 ? void 0 : _d.structureHash) || current.plan.slotCount !== replacement.plan.slotCount;
}
function stageHotInPlace(instance, replacement) {
  const oldComponent = instance.component;
  const oldSlots = instance.slots.slice();
  const oldPreviousSlots = instance.previousSlots.slice();
  const oldEnvironment = instance.environment;
  const oldRootDirty = instance.rootDirty;
  const oldDirtyScopes = new Set(instance.dirtyScopes);
  const restoreHooks = snapshotHotHooks(instance.hooks);
  const restoreRecords = snapshotHotRecords(instance.root);
  const restoreChildren = snapshotHotChildInstances(instance.rootScope);
  const scopeSnapshot = snapshotHotScopeEvaluators(instance.rootScope);
  let rolledBack = false;
  const rollback = () => {
    if (rolledBack)
      return;
    rolledBack = true;
    instance.component = oldComponent;
    restoreArray(instance.slots, oldSlots);
    restoreArray(instance.previousSlots, oldPreviousSlots);
    instance.environment = oldEnvironment;
    instance.rootDirty = oldRootDirty;
    instance.dirtyScopes.clear();
    for (const scope of oldDirtyScopes)
      instance.dirtyScopes.add(scope);
    restoreHooks();
    restoreRecords();
    restoreChildren();
    scopeSnapshot.restore();
    try {
      evaluate(instance);
      scopeSnapshot.retrack();
      restoreArray(instance.slots, oldSlots);
      restoreArray(instance.previousSlots, oldPreviousSlots);
    } catch (_a) {
    }
  };
  try {
    forceHotEffects(instance.hooks);
    instance.component = replacement;
    instance.environment = /* @__PURE__ */ Object.create(null);
    instance.rootDirty = false;
    evaluate(instance);
    collectHotStaticUpdates(instance, oldComponent.plan.root, replacement.plan.root, instance.rootScope);
    collectSlotUpdates(instance, replacement.plan.root, instance.rootScope);
    syncStructures(instance, replacement.plan.root, instance.rootScope);
    copySlots(instance.slots, instance.previousSlots);
    instance.owner.metrics.componentUpdates++;
  } catch (error) {
    rollback();
    throw error;
  }
  return {
    instance,
    remounted: false,
    prepareCommit() {
    },
    complete() {
      instance.hotPending = void 0;
      instance.owner.dirtyComponents.delete(instance);
    },
    rollback
  };
}
function stageHotRemount(instance, replacement) {
  var _a, _b;
  const oldComponent = instance.component;
  const oldSlots = instance.slots;
  const oldPreviousSlots = instance.previousSlots;
  const oldRootScope = instance.rootScope;
  const oldHooks = instance.hooks;
  const oldEnvironment = instance.environment;
  const oldDirtyScopes = instance.dirtyScopes;
  const oldRoot = instance.root;
  const oldRootDirty = instance.rootDirty;
  const parent = oldRoot.parent;
  const oldIndex = parent ? parent.children.indexOf(oldRoot) : 0;
  if (parent && oldIndex < 0)
    throw new Error("HMR target is detached from its parent.");
  const hooksCompatible = ((_a = oldComponent.hot) === null || _a === void 0 ? void 0 : _a.hookSignature) === ((_b = replacement.hot) === null || _b === void 0 ? void 0 : _b.hookSignature);
  const restoreHooks = hooksCompatible ? snapshotHotHooks(oldHooks) : void 0;
  const nextHooks = hooksCompatible ? oldHooks : /* @__PURE__ */ new Map();
  const slots = new Array(replacement.plan.slotCount);
  const rootScope = {
    path: oldRootScope.path,
    items: oldRootScope.items,
    indices: oldRootScope.indices,
    slots,
    previousSlots: new Array(replacement.plan.slotCount),
    recordsByPlanId: /* @__PURE__ */ new Map(),
    repeats: /* @__PURE__ */ new Map(),
    virtuals: /* @__PURE__ */ new Map(),
    components: /* @__PURE__ */ new Map()
  };
  let preparedParent = false;
  let completed = false;
  let restored = false;
  const restore = () => {
    if (restored || completed)
      return;
    restored = true;
    if (preparedParent && parent)
      parent.children.splice(oldIndex, 1, oldRoot);
    try {
      disposeScope(rootScope);
    } catch (_a2) {
    }
    if (!hooksCompatible)
      cleanupHotHooks(nextHooks, instance);
    else
      restoreHooks === null || restoreHooks === void 0 ? void 0 : restoreHooks();
    instance.component = oldComponent;
    instance.slots = oldSlots;
    instance.previousSlots = oldPreviousSlots;
    instance.rootScope = oldRootScope;
    instance.hooks = oldHooks;
    instance.environment = oldEnvironment;
    instance.dirtyScopes = oldDirtyScopes;
    instance.root = oldRoot;
    instance.rootDirty = oldRootDirty;
  };
  try {
    if (hooksCompatible)
      forceHotEffects(nextHooks);
    instance.component = replacement;
    instance.slots = slots;
    instance.previousSlots = rootScope.previousSlots;
    instance.rootScope = rootScope;
    instance.hooks = nextHooks;
    instance.environment = /* @__PURE__ */ Object.create(null);
    instance.dirtyScopes = /* @__PURE__ */ new Set();
    instance.rootDirty = false;
    evaluate(instance);
    instance.root = instantiatePlan(instance, replacement.plan.root, parent, oldIndex, rootScope);
    syncStructures(instance, replacement.plan.root, rootScope);
    copySlots(instance.slots, instance.previousSlots);
    appendDestroy(instance, oldRoot);
    instance.owner.metrics.componentUpdates++;
  } catch (error) {
    restore();
    throw error;
  }
  return {
    instance,
    remounted: true,
    prepareCommit() {
      if (parent)
        parent.children.splice(oldIndex, 1, instance.root);
      preparedParent = true;
    },
    complete() {
      completed = true;
      instance.hotPending = void 0;
      instance.owner.dirtyComponents.delete(instance);
      if (!hooksCompatible)
        cleanupHotHooks(oldHooks, instance);
      try {
        disposeScope(oldRootScope);
      } catch (error) {
        void reportRuntimeError(instance, error);
      }
      registerHotSubtree(rootScope);
    },
    rollback: restore
  };
}
function commitPreparedHotTransaction(transaction) {
  const { owner, commandStart } = transaction;
  const commands = owner.commands.slice(commandStart);
  if (commands.length > 0) {
    owner.metrics.commits++;
    owner.metrics.commands += commands.length;
    owner.commands.splice(commandStart);
  }
  runEffects(owner.layoutEffects, owner);
  if (owner.effects.length > 0)
    queueRuntimeMicrotask(() => runEffects(owner.effects, owner));
  owner.scheduled = owner.dirtyComponents.size > 0;
  if (owner.scheduled)
    schedule(owner);
}
function rollbackHotTransaction(transaction) {
  const commands = transaction.owner.commands.slice(transaction.commandStart);
  for (const stage of [...transaction.stages].reverse())
    stage.rollback();
  const created = commands.filter((command) => command.type === "create").map((command) => command.record);
  transaction.owner.commands.splice(transaction.commandStart);
  transaction.owner.layoutEffects.splice(transaction.layoutEffectStart);
  transaction.owner.effects.splice(transaction.effectStart);
  Object.assign(transaction.owner.metrics, transaction.metrics);
  transaction.owner.dirtyComponents.clear();
  for (const instance of transaction.dirtyComponents)
    transaction.owner.dirtyComponents.add(instance);
  transaction.owner.scheduled = transaction.scheduled;
  transaction.owner.flushQueued = transaction.flushQueued;
  if (created.length > 0) {
    try {
      transaction.owner.driver.commit(created.reverse().map((record) => ({ type: "destroy", record })));
    } catch (_a) {
    }
  }
}
function snapshotHotHooks(hooks) {
  const entries = [...hooks.entries()];
  const fields = entries.map(([id, hook]) => {
    const action = hook.kind === "action" ? hook.value : void 0;
    const tabs = hook.kind === "tabs" ? hook.value : void 0;
    const reference = hook.kind === "ref" ? hook.value : void 0;
    return {
      id,
      hook,
      kind: hook.kind,
      value: hook.value,
      setter: hook.setter,
      deps: hook.deps,
      cleanup: hook.cleanup,
      action,
      actionExecute: action === null || action === void 0 ? void 0 : action.execute,
      actionOptions: action === null || action === void 0 ? void 0 : action.options,
      tabs,
      tabsCallback: tabs === null || tabs === void 0 ? void 0 : tabs.onSelectionChange,
      reference,
      referenceCurrent: reference === null || reference === void 0 ? void 0 : reference.current
    };
  });
  return () => {
    hooks.clear();
    for (const field of fields) {
      field.hook.kind = field.kind;
      field.hook.value = field.value;
      field.hook.setter = field.setter;
      field.hook.deps = field.deps;
      field.hook.cleanup = field.cleanup;
      if (field.action) {
        field.action.execute = field.actionExecute;
        field.action.options = field.actionOptions;
      }
      if (field.tabs)
        field.tabs.onSelectionChange = field.tabsCallback;
      if (field.reference)
        field.reference.current = field.referenceCurrent;
      hooks.set(field.id, field.hook);
    }
  };
}
function forceHotEffects(hooks) {
  for (const hook of hooks.values()) {
    if (hook.kind === "effect" || hook.kind === "layout-effect")
      hook.deps = void 0;
  }
}
function cleanupHotHooks(hooks, instance) {
  var _a;
  for (const hook of hooks.values()) {
    try {
      (_a = hook.cleanup) === null || _a === void 0 ? void 0 : _a.call(hook);
    } catch (error) {
      void reportRuntimeError(instance, error);
    }
  }
}
function snapshotHotRecords(root) {
  const records = [];
  const visit = (record) => {
    records.push({
      record,
      props: Object.assign({}, record.props),
      children: record.children.slice(),
      parent: record.parent
    });
    for (const child of record.children)
      visit(child);
  };
  visit(root);
  return () => {
    for (const { record, props, children, parent } of records) {
      for (const property of Object.keys(record.props))
        delete record.props[property];
      Object.assign(record.props, props);
      record.children.splice(0, record.children.length, ...children);
      record.parent = parent;
    }
  };
}
function snapshotHotChildInstances(scope) {
  const snapshots = [];
  visitScopeComponents(scope, (instance) => {
    snapshots.push({ instance, props: instance.props, rootDirty: instance.rootDirty });
  });
  return () => {
    for (const snapshot of snapshots) {
      snapshot.instance.props = snapshot.props;
      snapshot.instance.rootDirty = snapshot.rootDirty;
    }
  };
}
function snapshotHotScopeEvaluators(scope) {
  const snapshots = [];
  const visit = (current) => {
    snapshots.push({
      scope: current,
      template: current.template,
      repeatEvaluator: current.repeatEvaluator,
      slots: current.slots.slice(),
      previousSlots: current.previousSlots.slice()
    });
    for (const repeat of current.repeats.values())
      repeat.forEach((entry) => visit(entry.scope));
    for (const state of current.virtuals.values()) {
      for (const row of [...state.pool, ...state.flowHeaders])
        visit(row.scope);
      if (state.header)
        visit(state.header.scope);
    }
  };
  visit(scope);
  const restoreSlots = (snapshot) => {
    restoreArray(snapshot.scope.slots, snapshot.slots);
    restoreArray(snapshot.scope.previousSlots, snapshot.previousSlots);
  };
  return {
    restore() {
      for (const snapshot of snapshots) {
        snapshot.scope.template = snapshot.template;
        snapshot.scope.repeatEvaluator = snapshot.repeatEvaluator;
        restoreSlots(snapshot);
      }
    },
    retrack() {
      var _a;
      let failure;
      for (const snapshot of snapshots) {
        if (!snapshot.scope.repeatEvaluator || snapshot.scope.disposed)
          continue;
        try {
          (_a = snapshot.scope.computation) === null || _a === void 0 ? void 0 : _a.run();
        } catch (error) {
          failure !== null && failure !== void 0 ? failure : failure = error;
        } finally {
          restoreSlots(snapshot);
        }
      }
      if (failure)
        throw failure;
    }
  };
}
function collectHotStaticUpdates(instance, current, replacement, scope) {
  var _a;
  var _b, _c, _d, _e, _f;
  if (current.kind === "component" || replacement.kind === "component")
    return;
  const record = scope.recordsByPlanId.get(replacement.planId);
  if (!record)
    return;
  const bound = new Set(((_b = replacement.bindings) !== null && _b !== void 0 ? _b : []).map((binding) => binding.property));
  const properties = /* @__PURE__ */ new Set([
    ...Object.keys((_c = current.props) !== null && _c !== void 0 ? _c : {}),
    ...Object.keys((_d = replacement.props) !== null && _d !== void 0 ? _d : {})
  ]);
  for (const property of properties) {
    if (bound.has(property))
      continue;
    queueRecordProperty(instance, record, property, (_a = replacement.props) === null || _a === void 0 ? void 0 : _a[property]);
  }
  const currentChildren = (_e = current.children) !== null && _e !== void 0 ? _e : [];
  const replacementChildren = (_f = replacement.children) !== null && _f !== void 0 ? _f : [];
  for (let index = 0; index < replacementChildren.length; index++) {
    collectHotStaticUpdates(instance, currentChildren[index], replacementChildren[index], scope);
  }
}
function restoreArray(target, values) {
  target.splice(0, target.length, ...values);
}
function hotRecordDepth(record) {
  let depth = 0;
  for (let current = record.parent; current; current = current.parent)
    depth++;
  return depth;
}
function collectHotDefinitions(component, output) {
  var _a, _b, _c, _d, _e;
  var _f;
  const familyId = (_a = component.hot) === null || _a === void 0 ? void 0 : _a.familyId;
  if (!familyId)
    throw new Error(`Compiled component ${component.plan.name} has no HMR metadata.`);
  const existing = output.get(familyId);
  if (existing && (((_b = existing.hot) === null || _b === void 0 ? void 0 : _b.hookSignature) !== ((_c = component.hot) === null || _c === void 0 ? void 0 : _c.hookSignature) || ((_d = existing.hot) === null || _d === void 0 ? void 0 : _d.structureHash) !== ((_e = component.hot) === null || _e === void 0 ? void 0 : _e.structureHash)))
    throw new Error(`Conflicting HMR family definition: ${familyId}`);
  if (existing)
    return;
  output.set(familyId, component);
  for (const child of Object.values((_f = component.components) !== null && _f !== void 0 ? _f : {}))
    collectHotDefinitions(child, output);
}
function resolveRuntimeHotDefinition(component) {
  var _a;
  return (_a = runtimeHotAdapter === null || runtimeHotAdapter === void 0 ? void 0 : runtimeHotAdapter.resolve(component)) !== null && _a !== void 0 ? _a : component;
}
function registerRuntimeHotInstance(instance) {
  runtimeHotAdapter === null || runtimeHotAdapter === void 0 ? void 0 : runtimeHotAdapter.register(instance);
}
function unregisterRuntimeHotInstance(instance) {
  runtimeHotAdapter === null || runtimeHotAdapter === void 0 ? void 0 : runtimeHotAdapter.unregister(instance);
}
function applyPendingRuntimeHotDefinition(instance) {
  runtimeHotAdapter === null || runtimeHotAdapter === void 0 ? void 0 : runtimeHotAdapter.applyPending(instance);
}
function schedulePendingRuntimeHotDefinition(instance) {
  runtimeHotAdapter === null || runtimeHotAdapter === void 0 ? void 0 : runtimeHotAdapter.schedulePending(instance);
}
function resolveLatestHotDefinition(component) {
  var _a;
  var _b;
  const familyId = (_a = component.hot) === null || _a === void 0 ? void 0 : _a.familyId;
  return (_b = familyId ? latestHotDefinitions.get(familyId) : void 0) !== null && _b !== void 0 ? _b : component;
}
function registerHotInstance(instance) {
  var _a;
  var _b;
  if (hotStagingDepth > 0)
    return;
  const familyId = (_a = instance.component.hot) === null || _a === void 0 ? void 0 : _a.familyId;
  if (!familyId)
    return;
  latestHotDefinitions.set(familyId, instance.component);
  const instances = (_b = hotInstancesByFamily.get(familyId)) !== null && _b !== void 0 ? _b : /* @__PURE__ */ new Set();
  instances.add(instance);
  hotInstancesByFamily.set(familyId, instances);
}
function unregisterHotInstance(instance) {
  var _a;
  const familyId = (_a = instance.component.hot) === null || _a === void 0 ? void 0 : _a.familyId;
  if (!familyId)
    return;
  const instances = hotInstancesByFamily.get(familyId);
  instances === null || instances === void 0 ? void 0 : instances.delete(instance);
  if ((instances === null || instances === void 0 ? void 0 : instances.size) === 0)
    hotInstancesByFamily.delete(familyId);
}
function registerHotSubtree(scope) {
  visitScopeComponents(scope, registerHotInstance);
}
function applyPendingHotDefinition(instance) {
  const targets = [];
  const collect = (candidate) => {
    if (candidate.hotPending && !candidate.destroyed && !candidate.suspended && !candidate.owner.suspended)
      targets.push([
        candidate,
        candidate.hotPending
      ]);
  };
  collect(instance);
  if (instance.owner === instance)
    visitScopeComponents(instance.rootScope, collect);
  if (!targets.length)
    return;
  for (const [candidate] of targets)
    candidate.hotPending = void 0;
  try {
    applyHotTargets(targets);
  } catch (error) {
    for (const [candidate, replacement] of targets)
      if (!candidate.destroyed)
        candidate.hotPending = replacement;
    void reportRuntimeError(instance, error);
  }
}
function schedulePendingHotDefinition(instance) {
  if (!instance.hotPending)
    return;
  queueRuntimeMicrotask(() => applyPendingHotDefinition(instance));
}
function registerEffect(hookId, effect, deps, layout) {
  const instance = requireInstance();
  assertHookId(hookId);
  const kind = layout ? "layout-effect" : "effect";
  let hook = readHook(instance, hookId, kind);
  if (hook && sameDeps(hook.deps, deps))
    return;
  const previousCleanup = hook === null || hook === void 0 ? void 0 : hook.cleanup;
  hook !== null && hook !== void 0 ? hook : hook = { kind, value: void 0 };
  hook.deps = deps.slice();
  instance.hooks.set(hookId, hook);
  const queue = layout ? instance.layoutEffects : instance.effects;
  queue.push(() => {
    previousCleanup === null || previousCleanup === void 0 ? void 0 : previousCleanup();
    hook.cleanup = effect();
  });
}
function readHook(instance, hookId, kind) {
  const hook = instance.hooks.get(hookId);
  if ((hook === null || hook === void 0 ? void 0 : hook.kind) !== void 0 && hook.kind !== kind) {
    throw new Error(`Compiler hook ${hookId} changed from ${hook.kind} to ${kind}; a local reset is required.`);
  }
  return hook;
}
function ensureMarkerHook(instance, hookId, kind) {
  if (!readHook(instance, hookId, kind)) {
    instance.hooks.set(hookId, { kind, value: void 0 });
  }
}
function requireInstance() {
  if (!activeInstance)
    throw new Error("Hooks may only run inside a compiled component evaluator.");
  return activeInstance;
}
function assertHookId(hookId) {
  if (!Number.isInteger(hookId) || hookId < 0)
    throw new Error(`Invalid compiler hook id: ${hookId}`);
  if (hookId === activeHookId)
    throw new Error(`Duplicate compiler hook id: ${hookId}`);
  activeHookId = hookId;
}
function sameDeps(a, b) {
  return a !== void 0 && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}
function copySlots(from, to) {
  for (let index = 0; index < from.length; index++)
    to[index] = from[index];
}
function sameBindingValue(property, next, previous) {
  if (Object.is(next, previous))
    return true;
  return property === "style" && sameStyleValue(next, previous);
}
function sameComponentProps(previous, next) {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  return previousKeys.length === nextKeys.length && nextKeys.every((key) => Object.is(previous[key], next[key]));
}
function sameStyleValue(next, previous) {
  if (Object.is(next, previous))
    return true;
  if (!isPlainRecord(next) || !isPlainRecord(previous))
    return false;
  const nextKeys = Object.keys(next);
  const previousKeys = Object.keys(previous);
  if (nextKeys.length !== previousKeys.length)
    return false;
  return nextKeys.every((key) => key in previous && sameStyleField(next[key], previous[key]));
}
function sameStyleField(next, previous) {
  if (Object.is(next, previous))
    return true;
  if (!isPlainRecord(next) || !isPlainRecord(previous))
    return false;
  const nextKeys = Object.keys(next);
  const previousKeys = Object.keys(previous);
  return nextKeys.length === previousKeys.length && nextKeys.every((key) => key in previous && sameStyleField(next[key], previous[key]));
}
function isPlainRecord(value) {
  if (value === null || typeof value !== "object")
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function isHostKind(value) {
  return value === "view" || value === "text" || value === "input" || value === "image" || value === "scroll-view" || value === "virtual-list";
}
function freezePlan(plan) {
  var _a;
  if (plan.kind === "component") {
    if (plan.props)
      Object.freeze(plan.props);
    if (plan.bindings)
      Object.freeze(plan.bindings);
    Object.freeze(plan);
    return;
  }
  if (plan.behavior) {
    if (plan.behavior.floating)
      Object.freeze(plan.behavior.floating);
    Object.freeze(plan.behavior);
  }
  for (const child of (_a = plan.children) !== null && _a !== void 0 ? _a : [])
    freezePlan(child);
  if (plan.repeat) {
    freezePlan(plan.repeat.template);
    Object.freeze(plan.repeat);
  }
  if (plan.virtual) {
    freezePlan(plan.virtual.template);
    if (plan.virtual.header) {
      freezePlan(plan.virtual.header.template);
      Object.freeze(plan.virtual.header);
    }
    Object.freeze(plan.virtual);
  }
  if (plan.props) {
    for (const value of Object.values(plan.props))
      freezePlanValue(value);
    Object.freeze(plan.props);
  }
  freezeModuleInfo(plan.moduleInfo);
  Object.freeze(plan.bindings);
  Object.freeze(plan.children);
  Object.freeze(plan);
}
function freezeModuleInfo(info) {
  if (!info || Object.isFrozen(info))
    return;
  Object.freeze(info.features);
  Object.freeze(info.configKeys);
  Object.freeze(info.dataModules);
  Object.freeze(info.services);
  Object.freeze(info);
}
function freezePlanValue(value) {
  if (!isPlainRecord(value) && !Array.isArray(value))
    return;
  for (const child of Object.values(value))
    freezePlanValue(child);
  Object.freeze(value);
}

export {
  resolveStyleValue,
  enableComponentHMR,
  defineCompiledComponent,
  applyHotUpdate,
  resetHotDefinitionsForRootRestart,
  mountComponent,
  useState,
  useTabs,
  useSurfaceContext,
  useNavigationContext,
  useRef,
  useAction,
  useMemo,
  useEffect,
  useLayoutEffect,
  batch,
  Show,
  KeyedFor,
  isHostKind
};
