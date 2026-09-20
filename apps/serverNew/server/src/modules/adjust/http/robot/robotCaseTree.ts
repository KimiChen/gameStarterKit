export interface RobotCaseNode {
    id: number
    parent_id: number
    type: number
    name: string
    router: string
    content: string
    param: unknown[]
    ext: string
    children?: RobotCaseNode[]
}

export function buildRobotCaseTree(rows: RobotCaseNode[]) {
    const map = new Map<number, RobotCaseNode>()
    const roots: RobotCaseNode[] = []
    for (const row of rows) map.set(row.id, { ...row, children: [] })
    for (const row of rows) {
        const node = map.get(row.id)!
        const parent = map.get(row.parent_id)
        if (!parent || parent.type !== 0 || parent.id === node.id) {
            roots.push(node)
        } else {
            parent.children!.push(node)
        }
    }
    return roots
}

export function filterRobotCaseTree(nodes: RobotCaseNode[], types: Set<number>): RobotCaseNode[] {
    if (types.size === 0) return nodes
    const result: RobotCaseNode[] = []
    for (const node of nodes) {
        const children = filterRobotCaseTree(node.children ?? [], types)
        if (node.type === 0 ? children.length > 0 : types.has(node.type)) {
            result.push({ ...node, children })
        }
    }
    return result
}
