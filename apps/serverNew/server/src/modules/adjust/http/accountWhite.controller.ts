import { createHash } from 'crypto'
import { getHttpReqClientIp, timestamp } from '@arthropoda/game-engine'
import { In } from '@arthropoda/typeorm'
import { Request } from 'express'
import { Body, Get, JsonController, Post, QueryParam, Req, UseBefore } from 'routing-controllers'
import { Service } from 'typedi'
import { AdjustAccountWhiteModel } from '../../../../generated/persistence/AdjustAccountWhiteModel'
import { ResError } from '../../../http/constants/httpError'
import { AdjustAccessMiddleware } from './AdjustAccessMiddleware'

const MAX_BATCH_SIZE = 500
const MAX_ACCOUNT_LENGTH = 64
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/

interface AccountWhiteBody {
    accounts?: unknown[]
}

export interface NormalizedAccountBatch {
    requestedCount: number
    accounts: string[]
    duplicateCount: number
    invalidCount: number
}

interface AdjustRequest extends Request {
    adjustSsoUser?: {
        uid?: string
        name?: string
        account?: string
        isAdmin?: boolean
    }
}

function success(data: unknown = []) {
    return { status: 0, msg: '操作成功', data }
}

export function normalizeAccountBatch(value: unknown): NormalizedAccountBatch {
    if (!Array.isArray(value)) throw new ResError('accounts 必须是数组')
    if (value.length > MAX_BATCH_SIZE) throw new ResError(`单次最多处理 ${MAX_BATCH_SIZE} 个账号`)

    const accounts: string[] = []
    const seen = new Set<string>()
    let duplicateCount = 0
    let invalidCount = 0
    for (const rawValue of value) {
        if (typeof rawValue !== 'string') {
            invalidCount++
            continue
        }
        const account = rawValue.trim()
        if (!account || account.length > MAX_ACCOUNT_LENGTH || CONTROL_CHARACTER_PATTERN.test(account)) {
            invalidCount++
            continue
        }
        if (seen.has(account)) {
            duplicateCount++
            continue
        }
        seen.add(account)
        accounts.push(account)
    }
    return {
        requestedCount: value.length,
        accounts,
        duplicateCount,
        invalidCount,
    }
}

export function getAccountSetDigest(accounts: string[]) {
    if (accounts.length === 0) return ''
    return createHash('sha256')
        .update([...accounts].sort().join('\n'))
        .digest('hex')
        .slice(0, 24)
}

function getOperator(req: AdjustRequest) {
    return req.adjustSsoUser?.name || req.adjustSsoUser?.account || 'sso-disabled'
}

function writeAudit(req: AdjustRequest, fields: Record<string, unknown>, error?: unknown) {
    const record = {
        time: new Date().toISOString(),
        operator: getOperator(req),
        operatorId: req.adjustSsoUser?.uid || '',
        isAdmin: req.adjustSsoUser?.isAdmin === true,
        ip: getHttpReqClientIp(req),
        success: !error,
        ...fields,
        ...(error ? { errorType: error instanceof Error ? error.name : typeof error } : {}),
    }
    const line = `[adjust-account-white-audit] ${JSON.stringify(record)}`
    if (error) {
        Log.http.error(line)
        return
    }
    Log.http.info(line)
}

