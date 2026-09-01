/**
 * FeatureRegistry（Non-intrusive §7.2 阶段 5b）：不可变 feature/route 目录。
 *
 * 消费 codegen:features 生成的不可变 descriptor（generated/features.generated，
 * 经 builtinFeature 稳定 façade）；解析 feature、route 与 Home menu
 * contribution。构造期 fail-fast：重复
 * feature id / route id / view 名直接 throw（descriptor 非法在装配期暴露，
 * ⛔ 不进 runtime 分支）。注册后目录只读——运行时可用性（failed/disabled）是
 * FeatureHost 的可变叠加层，不回写目录。
 */
import type {
    FeatureDescriptor,
    FeatureMenuContribution,
    FeatureRouteDescriptor,
} from "./builtinFeature";

/** route 查询结果：附归属 feature id。 */
export interface ResolvedFeatureRoute extends FeatureRouteDescriptor {
    readonly featureId: string;
}

export class FeatureRegistry {
    private readonly features = new Map<string, FeatureDescriptor>();
    private readonly routes = new Map<string, ResolvedFeatureRoute>();

    constructor(descriptors: readonly FeatureDescriptor[]) {
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

    /** Home 菜单唯一数据源（§7.4）：固定排序 slot → order → featureId → entryId。 */
    menuContributions(): readonly FeatureMenuContribution[] {
        const result: FeatureMenuContribution[] = [];
        for (const feature of this.features.values()) {
            for (const item of feature.menu) result.push(item);
        }
        return result.sort((left, right) => {
            if (left.slot !== right.slot) return left.slot - right.slot;
            if (left.order !== right.order) return left.order - right.order;
            if (left.featureId !== right.featureId) return left.featureId < right.featureId ? -1 : 1;
            if (left.entryId === right.entryId) return 0;
            return left.entryId < right.entryId ? -1 : 1;
        });
    }
}
