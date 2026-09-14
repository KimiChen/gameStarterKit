import test from 'node:test';
import assert from 'node:assert/strict';
import { promptPsdOwnership } from '../../web-ui-preview/psd-ownership';

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
