/**
 * 开发期错误弹框 —— 把「Error（Please open the console to see detailed errors）」换成
 * 一个能读、能选、能一键复制的弹框。
 *
 * 为什么要自己做一个：截图里那个灰底黑框是 **Cocos Creator 预览页自带的**
 * （`<Creator 安装目录>/builtin/preview/static/views/index.ejs` + `resources/init.js` 的
 * `showError`），它在编辑器安装目录里，仓库改不到；3.8.8 也不支持项目级 preview 模板覆盖。
 * 而真正需要它的场景恰恰是**手机上开预览**（`http://<局域网 IP>:7456`）——那儿根本没有
 * 「打开控制台」这回事。所以补一个由游戏包自己装的弹框：预览、debug 构建、真机都在。
 *
 * ⚠ 只在 `DEV` 下装（预览 + debug 构建）：release 构建 ⛔ 不把堆栈甩给玩家。
 *   这道闸在**调用点**（Main.ts）上，本模块因此零 `cc` 依赖、可在 Node 里直接单测。
 * ⚠ 弹框按**游戏画布**定位与缩放（不是浏览器窗口）：尺寸用设计分辨率（designSpec 的 750 宽）
 *   写，再按画布实际 CSS 宽度换算，⛔ 不写死 px——否则手机上要么糊成一团要么大得出屏。
 * ⚠ 复制必须在 **http** 下也能用：局域网 IP 不是安全上下文，`navigator.clipboard` 不可用，
 *   所以按「异步剪贴板 → execCommand → 选中让用户长按」三级降级，⛔ 不假设任何一级存在。
 * ⛔ 不 import `cc`（一行都不），⛔ 不碰引擎对象：错误发生时引擎可能已经半死。
 */
import { DESIGN_WIDTH } from "../designSpec";
import { snapshotErrorContext } from "./errorContext";

/** 一条去重后的错误记录。 */
export interface ErrorOverlayEntry {
    readonly kind: "error" | "unhandledrejection";
    readonly message: string;
    readonly stack: string;
    /** 同一条（message+stack 相同）重复出现的次数；渲染成「×N」。 */
    count: number;
}

export interface ErrorOverlayEnvironment {
    readonly url: string;
    readonly userAgent: string;
    readonly at: string;
    /** 出错当时的游戏上下文（core/errorContext 的快照）：当前页面、玩法 mode、runId… */
    readonly context?: readonly (readonly [string, string])[];
}

/** 最多留几条：错误常常成串刷屏，留最新的即可。 */
const MAX_ENTRIES = 20;

/**
 * 组装「复制」按钮真正写进剪贴板的文本。纯函数，单测直接钉它——
 * 复制出来的东西要能原样贴进 issue：环境行在最前，之后每条是「序号/类型/次数 + 消息 + 堆栈」。
 */
export function formatErrorReport(
    entries: readonly ErrorOverlayEntry[],
    environment: ErrorOverlayEnvironment,
): string {
    const head = [
        `时间：${environment.at}`,
        `页面：${environment.url}`,
        `UA：${environment.userAgent}`,
        `错误：${entries.length} 条`,
        // 上下文放在错误正文**之前**：贴进 issue 时第一眼要能看出「在哪个页面、哪一局」出的事。
        ...(environment.context ?? []).map(([key, value]) => `${key}：${value}`),
    ];
    const body = entries.map((entry, index) => {
        const times = entry.count > 1 ? `（×${entry.count}）` : "";
        const lines = [`[${index + 1}] ${entry.kind}${times} ${entry.message}`];
        if (entry.stack) lines.push(entry.stack);
        return lines.join("\n");
    });
    return [...head, "", ...body].join("\n");
}

/** 把 error / unhandledrejection 事件归一成一条记录（消息与堆栈都尽量取到）。 */
export function describeErrorEvent(kind: ErrorOverlayEntry["kind"], detail: unknown): {
    readonly message: string;
    readonly stack: string;
} {
    if (detail instanceof Error) {
        return { message: `${detail.name}: ${detail.message}`, stack: detail.stack ?? "" };
    }
    if (typeof detail === "object" && detail !== null) {
        const record = detail as { message?: unknown; stack?: unknown; reason?: unknown };
        if (record.reason !== undefined) return describeErrorEvent(kind, record.reason);
        const message = typeof record.message === "string" ? record.message : safeStringify(detail);
        const stack = typeof record.stack === "string" ? record.stack : "";
        return { message, stack };
    }
    return { message: typeof detail === "string" ? detail : safeStringify(detail), stack: "" };
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

// ── 下面是 DOM 接线；为了能在 Node 单测里跑，只依赖这几个最小形状 ──────────────────

interface OverlayStyle { [property: string]: string }

interface OverlayRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number }

