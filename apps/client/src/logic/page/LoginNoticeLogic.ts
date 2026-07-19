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
    fetchNotices(): Promise<INoticeListRes>;
    readDontRemindToday(): boolean;
    writeDontRemindToday(value: boolean): void;
}

export class LoginNoticeLogic {
    private list: INoticeItem[] = [];
    private selectedId = 0;
    private _dontRemindToday: boolean;

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

    /** 进入页面：拉取公告 → 标签 = 各条标题前 4 个字符，默认选中首条 */
    async start(): Promise<void> {
        const res = await this.deps.fetchNotices();
        this.list = res.list;
        this.onTabs(this.list.map((n) => formatNoticeTabTitle(n.title)));
        if (this.list.length > 0) this.select(this.list[0].id);
    }

    get items(): readonly INoticeItem[] {
        return this.list;
    }

    /** 选中某条公告（展示正文 + 高亮对应标签） */
    select(id: number): void {
        const index = this.list.findIndex((n) => n.id === id);
        if (index < 0) return;
        this.selectedId = id;
        this.onContent(this.list[index], index);
    }

    get selected(): INoticeItem | undefined {
        return this.list.find((n) => n.id === this.selectedId);
    }
}
