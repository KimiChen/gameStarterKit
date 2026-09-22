import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CopperIncome } from '../../../src/modules/user/action/CopperIncome'

function user() {
    return {
        lv: 1,
        copper: 200,
        lastCopperIncomeTime: 100,
        offlineCopperPending: 50,
        offlineCopperSecondsPending: 10,
    } as any
}

test('CopperIncome stores offline rewards on User and claims them once', () => {
    const value = user()
    assert.deepEqual(CopperIncome.pendingOffline(value), { offlineSeconds: 10, copper: 50 })
    assert.deepEqual(CopperIncome.claimOffline(value), { offlineSeconds: 10, copper: 50 })
    assert.equal(value.copper, 250)
    assert.equal(value.offlineCopperPending, 0)
    assert.equal(value.offlineCopperSecondsPending, 0)
    assert.deepEqual(CopperIncome.claimOffline(value), { offlineSeconds: 0, copper: 0 })
    assert.equal(value.copper, 250)
})
