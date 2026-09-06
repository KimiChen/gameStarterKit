/**
 * 设置面板逻辑（纯 TS，无头单测）——框架默认形态里它同时承担「入口大厅」职责
 * （docs/PLUGIN.md §6：加载页 → 宣传首屏 → 设置面板收纳插件入口）。
 *
 * 两个区块，边界来自 PLUGIN.md §6.1：
 *  1. **宿主固定项**（⛔ 不可由插件提供）：音乐/音效走 user profile 的 musicOn/sfxOn
 *     幂等写；语言/推送/条款/隐私/兑换码/日志上报当前**没有实现**，一律置灰并逐条
 *     标注原因（⛔ 不做假实现——一个点了没反应的开关比没有这个开关更糟）。兑换码 ⛔ 不在此列：
 *     它是插件标准形态（PLUGIN.md §6.1），由 plugins/redeem 以 launch.kind:"route" 的入口进插件列表。
 *  2. **插件入口列表**：数据源仍是 generated menu contributions（全量），排序取
 *     **pluginId 字母序**（§6：插件只声明入口身份，位置归宿主——首屏位置是 apps/plugins/host.json
 *     的事，本层 ⛔ 不看）。不可用（PluginHost failed/disabled）的条目置灰，
 *     另给显式「重试」——重试走的就是同一条 launch 通道（宿主侧 userIntent 闸）。
 *
 * 渲染归 view/SettingsView.ts；本文件 ⛔ 不 import cc / fairygui（铁律 9）。
 */

/** PluginHost 运行时可用性叠加（catalog 之外的可变层；与 AppRuntime.pluginAvailability 同形）。 */
export type PluginAvailability = "available" | "failed" | "disabled";

/** 宿主固定音频开关的字段名（= user profile 字段名，⛔ 不另造一套 key）。 */
export type SettingsAudioKey = "musicOn" | "sfxOn";

/** 幂等写 payload（clientReqId 由宿主的 sendIdempotent 负责，本层不生成）。 */
export interface SettingsProfilePatch {
    readonly musicOn?: boolean;
    readonly sfxOn?: boolean;
}

export interface SettingsAudioToggleModel {
    readonly key: SettingsAudioKey;
    readonly label: string;
    readonly on: boolean;
    /** 写在途：UI 已乐观翻转，期间不接受再次点击（⛔ 不排队第二次写）。 */
    readonly pending: boolean;
}

/** 置灰占位条目：⛔ 无实现，reason 逐条说明为什么没有。 */
export interface SettingsPlaceholderModel {
    readonly id: string;
    readonly label: string;
    readonly reason: string;
}

/** 一条插件入口的输入（组合根从 menu contribution 组装；launch 闭包同 HomeLogic 形态）。 */
export interface SettingsPluginEntryInput {
    readonly entryId: string;
    readonly pluginId: string;
    readonly label: string;
    readonly launch: () => void | Promise<void>;
    /**
     * 所属分组 id（宿主 placement，apps/plugins/host.json）。非空的入口 ⛔ 不在本列表单独出现——
     * 它们被折进一条分组行，点进去才见（一个产品入口 = 一行，docs/PLUGIN.md §6.1）。
     */
    readonly groupId?: string | null;
}

/**
 * 一条分组行的输入：宿主声明的分组，在设置面板里占**一行**，launch 打开分组页。
 * `pluginIds` 是组内成员的贡献者集合——可用性按「组内还有可用成员」判：⛔ 不能因为
 * 组里某个插件 failed 就把整个入口置灰，那会连带屏蔽掉别人的入口。
 */
export interface SettingsGroupEntryInput {
    readonly groupId: string;
    readonly label: string;
    readonly pluginIds: readonly string[];
    readonly launch: () => void | Promise<void>;
}

/** 已叠加运行时可用性的插件入口（渲染用）。 */
export interface SettingsPluginEntryModel {
    readonly entryId: string;
    readonly pluginId: string;
    readonly label: string;
    readonly enabled: boolean;
    /** 不可用原因；可用时 null。 */
    readonly disabledReason: string | null;
}

