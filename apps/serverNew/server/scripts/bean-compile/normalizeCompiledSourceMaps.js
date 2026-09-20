const fs = require('fs')
const path = require('path')

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_VALUES = new Map(Array.from(BASE64, (char, index) => [char, index]))
const projectRoot = path.resolve(__dirname, '../..')
const beanRoots = []
const modulesRoot = path.join(projectRoot, 'src/modules')
if (fs.existsSync(modulesRoot)) {
    for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const beanRoot = path.join(modulesRoot, entry.name, 'bean')
        if (fs.existsSync(beanRoot)) beanRoots.push(beanRoot)
    }
}

// Repairs Bean source locations after TypeScript compilation and removes stale compiled Bean files.
function normalizeCompiledSourceMaps(outputRootValue) {
    const outputRoot = path.resolve(projectRoot, outputRootValue)
    if (!fs.statSync(outputRoot, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(`[Bean编译] source map 输出目录不存在: ${outputRoot}`)
    }
    let normalizedCount = 0
    visit(outputRoot, (mapPath) => {
        const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
        if (!Array.isArray(map.sources) || typeof map.mappings !== 'string') return
        const sourceInfo = map.sources.map((source, index) =>
            sourceLocation(mapPath, map.sourceRoot, source, map, index),
        )
        const localSourceInfo = sourceInfo.filter(Boolean)
        if (localSourceInfo.length === 1 && localSourceInfo[0].missing) {
            fs.rmSync(mapPath, { force: true })
            fs.rmSync(mapPath.substring(0, mapPath.length - '.map'.length), { force: true })
            normalizedCount++
            return
        }
        if (!sourceInfo.some(Boolean)) return

        const decoded = decodeMappings(map.mappings)
        let changed = false
        for (const line of decoded) {
            for (const segment of line) {
                if (segment.length < 4) continue
                const info = sourceInfo[segment[1]]
                if (info && segment[2] >= info.lineCount) {
                    segment[2] = info.classLine
                    changed = true
                }
            }
        }
        if (changed) map.mappings = encodeMappings(decoded)
        if (changed || sourceInfo.some((info) => info?.contentRestored)) {
            fs.writeFileSync(mapPath, JSON.stringify(map))
            normalizedCount++
        }
    })
    return normalizedCount
}

function sourceLocation(mapPath, sourceRoot, source, map, sourceIndex) {
    if (typeof source !== 'string' || /^[a-z][a-z+.-]*:/i.test(source)) return undefined
    const sourcePath = path.resolve(path.dirname(mapPath), sourceRoot ?? '', source)
    const isBeanSource = beanRoots.some((beanRoot) => {
        const relative = path.relative(beanRoot, sourcePath)
        return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    })
    if (!isBeanSource) return undefined
    if (!fs.existsSync(sourcePath)) return { missing: true }
    const content = fs.readFileSync(sourcePath, 'utf8')
    const lines = content.split(/\r\n?|\n/)
    const classLine = Math.max(
        0,
        lines.findIndex((line) => /\b(?:export\s+)?class\s+[A-Za-z_$]/.test(line)),
    )
    let contentRestored = false
    if (Array.isArray(map.sourcesContent) && map.sourcesContent[sourceIndex] !== content) {
        map.sourcesContent[sourceIndex] = content
        contentRestored = true
    }
    return { classLine, lineCount: lines.length, contentRestored }
}

function visit(directory, onMap) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) visit(entryPath, onMap)
        else if (entry.isFile() && entry.name.endsWith('.js.map')) onMap(entryPath)
    }
}

function decodeMappings(value) {
    let previousSource = 0
    let previousOriginalLine = 0
    let previousOriginalColumn = 0
    let previousName = 0
    return value.split(';').map((lineValue) => {
        let previousGeneratedColumn = 0
        if (!lineValue) return []
        return lineValue.split(',').map((segmentValue) => {
            const values = decodeSegment(segmentValue)
            previousGeneratedColumn += values[0]
            const segment = [previousGeneratedColumn]
            if (values.length >= 4) {
                previousSource += values[1]
                previousOriginalLine += values[2]
                previousOriginalColumn += values[3]
                segment.push(previousSource, previousOriginalLine, previousOriginalColumn)
                if (values.length === 5) {
                    previousName += values[4]
                    segment.push(previousName)
                }
            }
            return segment
        })
    })
}

function encodeMappings(lines) {
    let previousSource = 0
    let previousOriginalLine = 0
    let previousOriginalColumn = 0
    let previousName = 0
    return lines
        .map((line) => {
            let previousGeneratedColumn = 0
            return line
                .map((segment) => {
                    const values = [segment[0] - previousGeneratedColumn]
                    previousGeneratedColumn = segment[0]
                    if (segment.length >= 4) {
                        values.push(
                            segment[1] - previousSource,
                            segment[2] - previousOriginalLine,
                            segment[3] - previousOriginalColumn,
                        )
                        previousSource = segment[1]
                        previousOriginalLine = segment[2]
                        previousOriginalColumn = segment[3]
                        if (segment.length === 5) {
                            values.push(segment[4] - previousName)
                            previousName = segment[4]
                        }
                    }
                    return values.map(encodeVlq).join('')
                })
                .join(',')
        })
        .join(';')
}

function decodeSegment(value) {
    const result = []
    let index = 0
    while (index < value.length) {
        let encoded = 0
        let shift = 0
        let continuation
        do {
            const digit = BASE64_VALUES.get(value[index++])
            if (digit === undefined) throw new Error(`[Bean编译] 非法 source map VLQ: ${value}`)
            continuation = (digit & 32) !== 0
            encoded += (digit & 31) * 2 ** shift
            shift += 5
        } while (continuation)
        const negative = (encoded & 1) === 1
        const absolute = Math.floor(encoded / 2)
        result.push(negative ? -absolute : absolute)
    }
    return result
}

function encodeVlq(value) {
    let encoded = value < 0 ? -value * 2 + 1 : value * 2
    let result = ''
    do {
        let digit = encoded % 32
        encoded = Math.floor(encoded / 32)
        if (encoded > 0) digit |= 32
        result += BASE64[digit]
    } while (encoded > 0)
    return result
}

module.exports = { normalizeCompiledSourceMaps }

if (require.main === module) {
    normalizeCompiledSourceMaps(process.argv[2] ?? 'build/compiled')
}
