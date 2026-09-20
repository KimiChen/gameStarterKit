import { Body, Get, JsonController, Post, QueryParam, UseBefore } from 'routing-controllers'
import { In } from '@arthropoda/typeorm'
import { DB } from '@arthropoda/game-engine'
import { Service } from 'typedi'
import { AdjustFuncCaseModel } from '../../../../generated/persistence/AdjustFuncCaseModel'
import { ResError } from '../../../http/constants/httpError'
import { AdjustAccessMiddleware } from './AdjustAccessMiddleware'
import { buildFuncCaseTree } from './funcCaseTree'

interface EditCaseNodeBody {
    id?: number
    name?: string
    type?: number
    parent_id?: number
    sort?: number
}

interface FuncCaseUserConfig extends Record<string, unknown> {
    account: string
    password: string
    number: number
}

interface FuncCaseStep {
    route: string
    flag: string
    params: Array<{ name?: string; value?: unknown }>
    delay: number
    count: number
    interval: number
    firstUserOnlyExec: boolean
}

function success(data: unknown = []) {
    return { status: 0, msg: '操作成功', data }
}

function asInteger(value: unknown, fallback = 0) {
    const number = Number(value)
    return Number.isInteger(number) ? number : fallback
}

function validateName(value: unknown) {
    const name = String(value ?? '').trim()
    if (!name || name.length > 50) throw new ResError('名称长度必须为 1-50 个字符')
    return name
}

function validateUser(value: unknown): FuncCaseUserConfig {
    const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    const account = String(input.account ?? '').trim()
    const password = String(input.password ?? 'cs123456')
    const number = asInteger(input.number, 1)
    if (account.length > 64) throw new ResError('账号前缀不能超过 64 个字符')
    if (!password || password.length > 128) throw new ResError('账号密码长度必须为 1-128 个字符')
    if (number < 1 || number > 100) throw new ResError('批量账号数量必须为 1-100')
    return { account, password, number }
}

function validateSteps(value: unknown): FuncCaseStep[] {
    if (!Array.isArray(value)) throw new ResError('案例步骤必须是数组')
    if (value.length > 100) throw new ResError('单个案例最多配置 100 个步骤')
    return value.map((raw, index) => {
        const step = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
        const route = String(step.route ?? '').trim()
        const flag = String(step.flag ?? 'api').trim()
        const params = Array.isArray(step.params) ? step.params : []
        const delay = asInteger(step.delay)
        const count = asInteger(step.count, 1)
        const interval = asInteger(step.interval, 1)
        if (!route || route.length > 160) throw new ResError(`第 ${index + 1} 个步骤缺少有效功能路由`)
        if (!flag || flag.length > 32) throw new ResError(`第 ${index + 1} 个步骤类型无效`)
        if (params.length > 100) throw new ResError(`第 ${index + 1} 个步骤参数过多`)
        if (delay < 0 || delay > 86400 || interval < 0 || interval > 86400) {
            throw new ResError(`第 ${index + 1} 个步骤延迟或间隔超出范围`)
        }
        if (count < 1 || count > 100) throw new ResError(`第 ${index + 1} 个步骤次数必须为 1-100`)
        return {
            route,
            flag,
            params: params as FuncCaseStep['params'],
            delay,
            count,
            interval,
            firstUserOnlyExec: Boolean(step.firstUserOnlyExec),
        }
    })
}

