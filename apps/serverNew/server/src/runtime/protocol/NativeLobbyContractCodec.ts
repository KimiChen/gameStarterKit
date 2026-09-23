import type { LobbyInboundFrame, LobbyOutboundFrame, LobbyWireCodec } from '@arthropoda/game-engine'
import {
    ALL_LOBBY_RPC_TYPES,
    LOBBY_TRANSPORT_MAX_MESSAGE_BYTES,
    LOBBY_TRANSPORT_VERSION,
    parseLobbyTransportText,
    serializeLobbyTransportFrame,
    validateLobbyPush,
    validateLobbyRpcRequest,
    validateLobbyRpcResponse,
    validateLobbyTransportClientFrame,
    validateLobbyTransportServerFrame,
    type LobbyRpcType,
} from '../../../generated/lobby-contract/native/lobbyRpc/index.generated'

/**
 * 原生 Lobby 的 wire 编解码：CommonJS 宿主直接消费 shared 编译结果，不维护第二份字段或路由校验器。
 *
 * ⛔ 不要为了「少一次校验」绕过 shared 校验器，也不要在这里复制一份路由表。
 */
export class NativeLobbyContractCodec implements LobbyWireCodec {
    readonly maxMessageBytes = LOBBY_TRANSPORT_MAX_MESSAGE_BYTES

    decodeClient(text: string): LobbyInboundFrame {
        return validateLobbyTransportClientFrame(parseLobbyTransportText(text))
    }

    encodeServer(frame: LobbyOutboundFrame): string {
        return serializeLobbyTransportFrame(validateLobbyTransportServerFrame({ v: LOBBY_TRANSPORT_VERSION, ...frame }))
    }

    validateRequest(type: string, payload: unknown): unknown {
        return validateLobbyRpcRequest(this.route(type), payload)
    }

    validateResponse(type: string, response: unknown): unknown {
        return validateLobbyRpcResponse(this.route(type), response)
    }

    validatePush(type: string, data: unknown) {
        return validateLobbyPush({ type, data })
    }

    private route(type: string): LobbyRpcType {
        if (!(ALL_LOBBY_RPC_TYPES as readonly string[]).includes(type)) throw new Error('unknown Lobby route')
        return type as LobbyRpcType
    }
}
