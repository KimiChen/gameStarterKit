import { error } from 'console'
import { RedisCache } from '../../../src/database/RedisCache'
import { sleep, timestamp } from '../../../src/utils/common'
import { date } from 'joi'

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
    const value = 't' + timestamp()
    const key = 'testSetGet'
    const setV = await redis.set(key, value)
    console.log(setV)

    const getV = await redis.get(key)
    console.log(getV)

    await redis.disconnect()
}
//testSetGet()

async function testMuiti() {
    await redis.connect()

    const key1 = 'testMuiti'
    const key2 = 'testMuiti_2'
    redis.del([key1, key2])

    const start = Date.now()
    const redisPipe = redis.client().multi()
    for (let i = 0; i < 100; i++) {
        redisPipe.hSet(key1, 'k' + i, 'v' + i)
    }
    await redisPipe.execAsPipeline()
    const end1 = Date.now()

    for (let i = 0; i < 100; i++) {
        await redis.hSet(key2, 'k' + i, 'v' + i)
    }
    const end2 = Date.now()

    // const val1 = await redis.hGetAll(key1)
    // console.log(JSON.stringify(val1))

    // const val2 = await redis.hGetAll(key2)
    // console.log(JSON.stringify(val2))

    console.log('used1:', end1 - start)
    console.log('used2:', end2 - end1)

    await redis.disconnect()
}
async function testMuitiOther() {
    await redis.connect()

    const key1 = 'testMuitiOther'
    redis.del([key1])
    const redisPipe = redis.client().multi()
    await redisPipe.hSet(key1, 'k1', 'w1')
    //await redisPipe.execAsPipeline()

    console.log(redisPipe.v4)
    await redisPipe.exec(true)

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

async function TestSetGetBuffer() {
    await redis.connect()
    const key = 'test_buffer'
    const str = '我要打10个'

    await redis.set(key, Buffer.from(str))
    console.log('Origin Buffer:', Buffer.from(str))

    const value = await redis.getBuffer(key)
    console.log('Buffer : ', value)
    console.log('String from buffer:', value?.toString())

    await redis.disconnect()
}

async function TestSetGetBuffer2() {
    await redis.connect()
    const key = 'test_buffer2'

    const len = 30
    const setValue = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
        setValue[i] = i
    }

    await redis.set(key, Buffer.from(setValue.buffer))
    console.log('Origin Buffer:', setValue)

    const value = await redis.getBuffer(key)
    console.log('Buffer : ', value)

    await redis.disconnect()
}
async function testHash() {
    await redis.connect()
    const key = 'test_hash'
    await redis.hSet(key, 'k1', 1)
    await redis.hSet(key, 'k2', 2)

    const keys = await redis.hKeys(key)
    console.log(keys)
    await redis.disconnect()
}
interface iu {
    id: number
}
function t() {
    const v1 = '123'
    console.log(JSON.parse(v1))
    const v2 = '{"a":123}'
    console.log(JSON.parse(v2))
    // const v3 = 'abc'
    // console.log(JSON.parse(v3))
    const v4 = '111'
    console.log(JSON.parse(v4))

    const u: iu | undefined = ru()
    const n: number = Number(u?.id)
    console.log('u:', u?.id, n)
}

function ru() {
    // eslint-disable-next-line no-constant-condition
    if (false) {
        return { id: 1 }
    }
    return undefined
}

//doTestReconnect()

//TestSetGetBuffer2()

//testMuiti()

//testMuitiOther()

t()
