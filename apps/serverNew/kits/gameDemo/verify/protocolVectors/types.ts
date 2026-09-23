import type {LobbyRpcType,RpcReq,RpcRes} from "../../../../../shared/src/native/index";
export type LobbyRpcVectorFile={readonly[K in LobbyRpcType]?:{request:RpcReq<K>;response:RpcRes<K>}};
