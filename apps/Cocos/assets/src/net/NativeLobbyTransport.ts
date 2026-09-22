import type {
  AuthInvalidReason,
  LobbyConnectionEvent,
  LobbyConnectionListener,
  LobbyConnectionSnapshot,
} from "./connectionEvents";
import {
  ForceLogoutReason,
  forceLogoutReasonOf,
  LOBBY_TRANSPORT_RPC_TIMEOUT_MS,
  LOBBY_TRANSPORT_VERSION,
  LobbyPush,
  parseLobbyTransportText,
  serializeLobbyTransportFrame,
  validateLobbyRpcRequest,
  validateLobbyRpcResponse,
  validateLobbyTransportServerFrame,
  validateOrigin,
  type LobbyPushMap,
  type LobbyRpcIdemType,
  type LobbyRpcType,
  type RpcReq,
  type RpcRes,
  type ForceLogoutReasonType,
} from "../shared/index";
import { RpcError } from "./LobbyRpcError";
import { lobbyDataSync } from "./LobbyDataSync";

const IDEM_RETRY_MAX = 3;
const IDEM_RETRY_DELAY_MS = 300;

/** 不依赖 DOM 声明，兼容 Cocos 的原生 WebSocket 实现和无头测试桩。 */
export interface NativeWebSocket {
  readonly readyState: number;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: ((event: { readonly code?: number }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type NativeWebSocketFactory = (endpoint: string) => NativeWebSocket;

export interface NativeLobbyJoinControl {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly reconnect?: true;
}

export interface NativeLobbyOwnership {
  readonly ready: Promise<void>;
  leave(): Promise<void>;
}

interface NativeSlot {
  readonly generation: number;
  readonly endpoint: string;
  readonly token: string;
  readonly sId: number;
  readonly socket: NativeWebSocket;
  readonly ready: Promise<void>;
  active: boolean;
}

interface Pending {
  readonly type: LobbyRpcType;
  readonly slot: NativeSlot;
  readonly resolve: (data: unknown) => void;
  readonly reject: (error: RpcError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

const AUTH_INVALID_CODES: readonly AuthInvalidReason[] = [
  "AUTH_REQUIRED",
  "AUTH_EPOCH_STALE",
  "ACCOUNT_BANNED",
];

/**
 * 独立的原生 WebSocket Lobby transport。它不触碰现有 Colyseus WebSocketClient，因而默认
 * 旧配置及 GameRoom 保持原行为；调用方必须通过 explicit `native-websocket` 配置主动选用。
 */
export class NativeLobbyTransport {
  private endpoint = "";
  private slot: NativeSlot | null = null;
  private generation = 0;
  private requestSeq = 0;
  private eventSeq = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly pushes = new Map<string, Set<(data: unknown) => unknown>>();
  private readonly listeners = new Set<LobbyConnectionListener>();
  private snapshot: LobbyConnectionSnapshot = {
    state: "idle",
    connGeneration: 0,
    lastSeq: 0,
  };

  constructor(
    private readonly createSocket: NativeWebSocketFactory = defaultSocketFactory,
  ) {}

  init(endpoint: string): void {
    this.endpoint = validateOrigin(endpoint, ["ws", "wss"], "endpoint");
  }

  get connected(): boolean {
    return this.slot?.active === true && this.snapshot.state === "ready";
  }

  subscribeConnection(listener: LobbyConnectionListener): () => void {
    this.listeners.add(listener);
    if (this.snapshot.state !== "idle") {
      const kind =
        this.snapshot.state === "joining"
          ? "joining"
          : this.snapshot.state === "dropped"
            ? "dropped"
            : "ready";
      listener({
        kind,
        connGeneration: this.snapshot.connGeneration,
        seq: this.snapshot.lastSeq,
      });
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  getConnectionState(): LobbyConnectionSnapshot {
    return this.snapshot;
  }

  joinOwned(
    token: string,
    options: { readonly sId: number },
    control: NativeLobbyJoinControl = {},
  ): NativeLobbyOwnership {
    if (!this.endpoint)
      throw new Error(
        "[NativeLobbyTransport] 未初始化，请先调用 init(endpoint)",
      );
    if (this.slot)
      throw new Error("[NativeLobbyTransport] 已有大厅连接，请先 leave()");
    // A new owned session may belong to another uid or zone. Never leak the
    // previous session's module snapshots into the new session.
    lobbyDataSync.reset();
    const endpoint = this.endpoint;
    const generation = ++this.generation;
    this.publish({
      kind: "joining",
      connGeneration: generation,
      seq: ++this.eventSeq,
    });
    const socket = this.createSocket(endpoint);
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const slot: NativeSlot = {
      generation,
      endpoint,
      token,
      sId: options.sId,
      socket,
      ready,
      active: true,
    };
    this.slot = slot;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | null = null;
    const signal = control.signal;
    /**
     * join 控制信号只约束**这一次 join 尝试**，不约束连接的寿命。
     *
     * ⚠ 真实 Creator 预览实测：登录页在进入大厅后会关闭自己的生命周期 context
     * （`loginFlow` 的 `h.close()`），那个 abort 若还挂着监听，就会把**刚刚建立**的大厅连接
     * 一起关掉——现象是「登录成功、首屏正常显示，但之后任何写请求都 CONN_LOST：
     * 大厅连接当前不可用」，看上去像服务端拒绝，实际是客户端自己把连接拆了。
     * 旧通道 `WebSocketClient.joinOwned` 用 `ready.then(dispose, dispose)` 在 join 落定时解绑，
     * 本实现对齐同一契约（并顺带不留悬挂的监听器）。
     */
    const detach = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      const listener = abortListener;
      abortListener = null;
      if (listener && signal) signal.removeEventListener("abort", listener);
    };
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      detach();
      if (error) rejectReady(error);
      else resolveReady();
    };
    const cancel = (reason: Error) => {
      // join 已落定后再到的 abort / 超时不得影响连接（上面的 detach 是第一道，这里兜住竞态）。
      if (settled || !slot.active) return;
      settle(reason);
      this.closeSlot(slot, "voluntary");
    };
    if (signal?.aborted) cancel(new Error("[NativeLobbyTransport] join 已取消"));
    else if (signal) {
      abortListener = () => cancel(new Error("[NativeLobbyTransport] join 已取消"));
      signal.addEventListener("abort", abortListener, { once: true });
    }
    timer = setTimeout(() => cancel(new Error("[NativeLobbyTransport] join 超时")), control.timeoutMs ?? 15_000);
    socket.onopen = () => {
      if (!slot.active || this.slot !== slot) return;
      try {
        socket.send(
          serializeLobbyTransportFrame({
            v: LOBBY_TRANSPORT_VERSION,
            kind: "auth",
            token,
            sId: options.sId,
            ...(control.reconnect === true ? { reconnect: true as const } : {}),
          }),
        );
      } catch {
        cancel(new Error("[NativeLobbyTransport] 认证帧发送失败"));
      }
    };
    socket.onerror = () => cancel(new Error("[NativeLobbyTransport] 连接失败"));
    socket.onmessage = (event) => this.handleMessage(slot, event.data, settle);
    socket.onclose = (event) => {
      if (!slot.active) return;
      const forced = forceLogoutReasonOf(event.code ?? 0);
      this.closeSlot(
        slot,
        forced ? "auth-invalid" : "final-loss",
        forced ? forceReason(forced) : undefined,
      );
      settle(new Error("[NativeLobbyTransport] 连接已关闭"));
    };
    return {
      ready,
      leave: async () => {
        this.closeSlot(slot, "voluntary");
      },
    };
  }

  async join(
    token: string,
    options: { readonly sId: number },
    control?: NativeLobbyJoinControl,
  ): Promise<void> {
    await this.joinOwned(token, options, control).ready;
  }

  async leave(): Promise<void> {
    if (this.slot) this.closeSlot(this.slot, "voluntary");
    lobbyDataSync.reset();
  }

  rpc<T extends LobbyRpcType>(type: T, payload: RpcReq<T>): Promise<RpcRes<T>> {
    const slot = this.slot;
    if (!slot || !slot.active || this.snapshot.state !== "ready") {
      return Promise.reject(new RpcError("CONN_LOST", "大厅连接当前不可用"));
    }
    let validated: RpcReq<T>;
    try {
      validated = validateLobbyRpcRequest(type, payload);
    } catch {
      return Promise.reject(
        new RpcError("INVALID_PAYLOAD", `request ${String(type)}`),
      );
    }
    const id = `n${++this.requestSeq}`;
    return new Promise<RpcRes<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError("TIMEOUT", String(type)));
      }, LOBBY_TRANSPORT_RPC_TIMEOUT_MS);
      this.pending.set(id, {
        type,
        slot,
        resolve: resolve as (data: unknown) => void,
        reject,
        timer,
      });
      try {
        slot.socket.send(
          serializeLobbyTransportFrame({
            v: LOBBY_TRANSPORT_VERSION,
            kind: "rpc",
            rpc: { id, type, payload: validated },
          }),
        );
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new RpcError("CONN_LOST", "请求发送失败"));
      }
    });
  }

  async rpcIdem<T extends LobbyRpcIdemType>(
    type: T,
    payload: Omit<RpcReq<T>, "clientReqId">,
    clientReqId: string = NativeLobbyTransport.newClientReqId(),
  ): Promise<RpcRes<T>> {
    const request = { ...payload, clientReqId } as RpcReq<T>;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.rpc(type, request);
      } catch (error) {
        const retry =
          error instanceof RpcError &&
          (error.code === "BUSY" || error.code === "STALE_FENCE");
        if (!retry || attempt >= IDEM_RETRY_MAX) {
          if (error instanceof RpcError) error.clientReqId = clientReqId;
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, IDEM_RETRY_DELAY_MS),
        );
      }
    }
  }

  onPush<K extends keyof LobbyPushMap>(
    type: K,
    callback: (data: LobbyPushMap[K]) => unknown,
  ): () => void {
    let callbacks = this.pushes.get(type);
    if (!callbacks) {
      callbacks = new Set();
      this.pushes.set(type, callbacks);
    }
    const raw = callback as (data: unknown) => unknown;
    callbacks.add(raw);
    return () => {
      callbacks?.delete(raw);
    };
  }

  static newClientReqId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private handleMessage(
    slot: NativeSlot,
    raw: unknown,
    settle: (error?: Error) => void,
  ): void {
    if (!slot.active || this.slot !== slot || typeof raw !== "string") {
      this.closeSlot(slot, "final-loss");
      return;
    }
    let frame: ReturnType<typeof validateLobbyTransportServerFrame>;
    try {
      frame = validateLobbyTransportServerFrame(parseLobbyTransportText(raw));
    } catch {
      this.closeSlot(slot, "final-loss");
      settle(new Error("[NativeLobbyTransport] 收到非法服务端帧"));
      return;
    }
    if (frame.kind === "auth.ok") {
      if (frame.sId !== slot.sId || frame.uid.length === 0) {
        this.closeSlot(slot, "final-loss");
        settle(new Error("[NativeLobbyTransport] 认证身份不一致"));
        return;
      }
      this.publish({
        kind: "ready",
        connGeneration: slot.generation,
        seq: ++this.eventSeq,
      });
      settle();
      return;
    }
    if (frame.kind === "auth.error") {
      const reason = AUTH_INVALID_CODES.includes(
        frame.err.code as AuthInvalidReason,
      )
        ? (frame.err.code as AuthInvalidReason)
        : undefined;
      this.closeSlot(slot, reason ? "auth-invalid" : "final-loss", reason);
      settle(new RpcError(frame.err.code, frame.err.msg));
      return;
    }
    if (frame.kind === "sync") {
      lobbyDataSync.apply(frame.sync);
      return;
    }
    if (frame.kind === "reply") {
      const pending = this.pending.get(frame.reply.id);
      if (!pending || pending.slot !== slot) return;
      this.pending.delete(frame.reply.id);
      clearTimeout(pending.timer);
      if (!frame.reply.ok) {
        if (
          AUTH_INVALID_CODES.includes(frame.reply.err.code as AuthInvalidReason)
        ) {
          this.publishClosed(
            slot,
            "auth-invalid",
            frame.reply.err.code as AuthInvalidReason,
          );
        }
        pending.reject(new RpcError(frame.reply.err.code, frame.reply.err.msg));
        return;
      }
      try {
        if (frame.reply.sync) lobbyDataSync.apply(frame.reply.sync);
        pending.resolve(
          validateLobbyRpcResponse(pending.type, frame.reply.data),
        );
      } catch {
        pending.reject(
          new RpcError("INVALID_PAYLOAD", `response ${pending.type}`),
        );
      }
      return;
    }
    if (frame.kind === "push") {
      if (frame.push.type === LobbyPush.ForceLogout)
        this.publishClosed(
          slot,
          "auth-invalid",
          forceReason(frame.push.data.reason),
        );
      for (const callback of this.pushes.get(frame.push.type) ?? []) {
        try {
          void callback(frame.push.data);
        } catch {
          /* callback does not break transport */
        }
      }
      return;
    }
    if (frame.kind === "control.error" || frame.kind === "close") {
      this.closeSlot(slot, "final-loss");
      settle(new Error("[NativeLobbyTransport] 服务端关闭连接"));
      return;
    }
    if (frame.kind === "ping") {
      try {
        slot.socket.send(
          serializeLobbyTransportFrame({
            v: LOBBY_TRANSPORT_VERSION,
            kind: "pong",
            nonce: frame.nonce,
          }),
        );
      } catch {
        this.closeSlot(slot, "final-loss");
      }
    }
  }

  private closeSlot(
    slot: NativeSlot,
    reason: "voluntary" | "final-loss" | "auth-invalid",
    authReason?: AuthInvalidReason,
  ): void {
    if (!slot.active) return;
    slot.active = false;
    if (this.slot === slot) this.slot = null;
    for (const [id, pending] of this.pending) {
      if (pending.slot !== slot) continue;
      clearTimeout(pending.timer);
      pending.reject(new RpcError("CONN_LOST"));
      this.pending.delete(id);
    }
    try {
      slot.socket.close(1000, "Lobby closed");
    } catch {
      /* close is best effort */
    }
    this.publishClosed(slot, reason, authReason);
  }

  private publishClosed(
    slot: NativeSlot,
    reason: "voluntary" | "final-loss" | "auth-invalid",
    authReason?: AuthInvalidReason,
  ): void {
    if (
      this.snapshot.connGeneration !== slot.generation ||
      this.snapshot.state === "idle"
    )
      return;
    const event =
      reason === "auth-invalid" && authReason
        ? {
            kind: "closed" as const,
            connGeneration: slot.generation,
            seq: ++this.eventSeq,
            reason,
            authReason,
          }
        : {
            kind: "closed" as const,
            connGeneration: slot.generation,
            seq: ++this.eventSeq,
            reason:
              reason === "auth-invalid" ? ("final-loss" as const) : reason,
          };
    this.publish(event);
  }

  private publish(event: LobbyConnectionEvent): void {
    if (event.kind === "closed")
      this.snapshot = {
        state: "idle",
        connGeneration: event.connGeneration,
        lastSeq: event.seq,
      };
    else
      this.snapshot = {
        state:
          event.kind === "joining"
            ? "joining"
            : event.kind === "ready"
              ? "ready"
              : "dropped",
        connGeneration: event.connGeneration,
        lastSeq: event.seq,
      };
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        /* listener isolation */
      }
    }
  }
}

function forceReason(reason: ForceLogoutReasonType): AuthInvalidReason {
  switch (reason) {
    case ForceLogoutReason.Banned:
      return "FORCE_BANNED";
    case ForceLogoutReason.Replaced:
      return "FORCE_REPLACED";
    case ForceLogoutReason.Revoked:
      return "FORCE_REVOKED";
  }
}

function defaultSocketFactory(endpoint: string): NativeWebSocket {
  const Constructor = (
    globalThis as { WebSocket?: new (url: string) => NativeWebSocket }
  ).WebSocket;
  if (!Constructor)
    throw new Error("[NativeLobbyTransport] 当前运行环境不支持 WebSocket");
  return new Constructor(endpoint);
}
