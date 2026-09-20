/** 跟踪id生成器 */
export class TraceIdGen {
    private static _traceIdGen = 1
    private static _initTraceId = 1
    private static _maxTraceId = Number.MAX_SAFE_INTEGER - 10000

    static init(id: int, fromClient: boolean = true) {
        //自增id*10000+网关或服务id*10+是否来自客户端（否则来自微服务）
        this._initTraceId = id * 10 + (fromClient ? 0 : 1) + 10000
        this._traceIdGen = this._initTraceId
        this._maxTraceId = Number.MAX_SAFE_INTEGER - 10000
    }

    static next() {
        let id = this._traceIdGen
        if (id >= this._maxTraceId) {
            this._traceIdGen = this._initTraceId
        } else {
            this._traceIdGen += 10000
        }
        return Number(id)
    }
}
