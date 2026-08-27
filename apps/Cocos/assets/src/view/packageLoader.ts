/**
 * FairyGUI 包加载的无头可测边界。
 *
 * FairyGUI 自身的 `UIPackage.loadPackage` 没有 AbortSignal 或 deadline 参数，
 * 因此这里把「一次底层请求」和「调用方等待窗口」分开：调用方关闭/超时后
 * 立即得到可判别错误，底层回调仍会被观察；共享包在成功后继续常驻，下一次
 * 调用可以在失败/超时后重新发起请求。
 */

export const DEFAULT_FGUI_PACKAGE_DEADLINE_MS = 15_000;

export type FguiPackageErrorCode =
    | "FGUI_PACKAGE_MISSING"
    | "FGUI_PACKAGE_TIMEOUT"
    | "FGUI_PACKAGE_CANCELLED";

/** 只依赖标准 JS API 的 FairyGUI 运行时最小面。 */
export interface FguiPackageRuntime {
    getByName(name: string): unknown;
    loadPackage(path: string, callback: (error: unknown, pkg?: unknown) => void): void;
}

/** 可替换时钟，供无头测试在不等待真实时间的情况下推进 deadline。 */
export interface FguiPackageScheduler {
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
}

export interface FguiPackageLoaderConfig {
    /** 每个调用方最多等待的毫秒数；非负有限整数。 */
    deadlineMs?: number;
    scheduler?: FguiPackageScheduler;
}

export interface FguiPackageLoadOptions {
    /** 关闭页面或场景世代变化时传入的信号。 */
    signal?: AbortSignal;
    /** 覆盖 loader 默认等待窗口；从本次调用开始计时。 */
    deadlineMs?: number;
}

function nativeScheduler(): FguiPackageScheduler {
    return {
        setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
        clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
}

function normalizeDeadline(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`[fgui] package deadline 必须是非负安全整数: ${String(value)}`);
    }
    return value;
}

function packageNameOf(path: string): string {
    if (typeof path !== "string" || path.length === 0) {
        throw new TypeError("[fgui] package path 不能为空");
    }
    const normalized = path.replace(/\/+$/, "");
    const slash = normalized.lastIndexOf("/");
    const name = normalized.slice(slash + 1);
    if (!name) throw new TypeError(`[fgui] package path 无效: ${path}`);
    return name;
}

function causeText(cause: unknown): string {
    if (cause === undefined || cause === null || cause === "") return "";
    return cause instanceof Error ? cause.message : String(cause);
}

function signalReason(signal: AbortSignal): unknown {
    // AbortSignal.reason was added after the ES2017/older Creator typings; keep
    // the runtime hint optional so the package loader compiles with either set.
    return (signal as AbortSignal & { reason?: unknown }).reason;
}

/**
 * 包加载失败的稳定边界。缺包与超时均标记为可重试；取消是生命周期控制流，
 * 但仍带 code 方便上层区分并避免把它显示成资源故障。
 */
export class FguiPackageLoadError extends Error {
    readonly retryable: boolean;
    readonly packageName: string;
    readonly packagePath: string;
    readonly deadlineMs?: number;
    readonly kind: "missing" | "timeout" | "cancelled";
    readonly cause?: unknown;

