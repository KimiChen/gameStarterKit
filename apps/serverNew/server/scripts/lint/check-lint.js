const fs = require('fs')
const path = require('path')
const { ESLint } = require('eslint')

const projectRoot = path.resolve(__dirname, '../..')
const baselineFile = path.join(__dirname, 'warning-baseline.json')
const update = process.argv.includes('--update')

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})

async function main() {
    const eslint = new ESLint({ cwd: projectRoot })
    const results = await eslint.lintFiles(['src'])
    const errors = results.flatMap((result) =>
        result.messages
            .filter((message) => message.severity === 2)
            .map((message) => formatMessage(result.filePath, message)),
    )
    if (errors.length > 0) throw new Error(`ESLint 错误:\n${errors.map((message) => `- ${message}`).join('\n')}`)

    const warnings = warningCounts(results)
    if (update) {
        fs.mkdirSync(path.dirname(baselineFile), { recursive: true })
        fs.writeFileSync(baselineFile, JSON.stringify({ version: 1, warnings }, null, 2) + '\n')
        console.log(`ESLint 警告基线已更新: ${sumCounts(warnings)} 条`)
        return
    }
    if (!fs.existsSync(baselineFile)) throw new Error('缺少 ESLint 警告基线，请运行 pnpm lint:baseline:update')
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
    if (baseline.version !== 1 || !baseline.warnings) throw new Error('ESLint 警告基线格式无效')
    const newWarnings = Object.entries(warnings).flatMap(([key, count]) => {
        const known = Number(baseline.warnings[key] ?? 0)
        return count > known ? [`${key} (+${count - known})`] : []
    })
    if (newWarnings.length > 0) {
        throw new Error(`发现新增 ESLint 警告:\n${newWarnings.map((message) => `- ${message}`).join('\n')}`)
    }
    console.log(`ESLint 检查通过: 0 个错误, ${sumCounts(warnings)} 个已知警告, 0 个新增警告`)
}

function warningCounts(results) {
    const counts = {}
    for (const result of results) {
        for (const message of result.messages.filter((item) => item.severity === 1)) {
            const key = formatMessage(result.filePath, message, false)
            counts[key] = (counts[key] ?? 0) + 1
        }
    }
    return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

function formatMessage(filePath, message, includeLocation = true) {
    const relativePath = path.relative(projectRoot, filePath).replaceAll(path.sep, '/')
    const location = includeLocation ? `:${message.line}:${message.column}` : ''
    return `${relativePath}${location} ${message.ruleId ?? 'unknown'} ${message.message}`
}

function sumCounts(counts) {
    return Object.values(counts).reduce((total, count) => total + Number(count), 0)
}
