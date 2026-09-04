/**
 * FeatureHost（Non-intrusive §7.2 阶段 5b）：feature module 的 app/session scope、
 * 安装状态与 dispose 的唯一所有者。⛔ 不拥有当前 route（那是 NavigationService 的）。
 *
 * 状态机：unloaded / loading / active / disposing / failed / disabled(app-generation)。
 *  - 并发加载同一 feature 合流为同一个 Promise；
 *  - install 失败只回滚该 feature 的 controller/订阅/scoped disposer（abort scope +
 *    逆序跑已登记 disposer），⛔ 不修改不可变 catalog；
 *  - `failed` 两条出路写死：显式用户意图（userIntent launch）回 `loading`；每个
 *    app generation 的自动重试次数有上限，超限置 `disabled(app-generation)`，
 *    直到下一个 app generation（noteAppGeneration）才复位；
 *  - launch 先按 feature.json dependencies 装依赖（任一非 active ⇒ failed；运行期环点名结算 failed；
 *    依赖正在 dispose 时等它拆完再装）；releaseIfIdle 对仍有依赖方在位的 feature 只记请求、不拆，
 *    依赖方拆完后级联释放；disposeAll 按依赖拓扑（依赖方先拆）+ 同层安装逆序，幂等；
 *  - 停用由 route refcount 决定：NavigationService 关闭 feature 最后一个 route 时
 *    调 releaseIfIdle；resident（built-in）与 keep-mounted route 豁免；
 *    session 结束与 app dispose 是强制释放点（disposeAll）。
 *
 * 生产 feature 目前只有 built-in（常驻、无 module）；全状态机由 fixture feature
 * 测试驱动（featureHost.test.ts）。运行时可用性（failed/disabled）是 catalog 之外的
 * 可变叠加层——§7.4 的 Home composer 渲染时叠加为「不可点击 + 可手动重试」，
 * ⛔ 绝不显示一个必然失败的正常入口（阶段 6 接入）。
 */
import type { AppPorts } from "./ports";

export type FeatureStatus =
    | "unloaded"
    | "loading"
    | "active"
    | "disposing"
    | "failed"
    | "disabled";

/** feature module 安装上下文：只给最小 port 面 + scope 信号 + disposer 登记口。 */
export interface FeatureInstallContext {
    readonly featureId: string;
    readonly ports: AppPorts;
    readonly signal: AbortSignal;
    readonly appGeneration: number;
    /** 登记随 feature dispose 逆序执行的清理器（订阅/controller/scoped provider）。 */
    own(disposer: () => void): void;
}

export interface FeatureModule {
    install(context: FeatureInstallContext): void | Promise<void>;
    dispose?(): void | Promise<void>;
}

/** Host 侧 feature 声明：descriptor + 可选 module 加载器（无 loader = 静态常驻）。 */
export interface HostedFeature {
    readonly id: string;
    readonly resident?: boolean;
    readonly dependencies?: readonly string[];
    readonly load?: () => Promise<FeatureModule> | FeatureModule;
}

export interface FeatureLaunchOptions {
    /** 显式用户意图（点击入口/手动重试）：failed 可回 loading；自动重试计数不涨。 */
    readonly userIntent?: boolean;
}

interface FeatureSlot {
    readonly descriptor: HostedFeature;
    status: FeatureStatus;
    loading: Promise<FeatureStatus> | null;
    module: FeatureModule | null;
    scope: AbortController | null;
    disposers: Array<() => void>;
    error: unknown;
    autoRetries: number;
    /** 安装完成序号：disposeAll 同层的逆序依据（层由依赖拓扑决定）。 */
    installOrder: number;
    disposing: Promise<void> | null;
    /** route refcount 已归零但因仍有依赖方 active 而被推迟的释放请求；依赖方拆完后级联释放。 */
    releaseRequested: boolean;
}

export interface FeatureHostOptions {
    readonly ports: AppPorts;
    readonly appGeneration: number;
    /** 每个 app generation 内 failed 的自动重试上限（超限 → disabled）。 */
    readonly maxAutoRetries?: number;
}

const DEFAULT_MAX_AUTO_RETRIES = 2;

