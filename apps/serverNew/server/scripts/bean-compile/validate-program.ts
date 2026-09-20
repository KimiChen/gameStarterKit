import path from 'path'
import ts from 'typescript'
import { validateBeanCompileProgram } from './transformer'

const projectRoot = path.resolve(__dirname, '../..')
const configPath = path.join(projectRoot, 'tsconfig.json')
const configFile = ts.readConfigFile(configPath, ts.sys.readFile)

if (configFile.error) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext([configFile.error], diagnosticHost()))
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot, undefined, configPath)
if (parsed.errors.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, diagnosticHost()))
}

const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
})

validateBeanCompileProgram(program, { projectRoot })
console.log(`[Bean编译] record 校验通过，共检查 ${program.getSourceFiles().length} 个 TypeScript 文件`)

function diagnosticHost(): ts.FormatDiagnosticsHost {
    return {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => projectRoot,
        getNewLine: () => ts.sys.newLine,
    }
}
