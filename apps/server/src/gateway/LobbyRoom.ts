/**
 * 网关大厅房（10·M5）：客户端 join 后，所有取数/排位/邮件请求走单一 `rpc` 消息通道
 * （Colyseus 的 send/onMessage 无请求配对，信封里的 id 做 correlation，03）。
 *
 * - onAuth：token 反查 uid（09·G1）+ 严格校验（回源 MySQL epoch/status）。
 * - 每消息快路径复验 sess（封号删 sess → 存量 token 立即失效）。
 * - 大包防护在 transport 层 maxPayload（09·G4，见 app.ts）。
 */
import { ErrorCode, Room, ServerError, validate, type AuthContext, type Client } from "@colyseus/core";
import {
  LOBBY_MSG_PUSH, LOBBY_MSG_RPC, PROTOCOL_VERSION, ErrorMessage,
  ErrorCode as SharedErrorCode, type IRoomJoinOptions,
} from "@game/shared";
import { verifyBearer } from "../auth/session";
import { toErrCode } from "../core/errors";
import { dispatchRpc, rpcEnvelopeSchema, type RpcCtx, type RpcReply } from "./dispatcher";
import { registerOnline, startMailWakeLoop, unregisterOnline, type PushSink } from "./push";
import { registerAllRoutes } from "./handlers/loader";

type LobbyClient = Client<{
  messages: { [LOBBY_MSG_RPC]: RpcReply; [LOBBY_MSG_PUSH]: { type: string; data: unknown } };
  auth: { userId: string; token: string };
}>;

export class LobbyRoom extends Room<{ client: LobbyClient }> {
  // 大厅是共享房：不因空转销毁，人数上限放宽（单房单节点是 Colyseus 模型；
  // 多节点分摊连接的形态待 M0 RedisDriver 拍板后由 matchmaker 分配）
  autoDispose = false;
  maxClients = 5000;

  /** token 反查 uid + 严格校验（连接级）。⛔ 不接受客户端单独传 userId（09·G1）。 */
  static async onAuth(token: string, options: IRoomJoinOptions | undefined, _context: AuthContext) {
    // 协议版本硬闸（缺省按 1 兼容首版客户端）——语义同 GameRoom.onAuth，见 shared/protocol/rooms.ts
    if ((options?.v ?? 1) !== PROTOCOL_VERSION) {
      throw new ServerError(SharedErrorCode.ProtocolMismatch, ErrorMessage[SharedErrorCode.ProtocolMismatch]);
    }
    try {
      const uid = await verifyBearer(token, true);
      return { userId: uid, token };
    } catch (e) {
      throw new ServerError(ErrorCode.AUTH_FAILED, toErrCode(e));
    }
  }

  async onCreate(): Promise<void> {
    await registerAllRoutes(); // 扫描 handlers/<域>/<接口>.ts 注册（异步就绪前房间不接客，无竞态窗口）
    startMailWakeLoop(); // 邮件唤醒流消费（本节点）
  }

  messages = {
    [LOBBY_MSG_RPC]: validate(rpcEnvelopeSchema, async (client: LobbyClient, msg) => {
      const auth = client.auth;
      if (!auth) { return; } // onAuth 必然已赋值；防御分支只为类型收窄
      const ctx: RpcCtx = {
        uid: auth.userId,
        sessionId: client.sessionId,
        push: (type, data) => client.send(LOBBY_MSG_PUSH, { type, data }),
      };
      // 每消息快路径复验：封号/踢人删 sess 后，在途连接的下一条 RPC 立即 401
      try {
        await verifyBearer(auth.token, false);
      } catch (e) {
        client.send(LOBBY_MSG_RPC, { id: msg.id, ok: false, err: { code: toErrCode(e), msg: "" } } satisfies RpcReply);
        return;
      }
      const reply = await dispatchRpc(ctx, { id: msg.id, type: msg.type, payload: msg.payload });
      client.send(LOBBY_MSG_RPC, reply);
    }),
  };

  // 每连接的推送 sink（sessionId→sink）：onLeave 必须按 sink 条件注销——客户端断线重连时,
  // 旧连接的 onLeave 可能晚于新连接的 onJoin 到达,无条件删 uid 槽位会误删新连接的注册
  private sinks = new Map<string, PushSink>();

  onJoin(client: LobbyClient): void {
    if (!client.auth) { return; }
    const sink: PushSink = (type, data) => client.send(LOBBY_MSG_PUSH, { type, data });
    this.sinks.set(client.sessionId, sink);
    registerOnline(client.auth.userId, sink);
  }

  onLeave(client: LobbyClient): void {
    const sink = this.sinks.get(client.sessionId);
    this.sinks.delete(client.sessionId);
    if (client.auth) { unregisterOnline(client.auth.userId, sink); }
  }
}
