export class SortedMap<K extends string | number, V> {
    private entries: [K, V][] = []

    has(key: K): boolean {
        return this.entries.some(([k]) => {
            return k === key
        })
    }

    set(key: K, value: V): void {
        const index = this.entries.findIndex(([current]) => current === key)
        if (index >= 0) {
            this.entries[index] = [key, value]
            return
        }
        this.entries.push([key, value])
    }

    get(key: K): V | undefined {
        for (const [k, v] of this.entries) {
            if (k === key) {
                return v
            }
        }
        return undefined
    }

    delete(key: K): boolean {
        const len = this.entries.length
        this.entries = this.entries.filter(([k]) => k !== key)
        return this.entries.length !== len
    }

    clear() {
        this.entries = []
    }

    sort(): void {
        this.entries.sort((a, b) => this.compareKeys(a[0], b[0]))
    }

    size(): number {
        return this.entries.length
    }

    private compareKeys(key1: K, key2: K): number {
        const num1 = this.extractNumber(key1)
        const num2 = this.extractNumber(key2)

        if (num1 !== num2) {
            return num1 - num2
        } else {
            if (typeof key1 === 'string' && typeof key2 === 'string') {
                return key1.localeCompare(key2)
            } else {
                return 0
            }
        }
    }

    private extractNumber(input: K): number {
        if (typeof input === 'number') {
            return input
        } else {
            let numberPart = ''
            for (let i = 0; i < input.toString().length; i++) {
                if (!isNaN(Number(input.toString()[i]))) {
                    numberPart += input.toString()[i]
                } else {
                    break
                }
            }
            return numberPart ? parseInt(numberPart) : Number.MAX_SAFE_INTEGER
        }
    }

    *[Symbol.iterator](): Iterator<[K, V]> {
        this.sort()
        for (const [key, value] of this.entries) {
            yield [key, value]
        }
    }

    forEach(callbackfn: (value: V, key: K) => void): void {
        this.sort()
        for (const [key, value] of this) {
            callbackfn(value, key)
        }
    }
}
