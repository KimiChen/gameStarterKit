import * as service from '../../../src/differ/service'
import { Attr } from './bean/Attr'
import { User } from './bean/User'

async function testHash() {
    let user = await User.load(22)
    if (!user) {
        user = new User(22)
        user.bool = true

        for (let i = 0; i < 3; i++) {
            const item = new Attr()
            item.type = i
            item.hp = i * 10 + 1
            item.attack = i * 100 + 1

            item.sub = new Attr()

            item.values?.add(1, 2, 3, i)

            if (i == 0) {
                user.attr = item
            }
            user.attrMap?.set(item.type, item)
        }

        user.tasks?.add('tom', 'jerry', 'spark')
    }

    user.upLvl()
    user.name = 'new user'
    if (user.attr) {
        user.attr.hp += 2000

        if (user.attr.values) {
            user.attr.values.removeAt(2)
            user.attr.values.add(23)
        }
    }

    user.attrMap?.delete(1)
    user.tasks?.add('and')

    const attrItem = user.attrMap?.get(0)
    if (attrItem) {
        attrItem.hp += 3000
        attrItem.values?.push(666)
    }

    await service.save()
    console.log((await User.load(22))?.toString())
}
testHash()
