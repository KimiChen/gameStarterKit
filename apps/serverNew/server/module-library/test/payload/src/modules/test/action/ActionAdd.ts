import { timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { Props } from '../../props/inventory/Props'
import { getGlobalResponse } from '../../../runtime/protocol/C2S/global'
import { ReqAdd, ResAdd } from '../TestC2S'
import { HashMapTestBean } from '../bean/HashMapTestBean'

export class ActionAdd extends GameAction {
    async doAction(req: ReqAdd, res: ResAdd) {
        req.adsMap = new Map()
        req.adsMap.set(1, {
            adId: 1,
            num: 2,
            totalNum: 2,
            lastTime: timestamp(),
        })
        this.user.ads.init(req.adsMap)
        // getGlobalResponse(res).testMsg = '111'
        // getGlobalResponse(res).awards.push({
        //     propId: 111111,
        //     num: 22
        // })
        // for (const [k, v] of this.user.bag) {
        //     this.user.bag.delete(k)
        //     break
        // }

        // let load = await HashJsonNetTest.load(this.user.id)
        // if (!load) {
        //     //new
        //     load = new HashJsonNetTest(this.user.id)
        //     load.exp += 1
        //     load.lv = 1
        //     load.map.set(1, 2)
        // } else {
        //     //update
        //     load.exp += 1
        //     load.lv += 1
        //     load.map.set(load.lv, 1)
        // }

        // //delete
        // if (req.propId == -1) {
        //     load.delete()
        // }

        // const hashMap = await HashMapTestBean.loadAll()
        // if (hashMap.size == 0) {
        //     // new
        //     for (let i = 1; i <= 10; i++) {
        //         const newMap = new HashMapTestBean(i)
        //         newMap.lv = i
        //         newMap.addNotifyUids(this.user.id)
        //     }
        // }

        // let updateId
        // //update
        // for (const [key, item] of hashMap) {
        //     item.addNotifyUids(this.user.id)
        //     item.lv += 1
        //     updateId = key
        //     break
        // }

        // //delete
        // for (const [key, item] of hashMap) {
        //     if (key === updateId) {
        //         continue
        //     }
        //     item.addNotifyUids(this.user.id)
        //     item.delete()
        //     break
        // }

        res.propId = 101010
    }
}
