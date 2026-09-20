import { timestamp } from '@arthropoda/game-engine'
import { Body, JsonController, Post, Req, UseBefore } from 'routing-controllers'
import { Service } from 'typedi'
import { AdjustRobotUserGroupModel } from '../../../../../generated/persistence/AdjustRobotUserGroupModel'
import { ResError } from '../../../../http/constants/httpError'
import { AdjustAccessMiddleware } from '../AdjustAccessMiddleware'
import { AdjustRobotRequest, auditRobot } from './robotAudit'
import {
    ROBOT_LIMITS,
    asRobotInteger,
    normalizeRobotUsers,
    robotSuccess,
    robotSuccessId,
    validateRobotName,
} from './robotPayload'

function toUserGroupResponse(row: AdjustRobotUserGroupModel) {
    return {
        id: Number(row.id),
        name: row.name,
        users: row.users,
        createTime: row.createTime,
        updateTime: row.updateTime,
        created_at: new Date(row.createTime * 1000).toISOString(),
        updated_at: new Date(row.updateTime * 1000).toISOString(),
    }
}

@JsonController('/adjust/userGroup')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class RobotUserGroupController {
    @Post('/getList')
    async getList(
        @Req() req: AdjustRobotRequest,
        @Body() body: { page?: unknown; pageSize?: unknown; name?: unknown } = {},
    ) {
        const startedAt = Date.now()
        try {
            const page = Math.max(1, asRobotInteger(body.page, 1))
            const pageSize = Math.min(1000, Math.max(1, asRobotInteger(body.pageSize, 1000)))
            const keyword = String(body.name ?? '')
                .trim()
                .toLowerCase()
            const rows = await AdjustRobotUserGroupModel.find({ order: { updateTime: 'DESC', id: 'DESC' } })
            const filtered = rows.filter((row) => !keyword || row.name.toLowerCase().includes(keyword))
            const offset = (page - 1) * pageSize
            const data = filtered.slice(offset, offset + pageSize).map(toUserGroupResponse)
            auditRobot(req, {
                action: 'user_group_list',
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
            auditRobot(req, { action: 'user_group_list', durationMs: Date.now() - startedAt }, error)
            throw error
        }
    }

    @Post('/edit')
    async edit(@Body() body: Record<string, unknown>, @Req() req: AdjustRobotRequest) {
        const startedAt = Date.now()
        const id = asRobotInteger(body.id)
        try {
            const name = validateRobotName(body.name, '用户组名称')
            const users = normalizeRobotUsers(body.users)
            const duplicate = await AdjustRobotUserGroupModel.findOneBy({ name })
            if (duplicate && Number(duplicate.id) !== id) throw new ResError('用户组名称已存在')
            const current = id > 0 ? await AdjustRobotUserGroupModel.findOneBy({ id }) : null
            if (id > 0 && !current) throw new ResError('用户组不存在')
            if (!current && (await AdjustRobotUserGroupModel.count()) >= ROBOT_LIMITS.maxUserGroups) {
                throw new ResError(`用户组数量不能超过 ${ROBOT_LIMITS.maxUserGroups}`)
            }
            const serialized = JSON.stringify(users)
            if (Buffer.byteLength(serialized) > ROBOT_LIMITS.maxBatchPlanBytes)
                throw new ResError('用户组数据不能超过 5MB')
            const now = timestamp()
            const row = current ?? AdjustRobotUserGroupModel.create()
            row.name = name
            row.users = serialized
            row.createTime = current?.createTime ?? now
            row.updateTime = now
            await row.save()
            auditRobot(req, {
                action: id > 0 ? 'user_group_update' : 'user_group_create',
                userGroupId: Number(row.id),
                userCount: users.length,
                durationMs: Date.now() - startedAt,
            })
            return robotSuccessId(Number(row.id))
        } catch (error) {
            auditRobot(
                req,
                {
                    action: id > 0 ? 'user_group_update' : 'user_group_create',
                    userGroupId: id,
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
        const id = asRobotInteger(body.id)
        try {
            if (id <= 0) throw new ResError('用户组 ID 无效')
            const result = await AdjustRobotUserGroupModel.delete({ id })
            const deletedCount = result.affected ?? 0
            if (deletedCount === 0) throw new ResError('用户组不存在')
            auditRobot(req, {
                action: 'user_group_delete',
                userGroupId: id,
                deletedCount,
                durationMs: Date.now() - startedAt,
            })
            return robotSuccess({ deletedCount })
        } catch (error) {
            auditRobot(req, { action: 'user_group_delete', userGroupId: id, durationMs: Date.now() - startedAt }, error)
            throw error
        }
    }
}
