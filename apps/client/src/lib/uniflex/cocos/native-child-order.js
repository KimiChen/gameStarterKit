/** 只在一次完整 Host commit 的末尾校准，每个物理父节点最多访问一次。 */
export class NativeChildOrderBatch {
    constructor(ownerOf, childrenOf) {
        this.ownerOf = ownerOf;
        this.childrenOf = childrenOf;
        this.pending = new Map();
    }
    queue(parent) {
        if (!parent || this.pending.has(parent))
            return;
        const owner = this.ownerOf(parent);
        // 共享 Surface 容器由 compositor 排序，不属于任一 Host 的普通子树。
        if (owner)
            this.pending.set(parent, { owner, tail: new Set() });
    }
    putLast(parent, child) {
        let entry = this.pending.get(parent);
        if (!entry) {
            entry = { owner: this.ownerOf(parent), tail: new Set() };
            this.pending.set(parent, entry);
        }
        // 同批重复移动浮层时，最后一次逻辑移动决定尾部顺序。
        entry.tail.delete(child);
        entry.tail.add(child);
    }
    flush() {
        if (this.pending.size === 0)
            return;
        for (const [parent, entry] of this.pending) {
            if (!parent.isValid)
                continue;
            const children = [];
            let first = parent.children.length;
            if (entry.owner) {
                for (const child of this.childrenOf(entry.owner)) {
                    if (!child.isValid || child.parent !== parent || entry.tail.has(child))
                        continue;
                    children.push(child);
                    first = Math.min(first, child.getSiblingIndex());
                }
            }
            // 延续既有语义：逻辑节点从最早的已有位置连续排列，foreign 节点相对顺序不变。
            for (const child of children) {
                if (child.getSiblingIndex() !== first)
                    child.setSiblingIndex(first);
                first++;
            }
            const tail = [...entry.tail].filter((child) => child.isValid && child.parent === parent);
            let index = parent.children.length - tail.length;
            for (const child of tail) {
                if (child.getSiblingIndex() !== index)
                    child.setSiblingIndex(index);
                index++;
            }
        }
    }
    /** 成功、失败及补偿提交都不能继承上一批的物理父节点。 */
    clear() {
        this.pending.clear();
    }
}
