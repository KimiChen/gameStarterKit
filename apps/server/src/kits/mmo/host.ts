/**
 * mmo kit 内部模块：宿主接线（K1：只 import kit-api 门面 `../../core/infra/kitApi` 与本 kit 目录；⛔ core/infra 其他模块、⛔ node:* / mysql2 / ioredis）。
 * ⛔ 插件不得 import 本文件（插件只能 import api/<surface>/index.ts）。
 */
import { currentZoneId, kitOpId, withKitTx, type KitTx } from "../../core/infra/kitApi";

export const MMO_KIT_ID = "mmo";
export const MMO_WORLD_MODE_ID = "mmoWorld";

export { currentZoneId };

/** kit 事务运行器（生产 = withKitTx("mmo", sId, fn)；单测注入假 KitTx）。 */
export type MmoTxRunner = <T>(sId: number, fn: (tx: KitTx) => Promise<T>) => Promise<T>;
export const defaultMmoTxRunner: MmoTxRunner = (sId, fn) => withKitTx(MMO_KIT_ID, sId, fn);

/** 本 kit 命名空间化的 op_id（`kit:mmo:<op>`）。 */
export function mmoOpId(uid: string, sId: number, op: "createCharacter" | "moveItem", clientReqId: string): string {
    return kitOpId(MMO_KIT_ID, uid, sId, op, clientReqId);
}

/** 服务端 uuid（Web Crypto 全局，⛔ node:crypto import：K1 裸说明符闸）。 */
export function newMmoId(): string {
    return globalThis.crypto.randomUUID();
}
