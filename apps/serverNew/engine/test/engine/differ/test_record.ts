import { timestamp } from '../../../src/utils/common'
import { ChatRecord } from './bean/ChatRecord'

enum ChatKey {
    world = 'chat:world',
}

;(async () => {
    const obj = ChatRecord.load(ChatKey.world)

    for (let i = 0; i < 10; i++) {
        await obj.add({
            time: timestamp(),
            msg: `消息内容:${i}`,
        })
    }

    const getRs = await obj.get(100)
    for (const item of getRs) {
        console.log(`${item.time} ${item.msg}  ___`)
    }
    console.log(getRs)

    // const rmRs = await obj.remove('msg:1')
    // console.log(rmRs)

    const firstRs = await obj.first()
    console.log(firstRs)

    const lenRs = await obj.len()
    console.log(lenRs)
})()
