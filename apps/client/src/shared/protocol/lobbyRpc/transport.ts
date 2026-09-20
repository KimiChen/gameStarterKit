import {
  assertExactKeys,
  boundedString,
  finiteInteger,
  guardWire,
  isPlainRecord,
  type PlainRecord,
  WireValidationError,
} from "../http";
import {
  validateRpcEnvelope,
  validateRpcReply,
  type IRpcEnvelope,
  type IRpcReply,
} from "./envelope";
import {
  isRpcErrCode,
  validateLobbyPush,
  type LobbyPushEnvelope,
  type RpcErrCode,
} from "./registry.generated";

/**
 * 原生 Lobby WebSocket 的传输层版本。它与每条 RPC 的 contractVersion 分离：前者只描述
 * 连接外壳，后者描述业务 payload。版本不同时必须明确拒绝，禁止猜测旧帧含义。
 */
export const LOBBY_TRANSPORT_VERSION = 1;
export const LOBBY_TRANSPORT_MAX_MESSAGE_BYTES = 64 * 1024;
export const LOBBY_TRANSPORT_AUTH_TIMEOUT_MS = 10_000;
export const LOBBY_TRANSPORT_RPC_TIMEOUT_MS = 15_000;
export const LOBBY_TRANSPORT_HANDLER_TIMEOUT_MS = 10_000;

/** 连接状态。auth.ok 发送后即 ready；重连始终再次走 auth，不能复用旧连接身份。 */
export type LobbyTransportConnectionState =
  "connecting" | "awaiting-auth" | "ready" | "closed";

/** 传输层错误与 Lobby 业务错误分开，避免把未协商版本伪装成业务失败。 */
export const LOBBY_TRANSPORT_ERROR_CODES = [
  "UNSUPPORTED_VERSION",
  "INVALID_FRAME",
  "AUTH_TIMEOUT",
  "AUTH_ALREADY_COMPLETED",
  "MESSAGE_TOO_LARGE",
  "BINARY_FRAME_UNSUPPORTED",
] as const;

export type LobbyTransportErrorCode =
  (typeof LOBBY_TRANSPORT_ERROR_CODES)[number];

export interface ILobbyTransportAuthFrame {
  v: typeof LOBBY_TRANSPORT_VERSION;
  kind: "auth";
  /** 凭据只存在于首个控制帧；不得置入 URL、日志或业务 payload。 */
  token: string;
  sId: number;
  /** 仅表示客户端正在恢复连接；服务端仍须完整复验 token、uid 与区服。 */
  reconnect?: true;
}

export interface ILobbyTransportAuthOkFrame {
  v: typeof LOBBY_TRANSPORT_VERSION;
  kind: "auth.ok";
  uid: string;
  sId: number;
}

export interface ILobbyTransportAuthErrorFrame {
  v: typeof LOBBY_TRANSPORT_VERSION;
  kind: "auth.error";
  err: { code: RpcErrCode; msg: string };
}

export interface ILobbyTransportRpcFrame {
  v: typeof LOBBY_TRANSPORT_VERSION;
  kind: "rpc";
  rpc: IRpcEnvelope;
}

export interface ILobbyTransportReplyFrame {
  v: typeof LOBBY_TRANSPORT_VERSION;
  kind: "reply";
  reply: IRpcReply;
}

export interface ILobbyTransportPushFrame {
  v: typeof LOBBY_TRANSPORT_VERSION;
  kind: "push";
  push: LobbyPushEnvelope;
}

export interface ILobbyTransportPingFrame {
  v: typeof LOBBY_TRANSPORT_VERSION;
  kind: "ping";
  nonce: string;
}

export interface ILobbyTransportPongFrame {
  v: typeof LOBBY_TRANSPORT_VERSION;
  kind: "pong";
  nonce: string;
}

export interface ILobbyTransportControlErrorFrame {
  v: typeof LOBBY_TRANSPORT_VERSION;
  kind: "control.error";
  err: { code: LobbyTransportErrorCode; msg: string };
}

/** 客户端可以在收到该帧后读取同一 close code；服务端随后关闭 socket。 */
export interface ILobbyTransportCloseFrame {
  v: typeof LOBBY_TRANSPORT_VERSION;
  kind: "close";
  code: number;
  reason: string;
}

