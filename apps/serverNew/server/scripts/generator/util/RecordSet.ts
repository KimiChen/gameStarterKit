import { RecordGen } from './RecordGen'

export class RecordSet<T> extends RecordGen {
    val: Set<T> = new Set<T>()

    protected toObj(): { [p: string]: any } {
        return Array.from(this.val)
    }

    protected toRecord(obj: any) {
        this.val = new Set(obj as T[])
    }

    has(val: T) {
        return this.val.has(val)
    }

    add(val: T) {
        return this.val.add(val)
    }

    values() {
        return this.val.values()
    }
}
