export interface RegisteredComponent {
    readonly key: string;
    readonly rootName: string;
    readonly source: string;
}

interface SnapshotNode {
    readonly id: number;
    readonly parent: number | null;
    readonly name: string;
    readonly kind: string;
}

export interface PageOwnershipSpec {
    readonly key: string;
    readonly source: string;
    readonly rootName: string;
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

function authorPath(
    nodes: readonly SnapshotNode[],
    node: SnapshotNode,
    ancestorId: number | null = null,
): string {
    const byId = new Map(nodes.map((entry) => [entry.id, entry]));
    const seen = new Set<number>();
    const parts: string[] = [];
    let current: SnapshotNode | undefined = node;
    while (current && current.id !== ancestorId) {
        if (seen.has(current.id)) throw new Error('Cycle in PSD snapshot parent chain');
        seen.add(current.id);
        const siblings = nodes.filter((entry) =>
            entry.parent === current!.parent && entry.name === current!.name && entry.kind === current!.kind);
        const index = siblings.findIndex((entry) => entry.id === current!.id);
        const label = current.name || '_';
        parts.unshift(siblings.length > 1 ? `${label}:${index}` : label);
        if (current.parent === null || current.parent === ancestorId) break;
        const parent = byId.get(current.parent);
        if (!parent) throw new Error(`Broken PSD snapshot parent for ${current.id}`);
        current = parent;
    }
    return parts.join('/');
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
            { key: 'Prompt', source: 'apps/client/src/ui-uniflex/modules/popup/Prompt/Prompt.tsx' },
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

/**
 * Page definition plus every registered component whose named root is in the
 * snapshot. Duplicate sibling names are distinguished by author path index.
 * Missing registered components are skipped; a missing page root fails closed.
 */
export function declarePsdOwnership(
    values: readonly unknown[],
    page: PageOwnershipSpec,
    components: readonly RegisteredComponent[],
) {
    const nodes = readNodes(values);
    const views = nodes.filter((node) => node.kind === 'view');
    const pageRoots = views.filter((node) => node.name === page.rootName);
    if (pageRoots.length !== 1) {
        throw new Error(`Ambiguous or missing page root ${page.rootName} (${pageRoots.length} matches)`);
    }
    const definitions = [{ key: page.key, source: page.source }];
    const instances: Array<{
        key: string;
        definitionKey: string;
        role: 'page' | 'component';
        rootRecordId: number;
    }> = [{
        key: `${page.key}.root`,
        definitionKey: page.key,
        role: 'page',
        rootRecordId: pageRoots[0]!.id,
    }];
    const defined = new Set([page.key]);
    for (const component of components) {
        const matches = views.filter((node) => node.name === component.rootName);
        if (!matches.length) continue;
        if (!defined.has(component.key)) {
            definitions.push({ key: component.key, source: component.source });
            defined.add(component.key);
        }
        const seen = new Set<string>();
        for (const match of matches) {
            const key = `${component.key}:${authorPath(nodes, match)}`;
            if (seen.has(key)) throw new Error(`Ambiguous component instance ${key}`);
            seen.add(key);
            instances.push({
                key,
                definitionKey: component.key,
                role: 'component',
                rootRecordId: match.id,
            });
        }
    }
    return {
        schemaVersion: 1 as const,
        kind: 'uniflex-component-declarations' as const,
        definitions,
        instances,
    };
}

export type IdentityRole = 'node' | 'component' | 'page' | 'layout' | 'fill';

export interface NodeIdentity {
    readonly key: string;
    readonly role: IdentityRole;
    readonly definitionKey?: string;
}

function instanceDepth(nodes: readonly SnapshotNode[], rootId: number): number {
    const byId = new Map(nodes.map((entry) => [entry.id, entry]));
    let depth = 0;
    let current: SnapshotNode | undefined = byId.get(rootId);
    const seen = new Set<number>();
    while (current) {
        if (seen.has(current.id)) throw new Error('Cycle in PSD snapshot parent chain');
        seen.add(current.id);
        depth += 1;
        current = current.parent === null ? undefined : byId.get(current.parent);
    }
    return depth;
}

/**
 * Stamp a stable octane-lite identity onto every snapshot node. Keys never
 * contain `#` because PSD layer names use `[ui:key#role]`.
 */
export function stampPsdIdentities(
    values: readonly unknown[],
    declarations: ReturnType<typeof declarePsdOwnership>,
): unknown[] {
    const nodes = readNodes(values);
    const children = new Map<number, number[]>();
    for (const node of nodes) {
        if (node.parent === null) continue;
        const list = children.get(node.parent) ?? [];
        list.push(node.id);
        children.set(node.parent, list);
    }
    const ranked = [...declarations.instances].sort((left, right) =>
        instanceDepth(nodes, left.rootRecordId) - instanceDepth(nodes, right.rootRecordId));
    const owner = new Map<number, (typeof declarations.instances)[number]>();
    const cover = (id: number, instance: (typeof declarations.instances)[number]): void => {
        owner.set(id, instance);
        for (const child of children.get(id) ?? []) cover(child, instance);
    };
    for (const instance of ranked) cover(instance.rootRecordId, instance);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return values.map((value, index) => {
        const node = nodes[index]!;
        const instance = owner.get(node.id);
        let identity: NodeIdentity;
        if (!instance) {
            identity = { key: authorPath(nodes, node), role: 'node' };
        } else if (node.id === instance.rootRecordId) {
            identity = {
                key: instance.key,
                role: instance.role,
                definitionKey: instance.definitionKey,
            };
        } else {
            identity = {
                key: `${instance.key}/${authorPath(nodes, byId.get(node.id)!, instance.rootRecordId)}`,
                role: 'node',
                definitionKey: instance.definitionKey,
            };
        }
        if (identity.key.includes('#') || identity.key.includes(']')) {
            throw new Error(`Identity key must not contain # or ]: ${identity.key}`);
        }
        return { ...(value as object), identity };
    });
}
