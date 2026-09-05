/**
 * 衣柜 feature module（FeatureHost 装载单元；由 codegen:features 渲染为 features.generated
 * 的静态字面量 `load`）。install 只做一件事：把宿主 ports 组装成 SnakeCosmeticRuntime 挂到
 * holder，注销随 context.own 在 dispose 时逆序执行。
 *
 * ⚠ 三条路由都走 `query`：getSnapshot 是 query，equip/unlock 是 **natural-write**——
 * natural-write 不在 `LobbyRpcIdemType` 里，⛔ 调不到（也不需要）sendIdempotent 的
 * journal write-ahead，重复执行由服务端 store 的 no-op 语义保证安全。
 */
import type { FeatureModule } from "../../app/FeatureHost";
import { SnakeCosmeticRpc } from "../../shared/protocol/lobbyRpc/domains/snakeCosmetic";
import { setSnakeCosmeticRuntime } from "./logic/snakeCosmeticRuntime";

const ROUTE_ID = "snakeCosmetic";

export function createFeatureModule(): FeatureModule {
    return {
        install(context) {
            const rpc = context.ports.lobbyRpc;
            context.own(setSnakeCosmeticRuntime({
                getSnapshot: () => rpc.query(SnakeCosmeticRpc.GetSnapshot, {}),
                equip: (skinId) => rpc.query(SnakeCosmeticRpc.Equip, { skinId }),
                unlock: (skinId) => rpc.query(SnakeCosmeticRpc.Unlock, { skinId }),
                close: () => context.ports.navigation.close(ROUTE_ID),
            }));
        },
    };
}
