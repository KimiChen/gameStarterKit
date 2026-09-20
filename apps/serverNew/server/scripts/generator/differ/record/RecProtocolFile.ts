import { RecFile } from './RecFile'
import { RecProject } from './RecProject'
import { SourceFileFingerprint } from '../SourceFileFingerprint'
import { InterfaceDeclaration } from 'ts-morph'
import { RecApi } from './RecApi'
import { RecMsg } from './RecMsg'
import { RecProtocolGroup } from './RecProtocolGroup'
import { RecordField, RecordFieldType } from '../../util/RecordGen'
import path from 'path'
import fs from 'fs'
import console from 'console'
import { RecProperty } from './RecProperty'
import { writeFileEnsuringParentDirectory } from '../../util/writeFileEnsuringParentDirectory'
import { relativeImport } from '../../GenerationPaths'

export class RecProtocolFile extends RecFile {
    @RecordField(RecApi, RecordFieldType.map)
    apis: Map<string, RecApi> = new Map()

    @RecordField(RecMsg, RecordFieldType.map)
    pushs: Map<string, RecMsg> = new Map()

    @RecordField(RecMsg, RecordFieldType.map)
    msgs: Map<string, RecMsg> = new Map()

    group!: RecProtocolGroup

    oldMsgs!: { apis: Set<string>; pushs: Set<string>; msgs: Set<string> }

    init(project: RecProject, fileInfo: SourceFileFingerprint, packageName: string, group: RecProtocolGroup) {
        super.initFile(project, fileInfo, '')
        this.relativePath = '/' + packageName
        this.name = packageName
        this.group = group
        this.oldMsgs = {
            apis: new Set(this.apis.keys()),
            pushs: new Set(this.pushs.keys()),
            msgs: new Set(this.msgs.keys()),
        }
        const iters = this.sourceFile.getInterfaces()
        for (const iter of iters) {
            this.initInterface(iter)
        }
        for (const name of this.oldMsgs.apis) {
            if (this.apis.get(name)!.haveRes) {
                throw new Error('--- 警告：协议有Res' + name + '，却没有对应的Req' + name)
            }
            this.apis.get(name)!.req.deleted = true
        }
        for (const name of this.oldMsgs.pushs) {
            this.pushs.get(name)!.deleted = true
        }
        for (const name of this.oldMsgs.msgs) {
            this.msgs.get(name)!.deleted = true
        }
        for (const [name, api] of this.apis.entries()) {
            if (api.req.deleted) continue
            this.genActionClass(api)
        }
    }

    initInterface(iter: InterfaceDeclaration) {
        const iterName = iter.getName()
        let msgName = ''
        let msg: RecMsg
        if (iterName.startsWith('Req')) {
            msgName = iterName.replace('Req', '')
            let api = this.apis.get(msgName)
            if (!api) {
                this.apis.set(msgName, (api = new RecApi()))
                // 旧数字协议号不再分配（PB 通道已删除）；`version` 仍随协议表推进，作为 serviceProto 版本号。
                this.group.version++
            } else {
                this.oldMsgs.apis.delete(msgName)
                if (!api.haveRes) {
                    delete api.res
                }
            }
            msg = api.req
            const extend = iter.getExtends()
            if (extend.length > 0) {
                api.serviceType = extend[0].getTypeArguments()[0].getText().replaceAll("'", '')
            }
            if (api.serviceType == '') {
                throw new Error(`${iterName}没有定义继承ServiceType`)
            }
        } else if (iterName.startsWith('Res')) {
            msgName = iterName.replace('Res', '')
            let api = this.apis.get(msgName)
            if (!api) {
                this.apis.set(msgName, (api = new RecApi()))
                api.res = msg = new RecMsg()
                this.oldMsgs.apis.add(msgName)
            } else {
                msg = api.res ?? (api.res = new RecMsg())
            }
            api.haveRes = true
        } else if (iterName.startsWith('Push')) {
            msgName = iterName.replace('Push', '')
            msg = this.pushs.get(msgName)!
            if (!msg) {
                this.pushs.set(msgName, (msg = new RecMsg()))
                // 旧数字协议号不再分配（PB 通道已删除）；`version` 仍随协议表推进，作为 serviceProto 版本号。
                this.group.version++
            } else {
                this.oldMsgs.pushs.delete(msgName)
            }
        } else {
            msg = this.msgs.get(iterName)!
            if (!msg) {
                this.msgs.set(iterName, (msg = new RecMsg()))
            } else {
                this.oldMsgs.msgs.delete(iterName)
            }
        }
        if (msg.deleted) msg.deleted = false
        msg.package = this.relativePath.substring(1) + '/'
        msg!.init(this, iter, this.group.name + '/')
    }

    genActionClass(api: RecApi) {
        const direction = this.group.name as 'C2S' | 'S2S'
        const actionName = `Action${api.req.name.substring(3)}`
        if (fs.existsSync(this.project.paths.actionSourceFile(direction, this.name, actionName))) {
            return
        }
        const fileName = this.project.paths.actionTargetFile(direction, this.name, actionName)

        const actionBaseFile = path.join(this.project.projectPath, 'src', 'action', `Action${api.serviceType}.ts`)
        let src = `import { ${api.req.name}${api.res ? ', ' + api.res!.name : ''} } from '${relativeImport(fileName, this.fileInfo.path)}';
            import { Action${api.serviceType}} from '${relativeImport(fileName, actionBaseFile)}'
            `
        if (!api.res) {
            const defaultProtocol = this.project.paths
                .discoverProtocolSources('C2S')
                .find((source) => source.packageName === 'default')
            if (!defaultProtocol) throw new Error('找不到 C2S/default 协议源文件')
            src += `import { ResDefault } from '${relativeImport(fileName, defaultProtocol.filePath)}'`
        }
        src += `
            ${api.req.commentWrapped}
            export class Action${api.req.name.substring(3)} extends Action${api.serviceType} {
                async doAction(req: ${api.req.name}, res: ${api.res ? api.res.name : 'ResDefault'}) {
                    return
                }
            }
        `
        writeFileEnsuringParentDirectory(fileName, src)
        console.log('保存文件:' + fileName)
        this.project.toFormatFiles.push(fileName)
    }

    types(justRoute = false) {
        const rs: RecMsg[] = []
        for (const val of this.apis.values()) {
            if (val.req.deleted) continue
            rs.push(val.req)
            if (val.res && !justRoute) rs.push(val.res)
        }
        for (const val of this.pushs.values()) {
            if (val.deleted) continue
            rs.push(val)
        }

        rs.push(...this.pushs.values())
        return rs
    }
}
