import { ListenArgs, ListenHandler } from '@arthropoda/game-engine'
import { User } from '../bean/User'
import { TimesBean } from '../bean/TimesBean'

export class ListenOpenidArgs extends ListenArgs {
    bean?: User = undefined

    oldVal: string = ''
}

export class ListenOpenidHandler extends ListenHandler<ListenOpenidArgs> {
    async handler(data: ListenOpenidArgs) {
        const newVal = data.bean!.openid
        const oldVal = data.oldVal
        console.log(`_${newVal}__${oldVal}__`)
    }
}

export class ListenGuildMFListArgs extends ListenArgs {
    bean?: User = undefined
}

export class ListenGuildMFListHandler extends ListenHandler<ListenGuildMFListArgs> {
    async handler(data: ListenOpenidArgs) {
        for (const [k, v] of data.bean!.guildMFList ?? []) {
            console.log(`_${k}_${v}__`)
        }
    }
}

export class ListenEvilArgs extends ListenArgs {
    bean?: TimesBean = undefined
}

export class ListenEvilHandler extends ListenHandler<ListenEvilArgs> {
    async handler(data: ListenEvilArgs) {
        console.log(`eval:${data.bean!.times}`)
    }
}

//diffMap<int,AdsItem>
export class ListenAdsMapArgs extends ListenArgs {
    bean?: User = undefined
}

export class ListenAdsMapHandler extends ListenHandler<ListenAdsMapArgs> {
    async handler(data: ListenAdsMapArgs) {
        for (const [k, v] of data.bean!.ads ?? []) {
            console.log(`_${k}_${v.num}__`)
        }
    }
}
