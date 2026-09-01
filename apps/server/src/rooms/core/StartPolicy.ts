/**
 * StartPolicy（Non-intrusive §6.2）：房间开局方式的判别联合。
 *
 * ⛔ **不重复声明任何人数**——min/max/autoStart 的唯一真源是 manifest/roster
 * （`GameMode.roster`，上界由 GAMEPLAY_CATALOG.maxPlayers 闸）；`auto` 分支刻意不带
 * `minPlayers`：自动开局人数用 roster.autoStart，它与 min 是两个字段（min=2 但 3 人才
 * 自动开是合法表达），两份声明必然漂移。
 *
 * 三种 startPolicy 的失败归属不同（§6.2；drop-in 见 SERVER.md「StartPolicy 三变体」）：
 *  - `auto`：由新玩家 onJoin 触发，开局失败回滚 roster 并以 join 拒绝回给**触发者**；
 *  - `owner-ready`：由房主的 C2S Start 触发，开局失败**只能**回滚 Waiting 并向房主返回
 *    可重试稳定错误（RoomControlError.StartFailed），⛔ 绝不移除房主或触发 owner 转移；
 *  - `drop-in`：自由加入房型——首人 onJoin 即触发开局（复用 auto 的 autoStart 阈值路径，
 *    要求 roster.min === 1 && roster.autoStart === 1，注册期断言），失败归属同 auto。
 *    动态 roster 是本策略的定义：开局事务 ⛔ 不 lock 房间（房间必须始终可撮合）、
 *    fence ⛔ 不比 roster 快照，Playing 中仍可入座（上限 = roster.max，含重连宽限占座）。
 *    互斥（注册期 fail-fast）：⛔ 不与 invite-code AccessPolicy 组合（未设计的组合）；
 *    ⛔ 不与 mode.evidence capability 组合（evidence 冻结 initialRoster，与动态 roster 矛盾）。
 */
export type StartPolicy =
    | { readonly kind: "auto" }
    | {
        readonly kind: "owner-ready";
        readonly requireAllReady: true;
        readonly requireConnected: true;
    }
    | { readonly kind: "drop-in" };

export const AUTO_START_POLICY: StartPolicy = Object.freeze({ kind: "auto" });

export const OWNER_READY_START_POLICY: StartPolicy = Object.freeze({
    kind: "owner-ready",
    requireAllReady: true,
    requireConnected: true,
} as const);

export const DROP_IN_START_POLICY: StartPolicy = Object.freeze({ kind: "drop-in" });
