import { AtomicHash, AtomicOperation, AtomicLease, type AtomicHashCodec } from '@arthropoda/game-engine'
import { NativeKitLifecycle } from '../../runtime/kit/NativeKitLifecycle'

export const gameDemoLifecycle = new NativeKitLifecycle('gameDemo', 1)
const guard: typeof gameDemoLifecycle.assertWritable = (tx) => gameDemoLifecycle.assertWritable(tx)

export class GameDemoHash<T> extends AtomicHash<T> {
    constructor(key: string, codec: AtomicHashCodec<T>) {
        super(key, codec, undefined, guard)
    }
}
export class GameDemoOperation<T> extends AtomicOperation<T> {
    constructor(key: string, validate: (value: unknown) => value is T) {
        super(key, validate, undefined, guard)
    }
}
export class GameDemoLease extends AtomicLease {
    constructor(key: string, field: string) {
        super(key, field, undefined, guard)
    }
}
