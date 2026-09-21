import { RootBean } from '../differ/bean'
import { getDifferCache } from '../differ/differCache'
import { Hash } from '../differ/hash'
import { JSONObject } from '../differ/redis'
import { BeanStatus } from '../differ/status'
import { ModInfoRegistry } from './ModInfoRegistry'
import { ModType } from '../differ/diff'

export interface LoadedHashMod {
    bean: Hash | undefined
    version?: int
}

/**
 * Bean 变更数据装配器：把 Hash/Bean 的 diff 组装成客户端可消费的模块数据。
 *
 * 与 `ModInfoRegistry` 一样只处理 Bean 字段描述与变更跟踪，⛔ 不依赖 Protobuf schema，
 * 也不做任何编解码。数据最终以什么格式上线由传输层决定；原生 Lobby 通道目前只发
 * shared 声明的领域推送（`guild.event` / `mail.new` 等），框架不再自动组装响应体 `_mod`
 * （旧二进制通道的 `_mod` 推送与 `pushModChangeToUser` 已随 P6 删除）。
 */
export class ModSync {
    private static readonly committedListeners = new Set<
        (changes: { [key: int]: { [key: string]: any } } | undefined, call: unknown) => Promise<void> | void
    >()

    /** 宿主注册提交后的同步投递器；返回注销器，避免重启/测试遗留全局监听。 */
    static onCommitted(listener: (changes: { [key: int]: { [key: string]: any } } | undefined, call: unknown) => Promise<void> | void): () => void {
        this.committedListeners.add(listener)
        return () => this.committedListeners.delete(listener)
    }

    static async notifyCommitted(changes: { [key: int]: { [key: string]: any } } | undefined, call: unknown): Promise<void> {
        if (!changes) return
        for (const listener of this.committedListeners) await listener(changes, call)
    }
    /**
     * 自动加载mod列表
     * @param loadedHashs
     * @returns
     */
    static async autoSetMod(loadedHashs: Map<string, LoadedHashMod>) {
        const reqInfos = new Map<string, { bean?: Hash; versions: Map<string, int> }>()

        for (const [modName, loaded] of loadedHashs) {
            const modInfo = ModInfoRegistry.mods[modName]
            let reqInfo = reqInfos.get(modInfo.modName)
            if (!reqInfo) {
                reqInfo = { bean: loaded.bean, versions: new Map<string, int>() }
                reqInfos.set(modInfo.modName, reqInfo)
            } else {
                if (!reqInfo.bean) {
                    reqInfo.bean = loaded.bean
                }
            }
            reqInfo.versions.set(modInfo.subMod ?? '_self', loaded.version ?? 0)
        }

        const allModData: { [key: string]: any } = { versions: {} }
        //还没加载的要加载出来
        for (const [modName, reqInfo] of reqInfos.entries()) {
            const modInfo = ModInfoRegistry.mods[modName]
            if (!modInfo || allModData[modName]) {
                continue
            }
            if (reqInfo.bean) {
                const modData = reqInfo.bean.toModData(false, reqInfo.versions)
                if (modData?._subMods) {
                    for (const [fieldName, mod] of Object.entries(modData._subMods)) {
                        allModData.versions[fieldName] = reqInfo.bean.__versions![fieldName]
                        allModData[fieldName] = mod
                    }
                    delete modData._subMods
                    for (const [subModName] of reqInfo.versions) {
                        if (subModName !== '_self' && !allModData[subModName]) {
                            allModData[subModName] = {}
                        }
                    }
                }
                if (modData && Object.keys(modData).length > 0) {
                    allModData[modName] = modData
                    allModData.versions[modName] = reqInfo.bean.__version
                }
            } else {
                allModData[modName] = {}
            }
        }
        return allModData
    }

    /**
     * 自动组装业务执行后 mod 有变更的数据。
     *
     * 旧二进制通道的 `_mod` 推送曾消费它（`NetTask` 的跨玩家变更通知），该链已随 P6 删除，
     * 因此这里目前没有活动消费者：保留它是因为组装逻辑只依赖 Bean 字段描述与 diff，与编码无关，
     * 后续原生 Lobby 若需要 Bean 级变更推送可以直接复用。
     * ⛔ 不要为了「让它有人用」而把框架级隐式推送加回响应路径。
     */
    static autoGetModChanged(): { [key: int]: { [key: string]: any } } | undefined {
        const cache = getDifferCache()
        if (!cache || !cache.changedBeans.length || cache.notForNet) {
            return undefined
        }
        const userMod: { [key: int]: { [key: string]: any } } = {}
        for (const bean of cache.changedBeans) {
            const uids = bean.getNotifyUids()
            if (!uids || uids.length === 0) continue

            const allMod: { [key: string]: any } | undefined = {}
            const versions: { [key: string]: int } = {}
            const replaces: int[] = []
            this.getModData(bean, true, allMod, versions, replaces)
            if (!allMod || Object.keys(allMod).length <= 0) continue
            for (const notifyUid of uids) {
                const keyId = notifyUid as int
                let mod = userMod[keyId]
                if (!mod) {
                    if (uids.length === 1) {
                        //只通知给一个玩家，直接用
                        allMod.versions = versions
                        userMod[keyId] = allMod
                        continue
                    }
                    mod = userMod[keyId] = { versions: {} }
                }
                Object.assign(mod, allMod)
                Object.assign(mod.versions, versions)
            }
        }
        return userMod
    }

