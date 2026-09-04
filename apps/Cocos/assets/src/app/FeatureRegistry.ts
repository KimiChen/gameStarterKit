/**
 * FeatureRegistry（Non-intrusive §7.2 阶段 5b）：不可变 feature/route 目录 + 宿主 placement。
 *
 * 消费 codegen:features 生成的不可变 descriptor（generated/features.generated，
 * 经 builtinFeature 稳定 façade）；解析 feature、route、menu contribution 与宿主
 * placement（GENERATED_HOST）。构造期 fail-fast：重复 feature id / route id / view 名 /
 * menu entryId、placement 引用不存在的入口直接 throw（descriptor 非法在装配期暴露，
 * ⛔ 不进 runtime 分支）。注册后目录只读——运行时可用性（failed/disabled）是
 * FeatureHost 的可变叠加层，不回写目录。
 */
import {
    APP_HOST,
    type FeatureDescriptor,
    type FeatureMenuContribution,
    type FeatureRouteDescriptor,
    type HostDescriptor,
} from "./builtinFeature";

/** route 查询结果：附归属 feature id。 */
export interface ResolvedFeatureRoute extends FeatureRouteDescriptor {
    readonly featureId: string;
}

export class FeatureRegistry {
    private readonly features = new Map<string, FeatureDescriptor>();
    private readonly routes = new Map<string, ResolvedFeatureRoute>();
    private readonly host: HostDescriptor;

    /**
     * @param host 宿主 placement（缺省 generated APP_HOST）。placement ⇔ contribution 的一致性由
     *   codegen:features 保证（同一生成器产出两者）；homeContributions() 解析失败时 fail-fast——
     *   ⛔ 不在构造期校验，让只装配部分 feature 的 fixture registry（navigation 测试等）仍可构造。
     */
    constructor(descriptors: readonly FeatureDescriptor[], host: HostDescriptor = APP_HOST) {
        this.host = host;
        for (const descriptor of descriptors) {
            if (!descriptor.id) throw new Error("[FeatureRegistry] feature id 不能为空");
            if (this.features.has(descriptor.id)) {
                throw new Error(`[FeatureRegistry] 重复 feature id: ${descriptor.id}`);
            }
            this.features.set(descriptor.id, descriptor);
            for (const route of descriptor.routes) {
                if (this.routes.has(route.id)) {
                    throw new Error(`[FeatureRegistry] 重复 route id: ${route.id}`);
                }
                for (const existing of this.routes.values()) {
                    if (existing.view === route.view) {
                        throw new Error(`[FeatureRegistry] 重复 route view: ${route.view}`);
                    }
                }
                this.routes.set(route.id, { ...route, featureId: descriptor.id });
            }
        }
        const entryIds = new Map<string, string>();
        for (const descriptor of descriptors) {
            for (const item of descriptor.menu) {
                const owner = entryIds.get(item.entryId);
                if (owner) throw new Error(`[FeatureRegistry] 重复 menu entryId: ${item.entryId}（${owner} / ${descriptor.id}）`);
                entryIds.set(item.entryId, descriptor.id);
            }
        }
    }

    featureIds(): readonly string[] {
        return [...this.features.keys()];
    }

    featureOf(id: string): FeatureDescriptor | null {
        return this.features.get(id) ?? null;
    }

    /** route 解析；未知 route fail-fast（导航层不猜测 view 名）。 */
    routeOf(routeId: string): ResolvedFeatureRoute {
        const route = this.routes.get(routeId);
        if (!route) throw new Error(`[FeatureRegistry] 未登记的 route: ${routeId}`);
        return route;
    }

    hasRoute(routeId: string): boolean {
        return this.routes.has(routeId);
    }

    /** 按声明顺序返回一个 group 的全部 route（closeGroup 的关闭顺序依据）。 */
    routesInGroup(group: string): readonly ResolvedFeatureRoute[] {
        const result: ResolvedFeatureRoute[] = [];
        for (const route of this.routes.values()) {
            if (route.group === group) result.push(route);
        }
        return result;
    }

    /**
     * 全部菜单贡献（§7.4 唯一数据源）：固定排序 featureId → entryId——确定、与语言无关、
     * ⛔ 不含位置语义（插件只声明身份；设置面板的入口列表用的就是这一份）。
     */
    menuContributions(): readonly FeatureMenuContribution[] {
        const result: FeatureMenuContribution[] = [];
        for (const feature of this.features.values()) {
            for (const item of feature.menu) result.push(item);
        }
        return result.sort((left, right) => {
            if (left.featureId !== right.featureId) return left.featureId < right.featureId ? -1 : 1;
            if (left.entryId === right.entryId) return 0;
            return left.entryId < right.entryId ? -1 : 1;
        });
    }

    /**
     * 首屏 Home 入口：**宿主 placement 的顺序**（features/host.json → GENERATED_HOST.home），
     * 位置归宿主（docs/PLUGIN.md §6）。空数组 = 宿主没在首屏摆任何入口。
     */
    homeContributions(): readonly FeatureMenuContribution[] {
        const byEntry = new Map<string, FeatureMenuContribution>();
        for (const item of this.menuContributions()) byEntry.set(item.entryId, item);
        return this.host.home.map((entry) => {
            const item = byEntry.get(entry.entryId);
            if (!item || item.featureId !== entry.featureId) {
                throw new Error(`[FeatureRegistry] 宿主 placement 引用不存在的入口: ${entry.featureId}/${entry.entryId}`);
            }
            return item;
        });
    }

    /** 宿主声明的默认玩法（features/host.json defaultLaunch）。 */
    defaultLaunchGameplayId(): string {
        return this.host.defaultLaunch.gameplayId;
    }
}
