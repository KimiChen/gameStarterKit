/**
 * 网关大厅房（10·M5）：客户端 join 后，所有取数/邮件/工会请求走单一 `rpc` 消息通道
 * （Colyseus 的 send/onMessage 无请求配对，信封里的 id 做 correlation，03）。
 *
 * - onAuth：token 反查 uid（09·G1）+ 严格校验（HTTP 回源 WebPlatform 权威）。
 * - 每消息快路径复验 sess（**纯组缓存 hash 比对、零权威回源**；在线撤销靠踢，见 §2.3 封号 SOP）。
 * - 大包防护在 transport 层 maxPayload（09·G4，见 app.ts）。
 */
import { CloseCode, Room, type AuthContext, type Client } from "@colyseus/core";
import {
  LOBBY_MSG_PUSH, LOBBY_MSG_RPC, PROTOCOL_VERSION,
  ErrorCode as SharedErrorCode, isPlainRecord, validateLobbyPush, validateLobbyRoomJoinOptions,
  validateRpcEnvelope, validateRpcReply, WireValidationError,
  type IRpcEnvelope, type RpcErrCode,
  type ILobbyRoomJoinOptions,
} from "@game/shared";
import { groupAdmitsZone, normalizeSId } from "../core/infra/config";
import { zoneCtx } from "../core/infra/keys";
import { verifyAndCacheWebPlatformSession } from "../platform/webPlatformClient";
import { joinRefused, joinRefusedAuth, toErrCode } from "../core/errors";
import { loadFields } from "../core/userRecord";
import { ensureCharacterReady } from "../player/character";
import { dispatchRpc, type RpcCtx, type RpcReply } from "./dispatcher";
import { optionalStoredInt } from "../core/infra/numbers";
import {
  registerOnline, setOnlineGuild, startMailWakeLoop, unregisterOnline,
  isOnlineRegistrationCurrent,
  type OnlineRegistration, type PushSink,
} from "./push";
import { tokenHashOf, verifySession } from "../core/auth/session";
import { registerAllRoutes } from "./loader";
import { isAdmissionOpen, trackTask } from "../core/infra/lifecycle";

function safeErrorText(error: unknown): string {
  try {
    if (error === null || error === undefined) return "";
    if (error instanceof Error) {
      const message = error.message;
      return typeof message === "string" ? message : String(message);
    }
    return String(error);
  } catch {
    return "";
  }
}

function isWireValidationError(error: unknown): error is WireValidationError {
  try { return error instanceof WireValidationError; }
  catch { return false; }
}

type LobbyClient = Client<{
  messages: { [LOBBY_MSG_RPC]: RpcReply; [LOBBY_MSG_PUSH]: { type: string; data: unknown } };
  auth: { userId: string; token: string; sId: number };
}>;

/**
 * Admission dependencies are injectable so the slow ready/session boundary
 * can be exercised deterministically.  Production uses the module functions
 * below; no alternate runtime implementation is needed.
 */
export interface LobbyJoinDependencies {
  ensureCharacterReady: typeof ensureCharacterReady;
  verifySession: typeof verifySession;
  registerOnline: typeof registerOnline;
  unregisterOnline: typeof unregisterOnline;
  tokenHashOf: typeof tokenHashOf;
  loadFields: typeof loadFields;
  setOnlineGuild: typeof setOnlineGuild;
  isOnlineRegistrationCurrent?: typeof isOnlineRegistrationCurrent;
}

const defaultLobbyJoinDependencies: LobbyJoinDependencies = {
  ensureCharacterReady,
  verifySession,
  registerOnline,
  unregisterOnline,
  tokenHashOf,
  loadFields,
  setOnlineGuild,
  isOnlineRegistrationCurrent,
};

interface LobbyRegistrationState {
  readonly uid: string;
  readonly sessionId: string;
  readonly token: string;
  readonly sId: number;
  readonly registration: OnlineRegistration;
  readonly transport: { client: LobbyClient };
}

/** Keep Lobby transport recovery aligned with the existing GameRoom window. */
export const LOBBY_RECONNECT_GRACE_S = 10;

/**
 * 四个 SDK 可重试关闭码 + 无关闭码兜底。
 *
 * `code === undefined` 是 fail-open 的第五个分支：框架没给关闭码时无法判定这是不是
 * 一次可重试断开，而错判成最终离场会立刻注销 online registration、让 SDK 随后真实
 * 重连时拿不到 seat。代价有界（最多多占 `LOBBY_RECONNECT_GRACE_S` 秒 seat），因此
 * 这里选择开放宽限窗口而不是收紧。
 */