@JsonController('/adjust/func-case')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class FuncCaseController {
    private async requireGroup(parentId: number, currentId = 0) {
        if (parentId === 0) return
        if (parentId === currentId) throw new ResError('节点不能移动到自身下面')
        const foundParent = await AdjustFuncCaseModel.findOneBy({ id: parentId })
        if (!foundParent || foundParent.type !== 0) throw new ResError('父级分组不存在')
        let parent: AdjustFuncCaseModel = foundParent
        const visited = new Set<number>()
        while (Number(parent.parentId) > 0) {
            if (Number(parent.parentId) === currentId) throw new ResError('不能将分组移动到自己的子分组下')
            if (visited.has(parent.id)) throw new ResError('分组层级存在循环')
            visited.add(parent.id)
            const nextParent: AdjustFuncCaseModel | null = await AdjustFuncCaseModel.findOneBy({
                id: Number(parent.parentId),
            })
            if (!nextParent) break
            parent = nextParent
        }
    }

    @Get('/tree')
    async tree(@QueryParam('type') type: string = 'all') {
        const rows = await AdjustFuncCaseModel.find({ order: { parentId: 'ASC', sort: 'ASC', id: 'ASC' } })
        const typeNumber = type === 'all' ? null : asInteger(type, -1)
        const list = rows
            .filter((row) => typeNumber === null || row.type === typeNumber)
            .map((row) => ({
                id: row.id,
                parent_id: Number(row.parentId),
                type: row.type,
                name: row.name,
                sort: row.sort,
            }))
        return success(buildFuncCaseTree(list))
    }

    @Get('/detail')
    async detail(@QueryParam('id') id: number) {
        const row = await AdjustFuncCaseModel.findOneBy({ id: asInteger(id) })
        if (!row) throw new ResError('案例或分组不存在')
        return success({
            id: row.id,
            name: row.name,
            type: row.type,
            parent_id: Number(row.parentId),
            user: row.user,
            func: row.func,
            sort: row.sort,
        })
    }

    @Post('/editBase')
    async editBase(@Body() body: EditCaseNodeBody) {
        const id = asInteger(body.id)
        const name = validateName(body.name)
        const parentId = asInteger(body.parent_id)
        const sort = Math.max(0, asInteger(body.sort))
        await this.requireGroup(parentId, id)

        if (id > 0) {
            const row = await AdjustFuncCaseModel.findOneBy({ id })
            if (!row) throw new ResError('案例或分组不存在')
            row.name = name
            row.parentId = parentId
            row.sort = sort
            await row.save()
            return success({ id })
        }

        const type = asInteger(body.type)
        if (![0, 1].includes(type)) throw new ResError('节点类型无效')
        const row = AdjustFuncCaseModel.create()
        row.name = name
        row.type = type
        row.parentId = parentId
        row.sort = sort
        row.user = { account: '', password: 'cs123456', number: 1 }
        row.func = []
        await row.save()
        return success({ id: row.id })
    }

    @Post('/editContent')
    async editContent(@Body() body: { id?: number; user?: unknown; func?: unknown }) {
        const row = await AdjustFuncCaseModel.findOneBy({ id: asInteger(body.id) })
        if (!row || row.type !== 1) throw new ResError('案例不存在')
        const user = validateUser(body.user)
        const func = validateSteps(body.func)
        if (Buffer.byteLength(JSON.stringify({ user, func })) > 1024 * 1024) {
            throw new ResError('案例内容不能超过 1MB')
        }
        row.user = user
        row.func = func
        await row.save()
        return success({ id: row.id })
    }

    @Post('/copy')
    async copy(@Body() body: EditCaseNodeBody) {
        const sourceId = asInteger(body.id)
        const parentId = asInteger(body.parent_id)
        const name = validateName(body.name)
        await this.requireGroup(parentId, sourceId)

        const copiedId = await DB.startTransaction(async (runner) => {
            const copyNode = async (id: number, toParentId: number, rootName?: string): Promise<number> => {
                const source = await runner.manager.findOneBy(AdjustFuncCaseModel, { id })
                if (!source) throw new ResError('复制源不存在')
                const target = runner.manager.create(AdjustFuncCaseModel, {
                    name: rootName ?? source.name,
                    type: source.type,
                    parentId: toParentId,
                    user: source.user,
                    func: source.func,
                    sort: source.sort,
                })
                await runner.manager.save(target)
                if (source.type === 0) {
                    const children = await runner.manager.find(AdjustFuncCaseModel, {
                        where: { parentId: source.id },
                        order: { sort: 'ASC', id: 'ASC' },
                    })
                    for (const child of children) await copyNode(child.id, target.id)
                }
                return target.id
            }
            return copyNode(sourceId, parentId, name)
        })
        return success({ id: copiedId })
    }

    @Post('/del')
    async del(@Body() body: { ids?: number[] }) {
        const initialIds = Array.from(new Set((body.ids ?? []).map(asInteger).filter((id) => id > 0)))
        if (initialIds.length === 0) throw new ResError('请选择要删除的节点')
        const deleteIds = await DB.startTransaction(async (runner) => {
            const result = new Set<number>()
            let pending = initialIds
            while (pending.length > 0) {
                for (const id of pending) result.add(id)
                const children = await runner.manager.find(AdjustFuncCaseModel, { where: { parentId: In(pending) } })
                pending = children.map((row) => row.id).filter((id) => !result.has(id))
            }
            await runner.manager.delete(AdjustFuncCaseModel, { id: In([...result]) })
            return [...result]
        })
        return success({ ids: deleteIds })
    }

    @Post('/reorder')
    async reorder(
        @Body() body: { items?: Array<{ id?: number; sort?: number; parent_id?: number }>; newParentId?: number },
    ) {
        const items = body.items ?? []
        if (items.length === 0 || items.length > 500) throw new ResError('排序节点数量无效')
        const parentId = asInteger(body.newParentId ?? items[0]?.parent_id)
        await this.requireGroup(parentId, asInteger((body as any).movedId))
        const ids = items.map((item) => asInteger(item.id))
        if (ids.some((id) => id <= 0) || new Set(ids).size !== ids.length) throw new ResError('排序节点无效')
        const existing = await AdjustFuncCaseModel.countBy({ id: In(ids) })
        if (existing !== ids.length) throw new ResError('部分排序节点不存在')

        await DB.startTransaction(async (runner) => {
            for (let index = 0; index < items.length; index++) {
                await runner.manager.update(
                    AdjustFuncCaseModel,
                    { id: ids[index] },
                    {
                        parentId,
                        sort: Math.max(0, asInteger(items[index].sort, index + 1)),
                    },
                )
            }
        })
        return success()
    }
}
