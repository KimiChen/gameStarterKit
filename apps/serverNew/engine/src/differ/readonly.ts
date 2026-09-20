import type { DiffArray } from './DiffArray'
import type { DiffMap, MapKeyType, MapValueType } from './DiffMap'
import type { BaseType } from './diff'

/**
 * `loadOnlyRead` 的返回类型。它保留业务字段的读取能力，并移除 Bean 与集合的写入口。
 * 运行时仍会拒绝写入，避免 JavaScript 调用绕过类型约束。
 */
export type ReadonlyBean<T> = {
    readonly [K in keyof T]: ReadonlyBeanValue<T[K]>
}

type ReadonlyBeanValue<T> =
    T extends DiffArray<infer V>
        ? ReadonlyDiffArray<V>
        : T extends DiffMap<infer K, infer V>
          ? ReadonlyDiffMap<K, V>
          : T extends Map<infer K, infer V>
            ? ReadonlyMap<K, ReadonlyBeanValue<V>>
            : T extends Array<infer V>
              ? readonly ReadonlyBeanValue<V>[]
              : T extends (...args: any[]) => any
                ? T
                : T extends object
                  ? ReadonlyBean<T>
                  : T

export interface ReadonlyDiffArray<T extends BaseType> extends Iterable<T> {
    at(index: number): T | undefined
    copy(): T[]
    forEach(callbackfn: (value: T, index: int, array: readonly T[]) => void): void
    includes(searchElement: T): boolean
    isEmpty(): boolean
    length(): int
    toString(): string
}

export interface ReadonlyDiffMap<K extends MapKeyType, V extends MapValueType> extends Iterable<
    [K, ReadonlyBeanValue<V>]
> {
    copy(): Map<K, ReadonlyBeanValue<V>>
    forEach(callbackfn: (value: ReadonlyBeanValue<V>, key: K, map: ReadonlyMap<K, ReadonlyBeanValue<V>>) => void): void
    get(key: K): ReadonlyBeanValue<V> | undefined
    has(key: K): boolean
    keys(): K[]
    maxKey(): number
    size(): number
    toString(): string
    values(): ReadonlyBeanValue<V>[]
}
