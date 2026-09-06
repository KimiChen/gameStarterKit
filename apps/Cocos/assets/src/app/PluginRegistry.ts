/**
 * PluginRegistry（Non-intrusive §7.2 阶段 5b）：不可变 plugin/route 目录 + 宿主 placement。
 *
 * 消费 codegen:plugins 生成的不可变 descriptor（generated/plugins.generated，
 * 经 builtinPlugin 稳定 façade）；解析 plugin、route、menu contribution 与宿主
 * placement（GENERATED_HOST）。构造期 fail-fast：重复 plugin id / route id / view 名 /
 * menu entryId、placement 引用不存在的入口直接 throw（descriptor 非法在装配期暴露，
 * ⛔ 不进 runtime 分支）。注册后目录只读——运行时可用性（failed/disabled）是
 * PluginHost 的可变叠加层，不回写目录。
 */
import {
    APP_HOST,
    type PluginDescriptor,
    type PluginMenuContribution,
    type PluginRouteDescriptor,
    type HostDescriptor,
    type HostEntryGroup,
} from "./builtinPlugin";

/** route 查询结果：附归属 plugin id。 */
export interface ResolvedPluginRoute extends PluginRouteDescriptor {
    readonly pluginId: string;
}

export class PluginRegistry {
    private readonly plugins = new Map<string, PluginDescriptor>();
    private readonly routes = new Map<string, ResolvedPluginRoute>();
    private readonly host: HostDescriptor;

    /**
     * @param host 宿主 placement（缺省 generated APP_HOST）。placement ⇔ contribution 的一致性由
     *   codegen:plugins 保证（同一生成器产出两者）；homeContributions() 解析失败时 fail-fast——
     *   ⛔ 不在构造期校验，让只装配部分 plugin 的 fixture registry（navigation 测试等）仍可构造。
     */
    constructor(descriptors: readonly PluginDescriptor[], host: HostDescriptor = APP_HOST) {
        this.host = host;
        for (const descriptor of descriptors) {
            if (!descriptor.id) throw new Error("[PluginRegistry] plugin id 不能为空");
            if (this.plugins.has(descriptor.id)) {
                throw new Error(`[PluginRegistry] 重复 plugin id: ${descriptor.id}`);
            }
            this.plugins.set(descriptor.id, descriptor);
            for (const route of descriptor.routes) {
                if (this.routes.has(route.id)) {
                    throw new Error(`[PluginRegistry] 重复 route id: ${route.id}`);
                }
                for (const existing of this.routes.values()) {
                    if (existing.view === route.view) {
                        throw new Error(`[PluginRegistry] 重复 route view: ${route.view}`);
                    }
                }
                this.routes.set(route.id, { ...route, pluginId: descriptor.id });
            }
        }
        const entryIds = new Map<string, string>();
        for (const descriptor of descriptors) {
            for (const item of descriptor.menu) {
                const owner = entryIds.get(item.entryId);
                if (owner) throw new Error(`[PluginRegistry] 重复 menu entryId: ${item.entryId}（${owner} / ${descriptor.id}）`);
                entryIds.set(item.entryId, descriptor.id);
            }
        }
    }

    pluginIds(): readonly string[] {
        return [...this.plugins.keys()];
    }

    pluginOf(id: string): PluginDescriptor | null {
        return this.plugins.get(id) ?? null;
    }

    /** route 解析；未知 route fail-fast（导航层不猜测 view 名）。 */
    routeOf(routeId: string): ResolvedPluginRoute {
        const route = this.routes.get(routeId);
        if (!route) throw new Error(`[PluginRegistry] 未登记的 route: ${routeId}`);
        return route;
    }

    hasRoute(routeId: string): boolean {
        return this.routes.has(routeId);
    }

    /** 按声明顺序返回一个 group 的全部 route（closeGroup 的关闭顺序依据）。 */
    routesInGroup(group: string): readonly ResolvedPluginRoute[] {
        const result: ResolvedPluginRoute[] = [];
        for (const route of this.routes.values()) {
            if (route.group === group) result.push(route);
        }
        return result;
    }

    /**
     * 全部菜单贡献（§7.4 唯一数据源）：固定排序 pluginId → entryId——确定、与语言无关、
     * ⛔ 不含位置语义（插件只声明身份；设置面板的入口列表用的就是这一份）。
     */
    menuContributions(): readonly PluginMenuContribution[] {
        const result: PluginMenuContribution[] = [];
        for (const plugin of this.plugins.values()) {
            for (const item of plugin.menu) result.push(item);
        }
        return result.sort((left, right) => {
            if (left.pluginId !== right.pluginId) return left.pluginId < right.pluginId ? -1 : 1;
            if (left.entryId === right.entryId) return 0;
            return left.entryId < right.entryId ? -1 : 1;
        });
    }

    /**
     * 首屏 Home 入口：**宿主 placement 的顺序**（apps/plugins/host.json → GENERATED_HOST.home），
     * 位置归宿主（docs/PLUGIN.md §6）。空数组 = 宿主没在首屏摆任何入口。
     */
    homeContributions(): readonly PluginMenuContribution[] {
        const byEntry = new Map<string, PluginMenuContribution>();
        for (const item of this.menuContributions()) byEntry.set(item.entryId, item);
        return this.host.home.map((entry) => {
            const item = byEntry.get(entry.entryId);
            if (!item || item.pluginId !== entry.pluginId) {
                throw new Error(`[PluginRegistry] 宿主 placement 引用不存在的入口: ${entry.pluginId}/${entry.entryId}`);
            }
            return item;
        });
    }

    /**
     * 宿主声明的入口分组（apps/plugins/host.json → GENERATED_HOST.groups，docs/PLUGIN.md §6.1）：
     * 设置面板把整组渲染成**一行**，点进去才见成员。⛔ 插件无权分组——一个插件不知道自己该和谁
     * 并排（arena 是 kit、arenaShop 是插件，kit ⛔ 不得依赖插件），只有宿主知道。
     * 成员按 placement 声明序解析；引用不存在的入口 fail-fast（与 homeContributions 同口径）。
     */
    entryGroups(): readonly { readonly group: HostEntryGroup; readonly members: readonly PluginMenuContribution[] }[] {
        const byEntry = new Map<string, PluginMenuContribution>();
        for (const item of this.menuContributions()) byEntry.set(item.entryId, item);
        return this.host.groups.map((group) => ({
            group,
            members: group.members.map((entry) => {
                const item = byEntry.get(entry.entryId);
                if (!item || item.pluginId !== entry.pluginId) {
                    throw new Error(`[PluginRegistry] 宿主分组 ${group.id} 引用不存在的入口: ${entry.pluginId}/${entry.entryId}`);
                }
                return item;
            }),
        }));
    }

    /** 该入口所属分组 id；不在任何组里返回 null。 */
    groupIdOf(pluginId: string, entryId: string): string | null {
        for (const group of this.host.groups) {
            if (group.members.some((member) => member.pluginId === pluginId && member.entryId === entryId)) return group.id;
        }
        return null;
    }

    /** 宿主声明的默认玩法（apps/plugins/host.json defaultLaunch）。 */
    defaultLaunchGameplayId(): string {
        return this.host.defaultLaunch.gameplayId;
    }
}
