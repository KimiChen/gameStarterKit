import { Body, JsonController, Post, UseBefore } from 'routing-controllers'
import { In } from '@arthropoda/typeorm'
import { Service } from 'typedi'
import { AdjustCaseModel } from '../persistence/AdjustCaseModel'
import { AdjustAccessMiddleware } from './AdjustAccessMiddleware'
import { AdjustCaseRecord, buildCaseTree, normalizeCaseTypes, serializeCaseField } from './caseRecord'

interface CaseTreeBody {
    type?: unknown
}

interface CaseEditBody {
    id?: unknown
    name?: unknown
    parent_id?: unknown
    type?: unknown
    router?: unknown
    content?: unknown
    param?: unknown
    ext?: unknown
}

interface CaseDeleteBody {
    ids?: unknown
}

function success(data: Record<string, unknown> = {}) {
    return { status: 0, msg: '操作成功', ...data }
}

function failure(msg: string) {
    return { status: 1, msg, data: [] }
}

function positiveIds(value: unknown) {
    const values = Array.isArray(value) ? value : [value]
    return [...new Set(values.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
}

function caseRecord(row: AdjustCaseModel): AdjustCaseRecord {
    return {
        id: Number(row.id),
        name: row.name,
        parent_id: Number(row.parentId) || 0,
        type: Number(row.type) || 0,
        router: row.router,
        content: row.content,
        param: row.param,
        ext: row.ext,
    }
}

@JsonController('/adjust/case')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class AdjustCaseController {
    @Post('/tree')
    async tree(@Body() body: CaseTreeBody) {
        const types = normalizeCaseTypes(body?.type)
        const rows =
            types.length > 0
                ? await AdjustCaseModel.find({ where: { type: In(types) }, order: { id: 'ASC' } })
                : await AdjustCaseModel.find({ order: { id: 'ASC' } })
        return success({ data: buildCaseTree(rows.map(caseRecord)) })
    }

    @Post('/edit')
    async edit(@Body() body: CaseEditBody) {
        const id = Number(body?.id) || 0
        const name = typeof body?.name === 'string' ? body.name.trim() : ''
        const parentId = Number(body?.parent_id) || 0
        if (!name || name.length > 64) {
            return failure('保存失败:用例名称长度必须为1到64个字符')
        }
        if (!Number.isSafeInteger(parentId) || parentId < 0) {
            return failure('保存失败:父级分组无效')
        }
        if (id > 0 && parentId === id) {
            return failure('保存失败:不能选择自身作为父级分组')
        }

        const parentError = await this.validateParent(id, parentId)
        if (parentError) {
            return failure(parentError)
        }

        try {
            let row: AdjustCaseModel
            if (id > 0) {
                const current = await AdjustCaseModel.findOneBy({ id })
                if (!current) return failure('保存失败:用例不存在')
                row = current
            } else {
                const type = Number(body?.type)
                if (!Number.isInteger(type) || ![0, 1, 2, 3].includes(type)) {
                    return failure('保存失败:用例类型无效')
                }
                row = new AdjustCaseModel()
                const now = Math.floor(Date.now() / 1000)
                row.createTime = now
                row.updateTime = now
                row.type = type
                row.router = typeof body?.router === 'string' ? body.router : ''
            }

            row.name = name
            row.parentId = parentId
            row.content = serializeCaseField(body?.content)
            row.param = serializeCaseField(body?.param, '[]')
            row.ext = serializeCaseField(body?.ext)
            row.updateTime = Math.floor(Date.now() / 1000)
            await row.save()
            return success({ id: Number(row.id) })
        } catch (error: any) {
            Log.http.error(error)
            if (error?.code === 'ER_DUP_ENTRY') {
                return failure('保存失败:用例名称已存在')
            }
            return failure('保存失败')
        }
    }

    @Post('/del')
    async delete(@Body() body: CaseDeleteBody) {
        const ids = positiveIds(body?.ids)
        if (ids.length === 0) {
            return failure('删除失败:请选择要删除的用例')
        }
        try {
            const child = await AdjustCaseModel.findOneBy({ parentId: In(ids) })
            if (child) {
                return failure('删除失败:请先删除子项')
            }
            await AdjustCaseModel.delete(ids)
            return success()
        } catch (error) {
            Log.http.error(error)
            return failure('删除失败')
        }
    }

    private async validateParent(id: number, parentId: number) {
        if (parentId === 0) return ''
        const visited = new Set<number>()
        const initialParent = await AdjustCaseModel.findOneBy({ id: parentId })
        if (!initialParent || initialParent.type !== 0) {
            return '保存失败:父级分组不存在'
        }
        let parent: AdjustCaseModel = initialParent
        while (parent.parentId > 0) {
            const currentId = Number(parent.id)
            if (currentId === id) return '保存失败:不能移动到自己的子分组'
            if (visited.has(currentId)) return '保存失败:分组层级存在循环'
            visited.add(currentId)
            const nextParent: AdjustCaseModel | null = await AdjustCaseModel.findOneBy({ id: Number(parent.parentId) })
            if (!nextParent) break
            parent = nextParent
        }
        return Number(parent.id) === id ? '保存失败:不能移动到自己的子分组' : ''
    }
}
