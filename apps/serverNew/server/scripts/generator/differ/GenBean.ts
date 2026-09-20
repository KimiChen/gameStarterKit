import { RecProject } from './record/RecProject'
import fs from 'fs'
import { SourceFileFingerprint } from './SourceFileFingerprint'
import { RecBean } from './record/RecBean'
import { DifferType } from './DifferType'
import { writeFileEnsuringParentDirectory } from '../util/writeFileEnsuringParentDirectory'
import path from 'path'
import { relativeImport } from '../GenerationPaths'

/** 用于生成bean类代码，mod-infos，protocols/mod.ts 等 */
export class GenBean {
    changedBeans: RecBean[] = []

    oldFiles!: Set<string>

    constructor(public project: RecProject) {
        this.oldFiles = new Set<string>(project.beans.keys())
    }

    async gen() {
        for (const source of this.project.paths.discoverBeanSources()) {
            const fi = new SourceFileFingerprint(path.dirname(source.filePath), source.fileName)
            const recordKey = this.project.beanRecordKey(source.logicalPath, source.fileName)
            const isNewRecord = !this.project.beans.has(recordKey)
            const [record, modified] = this.project.modifiedByKey(
                fi,
                this.project.beans,
                recordKey,
                () => new RecBean(),
            )
            this.oldFiles.delete(recordKey)
            const missingOutput = !this.beanOutputsExist(record)
            if (!modified && !record.needsCompileMetadataRefresh() && !missingOutput) continue
            const previousRelativePath = record.relativePath
            record.init(this.project, fi, path.posix.dirname(source.logicalPath))
            if (!record.baseClass || record.diffType === DifferType.Invalid) {
                if (isNewRecord) this.project.beans.delete(recordKey)
                continue
            }
            if (previousRelativePath && previousRelativePath !== record.relativePath) {
                this.removeBeanOutputs(previousRelativePath)
            }
            this.changedBeans.push(record)
            await record.generate()
            if (modified) {
                this.project.beanChanged('mod' + record.relativePath + '/' + fi.fileNameOnly())
            }
        }
        for (const oldName of this.oldFiles) {
            const bean = this.project.beans.get(oldName)!
            if (!bean.deleted) {
                bean.deleted = true
                if (bean.mods) {
                    for (const name of bean.mods.keys()) {
                        this.project.mods.delete(name)
                    }
                    this.project.modChanged = true
                } else {
                    this.project.beanChanged(bean.relativePath)
                }
            }
        }
    }

    private beanOutputsExist(record: RecBean) {
        if (!record.relativePath || record.deleted) return false
        return fs.existsSync(this.project.paths.serverBeanFile(record.relativePath))
    }

    private removeBeanOutputs(relativePath: string) {
        const filePath = this.project.paths.serverBeanFile(relativePath)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }

    genC2SBeans() {
        this.genC2SMod()
        //生成有变更的bean
        for (const bean of this.changedBeans) {
            this.genC2SBean(bean)
        }
    }

    genC2SBean(bean: RecBean) {
        const filePath = this.project.paths.serverBeanFile(bean.relativePath)
        if (bean.deleted) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
            return
        }
        console.log(`正在生成文件: ${filePath}`)
        // 先构造import
        let str = ''
        const imports = new Set<string>()
        const relativePath = Array(bean.relativePath.split('/').length - 2)
            .fill('..')
            .join('/')
        for (const prop of bean.propsExist) {
            const importPath = prop.typeImport
            if (!importPath) continue
            if (!imports.has(importPath)) {
                imports.add(importPath)
                str += `
            import { ${importPath.substring(importPath.lastIndexOf('/') + 1)} } from '${relativePath}${importPath}'`
            }
        }

        str += `
        
            export interface ${bean.className} {`
        for (const val of bean.propsExist) {
            if (val.isMod()) continue
            str += `
                ${val.commentWrapped}
                ${val.name}${val.hasQuestionToken ? '?' : ''}: ${val.protocolType()}`
        }
        str += '}'

        writeFileEnsuringParentDirectory(filePath, str)
        this.project.toFormatFiles.push(filePath)
    }

    genC2SMod() {
        // Mod 元数据导入真实 Bean 源文件；源码只移动不改内容时也必须刷新物理 import。
        this.genModInfos()
        const outputsMissing = !fs.existsSync(this.project.paths.serverBeanFile('/Mod/Mod'))
        if (!this.project.modChanged && !outputsMissing) {
            return
        }
        this.genProtocolMod()
    }

    genProtocolMod() {
        const mods = [...this.project.mods].sort(([, left], [, right]) => left.id - right.id)
        const filePath = this.project.paths.serverBeanFile('/Mod/Mod')
        console.log(`正在生成文件: ${filePath}`)
        // 先构造import
        let str = ''
        const imports = new Set<string>()
        for (const [key, mod] of mods) {
            const importPath = mod.subModType ? mod.subImportPath : mod.importPath
            if (importPath && !imports.has(importPath)) {
                imports.add(importPath)
                const importTarget = mod.subModType ? mod.subModType : mod.type
                str += `import { ${importTarget} } from '.${importPath}'\n`
            }
        }
        str += 'export '

        str += `interface Mod {
            versions?: Map<string, int>
`

        for (const [key, mod] of mods) {
            str += `
                ${mod.name}?: ${mod.getProtocolType()}`
        }
        str += '}'

        writeFileEnsuringParentDirectory(filePath, str)
        this.project.toFormatFiles.push(filePath)
    }

    genModInfos() {
        const mods = [...this.project.mods].sort(([, left], [, right]) => left.id - right.id)
        const modInfoPath = this.project.paths.modInfoFile
        console.log(`正在生成文件: ${modInfoPath}`)
        // 先构造import
        let modStr = "import {GenModInfo} from '@arthropoda/game-engine'"
        const imports = new Set<string>()
        for (const [key, mod] of mods) {
            if (!imports.has(mod.importPath)) {
                imports.add(mod.importPath)
                const bean = [...this.project.beans.values()].find(
                    (item) => !item.deleted && item.className === mod.type && item.relativePath === mod.importPath,
                )
                const sourceFile = bean && this.project.beanSourceFile(bean)
                if (!sourceFile) throw new Error(`找不到 Mod ${mod.name} 的 Bean 源文件: ${mod.importPath}`)
                modStr += `
            import { ${mod.type} } from '${relativeImport(modInfoPath, sourceFile)}'`
            }
        }

        modStr += `
        export const modInfos: { [key: string]: GenModInfo } = {`
        for (const [key, mod] of mods) {
            modStr +=
                `
                ${mod.name}: { type:${mod.type}` + (mod.subModType ? `, subMod: '${mod.name}' },` : '},')
        }
        modStr = modStr.slice(0, -1)
        modStr += '}'

        writeFileEnsuringParentDirectory(modInfoPath, modStr)
        this.project.toFormatFiles.push(modInfoPath)
    }
}
