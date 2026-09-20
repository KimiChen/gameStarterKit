const crypto = require('crypto')
const fs = require('fs')
const json5 = require('json5')
const path = require('path')
const { captureSourceContracts, normalizeTypeScriptWithoutImports } = require('./source-contract')

const projectRoot = path.resolve(__dirname, '../..')
const defaultBaselinePath = path.join(projectRoot, 'test/structure-baseline/compatibility-baseline.json')

// 真源清单：只保留仍有消费者的产物。PB 专属产物（`generated/protocol/client/src/config/pb.js`
// 与 `generated/protocol/server/S2S/pb.js`）已随 P6 删除，不再纳入兼容比对。
const authoritativePaths = {
    unifiedRecord: 'generated/records/record.json',
    beanDefinition: 'generated/records/bean.json5',
    protocolDefinition: 'generated/records/proto.json5',
    c2sServiceProtocol: 'generated/protocol/server/C2S/serviceProto.ts',
    s2sServiceProtocol: 'generated/protocol/server/S2S/serviceProto.ts',
}

const nonAuthoritativePaths = {
    obsoleteBeanRecord: 'src/bean/record.json',
    obsoleteProtocolRecord: 'src/protocols/record.json',
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function fileEvidence(role, relativePath, semanticValue) {
    return {
        path: relativePath,
        semanticSha256: sha256(stableJson(semanticValue)),
    }
}

function semanticFileContent(role, content) {
    if (role === 'unifiedRecord') return recordCompatibilitySemantic(JSON.parse(content))
    if (role === 'beanDefinition' || role === 'protocolDefinition') return stripPhysicalMetadata(json5.parse(content))
    if (role === 'c2sServiceProtocol' || role === 's2sServiceProtocol') {
        return normalizeTypeScriptWithoutImports(content, `${role}.ts`)
    }
    throw new Error(`unsupported semantic file role: ${role}`)
}

function stripPhysicalMetadata(value) {
    if (Array.isArray(value)) return value.map(stripPhysicalMetadata)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
        Object.entries(value)
            .filter(
                ([key]) =>
                    !['filePath', 'importPath', 'longName', 'md5', 'mtime', 'relativePath', 'sourcePath'].includes(key),
            )
            .map(([key, item]) => [key, stripPhysicalMetadata(item)]),
    )
}

function recordCompatibilitySemantic(record) {
    return {
        protocol: collectProtocolContract(record),
        bean: collectBeanContract(record),
    }
}

function stableJson(value) {
    return JSON.stringify(sortValue(value))
}

function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, sortValue(value[key])]),
    )
}

function sortedEntries(value) {
    return Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right))
}

function normalizeField(field) {
    return {
        name: field.name,
        id: field.id,
        deleted: field.deleted === true,
        type: field.type,
        collectionTypes: field.collectionTypes ?? [],
        saveType: field.saveType,
        modType: field.modType,
    }
}

function messageContract(direction, kind, message) {
    return {
        key: `${direction}:${message.package}${message.name}`,
        kind,
        version: message.version,
        fields: sortedEntries(message.properties).map(([, field]) => normalizeField(field)),
    }
}

