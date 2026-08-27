/**
 * 公告 HTTP 调用面 ↔ 服务端 http/notice/list.ts（真实端点，直接返回数据体）。
 */
import { GameHttpContractMap, type INoticeListRes } from "../../shared/index";
import { request } from "../../core/http";

export function fetchNotices(): Promise<INoticeListRes> {
    return request<INoticeListRes>(GameHttpContractMap.NoticeList.method, GameHttpContractMap.NoticeList.path);
}
