/**
 * 网关大厅房（10·M5）：客户端 join 后，所有取数/邮件/工会请求走单一 `rpc` 消息通道
 * （Colyseus 的 send/onMessage 无请求配对，信封里的 id 做 correlation，03）。
 *
 * - onAuth：token 反查 uid（09·G1）+ 严格校验（回源 MySQL 权威 token_hash/status）。
 * - 每消息快路径复验 sess（**纯组缓存 hash 比对、零权威回源**；在线撤销靠踢，见 §2.3 封号 SOP）。
 * - 大包防护在 transport 层 maxPayload（09·G4，见 app.ts）。
 */
import { Room, ServerError, validate, type AuthContext, type Client } from "@colyseus/core";
import {
  LOBBY_MSG_PUSH, LOBBY_MSG_RPC, PROTOCOL_VERSION,
  ErrorCode as SharedErrorCode, type IRoomJoinOptions,
} from "@game/shared";
import { groupAdmitsZone } from "../core/infra/config";
import { zoneCtx } from "../core/infra/keys";
import { account } from "../platform/accountClient";
import { joinRefused, joinRefusedAuth, toErrCode } from "../core/errors";
import { loadFields } from "../core/userRecord";
import { ensureCharacter } from "../player/character";
import { dispatchRpc, rpcEnvelopeSchema, type RpcCtx, type RpcReply } from "./dispatcher";
import { registerOnline, setOnlineGuild, startMailWakeLoop, unregisterOnline, type PushSink } from "./push";
import { tokenHashOf } from "../core/auth/session";
import { registerAllRoutes } from "./loader";

type LobbyClient = Client<{
  messages: { [LOBBY_MSG_RPC]: RpcReply; [LOBBY_MSG_PUSH]: { type: string; data: unknown } };
  auth: { userId: string; token: string; sId: number };
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
      throw joinRefused(SharedErrorCode.ProtocolMismatch); // ⚠ 业务码走 message（status 必须 200–599，见 joinRefused）
    }
    // 进服区归属硬闸（docs/DUAL_MODE.md §4.3 / M11）：sId ∉ 本组 GROUP_ZONES 即拒（防串服）。
    // sId 缺省 / GROUP_ZONES 空（单形态）放行，向后兼容。
    if (!groupAdmitsZone(options?.sId)) {
      throw joinRefused(SharedErrorCode.WrongServer);
    }
    try {
      const uid = await account.verify(token, true);
      return { userId: uid, token, sId: options?.sId ?? 0 }; // sId 存进 auth，供 messages/onJoin 建区上下文（§3.5）
    } catch (e) {
      throw joinRefusedAuth(toErrCode(e)); // 统一出口（⛔ 禁在此 new ServerError，见 errors-http-status.test）
    }
  }

  async onCreate(): Promise<void> {
    await registerAllRoutes(); // 扫描 websocket/<域>/<接口>.ts 注册（异步就绪前房间不接客，无竞态窗口）
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
      // 每消息快路径复验（纯组缓存 hash 比对）：顶号换发后旧 token 下一条即 401；
      // ⚠ 封号**不靠这里**（快路径零权威回源）——靠踢（§2.3 SOP：GM 逐节点 /admin/kick 确认）
      try {
        await account.verify(auth.token, false);
      } catch (e) {
        client.send(LOBBY_MSG_RPC, { id: msg.id, ok: false, err: { code: toErrCode(e), msg: "" } } satisfies RpcReply);
        return;
      }
      // 区上下文（§3.5 硬化）：整个 RPC handler —— 含 dispatcher 中间件的 kIdemUser、
      // handler 里 withUser 的 kLock/casHset、readUser 等 per-zone 键 —— 全在 auth.sId 区内跑。
      // ALS 自动透传进 dispatchRpc（⛔ 无需碰 dispatcher）。
      const reply = await zoneCtx.run({ sId: auth.sId }, () =>
        dispatchRpc(ctx, { id: msg.id, type: msg.type, payload: msg.payload }));
      client.send(LOBBY_MSG_RPC, reply);
    }),
  };

  onJoin(client: LobbyClient): void {
    if (!client.auth) { return; }
    const uid = client.auth.userId;
    const sId = client.auth.sId;
    const sink: PushSink = (type, data) => client.send(LOBBY_MSG_PUSH, { type, data });
    // 按 sessionId 分槽注册（同 uid 可有多条连接）；tokenHash 是顶号判别位（踢时排除新登录态那条）。
    // 强制下线句柄（M12d §2.3）：kickUser 先推 auth.forceLogout{reason}、再用**语义化关闭码**关连接
    // （KICK_CLOSE_CODE，客户端 onLeave 兜底判因）。
    // ⛔ 无 allowReconnection：重连即走全新 onAuth，被撤销 token 在此被拒（不构成重连绕过）。
    registerOnline(uid, client.sessionId, {
      sink,
      kick: (closeCode) => { void client.leave(closeCode); },
      tokenHash: tokenHashOf(client.auth.token),
    });
    // 建角（§2.6 / M12a）：玩家进本区 → 确保该区角色存在（char_registry 行 + s{sId}_user），幂等自愈；
    // 再挂工会在线索引（loadFields 读 s{sId}_user 的 guildId，per-zone → zoneCtx 硬化）。
    // 全程 best-effort：失败只影响工会广播/首帧，不阻塞连接（重连/换会修复）。
    void ensureCharacter(uid, sId)
      .then(() => zoneCtx.run({ sId }, () => loadFields(uid, ["guildId"])))
      .then((f) => setOnlineGuild(uid, Number(f.guildId ?? 0) || null, sId)) // ⚠ 带 sId：索引按区分桶（A2）
      .catch((e) => {
        // ⛔ 不再静默：建角失败（尤其 char_registry 写失败）会留下「有档无 char 行」——
        // 该态可自愈（下次进区补写），但**期间 09·F4 的丢档告警对该 (uid,sId) 失效**，
        // 必须可观测。⚠ 仍不阻塞连接（best-effort：重连/换会即修复）。
        console.error(`[lobby] ensureCharacter 失败 uid=${uid} sId=${sId}（有档无 char 行→下次进区自愈；期间 F4 告警对其失效）`, e);
      });
  }

  onLeave(client: LobbyClient): void {
    // 按 sessionId 注销：⛔ 不能按 uid 整槽删——同 uid 的其它连接必须保留可踢/可推
    // （否则 /admin/kick 回 kicked:false 假阴性，破坏 09·G7b 的 ack 语义）。
    if (client.auth) { unregisterOnline(client.auth.userId, client.sessionId); }
  }
}
