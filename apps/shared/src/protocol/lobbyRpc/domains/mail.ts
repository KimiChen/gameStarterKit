/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/mail.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { boolField, boundedArray, pushRecord, rpcRecord } from "../primitives";
import { defineLobbyPush, defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcNaturalWrite, defineRpcQuery } from "../defineDomain";
import type { IPurchaseResult } from "../economy";
import { validatePurchaseResult } from "../economy";

/** mail 域路由名 */
export const MailRpc = {
    List: "mail.list",
    ClaimAttach: "mail.claimAttach",
    MarkRead: "mail.markRead",
} as const;

export interface IMailListReq {
    before?: number
    limit?: number
}

export interface IMailSummary {
    mailId: number
    title: string
    body: string
    hasAttach: boolean
    read: boolean
    claimed: boolean
    createdAt: number
}

export interface IMailListRes {
    mails: IMailSummary[]
}

export interface IMailClaimAttachReq {
    clientReqId: string
    mailId: number
}

export interface IMailMarkReadReq {
    mailId: number
}

export interface IMailMarkReadRes {
    ok: boolean
}

export interface IMailNewPush {
    mailId: number
}

function parseIMailListReq(input: unknown, path: string): IMailListReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, [], ["before", "limit"], path)
    const out: IMailListReq = {
    }
    if (value.before !== undefined) out.before = finiteInteger(value.before, `${path}.before`, 1, Number.MAX_SAFE_INTEGER)
    if (value.limit !== undefined) out.limit = finiteInteger(value.limit, `${path}.limit`, 1, 50)
    return out
}

function parseIMailSummary(input: unknown, path: string): IMailSummary {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["mailId", "title", "body", "hasAttach", "read", "claimed", "createdAt"], [], path)
    const out: IMailSummary = {
        mailId: finiteInteger(value.mailId, `${path}.mailId`, 1, Number.MAX_SAFE_INTEGER),
        title: boundedString(value.title, `${path}.title`, 0, 256),
        body: boundedString(value.body, `${path}.body`, 0, 65536),
        hasAttach: boolField(value, "hasAttach"),
        read: boolField(value, "read"),
        claimed: boolField(value, "claimed"),
        createdAt: finiteInteger(value.createdAt, `${path}.createdAt`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIMailListRes(input: unknown, path: string): IMailListRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["mails"], [], path)
    const out: IMailListRes = {
        mails: boundedArray(value.mails, `${path}.mails`, 0, 50, "RPC_MAILS").map((item, i) => parseIMailSummary(item, `${path}.mails[${i}]`)),
    }
    return out
}

function parseIMailClaimAttachReq(input: unknown, path: string): IMailClaimAttachReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "mailId"], [], path)
    const out: IMailClaimAttachReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        mailId: finiteInteger(value.mailId, `${path}.mailId`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIMailMarkReadReq(input: unknown, path: string): IMailMarkReadReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["mailId"], [], path)
    const out: IMailMarkReadReq = {
        mailId: finiteInteger(value.mailId, `${path}.mailId`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIMailMarkReadRes(input: unknown, path: string): IMailMarkReadRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["ok"], [], path)
    const out: IMailMarkReadRes = {
        ok: boolField(value, "ok"),
    }
    return out
}

function parseIMailNewPush(input: unknown, path: string): IMailNewPush {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["mailId"], [], path)
    const out: IMailNewPush = {
        mailId: finiteInteger(value.mailId, `${path}.mailId`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

export const validateMailListReq: RuntimeValidator<IMailListReq> = (input) => parseIMailListReq(input, "payload")

export const validateMailListRes: RuntimeValidator<IMailListRes> = (input) => parseIMailListRes(input, "response")

export const validateMailClaimAttachReq: RuntimeValidator<IMailClaimAttachReq> = (input) => parseIMailClaimAttachReq(input, "payload")

export const validateMailClaimAttachRes: RuntimeValidator<IPurchaseResult> = (input) => validatePurchaseResult(input, "response")

export const validateMailMarkReadReq: RuntimeValidator<IMailMarkReadReq> = (input) => parseIMailMarkReadReq(input, "payload")

export const validateMailMarkReadRes: RuntimeValidator<IMailMarkReadRes> = (input) => parseIMailMarkReadRes(input, "response")

export const validateMailNewPush: RuntimeValidator<IMailNewPush> = (input) => parseIMailNewPush(pushRecord(input, "push.data"), "push.data")

export default defineLobbyRpcDomain({
    domain: "mail",
    contractVersion: 5,
    errorCodes: [],
    pushes: [
        defineLobbyPush("MailNew", "mail.new", validateMailNewPush),
    ],
    routes: [
        defineRpcQuery(MailRpc.List, { request: validateMailListReq, response: validateMailListRes }),
        defineRpcIdempotentWrite(MailRpc.ClaimAttach, { request: validateMailClaimAttachReq, response: validateMailClaimAttachRes }),
        defineRpcNaturalWrite(MailRpc.MarkRead, { request: validateMailMarkReadReq, response: validateMailMarkReadRes }),
    ],
});
