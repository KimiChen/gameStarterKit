'use strict'

/**
 * 原生 Lobby 的**同一份**协议场景集。
 *
 * 单进程线路（`native-lobby-live.cjs`）与真实多进程线路
 * （`native-lobby-multiprocess-live.cjs`）都调用 `runLobbyProtocolScenarios`，
 * 于是 P5 验收里的「单进程和多进程的同一组协议用例行为一致」是**同一份代码跑两个拓扑**，
 * 而不是两份脚本各自宣布自己绿。
 *
 * 断言全部落在**真实存储**上（`redis-cli` 直读，不复用生产读函数）与**服务进程自己返回的
 * 结论**上；脚本推算出来的值不作为证据。
 */

const { check, equal, deepEqual, fail, scenario } = require('./lobbyLiveHarness.cjs')

/**
 * @param h `createHarness()` 产出的自检上下文（含夹具常量与真实 Redis 读面）
 * @param ctx `{ clients, platform }`：连接回收列表与平台桩（统计回源次数用）
 */
async function runLobbyProtocolScenarios(h, ctx) {
    const { clients, platform } = ctx
    const connect = h.makeConnector(clients)
    const { UserRpc, GuildRpc, RoomRpc, ForceLogoutReason, KICK_CLOSE_CODE } = h

    // 启动自检：隔离的中心库必须真的被这次启动写过，否则后面的存储断言没有意义。
    await scenario(`启动落在隔离线路的中心库（db ${h.CENTER_REDIS_DB}）`, async () => {
        const probe = h.redis('get', `IdGenerater:user:${h.SID}`)
        check(probe !== '', `中心库 db ${h.CENTER_REDIS_DB} 没有 IdGenerater:user:${h.SID}，说明启动没走联调线路`)
        return `IdGenerater:user:${h.SID}=${probe}`
    })

    // ---- 认证
    await scenario('认证：真票 → auth.ok 且 uid/区服来自回源结果', async () => {
        const uid = `live-auth-${h.RUN_ID}`
        const before = platform.verifyCalls
        const client = await connect(`tk-auth-${h.RUN_ID}`, uid)
        equal(platform.verifyCalls, before + 1, '认证必须回源一次')
        check(platform.registerCalls >= 1, '认证建档必须先登记外部角色')
        await client.expectIdle(300)
        return `回源 ${platform.verifyCalls - before} 次，登记 ${platform.registerCalls} 次`
    })

    // ---- 查询
    await scenario('查询：user.getInfo / user.getProfile 走真实存储', async () => {
        const uid = `live-query-${h.RUN_ID}`
        const client = await connect(`tk-query-${h.RUN_ID}`, uid)

        client.send(h.rpc('q1', UserRpc.GetInfo))
        const info = await client.next()
        check(info.kind === 'reply' && info.reply.ok === true, `getInfo 应成功：${JSON.stringify(info)}`)
        check(typeof info.reply.data.user.ver === 'number', 'getInfo 必须带档版本 ver')

        client.send(h.rpc('q2', UserRpc.GetProfile, { uid }))
        const profile = await client.next()
        check(profile.kind === 'reply' && profile.reply.ok === true, `getProfile 应成功：${JSON.stringify(profile)}`)
        check(typeof profile.reply.data.profile.nickname === 'string', 'getProfile 必须返回昵称字符串')
        return `ver=${info.reply.data.user.ver} nickname=${JSON.stringify(profile.reply.data.profile.nickname)}`
    })

    // ---- 幂等写 + 领域推送
    await scenario('幂等写：同 clientReqId 重放不产生第二份副作用（含真实 Redis 与领域推送）', async () => {
        const uid = `live-idem-${h.RUN_ID}`
        // 生产公会目录是固定集合 `GUILD_IDS = {1,2,3,4}`（`GuildNativeLobbyStore`），
        // 所以不能自造 id。真实库上这个公会的成员/事件会跨运行累积，断言因此取**前后差值**：
        // 「正好 +1」比「等于 1」更严格，因为它同时排除了「重放又加了一条」。
        const guildId = 4
        const membersKey = `nativeLobby:guild:members:v1:${h.SID}:${guildId}`
        const eventsKey = `nativeLobby:guild:events:v1:${h.SID}:${guildId}`
        const seqKey = 'nativeLobby:guild:seq:v1'
        const eventLimit = 1000
        const clientReqId = `idem-${h.RUN_ID}`

        const beforeSeq = Number(h.redis('hget', seqKey, `${h.SID}:${guildId}`) || 0)
        const beforeEvents = h.redisListLength(eventsKey)
        const beforeMembers = h.redisMembers(membersKey).sort()
        check(!beforeMembers.includes(uid), '本次运行的 uid 不应已在公会里')

        const client = await connect(`tk-idem-${h.RUN_ID}`, uid)
        client.send(h.rpc('w1', GuildRpc.Join, { clientReqId, guildId }))
        const [reply] = await client.collect(h.isReplyFor('w1'), 1)
        check(reply.reply.ok === true, `guild.join 应成功：${JSON.stringify(reply)}`)
        equal(reply.reply.data.seq, beforeSeq + 1, '首次加入的 seq')

        // 领域推送必须真的从服务端走到这条连接上。
        const [pushed] = await client.collect(h.isPushOf('guild.event'), 1)
        equal(pushed.push.data.guildId, guildId, '推送里的 guildId')
        equal(pushed.push.data.seq, reply.reply.data.seq, '推送 seq 必须与回包 seq 一致')

        // 断言落在**真实 Redis**（直连 redis-cli，不复用生产读函数）。
        deepEqual(h.redisMembers(membersKey).sort(), [...beforeMembers, uid].sort(), '真实 Redis 成员集合应恰好 +1')
        equal(h.redisListLength(eventsKey), Math.min(beforeEvents + 1, eventLimit), '真实 Redis 事件条数应恰好 +1')
        equal(h.redis('hget', seqKey, `${h.SID}:${guildId}`), String(beforeSeq + 1), '真实 Redis 公会 seq 应恰好 +1')

        // 领域读面回读：从 `sinceSeq=beforeSeq` 起只应有本次这一条 memberJoin。
        client.send(h.rpc('e1', GuildRpc.GetEvents, { sinceSeq: beforeSeq }))
        const [events] = await client.collect(h.isReplyFor('e1'), 1)
        check(events.reply.ok === true, `getEvents 应成功：${JSON.stringify(events)}`)
        deepEqual(
            events.reply.data.events.map((event) => [event.kind, event.seq]),
            [['memberJoin', beforeSeq + 1]],
            '领域读面应恰好一条 memberJoin',
        )
        equal(events.reply.data.guildId, guildId, '读面 guildId')

        // 同 clientReqId 重放：不得再次进入副作用，也不得再推一次。
        client.send(h.rpc('w2', GuildRpc.Join, { clientReqId, guildId }))
        const [replay] = await client.collect(h.isReplyFor('w2'), 1)
        check(replay.reply.ok === true, `重放应返回成功：${JSON.stringify(replay)}`)
        equal(replay.reply.data.seq, beforeSeq + 1, '重放的 seq 必须与首次一致')
        await client.expectIdle()
        equal(h.redisListLength(eventsKey), Math.min(beforeEvents + 1, eventLimit), '重放后真实 Redis 事件条数')
        deepEqual(h.redisMembers(membersKey).sort(), [...beforeMembers, uid].sort(), '重放后真实 Redis 成员集合')
        equal(h.redis('hget', seqKey, `${h.SID}:${guildId}`), String(beforeSeq + 1), '重放后真实 Redis 公会 seq')

        client.send(h.rpc('e2', GuildRpc.GetEvents, { sinceSeq: beforeSeq }))
        const [eventsAgain] = await client.collect(h.isReplyFor('e2'), 1)
        equal(eventsAgain.reply.data.events.length, 1, '重放后领域读面仍只有一条')
        return `guildId=${guildId} seq ${beforeSeq}→${beforeSeq + 1}，事件/成员恰好 +1，重放未变`
    })

    // ---- 断线不自动重放
    await scenario('断线：写请求无传输层自动重放，同 clientReqId 重试不重复产生副作用', async () => {
        const uid = `live-drop-${h.RUN_ID}`
        const guildId = 2
        const membersKey = `nativeLobby:guild:members:v1:${h.SID}:${guildId}`
        const eventsKey = `nativeLobby:guild:events:v1:${h.SID}:${guildId}`
        const seqKey = 'nativeLobby:guild:seq:v1'
        const eventLimit = 1000
        const clientReqId = `drop-${h.RUN_ID}`

        const beforeSeq = Number(h.redis('hget', seqKey, `${h.SID}:${guildId}`) || 0)
        const beforeEvents = h.redisListLength(eventsKey)
        const beforeMembers = h.redisMembers(membersKey).sort()
        check(!beforeMembers.includes(uid), '本次运行的 uid 不应已在公会里')

        // 发出写请求后**不等回包**就硬断开：模拟传输层掉线，而不是客户端主动取消。
        const flying = await connect(`tk-drop-${h.RUN_ID}`, uid)
        flying.send(h.rpc('p1', GuildRpc.Join, { clientReqId, guildId }))
        await new Promise((resolve) => setTimeout(resolve, 50))
        flying.socket.terminate()
        await flying.waitClose()

        // 服务端必须自己把飞行中的写结算完，且**只结算一次**。轮询真实 Redis 等它落地。
        const deadline = Date.now() + 8000
        for (;;) {
            if (h.redisListLength(eventsKey) === Math.min(beforeEvents + 1, eventLimit)) break
            if (Date.now() > deadline) {
                fail(`断线后写请求未被结算：events=${h.redisListLength(eventsKey)}，期望 ${beforeEvents + 1}`)
            }
            await new Promise((resolve) => setTimeout(resolve, 50))
        }

        // 重连后按契约用**同一 clientReqId** 重试：必须拿到一致结论，且不得再产生一次副作用。
        const retry = await connect(`tk-drop-${h.RUN_ID}`, uid, h.SID, true)
        retry.send(h.rpc('p2', GuildRpc.Join, { clientReqId, guildId }))
        const [reply] = await retry.collect(h.isReplyFor('p2'), 1)
        check(reply.reply.ok === true, `重试应成功：${JSON.stringify(reply)}`)
        equal(reply.reply.data.seq, beforeSeq + 1, '重试返回的 seq 必须与首次一致')
        await retry.expectIdle()
        equal(h.redisListLength(eventsKey), Math.min(beforeEvents + 1, eventLimit), '重试后真实 Redis 事件条数')
        deepEqual(h.redisMembers(membersKey).sort(), [...beforeMembers, uid].sort(), '重试后真实 Redis 成员集合')
        equal(h.redis('hget', seqKey, `${h.SID}:${guildId}`), String(beforeSeq + 1), '重试后真实 Redis 公会 seq')
        return `断线后自行结算 seq ${beforeSeq}→${beforeSeq + 1}；重试同 clientReqId 未新增副作用`
    })

    // ---- 关闭码 4901：封号
    await scenario('关闭码 4901：封号先推送原因再关连接', async () => {
        const token = `tk-ban-${h.RUN_ID}`
        platform.invalidate(token, h.SID, 'BANNED')
        const client = await h.LobbyClient.connect(h.NATIVE_PORT)
        clients.push(client)
        client.send(h.authFrame(token, h.SID))
        const [push] = await client.collect(h.isPushOf(h.contract.LobbyPush.ForceLogout), 1)
        equal(push.push.data.reason, ForceLogoutReason.Banned, '封号推送原因')
        const [error] = await client.collect((frame) => frame.kind === 'auth.error', 1)
        equal(error.err.code, 'ACCOUNT_BANNED', '封号错误码')
        const closed = await client.waitClose()
        equal(closed.code, KICK_CLOSE_CODE[ForceLogoutReason.Banned], '封号关闭码')
        return `推送=${push.push.data.reason} 错误码=${error.err.code} 关闭码=${closed.code}`
    })

    // ---- 关闭码 4902：顶号
    await scenario('关闭码 4902：同 uid 二次登录顶掉旧连接', async () => {
        const uid = `live-replace-${h.RUN_ID}`
        const first = await connect(`tk-replace-${h.RUN_ID}`, uid)
        const second = await connect(`tk-replace-${h.RUN_ID}`, uid)
        const [push] = await first.collect(h.isPushOf(h.contract.LobbyPush.ForceLogout), 1)
        equal(push.push.data.reason, ForceLogoutReason.Replaced, '顶号推送原因')
        const closed = await first.waitClose()
        equal(closed.code, KICK_CLOSE_CODE[ForceLogoutReason.Replaced], '顶号关闭码')
        // 新连接必须仍然可用：旧连接的迟到清理不能抹掉新会话。
        second.send(h.rpc('s1', UserRpc.GetUserId))
        const [reply] = await second.collect(h.isReplyFor('s1'), 1)
        check(reply.reply.ok === true, `顶号后新连接应可用：${JSON.stringify(reply)}`)
        return `推送=${push.push.data.reason} 关闭码=${closed.code}，新连接仍可用`
    })

    // ---- 运营强制下线（4903）对外入口
    await scenario('运营下线：内部动作入口踢掉在线连接并按 4903 关闭', async () => {
        const uid = `live-revoke-${h.RUN_ID}`
        const client = await connect(`tk-revoke-${h.RUN_ID}`, uid)
        // 先做一次业务调用，确认这是一个真的 ready 会话，而不是「连接在、其实没上线」。
        client.send(h.rpc('rv0', UserRpc.GetUserId))
        const [ready] = await client.collect(h.isReplyFor('rv0'), 1)
        check(ready.reply.ok === true, `运营下线前连接应可用：${JSON.stringify(ready)}`)

        const kicked = await h.postInternalAction({ type: 'lobbyKick', actionParams: { uid, sId: h.SID } })
        equal(kicked.status, 200, '内部动作入口 HTTP 状态')
        equal(kicked.body.code, 0, `内部动作入口应成功：${JSON.stringify(kicked.body)}`)
        equal(kicked.body.data.json.kicked, true, '入口必须报告「确实踢掉了一个在线连接」')

        const [push] = await client.collect(h.isPushOf(h.contract.LobbyPush.ForceLogout), 1)
        equal(push.push.data.reason, ForceLogoutReason.Revoked, '运营下线推送原因')
        const closed = await client.waitClose()
        equal(closed.code, KICK_CLOSE_CODE[ForceLogoutReason.Revoked], '运营下线关闭码')
        return `kicked=${kicked.body.data.json.kicked} 推送=${push.push.data.reason} 关闭码=${closed.code}`
    })

    await scenario('运营下线：不在线 / 非法原因 / 错区 / 数字 uid 一律 fail-closed 且不误伤在线连接', async () => {
        // 先建一个**真实在线**连接，并且下面所有「被拒」的请求都拿它的 uid 去发。
        // 这样断言才承重：如果入口把非法原因当成默认原因，或者漏了区号校验，这条连接就会被踢掉。
        const uid = `live-revoke-guard-${h.RUN_ID}`
        const client = await connect(`tk-revoke-guard-${h.RUN_ID}`, uid)

        // 不在线：是结论不是错误。
        const offline = await h.postInternalAction({
            type: 'lobbyKick',
            actionParams: { uid: `live-offline-${h.RUN_ID}`, sId: h.SID },
        })
        equal(offline.body.code, 0, '不在线不该被当成入口错误')
        equal(offline.body.data.json.kicked, false, '不在线必须回 false')

        // 非法原因：入口只允许 4903（revoked）。允许指定 banned/replaced 等于允许伪造下线来源。
        for (const reason of [ForceLogoutReason.Banned, ForceLogoutReason.Replaced, 'nonsense']) {
            const rejected = await h.postInternalAction({
                type: 'lobbyKick',
                actionParams: { uid, sId: h.SID, reason },
            })
            equal(rejected.body.code, -1, `原因 ${reason} 必须被拒：${JSON.stringify(rejected.body)}`)
            check(
                /only accepts reason=revoked/.test(String(rejected.body.message)),
                `拒绝原因应可诊断：${JSON.stringify(rejected.body)}`,
            )
        }

        // 错区：本进程只服务 SID；他区请求必须被拒，否则「查不到」会掩盖路由错误。
        const wrongZone = await h.postInternalAction({
            type: 'lobbyKick',
            actionParams: { uid, sId: h.SID + 1 },
        })
        equal(wrongZone.body.code, -1, '错区必须被拒')
        check(/sid mismatch/.test(String(wrongZone.body.message)), `错区拒绝原因：${JSON.stringify(wrongZone.body)}`)

        // 数字 uid：外部身份是不透明字符串，`Number(uid)` 会静默指向另一个账号。
        const numeric = await h.postInternalAction({
            type: 'lobbyKick',
            actionParams: { uid: 12345, sId: h.SID },
        })
        equal(numeric.body.code, -1, '数字 uid 必须被拒')

        // 被拒的请求不得有任何副作用：那条在线连接必须还能正常收发。
        client.send(h.rpc('rv1', UserRpc.GetUserId))
        const [alive] = await client.collect(h.isReplyFor('rv1'), 1)
        check(alive.reply.ok === true, `被拒的运营下线不得影响在线连接：${JSON.stringify(alive)}`)
        return '不在线=false；banned/replaced/乱值/错区/数字 uid 全部被拒且在线连接仍可用'
    })

    // ---- 重连
    await scenario('重连：reconnect 帧仍完整复验，档与昵称不丢', async () => {
        const uid = `live-reconnect-${h.RUN_ID}`
        const nickname = `联调-${h.RUN_ID}`
        const first = await connect(`tk-reconnect-${h.RUN_ID}`, uid)
        first.send(h.rpc('u1', UserRpc.UpdateProfile, { clientReqId: `rc-${h.RUN_ID}`, nickname, avatarId: 3 }))
        const [written] = await first.collect(h.isReplyFor('u1'), 1)
        check(written.reply.ok === true, `updateProfile 应成功：${JSON.stringify(written)}`)
        first.close()
        await first.waitClose()

        const before = platform.verifyCalls
        const second = await connect(`tk-reconnect-${h.RUN_ID}`, uid, h.SID, true)
        equal(platform.verifyCalls, before + 1, 'reconnect 不得跳过回源复验')

        second.send(h.rpc('r1', UserRpc.GetInfo))
        const [info] = await second.collect(h.isReplyFor('r1'), 1)
        check(info.reply.ok === true, `重连后 getInfo 应成功：${JSON.stringify(info)}`)
        second.send(h.rpc('r2', UserRpc.GetProfile, { uid }))
        const [profile] = await second.collect(h.isReplyFor('r2'), 1)
        equal(profile.reply.data.profile.nickname, nickname, '重连后昵称')
        check(info.reply.data.user.ver >= 1, `重连后 ver 不得被重置：${info.reply.data.user.ver}`)
        return `回源复验 +1，昵称保留，ver=${info.reply.data.user.ver}`
    })

    // ---- 限流
    await scenario('限流：突发被限但连接不丢', async () => {
        const uid = `live-rate-${h.RUN_ID}`
        const client = await connect(`tk-rate-${h.RUN_ID}`, uid)
        const total = 40
        for (let index = 0; index < total; index += 1) client.send(h.rpc(`b${index}`, UserRpc.GetUserId))
        const verdicts = []
        for (let index = 0; index < total; index += 1) {
            const frame = await client.next(8000)
            check(frame.kind === 'reply', `第 ${index} 帧应为回包：${JSON.stringify(frame)}`)
            verdicts.push(frame.reply.ok ? 'ok' : `limited:${frame.reply.err && frame.reply.err.code}`)
        }
        check(verdicts.includes('ok'), '首个请求不应被限流')
        check(
            verdicts.some((verdict) => verdict.startsWith('limited:')),
            `突发必须打出限流响应：${JSON.stringify(verdicts)}`,
        )
        // 连接必须留着：再发一条仍然得到回包。
        client.send(h.rpc('after', UserRpc.GetUserId))
        const [after] = await client.collect(h.isReplyFor('after'), 1)
        check(after.kind === 'reply', '限流后连接必须仍可用')
        return `${total} 条突发中限流 ${verdicts.filter((v) => v.startsWith('limited:')).length} 条，连接保留`
    })

    // ---- 超时
    await scenario('超时：未认证连接被服务端按时关闭', async () => {
        const client = await h.LobbyClient.connect(h.NATIVE_PORT)
        clients.push(client)
        const frame = await client.next(8000)
        check(frame.kind === 'control.error', `未认证超时应收到控制错误：${JSON.stringify(frame)}`)
        equal(frame.err.code, 'AUTH_TIMEOUT', '认证超时错误码')
        const closed = await client.waitClose(4000)
        equal(closed.code, 1008, '认证超时关闭码')
        return `${frame.err.code} → close ${closed.code}`
    })

    // ---- 非法帧
    await scenario('非法帧：版本不符 / 非 JSON / 二进制帧各自 fail-closed', async () => {
        const versioned = await h.LobbyClient.connect(h.NATIVE_PORT)
        clients.push(versioned)
        versioned.send({ v: 99, kind: 'auth', token: `tk-auth-${h.RUN_ID}`, sId: h.SID })
        const [badVersion] = await versioned.collect((frame) => frame.kind === 'control.error', 1)
        equal(badVersion.err.code, 'INVALID_FRAME', '版本不符错误码')
        equal((await versioned.waitClose()).code, 1007, '版本不符关闭码')

        const malformed = await h.LobbyClient.connect(h.NATIVE_PORT)
        clients.push(malformed)
        malformed.sendText('{not json')
        const [badJson] = await malformed.collect((frame) => frame.kind === 'control.error', 1)
        equal(badJson.err.code, 'INVALID_FRAME', '非 JSON 错误码')
        equal((await malformed.waitClose()).code, 1007, '非 JSON 关闭码')

        const binary = await h.LobbyClient.connect(h.NATIVE_PORT)
        clients.push(binary)
        binary.sendBinary(Buffer.from([0x08, 0x01]))
        const [badBinary] = await binary.collect((frame) => frame.kind === 'control.error', 1)
        equal(badBinary.err.code, 'BINARY_FRAME_UNSUPPORTED', '二进制帧错误码')
        equal((await binary.waitClose()).code, 1003, '二进制帧关闭码')
        return '1007 / 1007 / 1003'
    })

    // ---- 大包
    await scenario('大包：超限帧被拒且服务端继续服务其它连接', async () => {
        const uid = `live-oversize-${h.RUN_ID}`
        const client = await connect(`tk-oversize-${h.RUN_ID}`, uid)
        const oversize = `{"v":${h.V},"kind":"rpc","rpc":{"id":"big","type":"${UserRpc.GetInfo}","payload":{"pad":"${'x'.repeat(h.MAX_BYTES)}"}}}`
        check(Buffer.byteLength(oversize, 'utf8') > h.MAX_BYTES, '构造的帧必须真的超过上限，否则这条用例什么都没证明')
        client.sendText(oversize)
        const closed = await client.waitClose(6000)
        equal(closed.code, 1009, `超限帧必须以「消息过大」关闭，实际=${JSON.stringify(closed)}`)

        const other = await connect(`tk-oversize-other-${h.RUN_ID}`, `live-oversize-other-${h.RUN_ID}`)
        other.send(h.rpc('ok', UserRpc.GetUserId))
        const [reply] = await other.collect(h.isReplyFor('ok'), 1)
        check(reply.reply.ok === true, `大包之后其它连接仍应可用：${JSON.stringify(reply)}`)
        return `close ${closed.code}，其它连接仍可用`
    })

    // ---- 错区 / 未认证 RPC：不在 P7 明列，但同属「关闭码与准入」面，代价极低
    await scenario('准入：错区回源前拒绝、未认证 RPC 被拒', async () => {
        const before = platform.verifyCalls
        const otherZone = await h.LobbyClient.connect(h.NATIVE_PORT)
        clients.push(otherZone)
        platform.issue(`tk-zone9-${h.RUN_ID}`, 9, `live-zone9-${h.RUN_ID}`)
        otherZone.send(h.authFrame(`tk-zone9-${h.RUN_ID}`, 9))
        const [zoneError] = await otherZone.collect((frame) => frame.kind === 'auth.error', 1)
        equal(zoneError.err.msg, '区服不匹配', '错区错误消息')
        equal((await otherZone.waitClose()).code, 1008, '错区关闭码')
        equal(platform.verifyCalls, before, '错区必须在回源之前被拒')

        const early = await h.LobbyClient.connect(h.NATIVE_PORT)
        clients.push(early)
        early.send(h.rpc('early', UserRpc.GetInfo))
        const [earlyError] = await early.collect((frame) => frame.kind === 'control.error', 1)
        equal(earlyError.err.code, 'INVALID_FRAME', '未认证 RPC 错误码')
        equal((await early.waitClose()).code, 1008, '未认证 RPC 关闭码')
        return `错区 0 次回源 / close 1008；未认证 RPC close 1008`
    })

    // ---- 私房接缝（P8）：Lobby 与 GameRoom 是两个进程，存储契约必须逐字一致
    await scenario('私房接缝：serverNew 签发的 creation ticket 被 GameRoom 的 claimCreation 消费', async () => {
        const uid = `live-room-${h.RUN_ID}`
        const client = await connect(`tk-room-${h.RUN_ID}`, uid)
        client.send(
            h.rpc('p1', RoomRpc.PrepareCreate, {
                clientReqId: `room-${h.RUN_ID}`,
                mode: 'privateFixture',
                modeVersion: 2,
                profile: 'private',
            }),
        )
        const [reply] = await client.collect(h.isReplyFor('p1'), 1)
        check(reply.reply.ok === true, `room.prepareCreate 应成功：${JSON.stringify(reply)}`)
        const ticket = reply.reply.data.creationTicket
        const quotaKey = h.roomQuotaKey(uid)
        const ticketKey = h.roomTicketKey(ticket)
        equal(Number(h.redis('zcard', quotaKey)), 1, 'creation ticket 必须占用一个配额槽')
        check(h.redis('exists', ticketKey) === '1', 'ticket 记录必须按 sha256 落在 GameRoom 能寻址的键上')

        // GameRoom 的 `onCreate` 会跑的就是这条原子段：issued → claimed(roomId)，
        // 并把配额成员 t:<jti> 置换为 r:<roomId>。
        const roomId = `seam-room-${h.RUN_ID}`
        const claimed = h.redisEvalRaw(
            h.gameRoomScript('roomTicketClaimCreation'),
            [ticketKey, quotaKey],
            [String(h.SID), 'privateFixture', 'private', roomId, '630000', '630000', uid],
        )
        equal(claimed[0], 'ok', `claimCreation 必须成功：${JSON.stringify(claimed)}`)
        equal(claimed[1], uid, 'claimCreation 必须回记录里的 uid（房主不从入座顺序推断）')
        equal(claimed[2], '2', 'claimCreation 必须回 modeVersion')
        const members = h.redis('zrange', quotaKey, '0', '-1').split('\n').filter(Boolean)
        deepEqual(members, [`r:${roomId}`], '配额成员必须被置换为房间槽位')
        return `claim ok，配额成员 ${JSON.stringify(members)}`
    })

    await scenario('私房接缝：GameRoom 分配的邀请码被 resolve 读到，join ticket 被 claimJoin 消费', async () => {
        const uid = `live-room-resolve-${h.RUN_ID}`
        const code = String(100000 + (Number(h.RUN_ID.slice(-5).replace(/\D/g, '0') || 1) % 800000))
        const roomId = `seam-resolve-room-${h.RUN_ID}`
        const codeKey = h.roomCodeKey(code)
        const generationKey = h.roomCodeGenerationKey(code)
        // 本脚本自造码：先清掉上次运行留下的 tombstone，否则 allocate 会判 taken（隔离期语义）。
        h.redis('del', codeKey, generationKey)
        const allocated = h.redisEvalRaw(
            h.gameRoomScript('inviteCodeAllocate'),
            [codeKey, generationKey],
            ['15000', roomId, 'privateFixture', '2', 'private', String(h.SID), `lease-${h.RUN_ID}`],
        )
        equal(allocated[0], 'ok', `inviteCodeAllocate 必须成功：${JSON.stringify(allocated)}`)
        const generation = Number(allocated[1])

        const client = await connect(`tk-room-resolve-${h.RUN_ID}`, uid)
        client.send(h.rpc('p2', RoomRpc.Resolve, { code }))
        const [reply] = await client.collect(h.isReplyFor('p2'), 1)
        check(reply.reply.ok === true, `room.resolve 应成功：${JSON.stringify(reply)}`)
        equal(reply.reply.data.roomId, roomId, 'resolve 必须返回租约里的 roomId')
        equal(reply.reply.data.profile, 'private', 'profile 必须来自租约而不是客户端自报')
        equal(reply.reply.data.modeVersion, 2, 'modeVersion 必须来自租约')

        // 好友入座时 GameRoom 会跑的那条原子段：issued → pending(session)，并逐字段复验绑定。
        const joined = h.redisEvalRaw(
            h.gameRoomScript('roomTicketClaimJoin'),
            [h.roomTicketKey(reply.reply.data.joinTicket)],
            [`session-${h.RUN_ID}`, String(h.SID), roomId, 'privateFixture', 'private', code, String(generation)],
        )
        equal(joined[0], 'ok', `claimJoin 必须成功：${JSON.stringify(joined)}`)
        equal(joined[1], uid, 'claimJoin 必须回绑定 uid')
        return `code=${code} roomId=${roomId} generation=${generation}`
    })

    await scenario('私房：折叠类与目录闸在真实进程上的结论', async () => {
        const uid = `live-room-gates-${h.RUN_ID}`
        const client = await connect(`tk-room-gates-${h.RUN_ID}`, uid)

        client.send(h.rpc('g1', RoomRpc.Resolve, { code: '000000' }))
        const [folded] = await client.collect(h.isReplyFor('g1'), 1)
        check(folded.reply.ok === false, `不存在的码必须被拒：${JSON.stringify(folded)}`)
        equal(folded.reply.err.code, 'ROOM_CODE_UNAVAILABLE', '不存在的码必须折叠成同一个码')
        equal(folded.reply.err.msg, '邀请码不可用', '折叠类文案必须固定（不回显输入的 code）')

        const badRequests = [
            { name: '未知 mode', payload: { mode: 'noSuchMode', modeVersion: 2, profile: 'private' } },
            { name: '未声明 profile', payload: { mode: 'privateFixture', modeVersion: 2, profile: 'dropIn' } },
            { name: 'modeVersion 不符', payload: { mode: 'privateFixture', modeVersion: 1, profile: 'private' } },
            { name: '非邀请码 profile', payload: { mode: 'idle', modeVersion: 3, profile: 'default' } },
        ]
        for (const [index, entry] of badRequests.entries()) {
            const id = `g2-${index}`
            client.send(h.rpc(id, RoomRpc.PrepareCreate, { clientReqId: `${id}-${h.RUN_ID}`, ...entry.payload }))
            const [rejected] = await client.collect(h.isReplyFor(id), 1)
            check(rejected.reply.ok === false, `${entry.name} 必须被拒：${JSON.stringify(rejected)}`)
            equal(rejected.reply.err.code, 'INVALID_PAYLOAD', `${entry.name} 的错误码`)
        }
        equal(Number(h.redis('zcard', h.roomQuotaKey(uid))), 0, '被目录闸拒绝的请求不得留下配额成员')
        return `折叠 1 项 + 目录闸 ${badRequests.length} 项`
    })

    await scenario('私房：容量/开局快照按 Colyseus 房间缓存契约生效，快照缺失时跳过往常放行', async () => {
        const uid = `live-room-capacity-${h.RUN_ID}`
        const code = String(200000 + (Number(h.RUN_ID.slice(-5).replace(/\D/g, '1') || 1) % 700000))
        const roomId = `seam-capacity-room-${h.RUN_ID}`
        h.redis('del', h.roomCodeKey(code), h.roomCodeGenerationKey(code))
        const allocated = h.redisEvalRaw(
            h.gameRoomScript('inviteCodeAllocate'),
            [h.roomCodeKey(code), h.roomCodeGenerationKey(code)],
            ['15000', roomId, 'privateFixture', '2', 'private', String(h.SID), `lease-cap-${h.RUN_ID}`],
        )
        equal(allocated[0], 'ok', `inviteCodeAllocate 必须成功：${JSON.stringify(allocated)}`)

        const client = await connect(`tk-room-capacity-${h.RUN_ID}`, uid)
        const ask = async (id) => {
            client.send(h.rpc(id, RoomRpc.Resolve, { code }))
            const [reply] = await client.collect(h.isReplyFor(id), 1)
            return reply.reply
        }
        // ⚠ `roomcaches` 是 `@colyseus/redis-driver` 的固定字面量键（无项目前缀）。
        // 当前 `apps/server/app.config.ts` 用的是 LocalDriver（房间列表只在游戏进程内存里），
        // 所以生产拓扑下没有这个写入方——这里按**该驱动的存储契约**写入，用来验证接缝本身
        // 生效；⛔ 不把它说成「生产已验证」。
        h.redis('hset', 'roomcaches', roomId, JSON.stringify({ locked: false, clients: 4, maxClients: 4 }))
        const full = await ask('c1')
        check(full.ok === false, `满员必须被拒：${JSON.stringify(full)}`)
        equal(full.err.code, 'ROOM_FULL', '满员错误码')

        h.redis('hset', 'roomcaches', roomId, JSON.stringify({ locked: true, clients: 1, maxClients: 4 }))
        const starting = await ask('c2')
        check(starting.ok === false, `已锁房必须被拒：${JSON.stringify(starting)}`)
        equal(starting.err.code, 'ROOM_START_IN_PROGRESS', '开局中错误码')

        h.redis('hdel', 'roomcaches', roomId)
        const allowed = await ask('c3')
        check(allowed.ok === true, `快照源缺失时必须跳过快照并放行：${JSON.stringify(allowed)}`)
        equal(allowed.data.roomId, roomId, '放行后仍必须返回租约里的 roomId')
        return `ROOM_FULL / ROOM_START_IN_PROGRESS / 无快照放行 各 1 次`
    })
}

module.exports = { runLobbyProtocolScenarios }
