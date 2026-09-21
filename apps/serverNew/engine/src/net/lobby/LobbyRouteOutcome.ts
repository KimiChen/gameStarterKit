/**
 * Route 的传输层附加结果。engine 不解释 sync 内容，只保证它跟随业务结果跨进程回到
 * 持有连接的一端；具体结构由 server 注入的 shared codec 校验。
 */
export interface LobbyRouteOutcome {
    readonly kind: 'lobby-route-outcome'
    readonly data: unknown
    readonly sync?: unknown
}

export function lobbyRouteOutcome(data: unknown, sync?: unknown): LobbyRouteOutcome {
    return sync === undefined
        ? { kind: 'lobby-route-outcome', data }
        : { kind: 'lobby-route-outcome', data, sync }
}

export function isLobbyRouteOutcome(value: unknown): value is LobbyRouteOutcome {
    return !!value
        && typeof value === 'object'
        && (value as { kind?: unknown }).kind === 'lobby-route-outcome'
        && Object.prototype.hasOwnProperty.call(value, 'data')
}
