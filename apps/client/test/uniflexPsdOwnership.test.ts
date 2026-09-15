import test from 'node:test';
import assert from 'node:assert/strict';
import { declarePsdOwnership, promptPsdOwnership } from '../../web-ui-preview/psd-ownership';

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
    source: 'apps/client/src/ui-uniflex/pages/Prompt/Prompt.tsx',
    rootName: 'Prompt/Content',
};
const registered = [
    { key: 'PopupFrame', rootName: 'PopupFrame', source: 'apps/client/src/ui-uniflex/components/popup/PopupFrame.tsx' },
    { key: 'ActionButton', rootName: 'ActionButton', source: 'apps/client/src/ui-uniflex/components/button/ActionButton.tsx' },
    { key: 'SettingsMenuButton', rootName: 'SettingsMenuButton', source: 'apps/client/src/ui-uniflex/pages/Settings/SettingsMenuButton.tsx' },
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
        { id: 2, parent: 1, name: 'SettingsMenuButton', kind: 'view' },
        { id: 3, parent: 1, name: 'SettingsMenuButton', kind: 'view' },
    ];
    const contract = declarePsdOwnership(nodes, {
        key: 'Settings', source: 'apps/client/src/ui-uniflex/pages/Settings/Settings.tsx',
        rootName: 'Settings/Content',
    }, registered);
    assert.deepEqual(contract.instances.filter((instance) => instance.definitionKey === 'SettingsMenuButton')
        .map((instance) => instance.key).sort(), [
        'SettingsMenuButton:Settings/Content/SettingsMenuButton#0',
        'SettingsMenuButton:Settings/Content/SettingsMenuButton#1',
    ]);
});

test('generic declarations fail closed when the page root is missing or ambiguous', () => {
    assert.throws(() => declarePsdOwnership(fixture(), { ...page, rootName: 'Missing' }, registered), /missing page root/);
    assert.throws(() => declarePsdOwnership([...fixture(), {
        id: 99, parent: null, name: 'Prompt/Content', kind: 'view',
    }], page, registered), /Ambiguous or missing page root/);
});
