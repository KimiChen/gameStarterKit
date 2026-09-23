import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCAL_DEV_ACCOUNT_KEY, resolveLocalDevAccount, validDevAccountKey } from '../src/logic/page/LocalDevAccount';

function browser() {
    const data = new Map<string, string>();
    return { data, getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => { data.set(key, value); } };
}

test('first login saves one identity; reload and retries reuse it without generating another', () => {
    const storage = browser();
    let created = 0;
    const create = () => `guest_${++created}`;
    assert.equal(resolveLocalDevAccount(null, storage, create), 'guest_1');
    assert.equal(storage.data.get(LOCAL_DEV_ACCOUNT_KEY), 'guest_1');
    assert.equal(resolveLocalDevAccount(null, storage, create), 'guest_1');
    assert.equal(created, 1);
});

test('separate browser caches have separate accounts; clearing cache creates a new account', () => {
    const a = browser(), b = browser();
    let counter = 0;
    const create = () => `guest_${++counter}`;
    const first = resolveLocalDevAccount(null, a, create);
    assert.notEqual(resolveLocalDevAccount(null, b, create), first);
    a.data.clear();
    assert.notEqual(resolveLocalDevAccount(null, a, create), first);
});

test('explicit test identity leaves the cached default intact, even with unavailable storage', () => {
    const storage = browser();
    resolveLocalDevAccount(null, storage, () => 'browser_default');
    assert.equal(resolveLocalDevAccount(' player2 ', storage, () => { throw Error('unexpected'); }), 'player2');
    assert.equal(resolveLocalDevAccount(null, storage, () => { throw Error('unexpected'); }), 'browser_default');
    assert.equal(resolveLocalDevAccount('player3', {
        getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); },
    }, () => 'unused'), 'player3');
});

test('invalid overrides use cached identity; corrupt cache is replaced with a valid one', () => {
    const storage = browser();
    storage.data.set(LOCAL_DEV_ACCOUNT_KEY, 'broken key');
    assert.equal(resolveLocalDevAccount('x'.repeat(33), storage, () => 'fresh'), 'fresh');
    assert.equal(resolveLocalDevAccount('', storage, () => 'another'), 'fresh');
    assert.equal(validDevAccountKey('a'.repeat(32)), 'a'.repeat(32));
    assert.equal(validDevAccountKey('中文'), null);
});

test('storage failures never return an unpersisted identity for registration', () => {
    assert.throws(() => resolveLocalDevAccount(null, {
        getItem: () => null, setItem() { throw Error('quota'); },
    }, () => 'guest'), /quota/);
    assert.throws(() => resolveLocalDevAccount(null, {
        getItem: () => null, setItem() {},
    }, () => 'guest'), /could not be saved/);
});
