/**
 * NavigationService（Non-intrusive §7.2 阶段 5b）：唯一的业务 route stack 所有者。
 *
 * 分工（§7.2）：Navigator 管业务路由栈、页面组与 authenticated base route；
 * ViewMgr 只管 View mount/cache/input lease，不拥有业务 route（保持不动）。
 * 每次 open 返回 route ownership handle `{signal, generation, close()}`——close/replace
 * 即取消回滚（底层 ViewMgr 打开事务对 signal abort 的回滚语义原样复用）。
 *
 * 铁律 10：FairyGUI 只走动态 import。本模块被 AppRuntime **静态** import（进 Main 的
 * 静态依赖图），因此 ⛔ 不得静态 import ViewMgr/fairygui——ViewMgr 模块经
 * `import("../view/ViewMgr")` 懒加载并缓存；同步操作（closeGroup/disposeViewRoot）
 * 只作用于已加载缓存（未加载过 = 没有任何页面被打开过 = 无事可做）。
 *
 * closeGroup("authenticated") 取代原 view/pages.ts `closeLobby()` 的硬编码页面名
 * 数组：数组内容已迁为 builtinPlugin 描述符的 group 声明（成员与顺序逐字继承）。
 *
 * 登录恢复不再固定打开 Home：最终断线对账成功后走 `restoreAuthenticatedBase()`，
 * 当前实现恢复 authenticated base 栈顶（今天即 Home），行为与旧实现等价但机制通用。
 */
// 页面基类而非 FguiView：kind:"cocos" 的路由页面（纯 Cocos 节点）与 FGUI 页面共用
// 同一套生命周期，navigation 只搬 handle，不认渲染栈；调用方按已知页面类型断言。
import type { ViewBase, ViewLifecycleContext } from "../view/ViewBase";
import type { PluginRegistry, ResolvedPluginRoute } from "./PluginRegistry";

/** ViewMgr 模块的最小结构面（懒加载后缓存；⛔ 不静态 import 真模块）。 */
interface ViewHandleLike {
    readonly view: ViewBase;
    readonly signal: AbortSignal;
    readonly generation: number;
    close(): void;
    run<T>(action: (view: ViewBase, context: ViewLifecycleContext) => T | Promise<T>): Promise<T>;
}

interface ViewMgrLike {
    open(name: string): Promise<ViewHandleLike>;
    close(name: string): void;
    isOpen(name: string): boolean;
    disposeViewRoot(): void;
}

interface ViewMgrModule {
    readonly ViewMgr: ViewMgrLike;
}

/** 一次 route open 的 ownership handle（§7.2）。 */
export interface NavRouteHandle {
    readonly routeId: string;
    readonly pluginId: string;
    readonly group: string;
    readonly view: ViewBase;
    readonly signal: AbortSignal;
    /** route-handle generation（导航层自己的世代，RefreshCoordinator key 的一维）。 */
    readonly generation: number;
    close(): void;
    run<T>(action: (view: ViewBase, context: ViewLifecycleContext) => T | Promise<T>): Promise<T>;
}

interface RouteStackEntry {
    readonly routeId: string;
    readonly group: string;
    readonly pluginId: string;
    readonly handle: NavRouteHandle;
}

interface AuthenticatedBaseRecord {
    readonly routeId: string;
    readonly reopen: (context?: unknown) => Promise<NavRouteHandle | null>;
}

export interface NavigationServiceOptions {
    /** 测试 seam：替换 ViewMgr 模块加载器（默认动态 import 真模块）。 */
    readonly loadViews?: () => Promise<ViewMgrModule>;
}

export class NavigationService {
    private viewMgrModule: ViewMgrModule | null = null;
    private viewMgrLoading: Promise<ViewMgrModule> | null = null;
    private readonly loadViews: () => Promise<ViewMgrModule>;
    private readonly stack: RouteStackEntry[] = [];
    private handleGeneration = 0;
    private authenticatedBase: AuthenticatedBaseRecord | null = null;
    private routeObserver: ((pluginId: string, openCount: number) => void) | null = null;

    constructor(private readonly registry: PluginRegistry, options: NavigationServiceOptions = {}) {
        this.loadViews = options.loadViews
            ?? (() => import("../view/ViewMgr") as Promise<ViewMgrModule>);
    }

    /** PluginHost 的 route refcount 通知口（最后一个 route 关闭 → 停用判定）。 */
    setRouteObserver(observer: ((pluginId: string, openCount: number) => void) | null): void {
        this.routeObserver = observer;
    }

    /** 当前某 plugin 打开中的 route 数（refcount 的地面真相）。 */
    openRouteCountOf(pluginId: string): number {
        let count = 0;
        for (const entry of this.stack) {
            if (entry.pluginId === pluginId) count++;
        }
        return count;
    }

