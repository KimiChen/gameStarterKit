import { RecBean } from './RecBean'
import { RecordGen, RecordField, RecordFieldType } from '../../util/RecordGen'
import { Project } from 'ts-morph'
import fs from 'fs'
import { SourceFileFingerprint } from '../SourceFileFingerprint'
import { DifferType } from '../DifferType'
import { execFileSync } from 'child_process'
import { RecMod } from './RecMod'
import { RecProtocolGroup } from './RecProtocolGroup'
import { RecFile } from './RecFile'
import { RecProtocolFile } from './RecProtocolFile'
import { RecApi } from './RecApi'
import { IMsgType } from './IMsgType'
import { RecProperty } from './RecProperty'
import { GenProtoJson } from '../GenProtoJson'
import { GenProtocol } from '../GenProtocol'
import { GenBean } from '../GenBean'
import { RecordSet } from '../../util/RecordSet'
import { GenerationPaths, ProtocolSourceFile } from '../../GenerationPaths'
import path from 'path'

export class RecProject extends RecordGen {
    /**
     * 版本号1,默认给version字段占用
     */
    @RecordField()
    modVersion = 2

    @RecordField(RecBean, RecordFieldType.map)
    beans!: Map<string, RecBean>

    @RecordField(RecProtocolGroup, RecordFieldType.map)
    protocols: Map<string, RecProtocolGroup> = new Map<string, RecProtocolGroup>()

    project: Project = new Project()

    genAll = false

    projectPath!: string

    paths!: GenerationPaths

    recordPath!: string

    toFormatFiles: string[] = []

    mods = new Map<string, RecMod>()

    _modChanged = false

    genBean!: GenBean

    genProtocol!: GenProtocol

    static instance: RecProject = new RecProject()

    get modChanged() {
        return this._modChanged
    }

    set modChanged(modChanged: boolean) {
        this._modChanged = modChanged
        this.beanChanged('mod/Mod/Mod')
    }

    beanChanged(protocolPath: string) {
        if (!this.protocols.has('C2S')) {
            return
        }
        this.markChanged(this.protocols.get('C2S')!, protocolPath)
    }

    init(projectPath: string, genAll = false) {
        this.projectPath = projectPath
        this.paths = new GenerationPaths(projectPath)
        this.genAll = genAll
        this.recordPath = this.paths.recordFile
        this.beans = new Map()

        if (!fs.existsSync(this.recordPath)) {
            throw new Error(
                `正式兼容记录不存在: ${this.recordPath}。请从 Git 恢复 generated/records/record.json，禁止创建空记录重新分配 Bean 或协议 ID。`,
            )
        }
        const content = fs.readFileSync(this.recordPath, 'utf8')
        if (content !== '') {
            this.toRecord(JSON.parse(content))
            this.mods = new Map()
            for (const bean of this.beans.values()) {
                if (bean.deleted) {
                    continue
                }
                bean.mods?.forEach((val, key) => {
                    if (!val.deleted) this.mods.set(key, val)
                })
            }
        }
        this.genBean = new GenBean(this)
        this.genProtocol = new GenProtocol(this)
        return this
    }

    /** 标记这次生成过程中分组有信息被改变 */
    public markChanged(group: RecProtocolGroup, byPath: string) {
        group.changed = true
        //检查有没被其他协议分组引用，有的话也要重新生成代码
        for (const otherGroup of this.protocols.values()) {
            if (otherGroup === group) continue
            if (otherGroup.changed) continue
            for (const [groupName, paths] of otherGroup.refs.entries()) {
                if (group.name === groupName) {
                    for (const path of paths.values()) {
                        if (path.startsWith(byPath)) {
                            otherGroup.changed = true
                            break
                        }
                    }
                }
            }
        }
    }

    /** 获取记录及其是否变更 */
    public modified<T extends RecFile>(
        fi: SourceFileFingerprint,
        records: Map<string, RecFile>,
        newer: () => T,
    ): [T, boolean] {
        return this.modifiedByKey(fi, records, fi.fileName, newer)
    }

    public modifiedByKey<T extends RecFile>(
        fi: SourceFileFingerprint,
        records: Map<string, RecFile>,
        recordKey: string,
        newer: () => T,
    ): [T, boolean] {
        let record = records.get(recordKey)
        const sourcePath = path.relative(this.projectPath, fi.path).replace(/\\/g, '/')
        if (!record) {
            records.set(recordKey, (record = newer()))
            record.md5 = fi.md5()
            record.mtime = fi.mtime()
            record.sourcePath = sourcePath
            return [record as T, true]
        }
        if (record.deleted) record.deleted = false
        if (this.genAll) {
            record.sourcePath = sourcePath
            return [record as T, true]
        }
        if (record.sourcePath !== sourcePath) {
            record.sourcePath = sourcePath
            record.mtime = fi.mtime()
            record.md5 = fi.md5()
            return [record as T, true]
        }
        if (record.mtime === fi.mtime() || record.md5 === fi.md5()) {
            return [record as T, false]
        }
        record.mtime = fi.mtime()
        record.md5 = fi.md5()
        return [record as T, true]
    }

    saveRecord() {
        const content = this.toJson()
        fs.writeFileSync(this.recordPath, content)
        console.log('保存记录成功：' + this.recordPath)
    }

    formatCode() {
        if (this.toFormatFiles.length === 0) {
            return
        }
        execFileSync('npx', ['prettier', '--ignore-path', '/dev/null', '--write', ...this.toFormatFiles], {
            stdio: 'inherit',
        })
    }

