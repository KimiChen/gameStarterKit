export interface AdjustCaseRecord {
    id: number
    name: string
    parent_id: number
    type: number
    router: string
    content: string
    param: string
    ext: string
}

export interface AdjustCaseNode extends AdjustCaseRecord {
    children: AdjustCaseNode[]
}

const CASE_TYPES = new Set([0, 1, 2, 3])

export function normalizeCaseTypes(value: unknown) {
    const values = Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value]
    const result: number[] = []
    for (const item of values) {
        const type = Number(item)
        if (Number.isInteger(type) && CASE_TYPES.has(type) && !result.includes(type)) {
            result.push(type)
        }
    }
    return result
}

export function serializeCaseField(value: unknown, fallback = '') {
    if (value === undefined || value === null) {
        return fallback
    }
    if (typeof value === 'string') {
        return value
    }
    return JSON.stringify(value)
}

export function buildCaseTree(records: AdjustCaseRecord[]) {
    const indexed = new Map<number, AdjustCaseNode>()
    for (const record of records) {
        const id = Number(record.id)
        if (!Number.isSafeInteger(id) || id <= 0) continue
        indexed.set(id, {
            ...record,
            id,
            parent_id: Number(record.parent_id) || 0,
            type: Number(record.type) || 0,
            children: [],
        })
    }

    const tree: AdjustCaseNode[] = []
    for (const node of indexed.values()) {
        if (node.parent_id === 0) {
            tree.push(node)
            continue
        }
        const parent = indexed.get(node.parent_id)
        if (parent && parent !== node) {
            parent.children.push(node)
        }
    }
    return tree
}
