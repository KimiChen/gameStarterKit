import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

/**
 * P6 记录迁移：从 `generated/records/record.json` 中移除已失去消费者的旧数字协议号。
 *
 * 背景：PB 通道删除后不再有「数字协议号 → 编解码器」的映射，`RecMsg.id` 也随之从记录模型
 * 中删除。但记录文件是**兼容真源**，禁止删除整份记录或从空记录重新生成 —— 所以必须就地、
 * 可检查地迁移：只摘掉协议消息上的 `id`，`beans` 子树逐字节保持原样。
 *
 * 用法：
 *   pnpm exec ts-node --project scripts/tsconfig.json scripts/generator/migrate/RemoveLegacyProtocolIds.ts [--dry-run]
 *
 * 幂等：已迁移的记录再跑一次会报告 `removed=0`。
 * ⛔ 不要把这个脚本改成「重建记录」—— 那会重排 Bean 字段 ID 与协议号。
 */

const projectRoot = path.resolve(__dirname, '../../..')
const recordPath = path.join(projectRoot, 'generated/records/record.json')
const dryRun = process.argv.includes('--dry-run')

interface MigrationReport {
    protocolFiles: number
    messages: number
    removed: number
    alreadyAbsent: number
    sample: string[]
}

function digest(value: unknown): string {
    return crypto.createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
    if (!value || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
    const entries = Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    return `{${entries.join(',')}}`
}

function migrateMessages(messages: Record<string, unknown>[], label: string, report: MigrationReport): void {
    for (const message of messages) {
        report.messages++
        if ('id' in message) {
            report.removed++
            if (report.sample.length < 5)
                report.sample.push(`${label}#${String(message.name)} id=${String(message.id)}`)
            delete message.id
        } else {
            report.alreadyAbsent++
        }
    }
}

function migrate(): MigrationReport {
    if (!fs.existsSync(recordPath)) {
        throw new Error(`兼容记录不存在: ${recordPath}；禁止从空记录重新生成，请先恢复记录文件`)
    }
    const raw = fs.readFileSync(recordPath, 'utf8')
    if (raw === '') throw new Error(`兼容记录为空: ${recordPath}；禁止从空记录重新生成`)
    const record = JSON.parse(raw) as Record<string, unknown>

    const beansBefore = digest(record.beans)
    const modVersionBefore = record.modVersion

    const report: MigrationReport = { protocolFiles: 0, messages: 0, removed: 0, alreadyAbsent: 0, sample: [] }

    const protocols = record.protocols as Record<string, { version: number; protocols: Record<string, unknown> }>
    if (!protocols) throw new Error('兼容记录缺少 protocols 段，疑似记录被破坏')

    for (const [direction, group] of Object.entries(protocols)) {
        for (const [fileName, fileValue] of Object.entries(group.protocols ?? {})) {
            const file = fileValue as {
                apis?: Record<string, { req?: Record<string, unknown>; res?: Record<string, unknown> }>
                pushs?: Record<string, Record<string, unknown>>
                msgs?: Record<string, Record<string, unknown>>
            }
            report.protocolFiles++
            const label = `${direction}/${fileName}`
            for (const [apiName, api] of Object.entries(file.apis ?? {})) {
                const reqs = [api.req, api.res].filter((item): item is Record<string, unknown> => !!item)
                migrateMessages(reqs, `${label}/${apiName}`, report)
            }
            migrateMessages(Object.values(file.pushs ?? {}), `${label}/push`, report)
            migrateMessages(Object.values(file.msgs ?? {}), `${label}/msg`, report)
        }
    }

    // 迁移只允许动协议消息上的 id：Bean 数据、字段身份与 modVersion 必须逐字节不变。
    if (digest(record.beans) !== beansBefore) throw new Error('迁移改动了 beans 段，已中止（不写盘）')
    if (record.modVersion !== modVersionBefore) throw new Error('迁移改动了 modVersion，已中止（不写盘）')

    if (!dryRun) {
        fs.writeFileSync(recordPath, JSON.stringify(record, null, 2))
    }
    return report
}

const result = migrate()
console.log(
    [
        `${dryRun ? '[dry-run] ' : ''}旧数字协议号迁移完成`,
        `协议文件=${result.protocolFiles}`,
        `消息=${result.messages}`,
        `移除 id=${result.removed}`,
        `原本无 id=${result.alreadyAbsent}`,
    ].join('  '),
)
for (const line of result.sample) console.log(`  样例: ${line}`)
console.log(`记录文件: ${recordPath}`)
