/**
 * 协议声明语言的规范化模型 + 语言定义类型（BF1）。
 *
 * ⚠ 本模块**只允许**纯 TS + ES 标准库（机检：`apps/server/test/shared-zero-dep.test.ts`）：
 * 读 JSON 文件是调用方的事（`fs` 在 shared 里不可用），解析器只接受**已解析**的值。
 * 同理 ⛔ 不 import `../lobbyRpc/**` —— schema 是 lobbyRpc 的**上游**，反向依赖会把
 * 「改 schema 即改契约」变成「改 schema 还要先改 lobbyRpc」。
 */

/**
 * 字段种类。与 `apps/shared/schema/protocols/schema-v1.json` 的 `fieldKinds` 键**一一对应**：
 * 解析器按该表的 `constraints` 白名单判定「某种类允许哪些约束键」，所以两处不一致时
 * 表现为「合法声明被拒」而不是静默放过。
 *
 * `external` 不是 wire 上的一种形状，而是「这个类型的 TS 声明不在本文件、而在一个**非生成**
 * 的 shared 模块里」（kit api 面 / economy）。它只能被 `ref` 指向，运行时校验必须由同节点的
 * `check` 提供——否则生成物会对一个没有任何校验的类型「放行」，那正是 schema 想消灭的静默。
 */
export type ProtocolFieldKind =
    | "boolean"
    | "integer"
    | "number"
    | "string"
    | "enum"
    | "object"
    | "array"
    | "record"
    | "json"
    | "ref"
    | "external";

/**
 * 路由执行模式。语义与 shared `LobbyRpcRouteMode` 相同，此处独立声明以免 schema 层依赖 lobbyRpc；
 * 生成器负责把它映射成 `defineRpcQuery` / `defineRpcNaturalWrite` / `defineRpcIdempotentWrite`。
 */
export type ProtocolRouteMode = "query" | "natural-write" | "idempotent-write";

/**
 * 一条「具名校验器」引用：生成物按 `from` import `fn` 并按 `(value, path)` 调用它。
 *
 * 这是 schema 与**非生成** shared 代码之间的唯一接口（BF2 口径 A）：域内复杂校验（棋盘顺序、
 * 行军端点、文本 trim、kit 的 `validateTileIndex` 等）留在那些文件里，schema 只声明
 * 「这个节点由哪个具名校验器产出」。⛔ 不允许匿名内联实现——那会把真源搬回生成物。
 */
export interface ProtocolCheckRef {
    /** 被引用模块导出的函数名。 */
    readonly fn: string;
    /** 相对生成物（`apps/shared/src/protocol/lobbyRpc/domains/<域>.ts`）的模块 specifier。 */
    readonly from: string;
}

/** 一个类型表达式（规范化后）。字段按种类出现，未声明的可选约束不写键。 */
export interface ProtocolSchemaType {
    readonly kind: ProtocolFieldKind;
    /** integer / number：下界（含）。 */
    readonly min?: number;
    /** integer / number：上界（含）。 */
    readonly max?: number;
    /** string：最小长度（含）。 */
    readonly minLength?: number;
    /** string：最大长度（含）。 */
    readonly maxLength?: number;
    /** string：必须匹配的正则源。 */
    readonly pattern?: string;
    /** string：正则不匹配时的 wire 错误码（有 `pattern` 必有本键）。 */
    readonly patternCode?: string;
    /** enum：允许的成员（字符串 / 数字 / 布尔，互不相同）。 */
    readonly members?: readonly (string | number | boolean)[];
    /** enum：成员不匹配时的 wire 错误码。 */
    readonly enumCode?: string;
    /** object：字段列表（声明序即 wire 的 exact-keys 顺序，保持稳定）。 */
    readonly fields?: readonly ProtocolSchemaField[];
    /** array：元素类型。 */
    readonly items?: ProtocolSchemaType;
    /** array：最小元素数（含）。 */
    readonly minItems?: number;
    /** array：最大元素数（含）；缺省取语言的 `maxArrayItems`。 */
    readonly maxItems?: number;
    /** array / record：元素数或键数越界时的 wire 错误码（缺省 `WIRE_ARRAY` / `WIRE_KEYS`）。 */
    readonly sizeCode?: string;
    /** record：值类型（键恒为字符串）。 */
    readonly values?: ProtocolSchemaType;
    /** record：键必须匹配的正则源。 */
    readonly keyPattern?: string;
    /** record：键不匹配时的 wire 错误码（缺省 `WIRE_KEYS`）。 */
    readonly keyPatternCode?: string;
    /** record：最大键数（含）。 */
    readonly maxKeys?: number;
    /** ref：被引用类型的名字；解析期已确认可解析。 */
    readonly ref?: string;
    /** external：该类型 TS 声明所在模块（相对生成物）。 */
    readonly from?: string;
    /** external：TS 里用的类型名（缺省 = `types` 表里的键）。 */
    readonly tsType?: string;
    /** 允许 `null`：wire 上 `null` 直接短路（⛔ 不参与其它约束）。 */
    readonly nullable?: boolean;
    /** 该节点的值由这个具名校验器产出（取代按种类逐字段解析）。 */
    readonly check?: ProtocolCheckRef;
    /** 该节点解析完成后必须通过的不变量（按声明序调用，`(value, path)`）。 */
    readonly assert?: readonly ProtocolCheckRef[];
}

