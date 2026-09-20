import { validateOrigin } from "../shared/index";

/**
 * Lobby transport 必须由显式配置选择；不能由 URL 形状猜测，也不能改写旧目录的 gameWsUrl。
 * `colyseus` 保持当前 apps/server 链路，`native-websocket` 仅指向 serverNew 的独立端点。
 */
export type LobbyTransportConfig =
  | { readonly kind: "colyseus" }
  | { readonly kind: "native-websocket"; readonly endpoint: string };

export function validateLobbyTransportConfig(
  input: unknown,
): LobbyTransportConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Lobby transport 配置必须是对象");
  }
  const value = input as { kind?: unknown; endpoint?: unknown };
  if (value.kind === "colyseus") {
    if (Object.keys(value).length !== 1)
      throw new Error("Colyseus Lobby 配置字段无效");
    return { kind: "colyseus" };
  }
  if (value.kind === "native-websocket") {
    if (Object.keys(value).length !== 2)
      throw new Error("原生 Lobby 配置字段无效");
    return {
      kind: "native-websocket",
      endpoint: validateOrigin(value.endpoint, ["ws", "wss"], "endpoint"),
    };
  }
  throw new Error("未知 Lobby transport 类型");
}
