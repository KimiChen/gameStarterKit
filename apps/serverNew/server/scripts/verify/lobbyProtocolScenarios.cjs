'use strict'

/** Real-storage scenarios for the routes still owned by serverNew. */
const { check, equal, deepEqual, scenario } = require('./lobbyLiveHarness.cjs')

async function runLobbyProtocolScenarios(h, ctx) {
    const { clients, platform } = ctx
    const connect = h.makeConnector(clients)
    const { IncomeRpc } = h

    await scenario(`启动落在隔离线路的中心库（db ${h.CENTER_REDIS_DB}）`, async () => {
        const probe = h.redis('get', `IdGenerater:user:${h.SID}`)
        check(probe !== '', `中心库 db ${h.CENTER_REDIS_DB} 没有 IdGenerater:user:${h.SID}`)
        return `IdGenerater:user:${h.SID}=${probe}`
    })

    await scenario('认证：真票回源、登记角色并建立内部 User Bean', async () => {
        const uid = `live-auth-${h.RUN_ID}`
        const beforeVerify = platform.verifyCalls
        const beforeRegister = platform.registerCalls
        await connect(`tk-auth-${h.RUN_ID}`, uid)
        equal(platform.verifyCalls, beforeVerify + 1, '认证必须回源一次')
        equal(platform.registerCalls, beforeRegister + 1, '认证必须登记一次角色')
        const internalUid = Number(h.redis('hget', 'nativeLobby:identity:v1', `${h.SID}:${uid}`))
        check(Number.isSafeInteger(internalUid) && internalUid > 0, `内部 uid 非法：${internalUid}`)
        equal(Number(h.userRedis('hget', `User_${internalUid}`, 'id')), internalUid, 'User Bean 必须真实落盘')
        return `external=${uid} internal=${internalUid}`
    })

    await scenario('income：只走 User Bean，并由通用幂等闸重放同一结果与 sync', async () => {
        const uid = `live-income-${h.RUN_ID}`
        const client = await connect(`tk-income-${h.RUN_ID}`, uid)
        const internalUid = Number(h.redis('hget', 'nativeLobby:identity:v1', `${h.SID}:${uid}`))
        const userKey = `User_${internalUid}`

        client.send(h.rpc('i1', IncomeRpc.GetPending))
        const pending = await client.next()
        check(pending.kind === 'reply' && pending.reply.ok === true, `getPending 失败：${JSON.stringify(pending)}`)
        equal(pending.reply.data.copper, Number(h.userRedis('hget', userKey, 'copper') || 0), '余额必须来自 User Bean')
        equal(h.redis('exists', 'nativeLobby:income:account:v1'), '0', '第二套 income Redis 账户不得复活')

        const clientReqId = `income-${h.RUN_ID}`
        client.send(h.rpc('i2', IncomeRpc.ClaimOffline, { clientReqId }))
        const claimed = await client.next()
        check(claimed.kind === 'reply' && claimed.reply.ok === true, `claimOffline 失败：${JSON.stringify(claimed)}`)
        assertHiddenFieldsAbsent(claimed.reply.sync, 'claimOffline')

        client.send(h.rpc('i3', IncomeRpc.ClaimOffline, { clientReqId }))
        const replayed = await client.next()
        check(replayed.kind === 'reply' && replayed.reply.ok === true, `重放失败：${JSON.stringify(replayed)}`)
        deepEqual(replayed.reply.data, claimed.reply.data, '重放必须返回首次 data')
        deepEqual(replayed.reply.sync, claimed.reply.sync, '重放必须返回首次 sync')
        return `uid=${internalUid} balance=${claimed.reply.data.balance}`
    })
}

function assertHiddenFieldsAbsent(sync, label) {
    const mods = (sync && sync.mods) || {}
    for (const [modName, payload] of Object.entries(mods)) {
        if (modName === 'versions' || !payload || typeof payload !== 'object') continue
        for (const hidden of ['lastCopperIncomeTime', 'offlineCopperPending', 'offlineCopperSecondsPending']) {
            check(!(hidden in payload), `${label} 不得公开 ${hidden}（模块 ${modName}）`)
        }
    }
}

module.exports = { runLobbyProtocolScenarios }