export interface SettingsDeps {
    /** 幂等写（宿主接 ports.lobbyRpc.sendIdempotent(user.updateProfile)）。 */
    readonly updateProfile: (patch: SettingsProfilePatch) => Promise<void>;
    /** PluginHost 可用性叠加（未托管贡献者按 available 处理，与 Home 同裁定）。 */
    readonly availabilityOf: (pluginId: string) => PluginAvailability;
}

/** 渲染顺序（也是 audioToggles 的返回顺序）。 */
const AUDIO_KEYS: readonly SettingsAudioKey[] = ["musicOn", "sfxOn"];

const AUDIO_LABELS: Readonly<Record<SettingsAudioKey, string>> = {
    musicOn: "音乐",
    sfxOn: "音效",
};

/**
 * 宿主固定占位项（⛔ 插件不可提供；合规四项的责任不可转移，见 PLUGIN.md §6.1）。
 * 每条的 reason 就是「为什么今天是灰的」——⛔ 不允许写成含糊的「敬请期待」。
 */
export const SETTINGS_PLACEHOLDERS: readonly SettingsPlaceholderModel[] = [
    { id: "language", label: "语言", reason: "i18n 未实现：labelKey 有字段无实现，渲染用的仍是硬编码 label" },
    { id: "push", label: "推送通知", reason: "未实现：现有 push 只有下行机制，无订阅开关语义，且需平台 token" },
    { id: "terms", label: "服务条款", reason: "未实现：缺版本化的「已同意」状态存储" },
    { id: "privacy", label: "隐私政策", reason: "未实现：缺版本化的「已同意」状态存储" },
    { id: "logUpload", label: "日志上报", reason: "未实现：客户端诊断采集与上报 endpoint 都还没有" },
];

function disabledReasonOf(availability: PluginAvailability): string | null {
    if (availability === "failed") return "装载失败，可重试";
    if (availability === "disabled") return "本次启动已停用（自动重试超限），可重试";
    return null;
}

export class SettingsLogic {
    private readonly deps: SettingsDeps;
    private music = true;
    private sfx = true;
    /** 在途写的字段名；非 null 期间拒绝新的音频写（单飞）。 */
    private pendingAudio: SettingsAudioKey | null = null;
    private notice = "";
    private entries: readonly SettingsPluginEntryInput[] = [];
    private groups: readonly SettingsGroupEntryInput[] = [];

    /** 视图重绘钩子（View 注入；Logic 只通知，不知道怎么画）。 */
    onChanged: () => void = () => {};

    constructor(deps: SettingsDeps) {
        this.deps = deps;
    }

    /** 读当前 session profile 的音频偏好；null（未登录/无快照）时保持默认开。 */
    setProfile(profile: { readonly musicOn: boolean; readonly sfxOn: boolean } | null): void {
        if (!profile) return;
        this.music = profile.musicOn;
        this.sfx = profile.sfxOn;
    }

    /** 宿主分组行（缺省空 = 不分组，全部入口平铺）。 */
    setGroups(groups: readonly SettingsGroupEntryInput[]): void {
        this.groups = groups;
        this.emit();
    }

    setEntries(entries: readonly SettingsPluginEntryInput[]): void {
        this.entries = entries;
    }

    audioToggles(): readonly SettingsAudioToggleModel[] {
        return AUDIO_KEYS.map((key) => ({
            key,
            label: AUDIO_LABELS[key],
            on: this.valueOf(key),
            pending: this.pendingAudio === key,
        }));
    }

    placeholders(): readonly SettingsPlaceholderModel[] {
        return SETTINGS_PLACEHOLDERS;
    }