/** object 的一个字段：名字 + 可选性 + 只读修饰 + 类型。 */
export interface ProtocolSchemaField {
    readonly name: string;
    readonly required: boolean;
    /** 生成的 TS 属性带 `readonly`（数组 / record 同时带上只读修饰）。 */
    readonly readonly: boolean;
    readonly type: ProtocolSchemaType;
}

/** 一条 API 声明（= 一条路由 + 它的请求/响应契约 + 落点元数据）。 */
export interface ProtocolSchemaApi {
    /** 生成 `Req<Name>` / `Res<Name>` / `Action<Name>`。 */
    readonly name: string;
    /** 外部字符串路由。 */
    readonly route: string;
    readonly serviceType: string;
    readonly mode: ProtocolRouteMode;
    /** Action 骨架与模块所有权落点（`src/modules/<ownerModule>/action/Action<Name>.ts`）。 */
    readonly ownerModule: string;
    readonly contractVersion: number;
    readonly request: ProtocolSchemaType;
    readonly response: ProtocolSchemaType;
    /** idempotent-write：所属 operation group。 */
    readonly operationGroup?: string;
    /** idempotent-write：是否允许通用 operation 查询。 */
    readonly inspectable?: boolean;
    /** query：可查询哪个 operation group 的操作状态。 */
    readonly inspectsOperationGroup?: string;
}

/** 一条推送声明。 */
export interface ProtocolSchemaPush {
    /** 聚合 `LobbyPush` 常量的成员名。 */
    readonly key: string;
    /** 推送消息名。 */
    readonly type: string;
    readonly data: ProtocolSchemaType;
}

/** 域声明（`C2S/<域>.json` / `S2S/<域>.json`）的规范化结果。 */
export interface ProtocolDomainDeclaration {
    readonly kind: "domain";
    /** 来源标识（相对仓库根的路径）；只用于报错与生成物抬头，⛔ 不参与 wire。 */
    readonly source: string;
    readonly domain: string;
    readonly contractVersion: number;
    readonly errorCodes: readonly string[];
    readonly ownsOperationGroups: readonly string[];
    readonly exposesOperationGroupTo: { readonly [group: string]: readonly string[] };
    readonly pushes: readonly ProtocolSchemaPush[];
    readonly apis: readonly ProtocolSchemaApi[];
    readonly types: ReadonlyMap<string, ProtocolSchemaType>;
}

/** 纯类型表声明（`common/types.json`）的规范化结果。 */
export interface ProtocolTypesDeclaration {
    readonly kind: "types";
    readonly source: string;
    readonly types: ReadonlyMap<string, ProtocolSchemaType>;
}

export type ProtocolSchemaDocument = ProtocolDomainDeclaration | ProtocolTypesDeclaration;

/** 一种字段种类的语言规则。 */
export interface ProtocolFieldKindRule {
    /** 该种类接受的**约束键**（不含 `kind` 本身）。 */
    readonly constraints: readonly string[];
    /** 该种类必须出现的约束键。 */
    readonly requires: readonly string[];
}

/** 一种声明形态的语言规则。 */
export interface ProtocolDeclarationRule {
    readonly keys: readonly string[];
    readonly required: readonly string[];
    /** 判定该形态的特征键（出现即命中）。 */
    readonly discriminator: string;
    /**
     * 判定优先级（小的胜）。存在是因为「域声明可以带 `types`」而「纯类型表只有 `types`」：
     * 两个判定键会同时命中，必须由语言文件显式给出胜者，⛔ 不在解析器里写死先后。
     */
    readonly priority: number;
}

/** 语言限制（防止病态 schema 把校验器撑爆）。 */
export interface ProtocolLanguageLimits {
    readonly maxNestingDepth: number;
    readonly maxFieldsPerObject: number;
    readonly maxArrayItems: number;
    readonly maxStringLength: number;
    readonly maxApisPerDomain: number;
    readonly maxTypesPerFile: number;
    readonly maxPushesPerDomain: number;
    readonly maxErrorCodesPerDomain: number;
}

/** 语言缺省值（声明里省键时取这里的值，⛔ 不散落在解析器里）。 */
export interface ProtocolLanguageDefaults {
    readonly contractVersion: number;
    readonly required: boolean;
    readonly errorCodes: readonly string[];
    readonly ownsOperationGroups: readonly string[];
    readonly exposesOperationGroupTo: { readonly [group: string]: readonly string[] };
}

/** `schema-v1.json` 的规范化结果。 */
export interface ProtocolLanguage {
    readonly schemaVersion: number;
    readonly identifierPattern: string;
    readonly routePattern: string;
    readonly errorCodePattern: string;
    readonly modes: readonly string[];
    readonly serviceTypes: readonly string[];
    readonly fieldKinds: { readonly [kind: string]: ProtocolFieldKindRule };
    readonly fieldKeys: readonly string[];
    readonly typeExprKeys: readonly string[];
    readonly declarations: { readonly [name: string]: ProtocolDeclarationRule };
    readonly apiKeys: readonly string[];
    readonly apiRequired: readonly string[];
    readonly pushKeys: readonly string[];
    readonly pushRequired: readonly string[];
    readonly defaults: ProtocolLanguageDefaults;
    readonly limits: ProtocolLanguageLimits;
}
