import { save } from '../../../src/differ/service'
import { UserBase } from '../differ/bean/UserBase'
import { HeroBase } from '../differ/bean/HeroBase'
import { UserScene } from './bean/UserScene'

const uId = 2

async function test() {
    let user = await UserBase.load(uId)
    if (!user) {
        user = new UserBase(uId)
        user.lvl = 2
        user.name = 'hahah'

        const hero = new HeroBase()
        hero.hId = 101
        hero.lv = 10
        user.heros.set(hero.hId, hero)

        const hero2 = new HeroBase()
        hero2.hId = 102
        hero2.lv = 12

        user.heros.set(hero2.hId, hero2)

        await save()
        console.log('数据初始化')
    }

    if (!user.hero) {
        const hero = new HeroBase()
        hero.hId = 1
        hero.lv = 1
        user.hero = hero
        await save()
    }
}

async function testRefLoad() {
    const user = await UserScene.load(uId)
    if (user == undefined) {
        return
    }
    console.log(user.id)
    console.log(user.lvl)
    console.log(user.name)
}

;(async () => {
    // test()
    testRefLoad()
})()
