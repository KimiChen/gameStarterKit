import { Url, getServerIdByUid } from '@arthropoda/game-engine'
import { FixedServerEndpoint } from '../../../../http/FixedServerEndpoint'
import { OPS_FORCE_LOGOUT_REASON, OPS_ROLE_FORCE_LOGOUT_TYPE } from '../../../../runtime/lobby/NativeLobbyForceLogout'
import { Player } from './Player'

/**
 * 运营后台按既有 role_id 强制下线原生 Lobby 在线连接。
 *
 * 管理进程不持有原生 Lobby 的外部 uid → role_id 映射；它只负责把已验证的 role_id 投递给
 * 目标区服。目标监听 worker 用当前在线会话里的 internalUid 定位连接，因此未在线时返回
 * `kicked: false`，不会凭历史身份数据猜测账号。
 */
export class ActionPlayerKickOnline extends Player {
    public async doAction(params: { [key: string]: any }) {
        const roleId = Number(params.role_id)
        if (!Number.isSafeInteger(roleId) || roleId < 1) {
            this.gmContext.setGmMsg(1001, 'role_id 必须是正整数')
            return false
        }
        const sId = getServerIdByUid(roleId)
        if (!Number.isSafeInteger(sId) || sId < 1) {
            this.gmContext.setGmMsg(1001, '无法从 role_id 解析目标区服')
            return false
        }
        const explicitSid = params.sId ?? params.sid
        if (explicitSid !== undefined && Number(explicitSid) !== sId) {
            this.gmContext.setGmMsg(1001, 'role_id 与目标区服不匹配')
            return false
        }
        const url = FixedServerEndpoint.internalActionUrl(sId)
        if (!url) {
            this.gmContext.setGmMsg(1001, `目标区服不存在: ${sId}`)
            return false
        }
        const response = await Url.postJson(
            url,
            {
                type: OPS_ROLE_FORCE_LOGOUT_TYPE,
                actionParams: { roleId, sId, reason: OPS_FORCE_LOGOUT_REASON },
            },
            undefined,
            { 'x-internal-secret': CP.platform.gmSecret ?? '' },
        )
        if (response.status !== 200 || response.data?.code !== 0) {
            this.gmContext.setGmMsg(1001, `原生 Lobby 下线请求失败: sid=${sId}`)
            return false
        }
        const kicked = response.data?.data?.json?.kicked
        if (typeof kicked !== 'boolean') {
            this.gmContext.setGmMsg(1001, `原生 Lobby 下线响应非法: sid=${sId}`)
            return false
        }
        return { role_id: roleId, sId, kicked }
    }
}
