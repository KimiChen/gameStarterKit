interface SnapshotNode {
    readonly id: number;
    readonly parent: number | null;
    readonly name: string;
    readonly kind: string;
}

function readNodes(values: readonly unknown[]): SnapshotNode[] {
    const ids = new Set<number>();
    return values.map((value) => {
        if (!value || typeof value !== 'object') throw new Error('Invalid PSD snapshot node');
        const node = value as Partial<SnapshotNode>;
        if (!Number.isInteger(node.id) || ids.has(node.id!)
            || (node.parent !== null && !Number.isInteger(node.parent))
            || typeof node.name !== 'string' || typeof node.kind !== 'string') {
            throw new Error('Invalid or duplicate PSD snapshot identity');
        }
        ids.add(node.id!);
        return node as SnapshotNode;
    });
}

/** Explicit author paths for this preview. Never infer components from a group name alone. */
export function promptPsdOwnership(values: readonly unknown[]) {
    const nodes = readNodes(values);
    function resolve(names: readonly string[]): number {
        let parent: number | null = null;
        for (const name of names) {
            const matches = nodes.filter(node => node.parent === parent && node.name === name && node.kind === 'view');
            if (matches.length !== 1) throw new Error(`Ambiguous or missing Prompt PSD author path: ${names.join(' > ')}`);
            parent = matches[0]!.id;
        }
        if (parent === null) throw new Error('Empty PSD author path');
        return parent;
    }
    const actions = ['PopupFrame', 'PopupFrame/Panel', 'PopupFrame/Content', 'Prompt/Content', 'Prompt/Actions'];
    return {
        schemaVersion: 1,
        kind: 'uniflex-component-declarations',
        definitions: [
            { key: 'Prompt', source: 'apps/client/src/ui-uniflex/pages/Prompt/Prompt.tsx' },
            { key: 'ActionButton', source: 'apps/client/src/ui-uniflex/components/button/ActionButton.tsx' },
        ],
        instances: [
            { key: 'prompt.actions.layout', definitionKey: 'Prompt', role: 'layout', rootRecordId: resolve(actions) },
            { key: 'prompt.confirm.action', definitionKey: 'ActionButton', role: 'component',
                rootRecordId: resolve([...actions, 'ActionButton']) },
            { key: 'prompt.cancel.action', definitionKey: 'ActionButton', role: 'component',
                rootRecordId: resolve([...actions, '', 'ActionButton']) },
        ],
    };
}
