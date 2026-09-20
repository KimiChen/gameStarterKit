import assert from 'node:assert/strict'
import { MailNativeLobbyStore } from '../../../src/modules/mail/lobby/MailNativeLobbyStore'
import { installFakeCenterRedis } from '../../support/FakeCenterRedis'

const mail = { title: '标题', body: '正文', granted: [{ kind: 'item' as const, itemId: 29, count: 1 }] }

describe('mail native Lobby push ordering', () => {
    it('persists the mail before announcing it, so a missed push is recoverable by list', async () => {
        installFakeCenterRedis()
        const observed: number[] = []
        const store = new MailNativeLobbyStore(async () => {
            // 推送时必须已经能读到该邮件：通知只是唤醒，列表才是可恢复读面。
            observed.push((await store.list('external-1', 7, {})).mails.length)
            return true
        })
        const mailId = await store.deliver('external-1', 7, mail)
        assert.deepEqual(observed, [1])
        const listed = await store.list('external-1', 7, {})
        assert.equal(listed.mails.length, 1)
        assert.equal(listed.mails[0]!.mailId, mailId)
        assert.equal(listed.mails[0]!.hasAttach, true)
        assert.equal(listed.mails[0]!.read, false)
    })

    it('keeps the committed mail when the notification fails', async () => {
        installFakeCenterRedis()
        const store = new MailNativeLobbyStore(async () => false)
        const mailId = await store.deliver('external-2', 7, mail)
        const listed = await store.list('external-2', 7, {})
        assert.equal(listed.mails.length, 1)
        assert.equal(listed.mails[0]!.mailId, mailId)
    })

    it('claims an attachment once and returns the same receipt on retry', async () => {
        installFakeCenterRedis()
        const store = new MailNativeLobbyStore(async () => true)
        const mailId = await store.deliver('external-3', 7, mail)
        const first = await store.claim('external-3', 7, mailId)
        const retried = await store.claim('external-3', 7, mailId)
        assert.deepEqual(first, retried)
        assert.equal(first.status, 'done')
        assert.deepEqual(first.granted, mail.granted)
        await assert.rejects(
            () => store.claim('external-3', 7, mailId + 100),
            (error: { code: string }) => error.code === 'INVALID_PAYLOAD',
        )
    })

    it('pages the mailbox by mailId and marks read idempotently', async () => {
        installFakeCenterRedis()
        const store = new MailNativeLobbyStore(async () => true)
        const first = await store.deliver('external-4', 7, mail)
        const second = await store.deliver('external-4', 7, mail)
        const page = await store.list('external-4', 7, { limit: 1 })
        assert.deepEqual(
            page.mails.map((item) => item.mailId),
            [second],
        )
        const older = await store.list('external-4', 7, { before: second })
        assert.deepEqual(
            older.mails.map((item) => item.mailId),
            [first],
        )
        await store.markRead('external-4', 7, first)
        await store.markRead('external-4', 7, first)
        const after = await store.list('external-4', 7, { before: second })
        assert.equal(after.mails[0]!.read, true)
    })
})
