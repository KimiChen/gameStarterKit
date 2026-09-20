import fs from 'fs'
import path from 'path'
import { GenerationPaths, moduleBeanLogicalPath } from '../generator/GenerationPaths'

export enum BeanDifferKind {
    Bean = 1,
    Hash = 2,
    HashJson = 3,
}

export interface BeanFieldRecord {
    id: number
    name: string
    type: string
    comment?: string
    deleted?: boolean
    typeImport?: string
    hasQuestionToken: boolean
    collectionTypes?: string[]
    defaultValue?: string
    sourceType?: string
    sourceInitializer?: string | null
    decorators?: string[]
    saveType?: string
    modType?: string
    listen?: string
}

export interface BeanCompileRecord {
    recordKey: string
    relativePath?: string
    name: string
    className?: string
    deleted?: boolean
    diffType: BeanDifferKind
    extendType?: string
    decorators?: string[]
    properties: Record<string, BeanFieldRecord>
    modId?: number
    saveType?: string
    modType?: string
    initFunc?: boolean
    idFiledType?: string
}

interface RecordJson {
    beans?: Record<string, Omit<BeanCompileRecord, 'recordKey'>>
}

export interface BeanRecordContractOptions {
    projectRoot: string
    recordPath?: string
    beanRoot?: string
}

export class BeanRecordContract {
    readonly projectRoot: string

    readonly recordPath: string

    readonly beanRoot: string

    private readonly paths: GenerationPaths

    private readonly customBeanRoot: boolean

    private readonly byLocationAndClass = new Map<string, BeanCompileRecord>()

    private readonly records: BeanCompileRecord[] = []

    constructor(options: BeanRecordContractOptions) {
        this.projectRoot = path.resolve(options.projectRoot)
        this.paths = new GenerationPaths(this.projectRoot)
        this.customBeanRoot = options.beanRoot !== undefined
        this.recordPath = path.resolve(options.recordPath ?? this.paths.recordFile)
        this.beanRoot = path.resolve(options.beanRoot ?? path.join(this.projectRoot, 'src/modules'))

        if (!fs.existsSync(this.recordPath)) {
            throw new Error(
                `[Bean编译] 正式兼容记录不存在: ${this.recordPath}。请从 Git 恢复 generated/records/record.json，或为测试显式传入 recordPath。`,
            )
        }

        let parsed: RecordJson
        try {
            parsed = JSON.parse(fs.readFileSync(this.recordPath, 'utf8')) as RecordJson
        } catch (error) {
            throw new Error(
                `[Bean编译] 无法读取 ${this.recordPath}: ${error instanceof Error ? error.message : String(error)}`,
            )
        }

        for (const [recordKey, value] of Object.entries(parsed.beans ?? {})) {
            const record: BeanCompileRecord = { ...value, recordKey }
            if (record.deleted) continue
            this.records.push(record)
            if (!record.relativePath) continue
            const className = record.className ?? record.name
            this.byLocationAndClass.set(
                this.locationKey(normalizeBeanRelativePath(record.relativePath), className),
                record,
            )
        }
    }

    relativePathOf(sourceFileName: string): string | undefined {
        if (!this.customBeanRoot) return this.paths.beanLogicalPath(sourceFileName)
        const relative = path.relative(this.beanRoot, path.resolve(sourceFileName))
        if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
            return undefined
        }
        return normalizeBeanRelativePath(relative)
    }

    find(relativePath: string, className: string): BeanCompileRecord | undefined {
        const normalized = normalizeBeanRelativePath(relativePath)
        const exact = this.byLocationAndClass.get(this.locationKey(normalized, className))
        if (exact) return exact

        // 旧 record 的 beans 仍以文件名为 key。仅当条目没有 relativePath 时才回退，
        // 避免同名文件被错误匹配；有 relativePath 但位置变化应明确要求重新生成。
        const fileKey = path.posix.basename(normalized) + '.ts'
        const candidates = this.records.filter(
            (record) =>
                !record.relativePath && record.recordKey === fileKey && (record.className ?? record.name) === className,
        )
        return candidates.length === 1 ? candidates[0] : undefined
    }

    private locationKey(relativePath: string, className: string) {
        return `${normalizeBeanRelativePath(relativePath)}\0${className}`
    }
}

export function normalizeBeanRelativePath(value: string): string {
    let normalized = value.replace(/\\/g, '/').trim()
    const moduleRefMatch = normalized.match(/(?:^|\/)src\/modules\/[^/]+\/ref\/(.+)$/)
    if (moduleRefMatch) {
        normalized = `/refView/${moduleRefMatch[1]}`
    } else {
        const moduleBeanMatch = normalized.match(/(?:^|\/)src\/modules\/([^/]+)\/bean\/(.+)$/)
        if (moduleBeanMatch) {
            normalized = moduleBeanLogicalPath(moduleBeanMatch[1], moduleBeanMatch[2])
        }
    }
    const beanRootIndex = normalized.lastIndexOf('/src/bean/')
    if (beanRootIndex >= 0) {
        normalized = normalized.substring(beanRootIndex + '/src/bean'.length)
    } else {
        normalized = normalized.replace(/^\.?\/?src\/bean\/?/, '/')
    }
    normalized = normalized.replace(/\.(?:tsx?|mts|cts)$/i, '')
    normalized = path.posix.normalize('/' + normalized.replace(/^\/+/, ''))
    return normalized === '/' ? normalized : normalized.replace(/\/$/, '')
}
