import fs from 'fs'
import path from 'path'
import { getAdjustAiPolicy } from './aiPolicy'

const DEFAULT_MAX_FILE_BYTES = 512 * 1024
const DEFAULT_MAX_GREP_FILES = 3000
const ALLOWED_EXTENSIONS = new Set(['.ts', '.js', '.json', '.json5', '.md', '.txt'])

interface ResolvedCodePath {
    scope: string
    rootPath: string
    realPath: string
    relativePath: string
}

function getCodeConfig() {
    return CP.platform.adjustAi?.codeContext
}

function getScopes() {
    const config = getCodeConfig()
    if (!getAdjustAiPolicy().serverCodeContext || !config?.scopes) return {}
    return config.scopes
}

function normalizeRelativePath(value: string) {
    return String(value || '')
        .replace(/\\/g, '/')
        .replace(/\0/g, '')
        .replace(/^\/+|\/+$/g, '')
}

function isDenied(scope: string, relativePath: string) {
    const normalized = normalizeRelativePath(relativePath)
    if (!normalized) return false
    for (const deniedValue of getCodeConfig()?.denyDirs?.[scope] ?? []) {
        const denied = normalizeRelativePath(deniedValue)
        if (denied && (normalized === denied || normalized.startsWith(`${denied}/`))) return true
    }
    return false
}

function isAllowedFile(filePath: string) {
    return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase())
}

function resolveCodePath(scope: string, relativePath: string, allowDirectory: boolean): ResolvedCodePath {
    const scopePath = getScopes()[scope]
    if (!scopePath) throw new Error('无效的代码上下文 scope')
    const rootPath = fs.realpathSync(path.resolve(ROOT_PATH, scopePath))
    const cleanPath = normalizeRelativePath(relativePath)
    const candidate = cleanPath ? path.resolve(rootPath, cleanPath) : rootPath
    if (!fs.existsSync(candidate)) throw new Error('路径不存在')
    const realPath = fs.realpathSync(candidate)
    const rootPrefix = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`
    if (realPath !== rootPath && !realPath.startsWith(rootPrefix)) throw new Error('路径超出允许范围')
    const resolvedRelativePath = realPath === rootPath ? '' : path.relative(rootPath, realPath).replace(/\\/g, '/')
    if (isDenied(scope, resolvedRelativePath)) throw new Error('路径不可读取')
    const stat = fs.statSync(realPath)
    if (allowDirectory) {
        if (!stat.isDirectory() && !stat.isFile()) throw new Error('路径类型无效')
    } else {
        if (!stat.isFile()) throw new Error('请提供文件路径')
        if (!isAllowedFile(realPath)) throw new Error('文件类型不可读取')
        if (stat.size > (getCodeConfig()?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES))
            throw new Error('文件超过读取大小限制')
    }
    return { scope, rootPath, realPath, relativePath: resolvedRelativePath }
}

export function getAiCodeContextConfig() {
    return {
        enabled: getAdjustAiPolicy().serverCodeContext,
        mounts: Object.keys(getScopes()),
        denyDirs: Object.keys(getScopes()).reduce<Record<string, string[]>>((result, scope) => {
            result[scope] = getCodeConfig()?.denyDirs?.[scope] ?? []
            return result
        }, {}),
    }
}

export function listAiCodeContext(scope: string, relativePath: string) {
    const resolved = resolveCodePath(scope, relativePath, true)
    const stat = fs.statSync(resolved.realPath)
    if (stat.isFile()) {
        return {
            scope,
            path: resolved.relativePath,
            items: [{ name: path.basename(resolved.realPath), path: resolved.relativePath, isDir: false }],
        }
    }
    const items = fs
        .readdirSync(resolved.realPath, { withFileTypes: true })
        .filter((item) => {
            const itemPath = resolved.relativePath ? `${resolved.relativePath}/${item.name}` : item.name
            return !isDenied(scope, itemPath) && (item.isDirectory() || isAllowedFile(item.name))
        })
        .map((item) => ({
            name: item.name,
            path: resolved.relativePath ? `${resolved.relativePath}/${item.name}` : item.name,
            isDir: item.isDirectory(),
        }))
        .sort((left, right) => Number(right.isDir) - Number(left.isDir) || left.name.localeCompare(right.name))
    return { scope, path: resolved.relativePath, items }
}

export function readAiCodeContext(scope: string, relativePath: string, startValue: number, endValue: number) {
    const resolved = resolveCodePath(scope, relativePath, false)
    const lines = fs.readFileSync(resolved.realPath, 'utf8').split(/\r?\n/)
    const totalLines = lines.length
    const startLine = Math.max(1, Math.trunc(startValue || 1))
    const requestedEndLine = Math.trunc(endValue || startLine + 99)
    const endLine = Math.min(totalLines, Math.max(startLine, Math.min(requestedEndLine, startLine + 299)))
    if (startLine > totalLines) throw new Error(`startLine ${startLine} 超出总行数 ${totalLines}`)
    return {
        scope,
        path: resolved.relativePath,
        startLine,
        endLine,
        totalLines,
        content: lines.slice(startLine - 1, endLine).join('\n'),
    }
}

function* iterateCodeFiles(scope: string, rootPath: string, startPath: string): Generator<string> {
    const stack = [startPath]
    let visited = 0
    const maxFiles = getCodeConfig()?.maxGrepFiles ?? DEFAULT_MAX_GREP_FILES
    while (stack.length > 0 && visited < maxFiles) {
        const current = stack.pop()!
        const stat = fs.statSync(current)
        if (stat.isFile()) {
            visited++
            if (isAllowedFile(current) && stat.size <= (getCodeConfig()?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES))
                yield current
            continue
        }
        for (const item of fs.readdirSync(current, { withFileTypes: true })) {
            const child = path.join(current, item.name)
            const relative = path.relative(rootPath, child).replace(/\\/g, '/')
            if (!isDenied(scope, relative)) stack.push(child)
        }
    }
}

export function grepAiCodeContext(scope: string, relativePath: string, patternValue: string) {
    const pattern = String(patternValue || '').trim()
    if (!pattern || pattern.length > 200) throw new Error('pattern 长度必须为 1-200 个字符')
    const resolved = resolveCodePath(scope, relativePath, true)
    const needle = pattern.toLocaleLowerCase()
    const items: Array<{ path: string; matches: Array<{ line: number; content: string }> }> = []
    for (const filePath of iterateCodeFiles(scope, resolved.rootPath, resolved.realPath)) {
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
        const matches: Array<{ line: number; content: string }> = []
        lines.forEach((line, index) => {
            if (matches.length < 20 && line.toLocaleLowerCase().includes(needle)) {
                matches.push({ line: index + 1, content: line.trim().slice(0, 500) })
            }
        })
        if (matches.length > 0) {
            items.push({ path: path.relative(resolved.rootPath, filePath).replace(/\\/g, '/'), matches })
            if (items.length >= 100) break
        }
    }
    return { scope, items }
}
