/**
 * 通用提示框逻辑（纯 TS，无头单测）——标题/正文 + 确定/取消回调。
 *
 * 通用工具弹窗：view 层用 ConfirmLogic 的数据渲染 Confirm 组件，按钮回调走本类。
 * 回调只触发一次（点过即失效），防重复点。
 */
export interface IConfirmOptions {
    title?: string;
    content: string;
    /** 确定按钮文案，缺省「确定」 */
    yesText?: string;
    /** 取消按钮文案，缺省「取消」；传 null 则隐藏取消按钮（单按钮提示） */
    noText?: string | null;
    onYes?: () => void;
    onNo?: () => void;
}

export class ConfirmLogic {
    readonly title: string;
    readonly content: string;
    readonly yesText: string;
    /** null = 单按钮模式（无取消） */
    readonly noText: string | null;
    /** view 关闭本弹窗的回调（yes/no 后调用） */
    onClose: () => void = () => {};

    private settled = false;

    constructor(private readonly opts: IConfirmOptions) {
        this.title = opts.title ?? "提示";
        this.content = opts.content;
        this.yesText = opts.yesText ?? "确定";
        this.noText = opts.noText === undefined ? "取消" : opts.noText;
    }

    get hasCancel(): boolean {
        return this.noText !== null;
    }

    yes(): void {
        if (this.settled) return;
        this.settled = true;
        this.opts.onYes?.();
        this.onClose();
    }

    no(): void {
        if (this.settled) return;
        this.settled = true;
        this.opts.onNo?.();
        this.onClose();
    }
}
