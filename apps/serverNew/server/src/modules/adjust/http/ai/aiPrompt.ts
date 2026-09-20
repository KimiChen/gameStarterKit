import { timestamp } from '@arthropoda/game-engine'
import { AdjustPromptModel } from '../../../../../generated/persistence/AdjustPromptModel'
import { AdjustAiRequest, auditAi, digestAiValue, getAiOperator, getAdjustAiPolicy } from './aiPolicy'

export const PROMPT_TYPE_MEMORY = '1'
export const PROMPT_TYPE_SKILL = '2'
export const PROMPT_TYPE_PROJECT_MEMORY = '3'
export const PROMPT_TYPE_EXPERIENCE = '4'
export const PROJECT_MEMORY_NAME = 'project-memory.md'

const PROMPT_LIMITS: Record<string, { maxCount: number; maxLength: number }> = {
    [PROMPT_TYPE_MEMORY]: { maxCount: 50, maxLength: 250 },
    [PROMPT_TYPE_SKILL]: { maxCount: 30, maxLength: 12000 },
    [PROMPT_TYPE_PROJECT_MEMORY]: { maxCount: 1, maxLength: 50000 },
    [PROMPT_TYPE_EXPERIENCE]: { maxCount: 200, maxLength: 12000 },
}

interface PromptWriteBody {
    type?: string | number
    id?: number | null
    name?: string
    value?: string
    version?: number | null
    description?: string
}

interface PromptDeleteBody {
    id?: number
    version?: number | null
}

function response(status: number, msg: string, data: unknown = []) {
    return { status, msg, data }
}

function normalizePromptType(value: unknown) {
    const type = String(value ?? PROMPT_TYPE_MEMORY)
    return PROMPT_LIMITS[type] ? type : ''
}

function validatePromptName(type: string, value: unknown) {
    let name = String(value ?? '').trim()
    if (type === PROMPT_TYPE_PROJECT_MEMORY) name = PROJECT_MEMORY_NAME
    // eslint-disable-next-line no-control-regex
    if (!name || name.length > 64 || /[\u0000-\u001f\u007f/\\]/.test(name)) {
        return { name: '', error: 'Prompt 名称不合法' }
    }
    if (type === PROMPT_TYPE_SKILL && !/^[A-Za-z0-9_-]+\.md$/.test(name)) {
        return { name: '', error: '自定义技能文件名不合法' }
    }
    if (type === PROMPT_TYPE_EXPERIENCE && !/^[0-9]{10,13}-[A-Za-z0-9_\u4e00-\u9fa5-]+\.json$/.test(name)) {
        return { name: '', error: '经验 Case 文件名不合法' }
    }
    return { name }
}

function isPromptTypeEnabled(type: string) {
    const policy = getAdjustAiPolicy()
    if (type === PROMPT_TYPE_MEMORY || type === PROMPT_TYPE_PROJECT_MEMORY) return policy.projectMemory
    if (type === PROMPT_TYPE_EXPERIENCE) return policy.experienceCases
    if (type === PROMPT_TYPE_SKILL) return policy.customSkills
    return true
}

export async function readPrompts(typeValue: unknown, req: AdjustAiRequest) {
    const startedAt = Date.now()
    const type = normalizePromptType(typeValue)
    try {
        const policy = getAdjustAiPolicy()
        if (!policy.enabled) return response(1, '当前线路未开启 AI 助手')
        if (!type) return response(1, 'Prompt 类型不合法')
        if (!isPromptTypeEnabled(type)) return response(1, '当前线路未开启该 Prompt 类型')
        const rows = await AdjustPromptModel.find({ where: { type }, order: { id: 'ASC' } })
        const data = rows.map((row) => ({
            id: Number(row.id),
            name: row.name,
            value: row.value,
            version: row.version,
            description: row.description,
        }))
        auditAi(req, { action: 'prompt_list', type, resultCount: data.length, durationMs: Date.now() - startedAt })
        return response(0, '操作成功', data)
    } catch (error) {
        auditAi(req, { action: 'prompt_list', type, durationMs: Date.now() - startedAt }, error)
        throw error
    }
}

