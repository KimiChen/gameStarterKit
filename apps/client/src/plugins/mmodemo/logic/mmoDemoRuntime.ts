/**
 * mmodemo plugin 的宿主接线面（MG1-B2 可选域页面）：plugin module install 时由 PluginHost 注入 ports 组装，View 打开时读取
 * （route 形态入口的 navigation.open 不带 setup，故走与 arenaShop 同形的模块级 holder + 身份守卫注销）。⛔ 不 import cc（铁律 9）。
 */
import type { IMmoDemoBossBoardRes } from "../../../shared/protocol/lobbyRpc/domains/mmodemo";

export interface MmoDemoRuntime {
    /** 只读：灰谷各分线头狼击杀战报（本插件自有域 mmodemo.bossBoard）。 */
    bossBoard(): Promise<IMmoDemoBossBoardRes>;
    /** 关闭本 plugin 的 route。 */
    close(): void;
}

let current: MmoDemoRuntime | null = null;

export function setMmoDemoRuntime(runtime: MmoDemoRuntime): () => void {
    current = runtime;
    return () => {
        if (current === runtime) current = null;
    };
}

export function getMmoDemoRuntime(): MmoDemoRuntime | null {
    return current;
}
