import { timestamp } from '@arthropoda/game-engine'
import { In } from '@arthropoda/typeorm'
import { Request, Response } from 'express'
import multer from 'multer'
import { Body, JsonController, Post, Req, Res, UploadedFile, UseBefore } from 'routing-controllers'
import { Service } from 'typedi'
import { AdjustRobotEnvironmentModel } from '../../../../../generated/persistence/AdjustRobotEnvironmentModel'
import { ResError } from '../../../../http/constants/httpError'
import { AdjustAccessMiddleware } from '../AdjustAccessMiddleware'
import { AdjustRobotRequest, auditRobot } from './robotAudit'
import {
    ROBOT_LIMITS,
    asRobotInteger,
    normalizeEnvironmentPayload,
    normalizeRobotIds,
    parseSimpleCsv,
    robotSuccess,
    robotSuccessId,
} from './robotPayload'

const environmentUpload = {
    storage: multer.memoryStorage(),
    limits: { fileSize: ROBOT_LIMITS.maxImportBytes },
}

function toEnvironmentResponse(row: AdjustRobotEnvironmentModel) {
    return {
        id: Number(row.id),
        name: row.name,
        type: row.type,
        default_value: row.defaultValue,
        description: row.description,
        createTime: row.createTime,
        updateTime: row.updateTime,
    }
}

function parseEnvironmentImport(file: Express.Multer.File) {
    const text = file.buffer.toString('utf8').replace(/^\uFEFF/, '')
    if (file.originalname.toLowerCase().endsWith('.csv')) {
        const rows = parseSimpleCsv(text)
        const header = rows.shift()?.map((item) => item.trim()) ?? []
        const positions = {
            name: header.indexOf('name'),
            type: header.indexOf('type'),
            default_value: header.indexOf('default_value'),
            description: header.indexOf('description'),
        }
        if (Object.values(positions).some((index) => index < 0))
            throw new ResError('CSV 必须包含 name、type、default_value、description 列')
        return rows.map((row) => ({
            name: row[positions.name],
            type: row[positions.type],
            default_value: row[positions.default_value],
            description: row[positions.description],
        }))
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        throw new ResError('导入文件必须是合法 JSON 或 CSV')
    }
    const list = Array.isArray(parsed) ? parsed : (parsed as any)?.data
    if (!Array.isArray(list)) throw new ResError('导入文件必须包含变量数组')
    return list
}

