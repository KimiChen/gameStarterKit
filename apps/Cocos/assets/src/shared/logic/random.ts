/**
 * 确定性随机数（mulberry32）—— 双端共享。
 * 同一 seed 在客户端与服务端产生完全一致的序列，
 * 可用于战斗校验、回放、帧同步等场景。
 */
export class SeededRandom {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    /** [0, 1) */
    next(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** [min, max) 的整数 */
    nextInt(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min));
    }

    /** 从数组中随机取一个元素；空数组返回 undefined */
    pick<T>(arr: readonly T[]): T | undefined {
        if (arr.length === 0) return undefined;
        return arr[this.nextInt(0, arr.length)];
    }

    /**
     * 从同一对局种子为**命名子系统**派生独立随机流（回流自 Arthur rng.makeStream）。
     * 一个子系统（wave/shop/drop/...）的消耗顺序变了不会带偏其他子系统——
     * 服务端权威抽卡 / 无头回放校验都依赖这一点。流名是双端契约，改字面量即种子不兼容。
     */
    static stream(seed: number, name: string): SeededRandom {
        return new SeededRandom((hashStr(name) ^ (seed >>> 0)) >>> 0);
    }
}

/** FNV-1a 32-bit 字符串散列（把子流名折成种子；非加密安全，仅用于可复现玩法）。 */
export function hashStr(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
