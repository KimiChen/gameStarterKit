import fs from 'fs'
import path from 'path'

export type ProtocolDirection = 'C2S' | 'S2S'

export interface BeanSourceFile {
    filePath: string
    fileName: string
    logicalPath: string
}

export interface ProtocolSourceFile {
    direction: ProtocolDirection
    filePath: string
    fileName: string
    packageName: string
    moduleOwned: boolean
}

const TYPESCRIPT_FILE = /\.tsx?$/i

export class GenerationPaths {
    readonly generatedRoot: string
    readonly recordsRoot: string
    readonly adjustRoot: string
    readonly serverProtocolRoot: string
    readonly generatedBeanRoot: string
    readonly persistenceRoot: string
    readonly telemetryRoot: string

    constructor(readonly projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot)
        this.generatedRoot = path.join(this.projectRoot, 'generated')
        this.recordsRoot = path.join(this.generatedRoot, 'records')
        this.adjustRoot = path.join(this.generatedRoot, 'adjust')
        this.serverProtocolRoot = path.join(this.generatedRoot, 'protocol', 'server')
        this.generatedBeanRoot = path.join(this.generatedRoot, 'bean')
        this.persistenceRoot = path.join(this.generatedRoot, 'persistence')
        this.telemetryRoot = path.join(this.generatedRoot, 'telemetry')
    }

    get recordFile() {
        return path.join(this.recordsRoot, 'record.json')
    }

    get adjustDocumentFile() {
        return path.join(this.adjustRoot, 'change_document.json5')
    }

    get beanJsonFile() {
        return path.join(this.recordsRoot, 'bean.json5')
    }

    get protoJsonFile() {
        return path.join(this.recordsRoot, 'proto.json5')
    }

    get modInfoFile() {
        return path.join(this.generatedBeanRoot, 'mod-infos.ts')
    }

    get dbInfoFile() {
        return path.join(this.persistenceRoot, 'db-info.ts')
    }

    serverDirectionRoot(direction: ProtocolDirection) {
        return path.join(this.serverProtocolRoot, direction)
    }

    serviceProtoFile(direction: ProtocolDirection) {
        return path.join(this.serverDirectionRoot(direction), 'serviceProto.ts')
    }

    actionRegistryFile(direction: ProtocolDirection) {
        return path.join(this.serverDirectionRoot(direction), 'actions.ts')
    }

    legacyActionRegistryFile(direction: ProtocolDirection) {
        return path.join(this.projectRoot, 'src', 'action', direction, 'actions.ts')
    }

    serverBeanFile(logicalPath: string) {
        const relative = logicalPath === '/Mod/Mod' ? 'Mod' : stripLeadingSlash(logicalPath)
        return path.join(this.serverDirectionRoot('C2S'), 'mod', relative + '.ts')
    }

    moduleActionFile(moduleName: string, actionName: string) {
        return path.join(this.projectRoot, 'src', 'modules', moduleName, 'action', actionName + '.ts')
    }

    runtimeActionFile(direction: ProtocolDirection, packageName: string, actionName: string) {
        return path.join(this.projectRoot, 'src', 'runtime', 'action', direction, packageName, actionName + '.ts')
    }

    legacyActionFile(direction: ProtocolDirection, moduleName: string, actionName: string) {
        return path.join(this.projectRoot, 'src', 'action', direction, moduleName, actionName + '.ts')
    }

    actionSourceFile(direction: ProtocolDirection, moduleName: string, actionName: string) {
        const moduleFile = this.moduleActionFile(moduleName, actionName)
        if (fs.existsSync(moduleFile)) return moduleFile
        const runtimeFile = this.runtimeActionFile(direction, moduleName, actionName)
        if (fs.existsSync(runtimeFile)) return runtimeFile
        return this.legacyActionFile(direction, moduleName, actionName)
    }

    actionTargetFile(direction: ProtocolDirection, packageName: string, actionName: string) {
        if (fs.existsSync(this.runtimeProtocolFile(direction, packageName))) {
            return this.runtimeActionFile(direction, packageName, actionName)
        }
        return this.moduleActionFile(packageName, actionName)
    }

    schemaLobbyContractDomainFile(domain: string) {
        return path.join(this.generatedRoot, 'lobby-contract', 'protocol', 'lobbyRpc', 'domains', `${domain}.ts`)
    }

    runtimeProtocolFile(direction: ProtocolDirection, packageName: string) {
        return path.join(this.projectRoot, 'src', 'runtime', 'protocol', direction, packageName + '.ts')
    }

    discoverBeanSources(): BeanSourceFile[] {
        const sources: BeanSourceFile[] = []
        const moduleSources = new Map<string, string>()
        const addModuleSource = (filePath: string, logicalPath: string) => {
            const existing = moduleSources.get(logicalPath)
            if (existing && existing !== filePath) {
                throw new Error(`Bean 逻辑路径 ${logicalPath} 同时对应多个模块源码: ${existing}, ${filePath}`)
            }
            moduleSources.set(logicalPath, filePath)
            sources.push({ filePath, fileName: path.basename(filePath), logicalPath })
        }
        const modulesRoot = path.join(this.projectRoot, 'src', 'modules')
        for (const moduleName of listDirectories(modulesRoot)) {
            const beanRoot = path.join(modulesRoot, moduleName, 'bean')
            for (const filePath of walkTypeScriptFiles(beanRoot)) {
                const relative = withoutTypeScriptExtension(path.relative(beanRoot, filePath))
                const logicalPath = moduleBeanLogicalPath(moduleName, relative)
                addModuleSource(filePath, logicalPath)
            }

            const refRoot = path.join(modulesRoot, moduleName, 'ref')
            for (const filePath of walkTypeScriptFiles(refRoot)) {
                const relative = withoutTypeScriptExtension(path.relative(refRoot, filePath))
                const logicalPath = normalizeLogicalPath(path.join('refView', relative))
                addModuleSource(filePath, logicalPath)
            }
        }

        return sources.sort((left, right) => left.logicalPath.localeCompare(right.logicalPath))
    }

    /**
     * 发现**旧 TS 协议源**。
     *
     * C2S 只认 `src/runtime/protocol/C2S/` 这组框架级兼容锚点（`base` / `global` / `commom` /
     * `default`，由 `proto.json5` 与兼容基线钉住），⛔ **不再发现业务模块的 `XxxC2S.ts`**：
     * 业务模块的 C2S 协议真源是 `apps/shared/schema/protocols/`，由 `SchemaLobbyProtocol` 读取。
     *
     * 理由：同一方向同时读业务模块 TS 协议与 schema 会生成两套路由（`mail.list` 与 `mail/...`
     * 并存），而旧那套在 serverNew 里没有消费者 —— 旧二进制网关与 PB 通道已删除，
     * 生成器只是把死路由重新登记一遍。要让某条业务路由重新进来，先在 schema 里声明它，
     * ⛔ 不要恢复业务模块 C2S 协议文件这条发现路径。
     */
    discoverProtocolSources(direction: ProtocolDirection): ProtocolSourceFile[] {
        const sources: ProtocolSourceFile[] = []
        const claimedPackages = new Set<string>()
        const modulesRoot = path.join(this.projectRoot, 'src', 'modules')
        for (const moduleName of direction === 'S2S' ? listDirectories(modulesRoot) : []) {
            const moduleRoot = path.join(modulesRoot, moduleName)
            if (!fs.existsSync(moduleRoot)) continue
            const matches = fs
                .readdirSync(moduleRoot, { withFileTypes: true })
                .filter((entry) => entry.isFile() && entry.name.endsWith(direction + '.ts'))
                .map((entry) => path.join(moduleRoot, entry.name))
            if (matches.length > 1) {
                throw new Error(`模块 ${moduleName} 存在多个 ${direction} 协议文件: ${matches.join(', ')}`)
            }
            if (matches.length === 0) continue
            claimedPackages.add(moduleName)
            sources.push({
                direction,
                filePath: matches[0],
                fileName: path.basename(matches[0]),
                packageName: moduleName,
                moduleOwned: true,
            })
        }

        const runtimeRoot = path.join(this.projectRoot, 'src', 'runtime', 'protocol', direction)
        if (fs.existsSync(runtimeRoot)) {
            for (const entry of fs.readdirSync(runtimeRoot, { withFileTypes: true })) {
                if (!entry.isFile() || !TYPESCRIPT_FILE.test(entry.name)) continue
                const packageName = withoutTypeScriptExtension(entry.name)
                if (claimedPackages.has(packageName)) {
                    throw new Error(`协议包 ${packageName} 同时存在业务模块和运行时协议源`)
                }
                claimedPackages.add(packageName)
                sources.push({
                    direction,
                    filePath: path.join(runtimeRoot, entry.name),
                    fileName: entry.name,
                    packageName,
                    moduleOwned: false,
                })
            }
        }

        return sources.sort((left, right) => left.packageName.localeCompare(right.packageName))
    }

    beanLogicalPath(filePath: string): string | undefined {
        const absolute = path.resolve(filePath)
        const relativeToProject = path.relative(this.projectRoot, absolute)
        if (
            relativeToProject === '..' ||
            relativeToProject.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativeToProject)
        ) {
            return undefined
        }
        const normalized = normalizeFilePath(absolute)
        const modulesMarker = '/src/modules/'
        const modulesIndex = normalized.lastIndexOf(modulesMarker)
        if (modulesIndex >= 0) {
            const afterModules = normalized.substring(modulesIndex + modulesMarker.length)
            const parts = afterModules.split('/')
            if (parts[1] === 'bean' && parts.length > 2) {
                return moduleBeanLogicalPath(parts[0], parts.slice(2).join('/'))
            }
            if (parts[1] === 'ref' && parts.length > 2) {
                return normalizeLogicalPath(path.join('refView', withoutTypeScriptExtension(parts.slice(2).join('/'))))
            }
        }

        const legacyMarker = '/src/bean/'
        const legacyIndex = normalized.lastIndexOf(legacyMarker)
        if (legacyIndex >= 0) {
            return normalizeLogicalPath(
                withoutTypeScriptExtension(normalized.substring(legacyIndex + legacyMarker.length)),
            )
        }
        return undefined
    }

    protocolTypeImport(filePath: string, currentDirection: ProtocolDirection): string | undefined {
        const normalized = normalizeFilePath(filePath)
        const generatedModMarker = normalizeFilePath(path.join(this.serverDirectionRoot('C2S'), 'mod')) + '/'
        if (normalized.startsWith(generatedModMarker)) {
            return '/mod/' + withoutTypeScriptExtension(normalized.substring(generatedModMarker.length))
        }

        for (const direction of ['C2S', 'S2S'] as const) {
            for (const source of this.discoverProtocolSources(direction)) {
                if (normalizeFilePath(source.filePath) !== normalized) continue
                return direction === currentDirection
                    ? '/' + source.packageName
                    : `../${direction}/${source.packageName}`
            }
        }
        return undefined
    }
}

