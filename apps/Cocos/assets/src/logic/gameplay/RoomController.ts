import type {
    GameplayContext,
    GameplayPlugin,
    GameplayStopReason,
    RoomCapability,
} from "./GameplayPlugin";
import type { GameplayRegistry } from "./GameplayRegistry";

export type GameplayControllerStatus =
    | "idle"
    | "starting"
    | "running"
    | "stopping"
    | "stopped"
    | "failed"
    | "disposed";

export type GameplayStartResult =
    | { readonly status: "started"; readonly generation: number; readonly pluginId: string }
    | { readonly status: "already-running"; readonly generation: number; readonly pluginId: string }
    | { readonly status: "cancelled"; readonly generation: number; readonly pluginId: string }
    | { readonly status: "failed"; readonly generation: number; readonly pluginId: string; readonly error: unknown }
    | { readonly status: "busy"; readonly generation: number; readonly pluginId: string }
    | { readonly status: "disposed"; readonly generation: number; readonly pluginId: string };

export interface GameplayRoomJoiner<TRoom = unknown> {
    join(signal: AbortSignal): RoomCapability<TRoom>;
}

interface ActiveGameplay<TRoom, TInput> {
    readonly generation: number;
    readonly plugin: GameplayPlugin<TRoom, TInput>;
    readonly controller: AbortController;
    lease: RoomCapability<TRoom>;
    leavePromise: Promise<void> | null;
    status: GameplayControllerStatus;
    cancelled: boolean;
    room?: TRoom;
    context?: GameplayContext<TRoom>;
    startHookEntered: boolean;
    stopHookCalled: boolean;
    disposeCalled: boolean;
    detachSignal: (() => void) | null;
    startPromise: Promise<GameplayStartResult>;
}

/**
 * 玩法与房间之间的生命周期编排器。
 *
 * 它只拥有一次 join 返回的 lease，不暴露任何“当前房”全局状态。停止会先让
 * generation 失效，再释放 lease；因此迟到的 ready 只能在 start flow 的 finally
 * 中清理自己的房间，不可能污染下一局。
 */
export class RoomController<TRoom = unknown, TInput = unknown> {
    private active: ActiveGameplay<TRoom, TInput> | null = null;
    private generation = 0;
    private disposed = false;
    private lastStatus: GameplayControllerStatus = "idle";

    constructor(private readonly joiner: GameplayRoomJoiner<TRoom>) {
        if (!joiner || typeof joiner.join !== "function") {
            throw new TypeError("[RoomController] joiner.join 必须是函数");
        }
    }

    get status(): GameplayControllerStatus {
        return this.active?.status ?? (this.disposed ? "disposed" : this.lastStatus);
    }

    get currentGeneration(): number {
        return this.active?.generation ?? this.generation;
    }

    get pluginId(): string | null {
        return this.active?.plugin.id ?? null;
    }

