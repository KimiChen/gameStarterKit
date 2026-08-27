/**
 * 存储/消息边界的数字解析。
 *
 * `Number("12junk")`、`parseInt("12junk")` 和 `Number(null)` 都会把坏数据
 * 变成看似合法的领域值。所有从 Redis/MySQL/stream 读出的数字应先经过这里，
 * 在进入公式或协议前拒绝 NaN、Infinity、尾随垃圾和越界整数。
 */
export function storedFinite(
  raw: unknown,
  name: string,
  options: { min?: number; max?: number } = {},
): number {
  const text = typeof raw === "number"
    ? (Number.isFinite(raw) ? String(raw) : "")
    : typeof raw === "string" ? raw.trim() : "";
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    throw new Error(`${name} 不是合法有限数：${String(raw)}`);
  }
  const value = Number(text);
  if (!Number.isFinite(value)
    || (options.min !== undefined && value < options.min)
    || (options.max !== undefined && value > options.max)) {
    throw new Error(`${name} 数值越界：${String(raw)}`);
  }
  return value;
}

export function storedInt(
  raw: unknown,
  name: string,
  options: { min?: number; max?: number } = {},
): number {
  const text = typeof raw === "number"
    ? (Number.isInteger(raw) ? String(raw) : "")
    : typeof raw === "string" ? raw.trim() : "";
  if (!/^-?\d+$/.test(text)) {
    throw new Error(`${name} 不是合法整数：${String(raw)}`);
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value)
    || (options.min !== undefined && value < options.min)
    || (options.max !== undefined && value > options.max)) {
    throw new Error(`${name} 整数越界：${String(raw)}`);
  }
  return value;
}

/** 可选存储字段：null/undefined 使用默认值，非空值必须严格合法。 */
export function optionalStoredInt(
  raw: unknown,
  fallback: number,
  name: string,
  options: { min?: number; max?: number } = {},
): number {
  return raw === null || raw === undefined ? fallback : storedInt(raw, name, options);
}

export function optionalStoredFinite(
  raw: unknown,
  fallback: number,
  name: string,
  options: { min?: number; max?: number } = {},
): number {
  return raw === null || raw === undefined ? fallback : storedFinite(raw, name, options);
}
