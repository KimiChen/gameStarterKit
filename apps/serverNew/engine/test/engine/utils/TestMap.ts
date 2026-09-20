class MyMap<T, U> {
    private map: Map<T, U>

    constructor() {
        this.map = new Map<T, U>()
    }

    set(key: T, value: U): void {
        this.map.set(key, value)
    }

    *[Symbol.iterator](): Iterator<[T, U]> {
        yield* this.map.entries()
    }
}

const myMap = new MyMap<number, string>()
myMap.set(1, 'one')
myMap.set(2, 'two')
myMap.set(3, 'three')
for (const [key, value] of myMap) {
    console.log(key, value)
}
