import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { auditErrorConsumers, loadErrorDefinitions, validateErrorDefinitions } from './ErrorCodeModel'
import { ErrorCode } from '../../generated/errors/ErrorCode'
import { GameError } from '@arthropoda/game-engine'

const projectRoot = path.resolve(__dirname, '../..')
const baselineFile = path.join(projectRoot, 'test', 'errorcode', 'error-code-baseline.json')
const definitions = loadErrorDefinitions(projectRoot)
validateErrorDefinitions(definitions, projectRoot)
auditErrorConsumers(projectRoot, definitions)
const contract = { count: definitions.length, errors: definitions }

const runtimeKeys = Object.keys(ErrorCode)
if (runtimeKeys.length !== definitions.length) {
    throw new Error(`统一错误码注册数量错误: ${runtimeKeys.length}, expected=${definitions.length}`)
}
const runtimeCodes = new Map<number, string>()
for (const definition of definitions) {
    const error = ErrorCode[definition.name as keyof typeof ErrorCode] as GameError | undefined
    if (!error) throw new Error(`统一错误码注册缺失: ${definition.name}`)
    const item = error.getItem()
    if (item.code !== definition.code || item.message !== definition.message) {
        throw new Error(`统一错误码注册契约变化: ${definition.name}`)
    }
    const duplicate = runtimeCodes.get(item.code)
    if (duplicate) throw new Error(`统一错误码数字重复: ${item.code} (${duplicate}, ${definition.name})`)
    runtimeCodes.set(item.code, definition.name)
}

if (process.argv.includes('--update')) {
    fs.mkdirSync(path.dirname(baselineFile), { recursive: true })
    fs.writeFileSync(baselineFile, JSON.stringify(contract, null, 2) + '\n')
    execFileSync('pnpm', ['exec', 'prettier', '--write', baselineFile], { cwd: projectRoot, stdio: 'ignore' })
    console.log(`错误码兼容基线已更新: ${baselineFile}`)
    process.exit(0)
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
if (JSON.stringify(contract) !== JSON.stringify(baseline)) {
    throw new Error('错误码名称、数字、消息或所有者发生变化')
}
console.log(`错误码兼容检查通过: ${definitions.length} 个定义`)
