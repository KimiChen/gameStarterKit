import { mapEnd, mapFirst } from '../utils/common'
import { GameError } from '../error/GameError'

export class ConfigReadonlyMap<K, V> implements ReadonlyMap<K, V> {
    protected readonly internalMap: Map<K, V>

    protected readonly confName: string

    constructor(name: string, m?: Map<K, V>) {
        this.confName = name
        this.internalMap = m ?? new Map()
    }

    get size(): number {
        return this.internalMap.size
    }

    has(key: K): boolean {
        return this.internalMap.has(key)
    }

    get(key: K): V {
        const v = this.internalMap.get(key)
        if (v === undefined) {
            const err = GameError.sysNoConf.params({ vars: [this.confName, key] })
            err.getItem().stack = (new Error()).stack
            throw err
        }
        return v
    }

    forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: any): void {
        this.internalMap.forEach(callback, thisArg)
    }

    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this.internalMap[Symbol.iterator]()
    }

    entries(): IterableIterator<[K, V]> {
        return this.internalMap.entries()
    }

    keys(): IterableIterator<K> {
        return this.internalMap.keys()
    }

    values(): IterableIterator<V> {
        return this.internalMap.values()
    }

    first(): V | undefined {
        return mapFirst(this.internalMap)
    }

    end(): V | undefined {
        return mapEnd(this.internalMap)
    }

    arrayValues(): V[] {
        return Array.from(this.internalMap.values())
    }

    arrayKeys(): K[] {
        return Array.from(this.internalMap.keys())
    }
}

export class ConfigMap<K, V> extends ConfigReadonlyMap<K, V> {
    set(k: K, v: V) {
        this.internalMap.set(k, v)
    }
}
