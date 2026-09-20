import assert from 'assert'
import { UtilJson } from '../../src/utils/UtilJson'
import { testInitEnv } from '../testInit'

describe('test UtilJson', function () {
    before(async () => {
        await testInitEnv()
    })

    it('compare struct', () => {
        assert(UtilJson.structCompare({ 1: { 'a': 123 } }, { 3: { 'a': 555 } }))
        assert(UtilJson.structCompare({ 1: { 'a': [12, 3123] } }, { 3: { 'a': [0] } }))
        assert(!UtilJson.structCompare({ 1: { 'a': [12, 3123] } }, { 3: { 'a': ['sdf'] } }))
        assert(UtilJson.structCompare({ 1: { 'a': { 'a': { 'a': [] } } } }, { 3: { 'a': { 'a': { 'a': [213] } } } }))
        assert(UtilJson.structCompare([{ a: 1, b: 's', c: false }], [{ a: 0, b: '', c: true }]))
        assert(!UtilJson.structCompare([{ a: 1, b: 's', c: false }], [{ a: 0, b: '', c: [2] }]))
        assert(!UtilJson.structCompare([{ a: 1, b: 's', c: false }], [{ a: 0, b: '' }]))
    })

})
