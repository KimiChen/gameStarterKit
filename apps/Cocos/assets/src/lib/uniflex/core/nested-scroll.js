// frontend/packages/core/dist/virtual/nested-scroll.js
var NestedScrollCoordinator = class {
  constructor(threshold = 8, directionDominance = 1.25, minimumFlingVelocity = 60, maximumFlingVelocity = 6e3, velocityScale = 0.5, ballisticFriction = 4, edgeLimit = 32, springDuration = 0.22) {
    this.threshold = threshold;
    this.directionDominance = directionDominance;
    this.minimumFlingVelocity = minimumFlingVelocity;
    this.maximumFlingVelocity = maximumFlingVelocity;
    this.velocityScale = velocityScale;
    this.ballisticFriction = ballisticFriction;
    this.edgeLimit = edgeLimit;
    this.springDuration = springDuration;
    this.origin = null;
    this.axis = null;
    this.currentPhase = "idle";
    this.accumulatedX = 0;
    this.accumulatedY = 0;
    this.elapsed = 0;
    this.lastConsumer = null;
    this.ballisticVelocity = 0;
    this.edgeTarget = null;
    this.overscroll = 0;
    this.springStart = 0;
    this.springElapsed = 0;
    this.samples = [];
    if (!(threshold >= 0))
      throw new RangeError("Nested scroll threshold must be non-negative.");
    if (!(directionDominance >= 1))
      throw new RangeError("Direction dominance must be at least one.");
    if (!(minimumFlingVelocity >= 0))
      throw new RangeError("Minimum fling velocity must be non-negative.");
    if (!(maximumFlingVelocity >= minimumFlingVelocity))
      throw new RangeError("Maximum fling velocity is invalid.");
    if (!(velocityScale > 0 && velocityScale <= 1))
      throw new RangeError("Nested scroll velocity scale is invalid.");
    if (!(ballisticFriction > 0))
      throw new RangeError("Ballistic friction must be positive.");
    if (!(edgeLimit > 0))
      throw new RangeError("Nested scroll edge limit must be positive.");
    if (!(springDuration > 0))
      throw new RangeError("Nested scroll spring duration must be positive.");
  }
  get phase() {
    return this.currentPhase;
  }
  get lockedAxis() {
    return this.axis;
  }
  get isAnimating() {
    return this.currentPhase === "ballistic" || this.currentPhase === "spring";
  }
  begin(target) {
    var _a;
    this.clearSession();
    this.origin = target;
    this.currentPhase = "pending";
    this.samples.push({ time: 0, x: 0, y: 0 });
    for (let current = target; current; current = current.parent) {
      current.stop();
      (_a = current.beginDrag) === null || _a === void 0 ? void 0 : _a.call(current);
    }
  }
  move(deltaX, deltaY, elapsedSeconds) {
    if (!this.origin || this.currentPhase !== "pending" && this.currentPhase !== "dragging")
      return null;
    const elapsed = sanitizeElapsed(elapsedSeconds);
    this.elapsed += elapsed;
    this.accumulatedX += finiteOrZero(deltaX);
    this.accumulatedY += finiteOrZero(deltaY);
    this.pushSample(this.elapsed, this.accumulatedX, this.accumulatedY);
    let lockedThisMove = false;
    if (!this.axis) {
      this.axis = lockDirection(this.accumulatedX, this.accumulatedY, this.threshold, this.directionDominance);
      if (!this.axis)
        return null;
      this.currentPhase = "dragging";
      lockedThisMove = true;
    }
    let delta = this.axis === "horizontal" ? lockedThisMove ? this.accumulatedX : finiteOrZero(deltaX) : lockedThisMove ? this.accumulatedY : finiteOrZero(deltaY);
    delta = this.consumeOverscrollOnReverse(delta);
    const result = this.consume(delta);
    if (result.last)
      this.lastConsumer = result.last;
    this.applyTerminalOverscroll(result);
    return result.last;
  }
  /** Consumes a wheel or trackpad delta without starting touch inertia. */
  wheel(target, deltaX, deltaY) {
    if (this.currentPhase !== "idle")
      this.cancel();
    const x = finiteOrZero(deltaX);
    const y = finiteOrZero(deltaY);
    const axis = Math.abs(x) > Math.abs(y) ? "horizontal" : "vertical";
    const delta = axis === "horizontal" ? x : y;
    if (Math.abs(delta) < 1e-4)
      return null;
    for (let current = target; current; current = current.parent)
      current.stop();
    return consumeChain(target, axis, delta).last;
  }
  end() {
    const consumer = this.lastConsumer;
    if (!this.origin || this.currentPhase !== "dragging" || !this.axis) {
      this.finishNativeDrag(null);
      this.clearSession();
      return consumer;
    }
    if (consumer === null || consumer === void 0 ? void 0 : consumer.releaseDrag) {
      this.finishNativeDrag(consumer);
      this.clearSession();
      return consumer;
    }
    if (this.edgeTarget && Math.abs(this.overscroll) >= 1e-4) {
      this.startSpring();
      return consumer;
    }
    const velocity = clamp(estimateVelocity(this.samples, this.axis) * this.velocityScale, -this.maximumFlingVelocity, this.maximumFlingVelocity);
    if (Math.abs(velocity) < this.minimumFlingVelocity) {
      this.clearSession();
      return consumer;
    }
    this.ballisticVelocity = velocity;
    this.currentPhase = "ballistic";
    this.samples.length = 0;
    return consumer;
  }
  /** Advances coordinator-owned inertia and uses the same child-to-parent chain as dragging. */
  advance(elapsedSeconds) {
    var _a;
    if (this.currentPhase === "spring")
      return this.advanceSpring(elapsedSeconds);
    if (this.currentPhase !== "ballistic" || !this.origin || !this.axis)
      return null;
    const elapsed = Math.min(1 / 15, sanitizeElapsed(elapsedSeconds));
    const decay = Math.exp(-this.ballisticFriction * elapsed);
    const delta = this.ballisticVelocity * (1 - decay) / this.ballisticFriction;
    this.ballisticVelocity *= decay;
    const result = this.consume(delta);
    if (result.last)
      this.lastConsumer = result.last;
    const reachedTerminalEdge = Math.abs(result.remaining) > 0.01;
    if (reachedTerminalEdge && ((_a = result.terminal) === null || _a === void 0 ? void 0 : _a.setOverscroll)) {
      this.applyTerminalOverscroll(result);
      this.startSpring();
    } else if (!result.last || reachedTerminalEdge || Math.abs(this.ballisticVelocity) < this.minimumFlingVelocity) {
      this.clearSession();
    }
    return result.last;
  }
  /** Native targets keep Cocos cancel behavior; pure targets cancel without inertia. */
  cancel() {
    var _a;
    this.finishNativeDrag(((_a = this.lastConsumer) === null || _a === void 0 ? void 0 : _a.releaseDrag) ? this.lastConsumer : null);
    this.clearSession();
  }
  finishNativeDrag(consumer) {
    var _a, _b;
    for (let current = this.origin; current; current = current.parent) {
      if (current === consumer)
        (_a = current.releaseDrag) === null || _a === void 0 ? void 0 : _a.call(current);
      else
        (_b = current.discardDrag) === null || _b === void 0 ? void 0 : _b.call(current);
    }
  }
  consume(delta) {
    if (!this.origin || !this.axis || Math.abs(delta) < 1e-4) {
      return { last: null, terminal: null, consumed: 0, remaining: delta };
    }
    return consumeChain(this.origin, this.axis, delta);
  }
  consumeOverscrollOnReverse(delta) {
    var _a, _b;
    if (!this.edgeTarget || Math.abs(this.overscroll) < 1e-4 || delta * this.overscroll >= 0)
      return delta;
    const recovery = Math.sign(delta) * Math.min(Math.abs(delta), Math.abs(this.overscroll));
    this.overscroll += recovery;
    delta -= recovery;
    if (Math.abs(this.overscroll) < 1e-4) {
      (_b = (_a = this.edgeTarget).setOverscroll) === null || _b === void 0 ? void 0 : _b.call(_a, 0);
      this.edgeTarget = null;
      this.overscroll = 0;
    } else {
      this.updateOverscrollVisual();
    }
    return delta;
  }
  applyTerminalOverscroll(result) {
    var _a, _b, _c;
    if (!((_a = result.terminal) === null || _a === void 0 ? void 0 : _a.setOverscroll) || Math.abs(result.remaining) < 1e-4)
      return;
    if (this.edgeTarget && this.edgeTarget !== result.terminal)
      (_c = (_b = this.edgeTarget).setOverscroll) === null || _c === void 0 ? void 0 : _c.call(_b, 0);
    this.edgeTarget = result.terminal;
    if (this.overscroll !== 0 && this.overscroll * result.remaining < 0)
      this.overscroll = 0;
    this.overscroll += result.remaining;
    this.updateOverscrollVisual();
  }
  updateOverscrollVisual() {
    var _a, _b;
    if (!this.edgeTarget)
      return;
    const distance = Math.sign(this.overscroll) * this.edgeLimit * (1 - Math.exp(-Math.abs(this.overscroll) / this.edgeLimit));
    (_b = (_a = this.edgeTarget).setOverscroll) === null || _b === void 0 ? void 0 : _b.call(_a, distance);
  }
  startSpring() {
    this.currentPhase = "spring";
    this.springStart = this.overscroll;
    this.springElapsed = 0;
    this.ballisticVelocity = 0;
    this.samples.length = 0;
  }
  advanceSpring(elapsedSeconds) {
    const target = this.edgeTarget;
    if (!target) {
      this.clearSession();
      return null;
    }
    this.springElapsed += sanitizeElapsed(elapsedSeconds);
    const progress = Math.min(1, this.springElapsed / this.springDuration);
    const remaining = Math.pow(1 - progress, 3);
    this.overscroll = this.springStart * remaining;
    this.updateOverscrollVisual();
    if (progress >= 1)
      this.clearSession();
    return target;
  }
  pushSample(time, x, y) {
    this.samples.push({ time, x, y });
    while (this.samples.length > 8)
      this.samples.shift();
    const oldestTime = time - 0.1;
    while (this.samples.length > 2 && this.samples[0].time < oldestTime)
      this.samples.shift();
  }
  clearSession() {
    var _a, _b;
    (_b = (_a = this.edgeTarget) === null || _a === void 0 ? void 0 : _a.setOverscroll) === null || _b === void 0 ? void 0 : _b.call(_a, 0);
    this.origin = null;
    this.axis = null;
    this.currentPhase = "idle";
    this.accumulatedX = 0;
    this.accumulatedY = 0;
    this.elapsed = 0;
    this.lastConsumer = null;
    this.ballisticVelocity = 0;
    this.edgeTarget = null;
    this.overscroll = 0;
    this.springStart = 0;
    this.springElapsed = 0;
    this.samples.length = 0;
  }
};
var NestedScrollStateCache = class {
  constructor(capacity = 512) {
    this.capacity = capacity;
    this.values = /* @__PURE__ */ new Map();
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new RangeError("Nested scroll cache capacity must be positive.");
  }
  get size() {
    return this.values.size;
  }
  save(path, offset) {
    if (!path)
      return;
    this.values.delete(path);
    this.values.set(path, Math.max(0, Number.isFinite(offset) ? offset : 0));
    while (this.values.size > this.capacity) {
      const oldest = this.values.keys().next().value;
      if (oldest === void 0)
        break;
      this.values.delete(oldest);
    }
  }
  restore(path) {
    const value = this.values.get(path);
    if (value === void 0)
      return void 0;
    this.values.delete(path);
    this.values.set(path, value);
    return value;
  }
  delete(path) {
    this.values.delete(path);
  }
  deletePrefix(prefix) {
    for (const path of this.values.keys())
      if (path.startsWith(prefix))
        this.values.delete(path);
  }
};
function consumeChain(origin, axis, delta) {
  let remaining = delta;
  let consumedTotal = 0;
  let last = null;
  let terminal = null;
  let current = nearestDirection(origin, axis);
  while (current && Math.abs(remaining) >= 1e-4) {
    terminal = current;
    const reported = finiteOrZero(current.scrollBy(remaining));
    const consumed = clampConsumed(reported, remaining);
    if (Math.abs(consumed) >= 1e-4) {
      remaining -= consumed;
      consumedTotal += consumed;
      last = current;
    }
    current = nearestDirection(current.parent, axis);
  }
  while (current) {
    terminal = current;
    current = nearestDirection(current.parent, axis);
  }
  return { last, terminal, consumed: consumedTotal, remaining };
}
function nearestDirection(target, direction) {
  for (let current = target; current; current = current.parent) {
    if (current.direction === direction)
      return current;
  }
  return null;
}
function lockDirection(x, y, threshold, dominance) {
  const magnitude = Math.hypot(x, y);
  if (magnitude < threshold)
    return null;
  const absoluteX = Math.abs(x);
  const absoluteY = Math.abs(y);
  if (absoluteX >= absoluteY * dominance)
    return "horizontal";
  if (absoluteY >= absoluteX * dominance)
    return "vertical";
  if (magnitude >= threshold * 2)
    return absoluteX >= absoluteY ? "horizontal" : "vertical";
  return null;
}
function estimateVelocity(samples, axis) {
  if (samples.length < 2)
    return 0;
  const firstTime = samples[0].time;
  let sumTime = 0;
  let sumPosition = 0;
  let sumTimeSquared = 0;
  let sumTimePosition = 0;
  for (const sample of samples) {
    const time = sample.time - firstTime;
    const position = axis === "horizontal" ? sample.x : sample.y;
    sumTime += time;
    sumPosition += position;
    sumTimeSquared += time * time;
    sumTimePosition += time * position;
  }
  const count = samples.length;
  const denominator = count * sumTimeSquared - sumTime * sumTime;
  if (Math.abs(denominator) < 1e-6)
    return 0;
  return (count * sumTimePosition - sumTime * sumPosition) / denominator;
}
function clampConsumed(consumed, requested) {
  if (requested > 0)
    return clamp(consumed, 0, requested);
  return clamp(consumed, requested, 0);
}
function sanitizeElapsed(value) {
  if (!Number.isFinite(value) || value <= 0)
    return 1 / 60;
  return Math.min(0.05, Math.max(1 / 240, value));
}
function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
export {
  NestedScrollCoordinator,
  NestedScrollStateCache
};
