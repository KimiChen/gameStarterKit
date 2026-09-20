import assert from 'assert'
import { E_APP_TYPE } from '@arthropoda/game-engine'
import { In } from '@arthropoda/typeorm'
import { initializeApplication } from '../../../src/startup/initializeApplication'
import { AdjustAccountWhiteModel } from '../../../generated/persistence/AdjustAccountWhiteModel'
import { AccountWhiteController } from '../../../src/modules/adjust/http/accountWhite.controller'

describe('account white integration', () => {
    it('persists, lists, audits and deletes accounts', async function () {
        this.timeout(30_000)
        const originalArgv = process.argv
        process.argv = [originalArgv[0], originalArgv[1], '-p', 'bearjoy', '-v', 'dev']
        try {
            await initializeApplication({ appType: E_APP_TYPE.API })
        } finally {
            process.argv = originalArgv
        }

        const suffix = Date.now().toString(36)
        const accounts = [`codex-white-${suffix}-a`, `codex-white-${suffix}-b`]
        const missingAccount = `codex-white-${suffix}-missing`
        const request = {
            headers: {},
            ip: '127.0.0.1',
            socket: { remoteAddress: '127.0.0.1' },
            adjustSsoUser: {
                uid: 'integration-test-user',
                name: 'integration-test-operator',
                account: 'integration-test-operator',
                isAdmin: true,
            },
        } as any
        const controller = new AccountWhiteController()
        const auditLines: string[] = []
        const httpLogger = Log.http as any
        const originalInfo = httpLogger.info.bind(httpLogger)
        httpLogger.info = (message: unknown) => {
            const line = String(message)
            if (line.startsWith('[adjust-account-white-audit]')) auditLines.push(line)
            originalInfo(message)
        }

        try {
            await AdjustAccountWhiteModel.delete({ account: In([...accounts, missingAccount]) })

            const added = (await controller.add(
                { accounts: [accounts[0], accounts[1], accounts[0], ''] },
                request,
            )) as any
            assert.strictEqual(added.data.addedCount, 2)
            assert.strictEqual(added.data.existingCount, 0)
            assert.strictEqual(added.data.duplicateCount, 1)
            assert.strictEqual(added.data.invalidCount, 1)

            const repeated = (await controller.add({ accounts }, request)) as any
            assert.strictEqual(repeated.data.addedCount, 0)
            assert.strictEqual(repeated.data.existingCount, 2)

            const listed = (await controller.list(request, `codex-white-${suffix}`)) as any
            assert.deepStrictEqual(listed.data.map((item: any) => item.account).sort(), [...accounts].sort())
            assert(listed.data.every((item: any) => item.createdBy === 'integration-test-operator'))

            const deleted = (await controller.del({ accounts: [...accounts, missingAccount] }, request)) as any
            assert.strictEqual(deleted.data.deletedCount, 2)
            assert.strictEqual(deleted.data.notFoundCount, 1)
            assert.strictEqual(await AdjustAccountWhiteModel.countBy({ account: In(accounts) }), 0)

            assert(auditLines.length >= 4)
            assert(auditLines.every((line) => line.includes('accountDigest') || line.includes('"action":"list"')))
            assert(auditLines.every((line) => accounts.every((account) => !line.includes(account))))

            console.log('accountWhite integration tests passed')
        } finally {
            httpLogger.info = originalInfo
            await AdjustAccountWhiteModel.delete({ account: In([...accounts, missingAccount]) })
        }
    })
})
