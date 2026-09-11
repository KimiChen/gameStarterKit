/** Cocos 原生父节点可能同时拥有逻辑子节点、内部节点和独立浮层。 */
export interface OrderedNativeNode<Node> {
    readonly isValid: boolean;
    readonly parent: Node | null;
    readonly children: readonly Node[];
    getSiblingIndex(): number;
    setSiblingIndex(index: number): void;
}
/** 只在一次完整 Host commit 的末尾校准，每个物理父节点最多访问一次。 */
export declare class NativeChildOrderBatch<Node extends OrderedNativeNode<Node>, Owner> {
    private readonly ownerOf;
    private readonly childrenOf;
    private readonly pending;
    constructor(ownerOf: (parent: Node) => Owner | undefined, childrenOf: (owner: Owner) => Iterable<Node>);
    queue(parent: Node | null): void;
    putLast(parent: Node, child: Node): void;
    flush(): void;
    /** 成功、失败及补偿提交都不能继承上一批的物理父节点。 */
    clear(): void;
}
