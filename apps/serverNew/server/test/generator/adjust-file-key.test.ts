import assert from 'assert'
import path from 'path'
import { adjustFileKey } from '../../scripts/generator/adjust/adjustFileKey'

describe('Adjust file fingerprint key', () => {
    it('keeps same-basename files distinct by project-relative path', () => {
        const projectRoot = path.resolve('/project')
        assert.notStrictEqual(
            adjustFileKey(projectRoot, path.join(projectRoot, 'src/modules/mail/adjust/AdjustShared.ts')),
            adjustFileKey(projectRoot, path.join(projectRoot, 'src/modules/guild/adjust/AdjustShared.ts')),
        )
    })

    it('uses normalized project-relative paths', () => {
        const projectRoot = path.resolve('/project')
        assert.strictEqual(
            adjustFileKey(projectRoot, path.join(projectRoot, 'src/modules/mail/adjust/AdjustMail.ts')),
            'src/modules/mail/adjust/AdjustMail.ts',
        )
    })
})
