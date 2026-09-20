import { ListenArgs, ListenHandler } from '@arthropoda/game-engine'
import { TimesBean } from '../bean/TimesBean'

export class ListenTimesArgs extends ListenArgs {
    bean?: TimesBean = undefined

    oldVal: int = 0
}

export class ListenTimesHandler extends ListenHandler<ListenTimesArgs> {
    async handler(data: ListenTimesArgs) {
        const newVal = data.bean!.times
        const oldVal = data.oldVal
        console.log(`_${newVal}__${oldVal}__`)
    }
}
