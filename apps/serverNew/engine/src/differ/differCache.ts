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
    // 进程根本没跑过 `EngineInitHelper.initBase`（单测、一次性工具脚本）时 `APP_TYPE` 这个
    // global 不存在，读它会抛 ReferenceError —— 那会把「没有上下文缓存」伪装成框架崩溃。
    // 这种进程本来就没有服务端上下文，直接按「无缓存」返回。
    // ⚠ 只放行「整个进程未初始化」：真正的运行进程一定先 `initBase`，若它缺 `initContextFactory`
    // 就说明同步缓存漏注入，必须继续抛错（静默丢同步比崩溃更糟）。
    if (typeof APP_TYPE === 'undefined' || APP_TYPE == E_APP_TYPE.API) {
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
