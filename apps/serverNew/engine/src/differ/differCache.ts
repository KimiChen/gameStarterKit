import { E_APP_TYPE } from '../typings/conf-app'
import { RootBean } from './bean'
import { ZSet } from './ZSet'

export class DifferCache {
    changedBeans: RootBean[] = []

    rankLoadedList: Map<string, ZSet> = new Map()

    notForNet: boolean = false

    /** 设置getDifferCache方法 */
    static setGetCacheFun(fun: (newIfNull?: boolean) => DifferCache | undefined) {
        getDifferCache = fun
    }

}

/** 获取当前的DifferCache */
export let getDifferCache = function (newIfNull: boolean = false): DifferCache | undefined {
    if (APP_TYPE == E_APP_TYPE.API) {
        return
    }
    throw new Error('waiting inject')
}

export function addRootChange(bean: RootBean) {
    const cache = getDifferCache(true)
    if (cache === undefined) {
        return
    }
    // 这里的不用判断重复添加，已经在 Root.AddRootChange 中的标识来避免重复添加
    cache.changedBeans.push(bean)

}

export function addRootRankLoade(rank: ZSet) {
    const cache = getDifferCache(true)
    if (cache === undefined) {
        return
    }
    if (cache.rankLoadedList.has(rank.key)) {
        return
    }
    cache.rankLoadedList.set(rank.key, rank)
}
