import { ListenArgs, ListenHandler } from '@arthropoda/game-engine'
import { AdItem } from '../bean/AdItem'

export class ListenAdNumArgs extends ListenArgs {
    bean?: AdItem = undefined

    oldVal: int = 0
}

export class ListenAdNumHandler extends ListenHandler<ListenAdNumArgs> {
    async handler(data: ListenAdNumArgs) {
        const newVal = data.bean?.num
        const oldVal = data.oldVal
        console.log(`adNum_${newVal}__${oldVal}__`)
    }
}
