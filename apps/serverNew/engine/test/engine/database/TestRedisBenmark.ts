import { RedisCache } from '../../../src/database/RedisCache'

const redis = new RedisCache({
    host: '127.0.0.1',
    port: 6379,
})

const obj = {
    name: 'Hello world!',
    author: 'admin',
    user: {
        yolololo: { id: '352asdsafaseww', server: 5, data: { x: 1, y: 1, z: 50 } },
        yolol: { id: '358dsa', server: 7 },
    },
}
const jsonObj = JSON.stringify(obj)
let getCount = 0
let time = 0
let length = 0
const setGet = async function (i: number) {
    for (let j = 0; j < 100000; j++) {
        await redis.set('aa' + i, jsonObj)
        const rs = await redis.get('aa' + i)
        const count = ++getCount
        length += rs?.length ?? 0
        if (count % 100000 === 0) {
            console.log('set get count :' + count + ' use ms:' + (new Date().getTime() - time) + ',rs len:' + length)
        }
    }
}
const begin = async function () {
    await redis.connect()
    time = new Date().getTime()
    //单业务1万/s,4业务3.5万/s,8业务5万/s,16业务7万/s,32业务8万/s,64业务9万/s,128业务1万每秒
    for (let i = 0; i < 128; i++) {
        setGet(i)
    }
}
begin()
