/**
 * 主界面逻辑（纯 TS，无头单测）——展示用户 id + 数据驱动的玩法入口（§7.4 机制）。
 *
 * 入口数据来自 generated menu contributions（FeatureRegistry 暴露、组合根注入）；
 * 点击统一走 entry.launch()（生产接线为 LaunchPort.launch(target)，⛔ 本层不分支
 * Navigation/gameplay）。disabled/failed 叠加：主入口不可用时 handler 直接拒绝
 * （Home 视觉仍是单按钮，占位=不可点击；GList 入口列表是编辑器待办）。
 * 无入口数据时回退 onEnterBattle 旧回调（无头/迁移期兼容）。
 */

/** 一条已叠加运行时可用性的 Home 菜单入口（组合根从 contribution 组装）。 */
export interface HomeMenuEntryModel {
    readonly entryId: string;
    readonly featureId: string;
    readonly label: string;
    /** FeatureHost 运行时可用性叠加（failed/disabled → false；built-in 恒 true）。 */
    readonly enabled: boolean;
    readonly launch: () => void | Promise<void>;
}

export class HomeLogic {
    /** 当前展示的用户 id */
    userId = "";
    /** 点「进入游戏」按钮回调——无菜单入口数据时的回退通道（迁移期兼容） */
    onEnterBattle: () => void | Promise<void> = () => {};
    /** 数据驱动入口（已按 slot → order → featureId → entryId 排序） */
    entries: readonly HomeMenuEntryModel[] = [];

    setUserId(uid: string): void {
        this.userId = uid;
    }

    setEntries(entries: readonly HomeMenuEntryModel[]): void {
        this.entries = entries;
    }

    /** 渲染到现 btn_enter 的主入口（contribution[0]）。 */
    primaryEntry(): HomeMenuEntryModel | null {
        return this.entries[0] ?? null;
    }

    /** 点击入口：主入口存在则唯一走 entry.launch；不可用（disabled/failed）直接拒绝。 */
    enterBattle(): void | Promise<void> {
        const primary = this.primaryEntry();
        if (primary) {
            if (!primary.enabled) return;
            return primary.launch();
        }
        return this.onEnterBattle();
    }
}