function isReconnectableDrop(code?: number): boolean {
  return code === undefined
    || code === CloseCode.GOING_AWAY
    || code === CloseCode.NO_STATUS_RECEIVED
    || code === CloseCode.ABNORMAL_CLOSURE
    || code === CloseCode.MAY_TRY_RECONNECT;
}

/** Validate the complete push envelope before it reaches the Colyseus transport. */
function sendLobbyPush(client: LobbyClient, type: string, data: unknown): void {
  let message: ReturnType<typeof validateLobbyPush>;
  try {
    message = validateLobbyPush({ type, data });
  } catch (error) {
    // Pushes are often emitted from detached wake/notification loops.  A bad
    // producer payload must be dropped at this boundary, not reject the loop
    // or expose a native Proxy/getter exception to the transport.
    try { console.warn(`[lobby] 丢弃非法 push：${safeErrorText(error)}`); } catch { /* logging is best-effort */ }
    return;
  }
  try { client.send(LOBBY_MSG_PUSH, message); } catch { /* connection may be closing */ }
}

const RPC_ID_MAX = 64;

/** Extract a correlation id without trusting hostile getters/proxies. */
function safeRpcId(input: unknown): string {
  try {
    if (!isPlainRecord(input)) return "invalid";
    const id = input.id;
    return typeof id === "string" && id.length >= 1 && id.length <= RPC_ID_MAX ? id : "invalid";
  } catch {
    return "invalid";
  }
}

function rpcErrorCode(error: unknown): RpcErrCode {
  // WireValidationError is not in the domain error map, but malformed input is
  // still a client-visible, stable RPC error rather than an INTERNAL outage.
  return isWireValidationError(error) ? "INVALID_PAYLOAD" : toErrCode(error);
}

function rpcErrorMessage(error: unknown, code: RpcErrCode): string {
  // Do not expose infrastructure/stack details. Dispatcher follows the same
  // policy; this outer boundary covers failures before dispatch can run.
  if (code === "INTERNAL") return "";
  const message = safeErrorText(error);
  return message.length > 2048 ? message.slice(0, 2048) : message;
}

/** Send a validated reply while treating a closing socket as a no-op. */
function sendLobbyRpcReply(client: LobbyClient, reply: unknown): void {
  let wire: RpcReply;
  try {
    wire = validateRpcReply(reply);
  } catch (error) {
    try {
      const code = rpcErrorCode(error);
      wire = validateRpcReply({
        id: safeRpcId(reply),
        ok: false,
        err: { code, msg: rpcErrorMessage(error, code) },
      });
    } catch {
      // A malformed error object/validator must not reject the detached
      // message task.  This literal is already a valid shared reply shape.
      wire = { id: "invalid", ok: false, err: { code: "INTERNAL", msg: "" } };
    }
  }
  try { client?.send?.(LOBBY_MSG_RPC, wire); } catch { /* connection may be closing */ }
}

function sendLobbyRpcError(client: LobbyClient, source: unknown, error: unknown): void {
  try {
    const code = rpcErrorCode(error);
    sendLobbyRpcReply(client, {
      id: safeRpcId(source),
      ok: false,
      err: { code, msg: rpcErrorMessage(error, code) },
    });
  } catch {
    // Error reporting is itself on an untrusted transport path.  Keep the
    // callback synchronous and observed even when a Proxy defeats formatting.
    try { client?.send?.(LOBBY_MSG_RPC, { id: "invalid", ok: false, err: { code: "INTERNAL", msg: "" } }); } catch { /* closing */ }
  }
}

export class LobbyRoom extends Room<{ client: LobbyClient }> {
  // 大厅是共享房：不因空转销毁，人数上限放宽（单房单节点是 Colyseus 模型；
  // 多节点分摊连接的形态待 M0 RedisDriver 拍板后由 matchmaker 分配）
  autoDispose = false;
  maxClients = 5000;

  /** The map key alone is not an ownership proof when a late join callback races a replacement. */
  private readonly onlineRegistrations = new WeakMap<LobbyClient, LobbyRegistrationState>();
  /** Published before allowReconnection awaits the replacement transport. */
  private readonly reconnectingRegistrations = new Map<string, LobbyRegistrationState>();

