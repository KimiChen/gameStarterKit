/**
 * 宣传首屏逻辑（纯 TS，无头单测）——框架默认形态的登录后落地页
 * （docs/PLUGIN.md §6：加载页 → 宣传首屏（右上角设置按钮）→ 设置面板收纳插件入口）。
 *
 * ⛔ **首屏不摆玩法入口**：这是框架自带的宣传页，谁上首屏是接手者自己项目的产品决策，
 * 框架层不需要「谁上首屏」的白名单。玩法/插件入口一律经设置面板
 * （logic/page/SettingsLogic.ts）——本文件因此 ⛔ 不读 menu contribution、
 * ⛔ 不持有任何 launch 通道，只有一个「打开设置」的出口。
 *
 * 展示内容全部来自 shared 单源常量（铁律 6）：项目显示名、两个协议身份整数、
 * 已登记玩法数。会话摘要（当前服 / 账号 / 档案）由组合根注入——它是 authenticated
 * base，最终断线对账后的刷新快照要落到这里。
 */
import {
    GAMEPLAY_CATALOG,
    GAME_ROOM_PROTOCOL_VERSION,
    LOBBY_PROTOCOL_VERSION,
    PROJECT_DISPLAY_NAME,
} from "../../shared/index";

/** 组合根注入的会话摘要（profile 为 null = 还没有权威角色档）。 */
export interface PromoHomeSession {
    readonly serverName: string;
    readonly userId: string;
    readonly profile: {
        readonly stamina: number;
        readonly wins: number;
        readonly losses: number;
    } | null;
}

export interface PromoHomeModel {
    readonly title: string;
    readonly subtitle: string;
    /** 运行时身份行：两个协议整数 + 已登记玩法数。 */
    readonly runtimeLine: string;
    /** 会话摘要行（当前服 · 账号 · 体力/战绩）。 */
    readonly sessionLine: string;
    readonly settingsLabel: string;
}

const SUBTITLE = "Cocos Creator + Colyseus 实时游戏脚手架";

export class PromoHomeLogic {
    /** 右上角设置按钮回调（opener 注入，打开 settings 路由）。 */
    onOpenSettings: () => void | Promise<void> = () => {};

    private session: PromoHomeSession | null = null;

    setSession(session: PromoHomeSession | null): void {
        this.session = session;
    }

    /** 运行时身份行：⛔ 不复制版本号字面量，值只来自 shared 常量。 */
    runtimeLine(): string {
        const gameplays = Object.keys(GAMEPLAY_CATALOG).length;
        return `协议 game v${GAME_ROOM_PROTOCOL_VERSION} · lobby v${LOBBY_PROTOCOL_VERSION} · 已登记玩法 ${gameplays}`;
    }

    /** 会话摘要行（无会话时给出可读占位，⛔ 不显示空行）。 */
    sessionLine(): string {
        const session = this.session;
        if (!session) return "未登录";
        const who = session.userId || "未登录";
        const server = session.serverName ? `${session.serverName} · ` : "";
        const profile = session.profile
            ? ` · 体力 ${session.profile.stamina} · ${session.profile.wins}胜${session.profile.losses}负`
            : "";
        return `${server}${who}${profile}`;
    }

    model(): PromoHomeModel {
        return {
            title: PROJECT_DISPLAY_NAME,
            subtitle: SUBTITLE,
            runtimeLine: this.runtimeLine(),
            sessionLine: this.sessionLine(),
            settingsLabel: "设置",
        };
    }

    openSettings(): void | Promise<void> {
        return this.onOpenSettings();
    }
}
