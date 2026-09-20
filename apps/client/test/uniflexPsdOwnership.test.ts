import test from 'node:test';
import assert from 'node:assert/strict';
import { declarePsdOwnership, promptPsdOwnership, stampPsdIdentities } from '../../web-ui-preview/psd-ownership';

function fixture(offset = 0) {
    const names = ['PopupFrame', 'PopupFrame/Panel', 'PopupFrame/Content', 'Prompt/Content',
        'Prompt/Actions', 'ActionButton', '', 'ActionButton'];
    const parents = [null, 1, 2, 3, 4, 5, 5, 7];
    return names.map((name, index) => ({ id: index + 1 + offset,
        parent: parents[index] === null ? null : parents[index]! + offset, name, kind: 'view' }));
}

test('Prompt author paths distinguish layout and same-name button instances', () => {
    const contract = promptPsdOwnership(fixture());
    assert.deepEqual(contract.instances.map(instance => [instance.role, instance.rootRecordId]),
        [['layout', 5], ['component', 6], ['component', 8]]);
});
test('author declarations do not depend on fixed runtime record IDs', () => {
    assert.deepEqual(promptPsdOwnership(fixture(100)).instances.map(instance => instance.rootRecordId),
        [105, 106, 108]);
});
test('ambiguous or missing author paths and duplicate IDs fail closed', () => {
    const nodes = fixture();
    assert.throws(() => promptPsdOwnership(nodes.slice(0, -1)), /missing/);
    assert.throws(() => promptPsdOwnership([...nodes, { ...nodes[5]!, id: 99 }]), /Ambiguous/);
    assert.throws(() => promptPsdOwnership([...nodes, nodes[0]!]), /duplicate/);
});

const page = {
    key: 'Prompt',
    source: 'apps/client/src/ui-uniflex/modules/popup/Prompt/Prompt.tsx',
    rootName: 'Prompt/Content',
};
const registered = [
    { key: 'PopupFrame', rootName: 'PopupFrame', source: 'apps/client/src/ui-uniflex/components/popup/PopupFrame.tsx' },
    { key: 'ActionButton', rootName: 'ActionButton', source: 'apps/client/src/ui-uniflex/components/button/ActionButton.tsx' },
    { key: 'WideMenuButton', rootName: 'WideMenuButton', source: 'apps/client/src/ui-uniflex/components/button/WideMenuButton.tsx' },
];

test('generic declarations bind the page root and every registered instance by author path', () => {
    const contract = declarePsdOwnership(fixture(), page, registered);
    assert.deepEqual(contract.definitions.map((definition) => definition.key), ['Prompt', 'PopupFrame', 'ActionButton']);
    assert.deepEqual(contract.instances.map((instance) => [instance.role, instance.rootRecordId]),
        [['page', 4], ['component', 1], ['component', 6], ['component', 8]]);
    assert.ok(contract.instances.some((instance) => instance.key.includes('ActionButton') && instance.key.includes('_')));
});

test('duplicate sibling component roots stay unique without inferred group names', () => {
    const nodes = [
        { id: 1, parent: null, name: 'Settings/Content', kind: 'view' },
        { id: 2, parent: 1, name: 'WideMenuButton', kind: 'view' },
        { id: 3, parent: 1, name: 'WideMenuButton', kind: 'view' },
    ];
    const contract = declarePsdOwnership(nodes, {
        key: 'Settings', source: 'apps/client/src/ui-uniflex/modules/settings/Settings/Settings.tsx',
        rootName: 'Settings/Content',
    }, registered);
    assert.deepEqual(contract.instances.filter((instance) => instance.definitionKey === 'WideMenuButton')
        .map((instance) => instance.key).sort(), [
        'WideMenuButton:Settings/Content/WideMenuButton:0',
        'WideMenuButton:Settings/Content/WideMenuButton:1',
    ]);
});

test('generic declarations fail closed when the page root is missing or ambiguous', () => {
    assert.throws(() => declarePsdOwnership(fixture(), { ...page, rootName: 'Missing' }, registered), /missing page root/);
    assert.throws(() => declarePsdOwnership([...fixture(), {
        id: 99, parent: null, name: 'Prompt/Content', kind: 'view',
    }], page, registered), /Ambiguous or missing page root/);
});

test('full-canvas nested panel stamps as a component when it is registered', () => {
    const nodes = [
        { id: 1, parent: null, name: 'AllianceTechPage', kind: 'view' },
        { id: 2, parent: 1, name: 'AllianceTech', kind: 'view' },
    ];
    const contract = declarePsdOwnership(nodes, {
        key: 'AllianceTech',
        source: 'apps/client/src/ui-uniflex/modules/alliance/AllianceTech/AllianceTech.tsx',
        rootName: 'AllianceTechPage',
    }, [{
        key: 'AllianceTechPanel',
        rootName: 'AllianceTech',
        source: 'apps/client/src/ui-uniflex/modules/alliance/AllianceTech/AllianceTechPanel.tsx',
    }]);
    assert.deepEqual(contract.instances.map((instance) =>
        [instance.role, instance.definitionKey, instance.rootRecordId]), [
        ['page', 'AllianceTech', 1],
        ['component', 'AllianceTechPanel', 2],
    ]);
});

test('snapshot identities use instance keys without # so PSD layer tags can round-trip', () => {
    const contract = declarePsdOwnership(fixture(), page, registered);
    const stamped = stampPsdIdentities(fixture(), contract) as Array<{ identity: { key: string, role: string, definitionKey?: string } }>;
    assert.equal(stamped[0]!.identity.role, 'component');
    assert.equal(stamped[3]!.identity.role, 'page');
    assert.equal(stamped[5]!.identity.definitionKey, 'ActionButton');
    assert.ok(stamped.every((node) => !node.identity.key.includes('#')));
});
