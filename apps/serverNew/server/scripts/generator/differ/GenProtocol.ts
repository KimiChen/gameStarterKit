import { RecProject } from './record/RecProject'
import fs from 'fs'
import { SourceFileFingerprint } from './SourceFileFingerprint'
import { RecProtocolGroup } from './record/RecProtocolGroup'
import { GenProtoJson } from './GenProtoJson'
import { BeanStructureCatalogWriter } from './BeanStructureCatalogWriter'
import { RecApi } from './record/RecApi'
import { RecProtocolFile } from './record/RecProtocolFile'
import path from 'path'
import { ProtocolDirection, relativeImport } from '../GenerationPaths'
import { writeFileEnsuringParentDirectory } from '../util/writeFileEnsuringParentDirectory'
import { readSchemaLobbyApis, resolveSchemaTypeModule, type SchemaLobbyApi } from '../SchemaLobbyProtocol'

/** 用于生成协议类代码 */
export class GenProtocol {
    constructor(public project: RecProject) {}

    async gen() {
        if (!this.project.protocols) {
            this.project.protocols = new Map()
        }
        for (const direction of ['C2S', 'S2S'] as const) {
            const legacyActionRegistry = this.project.paths.legacyActionRegistryFile(direction)
            if (fs.existsSync(legacyActionRegistry)) {
                fs.rmSync(legacyActionRegistry)
                console.log('删除旧 Action 汇总:' + legacyActionRegistry)
            }
            let group = this.project.protocols.get(direction)
            if (!group) {
                group = new RecProtocolGroup()
                this.project.protocols.set(direction, group)
            }
            group.name = direction
            group.oldFiles = new Set<string>(group.protocols.keys())
            await this.traverseProtocols(direction, group)
            for (const oldName of group.oldFiles) {
                const file = group.protocols.get(oldName)!
                if (!file.deleted) {
                    file.deleted = true
                    group.changed = true
                }
            }

            // 只按「仍有消费者的产物」判定是否需要重生成：PB 产物（pb.js / 客户端 typings）
            // 已随 P6 删除，因此这里不再看它们的指纹（那会永远判定为「需要重生成」）。
            const requiredOutputs = [
                this.project.paths.serviceProtoFile(direction),
                this.project.paths.actionRegistryFile(direction),
            ]
            // Schema-owned Lobby routes are not represented by a legacy protocol source file.
            // Keep serviceProto fresh whenever the schema has a route; the generated Actions
            // registry is refreshed below on every run as well.
            if (direction === 'C2S' && readSchemaLobbyApis(this.project.projectPath).length > 0) {
                group.changed = true
            }
            if (requiredOutputs.some((file) => !fs.existsSync(file))) group.changed = true
            if (group.changed) {
                this.genServiceProtoTS(group)
                if (group.name === 'C2S') {
                    GenProtoJson.makeJson(this.project)
                    await BeanStructureCatalogWriter.write(this.project)
                }
            }
            this.genActionsTS(group)
        }
    }

