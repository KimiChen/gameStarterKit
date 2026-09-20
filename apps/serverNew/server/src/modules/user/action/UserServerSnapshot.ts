import { ReadonlyBean } from '@arthropoda/game-engine'
import { HServer } from '../../serverProgress/bean/HServer'

export class UserServerSnapshot {
    static async load(sid: int, onlyRead?: true, fields?: keyof HServer[]): Promise<ReadonlyBean<HServer>>
    static async load(sid: int, onlyRead: false, fields?: keyof HServer[]): Promise<HServer>
    static async load(sid: int, onlyRead: boolean = true, fields?: keyof HServer[]) {
        let hServer: HServer | ReadonlyBean<HServer> | undefined
        if (onlyRead) {
            hServer = await HServer.loadOnlyRead(sid, {
                serverId: sid,
            })
        } else {
            hServer = await HServer.load(sid, {
                serverId: sid,
            })
        }

        if (!hServer) {
            hServer = new HServer(sid, { serverId: sid })
        }
        const writableServer = hServer as HServer
        if (!onlyRead && writableServer.currKuiCowLv <= 0) {
            const kuiCowConf = C.kui_cow_open(1)
            writableServer.currKuiCowLv = kuiCowConf.monsterLv
            writableServer.kuiCowOpenId = kuiCowConf.id
        }
        return hServer
    }
}
