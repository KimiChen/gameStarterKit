/** 原生客户端的宿主产品配置；kit 卸载后回到框架首页。 */
export const NATIVE_HOME_ROUTE = "gameDemo";

export function resolveNativeHomeRoute(
    transport: string,
    hasRoute: (routeId: string) => boolean,
): string | null {
    return transport === "native-websocket" && hasRoute(NATIVE_HOME_ROUTE)
        ? NATIVE_HOME_ROUTE
        : null;
}
