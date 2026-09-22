const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const {
    captureCompatibilityBaseline,
    defaultBaselinePath,
    preserveFrozenCoreContract,
} = require('./compatibility-contract')

const args = process.argv.slice(2)
const outputArgument = args.find((argument) => !['--preserve-core', '--update'].includes(argument))
const outputPath = path.resolve(outputArgument ?? defaultBaselinePath)
if (fs.existsSync(outputPath) && !args.includes('--update')) {
    console.error(`baseline already exists: ${outputPath}`)
    console.error('pass --update to replace it intentionally')
    process.exit(2)
}

let baseline = captureCompatibilityBaseline()
if (args.includes('--preserve-core')) {
    if (!fs.existsSync(outputPath)) throw new Error(`cannot preserve missing baseline: ${outputPath}`)
    baseline = preserveFrozenCoreContract(baseline, JSON.parse(fs.readFileSync(outputPath, 'utf8')))
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`)

// `JSON.stringify` 会把单元素数组摊成多行，而 `pnpm format:check` 跑的是 prettier —— 不格式化的话
// 每次刷新基线都会让格式门禁变红（实测 `collectionTypes: ["PropItem"]` 就会被折叠）。
// 与 `scripts/errorcode/checkErrorCodes.ts` 对基线产物的处理保持一致。
execFileSync('pnpm', ['exec', 'prettier', '--ignore-path', '/dev/null', '--write', outputPath], {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'ignore',
})

console.log(`compatibility baseline written: ${outputPath}`)
console.log(JSON.stringify(baseline.counts))
