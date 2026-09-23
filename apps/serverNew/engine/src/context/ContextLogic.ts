import { ApiCall } from '../net/client/base/ApiCall'
import { getServerIdByUid } from '../Platform'
import { UserOnlineMgr } from '../net/UserOnlineMgr'
import type { BackgroundTaskDelivery } from '../protocol/ProtocolInterface'

export class ContextLogic {
    now = new Date()

    call?: ApiCall

    private _uid = 0

    private _sid = 0

    /**
     * 绑定本次调用的业务身份。
     *
     * 只写业务可见的在线归属（中心 Redis），供 `UserOnlineMgr.isOnline/getUsers/getAll` 查询；
     * 连接级 session 缓存与「踢掉旧连接」属于旧二进制通道，已随该通道删除 —— 顶号语义
     * （4902）由原生 Lobby 的在线归属负责，不在这里重复实现。
     */
    async bind(uid: int, sid: int) {
        this._sid = sid
        this._uid = uid
        await UserOnlineMgr.replace(uid, sid, this.call?.messageHead.sendId ?? 0)
    }

    get apiName(): string {
        return this.call?.getApiName() ?? ''
    }

    get backgroundTask(): BackgroundTaskDelivery | undefined {
        return this.call?.backgroundTask
    }

    get uid(): int {
        if (this._uid > 0) {
            return this._uid
        }
        return this.call?.messageHead.uId ?? 0
    }

    set uid(v: int) {
        this._uid = v
    }

    get sid(): int {
        if (this._sid > 0) {
            return this._sid
        }
        const sId = this.call?.messageHead.serverId ?? 0
        if (sId > 0) {
            return sId
        }
        if ((this.call?.messageHead.uId ?? 0) > 0) {
            return getServerIdByUid(this.call?.messageHead.uId ?? 0)
        }
        return 0
    }

    set sid(v: int) {
        this._sid = v
    }
}
