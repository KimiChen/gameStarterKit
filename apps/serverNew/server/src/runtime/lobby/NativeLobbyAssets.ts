import { AtomicHash, AtomicHashTransaction, atomicCounterCodec } from '@arthropoda/game-engine'

/** Public asset boundary: preserve the existing native Lobby keys and external uid identity. */
export class NativeLobbyAssets {
    private static readonly balanceKey = 'nativeLobby:shop:balance:v1'
    private static readonly itemsKey = 'nativeLobby:grants:items:v1'
    private static readonly versionsKey = 'nativeLobby:assets:versions:v1'

    static gold() {
        return new AtomicHash(this.balanceKey, atomicCounterCodec)
    }

    static items() {
        return new AtomicHash(this.itemsKey, atomicCounterCodec)
    }

    static versions() {
        return new AtomicHash(this.versionsKey, atomicCounterCodec)
    }

    static owner(uid: string, sId: number): string {
        if (!uid || !Number.isSafeInteger(sId) || sId < 1) throw new Error('invalid asset owner')
        return `${sId}:${uid}`
    }

    static itemOwner(uid: string, sId: number, itemId: number): string {
        if (!Number.isSafeInteger(itemId) || itemId < 1) throw new Error('invalid item id')
        return `${this.owner(uid, sId)}:${itemId}`
    }

    static async changeGold(tx: AtomicHashTransaction, uid: string, sId: number, delta: number): Promise<number> {
        const value = await this.change(tx, this.gold(), this.owner(uid, sId), delta)
        await this.change(tx, this.versions(), this.owner(uid, sId), 1)
        return value
    }

    static async changeItem(
        tx: AtomicHashTransaction,
        uid: string,
        sId: number,
        itemId: number,
        delta: number,
    ): Promise<number> {
        const value = await this.change(tx, this.items(), this.itemOwner(uid, sId, itemId), delta)
        await this.change(tx, this.versions(), this.owner(uid, sId), 1)
        return value
    }

    private static async change(
        tx: AtomicHashTransaction,
        hash: AtomicHash<number>,
        field: string,
        delta: number,
    ): Promise<number> {
        if (!Number.isSafeInteger(delta)) throw new Error('invalid asset delta')
        const balance = (await tx.get(hash, field)) ?? 0
        const next = balance + delta
        if (next < 0) throw { code: 'INSUFFICIENT_BALANCE', msg: '资源不足' }
        if (!Number.isSafeInteger(next)) throw { code: 'INTERNAL', msg: '资源数量越界' }
        await tx.set(hash, field, next)
        return next
    }
}
