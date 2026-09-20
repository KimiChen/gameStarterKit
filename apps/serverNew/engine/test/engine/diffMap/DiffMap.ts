function TestUint() {
    const num: number = -1
    // const id = num & 0x7fffffff
    console.log(num >>> 0)

    const m: Map<int, int> = new Map<int, int>()
    m.set(1, 1)
    m.set(2, 2)

    m.forEach((f) => {
        console.log(f)
        return
    })
}

TestUint()
