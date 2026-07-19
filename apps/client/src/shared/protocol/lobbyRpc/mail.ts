/**
 * mail 域 ws-RPC 契约。投递状态权威在 MySQL mail 表（09·A6）；
 * 推送（LobbyPush.MailNew）只做唤醒，客户端收到后走 mail.list 拉权威、按 mailId 去重。
 */
import type { IPurchaseResult } from "./economy";

/** mail 域路由名 */
export const MailRpc = {
    /** 收件箱列表（游标分页） */
    List: "mail.list",
    /** 领附件（写路径，幂等 + outbox 三阶段） */
    ClaimAttach: "mail.claimAttach",
    /** 标记已读（UPDATE 天然幂等） */
    MarkRead: "mail.markRead",
} as const;

export interface IMailSummary {
    mailId: number;
    title: string;
    body: string;
    hasAttach: boolean;
    read: boolean;
    claimed: boolean;
    /** 服务端时间戳（ms） */
    createdAt: number;
}

export interface IMailListReq {
    /** 游标：上一页最小 mailId；缺省取最新一页 */
    before?: number;
    /** 页长 1~50，缺省 20 */
    limit?: number;
}
export interface IMailListRes {
    mails: IMailSummary[];
}

export interface IMailClaimAttachReq {
    /** 幂等 id（09·I2） */
    clientReqId: string;
    mailId: number;
}

export interface IMailMarkReadReq {
    mailId: number;
}
export interface IMailMarkReadRes {
    ok: boolean;
}

/** 路由名 → { req, res } */
export interface MailRpcMap {
    [MailRpc.List]: { req: IMailListReq; res: IMailListRes };
    [MailRpc.ClaimAttach]: { req: IMailClaimAttachReq; res: IPurchaseResult };
    [MailRpc.MarkRead]: { req: IMailMarkReadReq; res: IMailMarkReadRes };
}