    /** 启动一个玩法；同一插件的并发启动合流，不同插件必须先 stop。 */
    start(plugin: GameplayPlugin<TRoom, TInput>, signal?: AbortSignal): Promise<GameplayStartResult> {
        if (!plugin || typeof plugin !== "object" || typeof plugin.start !== "function") {
            return Promise.resolve({
                status: "failed",
                generation: this.generation,
                pluginId: "",
                error: new TypeError("[RoomController] 无效的 GameplayPlugin"),
            });
        }
        const id = plugin.id;
        if (typeof id !== "string" || id.trim().length === 0) {
            return Promise.resolve({
                status: "failed",
                generation: this.generation,
                pluginId: String(id ?? ""),
                error: new TypeError("[RoomController] plugin.id 不能为空"),
            });
        }
        const current = this.active;
        if (this.disposed) {
            return Promise.resolve({ status: "disposed", generation: this.generation, pluginId: id });
        }
        if (current) {
            if (current.plugin === plugin && current.status === "starting") return current.startPromise;
            if (current.plugin === plugin && current.status === "running") {
                return Promise.resolve({ status: "already-running", generation: current.generation, pluginId: id });
            }
            return Promise.resolve({ status: "busy", generation: current.generation, pluginId: id });
        }

        const controller = new AbortController();
        const active: ActiveGameplay<TRoom, TInput> = {
            generation: ++this.generation,
            plugin,
            controller,
            lease: undefined as unknown as RoomCapability<TRoom>,
            leavePromise: null,
            status: "starting",
            cancelled: false,
            startHookEntered: false,
            stopHookCalled: false,
            disposeCalled: false,
            detachSignal: null,
            startPromise: undefined as unknown as Promise<GameplayStartResult>,
        };
        this.active = active;

        const detachSignal = bridgeAbort(signal, controller, () => {
            active.cancelled = true;
            // An external abort during a running plugin must actually tear down
            // the lease; during synchronous join setup runStart will observe the
            // flag after the lease is assigned.
            if (active.lease) void this.stop({ kind: "cancelled" });
        });
        active.detachSignal = detachSignal;
        if (controller.signal.aborted) {
            detachSignal();
            active.detachSignal = null;
            active.cancelled = true;
            active.status = "stopped";
            this.lastStatus = "stopped";
            this.active = null;
            const cancelled = (async (): Promise<GameplayStartResult> => {
                await this.disposePlugin(active);
                return { status: "cancelled", generation: active.generation, pluginId: id };
            })();
            return cancelled;
        }
        let lease: RoomCapability<TRoom>;
        try {
            lease = this.joiner.join(controller.signal);
            if (!lease || typeof lease.leave !== "function" || !lease.ready || typeof lease.ready.then !== "function") {
                throw new TypeError("[RoomController] joiner 必须返回带 ready/leave 的 room capability");
            }
        } catch (error) {
            detachSignal();
            active.detachSignal = null;
            active.status = "failed";
            this.lastStatus = "failed";
            this.active = null;
            void this.disposePlugin(active);
            return Promise.resolve({ status: "failed", generation: active.generation, pluginId: id, error });
        }
        active.lease = lease;
        const promise = this.runStart(active, detachSignal);
        active.startPromise = promise;
        return promise;
    }

    /** 从登记表创建并启动玩法；登记表本身不参与 room 生命周期。 */
    startRegistered(
        registry: GameplayRegistry<TRoom, TInput>,
        id: string,
        signal?: AbortSignal,
    ): Promise<GameplayStartResult> {
        try {
            return this.start(registry.create(id), signal);
        } catch (error) {
            return Promise.resolve({
                status: "failed",
                generation: this.generation,
                pluginId: id,
                error,
            });
        }
    }

    /** 将输入送入当前运行中的插件；旧 generation 或非 running 状态一律丢弃。 */
    async input(input: TInput): Promise<boolean> {
        const active = this.active;
        if (!active || active.status !== "running" || !active.plugin.handleInput || !active.context) return false;
        try {
            await active.plugin.handleInput(input, active.context);
            return this.isCurrent(active) && active.status === "running";
        } catch (error) {
            await this.stop({ kind: "plugin-error", error });
            return false;
        }
    }

    /** 推进当前插件的逻辑时钟；dt 非有限或负数时 fail-closed。 */
    async tick(dt: number): Promise<boolean> {
        const active = this.active;
        if (!active || active.status !== "running" || !active.plugin.tick || !active.context) return false;
        if (!Number.isFinite(dt) || dt < 0) return false;
        try {
            await active.plugin.tick(dt, active.context);
            return this.isCurrent(active) && active.status === "running";
        } catch (error) {
            await this.stop({ kind: "plugin-error", error });
            return false;
        }
    }

    /** 停止当前玩法。停止操作可重复调用，且不会等待不可取消的黑洞 join。 */
    async stop(reason: GameplayStopReason = { kind: "manual" }): Promise<void> {
        const active = this.active;
        if (!active) return;
        const wasStarting = active.status === "starting";
        active.cancelled = true;
        active.controller.abort();
        active.detachSignal?.();
        active.detachSignal = null;
        // 先摘掉当前 generation；后续 start 可以立即建立新的一局。
        this.active = null;
        active.status = "stopping";
        this.lastStatus = "stopping";

        // RoomClient ownership 的 leave 在 join 在途时必须快速返回；即便底层实现
        // 不可取消，迟到 room 也由它自己的 lease 负责清理。
        const leave = this.leaveActive(active);
        if (active.startHookEntered && active.context && !wasStarting) {
            await this.stopPlugin(active, reason);
        }
        await leave;
        await this.disposePlugin(active);
        active.status = "stopped";
        this.lastStatus = "stopped";
    }

    /** stop 的语义别名，供场景/路由取消当前 transition。 */
    cancel(): Promise<void> {
        return this.stop({ kind: "cancelled" });
    }