    constructor(
        readonly code: FguiPackageErrorCode,
        packagePath: string,
        cause?: unknown,
        deadlineMs?: number,
    ) {
        const packageName = packageNameOf(packagePath);
        const kind = code === "FGUI_PACKAGE_TIMEOUT"
            ? "timeout"
            : code === "FGUI_PACKAGE_CANCELLED" ? "cancelled" : "missing";
        const suffix = causeText(cause);
        const message = code === "FGUI_PACKAGE_TIMEOUT"
            ? `[fgui] package ${packagePath} 加载超时${deadlineMs === undefined ? "" : ` (${deadlineMs}ms)`}`
            : code === "FGUI_PACKAGE_CANCELLED"
                ? `[fgui] package ${packagePath} 加载已取消`
                : `[fgui] required package ${packagePath} 不可用${suffix ? `: ${suffix}` : ""}`;
        super(message);
        this.name = "FguiPackageLoadError";
        this.packageName = packageName;
        this.packagePath = packagePath;
        this.deadlineMs = deadlineMs;
        this.kind = kind;
        this.retryable = code !== "FGUI_PACKAGE_CANCELLED";
        this.cause = cause;
        // ES2017 下 Error 子类在部分 Creator JS 运行时需要显式修正原型链。
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class FguiPackageMissingError extends FguiPackageLoadError {
    constructor(packagePath: string, cause?: unknown) {
        super("FGUI_PACKAGE_MISSING", packagePath, cause);
        this.name = "FguiPackageMissingError";
    }
}

export class FguiPackageTimeoutError extends FguiPackageLoadError {
    constructor(packagePath: string, deadlineMs?: number) {
        super("FGUI_PACKAGE_TIMEOUT", packagePath, undefined, deadlineMs);
        this.name = "FguiPackageTimeoutError";
    }
}

export class FguiPackageCancelledError extends FguiPackageLoadError {
    constructor(packagePath: string, cause?: unknown) {
        super("FGUI_PACKAGE_CANCELLED", packagePath, cause);
        this.name = "FguiPackageCancelledError";
    }
}

export function isFguiPackageLoadError(value: unknown): value is FguiPackageLoadError {
    if (value instanceof FguiPackageLoadError) return true;
    if (typeof value !== "object" || value === null) return false;
    const code = (value as { code?: unknown }).code;
    return code === "FGUI_PACKAGE_MISSING"
        || code === "FGUI_PACKAGE_TIMEOUT"
        || code === "FGUI_PACKAGE_CANCELLED";
}

interface PackageResult {
    readonly error: unknown;
    readonly pkg: unknown;
}

interface InflightRequest {
    readonly path: string;
    readonly name: string;
    readonly generation: number;
    readonly promise: Promise<PackageResult>;
    settled: boolean;
    waiters: number;
}

/**
 * 统一处理在途合流、deadline 与生命周期取消。
 *
 * `loadPackage` 本身没有取消 API，所以取消最后一个 waiter 时只释放本地
 * in-flight 索引，不会伪造或丢弃底层回调。迟到成功仍可把共享包留在运行时
 * 缓存中；迟到失败不会产生未观察 rejection。
 */
export class FguiPackageLoader {
    private readonly inflight = new Map<string, InflightRequest>();
    private readonly successfulGeneration = new Map<string, number>();
    private readonly nextGeneration = new Map<string, number>();
    private deadlineMs: number;
    private scheduler: FguiPackageScheduler;
    private readonly initialScheduler: FguiPackageScheduler;

    constructor(
        private readonly runtime: FguiPackageRuntime,
        config: FguiPackageLoaderConfig = {},
    ) {
        this.deadlineMs = normalizeDeadline(config.deadlineMs ?? DEFAULT_FGUI_PACKAGE_DEADLINE_MS);
        this.initialScheduler = config.scheduler ?? nativeScheduler();
        this.scheduler = this.initialScheduler;
    }

    get defaultDeadlineMs(): number {
        return this.deadlineMs;
    }

    configure(config: FguiPackageLoaderConfig): void {
        if (config.deadlineMs !== undefined) this.deadlineMs = normalizeDeadline(config.deadlineMs);
        if (config.scheduler !== undefined) this.scheduler = config.scheduler;
    }

    reset(): void {
        this.deadlineMs = DEFAULT_FGUI_PACKAGE_DEADLINE_MS;
        this.scheduler = this.initialScheduler;
    }

    /** 加载一个包；已加载包直接复用，不会重复调用 FairyGUI。 */
    async load(path: string, options: FguiPackageLoadOptions = {}): Promise<void> {
        const name = packageNameOf(path);
        if (options.signal?.aborted) throw new FguiPackageCancelledError(path, signalReason(options.signal));
        // Validate the per-waiter deadline before allocating an in-flight
        // request. Invalid control input must not start a FairyGUI load only to
        // fail later inside waitFor.
        if (options.deadlineMs !== undefined) normalizeDeadline(options.deadlineMs);
        if (this.hasPackage(name)) return;

        const request = this.inflight.get(path) ?? this.start(path, name);
        request.waiters++;
        try {
            const result = await this.waitFor(request, options);
            // A stale request may report an error after another attempt has
            // already registered the package. Prefer the usable package in that
            // case, so a late failure cannot make a successful retry look broken.
            const newerSuccess = (this.successfulGeneration.get(path) ?? -1) > request.generation;
            if (result.error !== undefined && result.error !== null && !newerSuccess) {
                throw new FguiPackageMissingError(path, result.error);
            }
            // A successful callback without a registered package is indistinguishable
            // from a missing export and must not let createObject silently return null.
            if (!this.hasPackage(name)) throw new FguiPackageMissingError(path);
        } finally {
            request.waiters = Math.max(0, request.waiters - 1);
            // `waitFor` may have detached the request before this finally runs;
            // re-check after decrement so the last cancelled waiter really frees
            // the retry slot while other waiters keep their dedupe entry.
            this.detach(request);
        }
    }

    async ensure(paths: readonly string[], options: FguiPackageLoadOptions = {}): Promise<void> {
        await Promise.all(paths.map((path) => this.load(path, options)));
    }

    private hasPackage(name: string): boolean {
        return Boolean(this.packageByName(name));
    }

    private packageByName(name: string): unknown {
        try {
            return this.runtime.getByName(name);
        } catch {
            return undefined;
        }
    }

    private start(path: string, name: string): InflightRequest {
        let resolveResult!: (result: PackageResult) => void;
        const generation = (this.nextGeneration.get(path) ?? 0) + 1;
        this.nextGeneration.set(path, generation);
        const request: InflightRequest = {
            path,
            name,
            generation,
            promise: new Promise<PackageResult>((resolve) => { resolveResult = resolve; }),
            settled: false,
            waiters: 0,
        };
        // Install before invoking the runtime: Creator may call the callback synchronously.
        this.inflight.set(path, request);
        const complete = (error: unknown, pkg?: unknown): void => {
            if (request.settled) return;
            request.settled = true;
            if (this.inflight.get(path) === request) this.inflight.delete(path);
            const registered = this.packageByName(name);
            let completionError = error;
            // FairyGUI should return the package it just registered.  If an
            // adapter reports a different object, fail closed instead of
            // allowing createObject to consume an unrelated/stale package.
            if ((error === undefined || error === null)
                && pkg !== undefined && pkg !== null
                && registered !== undefined && pkg !== registered) {
                completionError = new Error(`[fgui] package ${path} callback 与注册对象不一致`);
            }
            // Record only a usable, successful generation. A later success can
            // mask an older timed-out request's late error; an error callback
            // that still registered a partial package must remain a failure.
            if ((completionError === undefined || completionError === null) && Boolean(registered)) {
                const previous = this.successfulGeneration.get(path) ?? -1;
                if (generation > previous) this.successfulGeneration.set(path, generation);
            }
            resolveResult({ error: completionError ?? null, pkg: registered ?? pkg ?? null });
        };
        try {
            this.runtime.loadPackage(path, complete);
        } catch (error) {
            complete(error);
        }
        // The request promise always resolves and is consumed by every waiter; this
        // catch is defensive if a future runtime adapter changes that invariant.
        request.promise.catch(() => undefined);
        return request;
    }

    private detach(request: InflightRequest, includeCurrentWaiter = false): void {
        const noOtherWaiters = includeCurrentWaiter ? request.waiters <= 1 : request.waiters === 0;
        if (noOtherWaiters && this.inflight.get(request.path) === request) {
            this.inflight.delete(request.path);
        }
    }

    private waitFor(request: InflightRequest, options: FguiPackageLoadOptions): Promise<PackageResult> {
        const deadlineMs = normalizeDeadline(options.deadlineMs ?? this.deadlineMs);
        const signal = options.signal;
        // A caller may reconfigure the global scheduler while this waiter is in
        // flight (for example, a test teardown). Keep timer creation/cleanup on
        // the same scheduler instance.
        const scheduler = this.scheduler;
        return new Promise<PackageResult>((resolve, reject) => {
            let finished = false;
            let timer: unknown = null;
            let abortListener: (() => void) | null = null;

            const cleanup = (): void => {
                if (timer !== null) {
                    scheduler.clearTimeout(timer);
                    timer = null;
                }
                if (abortListener && signal) {
                    signal.removeEventListener("abort", abortListener);
                    abortListener = null;
                }
            };
            const finish = (callback: () => void): void => {
                if (finished) return;
                finished = true;
                cleanup();
                callback();
            };
            const cancel = (error: FguiPackageLoadError): void => {
                // Release the retry slot synchronously when this is the only
                // waiter. The async `load` finally block still decrements the
                // accounting counter; a caller may retry before that microtask.
                this.detach(request, true);
                finish(() => reject(error));
            };

            request.promise.then(
                (result) => finish(() => resolve(result)),
                (error) => finish(() => reject(new FguiPackageMissingError(request.path, error))),
            );
            if (signal?.aborted) {
                cancel(new FguiPackageCancelledError(request.path, signalReason(signal)));
                return;
            }
            abortListener = signal ? () => cancel(new FguiPackageCancelledError(request.path, signalReason(signal))) : null;
            if (abortListener && signal) signal.addEventListener("abort", abortListener, { once: true });
            if (deadlineMs <= 0) {
                cancel(new FguiPackageTimeoutError(request.path, deadlineMs));
            } else {
                timer = scheduler.setTimeout(() => cancel(new FguiPackageTimeoutError(request.path, deadlineMs)), deadlineMs);
            }
        });
    }
}
