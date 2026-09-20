import { timestamp } from '@arthropoda/game-engine'
import { In } from '@arthropoda/typeorm'
import { Body, Get, JsonController, Post, Req, UseBefore } from 'routing-controllers'
import { Service } from 'typedi'
import { AdjustRobotCaseModel } from '../../../../../generated/persistence/AdjustRobotCaseModel'
import { ResError } from '../../../../http/constants/httpError'
import { AdjustAccessMiddleware } from '../AdjustAccessMiddleware'
import { AdjustRobotRequest, auditRobot } from './robotAudit'
import { buildRobotCaseTree, filterRobotCaseTree } from './robotCaseTree'
import {
    ROBOT_LIMITS,
    asRobotInteger,
    normalizeRobotIds,
    parseRobotJson,
    robotSuccess,
    robotSuccessId,
    stringifyRobotValue,
    validateRobotName,
} from './robotPayload'

interface RobotCaseEditBody {
    id?: unknown
    name?: unknown
    parent_id?: unknown
    type?: unknown
    router?: unknown
    content?: unknown
    param?: unknown
    ext?: unknown
}

function normalizeTypes(value: unknown) {
    const input = Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value]
    const types = new Set(input.map((item) => asRobotInteger(item, -1)).filter((item) => [1, 2, 3].includes(item)))
    return types
}

@JsonController('/adjust')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class RobotCaseController {
    private async requireParentGroup(parentId: number, currentId = 0) {
        if (parentId === 0) return
        if (parentId === currentId) throw new ResError('节点不能移动到自身下面')
        const foundParent = await AdjustRobotCaseModel.findOneBy({ id: parentId })
        if (!foundParent || foundParent.type !== 0) throw new ResError('父级分组不存在')
        let parent: AdjustRobotCaseModel = foundParent
        const visited = new Set<number>()
        while (Number(parent.parentId) > 0) {
            if (Number(parent.parentId) === currentId) throw new ResError('不能将分组移动到自己的子分组下')
            if (visited.has(Number(parent.id))) throw new ResError('用例分组层级存在循环')
            visited.add(Number(parent.id))
            const next: AdjustRobotCaseModel | null = await AdjustRobotCaseModel.findOneBy({
                id: Number(parent.parentId),
            })
            if (!next) break
            parent = next
        }
    }

    @Post('/case/tree')
    async tree(@Req() req: AdjustRobotRequest, @Body() body: { type?: unknown } = {}) {
        const startedAt = Date.now()
        try {
            const rows = await AdjustRobotCaseModel.find({ order: { parentId: 'ASC', id: 'ASC' } })
            const nodes = rows.map((row) => ({
                id: Number(row.id),
                parent_id: Number(row.parentId),
                type: row.type,
                name: row.name,
                router: row.router,
                content: row.content,
                param: parseRobotJson<unknown[]>(row.param, []),
                ext: row.ext,
            }))
            const data = filterRobotCaseTree(buildRobotCaseTree(nodes), normalizeTypes(body?.type))
            auditRobot(req, { action: 'case_tree', resultCount: rows.length, durationMs: Date.now() - startedAt })
            return robotSuccess(data)
        } catch (error) {
            auditRobot(req, { action: 'case_tree', durationMs: Date.now() - startedAt }, error)
            throw error
        }
    }

    @Post('/case/edit')
    async edit(@Body() body: RobotCaseEditBody, @Req() req: AdjustRobotRequest) {
        const startedAt = Date.now()
        const id = asRobotInteger(body.id)
        try {
            const name = validateRobotName(body.name, '用例名称')
            const parentId = asRobotInteger(body.parent_id)
            await this.requireParentGroup(parentId, id)
            const duplicate = await AdjustRobotCaseModel.findOneBy({ name, parentId })
            if (duplicate && Number(duplicate.id) !== id) throw new ResError('用例名称已存在')

            const current = id > 0 ? await AdjustRobotCaseModel.findOneBy({ id }) : null
            if (id > 0 && !current) throw new ResError('用例不存在')
            if (!current && (await AdjustRobotCaseModel.count()) >= ROBOT_LIMITS.maxCases) {
                throw new ResError(`机器人用例数量不能超过 ${ROBOT_LIMITS.maxCases}`)
            }

            const type = body.type === undefined ? (current?.type ?? 0) : asRobotInteger(body.type, -1)
            if (![0, 1, 2, 3].includes(type)) throw new ResError('用例类型无效')
            const router = body.router === undefined ? (current?.router ?? '') : String(body.router ?? '').trim()
            if (router.length > 160) throw new ResError('用例路由不能超过 160 个字符')
            const content =
                body.content === undefined
                    ? (current?.content ?? '')
                    : stringifyRobotValue(body.content, ROBOT_LIMITS.maxCaseContentBytes, '用例内容')
            const param =
                body.param === undefined
                    ? (current?.param ?? '[]')
                    : stringifyRobotValue(body.param ?? [], ROBOT_LIMITS.maxCaseParamBytes, '用例变量')
            const ext =
                body.ext === undefined
                    ? (current?.ext ?? '')
                    : stringifyRobotValue(body.ext, ROBOT_LIMITS.maxCaseExtBytes, '编译缓存')
            if (!Array.isArray(parseRobotJson(param, []))) throw new ResError('用例变量必须是数组')

            const now = timestamp()
            const row = current ?? AdjustRobotCaseModel.create()
            row.name = name
            row.parentId = parentId
            row.type = type
            row.router = type === 0 ? '' : router
            row.content = type === 0 ? '' : content
            row.param = type === 0 ? '[]' : param
            row.ext = type === 0 ? '' : ext
            row.createTime = current?.createTime ?? now
            row.updateTime = now
            await row.save()
            auditRobot(req, {
                action: id > 0 ? 'case_update' : 'case_create',
                caseId: Number(row.id),
                caseType: type,
                parentId,
                contentBytes: Buffer.byteLength(row.content),
                durationMs: Date.now() - startedAt,
            })
            return robotSuccessId(Number(row.id))
        } catch (error) {
            auditRobot(
                req,
                { action: id > 0 ? 'case_update' : 'case_create', caseId: id, durationMs: Date.now() - startedAt },
                error,
            )
            throw error
        }
    }

    @Post('/case/del')
    async del(@Body() body: { ids?: unknown }, @Req() req: AdjustRobotRequest) {
        const startedAt = Date.now()
        let ids: number[] = []
        try {
            ids = normalizeRobotIds(body?.ids)
            const childCount = await AdjustRobotCaseModel.countBy({ parentId: In(ids) })
            if (childCount > 0) throw new ResError('请先删除分组中的子项')
            const result = await AdjustRobotCaseModel.delete({ id: In(ids) })
            const deletedCount = result.affected ?? 0
            auditRobot(req, {
                action: 'case_delete',
                requestCount: ids.length,
                deletedCount,
                durationMs: Date.now() - startedAt,
            })
            return robotSuccess({ deletedCount })
        } catch (error) {
            auditRobot(
                req,
                { action: 'case_delete', requestCount: ids.length, durationMs: Date.now() - startedAt },
                error,
            )
            throw error
        }
    }

    @Get('/wstool/transmitWSInfo')
    transmitWsInfo() {
        const wsurl = String((CP.platform as any).adjustRobot?.transmitWsUrl ?? '')
        if (!wsurl) throw new ResError('当前线路未配置远程客户端中转 WebSocket')
        return { status: 0, msg: '操作成功', wsurl }
    }
}
