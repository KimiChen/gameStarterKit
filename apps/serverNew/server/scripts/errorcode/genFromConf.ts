import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import {
    auditErrorConsumers,
    errorClassName,
    errorSourceFile,
    loadErrorDefinitions,
    validateErrorDefinitions,
} from './ErrorCodeModel'

const projectRoot = path.resolve(__dirname, '../..')
const definitions = loadErrorDefinitions(projectRoot)
validateErrorDefinitions(definitions, projectRoot)
auditErrorConsumers(projectRoot, definitions)
const generatedFiles: string[] = []

for (const owner of [...new Set(definitions.map((definition) => definition.owner))].sort()) {
    const ownerDefinitions = definitions.filter((definition) => definition.owner === owner)
    const className = errorClassName(owner)
    const content = [
        "import { GameError } from '@arthropoda/game-engine'",
        '',
        `export class ${className} {`,
        ...ownerDefinitions.flatMap((definition) => [
            `    static readonly ${definition.name} = new GameError(${definition.code}, ${JSON.stringify(definition.message)})`,
            '',
        ]),
        '}',
        '',
    ].join('\n')
    write(errorSourceFile(projectRoot, owner), content)
}

const owners = [...new Set(definitions.map((definition) => definition.owner))].sort()
const registryFile = path.join(projectRoot, 'generated', 'errors', 'ErrorCode.ts')
const registry = [
    ...owners.map((owner) => {
        const sourceFile = errorSourceFile(projectRoot, owner)
        const relative = relativeImport(registryFile, sourceFile)
        return `import { ${errorClassName(owner)} } from '${relative}'`
    }),
    '',
    'export class ErrorCode {',
    ...definitions.map(
        (definition) =>
            `    static readonly ${definition.name} = ${errorClassName(definition.owner)}.${definition.name}`,
    ),
    '}',
    '',
    'export default ErrorCode',
    '',
].join('\n')
write(registryFile, registry)

console.log(`错误码生成完成: ${definitions.length} 个定义, ${owners.length} 个所有者`)

function write(filePath: string, content: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
    generatedFiles.push(filePath)
}

function relativeImport(fromFile: string, targetFile: string) {
    let relative = path.relative(path.dirname(fromFile), targetFile).replaceAll(path.sep, '/').replace(/\.ts$/, '')
    if (!relative.startsWith('.')) relative = './' + relative
    return relative
}

execFileSync('pnpm', ['exec', 'prettier', '--write', ...generatedFiles], {
    cwd: projectRoot,
    stdio: 'ignore',
})
