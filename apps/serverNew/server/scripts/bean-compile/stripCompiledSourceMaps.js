const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')

function stripCompiledSourceMaps(outputRootValue) {
    const outputRoot = path.resolve(projectRoot, outputRootValue)
    if (!fs.statSync(outputRoot, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(`[Bean编译] JavaScript 输出目录不存在: ${outputRoot}`)
    }

    let removedMaps = 0
    let strippedJavaScriptFiles = 0
    visit(outputRoot, (filePath) => {
        if (filePath.endsWith('.js.map')) {
            fs.rmSync(filePath, { force: true })
            removedMaps++
            return
        }
        if (!filePath.endsWith('.js')) return

        const source = fs.readFileSync(filePath, 'utf8')
        const stripped = source.replace(/(?:\r?\n)?\/\/[#@]\s*sourceMappingURL=.*?(?:\r?\n)?$/, '\n')
        if (stripped !== source) {
            fs.writeFileSync(filePath, stripped)
            strippedJavaScriptFiles++
        }
    })

    return { removedMaps, strippedJavaScriptFiles }
}

function visit(directory, onFile) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) visit(entryPath, onFile)
        else if (entry.isFile()) onFile(entryPath)
    }
}

module.exports = { stripCompiledSourceMaps }

if (require.main === module) {
    const result = stripCompiledSourceMaps(process.argv[2] ?? 'build/compiled')
    console.log(
        `[Bean编译] 已移除 ${result.removedMaps} 个 source map，清理 ${result.strippedJavaScriptFiles} 个 JavaScript 映射注释`,
    )
}
