/**
 * Lobby RPC 领域自描述 builder（Non-intrusive §4.1 阶段 3）。
 *
 * 每个域在 `domains/<域>.ts` 里 `export default defineLobbyRpcDomain({...})` 声明路由、
 * 执行模式、领域错误码与推送；`codegen:features` 以**语法读取**（⛔ 不执行 domain 文件）
 * 把它们聚合进 `registry.generated.ts`。
 *
 * 执行模式三分（§4.1）：
 *  - `query`            不产生领域写入，不进入幂等写状态机；
 *  - `natural-write`    写入本身可安全重复（如目标状态赋值），不使用通用结果缓存；
 *  - `idempotent-write` 重复执行可能重复扣除/发奖，请求必须含 clientReqId，自动进通用幂等层。
 *  执行模式不替代并发控制：是否用户锁/UoW/UNIQUE/CAS 仍由领域写路径决定。
 *  ⛔ 不得再按「请求是否含 clientReqId」推断模式——shop.queryOp 携带原操作 opId 但仍是 query。
 *
 * descriptor 形态约束（生成器语法读取的前提）：defineLobbyRpcDomain 调用内只允许
 * 字符串/数组/对象字面量与标识符引用；computed key、spread、define* 之外的函数调用与
 * 顶层副作用会被生成器点名拒绝。
 */

/** 路由执行模式。 */
export type LobbyRpcRouteMode = "query" | "natural-write" | "idempotent-write";

/** 单条路由 descriptor（原样存参的纯字面量运行时对象）。 */
export interface LobbyRpcRouteDescriptor<TReq = unknown, TRes = unknown> {
    readonly type: string;
    readonly mode: LobbyRpcRouteMode;
    readonly request: (input: unknown) => TReq;
    readonly response: (input: unknown) => TRes;
    /** idempotent-write：所属 operation group（阶段 4 的 inspect 机制消费；本阶段不声明）。 */
    readonly operationGroup?: string;
    /** idempotent-write：是否允许通用 operation 查询（阶段 4；本阶段不声明）。 */
    readonly inspectable?: boolean;
    /** query：可查询哪个 operation group 的操作状态（阶段 4；本阶段不声明）。 */
    readonly inspectsOperationGroup?: string;
}

/** 单条推送 descriptor：key 是聚合 LobbyPush 常量的成员名，type 是推送消息名。 */
export interface LobbyPushDescriptor<TData = unknown> {
    readonly key: string;
    readonly type: string;
    readonly data: (input: unknown) => TData;
}

/** 域 descriptor（defineLobbyRpcDomain 的返回值；契约测试与 generated 表双向对拍）。 */
export interface LobbyRpcDomainDescriptor {
    readonly domain: string;
    readonly errorCodes: readonly string[];
    readonly pushes: readonly LobbyPushDescriptor[];
    readonly routes: readonly LobbyRpcRouteDescriptor[];
}

/** query 路由：不产生领域写入。 */
export function defineRpcQuery<TReq, TRes>(type: string, options: {
    readonly request: (input: unknown) => TReq;
    readonly response: (input: unknown) => TRes;
    readonly inspectsOperationGroup?: string;
}): LobbyRpcRouteDescriptor<TReq, TRes> {
    return {
        type,
        mode: "query",
        request: options.request,
        response: options.response,
        ...(options.inspectsOperationGroup === undefined
            ? {}
            : { inspectsOperationGroup: options.inspectsOperationGroup }),
    };
}

/** natural-write 路由：写入本身可安全重复，不进通用幂等层。 */
export function defineRpcNaturalWrite<TReq, TRes>(type: string, options: {
    readonly request: (input: unknown) => TReq;
    readonly response: (input: unknown) => TRes;
}): LobbyRpcRouteDescriptor<TReq, TRes> {
    return {
        type,
        mode: "natural-write",
        request: options.request,
        response: options.response,
    };
}

/** idempotent-write 路由：请求必须含必选 clientReqId（生成器 AST 层校验），进通用幂等层。 */
export function defineRpcIdempotentWrite<TReq, TRes>(type: string, options: {
    readonly request: (input: unknown) => TReq;
    readonly response: (input: unknown) => TRes;
    readonly operationGroup?: string;
    readonly inspectable?: boolean;
}): LobbyRpcRouteDescriptor<TReq, TRes> {
    return {
        type,
        mode: "idempotent-write",
        request: options.request,
        response: options.response,
        ...(options.operationGroup === undefined ? {} : { operationGroup: options.operationGroup }),
        ...(options.inspectable === undefined ? {} : { inspectable: options.inspectable }),
    };
}

/** 推送声明：key（LobbyPush 常量成员名）+ type（消息名）+ data validator。 */
export function defineLobbyPush<TData>(
    key: string,
    type: string,
    data: (input: unknown) => TData,
): LobbyPushDescriptor<TData> {
    return { key, type, data };
}

/** 域声明入口；pushes 可省（缺省空集）。 */
export function defineLobbyRpcDomain(descriptor: {
    readonly domain: string;
    readonly errorCodes: readonly string[];
    readonly pushes?: readonly LobbyPushDescriptor[];
    readonly routes: readonly LobbyRpcRouteDescriptor[];
}): LobbyRpcDomainDescriptor {
    return {
        domain: descriptor.domain,
        errorCodes: descriptor.errorCodes,
        pushes: descriptor.pushes ?? [],
        routes: descriptor.routes,
    };
}
