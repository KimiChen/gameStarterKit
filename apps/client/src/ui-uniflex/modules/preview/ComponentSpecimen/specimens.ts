export interface ComponentSpecimenSpec {
    readonly id: string;
    readonly group: string;
    readonly groupLabel: string;
    readonly label: string;
    readonly width: number;
    readonly height: number;
    readonly wide: boolean;
}

/** One card per shared component. Sizes match the gallery specimens. */
export const componentSpecimens: readonly ComponentSpecimenSpec[] = [
    { id: "cmp-confirm", group: "cmp-buttons", groupLabel: "按钮", label: "确定", width: 210, height: 92, wide: false },
    { id: "cmp-cancel", group: "cmp-buttons", groupLabel: "按钮", label: "取消", width: 210, height: 92, wide: false },
    { id: "cmp-cyan", group: "cmp-buttons", groupLabel: "按钮", label: "前往", width: 210, height: 92, wide: false },
    { id: "cmp-red", group: "cmp-buttons", groupLabel: "按钮", label: "红色", width: 210, height: 92, wide: false },
    { id: "cmp-yellow", group: "cmp-buttons", groupLabel: "按钮", label: "黄色", width: 210, height: 92, wide: false },
    { id: "cmp-back", group: "cmp-buttons", groupLabel: "按钮", label: "返回", width: 64, height: 56, wide: false },
    { id: "cmp-close", group: "cmp-buttons", groupLabel: "按钮", label: "关闭", width: 72, height: 72, wide: false },
    { id: "cmp-icon", group: "cmp-buttons", groupLabel: "按钮", label: "图标按钮", width: 210, height: 74, wide: false },
    { id: "cmp-menu", group: "cmp-buttons", groupLabel: "按钮", label: "宽菜单", width: 326, height: 114, wide: false },
    { id: "cmp-badge", group: "cmp-feedback", groupLabel: "反馈、输入与状态", label: "数字角标", width: 48, height: 48, wide: false },
    { id: "cmp-dot", group: "cmp-feedback", groupLabel: "反馈、输入与状态", label: "红点", width: 36, height: 36, wide: false },
    { id: "cmp-check", group: "cmp-feedback", groupLabel: "反馈、输入与状态", label: "勾选", width: 210, height: 60, wide: false },
    { id: "cmp-input", group: "cmp-feedback", groupLabel: "反馈、输入与状态", label: "输入", width: 290, height: 56, wide: false },
    { id: "cmp-progress", group: "cmp-feedback", groupLabel: "反馈、输入与状态", label: "进度条", width: 674, height: 34, wide: true },
    { id: "cmp-empty", group: "cmp-feedback", groupLabel: "反馈、输入与状态", label: "空状态", width: 674, height: 168, wide: true },
    { id: "cmp-tabs", group: "cmp-items", groupLabel: "页签、数量与道具", label: "页签", width: 674, height: 67, wide: true },
    { id: "cmp-tab-character", group: "cmp-items", groupLabel: "页签、数量与道具", label: "角色页签", width: 674, height: 66, wide: true },
    { id: "cmp-tab-hero-list", group: "cmp-items", groupLabel: "页签、数量与道具", label: "英雄列表页签", width: 681, height: 94, wide: true },
    { id: "cmp-tab-hero-detail", group: "cmp-items", groupLabel: "页签、数量与道具", label: "英雄详情页签", width: 647, height: 90, wide: true },
    { id: "cmp-quantity", group: "cmp-items", groupLabel: "页签、数量与道具", label: "数量", width: 674, height: 85, wide: true },
    { id: "cmp-slot", group: "cmp-items", groupLabel: "页签、数量与道具", label: "道具格", width: 154, height: 159, wide: false },
    { id: "cmp-resource", group: "cmp-items", groupLabel: "页签、数量与道具", label: "资源", width: 153, height: 45, wide: false },
    { id: "cmp-stars", group: "cmp-items", groupLabel: "页签、数量与道具", label: "星级", width: 488, height: 64, wide: false },
    { id: "cmp-star-row", group: "cmp-items", groupLabel: "页签、数量与道具", label: "星级排", width: 411, height: 64, wide: false },
    { id: "cmp-tech", group: "cmp-items", groupLabel: "页签、数量与道具", label: "科技图标", width: 164, height: 190, wide: false },
    { id: "cmp-reward", group: "cmp-items", groupLabel: "页签、数量与道具", label: "奖励道具", width: 598, height: 53, wide: true },
    { id: "cmp-header", group: "cmp-chrome", groupLabel: "页头、页尾与导航", label: "页面标题", width: 750, height: 114, wide: true },
    { id: "cmp-footer", group: "cmp-chrome", groupLabel: "页头、页尾与导航", label: "页尾", width: 750, height: 110, wide: true },
    { id: "cmp-nav", group: "cmp-chrome", groupLabel: "页头、页尾与导航", label: "底栏", width: 750, height: 149, wide: true },
    { id: "cmp-popup", group: "cmp-popup", groupLabel: "弹窗与关闭", label: "弹窗", width: 750, height: 558, wide: true },
];

export function findSpecimen(id: string | null | undefined): ComponentSpecimenSpec | null {
    if (!id) return null;
    return componentSpecimens.find((item) => item.id === id) ?? null;
}
