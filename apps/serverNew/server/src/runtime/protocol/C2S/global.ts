import { PropItem } from './commom'

/**
 * 框架全局响应类型。
 *
 * ⛔ 只保留类型声明：`GlobalResponse` 是 `proto.json5` 声明的协议类型
 * （兼容基线 `C2S:global/GlobalResponse`），也是 `generated/protocol/server/C2S/serviceProto.ts` 的类型锚点。
 * 旧的 `getGlobalResponse`（把 `res._global` 惰性注入每个 C2S 响应）已随 P6 删除旧协议链一并移除：
 * 原生 Lobby 走 shared 严格校验，未声明的 `_global` 会被拒收。
 */
export interface GlobalResponse {
    awards: PropItem[]
    testMsg: string
}