  constructor(private readonly joinDeps: LobbyJoinDependencies = defaultLobbyJoinDependencies) {
    super();
  }

  private isRegistrationCurrent(state: LobbyRegistrationState): boolean {
    if (this.onlineRegistrations.get(state.transport.client)?.registration !== state.registration) {
      return false;
    }
    if (this.joinDeps.isOnlineRegistrationCurrent === undefined) { return true; }
    try {
      return this.joinDeps.isOnlineRegistrationCurrent(state.uid, state.sessionId, state.registration);
    } catch {
      return false;
    }
  }

  private unregisterRegistration(state: LobbyRegistrationState): void {
    if (this.reconnectingRegistrations.get(state.sessionId) === state) {
      this.reconnectingRegistrations.delete(state.sessionId);
    }
    const client = state.transport.client;
    if (this.onlineRegistrations.get(client)?.registration !== state.registration) { return; }
    this.onlineRegistrations.delete(client);
    this.joinDeps.unregisterOnline(state.uid, state.sessionId, state.registration);
  }

  /** token 反查 uid + 严格校验（连接级）。⛔ 不接受客户端单独传 userId（09·G1）。 */
  static async onAuth(token: string, options: ILobbyRoomJoinOptions | undefined, _context: AuthContext) {
    let joinOptions: ILobbyRoomJoinOptions;
    try {
      // Colyseus forwards untrusted JSON here; validate the complete object before
      // any field-level checks so extra keys cannot silently alter admission semantics.
      joinOptions = validateLobbyRoomJoinOptions(options);
    } catch (error) {
      // A getter/Proxy failure is still malformed join input.  Normalize it
      // to the same bounded refusal instead of allowing a native TypeError to
      // escape the Colyseus admission hook.
      const path = isWireValidationError(error) ? error.path : "";
      if (path === "options.sId") {
        throw joinRefused(SharedErrorCode.WrongServer);
      }
      if (path === "options.v") {
        throw joinRefused(SharedErrorCode.ProtocolMismatch);
      }
      if (path === "options.token") {
        throw joinRefused(SharedErrorCode.TokenExpired, "auth");
      }
      throw joinRefused(SharedErrorCode.BadRequest);
    }
    // 协议版本硬闸（缺省按 1 兼容首版客户端）——语义同 GameRoom.onAuth，见 shared/protocol/rooms.ts
    if ((joinOptions.v ?? 1) !== PROTOCOL_VERSION) {
      throw joinRefused(SharedErrorCode.ProtocolMismatch); // ⚠ 业务码走 message（status 必须 200–599，见 joinRefused）
    }
    // options 来自网络：⛔ TS 的 number 标注不能挡 string/null/NaN。尤其 GROUP_ZONES 空 = 承载全部，
    // 若先调用 groupAdmitsZone 会把所有畸形值放行，并把它们带进 MySQL 强制转换与 zoneCtx 键前缀。
    const sId = normalizeSId(joinOptions.sId);
    if (sId === null) {
      throw joinRefused(SharedErrorCode.WrongServer);
    }
    // 进服区归属硬闸（docs/DUAL_MODE.md §4.3 / M11）：sId ∉ 本组 GROUP_ZONES 即拒（防串服）。
    // sId 缺省 / GROUP_ZONES 空（单形态）放行，向后兼容。
    // ⚠ 真区服组下仍要把原始 undefined 交给归属闸：缺 sId 必须拒，不能被规范化后的 0 绕过。
    if (!groupAdmitsZone(joinOptions.sId === undefined ? undefined : sId)) {
      throw joinRefused(SharedErrorCode.WrongServer);
    }
    // Colyseus 的标准 auth token 参数是连接凭证的唯一权威来源。
    // options.token 若由旧客户端携带，只能作为逐字相等的兼容字段，不能覆盖标准 token。
    const standardToken = typeof token === "string" ? token : "";
    if (standardToken.length < 1 || standardToken.length > 256
      || (joinOptions.token !== undefined && joinOptions.token !== standardToken)) {
      throw joinRefused(SharedErrorCode.TokenExpired, "auth");
    }
    try {
      // ⚠ 带上本次要进的区：token 只对签发它的那个区有效（M12e）
      const uid = await verifyAndCacheWebPlatformSession(standardToken, sId);
      return { userId: uid, token: standardToken, sId }; // sId 存进 auth，供 messages/onJoin 建区上下文（§3.5）
    } catch (e) {
      throw joinRefusedAuth(toErrCode(e)); // 统一出口（⛔ 禁在此 new ServerError，见 errors-http-status.test）
    }
  }

