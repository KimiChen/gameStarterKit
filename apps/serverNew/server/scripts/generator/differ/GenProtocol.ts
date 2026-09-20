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
        src = imports + src
        src += `
        }`
        writeFileEnsuringParentDirectory(fileName, src)
        console.log('保存文件:' + fileName)
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
