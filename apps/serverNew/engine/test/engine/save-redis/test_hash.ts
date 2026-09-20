import * as service from '../../../src/differ/service'
import { Hero1 } from './bean/Hero1'
import { User1 } from './bean/User1'
import { Attr1 } from './bean/Attr1'

async function testHash(id: number) {
    let user = await User1.load(id)
    if (!user) {
        user = new User1(id)
        user.gc = 9999
        user.name = 'new user'
        const hero = new Hero1()
        hero.hId = 9
        hero.lv = 1
        user.hero = hero
    }
    user.gc++
    user.hero!.lv++
    await service.save()
    console.log((await User1.load(id))?.toString())
}

async function testHashSave(id: number) {
    const user = new User1(id)
    user.gc = 9999
    user.name = 'new user'
    // user.arr?.add(1, 2, 3, 4)
    const hero = new Hero1({ hId: 9, lv: 1, attr: new Attr1({ name: 'attr1', lv: 12 }) })
    hero.arr.add(4, 3, 2, 1)
    // hero.attrs.set(1, new Attr1({ name: 'a1', lv: 2 }))
    // hero.attrs.set(2, new Attr1({ name: 'a2', lv: 4 }))
    // user.hero = hero
    user.heros.set(hero.hId, hero)
    // user.heros.set(8, new Hero1({ hId: 8, lv: 2, attr: new Attr1({ name: 'attr1', lv: 12 }) }))
    await service.save()
    const user1 = await User1.load(id)
    console.log(user1?.heros?.get(9)?.attr?.toString())
}

async function testHashGet(id: number) {
    const user1 = await User1.load(id)
    // console.log(user1?.hero!.attr?.lv) //
    // user1!.hero!.attr!.lv++
    // user1!.hero!.lv++
    // for (const [id1, h1] of user1!.heros) {
    // user1!.heros.forEach((h1, id1) => {
    //     h1.lv++
    //     console.log(id1, h1.toString())
    // })
    // user1!.heros!.get(8)!.attr!.lv++
    // user1!.hero!.attrs!.get(1)!.lv++
    // user1!.arr!.removeAt(1)
    // user1!.arr!.set(1, 13)
    user1!.hero!.arr.set(1, 13)
    // console.log(user1!.heros!.get(8)!.attr!.lv)
    await service.save()
}
testHashSave(23)
// testHashGet(23)
