/**
 * 选服列表页面逻辑（纯 TS，无头单测）——拉取区服 + 页签筛选 + 选服。
 *
 * 数据源经依赖注入（生产接 net/http/area.fetchAreaList）；导航/渲染在 view 层。
 * 固定页签：recommend=推荐(tag=new)、my=我的角色(myServerIds∩servers)、all=全部区服。
 */
import { isServerEnterable } from "../areaDirectory";
import type { WebPlatformAreaListResponse, WebPlatformAreaServer } from "../../shared/index";

/** 选服页固定展示的三个分类。 */
export type AreaTab = "recommend" | "my" | "all";

export interface IAreaListDeps {
    /** 生产 = fetchAreaList；可选用户身份由 core/http 自动附加 Bearer。 */
    fetchAreaList(): Promise<WebPlatformAreaListResponse>;
}

export class AreaListLogic {
    private data: WebPlatformAreaListResponse = {
        isOps: false,
        hash: "",
        servers: [],
        myServerIds: [],
    };
    private tab: AreaTab = "all";

    /** 页签集变化回调（拉取完成）——view 层刷新 tab bar */
    onTabs: (tabs: { key: AreaTab; title: string }[]) => void = () => {};
    /** 列表变化回调（切页签/拉取完成）——view 层刷新 GList */
    onServers: (servers: WebPlatformAreaServer[]) => void = () => {};
    /** 选服回调——view 层据此设选中态 / 关闭选服页 */
    onChoose: (server: WebPlatformAreaServer) => void = () => {};

    constructor(private readonly deps: IAreaListDeps) {}

    get isOps(): boolean {
        return this.data.isOps;
    }

    get currentTab(): AreaTab {
        return this.tab;
    }

    /** 进入页面：拉取区服列表（若已有登录态，HTTP 底座自动带 Bearer 回填 myServerIds）。 */
    async start(): Promise<void> {
        this.data = await this.deps.fetchAreaList();
        this.onTabs(this.buildTabs());
        this.emit();
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
        if (tab === this.tab) return;
        this.tab = tab;
        this.emit();
    }

    /** 当前页签下应展示的区服（纯函数，单测锚点，对齐原项目 getAreaListByTab）。 */
    serversOfTab(tab: AreaTab = this.tab): WebPlatformAreaServer[] {
        if (tab === "recommend") return this.data.servers.filter((s) => s.tag === "new");
        if (tab === "my") {
            const recent = new Set(this.data.myServerIds);
            return this.data.servers.filter((s) => recent.has(s.serverId));
        }
        return this.data.servers;
    }

    /** 选服：不可进（status=maintenance / openTime=0）→ 返回 false 由 view 提示。
     *  运维模式（isOps，部署环境级）豁免——维护/未开服的开服前验证都要能选中进入；
     *  new 角标也可能尚未开服，判定单源已双条件拦。 */
    choose(serverId: number): boolean {
        const s = this.data.servers.find((a) => a.serverId === serverId);
        if (!s || (!this.isOps && !isServerEnterable(s))) return false;
        this.onChoose(s);
        return true;
    }

    private emit(): void {
        this.onServers(this.serversOfTab());
    }
}
