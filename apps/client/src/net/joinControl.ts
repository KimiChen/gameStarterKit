/**
 * Client-side join lifetime contract shared by Lobby and Game transports.
 *
 * `timeoutMs`/`timeout` are durations; `deadlineMs`/`deadline` are absolute
 * Unix milliseconds.  The old relative-vs-absolute magnitude heuristic made a
 * caller typo silently turn into an immediate or multi-year timer, so values
 * are validated before any timer is armed.
 */

/** Node/browser timers use a signed 32-bit millisecond delay in practice. */
export const MAX_JOIN_TIMER_MS = 2_147_483_647;
export const DEFAULT_JOIN_TIMEOUT_MS = 15_000;

export interface JoinControlValues {
  readonly timeoutMs?: unknown;
  readonly deadlineMs?: unknown;
  readonly timeout?: unknown;
  readonly deadline?: unknown;
}

/**
 * Runtime guard for the optional cancellation object.  The public APIs accept
 * `AbortSignal` for convenience, but callers can still pass an arbitrary
 * object at runtime (and a Proxy can throw while its members are read).  Do
 * this check before allocating a transport slot so malformed controls cannot
 * strand an owner or leak a listener.
 */
export function normalizeJoinSignal(value: unknown): AbortSignal | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    if (typeof value !== "object" && typeof value !== "function") {
      throw new TypeError("signal must be an object");
    }
    const candidate = value as {
      aborted?: unknown;
      addEventListener?: unknown;
      removeEventListener?: unknown;
    };
    if (typeof candidate.aborted !== "boolean"
      || typeof candidate.addEventListener !== "function"
      || typeof candidate.removeEventListener !== "function") {
      throw new TypeError("signal shape");
    }
    return value as AbortSignal;
  } catch {
    throw new TypeError("[join] signal 必须是有效的 AbortSignal");
  }
}

/** Distinguish a signal argument from the JoinControl object without trusting traps. */
export function looksLikeJoinSignal(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "object" && typeof value !== "function") return false;
  try {
    const record = value as object;
    return "aborted" in record || "addEventListener" in record || "removeEventListener" in record;
  } catch {
    throw new TypeError("[join] signal 无法读取");
  }
}

/** Observe a thenable returned by a non-standard signal adapter. */
export function observeJoinControlResult(value: unknown): void {
  try {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return;
    if (typeof (value as { then?: unknown }).then !== "function") return;
    Promise.resolve(value).catch(() => {});
  } catch {
    // A hostile thenable is treated as a failed best-effort cleanup.  There is
    // no useful recovery path, but its rejection must remain observed.
  }
}

function finiteSafeInteger(raw: unknown, label: string, max: number): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw > max) {
    throw new RangeError(`[join] ${label} 必须是 0..${max} 的安全整数`);
  }
  return raw;
}

/**
 * Resolve a validated wait duration. `nowMs` is injectable for deterministic
 * tests; production callers use Date.now().
 */
export function waitMsForJoin(control: JoinControlValues = {}, nowMs = Date.now()): number {
  const durationKeys = ([
    ["timeoutMs", control.timeoutMs],
    ["timeout", control.timeout],
  ] as Array<[string, unknown]>).filter(([, value]) => value !== undefined);
  const deadlineKeys = ([
    ["deadlineMs", control.deadlineMs],
    ["deadline", control.deadline],
  ] as Array<[string, unknown]>).filter(([, value]) => value !== undefined);
  if (durationKeys.length + deadlineKeys.length > 1) {
    throw new RangeError("[join] timeout/deadline 只能指定一个字段");
  }
  if (deadlineKeys.length === 1) {
    const deadline = finiteSafeInteger(deadlineKeys[0][1], deadlineKeys[0][0], Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new RangeError("[join] nowMs 必须是安全整数");
    }
    const remaining = deadline - nowMs;
    if (remaining > MAX_JOIN_TIMER_MS) {
      throw new RangeError(`[join] deadline 距今不能超过 ${MAX_JOIN_TIMER_MS}ms`);
    }
    return Math.max(0, remaining);
  }
  if (durationKeys.length === 1) {
    return finiteSafeInteger(durationKeys[0][1], durationKeys[0][0], MAX_JOIN_TIMER_MS);
  }
  return DEFAULT_JOIN_TIMEOUT_MS;
}
