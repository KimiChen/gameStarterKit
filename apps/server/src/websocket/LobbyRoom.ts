/**
 * 网关大厅房（10·M5）：客户端 join 后，所有取数/邮件/工会请求走单一 `rpc` 消息通道
 * （Colyseus 的 send/onMessage 无请求配对，信封里的 id 做 correlation，03）。
 *
 * - onAuth：token 反查 uid（09·G1）+ 严格校验（HTTP 回源 WebPlatform 权威）。
 * - 每消息快路径复验 sess（**纯组缓存 hash 比对、零权威回源**；在线撤销靠踢，见 §2.3 封号 SOP）。
 * - 大包防护在 transport 层 maxPayload（09·G4，见 app.ts）。
 */
import { Room, validate, type AuthContext, type Client } from "@colyseus/core";
import {
  LOBBY_MSG_PUSH, LOBBY_MSG_RPC, PROTOCOL_VERSION,
  ErrorCode as SharedErrorCode, type IRoomJoinOptions,
} from "@game/shared";
import { groupAdmitsZone, normalizeSId } from "../core/infra/config";
import { zoneCtx } from "../core/infra/keys";
import { verifyAndCacheWebPlatformSession } from "../platform/webPlatformClient";
import { joinRefused, joinRefusedAuth, toErrCode } from "../core/errors";
import { loadFields } from "../core/userRecord";
import { ensureCharacterReady } from "../player/character";
import { dispatchRpc, rpcEnvelopeSchema, type RpcCtx, type RpcReply } from "./dispatcher";
import { registerOnline, setOnlineGuild, startMailWakeLoop, unregisterOnline, type PushSink } from "./push";
import { tokenHashOf, verifySession } from "../core/auth/session";
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
    // options 来自网络：⛔ TS 的 number 标注不能挡 string/null/NaN。尤其 GROUP_ZONES 空 = 承载全部，
    // 若先调用 groupAdmitsZone 会把所有畸形值放行，并把它们带进 MySQL 强制转换与 zoneCtx 键前缀。
    const sId = normalizeSId(options?.sId);
    if (sId === null) {
      throw joinRefused(SharedErrorCode.WrongServer);
    }
    // 进服区归属硬闸（docs/DUAL_MODE.md §4.3 / M11）：sId ∉ 本组 GROUP_ZONES 即拒（防串服）。
    // sId 缺省 / GROUP_ZONES 空（单形态）放行，向后兼容。
    // ⚠ 真区服组下仍要把原始 undefined 交给归属闸：缺 sId 必须拒，不能被规范化后的 0 绕过。
    if (!groupAdmitsZone(options?.sId === undefined ? undefined : sId)) {
      throw joinRefused(SharedErrorCode.WrongServer);
    }
    try {
      // ⚠ 带上本次要进的区：token 只对签发它的那个区有效（M12e）
      const uid = await verifyAndCacheWebPlatformSession(token, sId);
      return { userId: uid, token, sId }; // sId 存进 auth，供 messages/onJoin 建区上下文（§3.5）
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
        // token 对游戏服不透明；uid 来自 onAuth 的 WebPlatform verify 响应。
        // 快路径直接用已认证 uid 查组缓存，绝不从 token 文本反解身份、也不逐消息回源。
        await verifySession(auth.userId, auth.token, auth.sId);
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

  async onJoin(client: LobbyClient): Promise<void> {
    if (!client.auth) { return; }
    const uid = client.auth.userId;
    const sId = client.auth.sId;

    // Colyseus 会等待 onJoin 完成后才把 seat 公开为已加入。把首角色初始化
    // 放在这个边界内，GetInfo/写 RPC 就不会看到「已登录但 user=null」的半状态。
    // 失败时不注册在线连接，避免 kick/push 表残留；调用方可用同一 token 重试。
    try {
      await ensureCharacterReady(uid, sId);
    } catch (error) {
      console.error(`[lobby] 首角色未就绪 uid=${uid} sId=${sId}`, error);
      throw joinRefused(SharedErrorCode.CharCreateFailed);
    }

    const sink: PushSink = (type, data) => client.send(LOBBY_MSG_PUSH, { type, data });
    // 按 sessionId 分槽注册（同 uid 可有多条连接）；tokenHash 是顶号判别位（踢时排除新登录态那条）。
    // 强制下线句柄（M12d §2.3）：kickUser 先推 auth.forceLogout{reason}、再用**语义化关闭码**关连接
    // （KICK_CLOSE_CODE，客户端 onLeave 兜底判因）。
    // ⛔ 无 allowReconnection：重连即走全新 onAuth，被撤销 token 在此被拒（不构成重连绕过）。
    registerOnline(uid, client.sessionId, {
      sink,
      sId, // ⚠ 顶号只踢同区（M12e）：⛔ 别把玩家在别区的在线角色一起踢了

      kick: (closeCode) => { void client.leave(closeCode); },
      tokenHash: tokenHashOf(client.auth.token),
    });
    // 建角（§2.6 / M12a）：玩家进本区 → 确保该区玩法档 + WebPlatform 角色登记存在，幂等自愈；
    // 再挂工会在线索引（loadFields 读 s{sId}_user 的 guildId，per-zone → zoneCtx 硬化）。
    // 全程 best-effort：失败只影响工会广播/首帧，不阻塞连接（重连/换会修复）。
    // 角色已 ready；这里只做轻量在线公会索引，失败不会破坏角色契约。
    void zoneCtx.run({ sId }, () => loadFields(uid, ["guildId"]))
      .then((f) => setOnlineGuild(uid, Number(f.guildId ?? 0) || null, sId))
      .catch((e) => console.error(`[lobby] 在线公会索引初始化失败 uid=${uid} sId=${sId}`, e));
  }

  onLeave(client: LobbyClient): void {
    // 按 sessionId 注销：⛔ 不能按 uid 整槽删——同 uid 的其它连接必须保留可踢/可推
    // （否则 /admin/kick 回 kicked:false 假阴性，破坏 09·G7b 的 ack 语义）。
    if (client.auth) { unregisterOnline(client.auth.userId, client.sessionId); }
  }
}