export async function writePrompt(body: PromptWriteBody, req: AdjustAiRequest) {
    const startedAt = Date.now()
    const type = normalizePromptType(body?.type)
    let name = ''
    const reject = (status: number, msg: string, data: unknown = []) => {
        auditAi(
            req,
            {
                action: 'prompt_write_rejected',
                type,
                nameDigest: digestAiValue(name || body?.name),
                resultStatus: status,
                durationMs: Date.now() - startedAt,
            },
            new Error(msg),
        )
        return response(status, msg, data)
    }
    try {
        const policy = getAdjustAiPolicy()
        if (!policy.enabled || !policy.promptWrite) return reject(1, '当前线路未开启 AI Prompt 写入')
        if (!type || !isPromptTypeEnabled(type)) return reject(1, 'Prompt 类型未开启')
        const nameResult = validatePromptName(type, body?.name)
        if (nameResult.error) return reject(1, nameResult.error)
        name = nameResult.name
        const value = String(body?.value ?? '')
        const limit = PROMPT_LIMITS[type]
        if (value.length > limit.maxLength) {
            return reject(5, `内容超过限制，最多 ${limit.maxLength} 字符`, { maxLength: limit.maxLength })
        }
        if (type === PROMPT_TYPE_EXPERIENCE) {
            try {
                const parsed = JSON.parse(value)
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
            } catch {
                return reject(7, '经验 Case 内容必须是合法 JSON')
            }
        }

        const id = Number(body?.id || 0)
        const clientVersion = body?.version === null || body?.version === undefined ? null : Number(body.version)
        let row = id > 0 ? await AdjustPromptModel.findOneBy({ id }) : await AdjustPromptModel.findOneBy({ type, name })
        if (id > 0 && !row) return reject(2, '记录不存在，请重新读取文件', { conflict: true })
        if (row && row.type !== type) return reject(2, 'Prompt 类型不匹配', { conflict: true })
        const expectsExistingRow = id > 0
        if (
            row &&
            clientVersion !== null &&
            row.version !== clientVersion &&
            (expectsExistingRow || clientVersion !== 0)
        ) {
            return reject(3, '版本冲突，请重新读取文件后再操作', { conflict: true, serverVersion: row.version })
        }
        if (!row) {
            const count = await AdjustPromptModel.countBy({ type })
            if (count >= limit.maxCount) return reject(4, `该类型 Prompt 数量已达上限（${count}/${limit.maxCount}）`)
            row = AdjustPromptModel.create()
            row.type = type
            row.name = name
            row.version = 1
            row.createTime = timestamp()
            row.createdBy = getAiOperator(req)
        } else {
            row.version += 1
        }
        row.value = value
        row.description = String(body?.description ?? row.description ?? '').slice(0, 2000)
        row.updateTime = timestamp()
        row.updatedBy = getAiOperator(req)
        await row.save()
        auditAi(req, {
            action: id > 0 ? 'prompt_update' : 'prompt_write',
            type,
            promptId: Number(row.id),
            nameDigest: digestAiValue(name),
            contentBytes: Buffer.byteLength(value),
            version: row.version,
            durationMs: Date.now() - startedAt,
        })
        return response(0, '操作成功', { id: Number(row.id), version: row.version })
    } catch (error) {
        auditAi(
            req,
            {
                action: 'prompt_write',
                type,
                nameDigest: digestAiValue(name),
                durationMs: Date.now() - startedAt,
            },
            error,
        )
        throw error
    }
}

export async function deletePrompt(body: PromptDeleteBody, req: AdjustAiRequest) {
    const startedAt = Date.now()
    const id = Number(body?.id || 0)
    const reject = (status: number, msg: string, data: unknown = []) => {
        auditAi(
            req,
            {
                action: 'prompt_delete_rejected',
                promptId: id,
                resultStatus: status,
                durationMs: Date.now() - startedAt,
            },
            new Error(msg),
        )
        return response(status, msg, data)
    }
    try {
        const policy = getAdjustAiPolicy()
        if (!policy.enabled || !policy.promptWrite) return reject(1, '当前线路未开启 AI Prompt 删除')
        if (!id) return reject(1, 'id 参数不能为空')
        const row = await AdjustPromptModel.findOneBy({ id })
        if (!row) return reject(2, '记录不存在，请重新读取文件', { conflict: true })
        if (!isPromptTypeEnabled(row.type)) return reject(1, '当前线路未开启该 Prompt 类型')
        const clientVersion = body?.version === null || body?.version === undefined ? null : Number(body.version)
        if (clientVersion !== null && row.version !== clientVersion) {
            return reject(3, '版本冲突，请重新读取文件后再操作', { conflict: true, serverVersion: row.version })
        }
        const auditFields = {
            action: 'prompt_delete',
            type: row.type,
            promptId: Number(row.id),
            nameDigest: digestAiValue(row.name),
            contentBytes: Buffer.byteLength(row.value),
            version: row.version,
        }
        await row.remove()
        auditAi(req, { ...auditFields, durationMs: Date.now() - startedAt })
        return response(0, '删除成功')
    } catch (error) {
        auditAi(req, { action: 'prompt_delete', promptId: id, durationMs: Date.now() - startedAt }, error)
        throw error
    }
}
