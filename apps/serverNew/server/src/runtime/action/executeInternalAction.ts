import { Call, MessageHelper, ProtocolConfigMgr } from '@arthropoda/game-engine'
import {
    OPS_FORCE_LOGOUT_TYPE,
    OPS_ROLE_FORCE_LOGOUT_TYPE,
    parseOpsForceLogout,
    parseOpsRoleForceLogout,
    revokeOpsOnline,
    revokeOpsRoleOnline,
} from '../lobby/NativeLobbyForceLogout'

/**
 * 内部 HTTP 入口的动作执行器。
 *
 * 旧实现挂在 `ClientServer` 上，而 `ClientServer` 是旧二进制通道的网关（8/9 字节包头 +
 * PB 编解码），已随 P6 删除。内部入口与 wire 编码无关：它收到的已经是解析好的对象，
 * 因此这里直接复用字符串路由表与 `ProtocolConfigMgr.execAction`，不再依赖任何客户端网关。
 *
 * ⛔ 不要为了「顺手复用」而把客户端连接语义引进来：本入口没有连接、没有会话，
 * 身份只能来自 payload 自身或调用方的可信来源。
 *
 * 三种 payload 形状：
 * - `type: 'localAction'`：按 apiName 调本进程 LocalAction；
 * - `type: 'lobbyKick'`：运营强制下线（4903），落到 `NativeLobbyAuthProvider.revoke`；
 * - `type: 'lobbyKickByRoleId'`：`/gm/api` 按内部 role_id 的 4903 桥接；
 * - 其它：按字符串路由交给 `ProtocolConfigMgr.execAction`。
 *
 * 多进程下本函数跑在**监听进程**里（内部 HTTP 端点由它承载），运营下线因此就地落到
 * `NativeLobbyAuthProvider.revoke`；`routeOpsForceLogout` 仍会在转发之前接管 `lobbyKick`
 * 并做解析校验，所以「运营入口只接受什么」这件事仍然只有一处定义。
 *
 * `localAction` 会按持久的 uid Owner 进入 Event Worker，并与客户端请求共用该进程的串行组。
 * Task Worker 发起同一 LocalAction 时也会回到这里。本函数仍然只负责「拿到载荷就执行」，不在
 * HTTP 层复制玩家写入路由规则。
 */
export async function executeInternalAction(payload: any, remoteAddress?: string): Promise<unknown> {
    if (payload?.type === OPS_FORCE_LOGOUT_TYPE) {
        return { kicked: revokeOpsOnline(parseOpsForceLogout(payload)) }
    }
    if (payload?.type === OPS_ROLE_FORCE_LOGOUT_TYPE) {
        return { kicked: revokeOpsRoleOnline(parseOpsRoleForceLogout(payload)) }
    }
    if (payload?.type === 'localAction') {
        const action = readLocalActionPayload(payload)
        if (!action) {
            throw new Error('invalid local action payload')
        }
        if (action.sId !== SERVER_ID) {
            throw new Error(`fixed server sid mismatch: expected=${SERVER_ID}, actual=${action.sId}`)
        }
        const result = await MessageHelper.callLocalAction(action.uId, action.sId, new Call(action.apiName, action.req))
        if (!result.isSucc) {
            throw result.res ?? new Error(result.errMsg ?? `local action failed: ${action.apiName}`)
        }
        return result.res
    }
    return MessageHelper.syncDoFunc(() => ProtocolConfigMgr.execAction(payload?.actionParams ?? payload, remoteAddress))
}

/** `type: 'localAction'` 的载荷形状；`undefined` 表示载荷本身不合法。 */
export interface LocalActionPayload {
    readonly apiName: string
    /** 引擎内部数值 uid；非数值时按历史行为归 0（不是「悄悄当成别的用户」）。 */
    readonly uId: number
    readonly sId: number
    readonly req: any
}

/**
 * 解析 `type: 'localAction'` 的载荷。
 *
 * 抽出来是为了让**路由方**（多进程下的落点判定）与**执行方**（本函数）读同一份形状：
 * 两处各写一遍 `action?.apiName` 这种判断，迟早会在某一处漏掉一个条件，表现成
 * 「路由判定说合法、执行方说非法」或者反过来。
 *
 * 形状不合法返回 `undefined` 而不抛错：调用方需要区分「这不是一条合法的用户任务」
 * （就地执行、由执行方给出诊断）与「这是一条合法但执行失败的用户任务」（原样回传业务失败）。
 */
export function readLocalActionPayload(payload: any): LocalActionPayload | undefined {
    const action = payload?.actionParams
    if (!action?.apiName || !Number.isInteger(action.sId)) return undefined
    return { apiName: action.apiName, uId: Number(action.uId) || 0, sId: action.sId, req: action.req ?? {} }
}
