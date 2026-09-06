/**
 * 入口分组页逻辑（纯 TS，无头单测）——宿主 placement 里一个分组的“二级入口页”。
 *
 * 为什么需要它（docs/PLUGIN.md §6.1）：一个产品级入口在设置面板里就该是**一行**。
 * 竞技场现在由 kit `arena`（棋盘 / 占领赛 / 决斗）与插件 `arenaShop`（商店）共四条 menu
 * contribution 组成，平铺在设置面板里就是四行并列，读者根本看不出它们是同一个玩法域。
 * ⛔ 分组不能由插件自己声明：arena 是 kit、arenaShop 是插件，而 kit ⛔ 不得依赖插件
 * （docs/KIT.md §1/§4），谁都没资格宣布「我们四个是一伙的」——只有宿主知道，所以分组住在
 * apps/plugins/host.json。
 *
 * 本页只做一件事：把该组成员按 placement 声明序列出来，点击走**同一条** launch 通道
 * （宿主 LaunchPort → PluginHost userIntent 闸），不可用的置灰并给显式「重试」——
 * 与设置面板逐字同口径，⛔ 不另造一套可用性语义。
 *
 * 渲染归 view/EntryGroupView.ts；本文件 ⛔ 不 import cc / fairygui（铁律 9）。
 */
import type { PluginAvailability } from "./SettingsLogic";

/** 组内一条入口的输入（组合根从 menu contribution 组装；launch 闭包同 SettingsLogic 形态）。 */
export interface EntryGroupItemInput {
    readonly entryId: string;
    readonly pluginId: string;
    readonly label: string;
    readonly launch: () => void | Promise<void>;
}

/** 已叠加运行时可用性的组内入口（渲染用）。 */
export interface EntryGroupItemModel {
    readonly entryId: string;
    readonly pluginId: string;
    readonly label: string;
    readonly enabled: boolean;
    /** 不可用原因；可用时 null。 */
    readonly disabledReason: string | null;
}

export interface EntryGroupDeps {
    /** PluginHost 运行时可用性（与设置面板同一个叠加层）。 */
    availabilityOf(pluginId: string): PluginAvailability;
}

function disabledReasonOf(availability: PluginAvailability): string | null {
    if (availability === "failed") return "插件装载失败";
    if (availability === "disabled") return "插件已停用";
    return null;
}

export class EntryGroupLogic {
    /** 任一可见状态变化后的重绘通知（View 接线）。 */
    onChanged: () => void = () => {};

    private items: readonly EntryGroupItemInput[] = [];

    constructor(
        private readonly deps: EntryGroupDeps,
        /** 分组标题（宿主 placement 的 label）。 */
        private readonly title: string,
    ) {}

    groupTitle(): string {
        return this.title;
    }

    /** 组内入口：**保持 placement 的声明序**——⛔ 不再按 pluginId 排序。 */
    setItems(items: readonly EntryGroupItemInput[]): void {
        this.items = items;
        this.onChanged();
    }

    entries(): readonly EntryGroupItemModel[] {
        return this.items.map((item) => {
            const availability = this.deps.availabilityOf(item.pluginId);
            return {
                entryId: item.entryId,
                pluginId: item.pluginId,
                label: item.label,
                enabled: availability === "available",
                disabledReason: disabledReasonOf(availability),
            };
        });
    }

    /** 点击一条入口：可用才走 launch。 */
    async activate(entryId: string): Promise<void> {
        const model = this.entries().find((item) => item.entryId === entryId);
        if (!model || !model.enabled) return;
        await this.runLaunch(entryId);
    }

    /** 显式重试一条不可用入口：与设置面板同一条通道（宿主侧 userIntent 闸重装）。 */
    async retry(entryId: string): Promise<void> {
        const model = this.entries().find((item) => item.entryId === entryId);
        if (!model || model.enabled) return;
        await this.runLaunch(entryId);
    }

    private async runLaunch(entryId: string): Promise<void> {
        const input = this.items.find((item) => item.entryId === entryId);
        if (!input) return;
        try {
            await input.launch();
        } finally {
            // 可用性可能因这次 launch 翻转（failed → active），重绘一次。
            this.onChanged();
        }
    }
}

// ── 战斗结束后的返回位（纯状态，无 cc；组合根 app/loginFlow.ts 是唯一调用方） ──

/**
 * 「从哪个分组页进的战斗」。玩法结束后要回到那儿，⛔ 不是把玩家扔回大厅。
 *
 * ⚠ 为什么需要记这一笔：`launch.kind:"gameplay"` 的入口进战斗前会 `closeGroup("authenticated")`
 * 把整层大厅壳关掉（设置面板与分组页一起没），战斗结束后宿主只恢复 authenticated base（首屏）。
 * route 形态的成员（竞技场棋盘 / 竞技场商店）⛔ 不走这条路——它们只是压在分组页上的一层，
 * 关掉自然露出分组页，本来就回得去。
 */
let pendingGroupReturn: string | null = null;

/** 从分组页启动 gameplay 形态的成员时置位；传 null 表示这次不需要回分组页。 */
export function rememberGroupReturn(groupId: string | null): void {
    pendingGroupReturn = groupId;
}

/** 从分组页之外启动任何入口时清位——⛔ 否则一次没打起来的战斗会让后面某局结束时莫名弹出分组页。 */
export function clearGroupReturn(): void {
    pendingGroupReturn = null;
}

/** 读取并清空（**只回一次**）：恢复 authenticated base 时调用。 */
export function takeGroupReturn(): string | null {
    const groupId = pendingGroupReturn;
    pendingGroupReturn = null;
    return groupId;
}
