import {
    ChangeDocument,
    ChangeDocumentAction,
    ChangeDocumentFunctionAction,
    ChangeDocumentTreeNode,
} from './ChangeDocument'

function cloneNode(node: ChangeDocumentTreeNode): ChangeDocumentTreeNode {
    return JSON.parse(JSON.stringify(node)) as ChangeDocumentTreeNode
}

function isFunctionAction(action: ChangeDocumentAction): action is ChangeDocumentFunctionAction {
    return 'canCustom' in action
}

function filterCustomFunctionNode(source: ChangeDocumentTreeNode): ChangeDocumentTreeNode | undefined {
    const node = cloneNode(source)
    const functionActions = node.actions.filter(isFunctionAction)
    if (functionActions.length > 0) {
        node.actions = functionActions.filter((action) => action.canCustom === true)
    }
    node.children = node.children
        .map((child) => filterCustomFunctionNode(child))
        .filter((child): child is ChangeDocumentTreeNode => child !== undefined)

    if (functionActions.length > 0 && node.actions.length === 0 && node.children.length === 0) {
        return undefined
    }
    if (source.children.length > 0 && node.children.length === 0 && node.actions.length === 0) {
        return undefined
    }
    return node
}

export function filterCustomFunctionDocument(source: ChangeDocument): ChangeDocument {
    const nodes = source.nodes
        .map((node) => filterCustomFunctionNode(node))
        .filter((node): node is ChangeDocumentTreeNode => node !== undefined)
    const routes = new Set(nodes.map((node) => node.route))
    const root = cloneNode(source.root)
    root.children = root.children.filter((node) => routes.has(node.route))
    return { ...source, root, nodes }
}