@JsonController('/adjust/account/white')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class AccountWhiteController {
    @Get('/list')
    async list(@Req() req: AdjustRequest, @QueryParam('keyword') keywordValue: string = '') {
        const startedAt = Date.now()
        const keyword = String(keywordValue ?? '').trim()
        try {
            if (keyword.length > MAX_ACCOUNT_LENGTH) throw new ResError('搜索关键字不能超过 64 个字符')
            const rows = await AdjustAccountWhiteModel.find({ order: { addTime: 'DESC', id: 'DESC' } })
            const normalizedKeyword = keyword.toLocaleLowerCase()
            const data = rows
                .filter(
                    (row) =>
                        !normalizedKeyword ||
                        row.account.toLocaleLowerCase().includes(normalizedKeyword) ||
                        row.openId.toLocaleLowerCase().includes(normalizedKeyword),
                )
                .map((row) => ({
                    id: row.id,
                    account: row.account,
                    openId: row.openId,
                    lastLoginTime: row.lastLoginTime,
                    addTime: row.addTime,
                    createdBy: row.createdBy,
                }))
            writeAudit(req, {
                action: 'list',
                hasKeyword: Boolean(keyword),
                resultCount: data.length,
                durationMs: Date.now() - startedAt,
            })
            return success(data)
        } catch (error) {
            writeAudit(
                req,
                {
                    action: 'list',
                    hasKeyword: Boolean(keyword),
                    durationMs: Date.now() - startedAt,
                },
                error,
            )
            throw error
        }
    }

    @Post('/add')
    async add(@Body() body: AccountWhiteBody, @Req() req: AdjustRequest) {
        const startedAt = Date.now()
        let batch: NormalizedAccountBatch | null = null
        try {
            batch = normalizeAccountBatch(body?.accounts)
            if (batch.accounts.length === 0) throw new ResError('没有可添加的有效账号')

            const existingRows = await AdjustAccountWhiteModel.findBy({ account: In(batch.accounts) })
            const existingAccounts = new Set(existingRows.map((row) => row.account))
            const pendingAccounts = batch.accounts.filter((account) => !existingAccounts.has(account))
            const addTime = timestamp()
            const createdBy = getOperator(req)
            if (pendingAccounts.length > 0) {
                await AdjustAccountWhiteModel.insert(
                    pendingAccounts.map((account) => ({
                        account,
                        openId: '',
                        lastLoginTime: 0,
                        addTime,
                        createdBy,
                    })),
                )
            }

            const data = {
                requestedCount: batch.requestedCount,
                validCount: batch.accounts.length,
                addedCount: pendingAccounts.length,
                existingCount: existingRows.length,
                duplicateCount: batch.duplicateCount,
                invalidCount: batch.invalidCount,
            }
            writeAudit(req, {
                action: 'batch_add',
                ...data,
                accountDigest: getAccountSetDigest(batch.accounts),
                durationMs: Date.now() - startedAt,
            })
            return success(data)
        } catch (error) {
            writeAudit(
                req,
                {
                    action: 'batch_add',
                    requestCount: batch?.requestedCount ?? (Array.isArray(body?.accounts) ? body.accounts.length : 0),
                    validCount: batch?.accounts.length ?? 0,
                    accountDigest: getAccountSetDigest(batch?.accounts ?? []),
                    durationMs: Date.now() - startedAt,
                },
                error,
            )
            throw error
        }
    }

    @Post('/del')
    async del(@Body() body: AccountWhiteBody, @Req() req: AdjustRequest) {
        const startedAt = Date.now()
        let batch: NormalizedAccountBatch | null = null
        try {
            batch = normalizeAccountBatch(body?.accounts)
            if (batch.accounts.length === 0) throw new ResError('没有可删除的有效账号')

            const existingRows = await AdjustAccountWhiteModel.findBy({ account: In(batch.accounts) })
            const existingAccounts = existingRows.map((row) => row.account)
            if (existingAccounts.length > 0) {
                await AdjustAccountWhiteModel.delete({ account: In(existingAccounts) })
            }
            const data = {
                requestedCount: batch.requestedCount,
                validCount: batch.accounts.length,
                deletedCount: existingAccounts.length,
                notFoundCount: batch.accounts.length - existingAccounts.length,
                duplicateCount: batch.duplicateCount,
                invalidCount: batch.invalidCount,
            }
            writeAudit(req, {
                action: 'batch_delete',
                ...data,
                accountDigest: getAccountSetDigest(batch.accounts),
                durationMs: Date.now() - startedAt,
            })
            return success(data)
        } catch (error) {
            writeAudit(
                req,
                {
                    action: 'batch_delete',
                    requestCount: batch?.requestedCount ?? (Array.isArray(body?.accounts) ? body.accounts.length : 0),
                    validCount: batch?.accounts.length ?? 0,
                    accountDigest: getAccountSetDigest(batch?.accounts ?? []),
                    durationMs: Date.now() - startedAt,
                },
                error,
            )
            throw error
        }
    }
}
