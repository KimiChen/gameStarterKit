/**
 * 出错时要一并带走的**游戏上下文**（当前页面、玩法 mode、runId…）。
 *
 * 为什么单独一个模块：报上下文的人（ViewBase、各玩法 logic）与显示错误的人（core/errorOverlay）
 * 不该互相依赖——前者只需要「登记一条键值」，⛔ 不该把 DOM 弹框拖进自己的导入图。
 *
 * ⛔ 零依赖：不 import `cc`、不 import 弹框、不碰 DOM。任何模块都能安全地引它。
 * ⚠ 只放**诊断用的短字符串**：⛔ 不放 token、不放玩家隐私、不放整包快照——这些内容会被
 *   「复制全部」原样带进玩家发出来的日志里。
 */

/** 单条上下文的最大长度：⛔ 别让某一条把整个报告顶掉。 */
const MAX_VALUE_LENGTH = 200;
/** 键的容量上限：登记点是有限的几处，超了说明有人在拿它当日志用。 */
const MAX_KEYS = 32;

const values = new Map<string, string>();

/**
 * 登记（或更新）一条上下文。`null` / `undefined` = 撤下这条。
 * 插入顺序即展示顺序：先登记的先显示，更新已有键 ⛔ 不改变它的位置。
 */
export function setErrorContext(key: string, value: string | number | null | undefined): void {
    if (value === null || value === undefined) {
        values.delete(key);
        return;
    }
    const text = String(value);
    if (!values.has(key) && values.size >= MAX_KEYS) return;
    values.set(key, text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text);
}

/** 当前快照（插入序），供错误报告渲染。 */
export function snapshotErrorContext(): readonly (readonly [string, string])[] {
    return [...values.entries()];
}

/** 测试 seam：清空。⛔ 运行时不要调用。 */
export function __resetErrorContextForTest(): void {
    values.clear();
}
