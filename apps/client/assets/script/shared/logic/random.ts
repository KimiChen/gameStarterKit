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
}
