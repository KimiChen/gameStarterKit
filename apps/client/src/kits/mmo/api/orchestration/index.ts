/** 编排客户端只读面：订阅绑定于当前世界房；没有全局 current，也不暴露原始 transport。 */
import type { ScriptScalar } from "../../../../shared/kits/mmo/api/orchestration/index";

export type { ScriptScalar };

export interface IMmoScriptStateSnapshot {
    readonly packId: string;
    /** null = 当前连接尚未取得全量快照；断线立即失效，不能把旧比分当成当前状态。 */
    readonly rev: number | null;
    readonly state: Readonly<Record<string, ScriptScalar>>;
    readonly connected: boolean;
}

export interface IMmoScriptStateSource {
    /** 同步回放最近快照（首次也是一份 rev:null 的快照）；返回幂等解绑函数。 */
    subscribeScriptState(packId: string, listener: (snapshot: IMmoScriptStateSnapshot) => void): () => void;
}

/** 显式绑定一个世界房的只读门面，方便内容 View 持有最小能力。 */
export function subscribeScriptState(source: IMmoScriptStateSource, packId: string, listener: (snapshot: IMmoScriptStateSnapshot) => void): () => void {
    return source.subscribeScriptState(packId, listener);
}
