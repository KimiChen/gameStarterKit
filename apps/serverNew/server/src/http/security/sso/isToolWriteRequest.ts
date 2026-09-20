import { getAdjustRedisCommandAccess } from '@arthropoda/game-engine'

interface ToolRequestShape {
    method: string
    path: string
    body?: any
}

const READ_ONLY_POST_PATHS = new Set([
    '/config/history',
    '/adjust/get',
    '/adjust/getCustomFunction',
    '/adjust/customFunc/getOptions',
    '/adjust/case/tree',
    '/adjust/env/index',
    '/adjust/env/export',
    '/adjust/multipleCase/getList',
    '/adjust/multipleCase/detail',
    '/adjust/multipleCase/export',
    '/adjust/multipleCase/stats',
    '/adjust/userGroup/getList',
    '/adjust/ai-code/list',
    '/adjust/ai-code/read',
    '/adjust/ai-code/grep',
])

// `/adjust/wstool/getHash` 随 P6 删除旧协议链（`wstool.ts`）一并移除，后端已无此路由，不再登记。
const WRITE_GET_PATHS = new Set(['/adjust/getHash'])

export function isToolWriteRequest(req: ToolRequestShape) {
    if (WRITE_GET_PATHS.has(req.path)) {
        return true
    }
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
        return false
    }
    if (READ_ONLY_POST_PATHS.has(req.path)) {
        return false
    }
    if (req.path === '/adjust/redisCommand') {
        return getAdjustRedisCommandAccess(req.body?.command, req.body?.params) !== 'read'
    }
    return req.path.startsWith('/adjust/') || req.path.startsWith('/config/')
}