    genServiceProtoTS(group: RecProtocolGroup) {
        const direction = group.name as ProtocolDirection
        const fileName = this.project.paths.serviceProtoFile(direction)
        const schemaApis = direction === 'C2S' ? readSchemaLobbyApis(this.project.projectPath) : []
        let src = `import { ServiceProto } from '@arthropoda/game-engine'
        `

        for (const value of group.protocols.values()) {
            if (value.deleted) continue
            const imports = []
            for (const val of value.apis.values()) {
                if (val.req.deleted) continue
                imports.push(val.req.name)
                if (val.res) imports.push(val.res.name)
            }

            for (const val of value.pushs.values()) {
                if (val.deleted) continue
                imports.push(val.name)
            }

            const sourceFile = this.project.protocolSourceFile(group.name, value)
            if (!sourceFile) throw new Error(`找不到 ${group.name}${value.relativePath} 的协议源文件`)
            src += `import {${imports.join(',')}} from '${relativeImport(fileName, sourceFile)}'
            `
        }
        src += this.schemaTypeImports(fileName, schemaApis)
        src += `
        export interface ServiceType {
    api: {
        `
        for (const value of group.protocols.values()) {
            if (value.deleted) continue
            for (const [name, api] of value.apis) {
                if (api.req.deleted) continue
                src += `'${value.relativePath.substring(1)}/${name}': {
                    req: Req${name}
                    res: Res${api.res ? name : 'Default'}
                }
                `
            }
        }
        for (const api of schemaApis) {
            src += `'${api.route}': {
                    req: ${api.requestType}
                    res: ${api.responseType}
                }
                `
        }
        src += `}
        push: {
        `
        for (const value of group.protocols.values()) {
            if (value.deleted) continue
            for (const [name, msg] of value.pushs) {
                if (msg.deleted) continue
                src += `'${value.relativePath.substring(1)}/${msg.name}': ${msg.name}
                `
            }
        }
        src += `}
        }`
        src += `export const serviceProto: ServiceProto = {
            version: ${group.version},
            protocols: [
        `
        // 只产出字符串路由与分组元数据：数字协议号、PB schema id 与 `types` 内联 schema
        // 都已随 P6 删除，⛔ 不要为了「兼容旧客户端」把它们加回来。
        for (const value of group.protocols.values()) {
            if (value.deleted) continue
            for (const [name, api] of value.apis) {
                if (api.req.deleted) continue
                src += `{
                    name: '${value.relativePath.substring(1)}/${name}',
                    type: 'api',
                    serviceType:'${api.serviceType}',
                },
                `
            }
        }
        for (const api of schemaApis) {
            src += `{
                    name: '${api.route}',
                    type: 'api',
                    serviceType:'${api.serviceType}',
                },
                `
        }
        for (const value of group.protocols.values()) {
            if (value.deleted) continue
            for (const [name, msg] of value.pushs) {
                if (msg.deleted) continue
                src += `{
                    name: '${value.relativePath.substring(1)}/Push${name}',
                    type: 'push',
                },
                `
            }
        }
        src += `    ],
        }
        `
        writeFileEnsuringParentDirectory(fileName, src)
        console.log('保存serviceProto:' + fileName)
        this.project.toFormatFiles.push(fileName)
    }

    genActionsTS(group: RecProtocolGroup) {
        const direction = group.name as ProtocolDirection
        const fileName = this.project.paths.actionRegistryFile(direction)
        let imports = ''
        let src = `
        export const Actions = {
    `
        const types: { [key: string]: RecApi[] } = {}
        for (const protocol of group.protocols.values()) {
            if (protocol.deleted) continue
            for (const [name, api] of protocol.apis) {
                if (api.req.deleted) continue
                const packageName = protocol.relativePath.substring(1)
                const actionName = `Action${name}`
                const actionSource = this.project.paths.actionSourceFile(direction, packageName, actionName)
                if (!fs.existsSync(actionSource)) {
                    throw new Error(`找不到 ${api.req.package}${name} 对应的 Action: ${actionSource}`)
                }
                imports += `import { ${actionName} } from '${relativeImport(fileName, actionSource)}'
                `
                src += `'${api.req.package}${name}' : ${actionName},
                `
            }
        }
        if (direction === 'C2S') {
            const schemaApis = readSchemaLobbyApis(this.project.projectPath)
            for (const api of schemaApis) {
                // pending = 归属另一条产品线（MMO）。本项目只出 wire 元数据，⛔ 不造 Action、
                // 不进 Actions 注册表；判定与启动期闸共用 NativeLobbyPendingRoutes 同一份表。
                if (api.pending) continue
                const actionName = `Action${api.name}`
                const actionSource = this.project.paths.actionSourceFile(direction, api.ownerModule, actionName)
                if (!fs.existsSync(actionSource)) this.generateSchemaAction(api, actionName)
                const resolvedSource = this.project.paths.actionSourceFile(direction, api.ownerModule, actionName)
                if (!fs.existsSync(resolvedSource)) {
                    throw new Error(`找不到 schema API ${api.route} 对应的 Action: ${resolvedSource}`)
                }
                imports += `import { ${actionName} } from '${relativeImport(fileName, resolvedSource)}'
                `
                src += `'${api.route}' : ${actionName},
                `
            }
        }
        src = imports + src
        src += `
        }`
        writeFileEnsuringParentDirectory(fileName, src)
        console.log('保存文件:' + fileName)
        this.project.toFormatFiles.push(fileName)
    }