export function relativeImport(fromFile: string, targetFile: string) {
    let relative = normalizeFilePath(path.relative(path.dirname(fromFile), withoutTypeScriptExtension(targetFile)))
    if (!relative.startsWith('.')) relative = './' + relative
    return relative
}

function listDirectories(directory: string) {
    if (!fs.existsSync(directory)) return []
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
}

function walkTypeScriptFiles(directory: string): string[] {
    if (!fs.existsSync(directory)) return []
    const files: string[] = []
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filePath = path.join(directory, entry.name)
        if (entry.isDirectory()) files.push(...walkTypeScriptFiles(filePath))
        else if (entry.isFile() && TYPESCRIPT_FILE.test(entry.name) && !entry.name.endsWith('.d.ts'))
            files.push(filePath)
    }
    return files
}

function stripLeadingSlash(value: string) {
    return normalizeFilePath(value).replace(/^\/+/, '')
}

function normalizeLogicalPath(value: string) {
    return '/' + stripLeadingSlash(withoutTypeScriptExtension(value))
}

export function moduleBeanLogicalPath(moduleName: string, relativePath: string) {
    const beanPath = withoutTypeScriptExtension(relativePath)
    if (moduleName === 'user' && beanPath === 'User') return '/base/User'
    return normalizeLogicalPath(path.join(moduleName, beanPath))
}

function normalizeFilePath(value: string) {
    return value.replace(/\\/g, '/')
}

function withoutTypeScriptExtension(value: string) {
    return normalizeFilePath(value).replace(/\.(?:tsx?|mts|cts)$/i, '')
}
