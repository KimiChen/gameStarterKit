import { timestamp } from '@arthropoda/game-engine'
import { In } from '@arthropoda/typeorm'
import { Request, Response } from 'express'
import multer from 'multer'
import { Body, JsonController, Post, Req, Res, UploadedFile, UseBefore } from 'routing-controllers'
import { Service } from 'typedi'
import { AdjustRobotBatchPlanModel } from '../../../../../generated/persistence/AdjustRobotBatchPlanModel'
import { ResError } from '../../../../http/constants/httpError'
import { AdjustAccessMiddleware } from '../AdjustAccessMiddleware'
import { AdjustRobotRequest, auditRobot } from './robotAudit'
import {
    ROBOT_LIMITS,
    asRobotInteger,
    normalizeBatchPlanPayload,
    normalizeRobotIds,
    parseRobotJson,
    robotSuccess,
    robotSuccessId,
    validateRobotDescription,
    validateRobotName,
} from './robotPayload'

const batchPlanUpload = {
    storage: multer.memoryStorage(),
    limits: { fileSize: ROBOT_LIMITS.maxImportBytes },
}

function toBatchPlanResponse(row: AdjustRobotBatchPlanModel) {
    return {
        id: Number(row.id),
        name: row.name,
        data: row.data,
        description: row.description,
        createTime: row.createTime,
        updateTime: row.updateTime,
        created_at: new Date(row.createTime * 1000).toISOString(),
        updated_at: new Date(row.updateTime * 1000).toISOString(),
    }
}

function toBatchPlanExport(row: AdjustRobotBatchPlanModel) {
    return {
        name: row.name,
        description: row.description,
        data: parseRobotJson<Record<string, unknown>>(row.data, { users: [] }),
    }
}

