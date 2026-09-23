import type { WebPlatformAreaServer } from "../shared/index";
import type {
  LobbyConnectionListener,
  LobbyConnectionSnapshot,
} from "./connectionEvents";
import { NativeLobbyTransport } from "./NativeLobbyTransport";
import {
  validateLobbyTransportConfig,
  type LobbyTransportConfig,
} from "./lobbyTransportConfig";
import { WebSocketClient } from "./WebSocketClient";

type ActiveLobbyTransport = Pick<
  WebSocketClient,
  | "init"
  | "join"
  | "joinOwned"
  | "leave"
  | "rpc"
  | "rpcIdem"
  | "onPush"
  | "subscribeConnection"
  | "getConnectionState"
>;

type LobbyJoinControl =
  | AbortSignal
  | { readonly timeoutMs?: number; readonly signal?: AbortSignal }
  | undefined;

/**
 * 应用唯一的 Lobby transport 选择点。默认和未声明均是旧 Colyseus；native 必须提供独立
 * endpoint。切换拒绝在已有连接时发生，故不会把旧 generation、pending RPC 或写请求迁给新通道。
 */
export class LobbyTransportHub {
  private config: LobbyTransportConfig = { kind: "colyseus" };
  private native: NativeLobbyTransport | null = null;

  configure(input: unknown): void {
    const config = validateLobbyTransportConfig(input);
    if (sameConfig(this.config, config)) return;
    if (this.current.getConnectionState().state !== "idle") {
      throw new Error("Lobby transport 切换前必须先释放当前连接");
    }
    this.config = config;
    if (config.kind === "native-websocket" && !this.native) {
      this.native = new NativeLobbyTransport();
    }
  }

  get current(): ActiveLobbyTransport {
    return this.config.kind === "native-websocket"
      ? (this.native ?? (this.native = new NativeLobbyTransport()))
      : WebSocketClient.inst;
  }

  get nativeCurrent(): NativeLobbyTransport {
    if(this.config.kind !== "native-websocket") throw new Error("Native kit RPC requires explicit native Lobby configuration");
    return this.native ?? (this.native = new NativeLobbyTransport());
  }

  get currentConfig(): LobbyTransportConfig {
    return this.config;
  }

  connect(
    server: Pick<WebPlatformAreaServer, "serverId" | "gameWsUrl">,
    token: string,
    control?: LobbyJoinControl,
  ): Promise<void> {
    const transport = this.current;
    if (this.config.kind === "native-websocket") {
      transport.init(this.config.endpoint);
      return (transport as NativeLobbyTransport).join(
        token,
        { sId: server.serverId },
        normalizeNativeControl(control),
      );
    }
    transport.init(server.gameWsUrl);
    return (transport as WebSocketClient).join(
      token,
      { sId: server.serverId },
      control,
    );
  }

  connectOwned(
    server: Pick<WebPlatformAreaServer, "serverId" | "gameWsUrl">,
    token: string,
    control?: LobbyJoinControl,
  ): { readonly ready: Promise<void>; leave(): Promise<void> } {
    const transport = this.current;
    if (this.config.kind === "native-websocket") {
      transport.init(this.config.endpoint);
      return (transport as NativeLobbyTransport).joinOwned(
        token,
        { sId: server.serverId },
        normalizeNativeControl(control),
      );
    }
    transport.init(server.gameWsUrl);
    return (transport as WebSocketClient).joinOwned(
      token,
      { sId: server.serverId },
      control,
    );
  }

  subscribeConnection(listener: LobbyConnectionListener): () => void {
    return this.current.subscribeConnection(listener);
  }

  getConnectionState(): LobbyConnectionSnapshot {
    return this.current.getConnectionState();
  }
}

function sameConfig(
  left: LobbyTransportConfig,
  right: LobbyTransportConfig,
): boolean {
  return (
    left.kind === right.kind &&
    (left.kind !== "native-websocket" ||
      (right.kind === "native-websocket" && left.endpoint === right.endpoint))
  );
}

export const lobbyTransportHub = new LobbyTransportHub();

function normalizeNativeControl(control: LobbyJoinControl): {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
} {
  if (!control) return {};
  if (isAbortSignal(control)) return { signal: control };
  return control;
}

function isAbortSignal(
  value: Exclude<LobbyJoinControl, undefined>,
): value is AbortSignal {
  return (
    typeof (value as AbortSignal).aborted === "boolean" &&
    typeof (value as AbortSignal).addEventListener === "function"
  );
}
