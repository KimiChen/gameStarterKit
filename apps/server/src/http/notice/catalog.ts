/**
 * 公告 demo 配置（starter kit：服务端静态配置，无 DB）。
 * 真实实现替换点：从公告表 / CMS 读；content 富文本。按 at 倒序返回。
 */
import type { INoticeItem } from "@game/shared";

export const NOTICES: readonly INoticeItem[] = [
  {
    id: 1, category: "activity", title: "开服狂欢·登录有礼",
    desc: "新服开启，登录即领豪华礼包，限时七天。",
    content: "【开服狂欢】\n新区开启期间，每日登录可领取钻石与体力礼包；累计登录 7 天额外获得限定头像框。",
    at: 1_712_100_000,
  },
  {
    id: 2, category: "notice", title: "版本更新公告 v1.2",
    desc: "新增工会系统与排行赛季，优化战斗表现。",
    content: "【v1.2 更新】\n1. 工会系统上线，可加入工会共享事件；\n2. 排行榜进入新赛季；\n3. 修复若干已知问题。",
    at: 1_712_000_000,
  },
  {
    id: 3, category: "maintain", title: "例行维护通知",
    desc: "本周四 02:00-04:00 停服维护，请提前下线。",
    content: "【维护通知】\n为提升服务质量，本周四凌晨 02:00-04:00 进行停服维护，期间无法登录，给您带来不便敬请谅解。",
    at: 1_711_800_000,
  },
];

/** 按发布时间倒序（新在前）。 */
export function listNotices(): INoticeItem[] {
  return [...NOTICES].sort((a, b) => b.at - a.at);
}
