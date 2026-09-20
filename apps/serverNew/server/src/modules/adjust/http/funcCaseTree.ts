export interface FuncCaseTreeRow {
    id: number
    parent_id: number
    type: number
    name: string
    sort: number
}

export interface FuncCaseTreeNode extends FuncCaseTreeRow {
    children: FuncCaseTreeNode[]
}

export function buildFuncCaseTree(rows: FuncCaseTreeRow[]) {
    const nodes = new Map<number, FuncCaseTreeNode>()
    for (const row of rows) {
        nodes.set(row.id, { ...row, children: [] })
    }

    const roots: FuncCaseTreeNode[] = []
    for (const row of rows) {
        const node = nodes.get(row.id)!
        const parent = nodes.get(row.parent_id)
        if (row.parent_id > 0 && parent?.type === 0) {
            parent.children.push(node)
        } else {
            roots.push(node)
        }
    }
    return roots
}
