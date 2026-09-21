/**
 * 铜币收益 plugin module（PluginHost 装载单元；由 codegen:plugins 渲染为
 * plugins.generated 的静态字面量 `load`）。
 *
 * install 做三件事，全部随 `context.own` 在 dispose 时逆序注销：
 *  1. 把宿主 ports 组装成 IncomeRuntime 挂到 holder（View 打开时读取）；
 *  2. 订阅 Lobby 连接：每个 session 首次 ready 时拉一次待领预览，有离线收益就自动弹窗
 *     （「重新登录后弹窗」的落点——⛔ 不往 app/ 里加玩法分支）；
 *  3. 注册 5 秒心跳：帧累计满一个周期就发一次 `income.settleOnline`（服务端无定时器，
 *     在线收益靠这条心跳入账）。
 *
 * ⚠ 自动弹窗用 detached promise 观察：install 里 await 它会把 plugin 装载拖到整段
 * RPC + 页面打开之后，而宿主按「装载完成」判定可用性。失败只记日志，不影响心跳。
 */
import type { PluginModule } from "../../app/PluginHost";
import { IncomeRpc } from "../../shared/protocol/lobbyRpc/domains/income";
import { IncomeLogic } from "./logic/IncomeLogic";
import { setIncomeRuntime, type IncomeRuntime } from "./logic/incomeRuntime";

const ROUTE_ID = "income";

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            const ports = context.ports;
            const runtime: IncomeRuntime = {
                pending: () => ports.lobbyRpc.query(IncomeRpc.GetPending, {}),
                // natural-write 与只读查询走同一条 query 通道（journal 只包幂等写）。
                settleOnline: () => ports.lobbyRpc.query(IncomeRpc.SettleOnline, {}),
                claimOffline: () => ports.lobbyRpc.sendIdempotent(IncomeRpc.ClaimOffline, {}),
                open: async () => {
                    await ports.navigation.open(ROUTE_ID);
                },
                close: () => ports.navigation.close(ROUTE_ID),
            };
            const logic = new IncomeLogic(runtime);
            context.own(setIncomeRuntime(runtime));

            /** 已自动弹过窗的 session generation（同会话内重连不重复弹）。 */
            let autoOpenedSession = -1;
            const autoOpen = async (): Promise<void> => {
                await logic.refresh();
                if (!logic.shouldPopup()) return;
                await runtime.open();
            };
            const maybeAutoOpen = (): void => {
                if (!ports.session.isLoggedIn()) return;
                const generation = ports.session.getSessionGeneration();
                if (generation === autoOpenedSession) return;
                autoOpenedSession = generation;
                void autoOpen().catch((error) => {
                    console.error("[income] 离线收益弹窗打开失败", error);
                });
            };

            // 订阅即回放当前连接快照：装载发生在 ready 之后时同样能拿到一次 ready。
            context.own(ports.lifecycle.subscribeConnection((event) => {
                if (event.kind === "ready" || event.kind === "reconnected") maybeAutoOpen();
            }));

            context.own(ports.ticker.add((dt) => {
                if (ports.lifecycle.getConnectionState().state !== "ready") return;
                if (!logic.tick(dt)) return;
                void logic.poll();
            }));
        },
    };
}