interface OverlayElement {
    style: OverlayStyle;
    getBoundingClientRect?(): OverlayRect;
    textContent: string;
    readonly children?: readonly OverlayElement[];
    appendChild(child: OverlayElement): OverlayElement;
    addEventListener(type: string, listener: () => void): void;
    setAttribute?(name: string, value: string): void;
    remove?(): void;
    select?(): void;
    focus?(): void;
    value?: string;
}

interface OverlayDocument {
    readonly body: OverlayElement | null;
    createElement(tag: string): OverlayElement;
    querySelector(selector: string): OverlayElement | null;
    execCommand?(command: string): boolean;
}

interface OverlayWindow {
    addEventListener(type: string, listener: (event: unknown) => void): void;
    readonly innerWidth?: number;
    readonly innerHeight?: number;
    readonly navigator?: { readonly userAgent?: string; readonly clipboard?: { writeText(text: string): Promise<void> } };
    readonly location?: { readonly href?: string };
}

export interface ErrorOverlayDeps {
    readonly doc?: OverlayDocument | null;
    readonly win?: OverlayWindow | null;
    /**
     * 装不装。⚠ 调用方必须显式传 `DEV`（见 Main.ts）——缺省 true 只为测试省事，
     * ⛔ 别在 release 构建里不带这个参数调用。
     */
    readonly enabled?: boolean;
    readonly now?: () => Date;
}

export interface ErrorOverlayHandle {
    /** 供测试与手工触发：像收到一次错误那样推一条进去。 */
    push(kind: ErrorOverlayEntry["kind"], detail: unknown): void;
    entries(): readonly ErrorOverlayEntry[];
    /** 复制按钮的行为（返回落到了哪一级降级）。 */
    copy(): Promise<"clipboard" | "execCommand" | "selection">;
    dispose(): void;
}

let installed: ErrorOverlayHandle | null = null;

/**
 * 装上错误弹框。重复调用是 no-op；没有 DOM（小游戏 / 无头单测）也是 no-op。
 * 返回 handle 供测试驱动；生产调用方（Main.ts）忽略返回值即可。
 */
export function installErrorOverlay(deps: ErrorOverlayDeps = {}): ErrorOverlayHandle | null {
    if (installed) return installed;
    const enabled = deps.enabled ?? true;
    if (!enabled) return null;
    const doc = deps.doc ?? (typeof document === "undefined" ? null : (document as unknown as OverlayDocument));
    const win = deps.win ?? (typeof window === "undefined" ? null : (window as unknown as OverlayWindow));
    if (!doc || !win || !doc.body) return null;
    const handle = createOverlay(doc, win, deps.now ?? ((): Date => new Date()));
    installed = handle;
    return handle;
}

/** 测试 seam：拆掉已安装的弹框。⛔ 运行时不要调用。 */
export function __resetErrorOverlayForTest(): void {
    installed?.dispose();
    installed = null;
}

/**
 * 版面尺寸一律写**设计分辨率下的 px**（designSpec 的 750×1624 那套坐标），
 * 渲染时统一乘以 `画布 CSS 宽度 / DESIGN_WIDTH`。⛔ 不要在这里写 CSS px。
 */
const DESIGN = {
    panelWidth: 690, radius: 24, border: 2,
    titleFont: 30, bodyFont: 24, buttonFont: 28,
    padding: 28, gap: 16, buttonHeight: 84, maxPanelHeight: 1180,
} as const;

/** 画布量不到时（无头/异常早于画布创建）的兜底比例：按设计宽算 1:1，至少不崩。 */
const FALLBACK_SCALE = 1;

