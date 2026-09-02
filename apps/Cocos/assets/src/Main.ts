/**
 * Cocos application shell（Non-intrusive §7.2 阶段 5b 收敛后）：只负责
 * bootstrap（分辨率 + createAppRuntime）、update 转发与 dispose 转发。
 * 全部编排逻辑（gameplay 装配 / 会话接线 / 导航启动 / 销毁顺序）在
 * app/AppRuntime + app/bootstrap；本组件不再直接触达 pages/session/gameplay。
 */
import { _decorator, Component, ResolutionPolicy, view } from "cc";
import { installWeChatCompat } from "./core/wechat-compat";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "./designSpec";
import { GameplayModeId } from "./shared/index";
import { createAppRuntime } from "./app/bootstrap";
import type { AppRuntime } from "./app/AppRuntime";

// Must run before the first Colyseus operation. Imported network modules do not
// connect during evaluation; RoomController starts the join only from enterBattle.
installWeChatCompat();

const { ccclass, property } = _decorator;

@ccclass("Main")
export class Main extends Component {
    @property({ tooltip: "服务端 http(s) 地址。留空 = 自动跟随根 .env.development 的 PORT；填写即覆盖。" })
    serverUrl = "";

    @property({ tooltip: "WebPlatform Public http(s) 地址（登录 + 选服），必填。" })
    portalUrl = "";
    // 阶段 9 登记：Home 菜单已数据驱动（generated menu contribution 的 launch target
    // 优先），本字段只剩「默认 launch target 兜底」职责，Home 数据驱动稳定后可删——
    // 但删除 @property 属场景资产 diff（scene.scene 由 Creator 重新序列化并人工审查，
    // 见 docs/Non-intrusive.md §8），⛔ 不在无头批次中机械删除。
    @property({ tooltip: "要进入的已登记玩法 id；默认 snake，可替换为 ballMove/idle。" })
    gameplayId = GameplayModeId.Snake;

    private runtime: AppRuntime | null = null;

    onLoad(): void {
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        try {
            this.runtime = createAppRuntime({
                node: this.node,
                serverUrl: this.serverUrl,
                portalUrl: this.portalUrl,
                gameplayId: this.gameplayId,
            });
        } catch (error) {
            console.error("[Main] 应用宿主启动失败（portalUrl 是否已配置？）：", error);
        }
    }

    update(dt: number): void {
        this.runtime?.tick(dt);
    }

    onDestroy(): void {
        const runtime = this.runtime;
        this.runtime = null;
        runtime?.dispose();
    }
}