    /** 永久销毁控制器；之后的 start 返回 disposed。 */
    async dispose(): Promise<void> {
        if (this.disposed) return;
        this.disposed = true;
        await this.stop({ kind: "disposed" });
    }

    private async runStart(active: ActiveGameplay<TRoom, TInput>, _detachSignal: () => void): Promise<GameplayStartResult> {
        let room: TRoom | undefined;
        try {
            room = await active.lease.ready;
            if (!this.isCurrent(active) || active.cancelled || active.controller.signal.aborted) {
                await this.leaveActive(active);
                await this.disposePlugin(active);
                active.detachSignal?.();
                active.detachSignal = null;
                active.status = "stopped";
                this.lastStatus = "stopped";
                return { status: "cancelled", generation: active.generation, pluginId: active.plugin.id };
            }
            active.room = room;
            active.context = {
                room,
                signal: active.controller.signal,
                generation: active.generation,
                isActive: () => this.isCurrent(active) && !active.cancelled && !active.controller.signal.aborted,
            };
            active.startHookEntered = true;
            await active.plugin.start(active.context);
            if (!this.isCurrent(active) || active.cancelled || active.controller.signal.aborted) {
                await this.stopPlugin(active, { kind: "cancelled" });
                await this.leaveActive(active);
                await this.disposePlugin(active);
                active.detachSignal?.();
                active.detachSignal = null;
                active.status = "stopped";
                this.lastStatus = "stopped";
                return { status: "cancelled", generation: active.generation, pluginId: active.plugin.id };
            }
            active.status = "running";
            this.lastStatus = "running";
            return { status: "started", generation: active.generation, pluginId: active.plugin.id };
        } catch (error) {
            if (active.startHookEntered && active.context) {
                await this.stopPlugin(active, { kind: "plugin-error", error });
            }
            await this.leaveActive(active);
            await this.disposePlugin(active);
            active.detachSignal?.();
            active.detachSignal = null;
            if (this.isCurrent(active)) {
                this.active = null;
                active.status = "failed";
                this.lastStatus = "failed";
            }
            if (active.cancelled || active.controller.signal.aborted) {
                return { status: "cancelled", generation: active.generation, pluginId: active.plugin.id };
            }
            return { status: "failed", generation: active.generation, pluginId: active.plugin.id, error };
        } finally {
            // Keep the caller's AbortSignal bridged for the whole running lifetime;
            // stop()/dispose() removes it after invalidating this generation.
            if (active.status !== "running") {
                active.detachSignal?.();
                active.detachSignal = null;
            }
        }
    }

    private isCurrent(active: ActiveGameplay<TRoom, TInput>): boolean {
        return this.active === active;
    }

    private leaveActive(active: ActiveGameplay<TRoom, TInput>): Promise<void> {
        // A joiner may synchronously re-enter stop() before returning its lease.
        // Do not memoize this empty path; runStart must still release the lease
        // once it becomes available.
        if (!active.lease) return Promise.resolve();
        if (!active.leavePromise) active.leavePromise = safeLeave(active.lease);
        return active.leavePromise;
    }

    private async stopPlugin(active: ActiveGameplay<TRoom, TInput>, reason: GameplayStopReason): Promise<void> {
        if (active.stopHookCalled || !active.plugin.stop || !active.context) return;
        active.stopHookCalled = true;
        try {
            await active.plugin.stop(reason, active.context);
        } catch (error) {
            console.error(`[RoomController] 插件 ${active.plugin.id} stop 失败`, error);
        }
    }

    private async disposePlugin(active: ActiveGameplay<TRoom, TInput>): Promise<void> {
        if (active.disposeCalled || !active.plugin.dispose) return;
        active.disposeCalled = true;
        try {
            await active.plugin.dispose();
        } catch (error) {
            console.error(`[RoomController] 插件 ${active.plugin.id} dispose 失败`, error);
        }
    }
}

function bridgeAbort(source: AbortSignal | undefined, target: AbortController, onAbort?: () => void): () => void {
    if (!source) return () => {};
    const abort = () => {
        target.abort();
        onAbort?.();
    };
    if (source.aborted) abort();
    else source.addEventListener("abort", abort, { once: true });
    return () => source.removeEventListener("abort", abort);
}

async function safeLeave<TRoom>(lease: RoomCapability<TRoom> | undefined): Promise<void> {
    if (!lease) return;
    try {
        await lease.leave();
    } catch (error) {
        console.error("[RoomController] room leave 失败", error);
    }
}
