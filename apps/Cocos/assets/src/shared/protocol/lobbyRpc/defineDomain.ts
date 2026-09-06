/**
 * Lobby RPC 领域自描述 builder（Non-intrusive §4.1 阶段 3）。
 *
 * 每个域在 `domains/<域>.ts` 里 `export default defineLobbyRpcDomain({...})` 声明路由、
 * 执行模式、领域错误码与推送；`codegen:plugins` 以**语法读取**（⛔ 不执行 domain 文件）
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
    /**
     * 契约版本（§6.11；缺省 1）：随 request/response validator 的**语义**变更人工 bump。
     * 幂等 v2 记录持久化它并 fail-closed 处理不匹配；⛔ 不进摘要 preimage、不进 Redis key。
     */
    readonly contractVersion?: number;
    /** idempotent-write：所属 operation group（阶段 4 inspect 机制；必须由本域 ownsOperationGroups 声明所有权）。 */
    readonly operationGroup?: string;
    /** idempotent-write：是否允许通用 operation 查询（阶段 4；须同时声明 operationGroup）。 */
    readonly inspectable?: boolean;
    /** query：可查询哪个 operation group 的操作状态（阶段 4；所有权规则见 defineLobbyRpcDomain 注释）。 */
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
    /**
     * 域契约版本（缺省 1）：codegen:plugins 以 `domains/<域>.ts` 的字节 digest 为契约身份，
     * digest 变化而本值未递增即拒绝生成（与 gameplay 的 contractDigest/modeVersion 闸对称，
     * docs/PLUGIN.md §8/§9）。⛔ 只是 codegen 层的人工确认闸，不进 wire、不进 join 信封。
     */
    readonly contractVersion: number;
    readonly errorCodes: readonly string[];
    /** 本域拥有的 operation group（§6.13：受拥有 id，跨域重复声明由 codegen 拒绝）。 */
    readonly ownsOperationGroups: readonly string[];
    /** group → 获准跨域查询该组的域列表（§6.13 exposesOperationGroupTo；key 必须是本域拥有的组）。 */
    readonly exposesOperationGroupTo: { readonly [group: string]: readonly string[] };
    readonly pushes: readonly LobbyPushDescriptor[];
    readonly routes: readonly LobbyRpcRouteDescriptor[];
}

/** query 路由：不产生领域写入。 */
export function defineRpcQuery<TReq, TRes>(type: string, options: {
    readonly request: (input: unknown) => TReq;
    readonly response: (input: unknown) => TRes;
    readonly contractVersion?: number;
    readonly inspectsOperationGroup?: string;
}): LobbyRpcRouteDescriptor<TReq, TRes> {
    return {
        type,
        mode: "query",
        request: options.request,
        response: options.response,
        ...(options.contractVersion === undefined ? {} : { contractVersion: options.contractVersion }),
        ...(options.inspectsOperationGroup === undefined
            ? {}
            : { inspectsOperationGroup: options.inspectsOperationGroup }),
    };
}

/** natural-write 路由：写入本身可安全重复，不进通用幂等层。 */
export function defineRpcNaturalWrite<TReq, TRes>(type: string, options: {
    readonly request: (input: unknown) => TReq;
    readonly response: (input: unknown) => TRes;
    readonly contractVersion?: number;
}): LobbyRpcRouteDescriptor<TReq, TRes> {
    return {
        type,
        mode: "natural-write",
        request: options.request,
        response: options.response,
        ...(options.contractVersion === undefined ? {} : { contractVersion: options.contractVersion }),
    };
}

/** idempotent-write 路由：请求必须含必选 clientReqId（生成器 AST 层校验），进通用幂等层。 */
export function defineRpcIdempotentWrite<TReq, TRes>(type: string, options: {
    readonly request: (input: unknown) => TReq;
    readonly response: (input: unknown) => TRes;
    readonly contractVersion?: number;
    readonly operationGroup?: string;
    readonly inspectable?: boolean;
}): LobbyRpcRouteDescriptor<TReq, TRes> {
    return {
        type,
        mode: "idempotent-write",
        request: options.request,
        response: options.response,
        ...(options.contractVersion === undefined ? {} : { contractVersion: options.contractVersion }),
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

/**
 * 域声明入口；contractVersion / pushes / ownsOperationGroups / exposesOperationGroupTo 可省
 * （缺省 1 / 空集）。
 *
 * operation group 所有权规则（§6.13，codegen:plugins 校验，任一违反即拒绝生成）：
 *  1. group 是受拥有 id：由且仅由一个域在 `ownsOperationGroups` 声明，跨域重复即拒；
 *  2. 路由的 `operationGroup` 必须是本域拥有的组；`inspectable: true` 必须同时声明 `operationGroup`；
 *  3. `inspectsOperationGroup` 默认只能引用本域拥有的组；引用他域的组必须由该组 owner 在
 *     `exposesOperationGroupTo[group]` 里显式列出查询方域名（fail closed）；
 *  4. 同一条路由不得同时声明 `operationGroup` 与 `inspectsOperationGroup`（builder 形态已排除，
 *     生成器仍显式复核）；`inspectsOperationGroup` 只允许出现在 query 路由上。
 */
export function defineLobbyRpcDomain(descriptor: {
    readonly domain: string;
    readonly contractVersion?: number;
    readonly errorCodes: readonly string[];
    readonly ownsOperationGroups?: readonly string[];
    readonly exposesOperationGroupTo?: { readonly [group: string]: readonly string[] };
    readonly pushes?: readonly LobbyPushDescriptor[];
    readonly routes: readonly LobbyRpcRouteDescriptor[];
}): LobbyRpcDomainDescriptor {
    return {
        domain: descriptor.domain,
        contractVersion: descriptor.contractVersion ?? 1,
        errorCodes: descriptor.errorCodes,
        ownsOperationGroups: descriptor.ownsOperationGroups ?? [],
        exposesOperationGroupTo: descriptor.exposesOperationGroupTo ?? {},
        pushes: descriptor.pushes ?? [],
        routes: descriptor.routes,
    };
}
