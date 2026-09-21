/**
 * 原生 Lobby 的铜币收益账户。
 *
 * 这是 income 模块自有的 Redis 记录：新账号首次认证时以 1 级 / 0 铜币初始化，
 * 不读取旧通道的 `User` Bean，也不复用其 `User_<internalUid>` 哈希。
 */
export interface IncomeAccount {
    readonly level: number
    copper: number
    lastIncomeAt: number
    offlineCopper: number
    offlineSeconds: number
}
