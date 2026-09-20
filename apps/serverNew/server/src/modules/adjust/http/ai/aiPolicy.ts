import { createHash } from 'crypto'
import { getHttpReqClientIp } from '@arthropoda/game-engine'
import { Request } from 'express'
import { AdjustSsoUser } from '../../../../http/security/sso/sso.types'

export interface AdjustAiPolicy {
    enabled: boolean
    promptWrite: boolean
    providerConfigWrite: boolean
    projectMemory: boolean
    experienceCases: boolean
    customSkills: boolean
    businessKnowledge: boolean
    logicKnowledge: boolean
    diffInfo: boolean
    gameConfig: boolean
    redis: boolean
    redisWrite: boolean
    customFunction: boolean
    mockClient: boolean
    serverCodeContext: boolean
}

export interface AdjustAiRequest extends Request {
    adjustSsoUser?: AdjustSsoUser
}

export function getAdjustAiPolicy(): AdjustAiPolicy {
    const config = CP.platform.adjustAi
    const enabled = config?.enabled === true
    return {
        enabled,
        promptWrite: enabled && config?.promptWrite === true,
        providerConfigWrite: enabled && config?.providerConfigWrite !== false,
        projectMemory: enabled && config?.projectMemory !== false,
        experienceCases: enabled && config?.experienceCases !== false,
        customSkills: enabled && config?.customSkills !== false,
        businessKnowledge: enabled && config?.businessKnowledge !== false,
        logicKnowledge: enabled && config?.logicKnowledge !== false,
        diffInfo: enabled && config?.diffInfo !== false,
        gameConfig: enabled && config?.gameConfig !== false,
        redis: enabled && config?.redis === true && CP.platform.adjustRedis?.enabled === true,
        redisWrite: enabled && config?.redisWrite === true && CP.platform.adjustRedis?.writeEnabled === true,
        customFunction: enabled && config?.customFunction === true,
        mockClient: enabled && config?.mockClient === true,
        serverCodeContext: enabled && config?.codeContext?.enabled === true,
    }
}

export function getAiOperator(req: AdjustAiRequest) {
    return req.adjustSsoUser?.name || req.adjustSsoUser?.account || 'sso-disabled'
}

export function digestAiValue(value: unknown) {
    const text = String(value ?? '')
    if (!text) return ''
    return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

export function auditAi(req: AdjustAiRequest, fields: Record<string, unknown>, error?: unknown) {
    const record = {
        time: new Date().toISOString(),
        operator: getAiOperator(req),
        operatorId: req.adjustSsoUser?.uid || '',
        isAdmin: req.adjustSsoUser?.isAdmin === true,
        source: req.get('x-adjust-tool-source') || 'web-tool',
        ip: getHttpReqClientIp(req),
        success: !error,
        ...fields,
        ...(error ? { errorType: error instanceof Error ? error.name : typeof error } : {}),
    }
    const line = `[adjust-ai-audit] ${JSON.stringify(record)}`
    if (error) Log.http.error(line)
    else Log.http.info(line)
}
