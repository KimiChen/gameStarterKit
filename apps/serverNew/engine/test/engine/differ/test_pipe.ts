import * as service from '../../../src/differ/service'
import { HeroBase } from '../../../src/bean/base/HeroBase'
import { UserBase } from '../../../src/bean/base/UserBase'
import { User } from './bean/User'

async function testSavePipe() {
    const ids = []
    for (let i = 101; i < 200; i++) {
        ids.push(i)
        // UserBase.getRedis().del(UserBase.getRedisKey(i))
    }

    for (const id of ids) {
        let user = await UserBase.load(id)
        if (!user) {
            user = new UserBase(id)

            user.lvl = 1
        }

        user.lvl += 1
    }
    const start = Date.now()
    await service.save()
    const end = Date.now()
    console.log('used time:', end - start)

    // for (const id of ids) {
    //     console.log(`id:${id},`, 'lvl:', (await UserBase.load(id))?.lvl)
    // }
}
testSavePipe()