    getMsgTypes(groupName: string) {
        const group = this.protocols.get(groupName)!
        if (group.tmpTypes.size > 0) {
            return Array.from(group.tmpTypes.values())
        }
        console.log(groupName, 'getMsgTypes ------------------------')
        const types = group.tmpTypes
        for (const file of group.protocols.values()) {
            if (file.deleted) continue
            for (const api of file.apis.values()) {
                if (api.req.deleted) continue
                types.set(api.req.name, api.req)
                if (api.res) types.set(api.res.name, api.res)
            }
            for (const val of file.pushs.values()) {
                if (val.deleted) continue
                types.set(val.name, val)
            }
            for (const val of file.msgs.values()) {
                if (val.deleted) continue
                types.set(val.name, val)
            }
        }
        const refTypes: Record<string, {}> = {}
        //遍历一遍，有可能有多次引用的情况
        for (const [key, val] of group.refs.entries()) {
            for (const path of val.values()) {
                this.addRefTypes(group.refs, types, key, path)
            }
        }
        if (groupName === 'C2S') {
            for (const bean of this.beans.values()) {
                //不是mod对应的bean
                if (bean.name === undefined || bean.deleted) continue
                types.set(bean.name, bean)
            }
            this.addModType(types)
        }
        return Array.from(types.values())
    }

    private addModType(types: Map<string, IMsgType>) {
        const modType: IMsgType = {
            name: 'Mod',
            version: this.modVersion,
            comment: '',
            package: 'mod/Mod/',
            properties: new Map<string, RecProperty>(),
            get propsExist() {
                return RecBean.getPropsExist(modType.properties)
            },
        }
        const propVersions = new RecProperty()
        propVersions.id = 1
        propVersions.name = 'versions'
        propVersions.type = 'Map'
        propVersions.collectionTypes = ['string', 'int']
        modType.properties.set('versions', propVersions)
        for (const [key, mod] of this.mods) {
            const prop = new RecProperty()
            prop.id = mod.id
            prop.name = mod.name
            if (mod.isMap) {
                prop.type = 'Map'
                prop.collectionTypes = [mod.mapKeyType!, mod.subModType ?? mod.type]
            } else {
                prop.type = mod.subModType ?? mod.type
            }
            prop.typeImport = mod.subImportPath ?? mod.importPath
            // prop.collectionTypes =
            modType.properties.set(prop.name, prop)
        }
        types.set(modType.name, modType)
    }

    private addRefTypes(
        refs: Map<string, RecordSet<string>>,
        types: Map<string, IMsgType>,
        group: string,
        path: string,
    ) {
        if (path.startsWith('mod/')) {
            const vals = path.split('/')
            const fileName = vals[vals.length - 2] + '.ts'
            const type = this.beans.get(fileName)!
            if (fileName === 'Mod.ts') {
                this.addModType(types)
                for (const [key, mod] of this.mods) {
                    const typeImport = mod.subImportPath?.length ? mod.subImportPath : mod.importPath
                    if (typeImport.length) {
                        //bean对应的协议接口要在前面加mod/
                        const propPath =
                            'mod/' + typeImport.substring(1) + '/' + (mod.subModType ? mod.subModType : mod.type)
                        if (!refs.get(group)!.has(propPath)) {
                            refs.get(group)!.add(propPath)
                            this.addRefTypes(refs, types, group, propPath)
                        }
                    }
                }
            } else {
                for (const [name, prop] of type.properties) {
                    if (!prop.deleted) {
                        if (prop.typeImport?.length) {
                            //bean对应的协议接口要在前面加mod/
                            const propPath = 'mod/' + prop.typeImport.substring(1) + '/' + prop.refType()
                            if (!refs.get(group)!.has(propPath)) {
                                refs.get(group)!.add(propPath)
                                this.addRefTypes(refs, types, group, propPath)
                            }
                        }
                    }
                }
                types.set(type.name, type)
            }
        } else {
            const vals = path.split('/')
            const type = this.protocols
                .get(group)!
                .protocols.get(vals[0] + '.ts')!
                .msgs.get(vals[1])!
            types.set(type.name, type)
            for (const [name, prop] of type.properties) {
                if (!prop.deleted) {
                    if (prop.typeImport?.length) {
                        const propPath = prop.typeImport.substring(1) + '/' + prop.type
                        if (!refs.get(group)!.has(propPath)) {
                            refs.get(group)!.add(propPath)
                            this.addRefTypes(refs, types, group, propPath)
                        }
                    }
                }
            }
        }
    }

    beanRecordKey(logicalPath: string, fileName: string) {
        for (const [key, record] of this.beans) {
            if (record.relativePath === logicalPath) return key
        }
        if (this.beans.has(fileName)) return fileName
        return logicalPath.replace(/^\//, '') + '.ts'
    }

    protocolRecordKey(group: RecProtocolGroup, source: ProtocolSourceFile) {
        const logicalPath = '/' + source.packageName
        for (const [key, record] of group.protocols) {
            if (record.relativePath === logicalPath) return key
        }
        const legacyKey = source.packageName + '.ts'
        if (group.protocols.has(legacyKey)) return legacyKey
        return legacyKey
    }

    beanSourceFile(record: RecBean) {
        return this.paths.discoverBeanSources().find((source) => source.logicalPath === record.relativePath)?.filePath
    }

    protocolSourceFile(groupName: string, record: RecProtocolFile) {
        return this.paths
            .discoverProtocolSources(groupName as 'C2S' | 'S2S')
            .find((source) => '/' + source.packageName === record.relativePath)?.filePath
    }
}