    private ensureViewMgr(): Promise<ViewMgrModule> {
        if (this.viewMgrModule) return Promise.resolve(this.viewMgrModule);
        if (!this.viewMgrLoading) {
            this.viewMgrLoading = this.loadViews().then((module) => {
                this.viewMgrModule = module;
                return module;
            }, (error) => {
                // 失败保持可重试：不缓存失败的加载。
                this.viewMgrLoading = null;
                throw error;
            });
        }
        return this.viewMgrLoading;
    }

    /** 打开一条业务 route；返回 ownership handle（close/replace 即取消回滚）。 */
    async open(routeId: string): Promise<NavRouteHandle> {
        const route = this.registry.routeOf(routeId);
        const module = await this.ensureViewMgr();
        const underlying = await module.ViewMgr.open(route.view);
        return this.adoptHandle(route, underlying);
    }

    /** 关闭当前栈顶并打开新 route（原子意图；旧 route 的 signal 立即失效）。 */
    async replace(routeId: string): Promise<NavRouteHandle> {
        const top = this.stack[this.stack.length - 1];
        if (top) top.handle.close();
        return this.open(routeId);
    }

    /** 关闭当前栈顶（无栈顶为 no-op）。 */
    back(): void {
        const top = this.stack[this.stack.length - 1];
        if (top) top.handle.close();
    }

    /** 按 route id 关闭（底层按 view 名走 ViewMgr.close，含在途取消）。 */
    close(routeId: string): void {
        const route = this.registry.routeOf(routeId);
        this.viewMgrModule?.ViewMgr.close(route.view);
    }

    /**
     * 关闭一个页面组（按描述符声明顺序逐个 ViewMgr.close）。原 closeLobby() 的
     * 行为等价迁移：只按名关闭，栈内 handle 经各自 signal abort 自然出栈。
     */
    closeGroup(group: string): void {
        const module = this.viewMgrModule;
        if (!module) return;
        for (const route of this.registry.routesInGroup(group)) {
            module.ViewMgr.close(route.view);
        }
    }

    /** 释放整个 view root（场景销毁路径；未加载过 ViewMgr 即无事可做）。 */
    disposeViewRoot(): void {
        this.viewMgrModule?.ViewMgr.disposeViewRoot();
    }

    /** 登录成功后的 authenticated base 登记（当前即 Home；随场景 dispose 清除）。 */
    setAuthenticatedBase(
        routeId: string,
        reopen: (context?: unknown) => Promise<NavRouteHandle | null>,
    ): void {
        this.registry.routeOf(routeId);
        this.authenticatedBase = { routeId, reopen };
    }

    clearAuthenticatedBase(): void {
        this.authenticatedBase = null;
    }

    hasAuthenticatedBase(): boolean {
        return this.authenticatedBase !== null;
    }

    authenticatedBaseRouteId(): string | null {
        return this.authenticatedBase?.routeId ?? null;
    }

    /**
     * 恢复 authenticated base 栈顶（§7.3 最终断线恢复；⛔ 不再硬编码打开 Home）。
     * 没有已登记 base（从未完成登录）返回 null，由调用方回退到回登录流程。
     */
    restoreAuthenticatedBase(context?: unknown): Promise<NavRouteHandle | null> {
        const base = this.authenticatedBase;
        if (!base) return Promise.resolve(null);
        return base.reopen(context);
    }

    private adoptHandle(route: ResolvedPluginRoute, underlying: ViewHandleLike): NavRouteHandle {
        const generation = ++this.handleGeneration;
        const handle: NavRouteHandle = {
            routeId: route.id,
            pluginId: route.pluginId,
            group: route.group,
            view: underlying.view,
            signal: underlying.signal,
            generation,
            close: () => underlying.close(),
            run: (action) => underlying.run(action),
        };
        const entry: RouteStackEntry = {
            routeId: route.id,
            group: route.group,
            pluginId: route.pluginId,
            handle,
        };
        this.stack.push(entry);
        const remove = (): void => {
            const at = this.stack.indexOf(entry);
            if (at >= 0) this.stack.splice(at, 1);
            this.notifyRouteObserver(route.pluginId);
        };
        if (underlying.signal.aborted) {
            remove();
        } else {
            underlying.signal.addEventListener("abort", remove, { once: true });
        }
        return handle;
    }

    private notifyRouteObserver(pluginId: string): void {
        const observer = this.routeObserver;
        if (!observer) return;
        try {
            observer(pluginId, this.openRouteCountOf(pluginId));
        } catch (error) {
            console.error("[NavigationService] route observer 异常", error);
        }
    }

    /** 当前打开的 route id 列表（栈序；测试/诊断用）。 */
    openRoutes(): readonly string[] {
        return this.stack.map((entry) => entry.routeId);
    }
}
