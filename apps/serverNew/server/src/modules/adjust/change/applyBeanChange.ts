import { Bean, DiffArray, DiffMap } from '@arthropoda/game-engine'
import { User } from '../../user/bean/User'

type RoutePart = string | number

const readonlyUserFields = new Set(['id', 'sId', 'openid', 'lineOpenId'])

function collectionKey(value: DiffMap<any, any>, route: RoutePart) {
    if (value.has(route as any)) return route
    const numeric = Number(route)
    return Number.isNaN(numeric) || !value.has(numeric) ? String(route) : numeric
}

function resolveValue(user: User, routeList: RoutePart[]) {
    if (routeList.length === 0 || String(routeList[0]) !== 'User') {
        throw new Error('数据路径必须从 User 开始')
    }
    let current: any = user
    for (const route of routeList.slice(1)) {
        if (current instanceof DiffMap) {
            current = current.get(collectionKey(current, route) as any)
            continue
        }
        if (current instanceof DiffArray) {
            current = current.at(Number(route))
            continue
        }
        if (!(current instanceof Bean)) throw new Error(`数据路径不存在: ${String(route)}`)
        const field = current.getClassInfo().fieldMap[String(route)]
        if (!field) throw new Error(`数据字段不存在: ${String(route)}`)
        current = field.getVal(current)
    }
    return current
}

function convertValue(current: unknown, input: unknown) {
    if (typeof current === 'boolean') {
        if (typeof input === 'string') return input !== 'false' && input !== '0' && input !== ''
        return Boolean(input)
    }
    if (typeof current === 'number') {
        const value = Number(input)
        if (!Number.isFinite(value)) throw new Error(`数值格式错误: ${String(input)}`)
        return value
    }
    return input === null || input === undefined ? '' : String(input)
}

function updateValue(user: User, routeList: RoutePart[], input: unknown) {
    if (routeList.length < 2) throw new Error('不能修改根节点')
    const parent = resolveValue(user, routeList.slice(0, -1))
    const route = routeList[routeList.length - 1]
    if (parent instanceof DiffMap) {
        const key = collectionKey(parent, route)
        parent.set(key as any, convertValue(parent.get(key as any), input) as any)
        return
    }
    if (parent instanceof DiffArray) {
        const index = Number(route)
        parent.set(index, convertValue(parent.at(index), input) as any)
        return
    }
    if (!(parent instanceof Bean)) throw new Error(`数据路径不存在: ${String(route)}`)
    if (parent.getClassInfo().name === 'User' && readonlyUserFields.has(String(route))) {
        throw new Error(`字段不允许修改: ${String(route)}`)
    }
    const field = parent.getClassInfo().fieldMap[String(route)]
    if (!field?.forRedis) throw new Error(`字段不可持久化: ${String(route)}`)
    field.setVal(parent, convertValue(field.getVal(parent), input))
}

function deleteValue(user: User, routeList: RoutePart[]) {
    if (routeList.length < 3) throw new Error('只能删除集合元素')
    const parent = resolveValue(user, routeList.slice(0, -1))
    const route = routeList[routeList.length - 1]
    if (parent instanceof DiffMap) {
        parent.delete(collectionKey(parent, route) as any)
        return
    }
    if (parent instanceof DiffArray) {
        parent.removeAt(Number(route))
        return
    }
    throw new Error('只能删除集合元素')
}

export function applyBeanChange(user: User, routeList: RoutePart[], actionItem: any) {
    switch (actionItem?.route) {
        case 'edit':
            updateValue(user, routeList, actionItem.controlNode?.value)
            return
        case 'del':
            deleteValue(user, [...routeList, actionItem.controlNode?.route])
            return
        default:
            throw new Error(`暂不支持的数据操作: ${String(actionItem?.route ?? '')}`)
    }
}
