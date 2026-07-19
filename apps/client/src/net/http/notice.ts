/**
 * 公告 HTTP 调用面 ↔ 服务端 http/notice/list.ts（真实端点，直接返回数据体）。
 */
import type { INoticeListRes } from "../../shared/index";
import { request } from "../../core/http";

export function fetchNotices(): Promise<INoticeListRes> {
    return request<INoticeListRes>("GET", "/notice/list");
}
