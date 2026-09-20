/** 地图页与框架端口之间的唯一接缝。⛔ 不引擎、⛔ 不自己造网络单例。 */
import type { ISgzzRect } from "../../../shared/kits/sgzzmap/api/hexmap/index";
import type {
    ISgzzAbandonRes, ISgzzOccupyRes, ISgzzTileRes, ISgzzViewRes, ISgzzZoomRes,
} from "../../../shared/protocol/lobbyRpc/domains/sgzzmap";

export interface SgzzRuntime {
    selfUid(): string;
    view(rect: ISgzzRect): Promise<ISgzzViewRes>;
    zoom(level: number, rect: ISgzzRect): Promise<ISgzzZoomRes>;
    tile(cell: number): Promise<ISgzzTileRes>;
    occupy(cell: number): Promise<ISgzzOccupyRes>;
    abandon(cell: number): Promise<ISgzzAbandonRes>;
    now(): number;
    tick(callback: (dt: number) => void): () => void;
    close(): void;
}
let current: SgzzRuntime | null = null;
export function setSgzzRuntime(runtime: SgzzRuntime): () => void {
    current = runtime;
    return () => { if (current === runtime) current = null; };
}
export function getSgzzRuntime(): SgzzRuntime | null { return current; }
