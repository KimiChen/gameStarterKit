export interface ChangeDocumentNode {
    // 节点的路由值,前端提交各类请求时会带上路由数组方便服务端处理
    route: string
    // 节点的文字
    desc: string

    // web展示绘制ui需要的数据
    ui?: any
    // web扩展数据，例如跳转下载的链接等
    ext?: any
    // 数据提供的方法
    dataProvider?: string
}

export interface ChangeDocumentAction extends ChangeDocumentNode {
    childNodeTemplate?: ChangeDocumentTreeNode
    controlNode?: ChangeDocumentTreeNode
}
export interface ChangeDocumentFunctionAction extends ChangeDocumentAction {
    group: string
    methodName: string
    inApiLumen: boolean
    canCustom: boolean
    sort: int
}

export interface ChangeDocumentTreeNode extends ChangeDocumentNode {
    actions: ChangeDocumentAction[]
    runAction: ChangeDocumentAction[]
    children: ChangeDocumentTreeNode[]
    isLeaf: boolean
    value: any
}

export interface ChangeDocument {
    root: ChangeDocumentTreeNode
    nodes: ChangeDocumentTreeNode[]
}
