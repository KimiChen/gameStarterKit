import { error } from 'console'
import { RedisCache } from '../../../src/database/RedisCache'
import { sleep, timestamp } from '../../../src/utils/common'

const redis = new RedisCache({
    host: '127.0.0.1',
    port: 6379,
})

const redis2 = new RedisCache({
    host: '127.0.0.1',
    port: 6379,
})

async function testSetGet() {
    await redis.connect()
    const value = new Uint8Array(300)
    for (let i = 0; i < 300; i++) {
        value[i] = i
    }
    const key = 'testSetGet1'
    const setV = await redis.hMset(key, { buf: Buffer.from(value.buffer), str: 'str', num: 789, flo: 4.56 })

    const getV = await redis.hGetAllBuffer(key)
    console.log(getV)
    // for (let i = 0; i < 300; i++) {
    //     if (i !== getV[i]) {
    //         console.log(i, getV[i])
    //     }
    // }
    await redis.disconnect()
}
testSetGet()

async function testMuiti() {
    await redis.connect()
    await redis.client().multi().hSet('testMuiti', 'k1', 'v1').hSet('testMuiti', 'k2', 'v2').execAsPipeline()

    const val = await redis.hGetAll('testMuiti')
    console.log(val)

    await redis.disconnect()
}

async function testSet() {
    await redis.connect()
    const value = 'val'
    const key = 'testSet'
    let setV = await redis.set(key, value)
    console.log(setV)

    const getV = await redis.get(key)
    console.log(getV)
    let ttl = await redis.ttl(key)
    console.log(ttl)

    setV = await redis.set(key, value, 86400)

    ttl = await redis.ttl(key)
    console.log(ttl)

    setV = await redis.set(key, value, timestamp() + 3600)

    ttl = await redis.ttl(key)
    console.log(ttl)

    setV = await redis.set(key, 1)
    console.log(setV)

    setV = await redis.set(key, 1, 1672502401)
    console.log(setV)

    console.log(11)

    await redis.disconnect()
}

async function testInfo() {
    await redis.connect()

    const info = await redis.info()
    console.log(info)

    const conf = await redis.getConf('maxmemory')
    console.log(conf)

    await redis.disconnect()
}
async function testExpire() {
    await redis.connect()
    const value = 'exval'
    const key = 'testExpire'
    const setV = await redis.set(key, value)

    await redis.expire(key, 3600)

    let ttl = await redis.ttl(key)
    console.log(ttl)

    await redis.expireAt(key, timestamp() + 86400)

    ttl = await redis.ttl(key)
    console.log(ttl)

    await redis.expireAt(key, new Date('2023-09-02 20:00:00'))

    ttl = await redis.ttl(key)
    console.log(ttl)

    await redis.disconnect()
}

async function testReconnect(isCatch: boolean = false) {
    await redis.connect()
    const value = 'exval'
    const key = 'testReconnect'
    await redis.set(key, value)

    for (let i = 0; i < 1000; i++) {
        let getV: string | null | void = ''
        if (isCatch) {
            // eslint-disable-next-line no-useless-catch
            try {
                getV = await redis.get(key)
            } catch (err) {
                console.error(err)

                return
            }
        } else {
            getV = await redis.get(key)
        }
        console.log(`${i}:v:${getV}`)

        await sleep(1000)
    }

    await redis.disconnect()
}

async function doTestReconnect() {
    try {
        await testReconnect()
        console.log('run finish')
    } catch (err) {
        console.log(err)
        console.log('testReconnect error:')
    }
    await redis.disconnect()
}

// 测试zset结构
async function TestZset() {
    await redis.connect()
    const key = 'test_zset'
    await redis.zAdd(key, 1, 'k1')
    await redis.zAdd(key, 20, 'k20')
    await redis.zAdd(key, 3, 'k3')
    await redis.zAdd(key, 0, 'k4')

    const l1 = await redis.zRange(key, 0, 10)
    console.log('排名正序获取member:', l1)

    const l2 = await redis.zRange(key, 0, 10, true)
    console.log('排名倒序获取member:', l2)

    const l3 = await redis.zRangeWithScores(key, 0, 10)
    console.log('排名正序获取对象:', l3)

    const l4 = await redis.zRangeWithScores(key, 0, 10, true)
    console.log('排名倒序获取对象:', l4)

    const l5 = await redis.zRangeByScore(key, 2, 21)
    console.log('获取分数区间的，正序:', l5)

    const l6 = await redis.zRangeByScore(key, 2, 21, true)
    console.log('获取分数区间的，倒序:', l6)

    const rank1 = await redis.zRank(key, 'k3')
    const rank2 = await redis.zRank(key, 'k3', true)
    const score1 = await redis.zScore(key, 'k3')

    console.log('正序rank:', rank1, '; 倒序rank:', rank2, '; score为:', score1)

    await redis.zRem(key, 'k1')
    const l11 = await redis.zRange(key, 0, 10)
    await redis.zRem(key, ['k3', 'k4'])
    const l12 = await redis.zRange(key, 0, 10)
    console.log('删除列表1:', l11)
    console.log('删除列表2:', l12)

    await redis.disconnect()
}

async function TestSub() {
    await redis.connect()
    const channel = 'testCh'
    const listener = (message: string, ch: string) => console.log('subscribe:', message, ch, new Date())

    redis.subscribe(channel, listener)
}

async function TestPubSub() {
    await TestSub()

    const channel = 'testCh'

    await redis2.connect()
    for (let i = 0; i < 100; i++) {
        const msg = 'm' + i.toString()
        await redis2.publish(channel, msg)
        console.log('publish:', msg, channel, new Date())
        await sleep(1000)
    }
    await redis.disconnect()
    await redis2.disconnect()
}

//doTestReconnect()

// TestPubSub()
