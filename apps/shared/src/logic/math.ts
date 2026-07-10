/**
 * 纯数学工具 —— 双端共享，无任何环境依赖。
 */

export function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/** 将向量归一化；零向量返回 (0, 0) */
export function normalize(x: number, y: number): { x: number; y: number } {
    const len = Math.sqrt(x * x + y * y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: x / len, y: y / len };
}
