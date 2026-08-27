/**
 * 选服列表页面逻辑（纯 TS，无头单测）——拉取区服 + 页签筛选 + 选服。
 *
 * 数据源经依赖注入（生产接 net/http/area.fetchAreaList）；导航/渲染在 view 层。
 * 固定页签：recommend=推荐(tag=new)、my=我的角色(myServerIds∩servers)、all=全部区服。
 */
import { isServerEnterable } from "../areaDirectory";
import {
    validateWebPlatformAreaListResponse,
    type WebPlatformAreaListResponse,
    type WebPlatformAreaServer,
} from "../../shared/index";

/** 选服页固定展示的三个分类。 */
export type AreaTab = "recommend" | "my" | "all";

export interface IAreaListDeps {
    /** 生产 = fetchAreaList；可选用户身份由 core/http 自动附加 Bearer。 */
    fetchAreaList(signal?: AbortSignal): Promise<WebPlatformAreaListResponse>;
}

export class AreaListLogic {
    private data: WebPlatformAreaListResponse = {
        isOps: false,
        hash: "",
        servers: [],
        myServerIds: [],
    };
    private tab: AreaTab = "all";
    /** 每次进入页面一个世代；旧请求即使底层不支持 abort，也不能再写入当前页面。 */
    private generation = 0;
    private controller: AbortController | null = null;
    private active = false;

    /** 页签集变化回调（拉取完成）——view 层刷新 tab bar */
    onTabs: (tabs: { key: AreaTab; title: string }[]) => void = () => {};
    /** 列表变化回调（切页签/拉取完成）——view 层刷新 GList */
    onServers: (servers: WebPlatformAreaServer[]) => void = () => {};
    /** 选服回调——view 层据此设选中态 / 关闭选服页 */
    onChoose: (server: WebPlatformAreaServer) => void | Promise<void> = () => {};

    constructor(private readonly deps: IAreaListDeps) {}

    get isOps(): boolean {
        return this.data.isOps;
    }

    get currentTab(): AreaTab {
        return this.tab;
    }

    /**
     * 进入页面：拉取区服列表（若已有登录态，HTTP 底座自动带 Bearer 回填 myServerIds）。
     *
     * `start` 可安全重复调用；前一轮会被取消/失效。依赖若不支持 AbortSignal 也没关系，
     * 世代检查会在每个 await 边界挡住迟到结果。
     */
    async start(signal?: AbortSignal): Promise<void> {
        this.stop();
        const generation = ++this.generation;
        const controller = new AbortController();
        this.controller = controller;
        this.active = true;
        let detach: (() => void) | null = null;
        if (signal) {
            const abort = () => {
                if (this.controller !== controller) return;
                controller.abort();
                this.generation++;
                this.controller = null;
                this.active = false;
            };
            if (signal.aborted) abort();
            else {
                signal.addEventListener("abort", abort, { once: true });
                detach = () => signal.removeEventListener("abort", abort);
            }
        }
        if (controller.signal.aborted) {
            detach?.();
            return;
        }
        try {
            // Treat injected/network data as untrusted at this boundary too.
            // The validator returns fresh arrays/records, so a caller retaining
            // or mutating its response cannot split this page's snapshot after
            // the atomic assignment below.
            const next = validateWebPlatformAreaListResponse(
                await this.deps.fetchAreaList(controller.signal),
            );
            if (!this.isCurrent(generation, controller)) return;
            this.data = next;
            this.onTabs(this.buildTabs());
            if (!this.isCurrent(generation, controller)) return;
            this.emit();
        } catch (e) {
            // A stale/aborted request is an expected page transition, not a user-visible failure.
            if (this.isCurrent(generation, controller)) throw e;
        } finally {
            detach?.();
            if (this.controller === controller) this.controller = null;
        }
    }

    /** 离开页面：使在途 HTTP 结果失效；底层请求是否真正可取消由依赖决定。 */
    stop(): void {
        this.active = false;
        this.generation++;
        const controller = this.controller;
        this.controller = null;
        controller?.abort();
    }

    /** 固定页签集：推荐、我的角色、全部区服。 */
    buildTabs(): { key: AreaTab; title: string }[] {
        return [
            { key: "recommend", title: "推荐" },
            { key: "my", title: "我的角色" },
            { key: "all", title: "全部区服" },
        ];
    }

    /** 切页签 */
    setTab(tab: AreaTab): void {
        if (!this.active) return;
        if (tab === this.tab) return;
        this.tab = tab;
        this.emit();
    }

    /** 当前页签下应展示的区服（纯函数，单测锚点，对齐原项目 getAreaListByTab）。 */
    serversOfTab(tab: AreaTab = this.tab): WebPlatformAreaServer[] {
        if (tab === "recommend") return this.data.servers
            .filter((s) => s.tag === "new")
            .map(cloneServer);
        if (tab === "my") {
            const recent = new Set(this.data.myServerIds);
            return this.data.servers.filter((s) => recent.has(s.serverId)).map(cloneServer);
        }
        return this.data.servers.map(cloneServer);
    }

    /** 选服：不可进（status=maintenance / openTime=0）→ 返回 false 由 view 提示。
     *  运维模式（isOps，部署环境级）豁免——维护/未开服的开服前验证都要能选中进入；
     *  new 角标也可能尚未开服，判定单源已双条件拦。 */
    choose(serverId: number): boolean {
        if (!this.active) return false;
        const s = this.data.servers.find((a) => a.serverId === serverId);
        if (!s || (!this.isOps && !isServerEnterable(s))) return false;
        // `onChoose` belongs to the View layer; hand it a copy so a UI adapter
        // cannot mutate the logic snapshot used by a later tab/selection.
        this.invoke(this.onChoose, cloneServer(s));
        return true;
    }

    private emit(): void {
        this.onServers(this.serversOfTab());
    }

    private isCurrent(generation: number, controller: AbortController): boolean {
        return this.controller === controller && this.generation === generation && !controller.signal.aborted;
    }

    private invoke(action: (server: WebPlatformAreaServer) => void | Promise<void>, server: WebPlatformAreaServer): void {
        try {
            const result = action(server);
            if (result && typeof (result as { then?: unknown }).then === "function") {
                Promise.resolve(result).catch((e) => console.error("[AreaListLogic] onChoose rejection", e));
            }
        } catch (e) {
            console.error("[AreaListLogic] onChoose exception", e);
        }
    }
}

function cloneServer(server: WebPlatformAreaServer): WebPlatformAreaServer {
    return { ...server };
}
