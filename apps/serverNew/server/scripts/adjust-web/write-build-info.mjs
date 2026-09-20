import fs from 'node:fs'

const [outputPath, commit = 'unknown', dirty = 'false'] = process.argv.slice(2)

if (!outputPath) {
    throw new Error('缺少 build-info.json 输出路径')
}

const buildInfo = {
    backendProfile: 'alloy',
    webCommit: commit,
    webDirty: dirty === 'true',
    buildTime: new Date().toISOString(),
}

fs.writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2) + '\n')
