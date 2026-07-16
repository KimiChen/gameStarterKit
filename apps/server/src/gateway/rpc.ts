/**
 * ws-RPC 类型胶水（项目级，⛔ 不属于 Arthur 回流件）：把 shared 的 lobbyRpc 契约
 * 钉到 dispatcher registerRoute 的 def 形状上。dispatcher.ts / core/errors.ts 保持零改动。
 *
 * 评审规则：schema 属性上禁止 `as` 断言。类型对齐的真实边界（zod ZodType 对 Output 协变）：
 *  - 能拦：字段类型写错、schema 漏掉 shared req 的必填字段、handler 返回值形状不符
 *  - 拦不住：schema 多出必填字段（合法客户端请求会被误拒 INVALID_PAYLOAD）；
 *    schema 漏掉 shared req 的可选字段（z.object 剥离未知键→客户端传值被静默丢弃）
 *  —— 因此评审新端点时必须对照 shared req 逐键核对 schema 字段集，类型系统兜不住这两种漂移。
 */
import type { ZodType } from "zod";
import type { LobbyRpcIdemType, LobbyRpcType, RpcErrCode, RpcReq, RpcRes } from "@game/shared";
import type { ErrCode } from "../core/errors";
import type { RpcCtx } from "./dispatcher";

// ── 编译期镜像互检：core/errors.ts 的 ErrCode ⇔ shared envelope.ts 的 RPC_ERR_CODES ──
// 任一侧增删错误码而另一侧未同步 → 下面这个常量的类型不再是 true，npm run typecheck 直接挂
type MutuallyAssignable<A, B> = [A] extends [B]
  ? ([B] extends [A] ? true : "shared RPC_ERR_CODES 比 ErrCode 多出条目")
  : "ErrCode 比 shared RPC_ERR_CODES 多出条目";
export const ERR_CODE_MIRROR_OK: MutuallyAssignable<ErrCode, RpcErrCode> = true;

/** 单个端点定义。构造一律用 defineRpc（⛔ 不手写对象字面量），由 handlers/loader.ts 收集注册。 */
export interface LobbyRpcDef<T extends LobbyRpcType> {
  type: T;
  schema: ZodType<RpcReq<T>>;
  /** 幂等占位（09·I1）；开了则 req 必须含 clientReqId——defineRpc 重载在编译期强制 */
  idem?: boolean;
  handler: (ctx: RpcCtx, payload: RpcReq<T>) => Promise<RpcRes<T>>;
}

/** 全端点联合（loader 的收集元素类型） */
export type AnyLobbyRpcDef = { [K in LobbyRpcType]: LobbyRpcDef<K> }[LobbyRpcType];

// idem: true 重载：类型域收窄到 LobbyRpcIdemType（req 含 clientReqId 的路由），09·I2 编译期化
export function defineRpc<T extends LobbyRpcIdemType>(type: T, def: {
  schema: ZodType<RpcReq<T>>;
  idem: true;
  handler: (ctx: RpcCtx, payload: RpcReq<T>) => Promise<RpcRes<T>>;
}): LobbyRpcDef<T>;
// 无 idem 重载：只读/天然幂等路由。类型域排除 LobbyRpcIdemType——req 含 clientReqId 的
// 路由必须显式 idem: true（防「复制只读模板忘开幂等」：漏开则占位/结果缓存整条链失效）
export function defineRpc<T extends Exclude<LobbyRpcType, LobbyRpcIdemType>>(type: T, def: {
  schema: ZodType<RpcReq<T>>;
  handler: (ctx: RpcCtx, payload: RpcReq<T>) => Promise<RpcRes<T>>;
}): LobbyRpcDef<T>;
export function defineRpc<T extends LobbyRpcType>(type: T, def: Omit<LobbyRpcDef<T>, "type">): LobbyRpcDef<T> {
  return { type, ...def };
}