function createOverlay(doc: OverlayDocument, win: OverlayWindow, now: () => Date): ErrorOverlayHandle {
    const entries: ErrorOverlayEntry[] = [];
    let scrim: OverlayElement | null = null;
    let list: OverlayElement | null = null;
    let title: OverlayElement | null = null;
    let copyButton: OverlayElement | null = null;
    let disposed = false;

    let panel: OverlayElement | null = null;
    let bar: OverlayElement | null = null;
    let closeButton: OverlayElement | null = null;

    const environment = (): ErrorOverlayEnvironment => ({
        url: win.location?.href ?? "",
        userAgent: win.navigator?.userAgent ?? "",
        at: now().toISOString(),
        context: snapshotErrorContext(),
    });

    const style = (element: OverlayElement, values: OverlayStyle): OverlayElement => {
        for (const key of Object.keys(values)) element.style[key] = values[key];
        return element;
    };

    /**
     * 游戏画布在页面里的位置与大小。⚠ 弹框贴的是**画布**不是窗口：预览页里画布只占中间一块
     * （旁边还有 Creator 的工具条），手机上画布才是整屏。量不到就退回整窗。
     */
    const gameRect = (): OverlayRect => {
        const canvas = doc.querySelector("#GameCanvas") ?? doc.querySelector("canvas");
        const rect = canvas?.getBoundingClientRect?.();
        if (rect && rect.width > 0 && rect.height > 0) return rect;
        return { left: 0, top: 0, width: win.innerWidth ?? DESIGN_WIDTH, height: win.innerHeight ?? 0 };
    };

    /** 设计分辨率 px → 当前画布下的 CSS px。 */
    const scaleOf = (rect: OverlayRect): number => (rect.width > 0 ? rect.width / DESIGN_WIDTH : FALLBACK_SCALE);
    const px = (design: number, scale: number): string => `${Math.round(design * scale * 100) / 100}px`;

    /** 按当前画布重新排版（首次构建、每次出错、窗口/朝向变化时都会调）。 */
    const layout = (): void => {
        if (!scrim || !panel || !title || !list || !bar) return;
        const rect = gameRect();
        const scale = scaleOf(rect);
        style(scrim, {
            left: `${rect.left}px`, top: `${rect.top}px`,
            width: `${rect.width}px`, height: `${rect.height}px`,
        });
        style(panel, {
            width: px(DESIGN.panelWidth, scale),
            maxHeight: `min(${px(DESIGN.maxPanelHeight, scale)}, ${Math.round(rect.height * 0.86)}px)`,
            borderRadius: px(DESIGN.radius, scale),
            borderWidth: px(DESIGN.border, scale),
            fontSize: px(DESIGN.bodyFont, scale),
            boxShadow: `0 ${px(DESIGN.gap, scale)} ${px(DESIGN.padding * 1.6, scale)} rgba(0,0,0,.55)`,
        });
        style(title, {
            padding: `${px(DESIGN.padding, scale)} ${px(DESIGN.padding, scale)}`,
            fontSize: px(DESIGN.titleFont, scale),
        });
        style(list, {
            padding: `${px(DESIGN.gap, scale)} ${px(DESIGN.padding, scale)}`,
            fontSize: px(DESIGN.bodyFont, scale),
        });
        style(bar, {
            gap: px(DESIGN.gap, scale),
            padding: `${px(DESIGN.gap, scale)} ${px(DESIGN.padding, scale)}`,
        });
        for (const button of [copyButton, closeButton]) {
            if (!button) continue;
            style(button, {
                minHeight: px(DESIGN.buttonHeight, scale),
                borderRadius: px(DESIGN.radius * 0.6, scale),
                fontSize: px(DESIGN.buttonFont, scale),
            });
        }
    };

    const build = (): void => {
        if (scrim || !doc.body) return;
        // ⚠ 预览页自己那个 #error 框留着只会和本弹框叠在一起；直接藏掉，内容我们已经全收了。
        const creatorBox = doc.querySelector("#error");
        if (creatorBox) creatorBox.style.display = "none";

        // ⚠ 只覆盖画布那块矩形：⛔ 不铺满窗口——预览页里那样会连 Creator 的工具条一起压住。
        scrim = style(doc.createElement("div"), {
            position: "fixed", display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(4,6,12,.6)", zIndex: "2147483646",
        });
        panel = style(doc.createElement("div"), {
            display: "flex", flexDirection: "column", overflow: "hidden",
            background: "#171b24", color: "#eef3ff",
            borderStyle: "solid", borderColor: "#384154",
            fontFamily: "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
            zIndex: "2147483647",
        });
        title = style(doc.createElement("div"), {
            fontWeight: "600", borderBottom: "1px solid #2b3243", flex: "0 0 auto",
        });
        list = style(doc.createElement("div"), {
            overflow: "auto", flex: "1 1 auto",
            whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.55",
            fontFamily: "ui-monospace, Menlo, Consolas, monospace", color: "#c8d3ea",
            // 手机上要能长按选中——这是第三级降级的前提。
            userSelect: "text", webkitUserSelect: "text",
        });
        bar = style(doc.createElement("div"), {
            display: "flex", borderTop: "1px solid #2b3243", flex: "0 0 auto",
        });
        copyButton = style(doc.createElement("button"), {
            flex: "1", border: "0", cursor: "pointer", color: "#0d1017", background: "#7fb2ff",
        });
        copyButton.textContent = "复制全部";
        copyButton.addEventListener("click", () => { void copy(); });
        closeButton = style(doc.createElement("button"), {
            flex: "1", border: "0", cursor: "pointer", color: "#c8d3ea", background: "#2b3243",
        });
        closeButton.textContent = "关闭";
        closeButton.addEventListener("click", () => { hide(); });
        bar.appendChild(copyButton);
        bar.appendChild(closeButton);
        panel.appendChild(title);
        panel.appendChild(list);
        panel.appendChild(bar);
        scrim.appendChild(panel);
        doc.body.appendChild(scrim);
        // 转屏 / 改窗口大小后画布位置会变，弹框跟着重排。
        win.addEventListener("resize", () => { if (scrim?.style.display !== "none") layout(); });
        win.addEventListener("orientationchange", () => { if (scrim?.style.display !== "none") layout(); });
    };

    const render = (): void => {
        build();
        if (!scrim || !list || !title) return;
        scrim.style.display = "flex";
        layout();
        const total = entries.reduce((sum, entry) => sum + entry.count, 0);
        title.textContent = entries.length === 1 && total === 1
            ? "出错了（1 条）"
            : `出错了（${entries.length} 条，共 ${total} 次）`;
        list.textContent = formatErrorReport(entries, environment());
        if (copyButton) copyButton.textContent = "复制全部";
    };

    const hide = (): void => {
        if (scrim) scrim.style.display = "none";
    };

    const push = (kind: ErrorOverlayEntry["kind"], detail: unknown): void => {
        if (disposed) return;
        const { message, stack } = describeErrorEvent(kind, detail);
        const same = entries.find((entry) => entry.message === message && entry.stack === stack);
        if (same) same.count += 1;
        else {
            entries.push({ kind, message, stack, count: 1 });
            // 只留最新的若干条：错误常常成串刷屏。
            if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
        }
        render();
    };

    /**
     * 三级降级：安全上下文用异步剪贴板；http 下退 execCommand；都没有就把文本选中，
     * 让用户长按「拷贝」。⛔ 不静默失败——按钮文案会说明落到了哪一级。
     */
    const copy = async (): Promise<"clipboard" | "execCommand" | "selection"> => {
        const text = formatErrorReport(entries, environment());
        const clipboard = win.navigator?.clipboard;
        if (clipboard) {
            try {
                await clipboard.writeText(text);
                if (copyButton) copyButton.textContent = "已复制 ✓";
                return "clipboard";
            } catch {
                // 落到下一级
            }
        }
        if (doc.execCommand) {
            const scratch = doc.createElement("textarea");
            scratch.value = text;
            style(scratch, { position: "fixed", opacity: "0", pointerEvents: "none" });
            doc.body?.appendChild(scratch);
            scratch.focus?.();
            scratch.select?.();
            let ok = false;
            try { ok = doc.execCommand("copy"); } catch { ok = false; }
            scratch.remove?.();
            if (ok) {
                if (copyButton) copyButton.textContent = "已复制 ✓";
                return "execCommand";
            }
        }
        list?.select?.();
        if (copyButton) copyButton.textContent = "已选中，长按复制";
        return "selection";
    };

    win.addEventListener("error", (event) => {
        const detail = (event as { error?: unknown; message?: unknown }).error
            ?? (event as { message?: unknown }).message ?? event;
        push("error", detail);
    });
    win.addEventListener("unhandledrejection", (event) => {
        push("unhandledrejection", (event as { reason?: unknown }).reason ?? event);
    });

    return {
        push,
        entries: () => entries,
        copy,
        dispose: () => {
            disposed = true;
            scrim?.remove?.();
            scrim = null;
            panel = null;
            bar = null;
            closeButton = null;
            list = null;
            title = null;
            copyButton = null;
        },
    };
}
