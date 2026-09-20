class Test {
    private _a: number = 0

    public get a(): number {
        return this._a
    }

    public set a(value: number) {
        this._a = value
    }
}

const ob = new Test()

Object.defineProperty(ob, 'a', {
    writable: false,
})

console.log(ob.a)