export class FeatureHost {
    private readonly slots = new Map<string, FeatureSlot>();
    /** 反向依赖表：feature id → 声明依赖它的 feature id（releaseIfIdle 保活与 disposeAll 拓扑的依据）。 */
    private readonly dependents = new Map<string, string[]>();
    private readonly maxAutoRetries: number;
    private appGeneration: number;
    private installSeq = 0;

    constructor(features: readonly HostedFeature[], private readonly options: FeatureHostOptions) {
        this.maxAutoRetries = options.maxAutoRetries ?? DEFAULT_MAX_AUTO_RETRIES;
        this.appGeneration = options.appGeneration;
        for (const descriptor of features) {
            for (const dependency of descriptor.dependencies ?? []) {
                const list = this.dependents.get(dependency) ?? [];
                list.push(descriptor.id);
                this.dependents.set(dependency, list);
            }
        }
        for (const descriptor of features) {
            if (this.slots.has(descriptor.id)) {
                throw new Error(`[FeatureHost] 重复 feature id: ${descriptor.id}`);
            }
            this.slots.set(descriptor.id, {
                descriptor,
                // 无 loader 的常驻 feature（built-in）视为静态 active。
                status: descriptor.load ? "unloaded" : "active",
                loading: null,
                module: null,
                scope: null,
                disposers: [],
                error: null,
                autoRetries: 0,
                installOrder: descriptor.load ? -1 : ++this.installSeq,
                disposing: null,
                releaseRequested: false,
            });
        }
    }

    /** 处于 active/loading/disposing 的依赖方（它们仍需要该 feature 在位）。 */
    private activeDependents(id: string): readonly string[] {
        return (this.dependents.get(id) ?? []).filter((dependent) => {
            const status = this.slots.get(dependent)?.status;
            return status === "active" || status === "loading" || status === "disposing";
        });
    }

    statusOf(id: string): FeatureStatus {
        return this.slot(id).status;
    }

    /** 是否托管该 feature（只查 slot 存在，⛔ 不 throw）：未托管 id 的防御裁定入口。 */
    hosts(id: string): boolean {
        return this.slots.has(id);
    }

    lastErrorOf(id: string): unknown {
        return this.slot(id).error;
    }

    private slot(id: string): FeatureSlot {
        const slot = this.slots.get(id);
        if (!slot) throw new Error(`[FeatureHost] 未登记的 feature: ${id}`);
        return slot;
    }

    /**
     * 启动一个 feature。并发调用合流同一 Promise；failed 的重启规则见文件头。
     * 返回结算后的状态（active/failed/disabled）。
     */
    launch(id: string, options: FeatureLaunchOptions = {}): Promise<FeatureStatus> {
        return this.launchInternal(id, options, new Set());
    }

