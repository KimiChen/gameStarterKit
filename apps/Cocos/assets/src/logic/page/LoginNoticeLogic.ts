/**
 * 公告页面逻辑（纯 TS，无头单测）——拉取公告 + 标签选公告 + 正文展示。
 *
 * 对齐源项目最新 LoginNotice（内建 CompTab 标签栏）：顶部每条公告一个标签，选标签 → txt_content 显示其正文。
 * 数据源经依赖注入（生产接 net/http/notice.fetchNotices）；导航/渲染在 view 层。
 */
import type { INoticeItem, INoticeListRes } from "../../shared/index";

const NOTICE_TAB_TITLE_MAX_LENGTH = 4;

/** 公告页签固定最多显示 4 个 Unicode 字符，完整标题仍保留在公告数据中。 */
export function formatNoticeTabTitle(title: string): string {
    return Array.from(title).slice(0, NOTICE_TAB_TITLE_MAX_LENGTH).join("");
}

export interface ILoginNoticeDeps {
    fetchNotices(signal?: AbortSignal): Promise<INoticeListRes>;
    readDontRemindToday(): boolean;
    writeDontRemindToday(value: boolean): void;
}

export class LoginNoticeLogic {
    private list: INoticeItem[] = [];
    private selectedId = 0;
    private _dontRemindToday: boolean;
    /** 页面进入世代；旧公告请求即使不能被底层取消，也不得回调已关闭 View。 */
    private generation = 0;
    private controller: AbortController | null = null;
    private active = false;

    /** 标签集变化回调（拉取完成）——view 刷新 CompTab，每个标题最多 4 个字符 */
    onTabs: (titles: string[]) => void = () => {};
    /** 选中项正文回调（切标签/默认选中）——view 刷新 txt_content + 高亮对应标签 */
    onContent: (item: INoticeItem, index: number) => void = () => {};

    constructor(private readonly deps: ILoginNoticeDeps) {
        this._dontRemindToday = deps.readDontRemindToday();
    }

    get dontRemindToday(): boolean {
        return this._dontRemindToday;
    }

    /** 保存“今日不再提醒”；存储层负责按本地日期跨页面恢复、跨天失效。 */
    setDontRemindToday(value: boolean): void {
        if (value === this._dontRemindToday) return;
        this._dontRemindToday = value;
        this.deps.writeDontRemindToday(value);
    }

    /** 进入页面：拉取公告 → 标签 = 各条标题前 4 个字符，默认选中首条。 */
    async start(signal?: AbortSignal): Promise<void> {
        this.stop();
        const generation = ++this.generation;
        const controller = new AbortController();
        this.controller = controller;
        this.active = true;
        let detach: (() => void) | null = null;
        if (signal) {
            const abort = () => {
                if (this.controller !== controller) return;
                controller.abort();
                this.generation++;
                this.controller = null;
                this.active = false;
            };
            if (signal.aborted) abort();
            else {
                signal.addEventListener("abort", abort, { once: true });
                detach = () => signal.removeEventListener("abort", abort);
            }
        }
        if (controller.signal.aborted) {
            detach?.();
            return;
        }
        try {
            const res = await this.deps.fetchNotices(controller.signal);
            if (!this.isCurrent(generation, controller)) return;
            this.list = res.list;
            this.selectedId = 0;
            this.onTabs(this.list.map((n) => formatNoticeTabTitle(n.title)));
            if (!this.isCurrent(generation, controller)) return;
            if (this.list.length > 0) this.selectCurrent(this.list[0].id, generation, controller);
        } catch (e) {
            if (this.isCurrent(generation, controller)) throw e;
        } finally {
            detach?.();
            if (this.controller === controller) this.controller = null;
        }
    }

    /** 离开页面：取消当前请求并使迟到结果失效。 */
    stop(): void {
        this.active = false;
        this.generation++;
        const controller = this.controller;
        this.controller = null;
        controller?.abort();
    }

    get items(): readonly INoticeItem[] {
        return this.list;
    }

    /** 选中某条公告（展示正文 + 高亮对应标签） */
    select(id: number): void {
        if (!this.active) return;
        const index = this.list.findIndex((n) => n.id === id);
        if (index < 0) return;
        this.selectedId = id;
        this.onContent(this.list[index], index);
    }

    get selected(): INoticeItem | undefined {
        return this.list.find((n) => n.id === this.selectedId);
    }

    private isCurrent(generation: number, controller: AbortController): boolean {
        return this.controller === controller && this.generation === generation && !controller.signal.aborted;
    }

    private selectCurrent(id: number, generation: number, controller: AbortController): void {
        if (!this.isCurrent(generation, controller)) return;
        const index = this.list.findIndex((n) => n.id === id);
        if (index < 0 || !this.isCurrent(generation, controller)) return;
        this.selectedId = id;
        this.onContent(this.list[index], index);
    }
}
