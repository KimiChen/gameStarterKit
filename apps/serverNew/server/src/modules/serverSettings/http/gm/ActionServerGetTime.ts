import { timestamp } from '@arthropoda/game-engine'
import { Server } from './Server'
import { UtilTime } from '@arthropoda/game-engine'
import { TimeAdd } from '@arthropoda/game-engine'

export class ActionServerGetTime extends Server {
    public doAction(params: { [key: string]: any }): any {
        TimeAdd.getTimeAdd()
        const now = timestamp()
        const date = UtilTime.format(now)
        return { time: now, date: date }
    }
}