    /**
     * @param visiting 本条依赖链上正在装载的 feature id（运行期环检测：codegen 只查 feature.json 的环，
     *   手工构造的 HostedFeature 仍可能成环——命中即以点名错误结算 failed，⛔ 不递归到栈溢出）。
     */
    private launchInternal(id: string, options: FeatureLaunchOptions, visiting: ReadonlySet<string>): Promise<FeatureStatus> {
        const slot = this.slot(id);
        if (slot.status === "active") return Promise.resolve("active");
        if (visiting.has(id)) {
            slot.error = new Error(`[FeatureHost] 依赖环：${[...visiting, id].join(" → ")}`);
            if (slot.status !== "loading") slot.status = "failed";
            return Promise.resolve("failed");
        }
        // 并发合流：loading 中的重复 launch 共享同一 flight（用户点击合流是期望行为）。
        // ⛔ feature install() 内不得 await 对自身 gameplay target 的 ports.launch——
        // AppRuntime.launch 的闸会走到这里与自身 in-flight 合流，install 等它自己完成，
        // 循环 await 静默挂死（无 ALS，宿主无法区分合流 awaiter 与 install 自身；
        // ports.ts 的 launch port 文档有同款警告）。
        if (slot.status === "loading" && slot.loading) return slot.loading;
        if (slot.status === "disposing") {
            // 正在拆（如用户关掉最后一个 route 后立刻点依赖它的入口）：等拆完再重新装，⛔ 不 reject——
            // reject 会让依赖方卡在 loading 且无 in-flight。
            const disposing = slot.disposing;
            if (disposing) return disposing.then(() => this.launchInternal(id, options, visiting));
            return Promise.reject(new Error(`[FeatureHost] ${id} 正在 dispose，不可启动`));
        }
        if (slot.status === "disabled") {
            // disabled(app-generation)：只有下一个 app generation 才复位。
            return Promise.resolve("disabled");
        }
        if (slot.status === "failed") {
            if (!options.userIntent) {
                if (slot.autoRetries >= this.maxAutoRetries) {
                    slot.status = "disabled";
                    return Promise.resolve("disabled");
                }
                slot.autoRetries++;
            }
        }
        const dependencies = slot.descriptor.dependencies ?? [];
        if (!slot.descriptor.load && dependencies.length === 0) {
            slot.status = "active";
            slot.releaseRequested = false;
            return Promise.resolve("active");
        }
        slot.status = "loading";
        slot.error = null;
        slot.releaseRequested = false;
        // 依赖先装（feature.json dependencies）：任一依赖非 active ⇒ 本 feature failed，⛔ 不装一半；
        // 依赖的 installOrder 必然小于本 feature。⚠ 任何异常都必须结算成 failed——
        // 「loading 且无 in-flight」是非法态（可用性叠加会把它显示成 available）。
        const chain = new Set([...visiting, id]);
        const flight = this.launchDependencies(slot, dependencies, options, chain).then((ready) => {
            if (!ready) {
                if (slot.status === "loading") slot.status = "failed";
                return "failed" as const;
            }
            if (!slot.descriptor.load) {
                if (slot.status !== "loading") return slot.status;
                slot.status = "active";
                slot.installOrder = ++this.installSeq;
                return "active" as const;
            }
            return this.runInstall(slot);
        }).catch((error: unknown) => {
            slot.error = error;
            if (slot.status === "loading") slot.status = "failed";
            return "failed" as const;
        }).then((status) => {
            if (slot.loading === flight) slot.loading = null;
            return status;
        });
        slot.loading = flight;
        return flight;
    }

    private async launchDependencies(
        slot: FeatureSlot,
        dependencies: readonly string[],
        options: FeatureLaunchOptions,
        visiting: ReadonlySet<string>,
    ): Promise<boolean> {
        for (const dependency of dependencies) {
            if (!this.slots.has(dependency)) {
                slot.error = new Error(`[FeatureHost] ${slot.descriptor.id} 的依赖 ${dependency} 未托管`);
                return false;
            }
            if (visiting.has(dependency)) {
                slot.error = new Error(`[FeatureHost] 依赖环：${[...visiting, dependency].join(" → ")}`);
                return false;
            }
            const status = await this.launchInternal(dependency, options, visiting);
            if (status !== "active") {
                slot.error = new Error(`[FeatureHost] ${slot.descriptor.id} 的依赖 ${dependency} 不可用（${status}）`);
                return false;
            }
        }
        return true;
    }

    private async runInstall(slot: FeatureSlot): Promise<FeatureStatus> {
        const load = slot.descriptor.load;
        if (!load) return "active";
        const scope = new AbortController();
        const disposers: Array<() => void> = [];
        try {
            const module = await Promise.resolve(load());
            if (slot.status !== "loading") return slot.status;
            const context: FeatureInstallContext = {
                featureId: slot.descriptor.id,
                ports: this.options.ports,
                signal: scope.signal,
                appGeneration: this.appGeneration,
                own: (disposer) => { disposers.push(disposer); },
            };
            await Promise.resolve(module.install(context));
            if (slot.status !== "loading") {
                // 装载期间被强制释放（disposeAll）：回滚本次安装，不进 active。
                this.rollback(scope, disposers);
                return slot.status;
            }
            slot.module = module;
            slot.scope = scope;
            slot.disposers = disposers;
            slot.status = "active";
            slot.error = null;
            slot.installOrder = ++this.installSeq;
            return "active";
        } catch (error) {
            // install 失败只回滚 controller/订阅/scoped disposer，不动 catalog。
            this.rollback(scope, disposers);
            slot.module = null;
            slot.scope = null;
            slot.disposers = [];
            slot.error = error;
            slot.status = "failed";
            return "failed";
        }
    }

    private rollback(scope: AbortController, disposers: Array<() => void>): void {
        try {
            scope.abort();
        } catch { /* abort 不应抛；防御性兜底 */ }
        for (const disposer of disposers.splice(0).reverse()) {
            try {
                disposer();
            } catch (error) {
                console.error("[FeatureHost] install 回滚 disposer 异常", error);
            }
        }
    }

