import { ChangeDocumentAction } from './ChangeDocumentAction'
import { ChangeDocumentField, ChangeDocumentNode } from './ChangeDocumentNode'

export class ChangeDocumentTreeNode extends ChangeDocumentNode {
    public actions: ChangeDocumentAction[] = []

    public runAction: ChangeDocumentAction[] = []

    public children: ChangeDocumentTreeNode[] = []

    public isLeaf: boolean = false

    public value: any = ''

    public addAction(p: ChangeDocumentAction): void {
        this.actions.push(p)
    }

    /**
     * 如果下发数据时children不为空，则前端展开当前节点时不会请求服务端而是直接加载 children 字段里的数据
     * @param node
     */
    public addChild(node: ChangeDocumentTreeNode): void {
        this.children.push(node)
    }

    public setUiIsLeaf(): void {
        this.isLeaf = true
    }

    /**
     * @param input string or ChangeDocumentField
     * @throws Error
     */
    public setUiValueType(input: string | ChangeDocumentField): void {
        const valueType = ChangeDocumentNode.getFormInputType(input)
        if (!['bool', 'int', 'number', 'text', 'timestamp'].includes(valueType)) {
            throw new Error('前端不支持该类型' + valueType)
        }
        this.setUiKeyValue(ChangeDocumentNode.UI_VALUE_TYPE, valueType)
    }

    public setUiOptions(array: any): void {
        this.setUiKeyValue(ChangeDocumentNode.UI_OPTIONS, array)
    }
}
