// 在 .d.ts 文件中，不要使用 import/export，而是使用 declare namespace 和 declare module
// 如果在 .d.ts 文件中使用import export, 那么这个文件中声明的类型会被模块内的类型，而不是当成全局类型  其它地方引用需要 手动引入 import {ConfType} from 'types.d.ts'

type RealConf = Pick<IConfigMap, Exclude<keyof IConfigMap, 'param'>>
type ConfKey<K> = K extends keyof IConfigKey ? IConfigKey[K] : never
interface ConfFunc<K, V> {
    (): ConfigReadonlyMap<ConfKey<K>, V>
    (id: ConfKey<K>): V
}
declare type ConfType = {
    [K in keyof RealConf]: ConfFunc<K, RealConf[K]>
}

interface ConfigReadonlyMap<K, V> extends ReadonlyMap<K, V> {
    first(): V
    end(): V
    arrayValues(): V[]
    arrayKeys(): K[]

    // 提示覆盖,不返回undefined;当===undefined时，抛出异常
    get(key: K): V
}

type RecordU<K extends keyof any, T> = {
    [P in K]: T | undefined
}
