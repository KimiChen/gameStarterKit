import fs from 'fs'
import path from 'path'
import json5 from 'json5'
import ts = require('typescript')

interface SourceFileRecord {
    rootType: string
    path: string
    namespace: string
    className: string
    extends: string
    uses: string[]
    methods: { public: string[]; protected: string[]; private: string[] }
    taskUpdateCalls: string[]
    mainTaskCalls: string[]
    propsCalls: string[]
    staticCalls: string[]
}

let businessKnowledgeCache: any = null
let logicKnowledgeCache: any = null
let gameConfigCache: Record<string, unknown> | null = null
let gameConfigSchemaCache: Record<string, string[]> | null = null

function walkFiles(rootPath: string, extensions: Set<string>, maxFiles = 3000) {
    if (!fs.existsSync(rootPath)) return []
    const result: string[] = []
    const stack = [rootPath]
    while (stack.length > 0 && result.length < maxFiles) {
        const current = stack.pop()!
        for (const item of fs.readdirSync(current, { withFileTypes: true })) {
            const filePath = path.join(current, item.name)
            if (item.isDirectory()) stack.push(filePath)
            else if (extensions.has(path.extname(item.name).toLocaleLowerCase())) result.push(filePath)
        }
    }
    return result.sort()
}

function firstMarkdownTitle(content: string, fallback: string) {
    const match = content.match(/^#\s+(.+)$/m)
    return match?.[1]?.trim() || fallback
}

export function getBusinessKnowledge() {
    if (businessKnowledgeCache) return businessKnowledgeCache
    const projectRoot = path.resolve(ROOT_PATH, '..')
    const candidates = [path.join(projectRoot, 'README.md'), path.join(ROOT_PATH, 'README.md')]
    candidates.push(...walkFiles(path.join(projectRoot, 'docs'), new Set(['.md']), 200))
    const seen = new Set<string>()
    const documents = []
    for (const filePath of candidates) {
        if (!fs.existsSync(filePath) || seen.has(filePath)) continue
        seen.add(filePath)
        const stat = fs.statSync(filePath)
        if (!stat.isFile() || stat.size > 512 * 1024) continue
        const content = fs.readFileSync(filePath, 'utf8')
        const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/')
        const id = relativePath.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
        documents.push({
            id,
            title: firstMarkdownTitle(content, path.basename(filePath)),
            path: relativePath,
            virtualPath: `/business-kb/references/${relativePath}`,
            content,
        })
    }
    const index = documents.map((doc) => ({ id: doc.id, title: doc.title, path: doc.path }))
    businessKnowledgeCache = {
        schemaVersion: '1.0.0',
        generatedAt: new Date().toISOString(),
        source: { project: CP.platform.project, root: path.basename(projectRoot) },
        index,
        documents,
        businessIndex: {
            domains: documents.map((doc) => ({ id: doc.id, name: doc.title, documentIds: [doc.id] })),
        },
    }
    return businessKnowledgeCache
}

function modifierAccess(node: ts.MethodDeclaration) {
    if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword)) return 'private'
    if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ProtectedKeyword)) return 'protected'
    return 'public'
}

function scanSourceFile(filePath: string, rootPath: string, rootType: string): SourceFileRecord {
    const content = fs.readFileSync(filePath, 'utf8')
    const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
    const uses: string[] = []
    const classes: string[] = []
    const extendsNames: string[] = []
    const methods = { public: [] as string[], protected: [] as string[], private: [] as string[] }
    const callNames = new Set<string>()
    const staticCalls = new Set<string>()
    source.statements.forEach((statement) => {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier))
            uses.push(statement.moduleSpecifier.text)
        if (ts.isClassDeclaration(statement)) {
            if (statement.name) classes.push(statement.name.text)
            statement.heritageClauses?.forEach((clause) =>
                clause.types.forEach((type) => extendsNames.push(type.expression.getText(source))),
            )
            statement.members.forEach((member) => {
                if (ts.isMethodDeclaration(member) && member.name)
                    methods[modifierAccess(member)].push(member.name.getText(source))
            })
        }
    })
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const name = node.expression.name.text
            callNames.add(name)
            const owner = node.expression.expression.getText(source)
            if (/^[A-Z][A-Za-z0-9_.]*$/.test(owner)) staticCalls.add(`${owner}.${name}`)
        }
        ts.forEachChild(node, visit)
    }
    visit(source)
    const names = [...callNames]
    return {
        rootType,
        path: path.relative(rootPath, filePath).replace(/\\/g, '/'),
        namespace: '',
        className: classes.join(', '),
        extends: extendsNames.join(', '),
        uses,
        methods,
        taskUpdateCalls: names.filter((name) => /task/i.test(name)),
        mainTaskCalls: names.filter((name) => /mainTask/i.test(name)),
        propsCalls: names.filter((name) => /prop|award|item/i.test(name)),
        staticCalls: [...staticCalls].slice(0, 100),
    }
}