@JsonController('/adjust/env')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class RobotEnvironmentController {
    @Post('/index')
    async index(
        @Req() req: AdjustRobotRequest,
        @Body() body: { id?: unknown; keyword?: unknown; type?: unknown } = {},
    ) {
        const startedAt = Date.now()
        try {
            const id = asRobotInteger(body.id)
            const keyword = String(body.keyword ?? '')
                .trim()
                .toLowerCase()
            const type = String(body.type ?? '').trim()
            const rows =
                id > 0
                    ? await AdjustRobotEnvironmentModel.find({ where: { id } })
                    : await AdjustRobotEnvironmentModel.find({ order: { name: 'ASC', id: 'ASC' } })
            const data = rows
                .filter(
                    (row) =>
                        !keyword ||
                        row.name.toLowerCase().includes(keyword) ||
                        row.description.toLowerCase().includes(keyword),
                )
                .filter((row) => !type || row.type === type)
                .map(toEnvironmentResponse)
            auditRobot(req, {
                action: 'environment_list',
                resultCount: data.length,
                durationMs: Date.now() - startedAt,
            })
            return robotSuccess(data)
        } catch (error) {
            auditRobot(req, { action: 'environment_list', durationMs: Date.now() - startedAt }, error)
            throw error
        }
    }

    @Post('/edit')
    async edit(@Body() body: Record<string, unknown>, @Req() req: AdjustRobotRequest) {
        const startedAt = Date.now()
        const id = asRobotInteger(body.id)
        try {
            const value = normalizeEnvironmentPayload(body)
            const duplicate = await AdjustRobotEnvironmentModel.findOneBy({ name: value.name })
            if (duplicate && Number(duplicate.id) !== id) throw new ResError('变量名已存在')
            const current = id > 0 ? await AdjustRobotEnvironmentModel.findOneBy({ id }) : null
            if (id > 0 && !current) throw new ResError('全局变量不存在')
            const now = timestamp()
            const row = current ?? AdjustRobotEnvironmentModel.create()
            row.name = value.name
            row.type = value.type
            row.defaultValue = value.defaultValue
            row.description = value.description
            row.createTime = current?.createTime ?? now
            row.updateTime = now
            await row.save()
            auditRobot(req, {
                action: id > 0 ? 'environment_update' : 'environment_create',
                environmentId: Number(row.id),
                valueType: row.type,
                valueBytes: Buffer.byteLength(row.defaultValue),
                durationMs: Date.now() - startedAt,
            })
            return robotSuccessId(Number(row.id))
        } catch (error) {
            auditRobot(
                req,
                {
                    action: id > 0 ? 'environment_update' : 'environment_create',
                    environmentId: id,
                    durationMs: Date.now() - startedAt,
                },
                error,
            )
            throw error
        }
    }

    @Post('/del')
    async del(@Body() body: { id?: unknown }, @Req() req: AdjustRobotRequest) {
        const startedAt = Date.now()
        let ids: number[] = []
        try {
            ids = normalizeRobotIds(body?.id)
            const result = await AdjustRobotEnvironmentModel.delete({ id: In(ids) })
            const deletedCount = result.affected ?? 0
            auditRobot(req, {
                action: 'environment_delete',
                requestCount: ids.length,
                deletedCount,
                durationMs: Date.now() - startedAt,
            })
            return robotSuccess({ deletedCount })
        } catch (error) {
            auditRobot(
                req,
                { action: 'environment_delete', requestCount: ids.length, durationMs: Date.now() - startedAt },
                error,
            )
            throw error
        }
    }

    @Post('/import')
    async importFile(
        @UploadedFile('file', { options: environmentUpload }) file: Express.Multer.File,
        @Req() req: AdjustRobotRequest,
    ) {
        const startedAt = Date.now()
        try {
            if (!file?.buffer) throw new ResError('请选择导入文件')
            const input = parseEnvironmentImport(file)
            if (input.length === 0 || input.length > 1000) throw new ResError('单次导入变量数量必须为 1-1000')
            const normalized = input.map((item) => normalizeEnvironmentPayload(item as Record<string, unknown>))
            if (new Set(normalized.map((item) => item.name)).size !== normalized.length)
                throw new ResError('导入文件包含重复变量名')
            const now = timestamp()
            let createdCount = 0
            let updatedCount = 0
            for (const item of normalized) {
                const current = await AdjustRobotEnvironmentModel.findOneBy({ name: item.name })
                const row = current ?? AdjustRobotEnvironmentModel.create()
                row.name = item.name
                row.type = item.type
                row.defaultValue = item.defaultValue
                row.description = item.description
                row.createTime = current?.createTime ?? now
                row.updateTime = now
                await row.save()
                if (current) updatedCount++
                else createdCount++
            }
            auditRobot(req, {
                action: 'environment_import',
                importCount: normalized.length,
                createdCount,
                updatedCount,
                durationMs: Date.now() - startedAt,
            })
            return robotSuccess({ createdCount, updatedCount })
        } catch (error) {
            auditRobot(
                req,
                { action: 'environment_import', fileBytes: file?.size ?? 0, durationMs: Date.now() - startedAt },
                error,
            )
            throw error
        }
    }

    @Post('/export')
    async exportFile(@Req() req: Request, @Res() res: Response) {
        const rows = await AdjustRobotEnvironmentModel.find({ order: { name: 'ASC', id: 'ASC' } })
        const payload = rows.map((row) => ({
            name: row.name,
            type: row.type,
            default_value: row.defaultValue,
            description: row.description,
        }))
        auditRobot(req as AdjustRobotRequest, { action: 'environment_export', exportCount: payload.length })
        const filename = `global-variables-${new Date().toISOString().slice(0, 10)}.json`
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        return res.send(Buffer.from(JSON.stringify(payload, null, 2), 'utf8'))
    }
}
