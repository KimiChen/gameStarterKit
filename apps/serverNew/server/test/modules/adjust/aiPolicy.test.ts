import assert from 'node:assert/strict'
import { getAdjustAiPolicy } from '../../../src/modules/adjust/http/ai/aiPolicy'
import { isToolWriteRequest } from '../../../src/http/security/sso/isToolWriteRequest'

global.CP = {
    platform: {
        adjustAi: {
            enabled: false,
            promptWrite: true,
            providerConfigWrite: true,
            redis: true,
            redisWrite: true,
            customFunction: true,
            mockClient: true,
            codeContext: { enabled: true, scopes: { server: 'src' } },
        },
        adjustRedis: { enabled: true, writeEnabled: true },
    } as any,
    service: {} as any,
}

let policy = getAdjustAiPolicy()
assert.equal(policy.enabled, false)
assert.equal(policy.promptWrite, false)
assert.equal(policy.providerConfigWrite, false)
assert.equal(policy.redis, false)
assert.equal(policy.redisWrite, false)
assert.equal(policy.customFunction, false)
assert.equal(policy.mockClient, false)
assert.equal(policy.serverCodeContext, false)

;(CP.platform as any).adjustAi = {
    ...CP.platform.adjustAi!,
    enabled: true,
    projectMemory: false,
    providerConfigWrite: false,
}
policy = getAdjustAiPolicy()
assert.equal(policy.enabled, true)
assert.equal(policy.promptWrite, true)
assert.equal(policy.providerConfigWrite, false)
assert.equal(policy.projectMemory, false)
assert.equal(policy.redis, true)
assert.equal(policy.redisWrite, true)
assert.equal(isToolWriteRequest({ method: 'GET', path: '/adjust/getHash' }), true)
assert.equal(isToolWriteRequest({ method: 'POST', path: '/adjust/ai-code/read' }), false)

console.log('aiPolicy tests passed')
