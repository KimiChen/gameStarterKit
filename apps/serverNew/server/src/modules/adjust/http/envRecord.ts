export interface AdjustEnvRecord {
    id: number
    name: string
    type: string
    default_value: string
    description: string
}

interface AdjustEnvRow {
    id: number
    name: string
    type: string
    defaultValue: string
    description: string
}

interface AdjustEnvInput {
    name?: unknown
    type?: unknown
    default_value?: unknown
    description?: unknown
}

export type NormalizedAdjustEnvInput =
    { value: Omit<AdjustEnvRecord, 'id'>; error?: never } | { value?: never; error: string }

const ENV_TYPES = new Set(['string', 'number', 'boolean', 'json', 'array'])

export function adjustEnvRecord(row: AdjustEnvRow): AdjustEnvRecord {
    return {
        id: Number(row.id),
        name: row.name,
        type: row.type,
        default_value: row.defaultValue,
        description: row.description,
    }
}

export function normalizeAdjustEnvInput(input: AdjustEnvInput): NormalizedAdjustEnvInput {
    const name = typeof input?.name === 'string' ? input.name.trim() : ''
    const type = typeof input?.type === 'string' ? input.type.trim() : ''
    if (!name || name.length > 64) {
        return { error: '变量名长度必须为1到64个字符' }
    }
    if (!ENV_TYPES.has(type)) {
        return { error: '变量类型无效' }
    }
    if (typeof input?.default_value !== 'string') {
        return { error: '默认值必须为字符串' }
    }
    if (input?.description !== undefined && typeof input.description !== 'string') {
        return { error: '变量描述必须为字符串' }
    }
    return {
        value: {
            name,
            type,
            default_value: input.default_value,
            description: input.description ?? '',
        },
    }
}

export function positiveEnvIds(value: unknown) {
    const values = Array.isArray(value) ? value : [value]
    return [...new Set(values.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
}
