const assert = require('assert')
const fs = require('fs')
const path = require('path')

const records = require('../../../generated/records/record.json').beans
const refClasses = ['GuildMemberRef', 'GuildRef', 'RankGuildRef', 'RankUserRef', 'UserBaseRef', 'UserEquipRef']

describe('refView compatibility', () => {
    it('keeps RefHash record identities stable across feature-owned source paths', () => {
        for (const className of refClasses) {
            const record = records[`${className}.ts`]
            assert.deepStrictEqual(
                {
                    version: record.version,
                    relativePath: record.relativePath,
                    className: record.className ?? record.name,
                    diffType: record.diffType,
                    fields: Object.keys(record.properties),
                },
                {
                    version: 1,
                    relativePath: `/refView/${className}`,
                    className,
                    diffType: 0,
                    fields: [],
                },
            )
        }
    })

    it('keeps generated refView schema names stable', () => {
        // 旧 `serviceProto.types` 内联 schema 是 PB 专属产物，已随 P6 删除；
        // refView 的 schema 身份现在只由 `generated/records/proto.json5` 承载。
        const protoJson = fs.readFileSync(path.resolve(__dirname, '../../../generated/records/proto.json5'), 'utf8')
        for (const className of refClasses) {
            assert.ok(protoJson.includes(`longName: './refView/${className}/${className}'`))
        }
    })
})