    static addReplace(data: JSONObject, index: number) {
        const replaces = data._replaces as int[]
        if (!replaces) {
            data._replaces = [index]
        } else {
            replaces.push(index)
        }
    }

    /**
     * 要推送的bean的替换或删除
     * @param bean
     * @param isReplace 替换，否则为删除
     * @param mod 可不传入，要同步给客户端的mod, 可直接转为mod/Mod
     * @return 要同步给客户端的mod, 可直接转为mod/Mod
     */
    static modSet(bean: RootBean, isReplace: boolean, mod: { [key: string]: any } = {}) {
        const clsInfo = bean.getClassInfo()
        if (isReplace) {
            mod[clsInfo.modName] = bean.toModData(false)
        }
        this.addReplace(mod, clsInfo.modId)
        return mod
    }

    /**
     * 要推送的mod,设置为替换
     * @param modNames 需要设置替换状态的mod名称
     * @param mod mod对象,空自动设置对象为{}
     * @returns
     */
    static modSetReplace(modNames: string | string[], mod: { [key: string]: any } = {}) {
        if (modNames.length === 0) {
            throw new Error('至少需要传入一个模块名')
        }
        if (typeof modNames === 'string') {
            modNames = [modNames]
        }
        for (const name of modNames) {
            if (!ModInfoRegistry.mods[name]) {
                throw new Error('mod不存在:' + name)
            }
        }
        for (const name of modNames) {
            const modId = ModInfoRegistry.mods[name].id
            this.addReplace(mod, modId)
            if (!mod[name]) {
                mod[name] = {}
            }
        }
        return mod
    }

    private static getModData(
        bean: RootBean,
        forChange: boolean,
        mod: { [key: string]: any },
        versions: { [key: string]: int },
        replaces?: int[],
    ) {
        const info = bean.getClassInfo()
        if (!info.forNet()) return undefined
        const data = bean.toModData(forChange)
        if (data === null) {
            return undefined
        }
        const dataKeys = data ? Object.keys(data) : []
        if (dataKeys.length === 0) {
            return undefined
        }
        //主mod有变更 */
        const modChanged = dataKeys.length !== 1 || dataKeys[0] !== '_subMods'

        const beanStatus = bean._getDiff().status
        if (info.modType === ModType.ModMap) {
            const modName = info.modName
            let hashMap = mod[modName] as { [key: string]: any }
            if (!hashMap) {
                hashMap = {}
                mod[modName] = hashMap
            }
            // dataKey增加标识
            let dataKey = bean.getKeyId()
            if (typeof bean.getKeyId() === 'string') {
                dataKey += beanStatus === BeanStatus.New ? '1' : '0'
            } else {
                dataKey = Number((BigInt(bean.getKeyId()) << 1n) | (beanStatus === BeanStatus.New ? 1n : 0n))
            }
            hashMap[dataKey] = data === undefined ? {} : data
        } else if (info.modType === ModType.ModBean) {
            if (forChange && (data === undefined || beanStatus === BeanStatus.New)) {
                //置空或新建，都要加入替换列表
                replaces?.push(info.modId)
            }
            const modName = info.modName
            if (modChanged) {
                mod[modName] = data
                versions[modName] = bean.__version!
            }
        }
        if (info.haveSubMods && data?._subMods) {
            for (const [fieldName, subData] of Object.entries(data._subMods)) {
                mod[fieldName] = subData
                versions[fieldName] = bean.__versions![fieldName]
            }
            delete data._subMods
        }
        return mod
    }

    /**
     * 本次 Action 的变更数据只走业务显式声明的出口，不再由框架自动组装推送。
     *
     * 典型场景是登录/取档：响应体已经完整返回模块数据，自动变更通知只会重复推送同一份数据。
     */
    static modNotForNet() {
        const diffCache = getDifferCache()
        if (diffCache) {
            diffCache.notForNet = true
        }
    }
}
