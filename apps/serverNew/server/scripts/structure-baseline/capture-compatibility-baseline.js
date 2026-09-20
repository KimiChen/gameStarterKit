const fs = require('fs')
const path = require('path')
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
console.log(`compatibility baseline written: ${outputPath}`)
console.log(JSON.stringify(baseline.counts))