  async onCreate(): Promise<void> {
    // A room created after shutdown admission closes must fail before it can
    // start route registration or background consumers. There is no client
    // registration to clean up at this stage; those belong to onJoin below.
    if (!isAdmissionOpen()) {
      throw joinRefused(SharedErrorCode.CharCreateFailed);
    }
    await registerAllRoutes(); // 扫描 websocket/<域>/<接口>.ts 注册（异步就绪前房间不接客，无竞态窗口）
    if (!isAdmissionOpen()) { return; }
    startMailWakeLoop(); // 邮件唤醒流消费（本节点）
  }

  messages = {
    [LOBBY_MSG_RPC]: (client: LobbyClient, raw: unknown): void => {
      // Keep the transport callback synchronous and explicitly observe the
      // async chain. Colyseus emits message handlers without awaiting them.
      void this.handleRpcMessage(client, raw).catch((error: unknown) => {
        // The method itself is fail-closed, but retain a final guard for future
        // edits or hostile objects that throw outside its normal branches.
        sendLobbyRpcError(client, raw, error);
      });
    },
  };

  private async handleRpcMessage(client: LobbyClient, raw: unknown): Promise<void> {
    let msg: IRpcEnvelope;
    try {
      // Parse inside the observed promise so malformed envelopes get a legal
      // correlated error instead of being dropped by the transport validator.
      msg = validateRpcEnvelope(raw);
    } catch (error) {
      sendLobbyRpcError(client, raw, error);
      return;
    }

    try {
      const auth = client.auth;
      if (!auth) {
        sendLobbyRpcReply(client, {
          id: msg.id,
          ok: false,
          err: { code: "AUTH_REQUIRED", msg: "" },
        });
        return;
      }
      const ctx: RpcCtx = {
        uid: auth.userId,
        sessionId: client.sessionId,
        push: (type, data) => sendLobbyPush(client, type, data),
      };
      // 每消息快路径复验（纯组缓存 hash 比对）：顶号换发后旧 token 下一条即 401；
      // ⚠ 封号**不靠这里**（快路径零权威回源）——靠踢（§2.3 SOP：GM 逐节点 /admin/kick 确认）
      // token 对游戏服不透明；uid 来自 onAuth 的 WebPlatform verify 响应。
      // 快路径直接用已认证 uid 查组缓存，绝不从 token 文本反解身份、也不逐消息回源。
      await verifySession(auth.userId, auth.token, auth.sId);

      // 区上下文（§3.5 硬化）：整个 RPC handler —— 含 dispatcher 中间件的 kIdemUser、
      // handler 里 withUser 的 kLock/casHset、readUser 等 per-zone 键 —— 全在 auth.sId 区内跑。
      // ALS 自动透传进 dispatchRpc（⛔ 无需碰 dispatcher）。
      const reply = await zoneCtx.run({ sId: auth.sId }, () =>
        dispatchRpc(ctx, { id: msg.id, type: msg.type, payload: msg.payload }));
      sendLobbyRpcReply(client, reply);
    } catch (error) {
      // Covers verify, ALS, dispatcher, reply validation and any future await
      // added above. `sendLobbyRpcReply` itself swallows close-time send errors.
      sendLobbyRpcError(client, msg, error);
    }
  }

