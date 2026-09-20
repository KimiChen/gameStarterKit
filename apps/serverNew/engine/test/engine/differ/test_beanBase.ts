import * as service from '../../../src/differ/service'
import { HeroBase } from '../../../src/bean/base/HeroBase'
import { UserBase } from '../../../src/bean/base/UserBase'
import { UserTemp } from '../../../src/bean/user/UserTemp'
import { timestamp } from '../../../src/utils/common'

async function testBeanBase() {
    let user = await UserBase.load(33)
    if (!user) {
        user = new UserBase(33)

        user.lvl = 33

        const hero = new HeroBase()
        hero.hId = 100
        hero.lv = 1

        user.hero = hero
    }

    user.lvl += 1
    if (user.hero) {
        user.hero.lv += 1
    }

    console.log(user.toString())
    await service.save()
    console.log((await UserBase.load(33))?.toString())
}

async function testExpire() {
    const id = 11
    let userTemp = await UserTemp.load(id)
    if (!userTemp) {
        userTemp = new UserTemp(id)
        userTemp.chatTime = timestamp()
    }
    await service.save()

    console.log('userTemp ttl:', await userTemp.getRedis().ttl(UserTemp.getRedisKey(id)))

    const ub = await UserBase.load(1)
    if (ub) {
        ub.refreshExpire(50 * 86400)
        console.log('userBase ttl:', await ub.getRedis().ttl(UserBase.getRedisKey(1)))
    }
}

testBeanBase()
//testExpire()
