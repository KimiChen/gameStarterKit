/**
 * canonical JSON 序列化 —— 幂等 payload 摘要的**仓库唯一参考实现**（Non-intrusive §6.11）。
 *
 * 规则（golden vectors 见 apps/server/test/canonical-json.test.ts）：
 *  - 对象键按 UTF-16 码元序稳定排序（`Array.prototype.sort` 的默认字符串序）；
 *  - 数组顺序保留；
 *  - 仅接受 JSON 值域：null / boolean / 有限 number / string / 数组 / plain object；
 *  - `undefined`、函数、symbol、bigint、NaN/Infinity、非 plain 对象（Date/Map/类实例）
 *    与循环引用一律 throw——摘要输入必须先经 shared validator 归一化，出现这些值
 *    说明上游有缺陷，静默跳过会让「相同 payload」产生不同摘要；
 *  - `-0` 规约为 `0`（与 `JSON.stringify` 一致），字符串转义委托 `JSON.stringify`。
 *
 * ⛔ 其他语言或领域代码不得自行解释「稳定排序」——一律复用本实现（服务端经
 * `core/idem.ts` 的 `idemPayloadHash` 消费；客户端 journal 重发字节等同留阶段 5）。
 * 零依赖纯 TS（铁律 4）：无 npm 包、无宿主 API。
 */

function isPlainJsonObject(value: object): boolean {
    const proto: unknown = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function writeCanonical(value: unknown, out: string[], stack: object[], path: string): void {
    if (value === null) { out.push("null"); return; }
    switch (typeof value) {
        case "boolean":
            out.push(value ? "true" : "false");
            return;
        case "number":
            if (!Number.isFinite(value)) {
                throw new TypeError(`canonicalJson: ${path} 是非有限 number（${String(value)}）`);
            }
            // -0 与 0 序列化相同（JSON.stringify 同款语义），避免同值异摘要
            out.push(JSON.stringify(value === 0 ? 0 : value));
            return;
        case "string":
            out.push(JSON.stringify(value));
            return;
        case "object":
            break;
        default:
            throw new TypeError(`canonicalJson: ${path} 是 JSON 值域外的 ${typeof value}`);
    }
    const objectValue = value as object;
    if (stack.includes(objectValue)) {
        throw new TypeError(`canonicalJson: ${path} 存在循环引用`);
    }
    stack.push(objectValue);
    try {
        if (Array.isArray(objectValue)) {
            out.push("[");
            for (let index = 0; index < objectValue.length; index++) {
                if (index > 0) { out.push(","); }
                const element: unknown = objectValue[index];
                if (element === undefined) {
                    throw new TypeError(`canonicalJson: ${path}[${index}] 是 undefined/稀疏元素`);
                }
                writeCanonical(element, out, stack, `${path}[${index}]`);
            }
            out.push("]");
            return;
        }
        if (!isPlainJsonObject(objectValue)) {
            throw new TypeError(`canonicalJson: ${path} 不是 plain object（类实例/Date/Map 等不在 JSON 值域）`);
        }
        const record = objectValue as Record<string, unknown>;
        // ⚠ UTF-16 码元序（默认字符串比较），⛔ 不是 locale/码点序——双端必须逐字一致
        const keys = Object.keys(record).sort();
        out.push("{");
        for (let index = 0; index < keys.length; index++) {
            const key = keys[index];
            const member = record[key];
            if (member === undefined) {
                throw new TypeError(`canonicalJson: ${path}.${key} 是 undefined（validator 归一化后不应残留）`);
            }
            if (index > 0) { out.push(","); }
            out.push(JSON.stringify(key), ":");
            writeCanonical(member, out, stack, `${path}.${key}`);
        }
        out.push("}");
    } finally {
        stack.pop();
    }
}

/** 稳定序列化一个已归一化的 JSON 值；非 JSON 值域输入直接 throw（fail-fast，不静默剥离）。 */
export function canonicalJsonString(value: unknown): string {
    const out: string[] = [];
    writeCanonical(value, out, [], "$");
    return out.join("");
}