function topCounts(values: string[], limit = 30) {
    const counts = new Map<string, number>()
    values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, limit)
        .map(([name, count]) => ({ name, count }))
}

export function getSourceKnowledge() {
    if (logicKnowledgeCache) return logicKnowledgeCache
    const roots = [
        { rootType: 'module', rootPath: path.join(ROOT_PATH, 'src/modules') },
        { rootType: 'runtime', rootPath: path.join(ROOT_PATH, 'src/runtime') },
        { rootType: 'startup', rootPath: path.join(ROOT_PATH, 'src/startup') },
        { rootType: 'http', rootPath: path.join(ROOT_PATH, 'src/http') },
    ]
    const groups = new Map<string, SourceFileRecord[]>()
    for (const root of roots) {
        for (const filePath of walkFiles(root.rootPath, new Set(['.ts']), 3000)) {
            const record = scanSourceFile(filePath, root.rootPath, root.rootType)
            const firstPart = record.path.split('/')[0].replace(/\.ts$/, '')
            const key = `${root.rootType}:${firstPart}`
            groups.set(key, [...(groups.get(key) ?? []), record])
        }
    }
    const modules = [...groups.entries()]
        .map(([key, files]) => {
            const [rootType, module] = key.split(':')
            return {
                module,
                rootType,
                relativeRoot: files[0]?.path.split('/').slice(0, -1).join('/') || '',
                fileCount: files.length,
                classes: files.flatMap((file) => file.className.split(', ').filter(Boolean)),
                entryFiles: files
                    .filter((file) => /(^|\/)(Action|.*controller)/i.test(file.path))
                    .map((file) => file.path)
                    .slice(0, 30),
                taskSignals: topCounts(files.flatMap((file) => file.taskUpdateCalls)),
                mainTaskSignals: topCounts(files.flatMap((file) => file.mainTaskCalls)),
                propsSignals: topCounts(files.flatMap((file) => file.propsCalls)),
                staticApiHotspots: topCounts(files.flatMap((file) => file.staticCalls)),
                dependencies: topCounts(files.flatMap((file) => file.uses)),
                files,
            }
        })
        .sort((left, right) => left.rootType.localeCompare(right.rootType) || left.module.localeCompare(right.module))
    logicKnowledgeCache = {
        schemaVersion: '1.0.0',
        generatedAt: new Date().toISOString(),
        source: { project: CP.platform.project, roots: roots.map((root) => root.rootType) },
        statistics: { moduleCount: modules.length, fileCount: modules.reduce((sum, item) => sum + item.fileCount, 0) },
        executionKnowledge: { summary: '由 Alloy 模块、运行时、启动和 HTTP 源码的 TypeScript AST 自动归纳。' },
        moduleSummaries: modules.map((module) => {
            const moduleItem = { ...module }
            delete (moduleItem as Partial<typeof module>).files
            return moduleItem
        }),
        modules,
    }
    return logicKnowledgeCache
}

export function getDiffInformation() {
    const content = json5.parse(fs.readFileSync(path.join(ROOT_PATH, 'generated/records/bean.json5'), 'utf8'))
    return content.diffInfos ?? {}
}

export function getAllGameConfig() {
    if (gameConfigCache) return gameConfigCache
    gameConfigCache = {}
    for (const filePath of walkFiles(path.join(ROOT_PATH, 'config_game'), new Set(['.json']), 1000)) {
        const name = path.basename(filePath, '.json')
        gameConfigCache[name] = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    }
    return gameConfigCache
}

export function getAllGameConfigSchema() {
    if (gameConfigSchemaCache) return gameConfigSchemaCache
    const content = fs.readFileSync(path.join(ROOT_PATH, 'generated/configTypes/conf.d.ts'), 'utf8')
    const result: Record<string, string[]> = {}
    const pattern = /\/\/ #region ([^\r\n]+)\.json([\s\S]*?)\/\/ #endregion \1\.json/g
    for (const match of content.matchAll(pattern)) {
        result[match[1]] = match[2].trim().split(/\r?\n/).slice(0, 300)
    }
    gameConfigSchemaCache = result
    return result
}