    /**
     * schema 声明的 wire 类型 import。
     *
     * 必须**按模块去重、按名字去重**：多条路由可以共用同一个响应类型
     * （`mail.claimAttach` 与 `shop.purchase` 都是 `IPurchaseResult`），而 schema 允许类型
     * 落在域文件之外的模块（`requestTypeModule` / `responseTypeModule`）。逐条 emit 会产生
     * 重复 import，进而让 `serviceProto.ts` 整份编译失败。
     */
    private schemaTypeImports(fileName: string, schemaApis: readonly SchemaLobbyApi[]): string {
        const byModule = new Map<string, Set<string>>()
        for (const api of schemaApis) {
            for (const [type, module] of [
                [api.requestType, api.requestTypeModule],
                [api.responseType, api.responseTypeModule],
            ] as const) {
                const target = resolveSchemaTypeModule(this.project.projectPath, api, module)
                const names = byModule.get(target) ?? new Set<string>()
                names.add(type)
                byModule.set(target, names)
            }
        }
        let src = ''
        for (const [target, names] of [...byModule.entries()].sort(([left], [right]) => left.localeCompare(right))) {
            src += `import type { ${[...names].sort().join(', ')} } from '${relativeImport(fileName, target)}'
            `
        }
        return src
    }

    private generateSchemaAction(api: SchemaLobbyApi, actionName: string): void {
        const fileName = this.project.paths.actionTargetFile('C2S', api.ownerModule, actionName)
        const requestModule = relativeImport(
            fileName,
            resolveSchemaTypeModule(this.project.projectPath, api, api.requestTypeModule),
        )
        const responseModule = relativeImport(
            fileName,
            resolveSchemaTypeModule(this.project.projectPath, api, api.responseTypeModule),
        )
        const imports = [`import { GameAction } from '../../../runtime/action/GameAction'`]
        if (requestModule === responseModule) {
            imports.push(`import type { ${api.requestType}, ${api.responseType} } from '${requestModule}'`)
        } else {
            imports.push(`import type { ${api.requestType} } from '${requestModule}'`)
            imports.push(`import type { ${api.responseType} } from '${responseModule}'`)
        }
        const src = `${imports.join('\n')}

/** AUTO-GENERATED skeleton. Implement the schema-owned business Action. */
export class ${actionName} extends GameAction {
    async doAction(_req: ${api.requestType}, _res: ${api.responseType}) {
        return
    }
}
`
        writeFileEnsuringParentDirectory(fileName, src)
        console.log('保存 schema Action 骨架:' + fileName)
        this.project.toFormatFiles.push(fileName)
    }

    async traverseProtocols(direction: ProtocolDirection, group: RecProtocolGroup) {
        for (const source of this.project.paths.discoverProtocolSources(direction)) {
            const fi = new SourceFileFingerprint(path.dirname(source.filePath), source.fileName)
            const recordKey = this.project.protocolRecordKey(group, source)
            const [record, modified] = this.project.modifiedByKey(
                fi,
                group.protocols,
                recordKey,
                () => new RecProtocolFile(),
            )
            group.oldFiles.delete(recordKey)
            if (!modified) continue
            record.init(this.project, fi, source.packageName, group)
            this.project.markChanged(group, source.packageName + '/')
        }
    }
}
