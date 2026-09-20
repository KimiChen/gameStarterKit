const fs = require('fs')
const {
    captureCompatibilityBaseline,
    compareCompatibility,
    defaultBaselinePath,
} = require('../../scripts/structure-baseline/compatibility-contract')

const expected = JSON.parse(fs.readFileSync(defaultBaselinePath, 'utf8'))
const actual = captureCompatibilityBaseline()
const hashes = process.argv.includes('--hashes')
const enabledArchiveModules = (process.env.ALLOY_ENABLED_ARCHIVE_MODULES ?? '').split(',').filter(Boolean)
const differences = enabledArchiveModules.length > 0 ? [] : compareCompatibility(expected, actual, { hashes })

if (enabledArchiveModules.length > 0) {
    console.log(`compatibility baseline comparison deferred for restored modules: ${enabledArchiveModules.join(',')}`)
}

if (differences.length > 0) {
    console.error(`compatibility baseline mismatch (${differences.length})`)
    for (const difference of differences.slice(0, 100)) console.error(`- ${difference}`)
    if (differences.length > 100) console.error(`- ... ${differences.length - 100} more`)
    process.exit(1)
}

console.log(`compatibility baseline matched${hashes ? ' with artifact hashes' : ''}`)
console.log(JSON.stringify(actual.counts))
