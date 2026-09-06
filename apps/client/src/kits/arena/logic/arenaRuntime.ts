/**
 * arena kit 的宿主接线面：kit module install 时由 PluginHost 注入 ports 组装，棋盘页打开时读取
 * （route 形态入口的 navigation.open 不带 setup，故走与 redeem 同形的模块级 holder + 身份守卫注销）。
 * ⛔ 不 import cc（铁律 9）。
 */
import type { IArenaBoardRes, IArenaCaptureRes } from "../../../shared/protocol/lobbyRpc/domains/arena";

export interface ArenaRuntime {
    /** 本人 uid（棋盘归属判定用）。 */
    selfUid(): string;
    /** 只读：整张棋盘 + 本人奖杯。 */
    board(): Promise<IArenaBoardRes>;
    /** 幂等写：clientReqId 由宿主 sendIdempotent 生成，本层只传 tile。 */
    capture(tile: number): Promise<IArenaCaptureRes>;
    /** 关闭本 kit 的棋盘 route。 */
    close(): void;
}

let current: ArenaRuntime | null = null;

export function setArenaRuntime(runtime: ArenaRuntime): () => void {
    current = runtime;
    return () => {
        if (current === runtime) current = null;
    };
}

export function getArenaRuntime(): ArenaRuntime | null {
    return current;
}
