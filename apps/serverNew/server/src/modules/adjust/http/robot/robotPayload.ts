import { ResError } from '../../../../http/constants/httpError'

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/
const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export const ROBOT_LIMITS = {
    maxCases: 5000,
    maxCaseContentBytes: 2 * 1024 * 1024,
    maxCaseParamBytes: 512 * 1024,
    maxCaseExtBytes: 2 * 1024 * 1024,
    maxBatchPlanBytes: 5 * 1024 * 1024,
    maxBatchUsers: 3000,
    maxUserGroups: 1000,
    maxImportBytes: 10 * 1024 * 1024,
}

export function robotSuccess(data: unknown = []) {
    return { status: 0, msg: '操作成功', data }
}

export function robotSuccessId(id: number) {
    return { status: 0, msg: '操作成功', id }
}

export function asRobotInteger(value: unknown, fallback = 0) {
    const number = Number(value)
    return Number.isInteger(number) ? number : fallback
}

export function normalizeRobotIds(value: unknown, maxCount = 500) {
    const input = Array.isArray(value) ? value : [value]
    const ids = Array.from(new Set(input.map((item) => asRobotInteger(item)).filter((id) => id > 0)))
    if (ids.length === 0) throw new ResError('请选择有效记录')
    if (ids.length > maxCount) throw new ResError(`单次最多处理 ${maxCount} 条记录`)
    return ids
}

export function validateRobotName(value: unknown, label = '名称') {
    const name = String(value ?? '').trim()
    if (!name || name.length > 64 || CONTROL_CHARACTER_PATTERN.test(name)) {
        throw new ResError(`${label}长度必须为 1-64 个字符`)
    }
    return name
}

export function validateRobotDescription(value: unknown) {
    const description = String(value ?? '')
    if (description.length > 2000 || CONTROL_CHARACTER_PATTERN.test(description)) {
        throw new ResError('描述不能超过 2000 个字符')
    }
    return description
}

export function stringifyRobotValue(value: unknown, maxBytes: number, label: string) {
    const result = typeof value === 'string' ? value : JSON.stringify(value ?? '')
    if (Buffer.byteLength(result) > maxBytes) throw new ResError(`${label}大小超出限制`)
    return result
}

export function parseRobotJson<T>(value: string, fallback: T): T {
    if (!value) return fallback
    try {
        return JSON.parse(value) as T
    } catch {
        return fallback
    }
}

export function normalizeEnvironmentPayload(body: Record<string, unknown>) {
    const name = validateRobotName(body.name, '变量名')
    if (!VARIABLE_NAME_PATTERN.test(name)) throw new ResError('变量名只能包含字母、数字和下划线，且不能以数字开头')
    const type = String(body.type ?? 'string')
    if (!['string', 'number', 'boolean', 'json', 'array'].includes(type)) throw new ResError('变量类型无效')
    const defaultValue = String(body.default_value ?? '')
    if (Buffer.byteLength(defaultValue) > 1024 * 1024) throw new ResError('变量默认值不能超过 1MB')
    if (type === 'number' && !Number.isFinite(Number(defaultValue))) throw new ResError('数字变量默认值无效')
    if (type === 'boolean' && !['true', 'false', '0', '1'].includes(defaultValue.toLowerCase())) {
        throw new ResError('布尔变量默认值无效')
    }
    if (type === 'json' || type === 'array') {
        let parsed: unknown
        try {
            parsed = JSON.parse(defaultValue)
        } catch {
            throw new ResError(type === 'array' ? '数组变量默认值必须是合法 JSON 数组' : 'JSON 变量默认值无效')
        }
        if (type === 'array' && !Array.isArray(parsed)) throw new ResError('数组变量默认值必须是合法 JSON 数组')
        if (type === 'json' && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
            throw new ResError('JSON 变量默认值必须是对象')
        }
    }
    return {
        name,
        type,
        defaultValue,
        description: validateRobotDescription(body.description),
    }
}

export interface RobotUserEntry {
    username: string
    password: string
    uid: string
    loginType: 'account' | 'uid'
    [key: string]: unknown
}

export function normalizeRobotUsers(value: unknown) {
    if (!Array.isArray(value)) throw new ResError('用户列表必须是数组')
    if (value.length === 0) throw new ResError('用户列表不能为空')
    if (value.length > ROBOT_LIMITS.maxBatchUsers) throw new ResError(`用户数量不能超过 ${ROBOT_LIMITS.maxBatchUsers}`)
    return value.map((raw, index) => {
        const user = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
        const uid = String(user.uid ?? '').trim()
        const username = String(user.username ?? user.name ?? '').trim()
        const password = String(user.password ?? '')
        const loginType = user.loginType === 'uid' || (uid && !username) ? 'uid' : 'account'
        if (loginType === 'uid') {
            if (!uid || uid.length > 64) throw new ResError(`第 ${index + 1} 个用户 UID 无效`)
        } else {
            if (!username || username.length > 64) throw new ResError(`第 ${index + 1} 个用户账号无效`)
            if (!password || password.length > 128) throw new ResError(`第 ${index + 1} 个用户密码无效`)
        }
        return { ...user, username, password, uid, loginType } as RobotUserEntry
    })
}

export function normalizeBatchPlanPayload(value: unknown) {
    let data: Record<string, unknown>
    if (typeof value === 'string') {
        try {
            data = JSON.parse(value)
        } catch {
            throw new ResError('批量方案数据必须是合法 JSON')
        }
    } else {
        data = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
    }
    const users = normalizeRobotUsers(data.users)
    const normalized = { ...data, users }
    const serialized = JSON.stringify(normalized)
    if (Buffer.byteLength(serialized) > ROBOT_LIMITS.maxBatchPlanBytes) throw new ResError('批量方案不能超过 5MB')
    return { data: normalized, serialized, userCount: users.length }
}

export function csvCell(value: unknown) {
    const text = String(value ?? '')
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function parseSimpleCsv(text: string) {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let quoted = false
    for (let index = 0; index < text.length; index++) {
        const char = text[index]
        if (char === '"') {
            if (quoted && text[index + 1] === '"') {
                cell += '"'
                index++
            } else {
                quoted = !quoted
            }
        } else if (char === ',' && !quoted) {
            row.push(cell)
            cell = ''
        } else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && text[index + 1] === '\n') index++
            row.push(cell)
            if (row.some((item) => item.length > 0)) rows.push(row)
            row = []
            cell = ''
        } else {
            cell += char
        }
    }
    row.push(cell)
    if (row.some((item) => item.length > 0)) rows.push(row)
    return rows
}
