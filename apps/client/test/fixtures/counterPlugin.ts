/**
 * 阶段 5 退出条件 fixture plugin（Non-intrusive §9 阶段 5）。
 *
 * 只经 ports 消费宿主能力：⛔ 不 import WebSocketClient/RoomClient/cc/fairygui
 * （appExitConditions.test.ts 的静态值导入门禁扫描本目录）。
 *
 * 行为：install 时订阅连接/宿主事件并登记 route-scoped ticker；`refresh(signal)`
 * 经 ports.lobbyRpc.query 拉快照，写回前按四重守卫复验——route signal、session
 * generation、app generation（install 时捕获）、连接扰动 epoch（dropped/reconnected/
 * closed/host hide 任一事件即失效在途快照）。任何一重失效都只计 staleDrops，
 * ⛔ 不回写 value。
 */
import type { PluginInstallContext, PluginModule } from "../../src/app/PluginHost";
import type { AppPorts } from "../../src/app/ports";

export interface CounterPluginProbe {
    readonly module: PluginModule;
    /** 已提交的快照值（旧响应绝不回写这里）。 */
    value(): number | null;
    writes(): number;
    staleDrops(): number;
    ticks(): number;
    /** 经 ports 发起一次快照刷新；返回是否提交。 */
    refresh(routeSignal: AbortSignal): Promise<boolean>;
    lastConnectionKind(): string | null;
}

export function createCounterPlugin(): CounterPluginProbe {
    let ports: AppPorts | null = null;
    let installContext: PluginInstallContext | null = null;
    let value: number | null = null;
    let writes = 0;
    let staleDrops = 0;
    let ticks = 0;
    /** 连接/宿主扰动 epoch：任何 transport 转变或宿主隐藏都使在途快照过期。 */
    let disruptionEpoch = 0;
    let lastConnectionKind: string | null = null;
    let removeTicker: (() => void) | null = null;

    const module: PluginModule = {
        install(context) {
            ports = context.ports;
            installContext = context;
            context.own(context.ports.lifecycle.subscribeConnection((event) => {
                lastConnectionKind = event.kind;
                if (event.kind === "dropped" || event.kind === "reconnected" || event.kind === "closed") {
                    disruptionEpoch++;
                }
            }));
            context.own(context.ports.lifecycle.subscribeHost((event) => {
                if (event.kind === "hide") disruptionEpoch++;
            }));
            removeTicker = context.ports.ticker.add(() => { ticks++; }, context.signal);
            context.own(() => {
                removeTicker?.();
                removeTicker = null;
            });
        },
        dispose() {
            ports = null;
            installContext = null;
        },
    };

    return {
        module,
        value: () => value,
        writes: () => writes,
        staleDrops: () => staleDrops,
        ticks: () => ticks,
        lastConnectionKind: () => lastConnectionKind,
        async refresh(routeSignal: AbortSignal): Promise<boolean> {
            const activePorts = ports;
            const context = installContext;
            if (!activePorts || !context) throw new Error("counterPlugin 未安装");
            const capturedSession = activePorts.session.getSessionGeneration();
            const capturedApp = context.appGeneration;
            const capturedEpoch = disruptionEpoch;
            let snapshot: unknown;
            try {
                snapshot = await activePorts.lobbyRpc.query("user.getInfo" as never, {} as never);
            } catch {
                staleDrops++;
                return false;
            }
            const stale = routeSignal.aborted
                || context.signal.aborted
                || activePorts.session.getSessionGeneration() !== capturedSession
                || context.appGeneration !== capturedApp
                || disruptionEpoch !== capturedEpoch;
            if (stale) {
                staleDrops++;
                return false;
            }
            const user = (snapshot as { user?: { stamina?: number } } | null)?.user;
            value = typeof user?.stamina === "number" ? user.stamina : 0;
            writes++;
            return true;
        },
    };
}