function collectProtocolContract(record) {
    const routes = []
    const messages = []
    const directionVersions = {}

    for (const [direction, group] of sortedEntries(record.protocols)) {
        directionVersions[direction] = group.version
        const routeNames = new Set()
        const messageKeys = new Set()

        for (const [, protocolFile] of sortedEntries(group.protocols)) {
            if (protocolFile.deleted === true) continue
            const packageName = protocolFile.relativePath.replace(/^\//, '')

            for (const [apiName, api] of sortedEntries(protocolFile.apis)) {
                if (api.req?.deleted === true) continue
                const name = `${packageName}/${apiName}`
                const route = {
                    direction,
                    kind: 'api',
                    name,
                    serviceType: api.serviceType,
                }
                assertUniqueRoute(routeNames, route)
                routes.push(route)
                addMessage(messages, messageKeys, messageContract(direction, 'request', api.req))
                if (api.res) addMessage(messages, messageKeys, messageContract(direction, 'response', api.res))
            }

            for (const [pushName, push] of sortedEntries(protocolFile.pushs)) {
                if (push.deleted === true) continue
                const route = {
                    direction,
                    kind: 'push',
                    name: `${packageName}/Push${pushName}`,
                }
                assertUniqueRoute(routeNames, route)
                routes.push(route)
                addMessage(messages, messageKeys, messageContract(direction, 'push', push))
            }

            for (const [, message] of sortedEntries(protocolFile.msgs)) {
                if (message.deleted === true) continue
                addMessage(messages, messageKeys, messageContract(direction, 'message', message))
            }
        }
    }

    routes.sort((left, right) => left.direction.localeCompare(right.direction) || left.name.localeCompare(right.name))
    messages.sort((left, right) => left.key.localeCompare(right.key) || left.kind.localeCompare(right.kind))
    return { directionVersions, routes, messages }
}

// 旧数字协议号已随 P6 删除，唯一性只能按路由名判定；同方向内不得出现同名 api/push。
function assertUniqueRoute(routeNames, route) {
    const nameKey = `${route.direction}:${route.name}`
    if (routeNames.has(nameKey)) throw new Error(`duplicate protocol name ${nameKey}`)
    routeNames.add(nameKey)
}

function addMessage(messages, messageKeys, message) {
    const uniqueKey = `${message.key}:${message.kind}`
    if (messageKeys.has(uniqueKey)) throw new Error(`duplicate protocol message ${uniqueKey}`)
    messageKeys.add(uniqueKey)
    messages.push(message)
}

function collectBeanContract(record) {
    const beans = []
    const mods = []
    const classNames = new Set()
    const modNames = new Set()

    for (const [, bean] of sortedEntries(record.beans)) {
        if (bean.deleted === true || bean.diffType === 0) continue
        const className = bean.className ?? bean.name
        if (classNames.has(className)) throw new Error(`duplicate active Bean class ${className}`)
        classNames.add(className)

        beans.push({
            className,
            nextFieldId: bean.version,
            diffType: bean.diffType,
            idFieldType: bean.idFiledType,
            saveType: bean.saveType,
            modType: bean.modType,
            modId: bean.modId,
            fields: sortedEntries(bean.properties).map(([, field]) => normalizeField(field)),
        })

        for (const [, mod] of sortedEntries(bean.mods)) {
            if (mod.deleted === true) continue
            if (modNames.has(mod.name)) throw new Error(`duplicate active Mod name ${mod.name}`)
            modNames.add(mod.name)
            mods.push({
                name: mod.name,
                id: mod.id,
                type: mod.type,
                subModType: mod.subModType,
                isMap: mod.isMap === true,
                mapKeyType: mod.mapKeyType,
            })
        }
    }

    beans.sort((left, right) => left.className.localeCompare(right.className))
    mods.sort((left, right) => left.id - right.id || left.name.localeCompare(right.name))
    return { nextModId: record.modVersion, beans, mods }
}

function captureCompatibilityBaseline() {
    const record = JSON.parse(fs.readFileSync(path.join(projectRoot, authoritativePaths.unifiedRecord), 'utf8'))
    const protocol = collectProtocolContract(record)
    const bean = collectBeanContract(record)
    const sourceContracts = captureSourceContracts(record)
    const artifactSemantics = {
        unifiedRecord: { protocol, bean },
        beanDefinition: bean,
        protocolDefinition: { protocol, bean },
        c2sServiceProtocol: protocolForDirection(protocol, 'C2S'),
        s2sServiceProtocol: protocolForDirection(protocol, 'S2S'),
    }

    const semanticArtifacts = Object.fromEntries(
        Object.entries(authoritativePaths).map(([role, relativePath]) => {
            const content = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
            const semanticValue = artifactSemantics[role] ?? semanticFileContent(role, content)
            return [role, fileEvidence(role, relativePath, semanticValue)]
        }),
    )

    const physicalArtifacts = Object.fromEntries(
        Object.entries(authoritativePaths).map(([role, relativePath]) => {
            const content = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
            return [role, { path: relativePath, sha256: sha256(content) }]
        }),
    )

    const compatibility = {
        protocol,
        bean,
        ...sourceContracts,
    }

    return {
        schemaVersion: 3,
        semanticArtifacts,
        physicalArtifacts,
        excludedRecordCandidates: Object.fromEntries(
            Object.entries(nonAuthoritativePaths).map(([role, relativePath]) => [
                role,
                fileEvidence(role, relativePath, relativePath),
            ]),
        ),
        compatibility,
        counts: {
            routes: protocol.routes.length,
            protocolMessages: protocol.messages.length,
            protocolFields: protocol.messages.reduce((count, message) => count + message.fields.length, 0),
            beans: bean.beans.length,
            beanFields: bean.beans.reduce(
                (count, currentBean) => count + currentBean.fields.filter((field) => !field.deleted).length,
                0,
            ),
            mods: bean.mods.length,
            errorCodes: sourceContracts.errorCodes.length,
            redisKeys: sourceContracts.redisKeys.length,
            databaseTables: sourceContracts.database.length,
            databaseFields: sourceContracts.database.reduce((count, table) => count + table.columns.length, 0),
            classListEntries: Object.values(sourceContracts.classLists).reduce(
                (count, classNames) => count + classNames.length,
                0,
            ),
        },
    }
}

function preserveFrozenCoreContract(actual, previous) {
    const protocol = JSON.parse(JSON.stringify(previous.compatibility.protocol))
    const bean = JSON.parse(JSON.stringify(previous.compatibility.bean))
    const adItem = bean.beans.find((item) => item.className === 'AdItem')
    const totalNum = adItem?.fields.find((field) => field.name === 'totalNum')
    if (!totalNum || totalNum.id !== 4) throw new Error('frozen baseline is missing AdItem.totalNum#4')
    totalNum.deleted = false

    actual.compatibility.protocol = protocol
    actual.compatibility.bean = bean
    for (const mapping of actual.compatibility.sourceMappings.protocols) {
        mapping.routes = protocol.routes
            .filter((route) => route.direction === mapping.direction && route.name.startsWith(`${mapping.package}/`))
            .map((route) => route.name)
            .sort()
    }
    actual.compatibility.sourceMappings.actions = protocol.routes
        .filter((route) => route.kind === 'api')
        .map((route) => ({
            route: `${route.direction}:${route.name}`,
            sourceName: `Action${route.name.substring(route.name.lastIndexOf('/') + 1)}`,
        }))
        .sort((left, right) => left.route.localeCompare(right.route))

    actual.counts.routes = protocol.routes.length
    actual.counts.protocolMessages = protocol.messages.length
    actual.counts.protocolFields = protocol.messages.reduce((count, message) => count + message.fields.length, 0)
    actual.counts.beans = bean.beans.length
    actual.counts.beanFields = bean.beans.reduce(
        (count, currentBean) => count + currentBean.fields.filter((field) => !field.deleted).length,
        0,
    )
    actual.counts.mods = bean.mods.length

    const semantics = {
        unifiedRecord: { protocol, bean },
        beanDefinition: bean,
        protocolDefinition: { protocol, bean },
        c2sServiceProtocol: protocolForDirection(protocol, 'C2S'),
        s2sServiceProtocol: protocolForDirection(protocol, 'S2S'),
    }
    actual.semanticArtifacts = Object.fromEntries(
        Object.entries(authoritativePaths).map(([role, relativePath]) => [
            role,
            fileEvidence(role, relativePath, semantics[role]),
        ]),
    )
    return actual
}

function protocolForDirection(protocol, direction) {
    return {
        version: protocol.directionVersions[direction],
        routes: protocol.routes.filter((route) => route.direction === direction),
        messages: protocol.messages.filter((message) => message.key.startsWith(`${direction}:`)),
    }
}

function compareCompatibility(expected, actual, options = {}) {
    const differences = []
    // 基线以 JSON 落盘，`undefined` 值在 JSON 里没有表达方式；而捕获结果是内存对象，
    // 会保留值为 `undefined` 的键。比较前统一剔除，避免出现「属性意外多出」的假差异。
    compareValue('compatibility', expected.compatibility, dropUndefined(actual.compatibility), differences)
    compareValue('counts', expected.counts, dropUndefined(actual.counts), differences)
    if (options.hashes) {
        compareValue(
            'semanticArtifacts',
            expected.semanticArtifacts,
            dropUndefined(actual.semanticArtifacts),
            differences,
        )
    }
    return differences
}

function dropUndefined(value) {
    if (Array.isArray(value)) return value.map(dropUndefined)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .map(([key, item]) => [key, dropUndefined(item)]),
    )
}

