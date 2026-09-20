import assert from 'assert'
import { RedisInstance } from '../../src/database/RedisInstance'
import { RedisLock } from '../../src/utils/RedisLock'
import { testInitEnv } from '../testInit'
import { sleep } from '../../src/utils/common'
import { TimeAdd } from '../../src/utils/TimeAdd'

describe('redis', () => {
    before(async () => {
        await testInitEnv()
        assert(ADJUST_OPEN)
    })

    it('redis lock, warning log', async () => {
        const key = 'lock123'
        const key2 = 'lock12344'
        const s = RedisLock.create(key, 1)
        await s.lock()
        TimeAdd.__time_add = 2000
        //@ts-ignore
        console.log(Object.keys(RedisLock.registerToken))
        //@ts-ignore
        assert(Object.keys(RedisLock.registerToken).length == 1)

        const s2 = RedisLock.create(key2, 1)
        await s2.lock()
        await s2.unLock()

        //@ts-ignore
        assert(Object.keys(RedisLock.registerToken).length == 0)
    })
    it('redis lock', async () => {
        const key = 'lock123'
        let cnt = 0
        //非等待锁
        RedisLock.runOrSkip(key, () => {
            cnt++
        }).catch(e => { })
        await RedisLock.runOrSkip(key, () => {
            throw new Error()
        })
        await RedisLock.runOrSkip(key, () => {
            cnt++
        })
        const pool = []

        //等待锁
        pool.push(RedisLock.runBlock(key, 1000, () => {
            cnt++
        }))
        pool.push(RedisLock.runBlock(key, 1000, () => {
            throw new Error()
        }))
        pool.push(RedisLock.runBlock(key, 1000, () => {
            cnt++
        }))
        try {
            await Promise.all(pool)
        } catch (e) {
            console.log(e)
        }
        //@ts-ignore
        assert(Object.keys(RedisLock.registerToken).length == 0)
        assert(cnt == 3, 'cnt:' + cnt)
        try {
            await RedisLock.runBlock(key, 1000, () => {
                throw new Error()
            })
        } catch (e) {
            console.log(e)
        }
        //@ts-ignore
        assert(Object.keys(RedisLock.registerToken).length == 0)
    })
})