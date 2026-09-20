/**
 * mmo kit 的宿主接线面：kit module install 时由 PluginHost 注入 ports 组装（Lobby RPC / launch / navigation），选角页与 mmoWorld
 * 的 joiner 读取（route 形态入口的 navigation.open 不带 setup，故走与 arena 同形的模块级 holder + 身份守卫注销）。⛔ 不 import cc（铁律 9）。
 */
import type { IWorldEnterRes } from "../../../shared/protocol/lobbyRpc/domains/world";
import type { IMmoWorldTransferReady } from "../../../shared/gameplays/mmoWorld/wire";
import type { IMmoBagRes, IMmoCharactersRes, IMmoCreateCharacterReq, IMmoCreateCharacterRes, IMmoMoveItemReq, IMmoMoveItemRes } from "../../../shared/protocol/lobbyRpc/domains/mmo";

export interface MmoRuntime {
    /** 本人 uid。 */
    selfUid(): string;
    /** 只读：本账号本区的角色 + 孤儿槽 + 槽位上限（mmo.characters）。 */
    characters(): Promise<IMmoCharactersRes>;
    /** 幂等写：clientReqId 由宿主 sendIdempotent 生成（mmo.createCharacter）。 */
    createCharacter(input: Omit<IMmoCreateCharacterReq, "clientReqId">): Promise<IMmoCreateCharacterRes>;
    /** 只读背包（mmo.bag，MK3-B1）。 */
    bag(characterId: string): Promise<IMmoBagRes>;
    /** 幂等写：移动 / 装备一件（mmo.moveItem，MK3-B1）。 */
    moveItem(input: Omit<IMmoMoveItemReq, "clientReqId">): Promise<IMmoMoveItemRes>;
    /** 框架 world.enter：签发一次性凭据（凭据原文 ⛔ 落日志）。 */
    enterWorld(personaId: string, mapId: string): Promise<IWorldEnterRes>;
    /** 带参 launch：启动 mmoWorld 玩法（payload = { characterId, mapId, transfer? }，经 GameplayModule.validateLaunch；transfer = 两图交接凭据）。 */
    launchWorld(characterId: string, mapId: string, transfer?: IMmoWorldTransferReady): Promise<void>;
    /** 关闭本 kit 的选角 route。 */
    close(): void;
}

let current: MmoRuntime | null = null;

export function setMmoRuntime(runtime: MmoRuntime): () => void {
    current = runtime;
    return () => {
        if (current === runtime) current = null;
    };
}

export function getMmoRuntime(): MmoRuntime | null {
    return current;
}
