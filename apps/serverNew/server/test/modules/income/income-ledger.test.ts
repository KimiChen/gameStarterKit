import assert from 'node:assert/strict'
import { IncomeLedger } from '../../../src/modules/income/IncomeLedger'

describe('IncomeLedger', () => {
    it('initializes a new native account and settles online and offline income without a legacy User bean', () => {
        const account = IncomeLedger.create(100)
        assert.deepEqual(account, {
            level: 1,
            copper: 0,
            lastIncomeAt: 100,
            offlineCopper: 0,
            offlineSeconds: 0,
        })

        assert.equal(IncomeLedger.perInterval(account.level), 100)
        assert.equal(IncomeLedger.settleOnline(account, 112), 200)
        assert.equal(account.copper, 200)
        assert.equal(account.lastIncomeAt, 110, '在线余量保留给下一次结算')

        assert.deepEqual(IncomeLedger.parkOffline(account, 230), { offlineSeconds: 120, copper: 2400 })
        assert.deepEqual(IncomeLedger.pendingOffline(account), { offlineSeconds: 120, copper: 2400 })
        assert.equal(account.copper, 200, '登录暂存不直接入账')

        assert.deepEqual(IncomeLedger.claimOffline(account), { offlineSeconds: 120, copper: 2400 })
        assert.equal(account.copper, 2600)
        assert.deepEqual(IncomeLedger.pendingOffline(account), { offlineSeconds: 0, copper: 0 })
    })
})