    /**
     * 入口列表：**pluginId 字母序**（PLUGIN.md §6；同一 plugin 内以 entryId 兜底保证确定性）。
     * ⛔ 不看首屏 placement——那是 Home 的事；但**分组**是本层要落地的 placement：
     * 属于某个分组的入口在这里不单独出现，整组只占一行（entryId = pluginId = 组 id，
     * 因此和其它入口用同一把尺子排序），点它打开分组页。
     */
    pluginEntries(): readonly SettingsPluginEntryModel[] {
        const grouped: SettingsPluginEntryModel[] = this.groups.map((group) => {
            // ⛔ 组内某个插件 failed 不该让整行置灰——那会连带屏蔽掉同组其它人的入口。
            const usable = group.pluginIds.some((pluginId) => this.deps.availabilityOf(pluginId) === "available");
            return {
                entryId: group.groupId,
                pluginId: group.groupId,
                label: group.label,
                enabled: usable,
                disabledReason: usable ? null : "组内入口都不可用",
            };
        });
        const loose: SettingsPluginEntryModel[] = this.entries
            .filter((entry) => !entry.groupId)
            .map((entry) => {
                const availability = this.deps.availabilityOf(entry.pluginId);
                return {
                    entryId: entry.entryId,
                    pluginId: entry.pluginId,
                    label: entry.label,
                    enabled: availability === "available",
                    disabledReason: disabledReasonOf(availability),
                };
            });
        return [...grouped, ...loose].sort((left, right) => {
            if (left.pluginId !== right.pluginId) return left.pluginId < right.pluginId ? -1 : 1;
            if (left.entryId === right.entryId) return 0;
            return left.entryId < right.entryId ? -1 : 1;
        });
    }

    /** 可重试提示（空串 = 无）。 */
    noticeText(): string {
        return this.notice;
    }

    /**
     * 切换一个音频开关：UI 先乐观翻转 → 幂等写 → **失败回滚 UI 并给可重试提示**。
     * 在途期间同一面板不接受第二次音频写（⛔ 不排队，重复点击直接忽略）。
     */
    async toggleAudio(key: SettingsAudioKey): Promise<void> {
        if (this.pendingAudio !== null) return;
        const before = this.valueOf(key);
        const next = !before;
        this.assign(key, next);
        this.pendingAudio = key;
        this.notice = "";
        this.emit();
        const patch: { musicOn?: boolean; sfxOn?: boolean } = {};
        patch[key] = next;
        try {
            await this.deps.updateProfile(patch);
        } catch (e) {
            // 写失败 = 服务端没有这个值：UI 必须回到写之前的样子，⛔ 不留一个骗人的开关。
            this.assign(key, before);
            this.notice = `${AUDIO_LABELS[key]}设置保存失败，请重试`;
            console.error("[SettingsLogic] 音频偏好写入失败", e);
        } finally {
            this.pendingAudio = null;
            this.emit();
        }
    }

    /** 点击插件入口：可用才走 launch；不可用（置灰占位）直接拒绝。 */
    async activate(entryId: string): Promise<void> {
        const model = this.pluginEntries().find((item) => item.entryId === entryId);
        if (!model || !model.enabled) return;
        await this.runLaunch(entryId);
    }

    /**
     * 显式重试一条不可用入口：走的是**同一条** launch 通道——宿主的
     * LaunchPort.launch 内部就是 PluginHost.launch(userIntent:true)，failed 在那一刻重装。
     * ⛔ 本层不自己实现重试计数/状态机。
     */
    async retry(entryId: string): Promise<void> {
        const model = this.pluginEntries().find((item) => item.entryId === entryId);
        if (!model || model.enabled) return;
        await this.runLaunch(entryId);
    }

    private async runLaunch(entryId: string): Promise<void> {
        const group = this.groups.find((item) => item.groupId === entryId);
        const input = group
            ? { launch: group.launch }
            : this.entries.find((item) => item.entryId === entryId && !item.groupId);
        if (!input) return;
        try {
            await input.launch();
        } finally {
            // 可用性可能因这次 launch 翻转（failed → active），重绘一次。
            this.emit();
        }
    }

    private valueOf(key: SettingsAudioKey): boolean {
        return key === "musicOn" ? this.music : this.sfx;
    }

    private assign(key: SettingsAudioKey, value: boolean): void {
        if (key === "musicOn") this.music = value;
        else this.sfx = value;
    }

    private emit(): void {
        try { this.onChanged(); } catch (e) {
            console.error("[SettingsLogic] onChanged 回调异常", e);
        }
    }
}