  async onJoin(client: LobbyClient): Promise<void> {
    if (!isAdmissionOpen()) {
      throw joinRefused(SharedErrorCode.CharCreateFailed);
    }
    const auth = client.auth;
    // onAuth normally installs this object, but keep the room hook fail-closed
    // if an adapter invokes onJoin directly or supplies a malformed client.
    if (!auth) { throw joinRefusedAuth("AUTH_REQUIRED"); }
    // Snapshot the admission identity.  Besides avoiding mutable/getter-backed
    // auth objects, this lets us re-check the same token after the potentially
    // slow character-ready flight below.
    const { userId: uid, token, sId } = auth;
    // Session IDs are the online-map slot key. Snapshot it alongside auth so
    // a late adapter mutation/getter cannot make cleanup target a different
    // slot from the one this join registered.
    const sessionId = client.sessionId;

    // Colyseus replaces the old client's `ref` after reconnection, but leaves
    // that old object in RECONNECTED state. Its send() path therefore drops
    // pushes. Keep the logical registration stable while allowing its physical
    // transport target to move to the new Client object in onReconnect.
    const transport = { client };
    const sink: PushSink = (type, data) => sendLobbyPush(transport.client, type, data);
    // Register before the potentially slow ready flight.  A replacement login
    // must be able to see and kick this connection; Colyseus does not expose
    // the seat to clients until onJoin resolves, so the ready gate still keeps
    // RPCs from observing a half-initialized character.
    const registration = this.joinDeps.registerOnline(uid, sessionId, {
      sink,
      sId, // ⚠ 顶号只踢同区（M12e）：⛔ 别把玩家在别区的在线角色一起踢了

      // Colyseus leave() is asynchronous. Keep synchronous failures visible to
      // kickUser (so its delivery ack remains honest), but observe a rejected
      // Promise because this callback is invoked from a detached kick path.
      kick: (closeCode) => {
        const result = transport.client.leave(closeCode);
        // The Colyseus type is `void`, while adapters may return a Promise;
        // Promise.resolve keeps both shapes covered without hiding a sync throw.
        void Promise.resolve(result).catch(() => {});
      },
      tokenHash: this.joinDeps.tokenHashOf(token),
    });
    const state: LobbyRegistrationState = { uid, sessionId, token, sId, registration, transport };
    this.onlineRegistrations.set(client, state);

    let registrationUnregistered = false;
    const unregisterRegistration = (): void => {
      // Keep the client map coherent without allowing an old callback to
      // delete a newer registration that happens to reuse the same seat key.
      const ownsLocal = this.onlineRegistrations.get(transport.client)?.registration === registration;
      if (ownsLocal) {
        this.onlineRegistrations.delete(transport.client);
      }
      // onLeave may already have removed this local state while an await was
      // pending. In that case its exact unregister call is the sole cleanup;
      // do not invoke the injected/production hook a second time.
      if (registrationUnregistered || !ownsLocal) { return; }
      registrationUnregistered = true;
      this.joinDeps.unregisterOnline(uid, sessionId, registration);
    };

    // Colyseus may deliver onLeave while the awaited ready/session boundary is
    // still in flight (for example when the transport closes). Once that
    // happens this callback no longer owns a seat and must not resolve as a
    // successful join after its registration has been removed/replaced.
    const assertRegistrationCurrent = (): void => {
      let current = this.onlineRegistrations.get(transport.client)?.registration === registration;
      if (current && this.joinDeps.isOnlineRegistrationCurrent !== undefined) {
        try {
          current = this.joinDeps.isOnlineRegistrationCurrent(uid, sessionId, registration);
        } catch {
          current = false;
        }
      }
      if (!current) {
        unregisterRegistration();
        throw joinRefused(SharedErrorCode.CharCreateFailed);
      }
    };

    // Colyseus waits for onJoin before exposing the seat. Keep character
    // initialization inside that boundary; any failure removes the exact slot
    // that this callback created.
    try {
      await this.joinDeps.ensureCharacterReady(uid, sId);
    } catch (error) {
      unregisterRegistration();
      console.error(`[lobby] 首角色未就绪 uid=${uid} sId=${sId}`, error);
      throw joinRefused(SharedErrorCode.CharCreateFailed);
    }
    assertRegistrationCurrent();

    // A newer login may have replaced this token while character creation was
    // in flight. The replacement kick normally closes this connection, while
    // this fence check covers a dropped/delayed kick event as well.
    try {
      await this.joinDeps.verifySession(uid, token, sId);
    } catch (error) {
      unregisterRegistration();
      throw joinRefusedAuth(toErrCode(error));
    }
    assertRegistrationCurrent();

    // Close the remaining check window between the first fence check and
    // onJoin completion. A replacement under the same map key is left
    // untouched by the expected-token guard.
    try {
      await this.joinDeps.verifySession(uid, token, sId);
    } catch (error) {
      unregisterRegistration();
      throw joinRefusedAuth(toErrCode(error));
    }
    assertRegistrationCurrent();
    // 建角（§2.6 / M12a）：玩家进本区 → 确保该区玩法档 + WebPlatform 角色登记存在，幂等自愈；
    // 再挂工会在线索引（loadFields 读 s{sId}_user 的 guildId，per-zone → zoneCtx 硬化）。
    // 全程 best-effort：失败只影响工会广播/首帧，不阻塞连接（重连/换会修复）。
    // 角色已 ready；这里只做轻量在线公会索引，失败不会破坏角色契约。
    if (!isAdmissionOpen()) {
      // The ready/session awaits may overlap the shutdown boundary. Do not
      // publish an apparently successful seat after admission has closed;
      // remove exactly this registration before refusing the join.
      unregisterRegistration();
      throw joinRefused(SharedErrorCode.CharCreateFailed);
    }
    void trackTask(
      `lobby:guild-load:${uid}:${sessionId}`,
      zoneCtx.run({ sId }, () => this.joinDeps.loadFields(uid, ["guildId"])),
    )
      .then((f) => {
        // A detached read may finish after this client leaves or after its
        // slot is replaced.  Never apply stale guild state to the newer
        // registration.
        if (this.onlineRegistrations.get(transport.client)?.registration !== registration) { return; }
        const globallyCurrent = this.joinDeps.isOnlineRegistrationCurrent === undefined
          || this.joinDeps.isOnlineRegistrationCurrent(uid, sessionId, registration);
        if (!globallyCurrent) { return; }
        const gid = optionalStoredInt(f.guildId, 0, "guildId", { min: 0 });
        this.joinDeps.setOnlineGuild(uid, gid > 0 ? gid : null, sId);
      })
      .catch((e) => console.error(`[lobby] 在线公会索引初始化失败 uid=${uid} sId=${sId}`, e));
  }

