/**
 * 协议声明语言 v1 的解析入口（BF1）。
 *
 * 用法（读文件由调用方负责，shared 里没有 fs）：
 *
 * ```ts
 * const language = parseProtocolLanguage(JSON.parse(readFileSync(schemaV1Path, "utf8")))
 * const common = parseProtocolSchema(JSON.parse(readFileSync(commonTypesPath, "utf8")), {
 *     language,
 *     source: "apps/shared/schema/protocols/common/types.json",
 * })
 * const income = parseProtocolSchema(JSON.parse(readFileSync(incomePath, "utf8")), {
 *     language,
 *     source: "apps/shared/schema/protocols/C2S/income.json",
 *     commonTypes: common,
 * })
 * ```
 *
 * ⚠ 两条位置约束（改位置前先读这里）：
 *  - **不放进 `../protocol/`**：`scripts/protocol-fingerprint.mjs` 对 `apps/shared/src/protocol`
 *    整棵树做字节指纹锁，构建期解析器放进去会让「改解析器」看起来像「改 wire 协议」，
 *    重钉 diff 变成噪声、锁就不锋利了。真正的协议变更仍会经生成物（`protocol/lobbyRpc/**`）触发重钉。
 *  - **不进 `../index.ts` 的桶导出**：它是生成期工具，进桶会跟着 `sync:shared` 的镜像被客户端
 *    代码拉进打包面。按子路径引用即可（`@game/shared/schema/index`）。
 */
export { ProtocolSchemaError } from "./guards";
export { parseProtocolLanguage } from "./language";
export { parseProtocolSchema, type ParseProtocolSchemaOptions } from "./parseProtocolSchema";
export type {
    ProtocolCheckRef,
    ProtocolDeclarationRule,
    ProtocolDomainDeclaration,
    ProtocolFieldKind,
    ProtocolFieldKindRule,
    ProtocolLanguage,
    ProtocolLanguageDefaults,
    ProtocolLanguageLimits,
    ProtocolRouteMode,
    ProtocolSchemaApi,
    ProtocolSchemaDocument,
    ProtocolSchemaField,
    ProtocolSchemaPush,
    ProtocolSchemaType,
    ProtocolTypesDeclaration,
} from "./types";
