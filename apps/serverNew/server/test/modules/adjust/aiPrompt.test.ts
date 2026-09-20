import assert from 'node:assert/strict'
import { AdjustPromptModel } from '../../../generated/persistence/AdjustPromptModel'
import { deletePrompt, writePrompt } from '../../../src/modules/adjust/http/ai/aiPrompt'

global.CP = {
    platform: {
        adjustAi: {
            enabled: true,
            promptWrite: true,
            projectMemory: true,
            experienceCases: true,
            customSkills: true,
        },
    } as any,
    service: {} as any,
}
global.Log = {
    http: {
        info() {},
        error() {},
    },
} as any

const req = {
    headers: {},
    connection: { remoteAddress: '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    get(name: string) {
        return name.toLowerCase() === 'x-adjust-tool-source' ? 'ai-assistant' : undefined
    },
    adjustSsoUser: { uid: 'tester', name: 'tester', account: 'tester', isAdmin: true },
} as any

const originalFindOneBy = AdjustPromptModel.findOneBy
const originalCountBy = AdjustPromptModel.countBy
const originalCreate = AdjustPromptModel.create

let removed = false
const row = {
    id: 7,
    type: '1',
    name: 'rule.md',
    value: 'old',
    version: 1,
    description: '',
    createTime: 1,
    updateTime: 1,
    createdBy: 'tester',
    updatedBy: 'tester',
    async save() {},
    async remove() {
        removed = true
    },
}

async function main() {
    try {
        ;(AdjustPromptModel as any).findOneBy = async () => row
        ;(AdjustPromptModel as any).countBy = async () => 1
        ;(AdjustPromptModel as any).create = () => {
            throw new Error('should not create')
        }

        const overwrite = await writePrompt(
            {
                type: '1',
                id: null,
                name: 'rule.md',
                value: 'new',
                version: 0,
            },
            req,
        )
        assert.equal(overwrite.status, 0)
        assert.equal(row.value, 'new')
        assert.equal(row.version, 2)

        ;(CP.platform.adjustAi as any).projectMemory = false
        const deniedDelete = await deletePrompt({ id: row.id, version: row.version }, req)
        assert.equal(deniedDelete.status, 1)
        assert.equal(removed, false)
    } finally {
        ;(AdjustPromptModel as any).findOneBy = originalFindOneBy
        ;(AdjustPromptModel as any).countBy = originalCountBy
        ;(AdjustPromptModel as any).create = originalCreate
    }

    console.log('aiPrompt tests passed')
}

void main()
