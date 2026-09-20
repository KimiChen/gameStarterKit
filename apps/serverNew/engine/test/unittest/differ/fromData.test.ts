import assert from 'assert'
import { Bean, ClassInfo, FieldInfo, RefHash, FromData } from '../../../src'

class ProfileBean extends Bean {
    score: int = 0

    static _class_info = new ClassInfo('ProfileBean', this)
    static readonly f_score = new FieldInfo(this._class_info, 'score', 1, 'int', 0)

    static {
        this._class_info.addField(this.f_score)
    }
}

class SourceBean extends Bean {
    id: int = 0
    profile!: ProfileBean

    static _class_info = new ClassInfo('SourceBean', this)
    static readonly f_id = new FieldInfo(this._class_info, 'id', 1, 'int', 0)
    static readonly f_profile = new FieldInfo(this._class_info, 'profile', 2, ProfileBean._class_info)

    static redisData: Record<string, string | null> = {}

    static {
        this._class_info.addField(this.f_id)
        this._class_info.addField(this.f_profile)
    }

    static getRedisKey(id: number) {
        return `SourceBean_${id}`
    }

    static getRedis() {
        return {
            hmGet: async (_key: string, fields: string[]) => fields.map((field) => this.redisData[field] ?? null),
        }
    }
}

class SourceRef extends RefHash {
    @FromData(SourceBean, 'id')
    id: int = 0

    @FromData(SourceBean, 'profile.score')
    score: int = 0
}

function assertFromDataFieldPathTypes() {
    FromData(SourceBean, 'id')
    FromData(SourceBean, 'profile.score')
    // @ts-expect-error fieldPath must be a SourceBean field path
    FromData(SourceBean, 'missing')
    // @ts-expect-error nested fieldPath must exist on the nested Bean
    FromData(SourceBean, 'profile.missing')
}

describe('FromData field path', () => {
    after(() => {
        delete RefHash._infos.SourceRef
    })

    it('registers direct and nested fields without loading Redis', () => {
        const sourceFields = RefHash._infos.SourceRef.fieldMaps.SourceBean.fieldMaps
        assert.strictEqual(sourceFields.id.fromField, SourceBean.f_id)
        assert.strictEqual(sourceFields.score.fromField.name, 'score')
        assert.strictEqual(sourceFields.score.fromField.parentField, SourceBean.f_profile)
        assert.strictEqual(sourceFields.score.fromClass, SourceBean._class_info)
    })

    it('loads direct and nested paths after decorator-time registration', async () => {
        SourceBean.redisData = {
            id: '7',
            profile: JSON.stringify({ [ProfileBean.f_score.aliasName]: 29 }),
        }

        const ref = await SourceRef.load(7)
        assert(ref)
        assert.strictEqual(ref.id, 7)
        assert.strictEqual(ref.score, 29)
        assert.strictEqual(ref._getDiff().status, 0)
    })

    it('fails during decorator registration when the path is invalid', () => {
        assert.throws(
            () => FromData(SourceBean, 'profile.missing' as never)(SourceRef.prototype, 'missing'),
            /SourceBean\.profile\.missing/,
        )
    })
})
