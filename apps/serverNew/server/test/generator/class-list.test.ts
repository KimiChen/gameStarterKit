import assert from 'assert'
import { registerClassSource, stableClassNames } from '../../scripts/generator/classList/ClassListOrder'

describe('ClassListGen', () => {
    it('keeps existing class order when source files move', () => {
        const previous = `export const classList = {
    ActionServer: ActionServer,
    ActionActivity: ActionActivity,
    ActionRemoved: ActionRemoved,
}`
        const classes = {
            ActionActivity: '/modules/activity/ActionActivity.ts',
            ActionNewB: '/modules/new/ActionNewB.ts',
            ActionServer: '/modules/serverSettings/ActionServer.ts',
            ActionNewA: '/modules/new/ActionNewA.ts',
        }

        assert.deepStrictEqual(stableClassNames(classes, previous), [
            'ActionServer',
            'ActionActivity',
            'ActionNewA',
            'ActionNewB',
        ])
    })

    it('uses deterministic order when no previous registry exists', () => {
        assert.deepStrictEqual(stableClassNames({ ActionB: '/b.ts', ActionA: '/a.ts' }, ''), ['ActionA', 'ActionB'])
    })

    it('rejects duplicate class names from different source files', () => {
        const classes: Record<string, string> = {}
        registerClassSource(classes, 'ActionDuplicate', '/first/ActionDuplicate.ts')
        assert.throws(
            () => registerClassSource(classes, 'ActionDuplicate', '/second/ActionDuplicate.ts'),
            /ClassList 类名重复 ActionDuplicate/,
        )
    })
})
