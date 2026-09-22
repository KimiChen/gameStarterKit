import { isLobbyRouteOutcome } from '@arthropoda/game-engine'

/**
 * 原生 Lobby 路由执行结果的**业务数据**解包。
 *
 * `NativeLobbyRouteRegistry.execute` / `executeForwarded` 统一返回 `LobbyRouteOutcome`
 * （`{ kind, data, sync }`）：传输层用它把已提交的 Bean 变化带回持有连接的一端。
 * 绝大多数测试断言的是业务数据，所以统一在这里解包，⛔ 不要在用例里各自复制这段判断。
 *
 * ⚠ 解包只丢弃 `sync`，不丢弃契约校验：调用方拿到 data 后仍必须过 shared 响应 validator。
 * 需要断言 `sync` 的用例请用 `lobbyOutcomeSync`，⛔ 不要为了看 sync 就绕过 `execute` 的解包契约。
 */
export function lobbyOutcomeData(result: unknown): unknown {
    return isLobbyRouteOutcome(result) ? result.data : result
}

/** 路由执行结果里的同步载荷；没有同步时是 `undefined`（不是空对象）。 */
export function lobbyOutcomeSync(result: unknown): unknown {
    return isLobbyRouteOutcome(result) ? result.sync : undefined
}
