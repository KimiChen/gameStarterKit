export class Counter {
    private readonly min: int

    private readonly max: int

    private _last: int

    constructor(min: int = 1, max: int = Number.MAX_SAFE_INTEGER) {
        this.min = min
        this.max = max
        this._last = max
    }

    reset() {
        this._last = this.max
    }

    getNext(notInc?: boolean): int {
        return this._last >= this.max ? (this._last = this.min) : notInc ? this._last : ++this._last
    }

    get last(): int {
        return this._last
    }
}