    /**
     * route refcount 归零通知（NavigationService route observer 接线）。
     * resident feature 与仍有 keep-mounted route 打开的 feature 豁免。
     */
    releaseIfIdle(id: string, openRouteCount: number): Promise<void> {
        const slot = this.slot(id);
        if (slot.descriptor.resident) return Promise.resolve();
        if (openRouteCount > 0) {
            slot.releaseRequested = false;
            return Promise.resolve();
        }
        if (slot.status !== "active") return Promise.resolve();
        // 依赖保活：仍有依赖方在位时不拆（否则依赖方会在依赖已被拆掉的情况下继续运行）；
        // 记下释放请求，依赖方拆完后级联释放（disposeFeature 的收尾）。
        if (this.activeDependents(id).length > 0) {
            slot.releaseRequested = true;
            return Promise.resolve();
        }
        return this.disposeFeature(slot);
    }

    private disposeFeature(slot: FeatureSlot): Promise<void> {
        if (slot.disposing) return slot.disposing;
        if (slot.status !== "active" && slot.status !== "loading" && slot.status !== "failed") {
            return Promise.resolve();
        }
        if (!slot.descriptor.load) {
            // 静态常驻 feature 无可拆内容（disposeAll 的强制释放点也只是复位状态）。
            slot.status = "unloaded";
            return Promise.resolve();
        }
        slot.status = "disposing";
        const module = slot.module;
        const scope = slot.scope;
        const disposers = slot.disposers;
        slot.module = null;
        slot.scope = null;
        slot.disposers = [];
        const run = (async () => {
            if (scope) {
                try {
                    scope.abort();
                } catch { /* 防御性兜底 */ }
            }
            for (const disposer of disposers.splice(0).reverse()) {
                try {
                    disposer();
                } catch (error) {
                    console.error("[FeatureHost] dispose disposer 异常", error);
                }
            }
            try {
                await Promise.resolve(module?.dispose?.());
            } catch (error) {
                console.error("[FeatureHost] feature dispose 异常", error);
            }
        })().then(() => {
            slot.disposing = null;
            slot.status = "unloaded";
            this.releaseIdleDependencies(slot);
        });
        slot.disposing = run;
        return run;
    }

    /** 依赖方拆完后的级联：其依赖若早已被 route refcount 请求释放且再无别的依赖方在位，则补拆。 */
    private releaseIdleDependencies(slot: FeatureSlot): void {
        for (const dependency of slot.descriptor.dependencies ?? []) {
            const target = this.slots.get(dependency);
            if (!target || target.descriptor.resident || !target.releaseRequested) continue;
            if (target.status !== "active" || this.activeDependents(dependency).length > 0) continue;
            target.releaseRequested = false;
            void this.disposeFeature(target).catch((error) => {
                console.error("[FeatureHost] 级联释放依赖失败", error);
            });
        }
    }

    /**
     * 强制释放点（session 结束 / app dispose）：按**依赖拓扑**拆——依赖方先于其依赖，同层按安装完成逆序；
     * 幂等。⛔ 不能只按 installOrder：依赖被单独重装后序号会倒置，in-flight 依赖方的序号还是 -1。
     */
    async disposeAll(): Promise<void> {
        const remaining = new Set(
            [...this.slots.values()]
                .filter((slot) => slot.status === "active" || slot.status === "loading" || slot.status === "disposing")
                .map((slot) => slot.descriptor.id),
        );
        while (remaining.size > 0) {
            let ready = [...remaining].filter((id) => (this.dependents.get(id) ?? []).every((dependent) => !remaining.has(dependent)));
            if (ready.length === 0) ready = [...remaining]; // 运行期环：退化为全部并列，仍保证终止
            ready.sort((a, b) => this.slot(b).installOrder - this.slot(a).installOrder);
            for (const id of ready) {
                remaining.delete(id);
                await this.disposeFeature(this.slot(id));
            }
        }
    }

    /** app generation 换代：disabled 复位、自动重试计数清零（§7.2）。 */
    noteAppGeneration(generation: number): void {
        if (generation === this.appGeneration) return;
        this.appGeneration = generation;
        for (const slot of this.slots.values()) {
            slot.autoRetries = 0;
            if (slot.status === "disabled") slot.status = "unloaded";
        }
    }
}