export type LobbyTransportClientFrame =
  | ILobbyTransportAuthFrame
  | ILobbyTransportRpcFrame
  | ILobbyTransportPingFrame
  | ILobbyTransportPongFrame;

export type LobbyTransportServerFrame =
  | ILobbyTransportAuthOkFrame
  | ILobbyTransportAuthErrorFrame
  | ILobbyTransportReplyFrame
  | ILobbyTransportPushFrame
  | ILobbyTransportPingFrame
  | ILobbyTransportPongFrame
  | ILobbyTransportControlErrorFrame
  | ILobbyTransportCloseFrame;

export type LobbyTransportFrame =
  LobbyTransportClientFrame | LobbyTransportServerFrame;

function record(input: unknown, path: string): PlainRecord {
  if (!isPlainRecord(input))
    throw new WireValidationError("TRANSPORT_OBJECT", path);
  return input;
}

function version(value: PlainRecord): typeof LOBBY_TRANSPORT_VERSION {
  if (value.v !== LOBBY_TRANSPORT_VERSION) {
    throw new WireValidationError("TRANSPORT_VERSION", "frame.v");
  }
  return LOBBY_TRANSPORT_VERSION;
}

function kind(value: PlainRecord): string {
  return boundedString(value.kind, "frame.kind", 1, 32);
}

function validateAuth(value: PlainRecord): ILobbyTransportAuthFrame {
  assertExactKeys(value, ["v", "kind", "token", "sId"], ["reconnect"], "frame");
  const reconnect = value.reconnect;
  if (reconnect !== undefined && reconnect !== true)
    throw new WireValidationError("TRANSPORT_RECONNECT", "frame.reconnect");
  const out: ILobbyTransportAuthFrame = {
    v: version(value),
    kind: "auth",
    token: boundedString(value.token, "frame.token", 1, 8192),
    sId: finiteInteger(value.sId, "frame.sId", 1, 65535),
  };
  if (reconnect === true) out.reconnect = true;
  return out;
}

function validateAuthOk(value: PlainRecord): ILobbyTransportAuthOkFrame {
  assertExactKeys(value, ["v", "kind", "uid", "sId"], [], "frame");
  return {
    v: version(value),
    kind: "auth.ok",
    uid: boundedString(value.uid, "frame.uid", 1, 128),
    sId: finiteInteger(value.sId, "frame.sId", 1, 65535),
  };
}

function validateBusinessError(
  input: unknown,
  path: string,
): { code: RpcErrCode; msg: string } {
  const value = record(input, path);
  assertExactKeys(value, ["code", "msg"], [], path);
  if (!isRpcErrCode(value.code))
    throw new WireValidationError("RPC_ERR_CODE", `${path}.code`);
  return {
    code: value.code,
    msg: boundedString(value.msg, `${path}.msg`, 0, 2048),
  };
}

function validateAuthError(value: PlainRecord): ILobbyTransportAuthErrorFrame {
  assertExactKeys(value, ["v", "kind", "err"], [], "frame");
  return {
    v: version(value),
    kind: "auth.error",
    err: validateBusinessError(value.err, "frame.err"),
  };
}

function validateRpc(value: PlainRecord): ILobbyTransportRpcFrame {
  assertExactKeys(value, ["v", "kind", "rpc"], [], "frame");
  return {
    v: version(value),
    kind: "rpc",
    rpc: validateRpcEnvelope(value.rpc),
  };
}

function validateReply(value: PlainRecord): ILobbyTransportReplyFrame {
  assertExactKeys(value, ["v", "kind", "reply"], [], "frame");
  return {
    v: version(value),
    kind: "reply",
    reply: validateRpcReply(value.reply),
  };
}

function validatePush(value: PlainRecord): ILobbyTransportPushFrame {
  assertExactKeys(value, ["v", "kind", "push"], [], "frame");
  return {
    v: version(value),
    kind: "push",
    push: validateLobbyPush(value.push),
  };
}