  async onDrop(client: LobbyClient, code?: number): Promise<void> {
    const state = this.onlineRegistrations.get(client);
    if (!state || !isAdmissionOpen() || !isReconnectableDrop(code)) { return; }

    const existing = this.reconnectingRegistrations.get(state.sessionId);
    if (existing !== undefined && existing !== state) {
      // A different generation already owns this handoff key. Do not overwrite
      // it; framework finalization will route this client through onLeave.
      return;
    }
    this.reconnectingRegistrations.set(state.sessionId, state);
    try {
      await this.allowReconnection(client, LOBBY_RECONNECT_GRACE_S);
      // onReconnect claims and removes the handoff. A successful await alone
      // is not authorization: the reconnect hook still revalidates the fence.
    } catch {
      if (this.reconnectingRegistrations.get(state.sessionId) === state) {
        this.reconnectingRegistrations.delete(state.sessionId);
      }
      // Colyseus invokes final onLeave after a dropped client's grace expires.
    }
  }

  async onReconnect(client: LobbyClient): Promise<void> {
    const state = this.reconnectingRegistrations.get(client.sessionId);
    if (!state) { throw joinRefusedAuth("AUTH_REQUIRED"); }
    if (this.reconnectingRegistrations.get(state.sessionId) === state) {
      this.reconnectingRegistrations.delete(state.sessionId);
    }

    const admissionOpen = isAdmissionOpen();
    if (!admissionOpen || !this.isRegistrationCurrent(state)) {
      this.unregisterRegistration(state);
      throw !admissionOpen
        ? joinRefused(SharedErrorCode.CharCreateFailed)
        : joinRefusedAuth("AUTH_REQUIRED");
    }

    const previousClient = state.transport.client;
    this.onlineRegistrations.delete(previousClient);
    state.transport.client = client;
    client.auth = { userId: state.uid, token: state.token, sId: state.sId };
    this.onlineRegistrations.set(client, state);

    try {
      await this.joinDeps.verifySession(state.uid, state.token, state.sId);
    } catch (error) {
      this.unregisterRegistration(state);
      throw joinRefusedAuth(toErrCode(error));
    }
    if (!isAdmissionOpen()) {
      this.unregisterRegistration(state);
      throw joinRefused(SharedErrorCode.CharCreateFailed);
    }
    if (!this.isRegistrationCurrent(state)) {
      this.unregisterRegistration(state);
      throw joinRefusedAuth("AUTH_REQUIRED");
    }
  }

  onLeave(client: LobbyClient): void {
    // 按 sessionId 注销：⛔ 不能按 uid 整槽删——同 uid 的其它连接必须保留可踢/可推
    // （否则 /admin/kick 回 kicked:false 假阴性，破坏 09·G7b 的 ack 语义）。
    const state = this.onlineRegistrations.get(client);
    if (!state) { return; }
    this.unregisterRegistration(state);
  }
}
