import { SystemErrors } from '../../../runtime/errors/SystemErrors'

/**
 * 服务器状态变更通知。
 *
 * 旧二进制通道（`commom/PushErrorStatus` 与 `User` Bean 变更推送）已随 P6 删除，
 * 本类暂无出口。原生 Lobby 侧的服务器状态通知需按 shared 声明的领域推送，
 * 由拥有该 shared 路由的服务显式发送。
 * ⛔ 不要在此处恢复框架级隐式推送。
 */
export class ServerStatusNotifier {
    static async pushServerStop(sId: number, detail: string) {
        let msgInfo = SystemErrors.ProtectMaintenance.getItem().message
        if (detail) {
            const detailValues = JSON.parse(detail)
            msgInfo = detailValues.msg ?? SystemErrors.ProtectMaintenance.getItem().message
        }
        Log.info(`[${sId}区]服务器维护通知：${msgInfo}`)
    }

    static async pushModuleOff(sId: number, offStatus: number[]) {
        Log.info(`[${sId}区]模块开关变更：${offStatus.join(',')}`)
    }
}
