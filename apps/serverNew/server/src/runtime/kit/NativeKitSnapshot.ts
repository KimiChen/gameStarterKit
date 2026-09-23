import { createHash } from 'node:crypto'
import { AtomicHash, AtomicHashTransaction, atomicStringCodec } from '@arthropoda/game-engine'
import { NativeKitLifecycle } from './NativeKitLifecycle'

/** Read-only audit of retained kit records through the public data structure, while writes are closed. */
export class NativeKitSnapshot {
    static async read(lifecycle: NativeKitLifecycle, keys: readonly string[]) {
        if (
            !keys.length ||
            keys.length > 1000 ||
            new Set(keys).size !== keys.length ||
            keys.some((key) => !key.startsWith(`kt:${lifecycle.id}:`) || key.length > 256 || /\s/.test(key))
        )
            throw new Error('invalid snapshot keys')
        const before = await AtomicHashTransaction.run((tx) => lifecycle.state(tx))
        if (!before || !['drained', 'detached'].includes(before.phase))
            throw new Error('snapshot requires drained data')
        const snapshot: Record<string, { fields: number; sha256: string }> = {}
        for (const key of [...keys].sort()) {
            const hash = new AtomicHash(key, atomicStringCodec)
            const entries = new Map<string, string>()
            let cursor = 0
            do {
                const page = await hash.scan(cursor)
                for (const { field, value } of page.entries) entries.set(field, value)
                cursor = page.cursor
            } while (cursor !== 0)
            const rows = [...entries.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            snapshot[key] = {
                fields: rows.length,
                sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
            }
        }
        const after = await AtomicHashTransaction.run((tx) => lifecycle.state(tx))
        if (after?.epoch !== before.epoch || after.phase !== before.phase)
            throw new Error('snapshot invalidated by lifecycle change')
        return snapshot
    }
}
