/**
 * StartPolicy（Non-intrusive §6.2）：房间开局方式的判别联合。
 *
 * ⛔ **不重复声明任何人数**——min/max/autoStart 的唯一真源是 manifest/roster
 * （`GameMode.roster`，上界由 GAMEPLAY_CATALOG.maxPlayers 闸）；`auto` 分支刻意不带
 * `minPlayers`：自动开局人数用 roster.autoStart，它与 min 是两个字段（min=2 但 3 人才
 * 自动开是合法表达），两份声明必然漂移。
 *
 * 两种 startPolicy 的失败归属不同（§6.2）：
 *  - `auto`：由新玩家 onJoin 触发，开局失败回滚 roster 并以 join 拒绝回给**触发者**；
 *  - `owner-ready`：由房主的 C2S Start 触发，开局失败**只能**回滚 Waiting 并向房主返回
 *    可重试稳定错误（RoomControlError.StartFailed），⛔ 绝不移除房主或触发 owner 转移。
 */
export type StartPolicy =
    | { readonly kind: "auto" }
    | {
        readonly kind: "owner-ready";
        readonly requireAllReady: true;
        readonly requireConnected: true;
    };

export const AUTO_START_POLICY: StartPolicy = Object.freeze({ kind: "auto" });

export const OWNER_READY_START_POLICY: StartPolicy = Object.freeze({
    kind: "owner-ready",
    requireAllReady: true,
    requireConnected: true,
} as const);
