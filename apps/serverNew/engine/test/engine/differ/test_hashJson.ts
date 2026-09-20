import * as service from '../../../src/differ/service'
import { Attr } from './bean/Attr'
import { Npc } from './bean/Npc'

async function testHashJson() {
    //const npcs = await Npc.loadByIds('world', 0, 1, 2)
    const npcs = await Npc.loadByIds('world')
    if (npcs.size <= 0) {
        for (let i = 0; i < 3; i++) {
            const item = new Npc('world', i)

            item.name = 'boss' + i
            item.x = Math.random()
            item.y = Math.random()

            if (i == 1) {
                const attr = new Attr()
                attr.values?.add(6, 7, 8)

                item.attr = attr
            }

            npcs.set(i, item)
        }
    }

    const npc = npcs.get(2)
    if (npc) {
        npc.x = Math.random()
        npc.y = Math.random()

        if (!npc.attr) {
            npc.attr = new Attr()
        }
        npc.attr.attack = Math.floor(Math.random() * 10000)
    }

    await service.save()
    console.log('直接load id=1:', (await Npc.load('world', 1))?.toString())
}
testHashJson()
