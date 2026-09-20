import assert from 'node:assert/strict'

global.ROOT_PATH = process.cwd()
global.CP = {
    platform: {
        project: 'test-project',
        adjustAi: {
            enabled: true,
            businessKnowledge: true,
            logicKnowledge: true,
            diffInfo: true,
            gameConfig: true,
            codeContext: {
                enabled: true,
                scopes: { server: 'src' },
                denyDirs: { server: ['forClient'] },
                maxFileBytes: 524288,
                maxGrepFiles: 3000,
            },
        },
    } as any,
    service: {} as any,
}

const {
    getAiCodeContextConfig,
    grepAiCodeContext,
    listAiCodeContext,
    readAiCodeContext,
} = require('../../../src/modules/adjust/http/ai/aiCodeContext')
const { getAllGameConfigSchema, getDiffInformation } = require('../../../src/modules/adjust/http/ai/aiKnowledge')

const config = getAiCodeContextConfig()
assert.deepEqual(config.mounts, ['server'])
assert.ok(listAiCodeContext('server', '').items.some((item: any) => item.name === 'http'))

const source = readAiCodeContext('server', 'modules/adjust/http/ai/aiPolicy.ts', 1, 20)
assert.equal(source.startLine, 1)
assert.ok(source.content.includes('AdjustAiPolicy'))

const grepResult = grepAiCodeContext('server', 'modules/adjust/http/ai', 'AdjustAiController')
assert.ok(grepResult.items.some((item: any) => item.path.endsWith('AdjustAiController.ts')))

assert.throws(() => listAiCodeContext('server', '../'))
assert.throws(() => listAiCodeContext('server', 'forClient'))
assert.ok(Object.keys(getDiffInformation()).length > 0)
assert.ok(Object.keys(getAllGameConfigSchema()).length > 0)

console.log('aiCodeContext tests passed')
