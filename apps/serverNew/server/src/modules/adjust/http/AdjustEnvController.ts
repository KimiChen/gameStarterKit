import { Body, JsonController, Post, UseBefore } from 'routing-controllers'
import { Service } from 'typedi'
import { AdjustEnvModel } from '../persistence/AdjustEnvModel'
import { AdjustAccessMiddleware } from './AdjustAccessMiddleware'
import { adjustEnvRecord, normalizeAdjustEnvInput, positiveEnvIds } from './envRecord'

interface EnvEditBody {
    id?: unknown
    name?: unknown
    type?: unknown
    default_value?: unknown
    description?: unknown
}

interface EnvDeleteBody {
    id?: unknown
}

function success(data: Record<string, unknown> = {}) {
    return { status: 0, msg: '操作成功', ...data }
}

function failure(msg: string) {
    return { status: 1, msg, data: [] }
}

@JsonController('/adjust/env')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class AdjustEnvController {
    @Post('/index')
    async index() {
        const rows = await AdjustEnvModel.find({ order: { id: 'ASC' } })
        return success({ data: rows.map(adjustEnvRecord) })
    }

    @Post('/edit')
    async edit(@Body() body: EnvEditBody) {
        const normalized = normalizeAdjustEnvInput(body)
        if ('error' in normalized) {
            return failure(`保存失败:${normalized.error}`)
        }

        const id = Number(body?.id) || 0
        if (!Number.isSafeInteger(id) || id < 0) {
            return failure('保存失败:变量ID无效')
        }

        try {
            let row: AdjustEnvModel
            const now = Math.floor(Date.now() / 1000)
            if (id > 0) {
                const current = await AdjustEnvModel.findOneBy({ id })
                if (!current) return failure('保存失败:变量不存在')
                row = current
            } else {
                row = new AdjustEnvModel()
                row.createTime = now
            }
            row.name = normalized.value.name
            row.type = normalized.value.type
            row.defaultValue = normalized.value.default_value
            row.description = normalized.value.description
            row.updateTime = now
            await row.save()
            return success({ id: Number(row.id) })
        } catch (error: any) {
            Log.http.error(error)
            if (error?.code === 'ER_DUP_ENTRY') {
                return failure('保存失败:变量名已存在')
            }
            return failure('保存失败')
        }
    }

    @Post('/del')
    async delete(@Body() body: EnvDeleteBody) {
        const ids = positiveEnvIds(body?.id)
        if (ids.length === 0) {
            return failure('删除失败:请选择要删除的变量')
        }
        try {
            await AdjustEnvModel.delete(ids)
            return success()
        } catch (error) {
            Log.http.error(error)
            return failure('删除失败')
        }
    }
}
