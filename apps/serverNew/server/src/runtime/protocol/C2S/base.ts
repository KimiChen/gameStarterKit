import { Mod } from '../../../../generated/protocol/server/C2S/mod/Mod'
import { Service } from '../ServiceType'

/**
 *  请求登录
 */
export interface ReqLogin extends Service<'Base'> {
    id: int
    name: string
}

export interface ResLogin {
    id: int
    name: string
    isLogin: boolean
    mod?: Mod
}

/**
 * 主动 change。
 *
 * ⛔ 不要当作死代码删除：它是 `proto.json5` 声明的协议类型（兼容基线 `C2S:base/PushChange`，
 * 由 `generated/protocol/server/C2S/serviceProto.ts` 引用），删它等于改协议面。
 * 但 P6 已删除旧二进制通道的 `_mod` 推送，所以当前没有任何生产者/消费者；
 * 原生 Lobby 的变更通知走 shared 声明的领域推送（见 `engine/src/mod/ModSync.ts` 的同类说明）。
 */
export interface PushChange {
    _mod?: Mod
}