function compareValue(label, expected, actual, differences) {
    if (JSON.stringify(expected) === JSON.stringify(actual)) return
    if (Array.isArray(expected) && Array.isArray(actual)) {
        const expectedItems = new Map(expected.map((item) => [contractKey(item), item]))
        const actualItems = new Map(actual.map((item) => [contractKey(item), item]))
        for (const [key, item] of expectedItems) {
            if (!actualItems.has(key)) differences.push(`${label}: missing ${key}`)
            else compareValue(`${label}[${key}]`, item, actualItems.get(key), differences)
        }
        for (const key of actualItems.keys()) {
            if (!expectedItems.has(key)) differences.push(`${label}: unexpected ${key}`)
        }
        return
    }
    if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
        for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
            if (!(key in actual)) differences.push(`${label}: missing property ${key}`)
            else if (!(key in expected)) differences.push(`${label}: unexpected property ${key}`)
            else compareValue(`${label}.${key}`, expected[key], actual[key], differences)
        }
        return
    }
    differences.push(`${label}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`)
}

function contractKey(item) {
    if (item.className) return item.className
    if (item.direction && item.name) return `${item.direction}:${item.kind}:${item.name}`
    if (item.key) return `${item.key}:${item.kind}`
    if (item.name) return item.name
    return JSON.stringify(item)
}

module.exports = {
    captureCompatibilityBaseline,
    compareCompatibility,
    defaultBaselinePath,
    projectRoot,
    semanticFileContent,
    sha256,
    preserveFrozenCoreContract,
}
