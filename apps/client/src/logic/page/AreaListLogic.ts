/**
 * 选服列表页面逻辑（纯 TS，无头单测）——拉取区服 + 页签筛选 + 选服。
 *
 * 数据源经依赖注入（生产接 net/http/area.fetchAreaList）；导航/渲染在 view 层。
 * 固定页签：recommend=推荐(t===1)、my=我的角色(ul∩al)、all=全部区服。
 */
import type { IAreaListRes, IAreaServer } from "../../shared/index";

/** 选服页固定展示的三个分类。 */
export type AreaTab = "recommend" | "my" | "all";

export interface IAreaListDeps {
    /** 生产 = (token) => fetchAreaList(token) */
    fetchAreaList(token?: string): Promise<IAreaListRes>;
}

export class AreaListLogic {
    private data: IAreaListRes = { isOps: 0, al: [], ul: [], h: "" };
    private tab: AreaTab = "all";

    /** 页签集变化回调（拉取完成）——view 层刷新 tab bar */
    onTabs: (tabs: { key: AreaTab; title: string }[]) => void = () => {};
    /** 列表变化回调（切页签/拉取完成）——view 层刷新 GList */
    onServers: (servers: IAreaServer[]) => void = () => {};
    /** 选服回调——view 层据此设选中态 / 关闭选服页 */
    onChoose: (server: IAreaServer) => void = () => {};

    constructor(private readonly deps: IAreaListDeps) {}

    get isOps(): boolean {
        return this.data.isOps === 1;
    }

    get currentTab(): AreaTab {
        return this.tab;
    }

    /** 进入页面：拉取区服列表（token 可选，带上回填最近登录 ul） */
    async start(token?: string): Promise<void> {
        this.data = await this.deps.fetchAreaList(token);
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
    serversOfTab(tab: AreaTab = this.tab): IAreaServer[] {
        if (tab === "recommend") return this.data.al.filter((s) => s.t === 1);
        if (tab === "my") {
            const recent = new Set(this.data.ul);
            return this.data.al.filter((s) => recent.has(s.sId));
        }
        return this.data.al;
    }

    /** 选服：维护/未开服（t===9 或 openTime===0）不可进 → 返回 false 由 view 提示 */
    choose(sId: number): boolean {
        const s = this.data.al.find((a) => a.sId === sId);
        if (!s || s.t === 9) return false;
        this.onChoose(s);
        return true;
    }

    private emit(): void {
        this.onServers(this.serversOfTab());
    }
}
