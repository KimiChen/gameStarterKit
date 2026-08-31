/**
 * mail 域 ws-RPC 契约。投递状态权威在 MySQL mail 表（09·A6）；
 * 推送（LobbyPush.MailNew）只做唤醒，客户端收到后走 mail.list 拉权威、按 mailId 去重。
 *
 * 执行模式：List=query；MarkRead=natural-write（UPDATE 天然幂等，不进通用幂等层，
 * 与拆分前 idem 未开的行为等价）；ClaimAttach=idempotent-write。
 * 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import type { IPurchaseResult } from "../economy";
import { defineLobbyPush, defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcNaturalWrite, defineRpcQuery } from "../defineDomain";
import { boolField, pushRecord, requiredId, rpcRecord, validateOkRes } from "../primitives";
import { validatePurchaseResult } from "./shop";

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

/** 新邮件唤醒推送载荷：⛔ 不承载邮件内容，客户端收到后走 mail.list 拉权威 */
export interface IMailNewPush {
    mailId: number;
}

/** 路由名 → { req, res } */
export interface MailRpcMap {
    [MailRpc.List]: { req: IMailListReq; res: IMailListRes };
    [MailRpc.ClaimAttach]: { req: IMailClaimAttachReq; res: IPurchaseResult };
    [MailRpc.MarkRead]: { req: IMailMarkReadReq; res: IMailMarkReadRes };
}

function validateMailSummary(input: unknown, index: number): IMailSummary {
    const path = `response.mails[${index}]`;
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["mailId", "title", "body", "hasAttach", "read", "claimed", "createdAt"], [], path);
    return {
        mailId: finiteInteger(value.mailId, `${path}.mailId`, 1),
        title: boundedString(value.title, `${path}.title`, 0, 256),
        body: boundedString(value.body, `${path}.body`, 0, 64 * 1024),
        hasAttach: boolField(value, "hasAttach"),
        read: boolField(value, "read"),
        claimed: boolField(value, "claimed"),
        createdAt: finiteInteger(value.createdAt, `${path}.createdAt`, 0),
    };
}

export const validateMailListReq: RuntimeValidator<IMailListReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, [], ["before", "limit"], "payload");
    const out: IMailListReq = {};
    if (value.before !== undefined) out.before = finiteInteger(value.before, "payload.before", 1);
    if (value.limit !== undefined) out.limit = finiteInteger(value.limit, "payload.limit", 1, 50);
    return out;
};
export const validateMailClaimReq: RuntimeValidator<IMailClaimAttachReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId", "mailId"], [], "payload");
    return { clientReqId: requiredId(value, "clientReqId"), mailId: finiteInteger(value.mailId, "payload.mailId", 1) };
};
export const validateMailMarkReq: RuntimeValidator<IMailMarkReadReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["mailId"], [], "payload"); return { mailId: finiteInteger(value.mailId, "payload.mailId", 1) };
};

export const validateMailListRes: RuntimeValidator<IMailListRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["mails"], [], "response");
    if (!Array.isArray(value.mails) || value.mails.length > 50) throw new WireValidationError("RPC_MAILS", "response.mails");
    return { mails: value.mails.map((mail, i) => validateMailSummary(mail, i)) };
};
/** ClaimAttach 复用 shop 域的 IPurchaseResult validator（⛔ 不复制实现，仅本地钉类型别名）。 */
export const validateMailClaimAttachRes: RuntimeValidator<IPurchaseResult> = validatePurchaseResult;
export const validateMailMarkReadRes: RuntimeValidator<IMailMarkReadRes> = validateOkRes;

export const validateMailNewPush: RuntimeValidator<IMailNewPush> = (input) => {
    const value = pushRecord(input, "push.data");
    assertExactKeys(value, ["mailId"], [], "push.data");
    return { mailId: finiteInteger(value.mailId, "push.data.mailId", 1) };
};

export default defineLobbyRpcDomain({
    domain: "mail",
    errorCodes: [],
    pushes: [
        defineLobbyPush("MailNew", "mail.new", validateMailNewPush),
    ],
    routes: [
        defineRpcQuery(MailRpc.List, { request: validateMailListReq, response: validateMailListRes }),
        defineRpcIdempotentWrite(MailRpc.ClaimAttach, { request: validateMailClaimReq, response: validateMailClaimAttachRes }),
        defineRpcNaturalWrite(MailRpc.MarkRead, { request: validateMailMarkReq, response: validateMailMarkReadRes }),
    ],
});