function validateHeartbeat(
  value: PlainRecord,
  heartbeatKind: "ping" | "pong",
): ILobbyTransportPingFrame | ILobbyTransportPongFrame {
  assertExactKeys(value, ["v", "kind", "nonce"], [], "frame");
  const frame = {
    v: version(value),
    kind: heartbeatKind,
    nonce: boundedString(value.nonce, "frame.nonce", 1, 64),
  } as const;
  return frame;
}

function validateControlError(
  value: PlainRecord,
): ILobbyTransportControlErrorFrame {
  assertExactKeys(value, ["v", "kind", "err"], [], "frame");
  const err = record(value.err, "frame.err");
  assertExactKeys(err, ["code", "msg"], [], "frame.err");
  if (
    !(LOBBY_TRANSPORT_ERROR_CODES as readonly string[]).includes(
      err.code as string,
    )
  ) {
    throw new WireValidationError("TRANSPORT_ERROR_CODE", "frame.err.code");
  }
  return {
    v: version(value),
    kind: "control.error",
    err: {
      code: err.code as LobbyTransportErrorCode,
      msg: boundedString(err.msg, "frame.err.msg", 0, 2048),
    },
  };
}

function validateClose(value: PlainRecord): ILobbyTransportCloseFrame {
  assertExactKeys(value, ["v", "kind", "code", "reason"], [], "frame");
  return {
    v: version(value),
    kind: "close",
    code: finiteInteger(value.code, "frame.code", 1000, 4999),
    reason: boundedString(value.reason, "frame.reason", 0, 123),
  };
}

/** 严格解析任一方向的外层帧；未知键或未知 kind 均 fail-closed。 */
export function validateLobbyTransportFrame(
  input: unknown,
): LobbyTransportFrame {
  return guardWire("transport", () => {
    const value = record(input, "frame");
    switch (kind(value)) {
      case "auth":
        return validateAuth(value);
      case "auth.ok":
        return validateAuthOk(value);
      case "auth.error":
        return validateAuthError(value);
      case "rpc":
        return validateRpc(value);
      case "reply":
        return validateReply(value);
      case "push":
        return validatePush(value);
      case "ping":
        return validateHeartbeat(value, "ping");
      case "pong":
        return validateHeartbeat(value, "pong");
      case "control.error":
        return validateControlError(value);
      case "close":
        return validateClose(value);
      default:
        throw new WireValidationError("TRANSPORT_KIND", "frame.kind");
    }
  });
}

/** 客户端入站/出站方向检查。auth.ok、reply、push 等绝不能由客户端伪造。 */
export function validateLobbyTransportClientFrame(
  input: unknown,
): LobbyTransportClientFrame {
  const frame = validateLobbyTransportFrame(input);
  if (
    frame.kind === "auth" ||
    frame.kind === "rpc" ||
    frame.kind === "ping" ||
    frame.kind === "pong"
  )
    return frame;
  throw new WireValidationError("TRANSPORT_DIRECTION", "frame.kind");
}

/** 服务端入站/出站方向检查。 */
export function validateLobbyTransportServerFrame(
  input: unknown,
): LobbyTransportServerFrame {
  const frame = validateLobbyTransportFrame(input);
  if (frame.kind !== "auth" && frame.kind !== "rpc") return frame;
  throw new WireValidationError("TRANSPORT_DIRECTION", "frame.kind");
}

/** ES2017 可用的 UTF-8 字节计数；shared 不依赖 Buffer、TextEncoder 或 DOM。 */
export function lobbyTransportUtf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** JSON 文本的大小检查与解析，供原生 WebSocket adapter 共用。 */
export function parseLobbyTransportText(text: string): LobbyTransportFrame {
  if (lobbyTransportUtf8ByteLength(text) > LOBBY_TRANSPORT_MAX_MESSAGE_BYTES) {
    throw new WireValidationError("TRANSPORT_TOO_LARGE", "frame");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WireValidationError("TRANSPORT_JSON", "frame");
  }
  return validateLobbyTransportFrame(parsed);
}

export function serializeLobbyTransportFrame(
  frame: LobbyTransportFrame,
): string {
  const text = JSON.stringify(frame);
  if (lobbyTransportUtf8ByteLength(text) > LOBBY_TRANSPORT_MAX_MESSAGE_BYTES) {
    throw new WireValidationError("TRANSPORT_TOO_LARGE", "frame");
  }
  return text;
}