@JsonController('/adjust/multipleCase')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class RobotBatchPlanController {
    private async requireUniqueName(name: string, currentId = 0) {
        const duplicate = await AdjustRobotBatchPlanModel.findOneBy({ name })
        if (duplicate && Number(duplicate.id) !== currentId) throw new ResError('批量方案名称已存在')
    }

    private async nextImportName(value: unknown) {
        const base = validateRobotName(value, '批量方案名称').slice(0, 56)
        if (!(await AdjustRobotBatchPlanModel.findOneBy({ name: base }))) return base
        for (let index = 1; index <= 999; index++) {
            const suffix = `-导入${index}`
            const candidate = base.slice(0, 64 - suffix.length) + suffix
            if (!(await AdjustRobotBatchPlanModel.findOneBy({ name: candidate }))) return candidate
        }
        throw new ResError('无法生成不重复的导入方案名称')
    }

    @Post('/getList')
    async getList(
        @Req() req: AdjustRobotRequest,
        @Body() body: { page?: unknown; pageSize?: unknown; name?: unknown; description?: unknown } = {},
    ) {
        const startedAt = Date.now()
        try {
            const page = Math.max(1, asRobotInteger(body.page, 1))
            const pageSize = Math.min(1000, Math.max(1, asRobotInteger(body.pageSize, 15)))
            const name = String(body.name ?? '')
                .trim()
                .toLowerCase()
            const description = String(body.description ?? '')
                .trim()
                .toLowerCase()
            const rows = await AdjustRobotBatchPlanModel.find({ order: { updateTime: 'DESC', id: 'DESC' } })
            const filtered = rows
                .filter((row) => !name || row.name.toLowerCase().includes(name))
                .filter((row) => !description || row.description.toLowerCase().includes(description))
            const offset = (page - 1) * pageSize
            const data = filtered.slice(offset, offset + pageSize).map(toBatchPlanResponse)
            auditRobot(req, {
                action: 'batch_plan_list',
                resultCount: data.length,
                total: filtered.length,
                durationMs: Date.now() - startedAt,
            })
            return robotSuccess({
                current_page: page,
                data,
                from: data.length > 0 ? offset + 1 : null,
                last_page: Math.max(1, Math.ceil(filtered.length / pageSize)),
                per_page: pageSize,
                to: data.length > 0 ? offset + data.length : null,
                total: filtered.length,
            })
        } catch (error) {
            auditRobot(req, { action: 'batch_plan_list', durationMs: Date.now() - startedAt }, error)
            throw error
        }
    }

    @Post('/detail')
    async detail(@Body() body: { id?: unknown }, @Req() req: AdjustRobotRequest) {
        const startedAt = Date.now()
        const id = asRobotInteger(body.id)
        try {
            const row = await AdjustRobotBatchPlanModel.findOneBy({ id })
            if (!row) throw new ResError('批量方案不存在')
            auditRobot(req, { action: 'batch_plan_detail', batchPlanId: id, durationMs: Date.now() - startedAt })
            return robotSuccess(toBatchPlanResponse(row))
        } catch (error) {
            auditRobot(req, { action: 'batch_plan_detail', batchPlanId: id, durationMs: Date.now() - startedAt }, error)
            throw error
        }
    }

    @Post('/edit')
    async edit(@Body() body: Record<string, unknown>, @Req() req: AdjustRobotRequest) {
        const startedAt = Date.now()
        const id = asRobotInteger(body.id)
        try {
            const name = validateRobotName(body.name, '批量方案名称')
            const description = validateRobotDescription(body.description)
            const normalized = normalizeBatchPlanPayload(body.data)
            await this.requireUniqueName(name, id)
            const current = id > 0 ? await AdjustRobotBatchPlanModel.findOneBy({ id }) : null
            if (id > 0 && !current) throw new ResError('批量方案不存在')
            const now = timestamp()
            const row = current ?? AdjustRobotBatchPlanModel.create()
            row.name = name
            row.description = description
            row.data = normalized.serialized
            row.createTime = current?.createTime ?? now
            row.updateTime = now
            await row.save()
            auditRobot(req, {
                action: id > 0 ? 'batch_plan_update' : 'batch_plan_create',
                batchPlanId: Number(row.id),
                userCount: normalized.userCount,
                dataBytes: Buffer.byteLength(row.data),
                durationMs: Date.now() - startedAt,
            })
            return robotSuccessId(Number(row.id))
        } catch (error) {
            auditRobot(
                req,
                {
                    action: id > 0 ? 'batch_plan_update' : 'batch_plan_create',
                    batchPlanId: id,
                    durationMs: Date.now() - startedAt,
                },
                error,
            )
            throw error
        }
    }

    @Post('/del')
    async del(@Body() body: { id?: unknown }, @Req() req: AdjustRobotRequest) {
        return this.deleteIds(body.id, req, 'batch_plan_delete')
    }

    @Post('/delete')
    async deleteMany(@Body() body: { ids?: unknown }, @Req() req: AdjustRobotRequest) {
        return this.deleteIds(body.ids, req, 'batch_plan_batch_delete')
    }

    @Post('/copy')
    async copy(@Body() body: { id?: unknown; newName?: unknown }, @Req() req: AdjustRobotRequest) {
        const startedAt = Date.now()
        const id = asRobotInteger(body.id)
        try {
            const source = await AdjustRobotBatchPlanModel.findOneBy({ id })
            if (!source) throw new ResError('复制源方案不存在')
            const name = validateRobotName(body.newName, '新方案名称')
            await this.requireUniqueName(name)
            const now = timestamp()
            const row = AdjustRobotBatchPlanModel.create()
            row.name = name
            row.description = source.description
            row.data = source.data
            row.createTime = now
            row.updateTime = now
            await row.save()
            auditRobot(req, {
                action: 'batch_plan_copy',
                sourceId: id,
                batchPlanId: Number(row.id),
                durationMs: Date.now() - startedAt,
            })
            return robotSuccessId(Number(row.id))
        } catch (error) {
            auditRobot(req, { action: 'batch_plan_copy', sourceId: id, durationMs: Date.now() - startedAt }, error)
            throw error
        }
    }

    @Post('/import')
    async importFile(
        @UploadedFile('file', { options: batchPlanUpload }) file: Express.Multer.File,
        @Req() req: AdjustRobotRequest,
    ) {
        const startedAt = Date.now()
        try {
            if (!file?.buffer) throw new ResError('请选择导入文件')
            let parsed: unknown
            try {
                parsed = JSON.parse(file.buffer.toString('utf8').replace(/^\uFEFF/, ''))
            } catch {
                throw new ResError('批量方案导入文件必须是合法 JSON')
            }
            const input = Array.isArray(parsed) ? parsed : ((parsed as any)?.data ?? [parsed])
            if (!Array.isArray(input) || input.length === 0 || input.length > 100)
                throw new ResError('单次导入方案数量必须为 1-100')
            const now = timestamp()
            const ids: number[] = []
            for (const raw of input) {
                const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
                const normalized = normalizeBatchPlanPayload(item.data)
                const row = AdjustRobotBatchPlanModel.create()
                row.name = await this.nextImportName(item.name)
                row.description = validateRobotDescription(item.description)
                row.data = normalized.serialized
                row.createTime = now
                row.updateTime = now
                await row.save()
                ids.push(Number(row.id))
            }
            auditRobot(req, {
                action: 'batch_plan_import',
                importCount: ids.length,
                durationMs: Date.now() - startedAt,
            })
            return robotSuccess({ ids, importedCount: ids.length })
        } catch (error) {
            auditRobot(
                req,
                { action: 'batch_plan_import', fileBytes: file?.size ?? 0, durationMs: Date.now() - startedAt },
                error,
            )
            throw error
        }
    }

    @Post('/export')
    async exportFile(@Body() body: { ids?: unknown }, @Req() req: Request, @Res() res: Response) {
        const ids = normalizeRobotIds(body.ids, 100)
        const rows = await AdjustRobotBatchPlanModel.find({ where: { id: In(ids) }, order: { id: 'ASC' } })
        if (rows.length === 0) throw new ResError('没有可导出的批量方案')
        auditRobot(req as AdjustRobotRequest, {
            action: 'batch_plan_export',
            requestCount: ids.length,
            exportCount: rows.length,
        })
        const filename = `robot-batch-plans-${new Date().toISOString().slice(0, 10)}.json`
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        return res.send(Buffer.from(JSON.stringify(rows.map(toBatchPlanExport), null, 2), 'utf8'))
    }

    @Post('/stats')
    async stats(@Req() req: AdjustRobotRequest) {
        const rows = await AdjustRobotBatchPlanModel.find({ order: { updateTime: 'DESC', id: 'DESC' } })
        let totalUsers = 0
        let totalTasks = 0
        for (const row of rows) {
            const users = parseRobotJson<any>(row.data, { users: [] }).users
            if (!Array.isArray(users)) continue
            totalUsers += users.length
            totalTasks += users.reduce(
                (sum: number, user: any) => sum + (Array.isArray(user?.tasks) ? user.tasks.length : 0),
                0,
            )
        }
        const data = {
            total: rows.length,
            totalUsers,
            totalTasks,
            latestUpdateTime: rows[0]?.updateTime ?? 0,
        }
        auditRobot(req, { action: 'batch_plan_stats', ...data })
        return robotSuccess(data)
    }

    private async deleteIds(value: unknown, req: AdjustRobotRequest, action: string) {
        const startedAt = Date.now()
        let ids: number[] = []
        try {
            ids = normalizeRobotIds(value)
            const result = await AdjustRobotBatchPlanModel.delete({ id: In(ids) })
            const deletedCount = result.affected ?? 0
            auditRobot(req, { action, requestCount: ids.length, deletedCount, durationMs: Date.now() - startedAt })
            return robotSuccess({ deletedCount })
        } catch (error) {
            auditRobot(req, { action, requestCount: ids.length, durationMs: Date.now() - startedAt }, error)
            throw error
        }
    }
}
